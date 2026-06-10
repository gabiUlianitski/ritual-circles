from __future__ import annotations

from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.user_fields import user_display_label


async def _has_future_attendance(conn: asyncpg.Connection, user_id: UUID, circle_id: UUID) -> bool:
    row = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1
          FROM attendance a
          JOIN sessions s ON s.id = a."sessionId"
          WHERE s."circleId" = $1
            AND a."userId" = $2
            AND s."dateTime" >= NOW()
        )
        """,
        circle_id,
        user_id,
    )
    return bool(row)


async def ensure_circle_member(conn: asyncpg.Connection, user_id: UUID, circle_id: UUID) -> None:
    if not await _has_future_attendance(conn, user_id, circle_id):
        raise HTTPException(status_code=403, detail="Not a member of this circle")


def _raise_chat_unavailable(exc: Exception) -> None:
    raise HTTPException(
        status_code=503,
        detail=(
            "Circle chat is not initialized on the server database. "
            "Apply migration db/migrations/008_circle_messages.sql, then retry."
        ),
    ) from exc


async def list_messages(
    conn: asyncpg.Connection,
    circle_id: UUID,
    user_id: UUID,
    limit: int,
) -> list[dict]:
    await ensure_circle_member(conn, user_id, circle_id)
    try:
        rows = await conn.fetch(
            """
            SELECT m.id, m.circle_id, m.user_id,
                   u.user_name, u.first_name, u.last_name,
                   m.body, m.created_at
            FROM circle_messages m
            JOIN users u ON u.id = m.user_id
            WHERE m.circle_id = $1
            ORDER BY m.created_at ASC
            LIMIT $2
            """,
            circle_id,
            limit,
        )
    except asyncpg.exceptions.UndefinedTableError as e:
        _raise_chat_unavailable(e)
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": str(r["id"]),
                "circleId": str(r["circle_id"]),
                "userId": str(r["user_id"]),
                "authorName": user_display_label(
                    user_name=r["user_name"],
                    first_name=r["first_name"],
                    last_name=r["last_name"],
                ),
                "body": r["body"],
                "createdAt": r["created_at"],
            }
        )
    return out


async def create_message(
    conn: asyncpg.Connection,
    circle_id: UUID,
    user_id: UUID,
    body: str,
) -> dict:
    from app.services.circle_suggestions import is_suggestion_message_body

    await ensure_circle_member(conn, user_id, circle_id)
    circle = await conn.fetchrow('SELECT created_by FROM circles WHERE id = $1', circle_id)
    if (
        circle
        and circle["created_by"] == user_id
        and is_suggestion_message_body(body)
    ):
        raise HTTPException(
            status_code=403,
            detail="Circle organizer updates schedule and place on Next Sessions; members can suggest in chat",
        )
    msg_id = uuid4()
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO circle_messages (id, circle_id, user_id, body)
            VALUES ($1, $2, $3, $4)
            RETURNING id, circle_id, user_id, body, created_at
            """,
            msg_id,
            circle_id,
            user_id,
            body,
        )
    except asyncpg.exceptions.UndefinedTableError as e:
        _raise_chat_unavailable(e)
    except asyncpg.exceptions.CheckViolationError as e:
        raise HTTPException(status_code=400, detail="Message body is invalid") from e
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to save message")
    author = await conn.fetchrow(
        "SELECT user_name, first_name, last_name FROM users WHERE id = $1",
        user_id,
    )
    author_name = (
        user_display_label(
            user_name=author["user_name"],
            first_name=author["first_name"],
            last_name=author["last_name"],
        )
        if author
        else "Unknown"
    )
    return {
        "id": str(row["id"]),
        "circleId": str(row["circle_id"]),
        "userId": str(row["user_id"]),
        "authorName": author_name,
        "body": row["body"],
        "createdAt": row["created_at"],
    }
