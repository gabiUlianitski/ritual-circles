from __future__ import annotations

import json
from typing import Any

SUPPORTED_LANGS = frozenset({"en", "he"})

# Fallback labels for common level keys when hoby i18n_json has no entry.
_COMMON_LEVEL_LABELS: dict[str, dict[str, str]] = {
    "he": {
        "beginner": "מתחיל",
        "intermediate": "בינוני",
        "advanced": "מתקדם",
        "expert": "מומחה",
        "1": "מתחיל",
        "2": "בינוני",
        "3": "מתקדם",
    },
}


def normalize_app_lang(code: str | None) -> str:
    if not code or not str(code).strip():
        return "en"
    base = str(code).split(",")[0].split("-")[0].strip().lower()
    return "he" if base == "he" else "en"


def parse_i18n_json(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


def localized_display_name(row: dict[str, Any] | Any, lang: str) -> str | None:
    base = row.get("display_name") if hasattr(row, "get") else None
    if lang == "en":
        return base
    i18n = parse_i18n_json(row.get("i18n_json") if hasattr(row, "get") else None)
    block = i18n.get(lang)
    if isinstance(block, dict):
        translated = block.get("display_name")
        if isinstance(translated, str) and translated.strip():
            return translated.strip()
    return base


def localized_short_description(row: dict[str, Any] | Any, lang: str) -> str | None:
    base = row.get("short_description") if hasattr(row, "get") else None
    if lang == "en":
        return base
    i18n = parse_i18n_json(row.get("i18n_json") if hasattr(row, "get") else None)
    block = i18n.get(lang)
    if isinstance(block, dict):
        translated = block.get("short_description")
        if isinstance(translated, str) and translated.strip():
            return translated.strip()
    return base


def _merge_metadata_list(base: Any, translations: Any, lang: str, *, common_labels: dict[str, str] | None) -> Any:
    if not isinstance(base, list):
        return base
    if lang == "en":
        return base
    tr_map = translations if isinstance(translations, dict) else {}
    out: list[Any] = []
    for item in base:
        if not isinstance(item, dict):
            out.append(item)
            continue
        key = str(item.get("key", ""))
        merged = dict(item)
        tr_item = tr_map.get(key)
        if isinstance(tr_item, dict):
            if isinstance(tr_item.get("label"), str) and tr_item["label"].strip():
                merged["label"] = tr_item["label"].strip()
            if isinstance(tr_item.get("description"), str) and tr_item["description"].strip():
                merged["description"] = tr_item["description"].strip()
        elif common_labels and key in common_labels and not merged.get("label"):
            merged["label"] = common_labels[key]
        out.append(merged)
    return out


def localized_levels_types(row: dict[str, Any] | Any, lang: str) -> tuple[Any, Any]:
    levels = row.get("levels_json") if hasattr(row, "get") else None
    types = row.get("types_json") if hasattr(row, "get") else None
    if lang == "en":
        return levels, types
    i18n = parse_i18n_json(row.get("i18n_json") if hasattr(row, "get") else None)
    block = i18n.get(lang)
    block = block if isinstance(block, dict) else {}
    common = _COMMON_LEVEL_LABELS.get(lang)
    levels_out = _merge_metadata_list(levels, block.get("levels"), lang, common_labels=common)
    types_out = _merge_metadata_list(types, block.get("types"), lang, common_labels=None)
    return levels_out, types_out


def localized_interest_category(category: str | None, lang: str) -> str | None:
    if not category or lang == "en":
        return category
    labels = {
        "he": {
            "sports": "ספורט",
            "arts": "אמנות",
            "games": "משחקים",
            "learning": "למידה",
            "social": "חברתי",
        },
    }
    return labels.get(lang, {}).get(category.strip().lower(), category)
