"""Daily hobby insights for Today's Discovery. Fails open: the client has static copy."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

import asyncpg

from app.ai.client import AIClient

logger = logging.getLogger(__name__)

_MAX_WORDS = 30

_SYSTEM = """You write a short hobby spotlight for a social app called Ritual Circles.
People use it to meet a few others and do a hobby together.

Return JSON with exactly these keys:
- title: a short conversational question or invitation, at most 8 words, spoken to the reader. Example: "Have you ever tried pottery?" Not a quote. No exclamation marks.
- body: one or two short sentences, 25 words maximum, like a friend suggesting it. Warm, human, curious, optimistic.
- imagePrompt: one sentence describing a candid photograph of a small diverse group enjoying this hobby together. No text in the image.

Do not write motivational quotes, self-help advice, sales copy, or corporate language.
Do not mention the app by name.
Write title and body in the requested language.
"""


def _words(text: str) -> list[str]:
    return re.findall(r"\S+", text.strip())


def _clip_words(text: str, limit: int) -> str:
    words = _words(text)
    if len(words) <= limit:
        return text.strip()
    clipped = " ".join(words[:limit]).rstrip(".,;:")
    return clipped + "."


async def generate_discovery(*, display_name: str, category: str | None, lang: str) -> dict[str, str] | None:
    name = display_name.strip()
    if not name:
        return None
    language = "Hebrew" if lang.lower().startswith("he") else "English"
    category_line = f"Category: {category.strip()}\n" if category and category.strip() else ""
    user = f"Hobby: {name}\n{category_line}Language: {language}"
    try:
        data = await AIClient().chat_json(system=_SYSTEM, user=user)
    except Exception:
        logger.warning("discovery_ai_failed", extra={"hobby": name}, exc_info=True)
        return None

    title = str(data.get("title") or "").strip()
    body = _clip_words(str(data.get("body") or ""), _MAX_WORDS)
    image_prompt = str(data.get("imagePrompt") or "").strip()
    if not title or len(_words(body)) < 5:
        return None
    if not image_prompt:
        image_prompt = (
            f"Candid warm photograph of a small diverse group of friends enjoying {name} together, "
            "natural light, authentic and positive, no text"
        )
    return {"title": title, "body": body, "imagePrompt": image_prompt}


INSIGHT_CATEGORIES = ("discovery", "motivation", "social", "funFact")

_INSIGHT_SYSTEM = """You write a daily insight about one hobby for people who meet in small groups.

Return JSON with exactly these keys:
- discovery
- motivation
- social
- funFact

Each value is 1 or 2 sentences, 40 words maximum.
Positive, warm, and specific to the hobby.
Focus on connection, growth, curiosity, or belonging.
No quotes, hashtags, sales language, or mention of any app.
Write every value in the requested language.
"""

_locks: dict[str, asyncio.Lock] = {}


def insight_category_for(day: str, slug: str) -> str:
    """Same rotation the web client uses, so the fallback matches the stored line."""
    key = f"{day}:{slug.strip().lower()}"
    total = 0
    for ch in key:
        total = (total + ord(ch)) & 0xFFFFFFFF
    return INSIGHT_CATEGORIES[total % len(INSIGHT_CATEGORIES)]


def _lang_key(lang: str) -> str:
    return "he" if lang.lower().startswith("he") else "en"


def _parse_stored(raw: object) -> dict:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


def _complete(texts: object) -> dict[str, str] | None:
    if not isinstance(texts, dict):
        return None
    out: dict[str, str] = {}
    for key in INSIGHT_CATEGORIES:
        text = _clip_words(str(texts.get(key) or ""), 40)
        if len(_words(text)) < 6:
            return None
        out[key] = text
    return out


async def _generate_insights(*, display_name: str, lang_key: str) -> dict[str, str] | None:
    language = "Hebrew" if lang_key == "he" else "English"
    user = f"Hobby: {display_name.strip()}\nLanguage: {language}"
    try:
        data = await AIClient().chat_json(system=_INSIGHT_SYSTEM, user=user)
    except Exception:
        logger.warning("daily_insight_ai_failed", extra={"hobby": display_name}, exc_info=True)
        return None
    return _complete(data)


def _lock_for(key: str) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


async def get_daily_insight(conn: asyncpg.Connection, *, slug: str, lang: str) -> dict[str, str] | None:
    """Return today's insight for a hobby. Generates and stores it once per language per day."""
    needle = slug.strip()
    if not needle:
        return None
    lang_key = _lang_key(lang)
    day = datetime.now(timezone.utc).date().isoformat()
    try:
        row = await conn.fetchrow(
            """
            SELECT slug, display_name, daily_insight_json
            FROM hobies
            WHERE lower(trim(slug)) = lower(trim($1))
            """,
            needle,
        )
    except asyncpg.UndefinedColumnError:
        logger.warning("daily_insight_column_missing")
        return None
    if row is None:
        return None

    lock = _lock_for(f"{row['slug']}:{lang_key}:{day}")
    async with lock:
        fresh = await conn.fetchrow(
            "SELECT slug, display_name, daily_insight_json FROM hobies WHERE slug = $1",
            row["slug"],
        )
        if fresh is None:
            return None
        stored = _parse_stored(fresh["daily_insight_json"])
        bucket = stored if stored.get("day") == day else {"day": day}
        raw_lang = bucket.get(lang_key)
        if isinstance(raw_lang, dict) and raw_lang.get("unavailable") is True:
            return None
        texts = _complete(raw_lang)
        if texts is None:
            texts = await _generate_insights(display_name=str(fresh["display_name"] or needle), lang_key=lang_key)
            bucket[lang_key] = texts if texts is not None else {"unavailable": True}
            await conn.execute(
                "UPDATE hobies SET daily_insight_json = $2::jsonb WHERE slug = $1",
                fresh["slug"],
                json.dumps(bucket, ensure_ascii=False),
            )
            if texts is None:
                return None
        category = insight_category_for(day, str(fresh["slug"]))
        return {
            "slug": str(fresh["slug"]),
            "category": category,
            "text": texts[category],
            "day": day,
        }
