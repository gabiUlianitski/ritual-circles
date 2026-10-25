"""Upcoming Activities the user joined, for Home. Session and attendance rows are not read or written here."""

from __future__ import annotations

from uuid import UUID

import asyncpg

from app.circle_identity import circle_identity
from app.hoby_i18n import localized_display_name
from app.schemas import ActivityParticipation, HomeActivityItem
from app.services.activities_service import ensure_future_activity_occurrences

HOME_ACTIVITY_LIMIT = 48

_JOINED_SERIES_SQL = """
SELECT DISTINCT o.activity_id
FROM activity_occurrence_participants p
JOIN activity_occurrences o ON o.id = p.occurrence_id
JOIN activities a ON a.id = o.activity_id
WHERE p.user_id = $1
  AND p.status = 'going'
  AND a.recurrence_type = 'recurring'
  AND a.status IN ('open', 'confirmed')
  AND COALESCE(o.end_at, o.start_at) > NOW()
"""

# Circle membership alone adds nothing: every row needs the user's own 'going' place.
# Only circles the user can still open are shown (active member or creator).
_UPCOMING_SQL = """
WITH entries AS (
  SELECT
    a.id AS activity_id,
    NULL::uuid AS occurrence_id,
    a.start_at,
    a.end_at,
    a.location_name,
    a.location_address,
    a.status,
    p.confirmation_required,
    (
      SELECT COUNT(*)::int
      FROM activity_participants g
      WHERE g.activity_id = a.id AND g.status = 'going'
    ) AS going_count
  FROM activity_participants p
  JOIN activities a ON a.id = p.activity_id
  WHERE p.user_id = $1
    AND p.status = 'going'
    AND a.recurrence_type = 'one_time'
    AND a.status IN ('open', 'confirmed')
    AND COALESCE(a.end_at, a.start_at) > NOW()
  UNION ALL
  SELECT
    a.id,
    o.id,
    o.start_at,
    o.end_at,
    COALESCE(NULLIF(o.location_name_override, ''), a.location_name),
    COALESCE(NULLIF(o.location_address_override, ''), a.location_address),
    o.status,
    p.confirmation_required,
    (
      SELECT COUNT(*)::int
      FROM activity_occurrence_participants g
      WHERE g.occurrence_id = o.id AND g.status = 'going'
    )
  FROM activity_occurrence_participants p
  JOIN activity_occurrences o ON o.id = p.occurrence_id
  JOIN activities a ON a.id = o.activity_id
  WHERE p.user_id = $1
    AND p.status = 'going'
    AND a.recurrence_type = 'recurring'
    AND a.status IN ('open', 'confirmed')
    AND o.status IN ('open', 'confirmed')
    AND COALESCE(o.end_at, o.start_at) > NOW()
)
SELECT
  e.*,
  a.circle_id,
  a.title,
  a.group_size,
  a.recurrence_type,
  a.payment_type,
  a.price_amount,
  a.currency,
  c.name AS circle_name,
  c."ritualType" AS ritual_type,
  h.display_name AS hoby_display_name,
  h.i18n_json AS hoby_i18n_json,
  h.icon AS hoby_icon
FROM entries e
JOIN activities a ON a.id = e.activity_id
JOIN circles c ON c.id = a.circle_id
LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
WHERE c.created_by = $1
   OR EXISTS (
     SELECT 1 FROM circle_members m
     WHERE m.circle_id = c.id AND m.user_id = $1 AND m.status = 'active'
   )
ORDER BY e.start_at ASC, e.activity_id ASC, e.occurrence_id ASC NULLS FIRST
LIMIT $2
"""


def _hoby_name(row: asyncpg.Record, lang: str) -> str | None:
    raw = row["hoby_display_name"]
    if not raw:
        return None
    return localized_display_name({"display_name": raw, "i18n_json": row["hoby_i18n_json"]}, lang)


def _item(row: asyncpg.Record, lang: str) -> HomeActivityItem:
    hoby_name = _hoby_name(row, lang)
    _stored, circle_title, _has_name, _hobby = circle_identity(row["circle_name"], hoby_name, row["ritual_type"])
    size = int(row["group_size"])
    going = int(row["going_count"] or 0)
    return HomeActivityItem(
        activityId=str(row["activity_id"]),
        occurrenceId=None if row["occurrence_id"] is None else str(row["occurrence_id"]),
        circleId=str(row["circle_id"]),
        circleName=circle_title,
        title=row["title"],
        ritualType=row["ritual_type"],
        hobyDisplayName=hoby_name,
        hobyIcon=row["hoby_icon"],
        isRecurring=row["recurrence_type"] == "recurring",
        startAt=row["start_at"],
        endAt=row["end_at"],
        locationName=row["location_name"],
        locationAddress=row["location_address"],
        paymentType=row["payment_type"],
        priceAmount=row["price_amount"],
        currency=row["currency"],
        status=row["status"],
        participation=ActivityParticipation(
            goingCount=going,
            groupSize=size,
            remainingPlaces=max(size - going, 0),
            isFull=going >= size,
            currentUserStatus="going",
            confirmationRequired=bool(row["confirmation_required"]),
        ),
    )


async def fetch_home_activities(conn: asyncpg.Connection, user_id: UUID, lang: str = "en") -> list[HomeActivityItem]:
    """Joined one-time Activities and joined recurring dates that have not ended, earliest first."""
    for activity_id in await conn.fetch(_JOINED_SERIES_SQL, user_id):
        await ensure_future_activity_occurrences(conn, activity_id["activity_id"])
    rows = await conn.fetch(_UPCOMING_SQL, user_id, HOME_ACTIVITY_LIMIT)
    return [_item(row, lang) for row in rows]
