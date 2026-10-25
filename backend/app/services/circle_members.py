"""Circle community membership. Independent of session attendance."""

from __future__ import annotations

from uuid import UUID, uuid4

import asyncpg

ACTIVE = "active"
LEFT = "left"


async def is_active_member(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> bool:
    found = await conn.fetchval(
        """
        SELECT 1
        FROM circle_members
        WHERE circle_id = $1 AND user_id = $2 AND status = $3
        """,
        circle_id,
        user_id,
        ACTIVE,
    )
    return found is not None


async def activate_member(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> None:
    """Create an active membership, or reactivate the existing row after a leave."""
    await conn.execute(
        """
        INSERT INTO circle_members (id, circle_id, user_id, status, joined_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (circle_id, user_id) DO UPDATE
        SET status = $4,
            joined_at = CASE
              WHEN circle_members.status = $5 THEN NOW()
              ELSE circle_members.joined_at
            END,
            updated_at = NOW()
        """,
        uuid4(),
        circle_id,
        user_id,
        ACTIVE,
        LEFT,
    )


async def leave_member(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> bool:
    """Mark the membership left. Does not change session attendance. Returns whether a row changed."""
    result = await conn.execute(
        """
        UPDATE circle_members
        SET status = $3, updated_at = NOW()
        WHERE circle_id = $1 AND user_id = $2 AND status = $4
        """,
        circle_id,
        user_id,
        LEFT,
        ACTIVE,
    )
    return result.endswith("1")
