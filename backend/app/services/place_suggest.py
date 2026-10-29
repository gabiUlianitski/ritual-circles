"""Place autocomplete for a selected city: Photon first, Nominatim only as a fallback.

Results are normalized to a small `PlaceSuggestion` shape; raw provider payloads never leave this module.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.services.maps_config import load_httpx_verify_ssl, load_osm_endpoints
from app.services.osm_venues import (
    _COUNTRY_BBOX,
    _PHOTON_BASE,
    _country_name_for_code,
    _normalize_city_match,
    _nominatim_throttle,
    _user_agent,
)
from app.services.venue_display import place_category_from_osm

logger = logging.getLogger(__name__)

PLACE_SUGGEST_MAX_LIMIT = 6
_PROVIDER_FETCH_LIMIT = 15
_PHOTON_TIMEOUT_S = 3.0
_NOMINATIM_TIMEOUT_S = 5.0
_CACHE_TTL_S = 900.0
_CACHE: dict[tuple[str, str, str, str], tuple[float, list[dict[str, Any]]]] = {}

_AREA_TYPES = frozenset({"city", "county", "state", "country", "district", "region", "province"})
_AREA_KEYS = frozenset({"place", "boundary"})


class PlaceSearchUnavailable(Exception):
    """Every place provider failed; callers show a calm message, never this error's text."""


def _text(value: Any) -> str:
    return str(value or "").strip()


def _city_label(city: str | None) -> str:
    return _text(city).split(",")[0].strip()


def _in_city(place_city: str, place_county: str, selected_city: str) -> bool:
    want = _normalize_city_match(selected_city)
    if not want:
        return False
    for candidate in (place_city, place_county):
        got = _normalize_city_match(candidate)
        if got and (got == want or want in got or got in want):
            return True
    return False


def _place(
    *,
    category: str,
    name: str,
    city_name: str,
    country_code: str,
    country_name: str,
    street: str,
    house_number: str,
    postcode: str,
    district: str,
    latitude: float | None,
    longitude: float | None,
) -> dict[str, Any]:
    street_line = " ".join(p for p in (street, house_number) if p)
    short_address = ", ".join(p for p in (street_line, city_name) if p) if street_line else None
    full_address = (
        ", ".join(p for p in (street_line, district, city_name, postcode, country_name) if p) if street_line else None
    )
    return {
        "kind": "place",
        "category": category,
        "name": name,
        "cityName": city_name or None,
        "countryCode": country_code or None,
        "countryName": country_name or None,
        "shortAddress": short_address,
        "fullAddress": full_address,
        "latitude": latitude,
        "longitude": longitude,
    }


def normalize_photon_feature(feature: Any) -> tuple[dict[str, Any], str] | None:
    """Return (place, county) for a usable Photon feature, or None for areas and nameless rows."""
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties")
    if not isinstance(props, dict):
        return None
    name = _text(props.get("name"))
    osm_key = _text(props.get("osm_key")).lower()
    if not name or osm_key in _AREA_KEYS or _text(props.get("type")).lower() in _AREA_TYPES:
        return None
    lat: float | None = None
    lon: float | None = None
    coords = (feature.get("geometry") or {}).get("coordinates") if isinstance(feature.get("geometry"), dict) else None
    if isinstance(coords, list) and len(coords) >= 2:
        try:
            lon, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError):
            lat, lon = None, None
    country_code = _text(props.get("countrycode")).upper()
    city_name = _text(props.get("city")) or _text(props.get("town")) or _text(props.get("village"))
    place = _place(
        category=place_category_from_osm(osm_key, props.get("osm_value")),
        name=name,
        city_name=city_name,
        country_code=country_code,
        country_name=_text(props.get("country")) or (_country_name_for_code(country_code) or ""),
        street=_text(props.get("street")),
        house_number=_text(props.get("housenumber")),
        postcode=_text(props.get("postcode")),
        district=_text(props.get("district")) or _text(props.get("locality")),
        latitude=lat,
        longitude=lon,
    )
    return place, _text(props.get("county"))


def normalize_nominatim_row(row: Any) -> tuple[dict[str, Any], str] | None:
    if not isinstance(row, dict):
        return None
    address = row.get("address") if isinstance(row.get("address"), dict) else {}
    name = _text(row.get("name")) or _text(row.get("display_name")).split(",")[0].strip()
    osm_key = _text(row.get("class")).lower()
    if not name or osm_key in _AREA_KEYS:
        return None
    try:
        lat: float | None = float(row["lat"])
        lon: float | None = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        lat, lon = None, None
    country_code = _text(address.get("country_code")).upper()
    city_name = _text(address.get("city")) or _text(address.get("town")) or _text(address.get("village"))
    place = _place(
        category=place_category_from_osm(osm_key, row.get("type")),
        name=name,
        city_name=city_name,
        country_code=country_code,
        country_name=_text(address.get("country")) or (_country_name_for_code(country_code) or ""),
        street=_text(address.get("road")),
        house_number=_text(address.get("house_number")),
        postcode=_text(address.get("postcode")),
        district=_text(address.get("suburb")) or _text(address.get("neighbourhood")),
        latitude=lat,
        longitude=lon,
    )
    return place, _text(address.get("county"))


def rank_places(
    rows: list[tuple[dict[str, Any], str]],
    *,
    city: str,
    country_code: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    """Selected-city places first, then the rest of the country; other countries are dropped."""
    cc = (country_code or "").upper()
    in_city: list[dict[str, Any]] = []
    elsewhere: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for place, county in rows:
        if cc and place["countryCode"] and place["countryCode"] != cc:
            continue
        key = (place["name"].casefold(), (place["cityName"] or "").casefold())
        if key in seen:
            continue
        seen.add(key)
        if _in_city(place["cityName"] or "", county, city):
            in_city.append(place)
        else:
            elsewhere.append(place)
    return (in_city + elsewhere)[:limit]


async def _photon_place_search(
    *, query: str, country_code: str | None, lat: float | None, lon: float | None
) -> list[Any]:
    """Raw Photon features; raises on transport or HTTP failure."""
    params: dict[str, str] = {"q": query, "limit": str(_PROVIDER_FETCH_LIMIT), "lang": "en"}
    if lat is not None and lon is not None:
        params["lat"] = f"{lat:.5f}"
        params["lon"] = f"{lon:.5f}"
        # City-sized focus: the default bias barely favours places near the city centre.
        params["zoom"] = "13"
        params["location_bias_scale"] = "0.1"
    bbox = _COUNTRY_BBOX.get((country_code or "").upper())
    if bbox:
        params["bbox"] = bbox
    async with httpx.AsyncClient(
        timeout=_PHOTON_TIMEOUT_S,
        headers={"User-Agent": _user_agent()},
        verify=load_httpx_verify_ssl(),
    ) as client:
        r = await client.get(_PHOTON_BASE, params=params)
    r.raise_for_status()
    data = r.json()
    features = data.get("features") if isinstance(data, dict) else None
    return features if isinstance(features, list) else []


async def _nominatim_place_search(*, query: str, city: str, country_code: str | None) -> list[Any]:
    """Raw Nominatim rows; raises on transport or HTTP failure."""
    base = load_osm_endpoints()[0]
    params: dict[str, str] = {
        "q": f"{query}, {city}" if city else query,
        "format": "json",
        "limit": str(_PROVIDER_FETCH_LIMIT),
        "addressdetails": "1",
    }
    if country_code:
        params["countrycodes"] = country_code.lower()
    await _nominatim_throttle()
    async with httpx.AsyncClient(
        timeout=_NOMINATIM_TIMEOUT_S,
        headers={"User-Agent": _user_agent()},
        verify=load_httpx_verify_ssl(),
    ) as client:
        r = await client.get(f"{base.rstrip('/')}/search", params=params)
    r.raise_for_status()
    rows = r.json()
    return rows if isinstance(rows, list) else []


def _cache_key(query: str, city: str, country_code: str | None, lat: float | None, lon: float | None) -> tuple[str, str, str, str]:
    where = f"{lat:.2f},{lon:.2f}" if lat is not None and lon is not None else ""
    return (query.casefold(), city.casefold(), (country_code or "").upper(), where)


async def place_suggest(
    *,
    query: str,
    city: str | None,
    country_code: str | None,
    limit: int = PLACE_SUGGEST_MAX_LIMIT,
    lat: float | None = None,
    lon: float | None = None,
) -> list[dict[str, Any]]:
    q = query.strip()
    city_label = _city_label(city)
    cc = (country_code or "").strip().upper() or None
    lim = max(1, min(PLACE_SUGGEST_MAX_LIMIT, limit))
    key = _cache_key(q, city_label, cc, lat, lon)
    cached = _CACHE.get(key)
    if cached and cached[0] > time.monotonic():
        return [dict(p) for p in cached[1][:lim]]

    photon_query = q if lat is not None and lon is not None else f"{q} {city_label}".strip()
    photon_failed = False
    places: list[dict[str, Any]] = []
    try:
        features = await _photon_place_search(query=photon_query, country_code=cc, lat=lat, lon=lon)
        rows = [r for r in (normalize_photon_feature(f) for f in features) if r]
        places = rank_places(rows, city=city_label, country_code=cc, limit=PLACE_SUGGEST_MAX_LIMIT)
    except Exception as e:
        photon_failed = True
        logger.warning("place_suggest_photon_failed", extra={"error_type": type(e).__name__})

    if not places:
        try:
            raw = await _nominatim_place_search(query=q, city=city_label, country_code=cc)
            rows = [r for r in (normalize_nominatim_row(x) for x in raw) if r]
            places = rank_places(rows, city=city_label, country_code=cc, limit=PLACE_SUGGEST_MAX_LIMIT)
        except Exception as e:
            logger.warning("place_suggest_nominatim_failed", extra={"error_type": type(e).__name__})
            if photon_failed:
                raise PlaceSearchUnavailable() from e

    _CACHE[key] = (time.monotonic() + _CACHE_TTL_S, places)
    return [dict(p) for p in places[:lim]]
