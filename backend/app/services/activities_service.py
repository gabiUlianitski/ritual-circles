"""Activities inside a circle. Session rows are not read or written here."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.schemas import (
    ActivityActions,
    ActivityCreateRequest,
    ActivityDefaultsResponse,
    ActivityOccurrence,
    ActivityResponse,
    ActivityUpdateRequest,
)
from app.services import activity_attendance as attendance
from app.services import activity_notifications as notifications
from app.services.activity_recurrence import ROLLING_DATES, recurring_occurrence_times
from app.services.activity_rules import ensure_status_change, prepare_activity_fields
from app.services.circle_activity_defaults import activity_location_defaults, get_preferred_activity_size
from app.services.activity_participants import (
    places_in_use,
    summaries_for,
    summaries_for_occurrences,
    summaries_for_occurrences_by_activity,
    summary_for,
)
from app.services.circle_members import is_active_member


@dataclass(frozen=True)
class ActivityDefaults:
    location_name: str | None
    location_address: str | None
    group_size: int


def _defaults_from_circle(circle: asyncpg.Record) -> ActivityDefaults:
    location_name, location_address = activity_location_defaults(
        meeting_place=circle["meeting_place"],
        city=circle["city"],
        city_name=circle["city_name"],
    )
    return ActivityDefaults(
        location_name=location_name,
        location_address=location_address,
        group_size=get_preferred_activity_size(circle["group_size_json"], circle["max_size"]),
    )


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _response(row: asyncpg.Record) -> ActivityResponse:
    return ActivityResponse(
        id=str(row["id"]),
        circleId=str(row["circle_id"]),
        title=row["title"],
        description=row["description"],
        startAt=row["start_at"],
        endAt=row["end_at"],
        recurrenceType=row["recurrence_type"],
        recurrenceRule=row["recurrence_rule"],
        locationName=row["location_name"],
        locationAddress=row["location_address"],
        groupSize=int(row["group_size"]),
        minParticipants=int(row["min_participants"]),
        paymentType=row["payment_type"],
        priceAmount=row["price_amount"],
        currency=row["currency"],
        status=row["status"],
        createdBy=str(row["created_by"]),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _passed(moment: datetime) -> bool:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= datetime.now(timezone.utc)


def _flags(
    row: asyncpg.Record,
    *,
    is_editor: bool,
    can_edit: bool,
    series: bool,
    joinable: bool,
    going: bool,
    is_full: bool,
) -> ActivityActions:
    start = row["start_at"]
    end = row["end_at"] or start
    has_started = _passed(start)
    has_ended = _passed(end)
    status = row["status"]
    live = status in ("open", "confirmed")
    return ActivityActions(
        canJoin=joinable and live and not has_ended and not going and not is_full,
        canLeave=joinable and live and going,
        canEdit=can_edit and status in ("draft", "open", "confirmed"),
        canPublish=is_editor and status == "draft",
        canConfirm=is_editor and not can_edit and status == "open" and not series,
        canComplete=is_editor and status == "confirmed" and has_ended and not series,
        canCancel=is_editor and status in ("draft", "open", "confirmed"),
        canSuggest=live and not has_ended and not series,
        hasStarted=has_started,
        hasEnded=has_ended,
    )


def _date_flags(
    item: asyncpg.Record,
    *,
    is_editor: bool,
    series_live: bool,
    going: bool,
    is_full: bool,
) -> ActivityActions:
    """A recurring date is upcoming until it ends, then past. It needs no confirm or complete step."""
    start = item["start_at"]
    end = item["end_at"] or start
    has_ended = _passed(end)
    live = series_live and item["status"] in ("open", "confirmed") and not has_ended
    return ActivityActions(
        canJoin=live and not going and not is_full,
        canLeave=live and going,
        canEdit=False,
        canPublish=False,
        canConfirm=False,
        canComplete=False,
        canCancel=is_editor and live,
        canSuggest=live,
        hasStarted=_passed(start),
        hasEnded=has_ended,
    )


def _transition(current: str, target: str, *, ended: bool | None = None) -> None:
    if current == "cancelled":
        raise HTTPException(status_code=400, detail="This activity has already been cancelled.")
    if current == "completed":
        raise HTTPException(status_code=400, detail="This activity can no longer be changed.")
    if current == "draft" and target == "confirmed":
        raise HTTPException(status_code=400, detail="Publish the activity before confirming it.")
    if current == "open" and target == "completed":
        raise HTTPException(status_code=400, detail="This activity must be confirmed before it can be completed.")
    if target == "completed" and ended is False:
        raise HTTPException(status_code=400, detail="You can mark this activity as completed after it ends.")
    try:
        ensure_status_change(current, target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="This activity status cannot change that way.") from exc


async def _occurrence_views(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity: asyncpg.Record,
    is_editor: bool,
    include_people: bool,
    suggestions_by_occurrence: dict | None = None,
) -> list[ActivityOccurrence]:
    rows = await conn.fetch(
        """
        SELECT *
        FROM activity_occurrences
        WHERE activity_id = $1
        ORDER BY start_at ASC, id ASC
        """,
        activity["id"],
    )
    summaries = await summaries_for_occurrences(
        conn,
        user_id=user_id,
        activity=activity,
        occurrences=list(rows),
        include_people=include_people,
    )
    recordable = [item["id"] for item in rows if is_editor and include_people and attendance.date_recordable(item)]
    rosters = await attendance.date_rosters(conn, recordable)
    views: list[ActivityOccurrence] = []
    series_live = activity["status"] in ("open", "confirmed")
    for item in rows:
        summary = summaries[item["id"]]
        actions = _date_flags(
            item,
            is_editor=is_editor,
            series_live=series_live,
            going=summary.currentUserStatus == "going",
            is_full=summary.isFull,
        )
        views.append(
            ActivityOccurrence(
                id=str(item["id"]),
                startAt=item["start_at"],
                endAt=item["end_at"],
                status=item["status"],
                cancellationReason=item["cancellation_reason"],
                locationName=item.get("location_name_override"),
                locationAddress=item.get("location_address_override"),
                hasStarted=actions.hasStarted,
                hasEnded=actions.hasEnded,
                actions=actions,
                participation=summary,
                suggestions=suggestions_by_occurrence.get(item["id"], []) if suggestions_by_occurrence else [],
                attendance=rosters.get(item["id"]),
            )
        )
    return views


async def _present(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    row: asyncpg.Record,
    include_people: bool,
) -> ActivityResponse:
    summary = await summary_for(conn, user_id=user_id, row=row, include_people=include_people)
    circle = await _circle(conn, row["circle_id"])
    is_creator = row["created_by"] == user_id
    is_editor = is_creator or circle["created_by"] == user_id
    series = row["recurrence_type"] == "recurring"
    actions = _flags(
        row,
        is_editor=is_editor,
        can_edit=is_creator,
        series=series,
        joinable=not series,
        going=summary.currentUserStatus == "going",
        is_full=summary.isFull,
    )
    parent_suggestions: list = []
    by_occurrence: dict = {}
    if include_people:
        from app.services.activity_suggestions import grouped_suggestions

        parent_suggestions, by_occurrence = await grouped_suggestions(conn, user_id=user_id, activity=row)
    occurrences = (
        await _occurrence_views(
            conn,
            user_id=user_id,
            activity=row,
            is_editor=is_editor,
            include_people=include_people,
            suggestions_by_occurrence=by_occurrence,
        )
        if series
        else []
    )
    next_occurrence = None
    if series and row["status"] in ("open", "confirmed"):
        next_occurrence = next(
            (
                item
                for item in occurrences
                if item.status in ("open", "confirmed") and not item.hasEnded
            ),
            None,
        )
        if next_occurrence is not None:
            next_occurrence = next_occurrence.model_copy(
                update={
                    "locationName": next_occurrence.locationName or row["location_name"],
                    "locationAddress": next_occurrence.locationAddress or row["location_address"],
                }
            )
    roster = None
    if is_editor and include_people and attendance.activity_recordable(row):
        roster = await attendance.activity_roster(conn, row["id"])
    return _response(row).model_copy(
        update={
            "attendance": roster,
            "participation": summary,
            "actions": actions,
            "hasStarted": actions.hasStarted,
            "hasEnded": (next_occurrence is None) if series and row["status"] in ("open", "confirmed") else actions.hasEnded,
            "cancellationReason": row["cancellation_reason"],
            "occurrences": occurrences,
            "nextOccurrence": next_occurrence,
            "suggestions": [] if series else parent_suggestions,
        }
    )


async def _circle(conn: asyncpg.Connection, circle_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(
        """
        SELECT id, created_by, meeting_place, city, city_name, "maxSize" AS max_size, group_size_json
        FROM circles
        WHERE id = $1
        """,
        circle_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="circle not found")
    return row


async def _require_member_or_owner(conn: asyncpg.Connection, *, user_id: UUID, circle: asyncpg.Record) -> None:
    if circle["created_by"] == user_id:
        return
    if await is_active_member(conn, user_id=user_id, circle_id=circle["id"]):
        return
    raise HTTPException(status_code=403, detail="Only an active circle member can use activities")


def _require_editor(*, user_id: UUID, activity: asyncpg.Record, circle: asyncpg.Record) -> None:
    if activity["created_by"] == user_id or circle["created_by"] == user_id:
        return
    raise HTTPException(status_code=403, detail="Only the activity creator or circle owner can change this activity")


def _require_creator(*, user_id: UUID, activity: asyncpg.Record) -> None:
    if activity["created_by"] == user_id:
        return
    raise HTTPException(status_code=403, detail="Only the activity creator can edit this activity")


async def activity_defaults_for_circle(conn: asyncpg.Connection, *, circle_id: UUID) -> ActivityDefaults:
    """Copy the circle's place and preferred size. The activity stores its own values after that."""
    return _defaults_from_circle(await _circle(conn, circle_id))


async def get_activity_defaults(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID
) -> ActivityDefaultsResponse:
    circle = await _circle(conn, circle_id)
    await _require_member_or_owner(conn, user_id=user_id, circle=circle)
    defaults = _defaults_from_circle(circle)
    return ActivityDefaultsResponse(
        locationName=defaults.location_name,
        locationAddress=defaults.location_address,
        preferredGroupSize=defaults.group_size,
        cityName=_text(circle["city_name"]) or _text(circle["city"]),
    )


def _checked(**fields: object) -> dict[str, object]:
    try:
        return prepare_activity_fields(**fields)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _insert(
    conn: asyncpg.Connection,
    *,
    activity_id: UUID,
    circle_id: UUID,
    user_id: UUID,
    fields: dict[str, object],
    include_people: bool,
) -> ActivityResponse:
    row = await conn.fetchrow(
        """
        INSERT INTO activities (
          id, circle_id, title, description, start_at, end_at,
          recurrence_type, recurrence_rule, location_name, location_address,
          group_size, min_participants, payment_type, price_amount, currency, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
        """,
        activity_id,
        circle_id,
        fields["title"],
        fields["description"],
        fields["start_at"],
        fields["end_at"],
        fields["recurrence_type"],
        fields["recurrence_rule"],
        fields["location_name"],
        fields["location_address"],
        fields["group_size"],
        fields["min_participants"],
        fields["payment_type"],
        fields["price_amount"],
        fields["currency"],
        fields["status"],
        user_id,
    )
    return await _present(conn, user_id=user_id, row=row, include_people=include_people)


async def create_activity(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    payload: ActivityCreateRequest,
) -> ActivityResponse:
    circle = await _circle(conn, circle_id)
    await _require_member_or_owner(conn, user_id=user_id, circle=circle)
    defaults = _defaults_from_circle(circle)
    location_name = _text(payload.locationName)
    location_address = _text(payload.locationAddress)
    fields = _checked(
        title=payload.title,
        description=payload.description,
        start_at=payload.startAt,
        end_at=payload.endAt,
        recurrence_type=payload.recurrenceType,
        recurrence_rule=payload.recurrenceRule,
        location_name=location_name if location_name is not None else defaults.location_name,
        location_address=location_address if location_address is not None else defaults.location_address,
        group_size=payload.groupSize if payload.groupSize is not None else defaults.group_size,
        min_participants=payload.minParticipants,
        payment_type=payload.paymentType,
        price_amount=payload.priceAmount,
        currency=payload.currency,
        status="draft",
        require_group_size=True,
    )
    async with conn.transaction():
        created = await _insert(
            conn, activity_id=uuid4(), circle_id=circle_id, user_id=user_id, fields=fields, include_people=False
        )
        if payload.recurrenceType == "one_time":
            await conn.execute(
                """
                INSERT INTO activity_participants (
                  id, activity_id, user_id, status, confirmation_required, attendance_status, joined_at
                )
                VALUES ($1, $2, $3, 'going', FALSE, 'pending', NOW())
                ON CONFLICT (activity_id, user_id) DO UPDATE
                SET status = 'going', confirmation_required = FALSE, updated_at = NOW()
                """,
                uuid4(),
                UUID(created.id),
                user_id,
            )
        row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1", UUID(created.id))
    return await _present(conn, user_id=user_id, row=row, include_people=False)


async def restore_confirmed_after_suggestion(
    conn: asyncpg.Connection, *, activity_id: UUID | None = None, circle_id: UUID | None = None
) -> None:
    """An accepted suggestion keeps a confirmed activity confirmed.

    Older accepts moved it back to open. A saved reconfirmation notice is the mark of that case.
    """
    if activity_id is None and circle_id is None:
        return
    await conn.execute(
        """
        UPDATE activities a
        SET status = 'confirmed', updated_at = NOW()
        WHERE a.status = 'open'
          AND a.recurrence_type = 'one_time'
          AND ($1::uuid IS NULL OR a.id = $1)
          AND ($2::uuid IS NULL OR a.circle_id = $2)
          AND EXISTS (
            SELECT 1 FROM activity_notifications n
            WHERE n.activity_id = a.id
              AND n.occurrence_id IS NULL
              AND n.type = 'reconfirmation_required'
          )
        """,
        activity_id,
        circle_id,
    )
    await conn.execute(
        """
        UPDATE activity_occurrences o
        SET status = 'confirmed', updated_at = NOW()
        FROM activities a
        WHERE o.activity_id = a.id
          AND o.status = 'open'
          AND ($1::uuid IS NULL OR a.id = $1)
          AND ($2::uuid IS NULL OR a.circle_id = $2)
          AND EXISTS (
            SELECT 1 FROM activity_notifications n
            WHERE n.occurrence_id = o.id
              AND n.type = 'reconfirmation_required'
          )
        """,
        activity_id,
        circle_id,
    )


async def get_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityResponse:
    await restore_confirmed_after_suggestion(conn, activity_id=activity_id)
    row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1", activity_id)
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    circle = await _circle(conn, row["circle_id"])
    await _require_member_or_owner(conn, user_id=user_id, circle=circle)
    if row["status"] == "draft" and row["created_by"] != user_id and circle["created_by"] != user_id:
        raise HTTPException(status_code=404, detail="activity not found")
    if row["recurrence_type"] == "recurring":
        await ensure_future_activity_occurrences(conn, activity_id)
    return await _present(conn, user_id=user_id, row=row, include_people=True)


async def list_activities_for_circle(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID
) -> list[ActivityResponse]:
    circle = await _circle(conn, circle_id)
    await _require_member_or_owner(conn, user_id=user_id, circle=circle)
    await restore_confirmed_after_suggestion(conn, circle_id=circle_id)
    rows = await conn.fetch(
        """
        SELECT *
        FROM activities
        WHERE circle_id = $1
          AND (
            status <> 'draft'
            OR created_by = $2
            OR $2 = $3
          )
        ORDER BY start_at ASC, id ASC
        """,
        circle_id,
        user_id,
        circle["created_by"],
    )
    for item in rows:
        if item["recurrence_type"] == "recurring" and item["status"] in ("open", "confirmed"):
            await ensure_future_activity_occurrences(conn, item["id"])
    return await _present_circle_list(conn, user_id=user_id, circle=circle, rows=list(rows))


async def _present_circle_list(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle: asyncpg.Record,
    rows: list[asyncpg.Record],
) -> list[ActivityResponse]:
    """Build the circle list with batched participation and occurrence reads.

    Details still use _present because they need people and suggestions. The list needs
    every occurrence for its current UI, but loads all of them in one query.
    """
    parent_summaries = await summaries_for(conn, user_id=user_id, rows=rows)
    recurring_ids = [item["id"] for item in rows if item["recurrence_type"] == "recurring"]
    occurrence_rows = list(
        await conn.fetch(
            """
            SELECT *
            FROM activity_occurrences
            WHERE activity_id = ANY($1::uuid[])
            ORDER BY activity_id ASC, start_at ASC, id ASC
            """,
            recurring_ids,
        )
        if recurring_ids
        else []
    )
    occurrence_summaries = await summaries_for_occurrences_by_activity(
        conn, user_id=user_id, activities=rows, occurrences=occurrence_rows
    )
    occurrence_map: dict[UUID, list[ActivityOccurrence]] = {item["id"]: [] for item in rows}
    by_activity = {item["id"]: item for item in rows}
    for occurrence in occurrence_rows:
        activity = by_activity[occurrence["activity_id"]]
        is_editor = activity["created_by"] == user_id or circle["created_by"] == user_id
        summary = occurrence_summaries[occurrence["id"]]
        actions = _date_flags(
            occurrence,
            is_editor=is_editor,
            series_live=activity["status"] in ("open", "confirmed"),
            going=summary.currentUserStatus == "going",
            is_full=summary.isFull,
        )
        occurrence_map[activity["id"]].append(
            ActivityOccurrence(
                id=str(occurrence["id"]),
                startAt=occurrence["start_at"],
                endAt=occurrence["end_at"],
                status=occurrence["status"],
                cancellationReason=occurrence["cancellation_reason"],
                locationName=occurrence.get("location_name_override"),
                locationAddress=occurrence.get("location_address_override"),
                hasStarted=actions.hasStarted,
                hasEnded=actions.hasEnded,
                actions=actions,
                participation=summary,
            )
        )
    presented: list[ActivityResponse] = []
    for row in rows:
        series = row["recurrence_type"] == "recurring"
        is_creator = row["created_by"] == user_id
        is_editor = is_creator or circle["created_by"] == user_id
        actions = _flags(
            row,
            is_editor=is_editor,
            can_edit=is_creator,
            series=series,
            joinable=not series,
            going=parent_summaries[row["id"]].currentUserStatus == "going",
            is_full=parent_summaries[row["id"]].isFull,
        )
        occurrences = occurrence_map[row["id"]]
        next_occurrence = None
        if series and row["status"] in ("open", "confirmed"):
            next_occurrence = next(
                (item for item in occurrences if item.status in ("open", "confirmed") and not item.hasEnded),
                None,
            )
            if next_occurrence is not None:
                next_occurrence = next_occurrence.model_copy(
                    update={
                        "locationName": next_occurrence.locationName or row["location_name"],
                        "locationAddress": next_occurrence.locationAddress or row["location_address"],
                    }
                )
        presented.append(
            _response(row).model_copy(
                update={
                    "participation": parent_summaries[row["id"]],
                    "actions": actions,
                    "hasStarted": actions.hasStarted,
                    "hasEnded": (
                        next_occurrence is None
                        if series and row["status"] in ("open", "confirmed")
                        else actions.hasEnded
                    ),
                    "cancellationReason": row["cancellation_reason"],
                    "occurrences": occurrences,
                    "nextOccurrence": next_occurrence,
                }
            )
        )
    return presented


def _same_moment(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    if left.tzinfo is None:
        left = left.replace(tzinfo=timezone.utc)
    if right.tzinfo is None:
        right = right.replace(tzinfo=timezone.utc)
    return left == right


async def _schedule_locked(
    conn: asyncpg.Connection,
    row: asyncpg.Record,
    payload: ActivityUpdateRequest,
    sent: set[str],
) -> bool:
    """Published dates stay where they are. A later edit must not slide people onto another week."""
    changed = False
    if "startAt" in sent and not _same_moment(payload.startAt, row["start_at"]):
        changed = True
    if "endAt" in sent and not _same_moment(payload.endAt, row["end_at"]):
        changed = True
    if "recurrenceType" in sent and payload.recurrenceType != row["recurrence_type"]:
        changed = True
    if "recurrenceRule" in sent and (payload.recurrenceRule or "") != (row["recurrence_rule"] or ""):
        changed = True
    if not changed:
        return False
    existing = await conn.fetchval(
        "SELECT 1 FROM activity_occurrences WHERE activity_id = $1 LIMIT 1",
        row["id"],
    )
    return existing is not None


async def update_activity(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity_id: UUID,
    payload: ActivityUpdateRequest,
) -> ActivityResponse:
    row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1", activity_id)
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    _require_creator(user_id=user_id, activity=row)
    if row["status"] in ("cancelled", "completed"):
        raise HTTPException(status_code=400, detail="This activity can no longer be changed")
    sent = payload.model_fields_set
    if "status" in sent and payload.status not in (None, row["status"]):
        raise HTTPException(status_code=400, detail="Use the activity actions to change status")
    if row["recurrence_type"] == "recurring" and await _schedule_locked(conn, row, payload, sent):
        raise HTTPException(status_code=400, detail="These dates are already set and cannot be moved")
    next_status = row["status"]
    group_size = payload.groupSize if "groupSize" in sent else int(row["group_size"])
    min_participants = payload.minParticipants if "minParticipants" in sent else int(row["min_participants"])
    fields = _checked(
        title=payload.title if "title" in sent else row["title"],
        description=payload.description if "description" in sent else row["description"],
        start_at=payload.startAt if "startAt" in sent else row["start_at"],
        end_at=payload.endAt if "endAt" in sent else row["end_at"],
        recurrence_type=payload.recurrenceType if "recurrenceType" in sent else row["recurrence_type"],
        recurrence_rule=payload.recurrenceRule if "recurrenceRule" in sent else row["recurrence_rule"],
        location_name=payload.locationName if "locationName" in sent else row["location_name"],
        location_address=payload.locationAddress if "locationAddress" in sent else row["location_address"],
        group_size=group_size,
        min_participants=min_participants,
        payment_type=payload.paymentType if "paymentType" in sent else row["payment_type"],
        price_amount=payload.priceAmount if "priceAmount" in sent else row["price_amount"],
        currency=payload.currency if "currency" in sent else row["currency"],
        status=next_status,
        require_group_size=True,
    )
    async def _save() -> asyncpg.Record:
        saved = await conn.fetchrow(
            """
            UPDATE activities
            SET title = $2,
                description = $3,
                start_at = $4,
                end_at = $5,
                recurrence_type = $6,
                recurrence_rule = $7,
                location_name = $8,
                location_address = $9,
                group_size = $10,
                min_participants = $11,
                payment_type = $12,
                price_amount = $13,
                currency = $14,
                status = $15,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            """,
            activity_id,
            fields["title"],
            fields["description"],
            fields["start_at"],
            fields["end_at"],
            fields["recurrence_type"],
            fields["recurrence_rule"],
            fields["location_name"],
            fields["location_address"],
            fields["group_size"],
            fields["min_participants"],
            fields["payment_type"],
            fields["price_amount"],
            fields["currency"],
            fields["status"],
        )
        return saved

    async with conn.transaction():
        if "groupSize" in sent and payload.groupSize is not None:
            await conn.fetchrow("SELECT id FROM activities WHERE id = $1 FOR UPDATE", activity_id)
            if payload.groupSize < await places_in_use(conn, activity_id):
                raise HTTPException(
                    status_code=400,
                    detail="Group size cannot be smaller than the number of people going",
                )
        updated = await _save()
        await notifications.notify_edited(conn, before=row, after=updated, actor=user_id)
    return await _present(conn, user_id=user_id, row=updated, include_people=True)


async def _locked_activity(conn: asyncpg.Connection, activity_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow("SELECT * FROM activities WHERE id = $1 FOR UPDATE", activity_id)
    if not row:
        raise HTTPException(status_code=404, detail="activity not found")
    return row


async def _locked_occurrence(conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID) -> asyncpg.Record:
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


def _require_date(row: asyncpg.Record, occurrence_id: UUID | None) -> None:
    recurring = row["recurrence_type"] == "recurring"
    if recurring and occurrence_id is None:
        raise HTTPException(status_code=400, detail="Choose one date")
    if not recurring and occurrence_id is not None:
        raise HTTPException(status_code=400, detail="This activity has one date")


async def _add_missing_dates(conn: asyncpg.Connection, row: asyncpg.Record) -> int:
    """Add weekly dates after the last stored one until enough are ahead. The caller holds the activity lock.

    scheduled_at is the week a date was made for and never changes; start_at is when it happens now.
    Stored dates are never changed, whatever their status, time, place, or people.
    A week whose time is already taken by a moved date is skipped.
    """
    now = datetime.now(timezone.utc)
    stored = await conn.fetchrow(
        """
        SELECT COUNT(*) FILTER (
                 WHERE scheduled_at > $2
                   AND status IN ('open', 'confirmed')
               )::int AS ahead,
               MIN(scheduled_at) AS first_slot,
               MAX(scheduled_at) AS last_slot
        FROM activity_occurrences
        WHERE activity_id = $1
        """,
        row["id"],
        now,
    )
    missing = ROLLING_DATES - int(stored["ahead"] or 0)
    if missing <= 0:
        return 0
    last_slot = stored["last_slot"]
    after = now if last_slot is None or last_slot < now else last_slot
    duration = None if row["end_at"] is None else row["end_at"] - row["start_at"]
    added = 0
    for begin, finish in recurring_occurrence_times(
        first_slot=stored["first_slot"] or row["start_at"],
        duration=duration,
        after=after,
        count=missing + ROLLING_DATES,
    ):
        if added == missing:
            break
        occurrence_id = await conn.fetchval(
            """
            INSERT INTO activity_occurrences (
              id, activity_id, start_at, end_at, status, scheduled_at
            )
            VALUES ($1, $2, $3, $4, 'open', $3)
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            uuid4(),
            row["id"],
            begin,
            finish,
        )
        if occurrence_id is not None:
            await conn.execute(
                """
                INSERT INTO activity_occurrence_participants (
                  id, occurrence_id, user_id, status, confirmation_required, attendance_status, joined_at
                )
                VALUES ($1, $2, $3, 'going', FALSE, 'pending', NOW())
                ON CONFLICT (occurrence_id, user_id) DO NOTHING
                """,
                uuid4(),
                occurrence_id,
                row["created_by"],
            )
            added += 1
    return added


async def ensure_future_activity_occurrences(conn: asyncpg.Connection, activity_id: UUID) -> int:
    """Keep the next weekly dates of a live recurring activity. Safe to call again or at the same time."""
    needs_dates = await conn.fetchval(
        """
        SELECT a.recurrence_type = 'recurring'
           AND a.status IN ('open', 'confirmed')
           AND (
             SELECT COUNT(*)
             FROM activity_occurrences o
             WHERE o.activity_id = a.id
               AND o.scheduled_at > NOW()
               AND o.status IN ('open', 'confirmed')
           ) < $2
        FROM activities a
        WHERE a.id = $1
        """,
        activity_id,
        ROLLING_DATES,
    )
    if not needs_dates:
        return 0
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        if row["recurrence_type"] != "recurring" or row["status"] not in ("open", "confirmed"):
            return 0
        return await _add_missing_dates(conn, row)


async def publish_activity(conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID) -> ActivityResponse:
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle(conn, row["circle_id"])
        _require_editor(user_id=user_id, activity=row, circle=circle)
        _transition(row["status"], "open")
        if row["recurrence_type"] == "recurring":
            await _add_missing_dates(conn, row)
        updated = await conn.fetchrow(
            """
            UPDATE activities
            SET status = 'open', updated_at = NOW()
            WHERE id = $1
            RETURNING *
            """,
            activity_id,
        )
    return await _present(conn, user_id=user_id, row=updated, include_people=True)


async def confirm_activity(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, occurrence_id: UUID | None = None
) -> ActivityResponse:
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle(conn, row["circle_id"])
        _require_editor(user_id=user_id, activity=row, circle=circle)
        _require_date(row, occurrence_id)
        if occurrence_id is not None:
            item = await _locked_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
            _transition(item["status"], "confirmed")
            confirmed_at = await conn.fetchval(
                """
                UPDATE activity_occurrences
                SET status = 'confirmed', updated_at = NOW()
                WHERE id = $1
                RETURNING updated_at
                """,
                occurrence_id,
            )
            updated = row
        else:
            _transition(row["status"], "confirmed")
            updated = await conn.fetchrow(
                """
                UPDATE activities SET status = 'confirmed', updated_at = NOW()
                WHERE id = $1 RETURNING *
                """,
                activity_id,
            )
            confirmed_at = updated["updated_at"]
        await notifications.notify_confirmed(
            conn, activity_id=activity_id, occurrence_id=occurrence_id, confirmed_at=confirmed_at, actor=user_id
        )
    return await _present(conn, user_id=user_id, row=updated, include_people=True)


async def complete_activity(
    conn: asyncpg.Connection, *, user_id: UUID, activity_id: UUID, occurrence_id: UUID | None = None
) -> ActivityResponse:
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle(conn, row["circle_id"])
        _require_editor(user_id=user_id, activity=row, circle=circle)
        _require_date(row, occurrence_id)
        if occurrence_id is not None:
            item = await _locked_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
            _transition(item["status"], "completed", ended=_passed(item["end_at"] or item["start_at"]))
            await conn.execute(
                """
                UPDATE activity_occurrences
                SET status = 'completed', updated_at = NOW()
                WHERE id = $1
                """,
                occurrence_id,
            )
            updated = row
        else:
            _transition(row["status"], "completed", ended=_passed(row["end_at"] or row["start_at"]))
            updated = await conn.fetchrow(
                """
                UPDATE activities SET status = 'completed', updated_at = NOW()
                WHERE id = $1 RETURNING *
                """,
                activity_id,
            )
    return await _present(conn, user_id=user_id, row=updated, include_people=True)


async def cancel_activity(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    activity_id: UUID,
    occurrence_id: UUID | None = None,
    reason: str | None = None,
) -> ActivityResponse:
    """One date of a recurring activity is "not happening this time"; without a date the whole activity stops."""
    note = reason.strip() if isinstance(reason, str) and reason.strip() else None
    async with conn.transaction():
        row = await _locked_activity(conn, activity_id)
        circle = await _circle(conn, row["circle_id"])
        _require_editor(user_id=user_id, activity=row, circle=circle)
        if row["recurrence_type"] != "recurring" and occurrence_id is not None:
            raise HTTPException(status_code=400, detail="This activity has one date")
        if occurrence_id is not None:
            if row["status"] not in ("open", "confirmed"):
                raise HTTPException(status_code=400, detail="This date is no longer open")
            item = await _locked_occurrence(conn, activity_id=activity_id, occurrence_id=occurrence_id)
            _transition(item["status"], "cancelled")
            if _passed(item["end_at"] or item["start_at"]):
                raise HTTPException(status_code=400, detail="This date has already happened.")
            await conn.execute(
                """
                UPDATE activity_occurrences
                SET status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
                WHERE id = $1
                """,
                occurrence_id,
                note,
            )
            await notifications.notify_cancelled(
                conn, activity_id=activity_id, occurrence_id=occurrence_id, actor=user_id
            )
            updated = row
        else:
            _transition(row["status"], "cancelled")
            updated = await conn.fetchrow(
                """
                UPDATE activities
                SET status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                activity_id,
                note,
            )
            if row["recurrence_type"] == "recurring":
                for stopped in await _stop_future_dates(conn, activity_id=activity_id, note=note):
                    await notifications.notify_cancelled(
                        conn, activity_id=activity_id, occurrence_id=stopped, actor=user_id
                    )
            else:
                await notifications.notify_cancelled(conn, activity_id=activity_id, occurrence_id=None, actor=user_id)
    return await _present(conn, user_id=user_id, row=updated, include_people=True)


async def _stop_future_dates(conn: asyncpg.Connection, *, activity_id: UUID, note: str | None) -> list[UUID]:
    """Dates that have not started are marked not happening. Started and past dates, people, and suggestions stay."""
    rows = await conn.fetch(
        """
        UPDATE activity_occurrences
        SET status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
        WHERE activity_id = $1
          AND status IN ('open', 'confirmed')
          AND start_at > $3
        RETURNING id
        """,
        activity_id,
        note,
        datetime.now(timezone.utc),
    )
    return [r["id"] for r in rows]
