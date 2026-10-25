"""Circle values used as the starting point for a new Activity.

Location:
- city and city_name are the area (Zurich), never a street address.
- meeting_place is the specific place. The app stores a street address only as
  the text after " — " in that field (Name — Address).

Size:
- group_size_json is the preferred Activity size the circle saved.
- maxSize is the older integer kept in step with that preference, capped at 6.
- This function is the only place that turns those two fields into one number.
"""

from __future__ import annotations

import json

_PLACE_ADDRESS_SEPARATOR = " — "


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _is_link(value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith("http://") or lowered.startswith("https://")


def activity_location_defaults(
    *,
    meeting_place: object,
    city: object,
    city_name: object,
) -> tuple[str | None, str | None]:
    """Return (location_name, location_address). A city name is never the address."""
    stored = _text(meeting_place)
    place_name: str | None = None
    address: str | None = None
    if stored and not _is_link(stored):
        if _PLACE_ADDRESS_SEPARATOR in stored:
            name, _, rest = stored.partition(_PLACE_ADDRESS_SEPARATOR)
            place_name = _text(name)
            rest = _text(rest)
            if rest and not _is_link(rest):
                address = rest
        else:
            place_name = stored
    if place_name:
        return place_name, address
    return _text(city_name) or _text(city), None


def get_preferred_activity_size(group_size_json: object, max_size: int | None) -> int:
    """One preferred Activity size. group_size_json wins; maxSize is the fallback."""
    fallback = max(1, int(max_size or 1))
    raw = group_size_json
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return fallback
    if not isinstance(raw, dict):
        return fallback
    kind = str(raw.get("type") or "")
    minimum = raw.get("min")
    maximum = raw.get("max")
    if kind == "fixed":
        chosen = minimum if isinstance(minimum, int) else maximum
    elif kind == "max":
        chosen = maximum
    elif kind == "min":
        chosen = minimum
    elif kind == "range":
        chosen = maximum if isinstance(maximum, int) else minimum
    else:
        chosen = None
    if isinstance(chosen, int) and not isinstance(chosen, bool) and chosen > 0:
        return chosen
    return fallback
