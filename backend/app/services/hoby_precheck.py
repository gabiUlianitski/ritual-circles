from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg
from fastapi import HTTPException

from app.ai.client import AIClient
from app.services.hoby_enrichment import derive_hoby_slug

logger = logging.getLogger(__name__)

_PRECHECK_SYSTEM = """You validate a proposed new hobby for a small-group weekly meetups app catalogue.

Return ONE JSON object with exactly these keys:
- "similarExisting": array (max 3) of { "slug": string, "displayName": string, "note": string } for catalogue rows the user is likely duplicating or clearly meant instead (same activity, obvious typo, synonym). Empty array if none.
- "validity": one of "valid", "typo", "not_a_hoby", "unclear"
- "suggestedNames": array of 0-6 short display-name strings the user might have meant if validity is not "valid"; otherwise [].

"valid" = a plausible recurring hobby/sport/craft/music-practice/etc. people could meet weekly to do together.
not_a_hoby = gibberish, empty meaning, or clearly not a hobby label.
"""


def _norm_similar(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for it in raw[:3]:
        if not isinstance(it, dict):
            continue
        slug = str(it.get("slug") or "").strip()
        dn = str(it.get("displayName") or it.get("display_name") or "").strip()
        if not slug or not dn:
            continue
        note = it.get("note")
        note_s = str(note).strip() if note is not None else ""
        row: dict[str, Any] = {"slug": slug, "displayName": dn}
        if note_s:
            row["note"] = note_s
        out.append(row)
    return out


def _norm_suggested(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for x in raw[:8]:
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
    return out


async def precheck_new_hoby(conn: asyncpg.Connection, *, display_name: str) -> dict[str, Any]:
    dn = display_name.strip()
    if not dn:
        raise HTTPException(status_code=400, detail="displayName is required")

    proposed = derive_hoby_slug(dn)

    dup = await conn.fetchrow(
        """
        SELECT slug, display_name
        FROM hobies
        WHERE lower(trim(display_name)) = lower(trim($1))
           OR slug = $2
        LIMIT 1
        """,
        dn,
        proposed,
    )
    if dup:
        dname = dup["display_name"]
        slug = dup["slug"]
        return {
            "proposedSlug": proposed,
            "blockedReason": "duplicate",
            "stepSummary": None,
            "message": (
                f"You already have “{dname}” in the catalogue (it matches what you typed). "
                f"You can’t add the same hoby twice — open the existing one from the list below."
            ),
            "duplicateDetail": f"Catalogue entry: {dname} ({slug})",
            "similarExisting": [],
            "validity": "unclear",
            "suggestedNames": [],
            "aiPerformed": False,
            "aiNote": None,
        }

    rows = await conn.fetch(
        """
        SELECT slug, display_name
        FROM hobies
        ORDER BY display_name ASC
        LIMIT 220
        """
    )
    catalog = [{"slug": r["slug"], "displayName": r["display_name"]} for r in rows]

    client = AIClient()
    if not client.enabled:
        return {
            "proposedSlug": proposed,
            "blockedReason": None,
            "stepSummary": None,
            "message": None,
            "duplicateDetail": None,
            "similarExisting": [],
            "validity": "valid",
            "suggestedNames": [],
            "aiPerformed": False,
            "aiNote": "Similarity and name checks were skipped because AI is turned off in server settings.",
        }

    user = f"""Catalogue JSON (slug + displayName for each existing hoby):
{json.dumps(catalog, ensure_ascii=False)}

Proposed new hoby display name: {json.dumps(dn, ensure_ascii=False)}

Return JSON with keys similarExisting, validity, suggestedNames as specified."""
    try:
        data = await client.chat_json(system=_PRECHECK_SYSTEM, user=user)
    except Exception as e:
        logger.warning(
            "hoby_precheck_ai_failed",
            extra={"error_type": type(e).__name__, "error": str(e)},
            exc_info=True,
        )
        return {
            "proposedSlug": proposed,
            "blockedReason": None,
            "stepSummary": None,
            "message": None,
            "duplicateDetail": None,
            "similarExisting": [],
            "validity": "valid",
            "suggestedNames": [],
            "aiPerformed": False,
            "aiNote": "We couldn’t run the optional name check (AI error). You can still save; fix AI settings if you want this check.",
        }

    similar = _norm_similar(data.get("similarExisting") or data.get("similar_existing"))
    validity = str(data.get("validity") or "unclear").strip().lower()
    if validity not in ("valid", "typo", "not_a_hoby", "unclear"):
        validity = "unclear"
    suggested = _norm_suggested(data.get("suggestedNames") or data.get("suggested_names"))

    blocked: str | None = None
    msg: str | None = None
    step_summary: str | None = None
    if similar:
        blocked = "similar_existing"
        quoted = ", ".join(f"“{s['displayName']}”" for s in similar)
        if len(similar) == 1:
            msg = (
                f"The catalogue already has {quoted}, which looks the same as “{dn}”. "
                f"Use that existing hoby from the list, or type a clearly different name if you need something new."
            )
        else:
            msg = (
                f"The catalogue already includes {quoted}, which are very close to “{dn}”. "
                f"Choose one of those hobies or enter a name that won’t be confused with them."
            )
    elif validity != "valid":
        blocked = "invalid_name"
        msg = (
            "That doesn’t look like a hobby name we can add. Try one of the suggestions below, "
            "or enter something clearer (for example “Watercolour painting”)."
        )
    else:
        step_summary = None

    return {
        "proposedSlug": proposed,
        "blockedReason": blocked,
        "stepSummary": step_summary,
        "message": msg,
        "duplicateDetail": None,
        "similarExisting": similar,
        "validity": validity,
        "suggestedNames": suggested,
        "aiPerformed": True,
        "aiNote": None,
    }
