from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GoogleMapsConfig:
    api_key: str
    radius_m: int
    verify_ssl: bool


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _maps_config_data() -> dict[str, Any]:
    base = Path(__file__).resolve().parents[2]  # backend/
    return _load_json(base / "config" / "google_maps_keys.json")


def load_httpx_verify_ssl() -> bool:
    """TLS verify flag from optional maps config (used by Google and OSM HTTP clients)."""
    data = _maps_config_data()
    verify = data.get("HTTPX_VERIFY", True)
    if isinstance(verify, str):
        verify = verify.strip().lower() not in ("0", "false", "no", "off")
    if os.getenv("HTTPX_VERIFY", "").strip().lower() in ("0", "false", "no", "off"):
        verify = False
    return bool(verify)


def load_osm_endpoints() -> tuple[str, str]:
    """Nominatim base (no trailing slash) and primary Overpass interpreter URL."""
    data = _maps_config_data()
    nom = str(data.get("NOMINATIM_BASE_URL") or os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")).rstrip("/")
    ov = str(data.get("OVERPASS_URL") or os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")).strip()
    if not ov:
        ov = "https://overpass-api.de/api/interpreter"
    return nom, ov


def load_overpass_interpreter_urls() -> list[str]:
    """
    Ordered Overpass interpreter URLs: primary, optional config fallbacks, then built-in mirrors.
    Public instances are often overloaded; trying a second mirror fixes many empty-result reports.
    """
    data = _maps_config_data()
    primary = str(
        data.get("OVERPASS_URL") or os.getenv("OVERPASS_URL", "https://overpass.kumi.systems/api/interpreter")
    ).strip()
    if not primary:
        primary = "https://overpass.kumi.systems/api/interpreter"
    urls: list[str] = [primary.rstrip("/")]
    extras = data.get("OVERPASS_FALLBACK_URLS")
    if isinstance(extras, list):
        for x in extras:
            u = str(x).strip().rstrip("/")
            if u and u not in urls:
                urls.append(u)
    for u in (
        "https://overpass.kumi.systems/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
    ):
        if u not in urls:
            urls.append(u)
    return _prioritize_public_mirror_when_primary_is_busy(urls)


def _prioritize_public_mirror_when_primary_is_busy(urls: list[str]) -> list[str]:
    """Try kumi.systems before overpass-api.de when both are present (official instance often 504/slow)."""
    if len(urls) < 2:
        return urls
    first = urls[0].lower()
    if "overpass-api.de" not in first:
        return urls
    alt = next((u for u in urls[1:] if "kumi.systems" in u.lower()), None)
    if not alt:
        return urls
    rest = [u for u in urls if u != alt]
    return [alt] + rest


def load_google_maps_config() -> GoogleMapsConfig | None:
    data = _maps_config_data()
    key = str(data.get("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY", "")).strip()
    if not key:
        return None
    radius = int(data.get("PLACES_SEARCH_RADIUS_M", os.getenv("PLACES_SEARCH_RADIUS_M", "12000")))
    verify = load_httpx_verify_ssl()
    return GoogleMapsConfig(api_key=key, radius_m=max(1000, min(radius, 50000)), verify_ssl=verify)
