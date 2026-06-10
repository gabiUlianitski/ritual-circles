"""User-facing venue labels for place pickers (no internal OSM/debug copy)."""
from __future__ import annotations

import re
from typing import Any

_GENERIC_NAME_KEYS = frozenset(
    {
        "coffee shop",
        "coffee_shop",
        "cafe",
        "café",
        "park",
        "restaurant",
        "bar",
        "tennis court",
        "tennis courts",
        "community centre",
        "community center",
        "library",
        "sports centre",
        "sports center",
        "meeting point",
        "venue",
        "place",
        "shop",
    }
)

_GOOGLE_TYPE_LABELS: dict[str, str] = {
    "cafe": "Cafe",
    "coffee_shop": "Cafe",
    "restaurant": "Restaurant",
    "bar": "Bar",
    "park": "Park",
    "library": "Library",
    "gym": "Gym",
    "stadium": "Stadium",
    "school": "School",
    "community_center": "Community center",
    "tourist_attraction": "Landmark",
    "bicycle_store": "Bike shop",
    "store": "Shop",
}

_OSM_CATEGORY_RULES: list[tuple[str, str, str]] = [
    ("amenity", "cafe", "Cafe"),
    ("amenity", "coffee_shop", "Cafe"),
    ("amenity", "restaurant", "Restaurant"),
    ("amenity", "bar", "Bar"),
    ("amenity", "library", "Library"),
    ("amenity", "community_centre", "Community center"),
    ("amenity", "bicycle_rental", "Bike rental"),
    ("leisure", "park", "Park"),
    ("leisure", "garden", "Park"),
    ("leisure", "sports_centre", "Sports center"),
    ("leisure", "pitch", "Sports pitch"),
    ("leisure", "track", "Track"),
    ("sport", "tennis", "Tennis court"),
    ("sport", "cycling", "Cycling"),
    ("highway", "cycleway", "Bike path"),
    ("highway", "path", "Path"),
    ("tourism", "attraction", "Landmark"),
]


def _title(s: str) -> str:
    t = s.strip()
    if not t:
        return t
    return t[0].upper() + t[1:]


def is_generic_venue_name(name: str) -> bool:
    key = re.sub(r"\s+", " ", name.strip().lower())
    key = key.replace("-", " ")
    return key in _GENERIC_NAME_KEYS or len(key) <= 3


def street_hint_from_address(address: str) -> str:
    addr = address.strip()
    if not addr:
        return ""
    first = addr.split(",")[0].strip()
    if not first:
        return ""
    parts = [p.strip() for p in first.split() if p.strip()]
    if len(parts) >= 2 and parts[0].isdigit():
        return " ".join(parts[1:])
    return first


def normalize_venue_display_name(name: str, address: str) -> str:
    raw = name.strip() or "Place"
    if not is_generic_venue_name(raw):
        return raw
    street = street_hint_from_address(address)
    if street and street.lower() != raw.lower():
        return f"{_title(raw)} – {street}"
    return _title(raw)


def format_distance_label(dist_m: float | None) -> str | None:
    if dist_m is None or dist_m < 0:
        return None
    if dist_m < 950:
        return "Nearby"
    km = dist_m / 1000.0
    if km < 10:
        return f"{km:.1f} km"
    return f"{km:.0f} km"


def category_from_osm_tags(tags: dict[str, str]) -> str | None:
    for key, val, label in _OSM_CATEGORY_RULES:
        if str(tags.get(key) or "").strip().lower() == val:
            return label
    sport = str(tags.get("sport") or "").strip().lower()
    if sport == "tennis":
        return "Tennis court"
    if sport:
        return _title(sport.replace("_", " "))
    leisure = str(tags.get("leisure") or "").strip().lower()
    if leisure:
        return _title(leisure.replace("_", " "))
    amenity = str(tags.get("amenity") or "").strip().lower()
    if amenity:
        return _title(amenity.replace("_", " "))
    return None


def category_from_google_types(types: list[str]) -> str | None:
    for t in types:
        key = str(t).strip().lower()
        if key in _GOOGLE_TYPE_LABELS:
            return _GOOGLE_TYPE_LABELS[key]
    for t in types:
        key = str(t).strip().lower()
        if key and key not in ("point_of_interest", "establishment", "geocode"):
            return _title(key.replace("_", " "))
    return None


def hint_for_category(category: str | None) -> str | None:
    if not category:
        return None
    c = category.lower()
    if c in ("cafe", "coffee shop", "library", "community center", "community centre"):
        return "Good for small groups"
    if c == "park":
        return "Easy to spot each other"
    if "tennis" in c:
        return "Check court booking if needed"
    if c in ("bike path", "path", "cycling"):
        return "Good meet-up spot before you ride"
    if c in ("restaurant", "bar"):
        return "Confirm seating for your group"
    return None


def guess_category_from_name(name: str) -> str | None:
    n = name.lower()
    if "tennis" in n:
        return "Tennis court"
    if "coffee" in n or "cafe" in n or "café" in n:
        return "Cafe"
    if "park" in n:
        return "Park"
    if "library" in n:
        return "Library"
    if "bike" in n or "cycle" in n:
        return "Bike path"
    return None


def venue_card_fields(
    *,
    name: str,
    address: str,
    dist_m: float | None,
    tags: dict[str, Any] | None = None,
    google_types: list[str] | None = None,
) -> dict[str, Any]:
    tag_map = {str(k): str(v) for k, v in (tags or {}).items()}
    category = category_from_osm_tags(tag_map)
    if not category and google_types:
        category = category_from_google_types(google_types)
    if not category:
        category = guess_category_from_name(name)
    display_name = normalize_venue_display_name(name, address)
    return {
        "displayName": display_name,
        "category": category,
        "distanceLabel": format_distance_label(dist_m),
        "distanceKm": round(dist_m / 1000.0, 2) if dist_m is not None and dist_m >= 0 else None,
        "hint": hint_for_category(category),
    }
