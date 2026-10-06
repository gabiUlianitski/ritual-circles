from __future__ import annotations

import json
from typing import Any

from app.schemas import UserHobyPreference

_MAX_USER_HOBIES = 24

LIFE_CATEGORIES = frozenset(
    {
        "sports",
        "arts",
        "food",
        "technology",
        "music",
        "wellness",
        "outdoor",
        "learning",
        "social",
        "creativity",
    }
)
EXPERIENCE_LEVELS = frozenset({"beginner", "intermediate", "advanced", "expert"})


def _allowed(raw: Any, choices: frozenset[str]) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip().lower()
    return value if value in choices else None


def parse_hoby_level_key(level_raw: Any) -> str | int | None:
    if level_raw is None or level_raw == "":
        return None
    if isinstance(level_raw, bool):
        return None
    if isinstance(level_raw, int):
        return level_raw
    if isinstance(level_raw, float) and level_raw.is_integer():
        return int(level_raw)
    if isinstance(level_raw, str):
        s = level_raw.strip()
        if not s:
            return None
        if s.isdigit():
            return int(s)
        return s
    try:
        return int(level_raw)
    except (TypeError, ValueError):
        return None


def _level_is_set(level: str | int | None) -> bool:
    if level is None:
        return False
    if isinstance(level, str):
        return bool(level.strip())
    return True


def _clean_types(raw: Any, subtype: str | None) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    source = raw if isinstance(raw, list) else []
    for item in source:
        key = str(item or "").strip()
        if not key:
            continue
        marker = key.lower()
        if marker in seen:
            continue
        seen.add(marker)
        found.append(key)
        if len(found) >= 12:
            break
    if not found and subtype:
        found.append(subtype)
    return found


def _entry_key(slug: str, subtype: str | None, level: str | int | None) -> tuple[str, str, str]:
    level_part = "" if level is None else str(level).strip().lower()
    return (slug.strip().lower(), (subtype or "").strip().lower(), level_part)


def normalize_user_hobies(items: list[UserHobyPreference]) -> list[UserHobyPreference]:
    seen: set[tuple[str, str, str]] = set()
    out: list[UserHobyPreference] = []
    for item in items:
        slug = (item.slug or "").strip()
        if not slug:
            continue
        subtype = (item.subtype or "").strip() or None
        level = parse_hoby_level_key(item.level)
        types = _clean_types(item.types, subtype)
        if types and (subtype or "").lower() not in {key.lower() for key in types}:
            subtype = types[0]
        key = _entry_key(slug, subtype, level)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            UserHobyPreference(
                slug=slug,
                subtype=subtype,
                level=level,
                types=types,
                category=_allowed(item.category, LIFE_CATEGORIES),
                experienceLevel=_allowed(item.experienceLevel, EXPERIENCE_LEVELS),
            )
        )
        if len(out) >= _MAX_USER_HOBIES:
            break
    return out


def user_hobies_to_json(items: list[UserHobyPreference]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in normalize_user_hobies(items):
        row: dict[str, Any] = {"slug": item.slug}
        if item.subtype:
            row["subtype"] = item.subtype
        if item.types:
            row["types"] = item.types
        if _level_is_set(item.level):
            row["level"] = item.level
        if item.category:
            row["category"] = item.category
        if item.experienceLevel:
            row["experienceLevel"] = item.experienceLevel
        rows.append(row)
    return rows


def parse_user_hobies_json(raw: Any) -> list[UserHobyPreference]:
    if raw is None:
        return []
    data = raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(data, list):
        return []
    out: list[UserHobyPreference] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug") or "").strip()
        if not slug:
            continue
        subtype_raw = item.get("subtype")
        subtype = str(subtype_raw).strip() if subtype_raw is not None and str(subtype_raw).strip() else None
        level = parse_hoby_level_key(item.get("level"))
        out.append(
            UserHobyPreference(
                slug=slug,
                subtype=subtype,
                level=level,
                types=_clean_types(item.get("types"), subtype),
                category=_allowed(item.get("category"), LIFE_CATEGORIES),
                experienceLevel=_allowed(item.get("experienceLevel"), EXPERIENCE_LEVELS),
            )
        )
    return normalize_user_hobies(out)


def user_hobies_from_row(row: Any) -> list[UserHobyPreference]:
    parsed = parse_user_hobies_json(row.get("user_hobies_json"))
    if parsed:
        return parsed
    slug = row.get("preferred_hoby_slug")
    if slug and str(slug).strip():
        return [
            UserHobyPreference(
                slug=str(slug).strip(),
                subtype=(
                    str(row["preferred_hoby_subtype"]).strip()
                    if row.get("preferred_hoby_subtype")
                    else None
                ),
                level=parse_hoby_level_key(row.get("preferred_hoby_level")),
            )
        ]
    return []


def user_can_join_circle(row: Any, circle: Any) -> bool:
    """Member must have this circle's hobby slug on profile with a level set."""
    hobbies = user_hobies_from_row(row)
    slug = str(circle.get("ritualType") or circle.get("ritual_type") or "").strip().lower()
    if not slug:
        return False
    for pref in hobbies:
        if pref.slug.strip().lower() != slug:
            continue
        if not _level_is_set(pref.level):
            continue
        return True
    return False


def with_hobby_for_slug(
    row: Any, *, slug: str, level: str | int | None, subtype: str | None = None
) -> list[UserHobyPreference] | None:
    """Profile hobbies plus `slug` at `level`. None when nothing needs to change."""
    target = (slug or "").strip()
    if not target:
        return None
    resolved = parse_hoby_level_key(level)
    if not _level_is_set(resolved):
        return None

    hobbies = user_hobies_from_row(row)
    for pref in hobbies:
        if pref.slug.strip().lower() != target.lower():
            continue
        if _level_is_set(pref.level):
            return None
        break

    kept = [p for p in hobbies if p.slug.strip().lower() != target.lower()]
    kept.append(UserHobyPreference(slug=target, subtype=(subtype or "").strip() or None, level=resolved))
    return normalize_user_hobies(kept)


def pick_hobby_for_slug(row: Any, slug: str) -> UserHobyPreference | None:
    """Member's saved hobby entry matching a circle ritualType slug."""
    target = (slug or "").strip().lower()
    if not target:
        return None
    for pref in user_hobies_from_row(row):
        if pref.slug.strip().lower() == target:
            return pref
    return None


def _level_for_legacy_column(level: str | int | None) -> int | None:
    if isinstance(level, int):
        return level
    if isinstance(level, str) and level.strip().isdigit():
        return int(level.strip())
    return None


def sync_legacy_preferred_columns(hobbies: list[dict[str, Any]]) -> tuple[str | None, str | None, int | None]:
    if not hobbies:
        return None, None, None
    first = hobbies[0]
    return (
        first.get("slug"),
        first.get("subtype"),
        _level_for_legacy_column(parse_hoby_level_key(first.get("level"))),
    )
