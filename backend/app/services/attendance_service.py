from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.schemas import AttendanceStatus


async def update_attendance(
    conn: asyncpg.Connection, *, user_id: UUID, session_id: UUID, status: AttendanceStatus
):
    row = await conn.fetchrow(
        """
        UPDATE attendance
        SET status = $3,
            updated_at = NOW()
        WHERE "userId" = $1 AND "sessionId" = $2
        RETURNING "userId", "sessionId", status, updated_at
        """,
        user_id,
        session_id,
        status,
    )
    if not row:
        raise HTTPException(status_code=404, detail="attendance row not found")
    return row

