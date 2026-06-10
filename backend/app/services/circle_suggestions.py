from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.schemas import CircleResponse
from app.services.circles_service import _circle_response_from_row, hoby_meta_for_ritual_type
from app.services.time_utils import next_session_datetime_after

_TIME_PREFIX = "[TIME_SUGGEST]"
_PLACE_PREFIX = "[PLACE_SUGGEST]"
_WD = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _parse_time_suggest(body: str) -> datetime | None:
    trimmed = body.strip()
    if not trimmed.startswith(_TIME_PREFIX):
        return None
    iso = trimmed[len(_TIME_PREFIX) :].strip()
    if not iso:
        return None
    try:
        when = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(timezone.utc)


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


def _recurring_from_utc(when: datetime) -> str:
    return f"{_WD[when.weekday()]} {when.hour:02d}:{when.minute:02d}"


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _reschedule_future_sessions(
    conn: asyncpg.Connection,
    *,
    circle_id: UUID,
    anchor: datetime,
    recurring_time: str,
) -> None:
    """Move every future session onto the new weekly schedule starting at anchor."""
    rows = await conn.fetch(
        """
        SELECT id
        FROM sessions
        WHERE "circleId" = $1
          AND "dateTime" >= NOW()
        ORDER BY "dateTime" ASC
        """,
        circle_id,
    )
    if not rows:
        raise HTTPException(status_code=409, detail="circle has no upcoming sessions")

    dt = _as_utc(anchor)
    for row in rows:
        await conn.execute(
            """
            UPDATE sessions
            SET "dateTime" = $1
            WHERE id = $2
            """,
            dt,
            row["id"],
        )
        dt = next_session_datetime_after(dt, recurring_time)


async def _trim_to_single_future_session(conn: asyncpg.Connection, *, circle_id: UUID) -> None:
    """Keep only the earliest future session; remove extras (one-time circles)."""
    rows = await conn.fetch(
        """
        SELECT id
        FROM sessions
        WHERE "circleId" = $1
          AND "dateTime" >= NOW()
        ORDER BY "dateTime" ASC
        """,
        circle_id,
    )
    for row in rows[1:]:
        await conn.execute("DELETE FROM sessions WHERE id = $1", row["id"])


def is_suggestion_message_body(body: str) -> bool:
    trimmed = body.strip()
    return trimmed.startswith(_TIME_PREFIX) or trimmed.startswith(_PLACE_PREFIX)


async def apply_circle_time_schedule(
    conn: asyncpg.Connection,
    *,
    circle_id: UUID,
    anchor: datetime,
    recurring_time: str,
    is_recurring: bool,
) -> None:
    rt = recurring_time.strip() or _recurring_from_utc(_as_utc(anchor))
    anchor_utc = _as_utc(anchor)

    if is_recurring:
        await _reschedule_future_sessions(
            conn,
            circle_id=circle_id,
            anchor=anchor_utc,
            recurring_time=rt,
        )
        await conn.execute(
            """
            UPDATE circles
            SET "recurringTime" = $1, is_recurring = true
            WHERE id = $2
            """,
            rt,
            circle_id,
        )
    else:
        next_row = await conn.fetchrow(
            """
            SELECT id
            FROM sessions
            WHERE "circleId" = $1
              AND "dateTime" >= NOW()
            ORDER BY "dateTime" ASC
            LIMIT 1
            """,
            circle_id,
        )
        if next_row:
            await conn.execute(
                """
                UPDATE sessions
                SET "dateTime" = $1
                WHERE id = $2
                """,
                anchor_utc,
                next_row["id"],
            )
        await _trim_to_single_future_session(conn, circle_id=circle_id)
        await conn.execute(
            """
            UPDATE circles
            SET "recurringTime" = $1, is_recurring = false
            WHERE id = $2
            """,
            rt,
            circle_id,
        )


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
    await conn.execute(
        """
        UPDATE sessions
        SET "locationOrLink" = $1
        WHERE "circleId" = $2
          AND "dateTime" >= NOW()
        """,
        mp,
        circle_id,
    )


async def modify_circle_schedule(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    first_session_at: datetime,
    recurring_time: str,
    is_recurring: bool,
) -> CircleResponse:
    circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the circle creator can modify the schedule")

    async with conn.transaction():
        await apply_circle_time_schedule(
            conn,
            circle_id=circle_id,
            anchor=first_session_at,
            recurring_time=recurring_time,
            is_recurring=is_recurring,
        )

    if is_recurring:
        from app.services.session_replenish import ensure_future_sessions_for_circle

        await ensure_future_sessions_for_circle(conn, circle_id=circle_id)

    updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"])
    return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)


async def modify_circle_meeting_place(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    name: str,
    city: str,
    address: str | None = None,
) -> CircleResponse:
    circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the circle creator can modify the meeting place")

    async with conn.transaction():
        await apply_circle_meeting_place(
            conn,
            circle_id=circle_id,
            name=name,
            city=city,
            address=address,
        )

    updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"])
    return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)


async def respond_to_circle_suggestion(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    message_id: UUID,
    accept: bool,
    first_session_at: datetime | None = None,
    recurring_time: str | None = None,
    is_recurring: bool | None = None,
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

    body = str(row["body"] or "")
    if not accept:
        updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
        hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"])
        return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)

    when = _parse_time_suggest(body)
    place = _parse_place_suggest(body) if when is None else None
    if when is None and place is None:
        raise HTTPException(status_code=400, detail="Message is not a time or place suggestion")

    recurring_flag = (
        bool(circle.get("is_recurring", True)) if is_recurring is None else is_recurring
        if when is not None
        else False
    )

    async with conn.transaction():
        if when is not None:
            anchor = _as_utc(first_session_at) if first_session_at is not None else when
            rt = (recurring_time or "").strip() or _recurring_from_utc(anchor)
            await apply_circle_time_schedule(
                conn,
                circle_id=circle_id,
                anchor=anchor,
                recurring_time=rt,
                is_recurring=recurring_flag,
            )
        elif place is not None:
            await apply_circle_meeting_place(
                conn,
                circle_id=circle_id,
                name=place["name"],
                city=place["city"],
                address=place["address"],
            )

    if accept and when is not None:
        recurring_flag = bool(circle.get("is_recurring", True)) if is_recurring is None else is_recurring
        if recurring_flag:
            from app.services.session_replenish import ensure_future_sessions_for_circle

            await ensure_future_sessions_for_circle(conn, circle_id=circle_id)

    updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"])
    return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)
