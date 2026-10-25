"""What happens next in each circle, for Discover. Session and attendance rows are not read or written here."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from app.schemas import CircleNextActivity
from app.services.activities_service import ensure_future_activity_occurrences
from app.services.activity_recurrence import ROLLING_DATES

# Same test as ensure_future_activity_occurrences, run once for many circles so the
# top-up is only called for series that are short of dates. NULL circle ids means every circle.
_SERIES_SHORT_OF_DATES_SQL = """
SELECT a.id
FROM activities a
WHERE a.recurrence_type = 'recurring'
  AND a.status IN ('open', 'confirmed')
  AND ($1::uuid[] IS NULL OR a.circle_id = ANY($1::uuid[]))
  AND (
    SELECT COUNT(*)
    FROM activity_occurrences o
    WHERE o.activity_id = a.id
      AND o.scheduled_at > NOW()
      AND o.status IN ('open', 'confirmed')
  ) < $2
"""

def _upcoming_gatherings(circle_filter: str) -> str:
    """Gatherings that have not ended: live one-time Activities and the live dates of live recurring ones.

    A recurring Activity's earliest row here is its nextOccurrence, with the date's place override applied.
    """
    return f"""
  SELECT a.circle_id,
         a.id AS activity_id,
         NULL::uuid AS occurrence_id,
         a.title,
         a.start_at,
         a.end_at,
         a.location_name,
         a.location_address,
         false AS is_recurring,
         a.status
  FROM activities a
  WHERE {circle_filter}
    AND a.recurrence_type = 'one_time'
    AND a.status IN ('open', 'confirmed')
    AND COALESCE(a.end_at, a.start_at) > NOW()
  UNION ALL
  SELECT a.circle_id,
         a.id,
         o.id,
         a.title,
         o.start_at,
         o.end_at,
         COALESCE(NULLIF(o.location_name_override, ''), a.location_name),
         COALESCE(NULLIF(o.location_address_override, ''), a.location_address),
         true,
         o.status
  FROM activity_occurrences o
  JOIN activities a ON a.id = o.activity_id
  WHERE {circle_filter}
    AND a.recurrence_type = 'recurring'
    AND a.status IN ('open', 'confirmed')
    AND o.status IN ('open', 'confirmed')
    AND COALESCE(o.end_at, o.start_at) > NOW()
"""


_NEXT_SQL = f"""
WITH upcoming AS ({_upcoming_gatherings("a.circle_id = ANY($1::uuid[])")})
SELECT DISTINCT ON (circle_id) *
FROM upcoming
ORDER BY circle_id, start_at ASC, activity_id ASC, occurrence_id ASC NULLS FIRST
"""

# For ranking: each circle's earliest upcoming gathering time. Call ensure_upcoming_dates(conn, None) first.
SOONEST_GATHERING_CTE = f"""
soonest_gathering AS (
  SELECT circle_id, MIN(start_at) AS start_at
  FROM ({_upcoming_gatherings("TRUE")}) g
  GROUP BY circle_id
)
"""

_COUNTS_SQL = f"""
WITH upcoming AS ({_upcoming_gatherings("TRUE")})
SELECT
  COUNT(DISTINCT circle_id)::int AS circles,
  (COUNT(*) FILTER (WHERE start_at < NOW() + INTERVAL '7 days'))::int AS this_week
FROM upcoming
"""


async def ensure_upcoming_dates(conn: asyncpg.Connection, circle_ids: list[UUID] | None) -> None:
    """Top up recurring series that are short of dates, through the Activity service."""
    for row in await conn.fetch(_SERIES_SHORT_OF_DATES_SQL, circle_ids, ROLLING_DATES):
        await ensure_future_activity_occurrences(conn, row["id"])


@dataclass(frozen=True)
class NextGathering:
    """The selected gathering, internal only. Never returned to a client as is."""

    activity_id: UUID
    occurrence_id: UUID | None
    title: str
    start_at: datetime
    end_at: datetime | None
    location_name: str | None
    location_address: str | None
    is_recurring: bool
    status: str


async def next_gatherings_for_circles(
    conn: asyncpg.Connection, circle_ids: list[UUID]
) -> dict[UUID, NextGathering]:
    """One query for all circles. Circles with nothing upcoming are absent from the result."""
    if not circle_ids:
        return {}
    await ensure_upcoming_dates(conn, circle_ids)
    rows = await conn.fetch(_NEXT_SQL, circle_ids)
    return {
        row["circle_id"]: NextGathering(
            activity_id=row["activity_id"],
            occurrence_id=row["occurrence_id"],
            title=row["title"],
            start_at=row["start_at"],
            end_at=row["end_at"],
            location_name=row["location_name"],
            location_address=row["location_address"],
            is_recurring=bool(row["is_recurring"]),
            status=row["status"],
        )
        for row in rows
    }


def public_next_activity(gathering: NextGathering) -> CircleNextActivity:
    """What anyone who can see the circle may learn: that something is planned, and when.

    The catalog, community preview and invitation preview are open to guests, non-members and
    pending invitees, so title, place, address, ids and headcount stay with the Activity APIs.
    """
    return CircleNextActivity(
        startAt=gathering.start_at,
        endAt=gathering.end_at,
        isRecurring=gathering.is_recurring,
    )


async def public_next_activities(
    conn: asyncpg.Connection, circle_ids: list[UUID]
) -> dict[UUID, CircleNextActivity]:
    selected = await next_gatherings_for_circles(conn, circle_ids)
    return {circle_id: public_next_activity(gathering) for circle_id, gathering in selected.items()}


async def upcoming_activity_counts(conn: asyncpg.Connection) -> tuple[int, int]:
    """Circles with an upcoming gathering, and gatherings starting in the next 7 days, across all circles."""
    await ensure_upcoming_dates(conn, None)
    row = await conn.fetchrow(_COUNTS_SQL)
    return int(row["circles"] or 0), int(row["this_week"] or 0)
