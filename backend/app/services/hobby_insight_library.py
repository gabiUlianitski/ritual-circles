"""Reusable hobby insight libraries. Home only reads the active batch."""

from __future__ import annotations

import logging
import os
import re
from difflib import SequenceMatcher
from uuid import UUID, uuid4

import asyncpg

from app.ai.client import AIClient

logger = logging.getLogger(__name__)

INSIGHT_TYPES = ("discovery", "motivation", "social_connection", "interesting_fact")
QUOTA = {
    "discovery": 13,
    "motivation": 13,
    "social_connection": 12,
    "interesting_fact": 12,
}
LIBRARY_SIZE = 50
GENERATION_ATTEMPTS = 3

_BANNED = re.compile(
    r"(\bjoin now\b|\bguarante|\bstudies show\b|\bresearch proves\b|\bresearch shows\b|"
    r"\b\d{1,3}\s*%|ritual circles)",
    re.IGNORECASE,
)
_EMOJI = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")
_HEBREW = re.compile(r"[\u0590-\u05FF]")

_SYSTEM = """You write short discovery lines about one hobby for a small-group meeting app.
Return JSON only: {"hobbyName":"...","insights":[{"type":"...","contentEn":"...","contentHe":"..."}]}

Rules for every insight:
- One or two short sentences, 45 to 120 characters total.
- Warm, specific, and human. Curiosity, motivation, or easy conversation.
- Directly about the hobby. Do not invent statistics, studies, dates, or medical claims.
- Do not promise friendship or happiness. Do not say "join".
- Do not mention an app name. No emojis. No quotation marks around the whole line.
- contentEn is English. contentHe is a natural Hebrew translation of that same line.
- Use only the requested type.
"""


class InsightValidationError(ValueError):
    pass


def stable_hash(key: str) -> int:
    total = 0
    for ch in key:
        total = (total + ord(ch)) & 0xFFFFFFFF
    return total


def insight_type_for(hobby_id: str, day: str) -> str:
    return INSIGHT_TYPES[stable_hash(f"{hobby_id}:{day}") % len(INSIGHT_TYPES)]


def select_daily_insight(insights: list[dict], hobby_id: str, day: str) -> dict | None:
    """Same hobby and local date always select the same active insight."""
    active = [item for item in insights if item.get("is_active", True)]
    if not active:
        return None
    wanted = insight_type_for(hobby_id, day)
    pool = [item for item in active if item.get("insight_type") == wanted] or active
    pool = sorted(pool, key=lambda item: str(item.get("id")))
    return pool[stable_hash(f"{hobby_id}:{day}:pick") % len(pool)]


def catalogue_admin_allowed(*, authenticated: bool, email: str | None, allowlist: set[str]) -> bool:
    """Signed-in catalogue users may generate. An email allowlist narrows that when configured."""
    if not authenticated:
        return False
    if not allowlist:
        return True
    return (email or "").strip().lower() in allowlist


def admin_allowlist() -> set[str]:
    raw = os.getenv("CATALOGUE_ADMIN_EMAILS", "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def _words(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def _sentences(text: str) -> int:
    parts = [part.strip() for part in re.split(r"[.!?]+", text) if part.strip()]
    return len(parts)


def _normalize(text: str) -> str:
    lowered = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", lowered).strip()


def _strip_wrapping_quotes(text: str) -> str:
    cleaned = text.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {'"', "'", "“", "”"}:
        return cleaned[1:-1].strip()
    return cleaned


def _clean_hebrew(value: object, english: str) -> str | None:
    if not isinstance(value, str):
        return None
    text = _strip_wrapping_quotes(_EMOJI.sub("", value)).strip()
    if not text or text.casefold() == english.casefold():
        return None
    if not _HEBREW.search(text):
        return None
    if _sentences(text) > 2 or len(_words(text)) > 50:
        return None
    return text


def _clean_english(value: object) -> str:
    if not isinstance(value, str):
        raise InsightValidationError("An insight was missing English text.")
    text = _strip_wrapping_quotes(_EMOJI.sub("", value)).strip()
    if not text:
        raise InsightValidationError("An insight was empty.")
    count = _sentences(text)
    words = _words(text)
    if count < 1 or count > 2 or not 8 <= len(words) <= 30 or not 45 <= len(text) <= 120:
        raise InsightValidationError("An insight must be one or two short sentences between 45 and 120 characters.")
    if _BANNED.search(text):
        raise InsightValidationError("An insight included a claim or call to action that is not allowed.")
    return text


def validate_library(payload: dict, *, hobby_id: str, hobby_name: str) -> list[dict]:
    """Reject the whole batch unless it is exactly the required library."""
    echoed_id = str(payload.get("hobbyId") or "").strip()
    if echoed_id and echoed_id != str(hobby_id):
        raise InsightValidationError("The AI response was for a different hobby.")
    echoed_name = str(payload.get("hobbyName") or "").strip()
    if echoed_name and echoed_name.casefold() != hobby_name.strip().casefold():
        raise InsightValidationError("The AI response was for a different hobby.")
    raw_items = payload.get("insights")
    if not isinstance(raw_items, list):
        raise InsightValidationError("The AI response did not include an insight list.")

    cleaned: list[dict] = []
    seen: list[str] = []
    for item in raw_items:
        if not isinstance(item, dict):
            raise InsightValidationError("An insight was malformed.")
        insight_type = str(item.get("type") or "").strip()
        if insight_type not in QUOTA:
            raise InsightValidationError("An insight used an unknown type.")
        english = _clean_english(item.get("contentEn"))
        key = _normalize(english)
        if not key:
            raise InsightValidationError("An insight was empty.")
        if key in seen or any(SequenceMatcher(None, key, prev).ratio() >= 0.96 for prev in seen):
            raise InsightValidationError("The insight library contained duplicate lines.")
        seen.append(key)
        cleaned.append(
            {
                "type": insight_type,
                "contentEn": english,
                "contentHe": _clean_hebrew(item.get("contentHe"), english),
            }
        )

    if len(cleaned) != LIBRARY_SIZE:
        raise InsightValidationError(f"Expected {LIBRARY_SIZE} insights, got {len(cleaned)}.")
    for insight_type, needed in QUOTA.items():
        found = sum(1 for item in cleaned if item["type"] == insight_type)
        if found != needed:
            raise InsightValidationError(f"Expected {needed} {insight_type} insights, got {found}.")
    return cleaned


def preview_items(items: list[dict], limit_per_type: int = 2) -> list[dict]:
    preview: list[dict] = []
    for insight_type in INSIGHT_TYPES:
        matched = [item for item in items if item["type"] == insight_type][:limit_per_type]
        preview.extend(matched)
    return preview


async def _generate_type(hobby_name: str, insight_type: str, count: int) -> list[dict]:
    kept: list[dict] = []
    seen: list[str] = []
    client = AIClient()
    for attempt in range(1, GENERATION_ATTEMPTS + 1):
        remaining = count - len(kept)
        user = (
            f"Hobby: {hobby_name}\n"
            f"Type: {insight_type}\n"
            f"Write exactly {remaining} insights. Every item must use type \"{insight_type}\".\n"
            "Each English line must contain 45 to 120 characters.\n"
            f'This is validation attempt {attempt} of {GENERATION_ATTEMPTS}. '
            f'Echo hobbyName as "{hobby_name}".'
        )
        data = await client.chat_json(system=_SYSTEM, user=user)
        if not isinstance(data, dict):
            continue
        echoed = str(data.get("hobbyName") or "").strip()
        if echoed and echoed.casefold() != hobby_name.strip().casefold():
            continue
        rows = data.get("insights")
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("type") or insight_type).strip() != insight_type:
                continue
            try:
                english = _clean_english(row.get("contentEn"))
            except InsightValidationError:
                continue
            key = _normalize(english)
            if not key or key in seen or any(SequenceMatcher(None, key, prev).ratio() >= 0.96 for prev in seen):
                continue
            seen.append(key)
            kept.append(
                {
                    "type": insight_type,
                    "contentEn": english,
                    "contentHe": _clean_hebrew(row.get("contentHe"), english),
                }
            )
            if len(kept) == count:
                break
        if len(kept) == count:
            break
    if len(kept) != count:
        raise InsightValidationError(
            f"Expected {count} {insight_type} insights, got {len(kept)} after {GENERATION_ATTEMPTS} attempts."
        )
    return kept


async def generate_raw_library(hobby_name: str) -> dict:
    insights: list[dict] = []
    for insight_type, count in QUOTA.items():
        insights.extend(await _generate_type(hobby_name, insight_type, count))
    return {"hobbyName": hobby_name, "insights": insights}


async def store_library(
    conn: asyncpg.Connection,
    *,
    hobby_id: UUID,
    batch_id: UUID,
    items: list[dict],
) -> int:
    """Insert the new batch, then retire the previous active rows. One transaction."""
    records = [
        (uuid4(), hobby_id, item["type"], item["contentEn"], item["contentHe"], batch_id)
        for item in items
    ]
    async with conn.transaction():
        await conn.executemany(
            """
            INSERT INTO hobby_insights (
              id, hobby_id, insight_type, content_en, content_he, generation_batch_id, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, true)
            """,
            records,
        )
        await conn.execute(
            """
            UPDATE hobby_insights
            SET is_active = false, updated_at = NOW()
            WHERE hobby_id = $1 AND generation_batch_id <> $2 AND is_active = true
            """,
            hobby_id,
            batch_id,
        )
        count = await conn.fetchval(
            """
            SELECT COUNT(*)::int
            FROM hobby_insights
            WHERE hobby_id = $1 AND is_active = true
            """,
            hobby_id,
        )
    return int(count or 0)


def _log(stage: str, *, hobby_id: str, batch_id: str, validated: int, result: str) -> None:
    logger.info(
        "hobby_insight_generation hobby_id=%s batch_id=%s requested=%s validated=%s result=%s stage=%s",
        hobby_id,
        batch_id,
        LIBRARY_SIZE,
        validated,
        result,
        stage,
    )


async def create_insight_library(
    conn: asyncpg.Connection,
    *,
    hobby_id: UUID,
    generate_fn=None,
) -> dict:
    row = await conn.fetchrow(
        "SELECT id, slug, display_name FROM hobies WHERE id = $1",
        hobby_id,
    )
    if row is None:
        raise LookupError("Hobby not found")
    batch_id = uuid4()
    hobby_name = str(row["display_name"])
    producer = generate_fn or generate_raw_library
    try:
        raw = await producer(hobby_name)
    except InsightValidationError as exc:
        _log("ai", hobby_id=str(hobby_id), batch_id=str(batch_id), validated=0, result="failed")
        raise InsightValidationError(f"{exc} Existing insights were preserved.") from exc
    except Exception as exc:
        _log("ai", hobby_id=str(hobby_id), batch_id=str(batch_id), validated=0, result="failed")
        raise RuntimeError("Could not generate insights. Existing insights were preserved.") from exc
    if not isinstance(raw, dict):
        raw = {}
    raw.setdefault("hobbyId", str(row["id"]))
    raw.setdefault("hobbyName", hobby_name)
    try:
        items = validate_library(raw, hobby_id=str(row["id"]), hobby_name=hobby_name)
    except InsightValidationError as exc:
        _log("validate", hobby_id=str(hobby_id), batch_id=str(batch_id), validated=0, result="failed")
        raise InsightValidationError(f"{exc} Existing insights were preserved.") from exc
    try:
        active_count = await store_library(conn, hobby_id=row["id"], batch_id=batch_id, items=items)
    except Exception as exc:
        _log("database", hobby_id=str(hobby_id), batch_id=str(batch_id), validated=len(items), result="failed")
        raise RuntimeError("Could not store insights. Existing insights were preserved.") from exc
    _log("database", hobby_id=str(hobby_id), batch_id=str(batch_id), validated=len(items), result="success")
    return {
        "hobbyId": str(row["id"]),
        "hobbyName": hobby_name,
        "slug": str(row["slug"]),
        "activeCount": active_count,
        "batchId": str(batch_id),
        "preview": preview_items(items),
    }
