"""Ensure circles keep enough upcoming sessions (V1 product rule: 4–6 future)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg

from app.services.time_utils import next_session_datetime_after


async def ensure_future_sessions_for_user(conn: asyncpg.Connection, *, user_id: UUID) -> None:
    """For every circle this user has ever had attendance in, top up future sessions if low."""
    rows = await conn.fetch(
        """
        SELECT DISTINCT s."circleId" AS cid
        FROM attendance a
        JOIN sessions s ON s.id = a."sessionId"
        WHERE a."userId" = $1
        """,
        user_id,
    )
    for r in rows:
        await ensure_future_sessions_for_circle(conn, circle_id=r["cid"])


async def ensure_future_sessions_for_circle(conn: asyncpg.Connection, *, circle_id: UUID) -> None:
    async with conn.transaction():
        lock = await conn.fetchrow('SELECT id FROM circles WHERE id = $1 FOR UPDATE', circle_id)
        if not lock:
            return

        future_ct = await conn.fetchval(
            """
            SELECT COUNT(*)::int
            FROM sessions
            WHERE "circleId" = $1
              AND "dateTime" >= NOW()
            """,
            circle_id,
        )
        if future_ct is None:
            return
        if int(future_ct) >= 4:
            return

        circle = await conn.fetchrow(
            """
            SELECT modality,
                   NULLIF(TRIM(COALESCE(meeting_place, city)), '') AS meeting_line,
                   "recurringTime",
                   COALESCE(is_recurring, true) AS is_recurring
            FROM circles
            WHERE id = $1
            """,
            circle_id,
        )
        if not circle:
            return
        if not bool(circle["is_recurring"]):
            return

        max_row = await conn.fetchrow(
            """
            SELECT MAX("dateTime") AS mx
            FROM sessions
            WHERE "circleId" = $1
            """,
            circle_id,
        )
        max_dt: datetime | None = max_row["mx"] if max_row else None
        if max_dt is None:
            return

        loc_row = await conn.fetchrow(
            """
            SELECT "locationOrLink"
            FROM sessions
            WHERE "circleId" = $1
            ORDER BY "dateTime" DESC
            LIMIT 1
            """,
            circle_id,
        )
        location_or_link = loc_row["locationOrLink"] if loc_row else (
            "https://example.com/meeting"
            if circle["modality"] == "online"
            else (circle["meeting_line"] or "TBD")
        )

        member_rows = await conn.fetch(
            """
            SELECT DISTINCT a."userId" AS uid
            FROM attendance a
            JOIN sessions s ON s.id = a."sessionId"
            WHERE s."circleId" = $1
              AND s."dateTime" >= NOW()
            """,
            circle_id,
        )
        member_ids: list[UUID] = [r["uid"] for r in member_rows]
        if not member_ids:
            creator = await conn.fetchrow('SELECT created_by FROM circles WHERE id = $1', circle_id)
            cb = creator["created_by"] if creator and creator.get("created_by") else None
            if cb:
                member_ids = [cb]
            else:
                return

        now = datetime.now(tz=timezone.utc)
        if max_dt.tzinfo is None:
            max_dt = max_dt.replace(tzinfo=timezone.utc)

        recurring = str(circle["recurringTime"] or "")
        next_dt = next_session_datetime_after(max_dt, recurring)
        while next_dt < now:
            next_dt = next_session_datetime_after(next_dt, recurring)

        target_future = 6
        while True:
            fc = await conn.fetchval(
                """
                SELECT COUNT(*)::int
                FROM sessions
                WHERE "circleId" = $1
                  AND "dateTime" >= NOW()
                """,
                circle_id,
            )
            if fc is not None and int(fc) >= target_future:
                break

            session_id = uuid4()
            await conn.execute(
                """
                INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
                VALUES ($1, $2, $3, $4)
                """,
                session_id,
                circle_id,
                next_dt.astimezone(timezone.utc),
                location_or_link,
            )
            for uid in member_ids:
                await conn.execute(
                    """
                    INSERT INTO attendance ("userId", "sessionId", status)
                    VALUES ($1, $2, 'not_attending')
                    ON CONFLICT ("userId", "sessionId") DO NOTHING
                    """,
                    uid,
                    session_id,
                )
            next_dt = next_session_datetime_after(next_dt, recurring)
