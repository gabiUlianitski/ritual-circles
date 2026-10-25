"""Transparent time and place suggestions for one activity, or one date of a recurring activity.

Creating or supporting a suggestion does not change the activity.
Only an accepted suggestion updates that one target.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from asyncpg.exceptions import UniqueViolationError
from fastapi import HTTPException

from app.schemas import ActivitySuggestion, ActivitySuggestionCreate
from app.services import activity_notifications as notifications
from app.user_fields import user_display_label

_UNAVAILABLE = "This suggestion is no longer available."
_CLOSED = "Suggestions are not available for this activity."


def _passed(moment: datetime) -> bool:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= datetime.now(timezone.utc)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = " ".join(value.strip().split())
    return text or None


def _target_live(row: asyncpg.Record) -> bool:
    if row["status"] not in ("open", "confirmed"):
        return False
    return not _passed(row["end_at"] or row["start_at"])


async def _lock_activity(conn: asyncpg.Connection, activity_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1 FOR UPDATE", activity_id)
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    return row


async def _gate(conn: asyncpg.Connection, *, user_id: UUID, activity: asyncpg.Record) -> tuple[asyncpg.Record, bool]:
    from app.services.activities_service import _circle, _require_member_or_owner

    circle = await _circle(conn, activity["circle_id"])
    await _require_member_or_owner(conn, user_id=user_id, circle=circle)
    editor = activity["created_by"] == user_id or circle["created_by"] == user_id
    if activity["status"] == "draft" and not editor:
        raise HTTPException(status_code=404, detail="activity not found")
    return circle, editor


def _require_editor(*, user_id: UUID, activity: asyncpg.Record, circle: asyncpg.Record) -> None:
    from app.services.activities_service import _require_editor as editor

    editor(user_id=user_id, activity=activity, circle=circle)


async def _lock_occurrence(
    conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID
) -> asyncpg.Record:
    row = await conn.fetchrow(
        """
        SELECT * FROM activity_occurrences
        WHERE id = $1 AND activity_id = $2
        FOR UPDATE
        """,
        occurrence_id,
        activity_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    return row


def _ensure_live_activity(activity: asyncpg.Record) -> None:
    """A cancelled or finished activity keeps its suggestions as history but takes no new actions."""
    if activity["status"] == "draft":
        raise HTTPException(status_code=400, detail="Publish the activity before suggesting a change.")
    if activity["status"] not in ("open", "confirmed"):
        raise HTTPException(status_code=400, detail=_CLOSED)


def _ensure_open_target(row: asyncpg.Record, *, date: bool) -> None:
    if row["status"] in ("cancelled", "completed", "draft") or not _target_live(row):
        if row["status"] == "draft":
            raise HTTPException(status_code=400, detail="Publish the activity before suggesting a change.")
        if _passed(row["end_at"] or row["start_at"]) and row["status"] in ("open", "confirmed"):
            detail = "This date has ended." if date else "This activity has already ended."
            raise HTTPException(status_code=400, detail=detail)
        raise HTTPException(status_code=400, detail=_CLOSED)


def _values(payload: ActivitySuggestionCreate) -> dict[str, object]:
    kind = payload.type
    note = _clean(payload.note)
    if note is not None and len(note) > 280:
        raise HTTPException(status_code=400, detail="Keep the note short.")
    if kind == "time":
        if payload.proposedStartAt is None:
            raise HTTPException(status_code=400, detail="Add a proposed start time.")
        if _clean(payload.proposedLocationName) or _clean(payload.proposedLocationAddress):
            raise HTTPException(status_code=400, detail="A time suggestion cannot include a place.")
        end = payload.proposedEndAt
        if end is not None and end <= payload.proposedStartAt:
            raise HTTPException(status_code=400, detail="End time needs to be after the start.")
        return {
            "type": "time",
            "proposed_start_at": payload.proposedStartAt,
            "proposed_end_at": end,
            "proposed_location_name": None,
            "proposed_location_address": None,
            "note": note,
        }
    name = _clean(payload.proposedLocationName)
    if not name:
        raise HTTPException(status_code=400, detail="Add a place name.")
    if payload.proposedStartAt is not None or payload.proposedEndAt is not None:
        raise HTTPException(status_code=400, detail="A place suggestion cannot include a time.")
    return {
        "type": "location",
        "proposed_start_at": None,
        "proposed_end_at": None,
        "proposed_location_name": name,
        "proposed_location_address": _clean(payload.proposedLocationAddress),
        "note": note,
    }


async def _duplicate(
    conn: asyncpg.Connection,
    *,
    activity_id: UUID,
    occurrence_id: UUID | None,
    user_id: UUID,
    values: dict[str, object],
) -> None:
    if values["type"] == "time":
        found = await conn.fetchval(
            """
            SELECT 1
            FROM activity_suggestions
            WHERE activity_id = $1
              AND occurrence_id IS NOT DISTINCT FROM $2
              AND created_by = $3
              AND status = 'open'
              AND type = 'time'
              AND proposed_start_at = $4
              AND proposed_end_at IS NOT DISTINCT FROM $5
            """,
            activity_id,
            occurrence_id,
            user_id,
            values["proposed_start_at"],
            values["proposed_end_at"],
        )
    else:
        found = await conn.fetchval(
            """
            SELECT 1
            FROM activity_suggestions
            WHERE activity_id = $1
              AND occurrence_id IS NOT DISTINCT FROM $2
              AND created_by = $3
              AND status = 'open'
              AND type = 'location'
              AND lower(btrim(proposed_location_name)) = lower(btrim($4))
              AND lower(btrim(COALESCE(proposed_location_address, ''))) = lower(btrim(COALESCE($5, '')))
            """,
            activity_id,
            occurrence_id,
            user_id,
            values["proposed_location_name"],
            values["proposed_location_address"],
        )
    if found:
        raise HTTPException(status_code=409, detail="You already suggested this.")


async def _insert(
    conn: asyncpg.Connection,
    *,
    activity_id: UUID,
    occurrence_id: UUID | None,
    user_id: UUID,
    values: dict[str, object],
) -> None:
    await _duplicate(
        conn,
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        user_id=user_id,
        values=values,
    )
    try:
        await conn.execute(
            """
            INSERT INTO activity_suggestions (
              id, activity_id, occurrence_id, created_by, type,
              proposed_start_at, proposed_end_at, proposed_location_name, proposed_location_address, note
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            uuid4(),
            activity_id,
            occurrence_id,
            user_id,
            values["type"],
            values["proposed_start_at"],
            values["proposed_end_at"],
            values["proposed_location_name"],
            values["proposed_location_address"],
            values["note"],
        )
    except UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="You already suggested this.") from exc


async def create_suggestion(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity_id: UUID,
    payload: ActivitySuggestionCreate,
) -> object:
    values = _values(payload)
    async with conn.transaction():
        activity = await _lock_activity(conn, activity_id)
        await _gate(conn, user_id=user_id, activity=activity)
        if activity["recurrence_type"] != "one_time":
            raise HTTPException(status_code=400, detail="Choose a date for this suggestion.")
        _ensure_open_target(activity, date=False)
        await _insert(conn, activity_id=activity_id, occurrence_id=None, user_id=user_id, values=values)
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def create_occurrence_suggestion(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity_id: UUID,
    occurrence_id: UUID,
    payload: ActivitySuggestionCreate,
) -> object:
    values = _values(payload)
    async with conn.transaction():
        activity = await _lock_activity(conn, activity_id)
        await _gate(conn, user_id=user_id, activity=activity)
        if activity["recurrence_type"] != "recurring":
            raise HTTPException(status_code=400, detail="This activity has one date.")
        _ensure_live_activity(activity)
        occurrence = await _lock_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
        _ensure_open_target(occurrence, date=True)
        await _insert(
            conn,
            activity_id=activity_id,
            occurrence_id=occurrence_id,
            user_id=user_id,
            values=values,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity_id)


async def _locked_suggestion(conn: asyncpg.Connection, suggestion_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("SELECT * FROM activity_suggestions WHERE id = $1 FOR UPDATE", suggestion_id)
    if not row:
        raise HTTPException(status_code=404, detail=_UNAVAILABLE)
    return row


async def _target_row(conn: asyncpg.Connection, suggestion: asyncpg.Record, activity: asyncpg.Record) -> asyncpg.Record:
    if suggestion["occurrence_id"] is None:
        if activity["recurrence_type"] != "one_time":
            raise HTTPException(status_code=400, detail=_UNAVAILABLE)
        return activity
    return await _lock_occurrence(
        conn, activity_id=activity["id"], occurrence_id=suggestion["occurrence_id"]
    )


def _sort_key(item: ActivitySuggestion, created: datetime, decided: datetime | None) -> tuple:
    if item.status == "open":
        return (0, -item.supportCount, -created.timestamp())
    moment = decided or created
    return (1, -moment.timestamp())


async def grouped_suggestions(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity: asyncpg.Record,
    is_editor: bool,
) -> tuple[list[ActivitySuggestion], dict[UUID, list[ActivitySuggestion]]]:
    rows = await conn.fetch(
        """
        SELECT s.*,
               u.first_name, u.last_name, u.user_name, u.avatar_url,
               (
                 SELECT COUNT(*)::int
                 FROM activity_suggestion_support sup
                 WHERE sup.suggestion_id = s.id
               ) AS support_count,
               EXISTS (
                 SELECT 1
                 FROM activity_suggestion_support sup
                 WHERE sup.suggestion_id = s.id AND sup.user_id = $2
               ) AS supported_by_me
        FROM activity_suggestions s
        JOIN users u ON u.id = s.created_by
        WHERE s.activity_id = $1
        """,
        activity["id"],
        user_id,
    )
    occurrences = await conn.fetch(
        """
        SELECT id, status, start_at, end_at
        FROM activity_occurrences
        WHERE activity_id = $1
        """,
        activity["id"],
    )
    series_live = activity["status"] in ("open", "confirmed")
    live = {item["id"]: series_live and _target_live(item) for item in occurrences}
    parent_live = _target_live(activity) and activity["recurrence_type"] == "one_time"
    parent: list[tuple[ActivitySuggestion, datetime, datetime | None]] = []
    grouped: dict[UUID, list[tuple[ActivitySuggestion, datetime, datetime | None]]] = {}
    for row in rows:
        occurrence_id = row["occurrence_id"]
        if occurrence_id is None:
            actionable_target = parent_live
        else:
            actionable_target = bool(live.get(occurrence_id))
        open_row = row["status"] == "open"
        item = ActivitySuggestion(
            id=str(row["id"]),
            activityId=str(row["activity_id"]),
            occurrenceId=None if occurrence_id is None else str(occurrence_id),
            type=row["type"],
            proposedStartAt=row["proposed_start_at"],
            proposedEndAt=row["proposed_end_at"],
            proposedLocationName=row["proposed_location_name"],
            proposedLocationAddress=row["proposed_location_address"],
            note=row["note"],
            status=row["status"],
            suggestedByName=user_display_label(
                user_name=row["user_name"],
                first_name=row["first_name"],
                last_name=row["last_name"],
            ),
            suggestedByAvatarUrl=row["avatar_url"],
            supportCount=int(row["support_count"]),
            supportedByMe=bool(row["supported_by_me"]),
            canSupport=open_row and actionable_target,
            canWithdraw=open_row and row["created_by"] == user_id,
            canDecide=open_row and actionable_target and is_editor,
            actionable=open_row and actionable_target,
            createdAt=row["created_at"],
        )
        packed = (item, row["created_at"], row["decided_at"])
        if occurrence_id is None:
            parent.append(packed)
        else:
            grouped.setdefault(occurrence_id, []).append(packed)

    def ordered(packed: list[tuple[ActivitySuggestion, datetime, datetime | None]]) -> list[ActivitySuggestion]:
        packed.sort(key=lambda entry: _sort_key(entry[0], entry[1], entry[2]))
        return [entry[0] for entry in packed]

    by_occurrence = {key: ordered(value) for key, value in grouped.items()}
    if activity["recurrence_type"] != "one_time":
        return [], by_occurrence
    return ordered(parent), by_occurrence


async def support_suggestion(conn: asyncpg.Connection, *, user_id: UUID, suggestion_id: UUID) -> object:
    async with conn.transaction():
        suggestion = await conn.fetchrow("SELECT activity_id FROM activity_suggestions WHERE id = $1", suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=_UNAVAILABLE)
        activity = await _lock_activity(conn, suggestion["activity_id"])
        await _gate(conn, user_id=user_id, activity=activity)
        current = await _locked_suggestion(conn, suggestion_id)
        if current["status"] != "open":
            raise HTTPException(status_code=400, detail=_UNAVAILABLE)
        _ensure_live_activity(activity)
        target = await _target_row(conn, current, activity)
        _ensure_open_target(target, date=current["occurrence_id"] is not None)
        await conn.execute(
            """
            INSERT INTO activity_suggestion_support (id, suggestion_id, user_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (suggestion_id, user_id) DO NOTHING
            """,
            uuid4(),
            suggestion_id,
            user_id,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity["id"])


async def remove_support(conn: asyncpg.Connection, *, user_id: UUID, suggestion_id: UUID) -> object:
    async with conn.transaction():
        suggestion = await conn.fetchrow("SELECT activity_id FROM activity_suggestions WHERE id = $1", suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=_UNAVAILABLE)
        activity = await _lock_activity(conn, suggestion["activity_id"])
        await _gate(conn, user_id=user_id, activity=activity)
        current = await _locked_suggestion(conn, suggestion_id)
        if current["status"] != "open":
            raise HTTPException(status_code=400, detail=_UNAVAILABLE)
        _ensure_live_activity(activity)
        target = await _target_row(conn, current, activity)
        _ensure_open_target(target, date=current["occurrence_id"] is not None)
        await conn.execute(
            """
            DELETE FROM activity_suggestion_support
            WHERE suggestion_id = $1 AND user_id = $2
            """,
            suggestion_id,
            user_id,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity["id"])


async def withdraw_suggestion(conn: asyncpg.Connection, *, user_id: UUID, suggestion_id: UUID) -> object:
    async with conn.transaction():
        suggestion = await conn.fetchrow("SELECT activity_id FROM activity_suggestions WHERE id = $1", suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=_UNAVAILABLE)
        activity = await _lock_activity(conn, suggestion["activity_id"])
        await _gate(conn, user_id=user_id, activity=activity)
        current = await _locked_suggestion(conn, suggestion_id)
        if current["created_by"] != user_id:
            raise HTTPException(status_code=403, detail="Only the person who suggested this can withdraw it.")
        if current["status"] != "open":
            raise HTTPException(status_code=400, detail=_UNAVAILABLE)
        await conn.execute(
            """
            UPDATE activity_suggestions
            SET status = 'withdrawn', decided_by = $2, decided_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'open'
            """,
            suggestion_id,
            user_id,
        )
    return await _refreshed(conn, user_id=user_id, activity_id=activity["id"])


async def decline_suggestion(conn: asyncpg.Connection, *, user_id: UUID, suggestion_id: UUID) -> object:
    async with conn.transaction():
        suggestion = await conn.fetchrow("SELECT activity_id FROM activity_suggestions WHERE id = $1", suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail=_UNAVAILABLE)
        activity = await _lock_activity(conn, suggestion["activity_id"])
        circle, _editor = await _gate(conn, user_id=user_id, activity=activity)
        _require_editor(user_id=user_id, activity=activity, circle=circle)
        current = await _locked_suggestion(conn, suggestion_id)
        if current["status"] != "open":
            raise HTTPException(status_code=409, detail=_UNAVAILABLE)
        await conn.execute(
            """
            UPDATE activity_suggestions
            SET status = 'declined', decided_by = $2, decided_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'open'
            """,
            suggestion_id,
            user_id,
        )
        await notifications.notify_suggestion_declined(conn, suggestion=current, actor=user_id)
    return await _refreshed(conn, user_id=user_id, activity_id=activity["id"])


async def _close_competitors(
    conn: asyncpg.Connection,
    *,
    suggestion: asyncpg.Record,
    user_id: UUID,
) -> None:
    closed = await conn.fetch(
        """
        UPDATE activity_suggestions
        SET status = 'declined', decided_by = $4, decided_at = NOW(), updated_at = NOW()
        WHERE activity_id = $1
          AND occurrence_id IS NOT DISTINCT FROM $2
          AND type = $3
          AND status = 'open'
          AND id <> $5
        RETURNING id, activity_id, occurrence_id, created_by
        """,
        suggestion["activity_id"],
        suggestion["occurrence_id"],
        suggestion["type"],
        user_id,
        suggestion["id"],
    )
    for other in closed:
        await notifications.notify_suggestion_declined(conn, suggestion=other, actor=user_id)


async def _apply_time(conn: asyncpg.Connection, *, suggestion: asyncpg.Record, target_id: UUID, occurrence: bool, confirmed: bool) -> None:
    if occurrence:
        try:
            await conn.execute(
                """
                UPDATE activity_occurrences
                SET start_at = $2,
                    end_at = $3,
                    status = CASE WHEN status = 'confirmed' THEN 'open' ELSE status END,
                    updated_at = NOW()
                WHERE id = $1
                """,
                target_id,
                suggestion["proposed_start_at"],
                suggestion["proposed_end_at"],
            )
        except UniqueViolationError as exc:
            raise HTTPException(status_code=409, detail="Another date already starts at that time.") from exc
        if confirmed:
            await conn.execute(
                """
                UPDATE activity_occurrence_participants
                SET confirmation_required = TRUE, updated_at = NOW()
                WHERE occurrence_id = $1 AND status = 'going'
                """,
                target_id,
            )
        return
    await conn.execute(
        """
        UPDATE activities
        SET start_at = $2,
            end_at = $3,
            status = CASE WHEN status = 'confirmed' THEN 'open' ELSE status END,
            updated_at = NOW()
        WHERE id = $1
        """,
        target_id,
        suggestion["proposed_start_at"],
        suggestion["proposed_end_at"],
    )
    if confirmed:
        await conn.execute(
            """
            UPDATE activity_participants
            SET confirmation_required = TRUE, updated_at = NOW()
            WHERE activity_id = $1 AND status = 'going'
            """,
            target_id,
        )


async def _apply_location(
    conn: asyncpg.Connection, *, suggestion: asyncpg.Record, target_id: UUID, occurrence: bool, confirmed: bool
) -> None:
    if occurrence:
        await conn.execute(
            """
            UPDATE activity_occurrences
            SET location_name_override = $2,
                location_address_override = $3,
                status = CASE WHEN status = 'confirmed' THEN 'open' ELSE status END,
                updated_at = NOW()
            WHERE id = $1
            """,
            target_id,
            suggestion["proposed_location_name"],
            suggestion["proposed_location_address"],
        )
        if confirmed:
            await conn.execute(
                """
                UPDATE activity_occurrence_participants
                SET confirmation_required = TRUE, updated_at = NOW()
                WHERE occurrence_id = $1 AND status = 'going'
                """,
                target_id,
            )
        return
    await conn.execute(
        """
        UPDATE activities
        SET location_name = $2,
            location_address = $3,
            status = CASE WHEN status = 'confirmed' THEN 'open' ELSE status END,
            updated_at = NOW()
        WHERE id = $1
        """,
        target_id,
        suggestion["proposed_location_name"],
        suggestion["proposed_location_address"],
    )
    if confirmed:
        await conn.execute(
            """
            UPDATE activity_participants
            SET confirmation_required = TRUE, updated_at = NOW()
            WHERE activity_id = $1 AND status = 'going'
            """,
            target_id,
        )


async def accept_suggestion(conn: asyncpg.Connection, *, user_id: UUID, suggestion_id: UUID) -> object:
    async with conn.transaction():
        located = await conn.fetchrow("SELECT activity_id FROM activity_suggestions WHERE id = $1", suggestion_id)
        if not located:
            raise HTTPException(status_code=404, detail=_UNAVAILABLE)
        activity = await _lock_activity(conn, located["activity_id"])
        circle, _editor = await _gate(conn, user_id=user_id, activity=activity)
        _require_editor(user_id=user_id, activity=activity, circle=circle)
        current = await _locked_suggestion(conn, suggestion_id)
        if current["status"] != "open":
            raise HTTPException(status_code=409, detail=_UNAVAILABLE)
        _ensure_live_activity(activity)
        target = await _target_row(conn, current, activity)
        date = current["occurrence_id"] is not None
        if target["status"] not in ("open", "confirmed"):
            raise HTTPException(status_code=400, detail=_UNAVAILABLE)
        _ensure_open_target(target, date=date)
        confirmed = target["status"] == "confirmed"
        if current["type"] == "time":
            await _apply_time(
                conn,
                suggestion=current,
                target_id=target["id"],
                occurrence=date,
                confirmed=confirmed,
            )
        else:
            await _apply_location(
                conn,
                suggestion=current,
                target_id=target["id"],
                occurrence=date,
                confirmed=confirmed,
            )
        updated = await conn.execute(
            """
            UPDATE activity_suggestions
            SET status = 'accepted', decided_by = $2, decided_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status = 'open'
            """,
            suggestion_id,
            user_id,
        )
        if not str(updated).endswith("1"):
            raise HTTPException(status_code=409, detail=_UNAVAILABLE)
        await _close_competitors(conn, suggestion=current, user_id=user_id)
        await notifications.notify_suggestion_accepted(conn, suggestion=current, confirmed=confirmed, actor=user_id)
    return await _refreshed(conn, user_id=user_id, activity_id=activity["id"])


async def _refreshed(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> object:
    from app.services.activities_service import get_activity

    return await get_activity(conn, user_id=user_id, activity_id=activity_id)
