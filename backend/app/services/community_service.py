from __future__ import annotations

import asyncpg

from app.hoby_i18n import localized_display_name
from app.services.circles_service import _meeting_display


async def get_community_preview(conn: asyncpg.Connection, *, lang: str = "en") -> dict[str, object]:
    stats = await conn.fetchrow(
        """
        SELECT
            (
                SELECT COUNT(DISTINCT a."userId")::int
                FROM attendance a
                JOIN sessions s ON s.id = a."sessionId"
                WHERE s."dateTime" >= NOW()
            ) AS members,
            (
                SELECT COUNT(DISTINCT c.id)::int
                FROM circles c
                WHERE EXISTS (
                    SELECT 1
                    FROM sessions s
                    WHERE s."circleId" = c.id
                      AND s."dateTime" >= NOW()
                )
            ) AS active_circles,
            (
                SELECT COUNT(*)::int
                FROM sessions s
                WHERE s."dateTime" >= NOW()
                  AND s."dateTime" < NOW() + INTERVAL '7 days'
            ) AS meetups_this_week
        """
    )

    rows = await conn.fetch(
        """
        SELECT c.id,
               c."ritualType" AS "ritualType",
               c."recurringTime" AS "recurringTime",
               c.city,
               c.country_code AS "countryCode",
               c.city_name AS "cityName",
               c.meeting_place AS "meetingPlace",
               h.display_name AS hoby_display_name_raw,
               h.icon AS "hobyIcon",
               h.i18n_json AS hoby_i18n_json,
               COALESCE(
                   (
                       SELECT COUNT(DISTINCT a."userId")::int
                       FROM sessions s
                       JOIN attendance a ON a."sessionId" = s.id
                       WHERE s."circleId" = c.id
                         AND s."dateTime" >= NOW()
                   ),
                   0
               ) AS "memberCount",
               (
                   SELECT MIN(s4."dateTime")
                   FROM sessions s4
                   WHERE s4."circleId" = c.id
                     AND s4."dateTime" >= NOW()
               ) AS "nextSessionAt"
        FROM circles c
        LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
        WHERE EXISTS (
            SELECT 1
            FROM sessions s3
            JOIN attendance a3 ON a3."sessionId" = s3.id
            WHERE s3."circleId" = c.id
              AND s3."dateTime" >= NOW()
        )
        ORDER BY "memberCount" DESC, "nextSessionAt" ASC NULLS LAST, c.id ASC
        LIMIT 3
        """
    )

    featured: list[dict[str, object]] = []
    for r in rows:
        hoby_row = {"display_name": r.get("hoby_display_name_raw"), "i18n_json": r.get("hoby_i18n_json")}
        hoby_display = localized_display_name(hoby_row, lang) if r.get("hoby_display_name_raw") else None
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
                "nextSessionAt": r.get("nextSessionAt"),
            }
        )

    return {
        "stats": {
            "members": int(stats["members"] or 0) if stats else 0,
            "activeCircles": int(stats["active_circles"] or 0) if stats else 0,
            "meetupsThisWeek": int(stats["meetups_this_week"] or 0) if stats else 0,
        },
        "featuredCircles": featured,
    }
