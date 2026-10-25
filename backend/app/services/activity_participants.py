"""Going / cancelled participation for one activity. Independent of circle membership."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.schemas import ActivityGoingPerson, ActivityParticipation, ActivityResponse
from app.services.circle_members import is_active_member
from app.user_fields import user_display_label

GOING = "going"
CANCELLED = "cancelled"


async def places_in_use(conn: asyncpg.Connection, activity_id: UUID) -> int:
    """Largest number of people going on the activity or on any one of its dates."""
    parent = await going_count(conn, activity_id)
    peak = await conn.fetchval(
        """
        SELECT COALESCE(MAX(n), 0)::int
        FROM (
          SELECT COUNT(*)::int AS n
          FROM activity_occurrence_participants p
          JOIN activity_occurrences o ON o.id = p.occurrence_id
          WHERE o.activity_id = $1 AND p.status = $2
          GROUP BY p.occurrence_id
        ) counts
        """,
        activity_id,
        GOING,
    )
    return max(parent, int(peak or 0))


async def going_count(conn: asyncpg.Connection, activity_id: UUID) -> int:
    value = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM activity_participants
        WHERE activity_id = $1 AND status = $2
        """,
        activity_id,
        GOING,
    )
    return int(value or 0)


def _summary(
    *,
    row: asyncpg.Record,
    going: int,
    mine: str | None,
    people: list[ActivityGoingPerson],
    confirmation_required: bool = False,
) -> ActivityParticipation:
    size = int(row["group_size"])
    remaining = max(size - going, 0)
    status = mine if mine in (GOING, CANCELLED) else None
    return ActivityParticipation(
        goingCount=going,
        groupSize=size,
        remainingPlaces=remaining,
        isFull=going >= size,
        currentUserStatus=status,
        confirmationRequired=bool(confirmation_required) and status == GOING,
        going=people,
    )


async def _people(conn: asyncpg.Connection, activity_id: UUID) -> list[ActivityGoingPerson]:
    rows = await conn.fetch(
        """
        SELECT u.first_name, u.last_name, u.user_name, u.avatar_url
        FROM activity_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.activity_id = $1 AND p.status = $2
        ORDER BY p.joined_at ASC, p.id ASC
        """,
        activity_id,
        GOING,
    )
    return [
        ActivityGoingPerson(
            name=user_display_label(
                user_name=row["user_name"],
                first_name=row["first_name"],
                last_name=row["last_name"],
            ),
            avatarUrl=row["avatar_url"],
        )
        for row in rows
    ]


async def summary_for(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    row: asyncpg.Record,
    include_people: bool,
) -> ActivityParticipation:
    activity_id = row["id"]
    going = await going_count(conn, activity_id)
    mine = await conn.fetchrow(
        """
        SELECT status, confirmation_required
        FROM activity_participants
        WHERE activity_id = $1 AND user_id = $2
        """,
        activity_id,
        user_id,
    )
    people = await _people(conn, activity_id) if include_people else []
    return _summary(
        row=row,
        going=going,
        mine=None if mine is None else mine["status"],
        people=people,
        confirmation_required=False if mine is None else bool(mine["confirmation_required"]),
    )


async def summaries_for(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    rows: list[asyncpg.Record],
) -> dict[UUID, ActivityParticipation]:
    ids = [row["id"] for row in rows]
    counts: dict[UUID, int] = {}
    mine: dict[UUID, tuple[str, bool]] = {}
    if ids:
        for item in await conn.fetch(
            """
            SELECT activity_id, COUNT(*)::int AS n
            FROM activity_participants
            WHERE activity_id = ANY($1::uuid[]) AND status = $2
            GROUP BY activity_id
            """,
            ids,
            GOING,
        ):
            counts[item["activity_id"]] = int(item["n"])
        for item in await conn.fetch(
            """
            SELECT activity_id, status, confirmation_required
            FROM activity_participants
            WHERE activity_id = ANY($1::uuid[]) AND user_id = $2
            """,
            ids,
            user_id,
        ):
            mine[item["activity_id"]] = (item["status"], bool(item["confirmation_required"]))
    return {
        row["id"]: _summary(
            row=row,
            going=counts.get(row["id"], 0),
            mine=None if row["id"] not in mine else mine[row["id"]][0],
            people=[],
            confirmation_required=False if row["id"] not in mine else mine[row["id"]][1],
        )
        for row in rows
    }


async def _locked_activity(conn: asyncpg.Connection, activity_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1 FOR UPDATE", activity_id)
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    return row


async def _circle_access(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> asyncpg.Record:
    circle = await conn.fetchrow("SELECT id, created_by FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] == user_id:
        return circle
    if await is_active_member(conn, user_id=user_id, circle_id=circle_id):
        return circle
    raise HTTPException(status_code=403, detail="Only an active circle member can use activities")


def _visible(row: asyncpg.Record, circle: asyncpg.Record, user_id: UUID) -> None:
    if row["status"] == "draft" and row["created_by"] != user_id and circle["created_by"] != user_id:
        raise HTTPException(status_code=404, detail="activity not found")


def _ended(row: asyncpg.Record) -> bool:
    moment = row["end_at"] or row["start_at"]
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= datetime.now(timezone.utc)


async def join_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityParticipation:
    """Reserve one place. Already-going is unchanged. A cancelled row is reactivated."""
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle_access(conn, user_id=user_id, circle_id=row["circle_id"])
        _visible(row, circle, user_id)
        if row["recurrence_type"] != "one_time":
            raise HTTPException(status_code=400, detail="Participation is not available for a recurring activity yet")
        if row["status"] not in ("open", "confirmed"):
            raise HTTPException(status_code=400, detail="This activity is not open")
        if _ended(row):
            raise HTTPException(status_code=400, detail="This activity has already ended")
        current = await conn.fetchval(
            """
            SELECT status
            FROM activity_participants
            WHERE activity_id = $1 AND user_id = $2
            """,
            activity_id,
            user_id,
        )
        if current != GOING:
            used = await going_count(conn, activity_id)
            if used >= int(row["group_size"]):
                raise HTTPException(status_code=409, detail="This activity is full")
            await conn.execute(
                """
                INSERT INTO activity_participants (id, activity_id, user_id, status, joined_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (activity_id, user_id) DO UPDATE
                SET status = $4,
                    confirmation_required = FALSE,
                    joined_at = CASE
                      WHEN activity_participants.status = $5 THEN NOW()
                      ELSE activity_participants.joined_at
                    END,
                    updated_at = NOW()
                """,
                uuid4(),
                activity_id,
                user_id,
                GOING,
                CANCELLED,
            )
        return await summary_for(conn, user_id=user_id, row=row, include_people=True)


async def leave_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityParticipation:
    """Free a place. Leaving again, or leaving without a place, changes nothing."""
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle_access(conn, user_id=user_id, circle_id=row["circle_id"])
        _visible(row, circle, user_id)
        if row["recurrence_type"] != "one_time":
            raise HTTPException(status_code=400, detail="Participation is not available for a recurring activity yet")
        if row["status"] not in ("open", "confirmed"):
            raise HTTPException(status_code=400, detail="This activity is not open")
        await conn.execute(
            """
            UPDATE activity_participants
            SET status = $3, confirmation_required = FALSE, updated_at = NOW()
            WHERE activity_id = $1 AND user_id = $2 AND status = $4
            """,
            activity_id,
            user_id,
            CANCELLED,
            GOING,
        )
        return await summary_for(conn, user_id=user_id, row=row, include_people=True)


def _person(row: asyncpg.Record) -> ActivityGoingPerson:
    return ActivityGoingPerson(
        name=user_display_label(
            user_name=row["user_name"],
            first_name=row["first_name"],
            last_name=row["last_name"],
        ),
        avatarUrl=row["avatar_url"],
    )


async def summaries_for_occurrences(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity: asyncpg.Record,
    occurrences: list[asyncpg.Record],
    include_people: bool,
) -> dict[UUID, ActivityParticipation]:
    ids = [item["id"] for item in occurrences]
    counts: dict[UUID, int] = {}
    mine: dict[UUID, tuple[str, bool]] = {}
    people: dict[UUID, list[ActivityGoingPerson]] = {}
    if ids:
        for item in await conn.fetch(
            """
            SELECT occurrence_id, COUNT(*)::int AS n
            FROM activity_occurrence_participants
            WHERE occurrence_id = ANY($1::uuid[]) AND status = $2
            GROUP BY occurrence_id
            """,
            ids,
            GOING,
        ):
            counts[item["occurrence_id"]] = int(item["n"])
        for item in await conn.fetch(
            """
            SELECT occurrence_id, status, confirmation_required
            FROM activity_occurrence_participants
            WHERE occurrence_id = ANY($1::uuid[]) AND user_id = $2
            """,
            ids,
            user_id,
        ):
            mine[item["occurrence_id"]] = (item["status"], bool(item["confirmation_required"]))
        if include_people:
            for item in await conn.fetch(
                """
                SELECT p.occurrence_id, u.first_name, u.last_name, u.user_name, u.avatar_url
                FROM activity_occurrence_participants p
                JOIN users u ON u.id = p.user_id
                WHERE p.occurrence_id = ANY($1::uuid[]) AND p.status = $2
                ORDER BY p.joined_at ASC, p.id ASC
                """,
                ids,
                GOING,
            ):
                people.setdefault(item["occurrence_id"], []).append(_person(item))
    return {
        item["id"]: _summary(
            row=activity,
            going=counts.get(item["id"], 0),
            mine=None if item["id"] not in mine else mine[item["id"]][0],
            people=people.get(item["id"], []),
            confirmation_required=False if item["id"] not in mine else mine[item["id"]][1],
        )
        for item in occurrences
    }


async def summaries_for_occurrences_by_activity(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activities: list[asyncpg.Record],
    occurrences: list[asyncpg.Record],
) -> dict[UUID, ActivityParticipation]:
    """Participant summaries for dates across a circle's activity list, in two queries."""
    ids = [item["id"] for item in occurrences]
    counts: dict[UUID, int] = {}
    mine: dict[UUID, tuple[str, bool]] = {}
    if ids:
        for item in await conn.fetch(
            """
            SELECT occurrence_id, COUNT(*)::int AS n
            FROM activity_occurrence_participants
            WHERE occurrence_id = ANY($1::uuid[]) AND status = $2
            GROUP BY occurrence_id
            """,
            ids,
            GOING,
        ):
            counts[item["occurrence_id"]] = int(item["n"])
        for item in await conn.fetch(
            """
            SELECT occurrence_id, status, confirmation_required
            FROM activity_occurrence_participants
            WHERE occurrence_id = ANY($1::uuid[]) AND user_id = $2
            """,
            ids,
            user_id,
        ):
            mine[item["occurrence_id"]] = (item["status"], bool(item["confirmation_required"]))
    by_activity = {item["id"]: item for item in activities}
    return {
        item["id"]: _summary(
            row=by_activity[item["activity_id"]],
            going=counts.get(item["id"], 0),
            mine=None if item["id"] not in mine else mine[item["id"]][0],
            people=[],
            confirmation_required=False if item["id"] not in mine else mine[item["id"]][1],
        )
        for item in occurrences
    }


async def _open_recurring_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> asyncpg.Record:
    row = await _locked_activity(conn, activity_id)
    circle = await _circle_access(conn, user_id=user_id, circle_id=row["circle_id"])
    _visible(row, circle, user_id)
    if row["recurrence_type"] != "recurring":
        raise HTTPException(status_code=400, detail="This activity has one date")
    if row["status"] not in ("open", "confirmed"):
        raise HTTPException(status_code=400, detail="This date is no longer open")
    return row


async def _ready_occurrence(
    conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID
) -> asyncpg.Record:
    item = await conn.fetchrow(
        """
        SELECT * FROM activity_occurrences
        WHERE id = $1 AND activity_id = $2
        FOR UPDATE
        """,
        occurrence_id,
        activity_id,
    )
    if not item:
        raise HTTPException(status_code=404, detail="activity not found")
    if item["status"] not in ("open", "confirmed"):
        raise HTTPException(status_code=400, detail="This date is no longer open")
    if _ended(item):
        raise HTTPException(status_code=400, detail="This date has ended")
    return item


async def _refreshed(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityResponse:
    from app.services.activities_service import get_activity

    return await get_activity(conn, user_id=user_id, activity_id=activity_id)


async def join_occurrence(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, occurrence_id: UUID
) -> ActivityResponse:
    """Reserve one place on one date. Other dates and the parent activity stay unchanged."""
    async with conn.transaction():
        activity = await _open_recurring_activity(conn, user_id=user_id, activity_id=activity_id)
        await _ready_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
        current = await conn.fetchval(
            """
            SELECT status
            FROM activity_occurrence_participants
            WHERE occurrence_id = $1 AND user_id = $2
            """,
            occurrence_id,
            user_id,
        )
        if current != GOING:
            used = await conn.fetchval(
                """
                SELECT COUNT(*)::int
                FROM activity_occurrence_participants
                WHERE occurrence_id = $1 AND status = $2
                """,
                occurrence_id,
                GOING,
            )
            if int(used or 0) >= int(activity["group_size"]):
                raise HTTPException(status_code=409, detail="This date is full")
            await conn.execute(
                """
                INSERT INTO activity_occurrence_participants (id, occurrence_id, user_id, status, joined_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (occurrence_id, user_id) DO UPDATE
                SET status = $4,
                    confirmation_required = FALSE,
                    joined_at = CASE
                      WHEN activity_occurrence_participants.status = $5 THEN NOW()
                      ELSE activity_occurrence_participants.joined_at
                    END,
                    updated_at = NOW()
                """,
                uuid4(),
                occurrence_id,
                user_id,
                GOING,
                CANCELLED,
            )
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def leave_occurrence(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, occurrence_id: UUID
) -> ActivityResponse:
    """Free one place on one date. The row stays, marked cancelled."""
    async with conn.transaction():
        await _open_recurring_activity(conn, user_id=user_id, activity_id=activity_id)
        await _ready_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
        await conn.execute(
            """
            UPDATE activity_occurrence_participants
            SET status = $3, confirmation_required = FALSE, updated_at = NOW()
            WHERE occurrence_id = $1 AND user_id = $2 AND status = $4
            """,
            occurrence_id,
            user_id,
            CANCELLED,
            GOING,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def reconfirm_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityResponse:
    """Clear the reconfirmation flag for this person's place. The row stays going."""
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle_access(conn, user_id=user_id, circle_id=row["circle_id"])
        _visible(row, circle, user_id)
        if row["recurrence_type"] != "one_time":
            raise HTTPException(status_code=400, detail="Choose a date.")
        updated = await conn.execute(
            """
            UPDATE activity_participants
            SET confirmation_required = FALSE, updated_at = NOW()
            WHERE activity_id = $1 AND user_id = $2 AND status = $3
            """,
            activity_id,
            user_id,
            GOING,
        )
        if not str(updated).endswith("1"):
            raise HTTPException(status_code=400, detail="Join the activity before confirming.")
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def reconfirm_occurrence(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, occurrence_id: UUID
) -> ActivityResponse:
    """Clear the reconfirmation flag for this date only."""
    async with conn.transaction():
        await _open_recurring_activity(conn, user_id=user_id, activity_id=activity_id)
        await _ready_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
        updated = await conn.execute(
            """
            UPDATE activity_occurrence_participants
            SET confirmation_required = FALSE, updated_at = NOW()
            WHERE occurrence_id = $1 AND user_id = $2 AND status = $3
            """,
            occurrence_id,
            user_id,
            GOING,
        )
        if not str(updated).endswith("1"):
            raise HTTPException(status_code=400, detail="Join this date before confirming.")
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)
