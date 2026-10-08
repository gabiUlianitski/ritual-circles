"""One stored Home sentence per user per day. Home does not call the model itself."""

from __future__ import annotations

import json
import logging
import re
from uuid import UUID

import asyncpg

from app.ai.client import AIClient
from app.user_hobbies import user_hobies_from_row

logger = logging.getLogger(__name__)

_HEBREW = re.compile(r"[\u0590-\u05FF]")
_SYSTEM = """You write one short Home introduction for a person and their hobbies.
Return JSON only: {"en":"...","he":"..."}

Rules:
- One sentence, maximum 150 characters in each language.
- Warm, human, and specific to the mix of hobbies.
- Do not list the hobby names one after another.
- Do not say "join", invent statistics, or promise friendship.
- No emojis and no quotation marks around the sentence.
- he is a natural Hebrew version of the same idea.
"""


def clamp_sentence(raw: object, limit: int = 150) -> str | None:
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.split()).strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'", "“", "”"}:
        text = text[1:-1].strip()
    if not text:
        return None
    sentence = re.split(r"(?<=[.!?])\s+", text)[0].strip()
    if len(sentence) <= limit:
        return sentence
    clipped = sentence[: limit - 1]
    boundary = clipped.rfind(" ")
    kept = clipped[:boundary] if boundary >= 40 else clipped
    return kept.rstrip(" ,;:") + "…"


def _stored(raw: object) -> dict:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


async def _hobby_names(conn: asyncpg.Connection, user_id: UUID, row: asyncpg.Record) -> list[str]:
    slugs = [item.slug.strip() for item in user_hobies_from_row(row) if item.slug and item.slug.strip()]
    joined = await conn.fetch(
        """
        SELECT DISTINCT c."ritualType" AS slug
        FROM attendance a
        JOIN sessions s ON s.id = a."sessionId"
        JOIN circles c ON c.id = s."circleId"
        WHERE a."userId" = $1 AND s."dateTime" >= NOW()
        """,
        user_id,
    )
    for item in joined:
        slug = str(item["slug"] or "").strip()
        if slug and slug.lower() not in {s.lower() for s in slugs}:
            slugs.append(slug)
    if not slugs:
        return []
    hobbies = await conn.fetch(
        """
        SELECT display_name
        FROM hobies
        WHERE lower(slug) = ANY($1::text[])
        ORDER BY display_name
        """,
        [slug.lower() for slug in slugs],
    )
    names = [str(item["display_name"]).strip() for item in hobbies if str(item["display_name"] or "").strip()]
    return names[:8]


async def _generate(names: list[str]) -> tuple[str | None, str | None]:
    client = AIClient()
    if not client.enabled:
        return None, None
    data = await client.chat_json(
        system=_SYSTEM,
        user=f"Hobbies: {', '.join(names)}\nWrite today's sentence.",
    )
    if not isinstance(data, dict):
        return None, None
    english = clamp_sentence(data.get("en"))
    hebrew = clamp_sentence(data.get("he"))
    if hebrew and not _HEBREW.search(hebrew):
        hebrew = None
    return english, hebrew


async def daily_for_you_intro(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    day: str,
    lang: str,
) -> str | None:
    """Return today's stored sentence. Generate it only when this day has none."""
    try:
        row = await conn.fetchrow(
            "SELECT user_hobies_json, for_you_intro_json FROM users WHERE id = $1",
            user_id,
        )
    except asyncpg.UndefinedColumnError:
        logger.info("for_you_intro_unavailable reason=column_missing")
        return None
    if row is None:
        return None
    stored = _stored(row["for_you_intro_json"])
    if stored.get("day") == day and (stored.get("en") or stored.get("he")):
        return str(stored.get(lang) or stored.get("en") or stored.get("he"))

    names = await _hobby_names(conn, user_id, row)
    if not names:
        return None
    try:
        english, hebrew = await _generate(names)
    except Exception:
        logger.info("for_you_intro_failed user_id=%s day=%s", user_id, day)
        return None
    if not english:
        return None
    payload = {"day": day, "en": english, "he": hebrew}
    await conn.execute(
        "UPDATE users SET for_you_intro_json = $2::jsonb WHERE id = $1",
        user_id,
        json.dumps(payload),
    )
    logger.info("for_you_intro_stored user_id=%s day=%s", user_id, day)
    return hebrew if lang == "he" and hebrew else english
