"""In-app Activity notifications.

Rows are written by the Activity service inside the same transaction as the change they describe.
Each row is keyed per recipient by a deterministic dedup_key, so a retried request or a repeated
inbox fetch never adds a second copy. Push delivery is not implemented.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import asyncpg

from app.hoby_i18n import localized_display_name
from app.schemas import ActivityNotification

REMINDER_HOURS = 24
_LIST_LIMIT = 100


def _stamp(moment: datetime) -> str:
    return str(int(moment.timestamp() * 1_000_000))


def dedup_key(kind: str, activity_id: UUID, occurrence_id: UUID | None, source: str) -> str:
    return f"{kind}:{activity_id}:{occurrence_id or '-'}:{source}"


async def going_users(conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID | None) -> list[UUID]:
    """People going to the one-time Activity, or to that one date of a recurring Activity."""
    if occurrence_id is not None:
        rows = await conn.fetch(
            "SELECT user_id FROM activity_occurrence_participants WHERE occurrence_id = $1 AND status = 'going'",
            occurrence_id,
        )
    else:
        rows = await conn.fetch(
            "SELECT user_id FROM activity_participants WHERE activity_id = $1 AND status = 'going'",
            activity_id,
        )
    return [row["user_id"] for row in rows]


async def notify(
    conn: asyncpg.Connection,
    *,
    users: list[UUID],
    kind: str,
    activity_id: UUID,
    occurrence_id: UUID | None,
    source: str,
    suggestion_id: UUID | None = None,
    skip: tuple[UUID | None, ...] = (),
) -> int:
    recipients = list(dict.fromkeys(u for u in users if u not in skip))
    if not recipients:
        return 0
    key = dedup_key(kind, activity_id, occurrence_id, source)
    result = await conn.execute(
        """
        INSERT INTO activity_notifications (id, user_id, type, activity_id, occurrence_id, suggestion_id, dedup_key)
        SELECT r.id, r.user_id, $3, $4, $5, $6, $7
        FROM unnest($1::uuid[], $2::uuid[]) AS r(id, user_id)
        ON CONFLICT (user_id, dedup_key) DO NOTHING
        """,
        [uuid4() for _ in recipients],
        recipients,
        kind,
        activity_id,
        occurrence_id,
        suggestion_id,
        key,
    )
    return int(str(result).split()[-1])


async def notify_going(
    conn: asyncpg.Connection,
    *,
    kind: str,
    activity_id: UUID,
    occurrence_id: UUID | None,
    source: str,
    suggestion_id: UUID | None = None,
    skip: tuple[UUID | None, ...] = (),
) -> int:
    users = await going_users(conn, activity_id=activity_id, occurrence_id=occurrence_id)
    return await notify(
        conn,
        users=users,
        kind=kind,
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        source=source,
        suggestion_id=suggestion_id,
        skip=skip,
    )


async def notify_confirmed(
    conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID | None, confirmed_at: datetime, actor: UUID
) -> int:
    return await notify_going(
        conn,
        kind="activity_confirmed",
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        source=_stamp(confirmed_at),
        skip=(actor,),
    )


async def notify_cancelled(
    conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID | None, actor: UUID
) -> int:
    return await notify_going(
        conn,
        kind="activity_cancelled",
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        source="cancelled",
        skip=(actor,),
    )


async def notify_edited(
    conn: asyncpg.Connection,
    *,
    before: asyncpg.Record,
    after: asyncpg.Record,
    actor: UUID,
) -> int:
    """An organizer edit that moves the time or the place tells the people going. Other edits stay quiet."""
    if after["status"] not in ("open", "confirmed"):
        return 0
    moved = before["start_at"] != after["start_at"] or before["end_at"] != after["end_at"]
    placed = (before["location_name"] or "", before["location_address"] or "") != (
        after["location_name"] or "",
        after["location_address"] or "",
    )
    if not moved and not placed:
        return 0
    source = f"edit:{_stamp(after['updated_at'])}"
    if after["recurrence_type"] != "recurring":
        return await notify_going(
            conn, kind="activity_changed", activity_id=after["id"], occurrence_id=None, source=source, skip=(actor,)
        )
    if not placed:
        return 0
    dates = await conn.fetch(
        """
        SELECT id FROM activity_occurrences
        WHERE activity_id = $1
          AND status IN ('open', 'confirmed')
          AND start_at > NOW()
          AND location_name_override IS NULL
        """,
        after["id"],
    )
    added = 0
    for date in dates:
        added += await notify_going(
            conn, kind="activity_changed", activity_id=after["id"], occurrence_id=date["id"], source=source, skip=(actor,)
        )
    return added


async def notify_suggestion_accepted(
    conn: asyncpg.Connection,
    *,
    suggestion: asyncpg.Record,
    confirmed: bool,
    actor: UUID,
) -> None:
    """The person who suggested hears it was accepted. People going hear the change once:
    as "please reconfirm" when the date was confirmed, otherwise as "activity changed"."""
    activity_id = suggestion["activity_id"]
    occurrence_id = suggestion["occurrence_id"]
    source = str(suggestion["id"])
    await notify(
        conn,
        users=[suggestion["created_by"]],
        kind="suggestion_accepted",
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        source=source,
        suggestion_id=suggestion["id"],
        skip=(actor,),
    )
    if confirmed:
        await notify(
            conn,
            users=await _needs_reconfirmation(conn, activity_id=activity_id, occurrence_id=occurrence_id),
            kind="reconfirmation_required",
            activity_id=activity_id,
            occurrence_id=occurrence_id,
            source=source,
            suggestion_id=suggestion["id"],
            skip=(actor,),
        )
        return
    await notify_going(
        conn,
        kind="activity_changed",
        activity_id=activity_id,
        occurrence_id=occurrence_id,
        source=source,
        suggestion_id=suggestion["id"],
        skip=(actor, suggestion["created_by"]),
    )


async def notify_suggestion_declined(
    conn: asyncpg.Connection, *, suggestion: asyncpg.Record, actor: UUID
) -> int:
    return await notify(
        conn,
        users=[suggestion["created_by"]],
        kind="suggestion_declined",
        activity_id=suggestion["activity_id"],
        occurrence_id=suggestion["occurrence_id"],
        source=str(suggestion["id"]),
        suggestion_id=suggestion["id"],
        skip=(actor,),
    )


async def _needs_reconfirmation(
    conn: asyncpg.Connection, *, activity_id: UUID, occurrence_id: UUID | None
) -> list[UUID]:
    if occurrence_id is not None:
        rows = await conn.fetch(
            """
            SELECT user_id FROM activity_occurrence_participants
            WHERE occurrence_id = $1 AND status = 'going' AND confirmation_required
            """,
            occurrence_id,
        )
    else:
        rows = await conn.fetch(
            """
            SELECT user_id FROM activity_participants
            WHERE activity_id = $1 AND status = 'going' AND confirmation_required
            """,
            activity_id,
        )
    return [row["user_id"] for row in rows]


_ACCESS = """
  (c.created_by = $1 OR EXISTS (
    SELECT 1 FROM circle_members m
    WHERE m.circle_id = a.circle_id AND m.user_id = $1 AND m.status = 'active'
  ))
"""


async def add_due_reminders(conn: asyncpg.Connection, *, user_id: UUID) -> int:
    """One reminder per Activity or stored date the user is going to, once it is within 24 hours.

    Only live Activities and dates that have not started count. Nothing is made for theoretical dates.
    """
    result = await conn.execute(
        f"""
        INSERT INTO activity_notifications (id, user_id, type, activity_id, occurrence_id, dedup_key)
        SELECT gen_random_uuid(), $1, 'upcoming_activity', due.activity_id, due.occurrence_id,
               'upcoming_activity:' || due.activity_id || ':' || COALESCE(due.occurrence_id::text, '-')
               || ':' || (EXTRACT(EPOCH FROM due.start_at) * 1000000)::bigint
        FROM (
          SELECT a.id AS activity_id, NULL::uuid AS occurrence_id, a.start_at
          FROM activity_participants p
          JOIN activities a ON a.id = p.activity_id
          JOIN circles c ON c.id = a.circle_id
          WHERE p.user_id = $1
            AND p.status = 'going'
            AND a.recurrence_type = 'one_time'
            AND a.status IN ('open', 'confirmed')
            AND a.start_at > NOW()
            AND a.start_at <= NOW() + make_interval(hours => $2)
            AND {_ACCESS}
          UNION ALL
          SELECT a.id, o.id, o.start_at
          FROM activity_occurrence_participants p
          JOIN activity_occurrences o ON o.id = p.occurrence_id
          JOIN activities a ON a.id = o.activity_id
          JOIN circles c ON c.id = a.circle_id
          WHERE p.user_id = $1
            AND p.status = 'going'
            AND a.status IN ('open', 'confirmed')
            AND o.status IN ('open', 'confirmed')
            AND o.start_at > NOW()
            AND o.start_at <= NOW() + make_interval(hours => $2)
            AND {_ACCESS}
        ) due
        ON CONFLICT (user_id, dedup_key) DO NOTHING
        """,
        user_id,
        REMINDER_HOURS,
    )
    return int(str(result).split()[-1])


_LIST_SQL = f"""
SELECT n.id, n.type, n.activity_id, n.occurrence_id, n.created_at,
       a.title, a.circle_id, a.recurrence_type,
       COALESCE(o.start_at, a.start_at) AS start_at,
       s.type AS suggestion_type,
       CASE WHEN n.type = 'activity_cancelled'
            THEN COALESCE(o.cancellation_reason, a.cancellation_reason) END AS cancellation_note,
       CASE WHEN n.occurrence_id IS NULL
            THEN COALESCE(p.status = 'going' AND p.confirmation_required, FALSE)
            ELSE COALESCE(op.status = 'going' AND op.confirmation_required, FALSE) END AS needs_reconfirmation,
       c.name AS circle_name,
       c."ritualType" AS ritual_type,
       h.display_name AS hoby_display_name,
       h.i18n_json AS hoby_i18n_json
FROM activity_notifications n
JOIN activities a ON a.id = n.activity_id
JOIN circles c ON c.id = a.circle_id
LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
LEFT JOIN activity_occurrences o ON o.id = n.occurrence_id
LEFT JOIN activity_suggestions s ON s.id = n.suggestion_id
LEFT JOIN activity_participants p ON p.activity_id = n.activity_id AND p.user_id = n.user_id
LEFT JOIN activity_occurrence_participants op ON op.occurrence_id = n.occurrence_id AND op.user_id = n.user_id
WHERE n.user_id = $1
  AND a.status <> 'draft'
  AND {_ACCESS}
ORDER BY n.created_at DESC, n.id
LIMIT {_LIST_LIMIT}
"""


def _circle_name(row: asyncpg.Record, lang: str) -> str:
    name = (row["circle_name"] or "").strip()
    if name:
        return name
    if row["hoby_display_name"]:
        return localized_display_name(
            {"display_name": row["hoby_display_name"], "i18n_json": row["hoby_i18n_json"]}, lang
        )
    return str(row["ritual_type"] or "")


async def list_activity_notifications(
    conn: asyncpg.Connection, *, user_id: UUID, lang: str = "en"
) -> list[ActivityNotification]:
    """Newest first. Only Activities the user can still open are listed; a deleted target is simply gone."""
    await add_due_reminders(conn, user_id=user_id)
    rows = await conn.fetch(_LIST_SQL, user_id)
    return [
        ActivityNotification(
            id=str(row["id"]),
            type=row["type"],
            activityId=str(row["activity_id"]),
            occurrenceId=str(row["occurrence_id"]) if row["occurrence_id"] else None,
            circleId=str(row["circle_id"]),
            circleName=_circle_name(row, lang),
            activityTitle=row["title"],
            recurring=row["recurrence_type"] == "recurring",
            startAt=row["start_at"],
            suggestionType=row["suggestion_type"],
            cancellationNote=row["cancellation_note"],
            resolved=row["type"] == "reconfirmation_required" and not row["needs_reconfirmation"],
            createdAt=row["created_at"],
        )
        for row in rows
    ]
