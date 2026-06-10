from __future__ import annotations

from uuid import UUID

import asyncpg


async def get_next_session_for_user(conn: asyncpg.Connection, *, user_id: UUID):
    return await conn.fetchrow(
        """
        SELECT s.*
        FROM sessions s
        JOIN attendance a ON a."sessionId" = s.id
        WHERE a."userId" = $1
          AND s."dateTime" >= NOW()
        ORDER BY s."dateTime" ASC
        LIMIT 1
        """,
        user_id,
    )


async def list_future_sessions_for_user(conn: asyncpg.Connection, *, user_id: UUID, limit: int = 6):
    return await conn.fetch(
        """
        SELECT s.*
        FROM sessions s
        JOIN attendance a ON a."sessionId" = s.id
        WHERE a."userId" = $1
          AND s."dateTime" >= NOW()
        ORDER BY s."dateTime" ASC
        LIMIT $2
        """,
        user_id,
        limit,
    )

