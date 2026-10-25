from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas import HomeCircleItem, HomeResponse
from app.hoby_i18n import localized_display_name
from app.services.circles_service import _circle_response_from_row
from app.services.home_activities import fetch_home_activities

_MY_CIRCLES_SQL = """
SELECT c.*,
       h.display_name AS hoby_display_name,
       h.i18n_json AS hoby_i18n_json,
       h.icon AS hoby_icon,
       COALESCE(mc.member_count, 0) AS member_count
FROM circle_members cm
JOIN circles c ON c.id = cm.circle_id
LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
LEFT JOIN (
  SELECT circle_id, COUNT(*)::int AS member_count
  FROM circle_members
  WHERE status = 'active'
  GROUP BY circle_id
) mc ON mc.circle_id = c.id
WHERE cm.user_id = $1
  AND cm.status = 'active'
ORDER BY cm.joined_at ASC, c.id ASC
"""


def _localized_hoby_name(row: asyncpg.Record, lang: str) -> str | None:
    raw = row.get("hoby_display_name")
    if not raw:
        return None
    return localized_display_name({"display_name": raw, "i18n_json": row.get("hoby_i18n_json")}, lang)


async def fetch_home(conn: asyncpg.Connection, user_id: UUID, lang: str = "en") -> HomeResponse:
    circle_rows = await conn.fetch(_MY_CIRCLES_SQL, user_id)
    upcoming_activities = await fetch_home_activities(conn, user_id, lang)

    my_circles = [
        HomeCircleItem(
            circle=_circle_response_from_row(
                row,
                hoby_name=_localized_hoby_name(row, lang),
                hoby_icon=row.get("hoby_icon"),
            ),
            isCreator=row.get("created_by") == user_id,
            memberCount=int(row["member_count"]),
        )
        for row in circle_rows
    ]
    return HomeResponse(
        circle=my_circles[0].circle if my_circles else None,
        myCircles=my_circles,
        upcomingActivities=upcoming_activities,
    )
