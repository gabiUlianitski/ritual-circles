from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.services.maps_config import GoogleMapsConfig

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def geocode_address(cfg: GoogleMapsConfig, *, address: str) -> dict[str, Any] | None:
    """Returns first Geocoding result with lat, lng, formatted_address or None."""
    params = {"address": address.strip(), "key": cfg.api_key}
    timeout = httpx.Timeout(30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=cfg.verify_ssl, trust_env=True) as client:
            r = await client.get(GEOCODE_URL, params=params)
    except httpx.RequestError as e:
        logger.warning("google_geocode_request_error", exc_info=True)
        raise RuntimeError(
            "Could not reach Google Geocoding (network or TLS). "
            "Try HTTPX_VERIFY false in config/google_maps_keys.json if SSL inspection is enabled."
        ) from e
    if r.status_code >= 400:
        logger.warning("google_geocode_http", extra={"status": r.status_code, "body": (r.text or "")[:400]})
        return None
    try:
        data = r.json()
    except json.JSONDecodeError:
        logger.warning("google_geocode_bad_json", extra={"snippet": (r.text or "")[:300]})
        return None
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        logger.warning("google_geocode_status", extra={"status": data.get("status"), "msg": data.get("error_message")})
        return None
    results = data.get("results") or []
    if not results:
        return None
    loc = (results[0].get("geometry") or {}).get("location") or {}
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        return None
    return {
        "lat": float(lat),
        "lng": float(lng),
        "formatted_address": results[0].get("formatted_address") or address.strip(),
    }


async def places_text_search(
    cfg: GoogleMapsConfig,
    *,
    query: str,
    lat: float,
    lng: float,
) -> list[dict[str, Any]]:
    """Google Places Text Search (legacy), biased near lat/lng."""
    params = {
        "query": query.strip(),
        "location": f"{lat},{lng}",
        "radius": str(cfg.radius_m),
        "key": cfg.api_key,
    }
    timeout = httpx.Timeout(30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=cfg.verify_ssl, trust_env=True) as client:
            r = await client.get(TEXT_SEARCH_URL, params=params)
    except httpx.RequestError as e:
        logger.warning("google_places_request_error", exc_info=True)
        raise RuntimeError(
            "Could not reach Google Places (network or TLS). "
            "Try HTTPX_VERIFY false in config/google_maps_keys.json if SSL inspection is enabled."
        ) from e
    if r.status_code >= 400:
        logger.warning("google_places_http", extra={"status": r.status_code, "body": (r.text or "")[:400]})
        return []
    try:
        data = r.json()
    except json.JSONDecodeError:
        logger.warning("google_places_bad_json", extra={"snippet": (r.text or "")[:300]})
        return []
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        logger.warning("google_places_status", extra={"status": data.get("status"), "msg": data.get("error_message")})
        return []
    return list(data.get("results") or [])


def place_to_candidate(place: dict[str, Any]) -> dict[str, Any] | None:
    loc = (place.get("geometry") or {}).get("location") or {}
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        return None
    name = str(place.get("name") or "").strip()
    addr = str(place.get("formatted_address") or "").strip()
    if not name and not addr:
        return None
    pid = place.get("place_id")
    q = quote_plus(f"{name} {addr}".strip() or f"{lat},{lng}")
    maps_url = f"https://www.google.com/maps/search/?api=1&query={q}"
    if pid:
        maps_url = f"https://www.google.com/maps/search/?api=1&query_place_id={quote_plus(str(pid))}"
    return {
        "name": name or addr.split(",")[0],
        "address": addr or name,
        "mapsUrl": maps_url,
        "placeId": str(pid) if pid else None,
        "rating": _safe_float(place.get("rating")),
        "types": place.get("types") or [],
    }
