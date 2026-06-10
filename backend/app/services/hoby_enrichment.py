from __future__ import annotations

import logging
import re
from typing import Any

from app.ai.client import AIClient
from app.services.hoby_interest import sanitize_interest_category

logger = logging.getLogger(__name__)

_SYSTEM = """You enrich "hobies" metadata for a coordination app.
Return a single JSON object with exactly these keys: "types", "levels", "short_description", "icon", "interest_category".

"types" — array of modality / equipment / surface / style variants ONLY. Each element MUST be:
{ "key": string, "label": string, "description"?: string }
Do NOT put a "levels" array inside each type. Types are shared across the hoby; one ladder is enough.

"levels" — ONE shared skill / experience ladder for the whole hoby (same list for every type):
array of { "key": number|string, "label": string, "description": string } (e.g. beginner → advanced).

CRITICAL — what "type" means (NOT "level"):
- Type = variant of *how* you do it: equipment, venue/surface, ruleset, discipline, style.
  bicycle → road, mountain, gravel, track, bmx, touring. tennis → clay, hard_court, grass.
- Type is NOT: motivation, use case, frequency, or "how serious" (recreational/commuter/competitive belong in "levels" or descriptions).

If there is only one variant, use one type (e.g. "general") and still provide "levels".

Also include:
- "short_description": one plain-text sentence (max ~220 characters) explaining what this hoby is for someone new.
- "icon": exactly one Unicode emoji character (or emoji sequence) that represents the hoby visually. No words, no HTML, no URLs.
- "interest_category": exactly one of: sports, arts, games, learning, social — the best Discover browse bucket for this hoby.

Rules:
- Do not put null inside arrays. Every element must be a full object.
- Prefer 3–6 types when meaningful; prefer 3–6 levels in the single "levels" array.
- Type "key": lowercase slug, underscores only. Level "key": 1..n or short slugs like "beginner".
"""


def _slug_key_from_text(s: str) -> str:
    """URL-ish slug: lowercase, alnum + underscores, max length for DB sanity."""
    t = " ".join(s.lower().strip().split())
    t = re.sub(r"[^a-z0-9]+", "_", t)
    t = t.strip("_")
    return t[:64]


def derive_hoby_slug(display_name: str) -> str:
    """Database slug from human-readable hoby name (lowercase, underscores, a-z0-9)."""
    s = _slug_key_from_text(display_name.strip())
    return s if s else "hoby"


def _normalize_level_key(key: Any) -> str | int | None:
    if key is None or isinstance(key, bool):
        return None
    if isinstance(key, int):
        return key
    if isinstance(key, float):
        return int(key) if key.is_integer() else None
    s = str(key).strip()
    return s if s else None


def _clean_level_item(raw: dict[str, Any], *, ordinal: int | None = None) -> dict[str, Any] | None:
    label = raw.get("label")
    label_s = str(label).strip() if label is not None else ""
    nk = _normalize_level_key(raw.get("key"))
    if nk is None and ordinal is not None:
        nk = ordinal
    if nk is None and label_s:
        sk = _slug_key_from_text(label_s)
        nk = sk if sk else None
    if nk is None:
        return None
    if not label_s:
        label_s = str(nk)
    out: dict[str, Any] = {"key": nk, "label": label_s}
    desc = raw.get("description")
    if desc is not None and str(desc).strip():
        out["description"] = str(desc).strip()
    return out


def _clean_type_item(raw: dict[str, Any], *, used_keys: set[str] | None = None) -> dict[str, Any] | None:
    label = raw.get("label")
    label_s = str(label).strip() if label is not None else ""
    key_in = raw.get("key")
    if key_in is not None and not isinstance(key_in, bool) and str(key_in).strip():
        key_s = str(key_in).strip().lower().replace(" ", "_")
    else:
        key_s = _slug_key_from_text(label_s) if label_s else ""
    if not key_s:
        return None
    if used_keys is not None:
        base = key_s
        n = 2
        while key_s in used_keys:
            key_s = f"{base}_{n}"
            n += 1
        used_keys.add(key_s)
    if not label_s:
        label_s = key_s.replace("_", " ").title()
    out: dict[str, Any] = {"key": key_s, "label": label_s}
    desc = raw.get("description")
    if desc is not None and str(desc).strip():
        out["description"] = str(desc).strip()
    return out


def _extract_nested_levels_from_type(raw: dict[str, Any]) -> list[dict[str, Any]]:
    nested = raw.get("levels")
    if not isinstance(nested, list):
        return []
    out: list[dict[str, Any]] = []
    for i, it in enumerate(nested):
        if isinstance(it, dict):
            cl = _clean_level_item(it, ordinal=i + 1)
            if cl:
                out.append(cl)
    return out


def sanitize_hoby_metadata_lists(levels: Any, types: Any) -> tuple[Any, Any]:
    """Strip nulls before JSONB insert. types_json stores types only; levels_json stores one shared ladder.
    If the model still nests levels under types, merge the first non-empty nested list into levels when top-level is empty."""

    def norm_levels(v: Any) -> Any:
        if v is None:
            return None
        if not isinstance(v, list):
            return None
        out: list[dict[str, Any]] = []
        for i, it in enumerate(v):
            if it is None or not isinstance(it, dict):
                continue
            one = _clean_level_item(it, ordinal=i + 1)
            if one:
                out.append(one)
        return out

    types_in = types if isinstance(types, list) else []
    nested_candidates: list[list[dict[str, Any]]] = []
    type_rows: list[dict[str, Any]] = []
    type_key_used: set[str] = set()
    for it in types_in:
        if it is None or not isinstance(it, dict):
            continue
        nested = _extract_nested_levels_from_type(it)
        if nested:
            nested_candidates.append(nested)
        one = _clean_type_item(it, used_keys=type_key_used)
        if one:
            type_rows.append(one)

    lev_out = norm_levels(levels)
    if not lev_out and nested_candidates:
        lev_out = nested_candidates[0]

    types_out: Any = type_rows if type_rows else None
    if types_out is not None and not types_out:
        types_out = None

    return lev_out if lev_out else None, types_out


def sanitize_hoby_auxiliary(short_description: Any, icon: Any) -> tuple[str | None, str | None]:
    """Plain-text blurb + icon string (usually one emoji)."""
    sd: str | None = None
    if short_description is not None:
        s = str(short_description).strip()
        if s:
            s = " ".join(s.split())
            sd = s[:400]
    ic: str | None = None
    if icon is not None:
        line = str(icon).strip().splitlines()[0].strip()
        if line:
            ic = line[:32]
    return sd, ic


async def enrich_hoby(*, slug: str, display_name: str) -> dict[str, Any] | None:
    client = AIClient()
    if not client.enabled:
        logger.warning(
            "ai_disabled_hoby_enrichment",
            extra={"slug": slug, "hint": "Set AI_ENABLED and GROQ_API_KEY (or OPENAI_API_KEY) in config/ai_keys.json or env"},
        )
        return None

    prompt = f"""Hoby slug: {slug}
Hoby display name: {display_name}

1) **types**: equipment / surface / venue / discipline / style variants only (no nested levels inside each type).
2) **levels**: one shared skill ladder for this hoby (same steps for every type).
3) **short_description** and **icon** (one emoji) as in the system message.
4) **interest_category**: one of sports, arts, games, learning, social.

Return only valid JSON with top-level keys "types", "levels", "short_description", "icon", and "interest_category".
"""
    try:
        data = await client.chat_json(system=_SYSTEM, user=prompt)
    except Exception as e:
        logger.warning(
            "ai_hoby_enrichment_failed slug=%s %s: %s",
            slug,
            type(e).__name__,
            str(e),
            extra={"slug": slug, "error_type": type(e).__name__, "error": str(e)},
        )
        return None

    types = data.get("types")
    levels = data.get("levels")
    if not isinstance(types, list):
        types = []
    if not isinstance(levels, list):
        levels = []
    levels, types = sanitize_hoby_metadata_lists(levels, types)
    short_d, icon_s = sanitize_hoby_auxiliary(data.get("short_description"), data.get("icon"))
    interest_category = sanitize_interest_category(data.get("interest_category"))
    if not types:
        logger.warning(
            "ai_hoby_enrichment_empty",
            extra={"slug": slug, "hint": "Model returned no usable types; check API key, model id, and logs above"},
        )
    return {
        "types": types,
        "levels": levels,
        "short_description": short_d,
        "icon": icon_s,
        "interest_category": interest_category,
    }

