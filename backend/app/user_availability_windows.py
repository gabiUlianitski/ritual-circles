from __future__ import annotations

import json
from typing import Any

ALLOWED_AVAILABILITY_WINDOWS = frozenset(
    {"weekday_mornings", "weekday_evenings", "weekends", "holidays"}
)
WINDOW_ORDER = ("weekday_mornings", "weekday_evenings", "weekends", "holidays")


def normalize_availability_windows(items: list[str]) -> list[str]:
    seen: set[str] = set()
    for raw in items:
        key = str(raw).strip().lower()
        if key in ALLOWED_AVAILABILITY_WINDOWS:
            seen.add(key)
    return [key for key in WINDOW_ORDER if key in seen]


def availability_windows_from_row(row: Any) -> list[str]:
    raw = row.get("availability_windows_json") if hasattr(row, "get") else None
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    keys: list[str] = []
    for x in raw:
        if isinstance(x, str):
            keys.append(x)
    return normalize_availability_windows(keys)
