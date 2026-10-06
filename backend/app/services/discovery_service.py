"""One hobby spotlight for Today's Discovery. Fails open: the client has a catalog fallback."""

from __future__ import annotations

import logging
import re

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
