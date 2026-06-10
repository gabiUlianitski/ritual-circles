from __future__ import annotations

from typing import Any

INTEREST_CATEGORIES: frozenset[str] = frozenset({"sports", "arts", "games", "learning", "social"})


def sanitize_interest_category(raw: Any) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    return s if s in INTEREST_CATEGORIES else None
