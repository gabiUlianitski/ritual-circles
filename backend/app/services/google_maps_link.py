"""Resolve Google Maps share links into a human-readable place label."""
from __future__ import annotations

import logging
import re
from urllib.parse import parse_qs, unquote_plus, urlparse

import httpx

from app.services.maps_config import load_httpx_verify_ssl
from app.services.osm_venues import _user_agent, nominatim_reverse_meeting_label

logger = logging.getLogger(__name__)

_GENERIC_NAMES = frozenset(
    {
        "custom place",
        "pinned location",
        "selected place",
        "place",
        "meeting place",
        "unknown place",
    }
)

_SHORT_LINK = re.compile(r"maps\.app\.goo\.gl|goo\.gl/maps", re.I)
_MAPS_HOST = re.compile(r"google\.[a-z.]+\/maps|maps\.google\.", re.I)


def _decode_segment(value: str) -> str:
    try:
        return unquote_plus(value.replace("+", " ")).strip()
    except Exception:
        return value.replace("+", " ").strip()


def _parse_coord_pair(text: str) -> tuple[float, float] | None:
    m = re.match(r"^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$", text.strip())
    if not m:
        return None
    lat = float(m.group(1))
    lon = float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def _is_generic_name(name: str | None) -> bool:
    return not name or name.strip().lower() in _GENERIC_NAMES


def parse_google_maps_url(url: str) -> dict[str, str | float | None]:
    """Extract place name and coordinates from a Google Maps URL (no network)."""
    u = url.strip()
    name: str | None = None
    lat: float | None = None
    lon: float | None = None

    place_match = re.search(r"/place/([^/@?]+)", u)
    if place_match:
        name = _decode_segment(place_match.group(1))

    precise = re.search(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)", u)
    if precise:
        lat = float(precise.group(1))
        lon = float(precise.group(2))

    at_match = re.search(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", u)
    if at_match and lat is None:
        lat = float(at_match.group(1))
        lon = float(at_match.group(2))

    parsed = urlparse(u)
    qs = parse_qs(parsed.query)
    for param in ("q", "query", "ll"):
        values = qs.get(param)
        if not values:
            continue
        decoded = _decode_segment(values[0])
        coords = _parse_coord_pair(decoded)
        if coords:
            if lat is None:
                lat, lon = coords
        elif decoded and _is_generic_name(name):
            name = decoded

    search_match = re.search(r"/maps/search/([^/?]+)", u)
    if search_match and _is_generic_name(name):
        name = _decode_segment(search_match.group(1))

    return {"name": name, "lat": lat, "lon": lon}


def _normalize_url(raw: str) -> str:
    t = raw.strip()
    if not t:
        return t
    if not re.match(r"^https?://", t, re.I):
        t = f"https://{t.lstrip('/')}"
    return t


def _looks_like_maps_url(url: str) -> bool:
    return bool(_MAPS_HOST.search(url) or _SHORT_LINK.search(url))


async def _follow_short_link(url: str) -> str:
    if not _SHORT_LINK.search(url):
        return url
    verify = load_httpx_verify_ssl()
    headers = {"User-Agent": _user_agent(), "Accept": "text/html,application/xhtml+xml"}
    timeout = httpx.Timeout(15.0)
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            verify=verify,
            trust_env=True,
            headers=headers,
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            return str(r.url)
    except httpx.RequestError as e:
        logger.warning("google_maps_short_link_resolve_failed", extra={"error": str(e), "url": url[:120]})
        return url


async def resolve_google_maps_link(raw_url: str) -> dict[str, str | float | None]:
    """
    Follow short links, parse place/coords from the final URL, reverse-geocode when needed.
    """
    url = _normalize_url(raw_url)
    if not _looks_like_maps_url(url):
        raise ValueError("That does not look like a Google Maps link.")

    final_url = await _follow_short_link(url)
    info = parse_google_maps_url(final_url)
    name = str(info.get("name") or "").strip() or None
    lat = info.get("lat")
    lon = info.get("lon")
    lat_f = float(lat) if isinstance(lat, (int, float)) else None
    lon_f = float(lon) if isinstance(lon, (int, float)) else None

    url_name = name
    address = ""
    if lat_f is not None and lon_f is not None:
        label = await nominatim_reverse_meeting_label(lat=lat_f, lon=lon_f)
        short_address = str(label.get("shortAddress") or "").strip()
        reverse_name = str(label.get("name") or "").strip()
        if _is_generic_name(name):
            name = reverse_name or url_name
        if short_address:
            address = short_address
        elif reverse_name and reverse_name.lower() != (name or "").lower():
            address = reverse_name

    if _is_generic_name(name):
        name = "Pinned location"

    if not address:
        address = name or final_url

    return {
        "name": name or "Pinned location",
        "address": address,
        "lat": lat_f,
        "lon": lon_f,
        "mapsUrl": final_url,
    }
