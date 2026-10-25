from __future__ import annotations

import asyncpg

from app.circle_identity import circle_identity
from app.hoby_i18n import localized_display_name
from app.services.circle_next_activity import (
    SOONEST_GATHERING_CTE,
    public_next_activities,
    upcoming_activity_counts,
)
from app.services.circles_service import _meeting_display


async def get_community_preview(conn: asyncpg.Connection, *, lang: str = "en") -> dict[str, object]:
    members = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM circle_members
        WHERE status = 'active'
        """
    )
    active_circles, meetups_this_week = await upcoming_activity_counts(conn)

    rows = await conn.fetch(
        f"""
        WITH {SOONEST_GATHERING_CTE}
        SELECT c.id,
               c."ritualType" AS "ritualType",
               c."recurringTime" AS "recurringTime",
               c.city,
               c.country_code AS "countryCode",
               c.city_name AS "cityName",
               c.meeting_place AS "meetingPlace",
               c.name,
               h.display_name AS hoby_display_name_raw,
               h.icon AS "hobyIcon",
               h.i18n_json AS hoby_i18n_json,
               COALESCE(
                   (
                       SELECT COUNT(*)::int
                       FROM circle_members m
                       WHERE m.circle_id = c.id
                         AND m.status = 'active'
                   ),
                   0
               ) AS "memberCount"
        FROM circles c
        LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
        LEFT JOIN soonest_gathering sg ON sg.circle_id = c.id
        WHERE EXISTS (
            SELECT 1
            FROM circle_members m3
            WHERE m3.circle_id = c.id
              AND m3.status = 'active'
        )
        ORDER BY "memberCount" DESC, sg.start_at ASC NULLS LAST, c.id ASC
        LIMIT 3
        """
    )
    next_activities = await public_next_activities(conn, [r["id"] for r in rows])

    featured: list[dict[str, object]] = []
    for r in rows:
        hoby_row = {"display_name": r.get("hoby_display_name_raw"), "i18n_json": r.get("hoby_i18n_json")}
        hoby_display = localized_display_name(hoby_row, lang) if r.get("hoby_display_name_raw") else None
        stored, title, has_custom, _hobby = circle_identity(r.get("name"), hoby_display, r.get("ritualType"))
        featured.append(
            {
                "id": str(r["id"]),
                "ritualType": r["ritualType"],
                "recurringTime": r["recurringTime"],
                "city": _meeting_display(r),
                "countryCode": r.get("countryCode"),
                "cityName": r.get("cityName"),
                "meetingPlace": r.get("meetingPlace"),
                "memberCount": int(r["memberCount"]),
                "hobyDisplayName": hoby_display,
                "hobyIcon": r["hobyIcon"],
                "name": stored,
                "displayTitle": title,
                "hasCustomName": has_custom,
                "nextActivity": next_activities.get(r["id"]),
            }
        )

    return {
        "stats": {
            "members": int(members or 0),
            "activeCircles": active_circles,
            "meetupsThisWeek": meetups_this_week,
        },
        "featuredCircles": featured,
    }
