from __future__ import annotations

import json
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.schemas import CircleResponse
from app.services.circles_service import _circle_response_from_row, hoby_meta_for_ritual_type

_TIME_PREFIX = "[TIME_SUGGEST]"
_PLACE_PREFIX = "[PLACE_SUGGEST]"


def _parse_place_suggest(body: str) -> dict[str, str | None] | None:
    trimmed = body.strip()
    if not trimmed.startswith(_PLACE_PREFIX):
        return None
    raw = trimmed[len(_PLACE_PREFIX) :]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    name = str(data.get("name") or "").strip()
    if not name:
        return None
    city = str(data.get("city") or "").strip()
    address = str(data.get("address") or "").strip()
    return {"name": name, "city": city or None, "address": address or None}


def is_time_suggestion_body(body: str) -> bool:
    return body.strip().startswith(_TIME_PREFIX)


def is_suggestion_message_body(body: str) -> bool:
    trimmed = body.strip()
    return trimmed.startswith(_TIME_PREFIX) or trimmed.startswith(_PLACE_PREFIX)


async def apply_circle_meeting_place(
    conn: asyncpg.Connection,
    *,
    circle_id: UUID,
    name: str,
    city: str | None,
    address: str | None = None,
) -> None:
    mp = name.strip()
    if address and address.strip():
        mp = f"{name.strip()} — {address.strip()}"
    cn = city.strip() if city else None
    await conn.execute(
        """
        UPDATE circles
        SET meeting_place = $1,
            city_name = COALESCE($2, city_name),
            city = NULL
        WHERE id = $3
        """,
        mp,
        cn,
        circle_id,
    )


async def respond_to_circle_suggestion(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    message_id: UUID,
    accept: bool,
) -> CircleResponse | None:
    circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the circle organizer can respond to suggestions")

    row = await conn.fetchrow(
        """
        SELECT id, circle_id, body
        FROM circle_messages
        WHERE id = $1 AND circle_id = $2
        """,
        message_id,
        circle_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="message not found")

    if accept:
        place = _parse_place_suggest(str(row["body"] or ""))
        if place is None:
            raise HTTPException(status_code=400, detail="Message is not a place suggestion")
        async with conn.transaction():
            await apply_circle_meeting_place(
                conn,
                circle_id=circle_id,
                name=place["name"],
                city=place["city"],
                address=place["address"],
            )

    updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"])
    return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)
