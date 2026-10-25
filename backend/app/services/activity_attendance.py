"""Who actually came, recorded after an Activity or one recurring date has ended.

The RSVP (status going | cancelled) is never changed here. The outcome lives in attendance_status,
starts as 'pending', and only the Activity creator or the Circle owner sets it. Nothing is inferred
from dates, nothing is notified, and Circle membership is untouched.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.schemas import ActivityAttendanceEntry, ActivityResponse
from app.user_fields import user_display_label

_NOT_ENDED = "This activity hasn't ended yet"
_NOT_GOING = "This participant was not going"
_CANCELLED = "Attendance can't be recorded for a cancelled activity"
_DATE_CANCELLED = "Attendance can't be recorded for a date that did not happen"
_NO_PARTICIPANT = "participant not found"
_ORGANIZERS_ONLY = "Only the activity creator or circle owner can record attendance"
_RECORDABLE_ACTIVITY = ("open", "confirmed", "completed")
_RECORDABLE_DATE = ("open", "confirmed", "completed")


def ended(row: asyncpg.Record) -> bool:
    moment = row["end_at"] or row["start_at"]
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= datetime.now(timezone.utc)


def activity_recordable(activity: asyncpg.Record) -> bool:
    return (
        activity["recurrence_type"] != "recurring"
        and activity["status"] in _RECORDABLE_ACTIVITY
        and ended(activity)
    )


def date_recordable(occurrence: asyncpg.Record) -> bool:
    return occurrence["status"] in _RECORDABLE_DATE and ended(occurrence)


def _entry(row: asyncpg.Record) -> ActivityAttendanceEntry:
    return ActivityAttendanceEntry(
        participantId=str(row["id"]),
        name=user_display_label(user_name=row["user_name"], first_name=row["first_name"], last_name=row["last_name"]),
        avatarUrl=row["avatar_url"],
        attendanceStatus=row["attendance_status"],
    )


async def activity_roster(conn: asyncpg.Connection, activity_id: UUID) -> list[ActivityAttendanceEntry]:
    rows = await conn.fetch(
        """
        SELECT p.id, p.attendance_status, u.first_name, u.last_name, u.user_name, u.avatar_url
        FROM activity_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.activity_id = $1 AND p.status = 'going'
        ORDER BY p.joined_at ASC, p.id ASC
        """,
        activity_id,
    )
    return [_entry(row) for row in rows]


async def date_rosters(conn: asyncpg.Connection, occurrence_ids: list[UUID]) -> dict[UUID, list[ActivityAttendanceEntry]]:
    rosters: dict[UUID, list[ActivityAttendanceEntry]] = {item: [] for item in occurrence_ids}
    if not occurrence_ids:
        return rosters
    rows = await conn.fetch(
        """
        SELECT p.id, p.occurrence_id, p.attendance_status, u.first_name, u.last_name, u.user_name, u.avatar_url
        FROM activity_occurrence_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.occurrence_id = ANY($1::uuid[]) AND p.status = 'going'
        ORDER BY p.joined_at ASC, p.id ASC
        """,
        occurrence_ids,
    )
    for row in rows:
        rosters[row["occurrence_id"]].append(_entry(row))
    return rosters


async def _organizer_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> asyncpg.Record:
    activity = await conn.fetchrow("SELECT * FROM activities WHERE id = $1 FOR UPDATE", activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="activity not found")
    owner = await conn.fetchval("SELECT created_by FROM circles WHERE id = $1", activity["circle_id"])
    if user_id not in (activity["created_by"], owner):
        raise HTTPException(status_code=403, detail=_ORGANIZERS_ONLY)
    return activity


def _require_going(participant: asyncpg.Record | None) -> None:
    if participant is None:
        raise HTTPException(status_code=404, detail=_NO_PARTICIPANT)
    if participant["status"] != "going":
        raise HTTPException(status_code=400, detail=_NOT_GOING)


async def _refreshed(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityResponse:
    from app.services.activities_service import get_activity

    return await get_activity(conn, user_id=user_id, activity_id=activity_id)


async def record_attendance(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, participant_id: UUID, attendance_status: str
) -> ActivityResponse:
    """Set or correct one going participant's outcome on a one-time Activity that has ended."""
    async with conn.transaction():
        activity = await _organizer_activity(conn, user_id=user_id, activity_id=activity_id)
        if activity["recurrence_type"] == "recurring":
            raise HTTPException(status_code=400, detail="Choose a date.")
        if activity["status"] == "cancelled":
            raise HTTPException(status_code=400, detail=_CANCELLED)
        if not activity_recordable(activity):
            raise HTTPException(status_code=400, detail=_NOT_ENDED)
        participant = await conn.fetchrow(
            "SELECT id, status FROM activity_participants WHERE id = $1 AND activity_id = $2 FOR UPDATE",
            participant_id,
            activity_id,
        )
        _require_going(participant)
        await conn.execute(
            "UPDATE activity_participants SET attendance_status = $2, updated_at = NOW() WHERE id = $1",
            participant_id,
            attendance_status,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def record_date_attendance(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity_id: UUID,
    occurrence_id: UUID,
    participant_id: UUID,
    attendance_status: str,
) -> ActivityResponse:
    """Set or correct one going participant's outcome on one recurring date. Other dates are unchanged."""
    async with conn.transaction():
        activity = await _organizer_activity(conn, user_id=user_id, activity_id=activity_id)
        if activity["recurrence_type"] != "recurring":
            raise HTTPException(status_code=400, detail="This activity has one date")
        occurrence = await conn.fetchrow(
            "SELECT * FROM activity_occurrences WHERE id = $1 AND activity_id = $2",
            occurrence_id,
            activity_id,
        )
        if not occurrence:
            raise HTTPException(status_code=404, detail="activity not found")
        if occurrence["status"] == "cancelled":
            raise HTTPException(status_code=400, detail=_DATE_CANCELLED)
        if not date_recordable(occurrence):
            raise HTTPException(status_code=400, detail=_NOT_ENDED)
        participant = await conn.fetchrow(
            """
            SELECT id, status FROM activity_occurrence_participants
            WHERE id = $1 AND occurrence_id = $2
            FOR UPDATE
            """,
            participant_id,
            occurrence_id,
        )
        _require_going(participant)
        await conn.execute(
            "UPDATE activity_occurrence_participants SET attendance_status = $2, updated_at = NOW() WHERE id = $1",
            participant_id,
            attendance_status,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)
