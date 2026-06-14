from __future__ import annotations

from uuid import UUID

import asyncpg

from app.schemas import (
    AttendanceResponse,
    CircleResponse,
    HomeCalendarSession,
    HomeCircleItem,
    HomeResponse,
    SessionResponse,
)
from app.hoby_i18n import localized_display_name
from app.services.circles_service import _circle_response_from_row
from app.services.session_replenish import ensure_future_sessions_for_user

_FUTURE_ATTENDANCE_SQL = """
SELECT
  c.id AS circle_id,
  c."ritualType" AS ritual_type,
  c.modality,
  c.ritual_level,
  c.ritual_subtype,
  c."recurringTime" AS recurring_time,
  COALESCE(c.is_recurring, true) AS circle_is_recurring,
  NULLIF(TRIM(COALESCE(c.meeting_place, c.city)), '') AS circle_city,
  c.country_code AS circle_country_code,
  c.city_name AS circle_city_name,
  c.meeting_place AS circle_meeting_place,
  c."maxSize" AS max_size,
  c."inviteCode" AS invite_code,
  c.invite_only AS circle_invite_only,
  c.created_by AS circle_created_by,
  h.display_name AS hoby_display_name,
  h.i18n_json AS hoby_i18n_json,
  h.icon AS hoby_icon,
  s.id AS session_id,
  s."circleId" AS session_circle_id,
  s."dateTime" AS session_datetime,
  s."locationOrLink" AS session_location_or_link,
  a.status AS att_status,
  (
    SELECT COUNT(*)::int
    FROM attendance a_cnt
    WHERE a_cnt."sessionId" = s.id
      AND a_cnt.status = 'attending'
  ) AS attending_count,
  (
    SELECT COUNT(DISTINCT a_mem."userId")::int
    FROM attendance a_mem
    JOIN sessions s_mem ON s_mem.id = a_mem."sessionId"
    WHERE s_mem."circleId" = c.id
      AND s_mem."dateTime" >= NOW()
  ) AS member_count
FROM attendance a
JOIN sessions s ON s.id = a."sessionId"
JOIN circles c ON c.id = s."circleId"
LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
WHERE a."userId" = $1
  AND s."dateTime" >= NOW()
ORDER BY s."dateTime" ASC
LIMIT 48
"""


def _localized_hoby_name(row: asyncpg.Record, lang: str) -> str | None:
    raw = row.get("hoby_display_name")
    if not raw:
        return None
    return localized_display_name({"display_name": raw, "i18n_json": row.get("hoby_i18n_json")}, lang)


def _circle_from_row(row: asyncpg.Record, lang: str = "en") -> CircleResponse:
    cc_raw = row.get("circle_country_code")
    cc_in = str(cc_raw).strip() if cc_raw is not None else None
    cn_raw = row.get("circle_city_name")
    mp_raw = row.get("circle_meeting_place")
    circle_row = {
        "id": row["circle_id"],
        "ritualType": row["ritual_type"],
        "modality": row["modality"],
        "recurringTime": row["recurring_time"],
        "is_recurring": row.get("circle_is_recurring", True),
        "city": row["circle_city"],
        "country_code": cc_in,
        "city_name": cn_raw,
        "meeting_place": mp_raw,
        "maxSize": row["max_size"],
        "inviteCode": row["invite_code"],
        "invite_only": row.get("circle_invite_only"),
        "ritual_level": row.get("ritual_level"),
        "ritual_subtype": row.get("ritual_subtype"),
    }
    return _circle_response_from_row(
        circle_row,  # type: ignore[arg-type]
        hoby_name=_localized_hoby_name(row, lang),
        hoby_icon=row.get("hoby_icon"),
    )


def _session_from_row(row: asyncpg.Record) -> SessionResponse:
    return SessionResponse(
        id=str(row["session_id"]),
        circleId=str(row["session_circle_id"]),
        dateTime=row["session_datetime"],
        locationOrLink=row["session_location_or_link"],
    )


def _attendance_from_row(row: asyncpg.Record, user_id: UUID) -> AttendanceResponse:
    return AttendanceResponse(
        userId=str(user_id),
        sessionId=str(row["session_id"]),
        status=row["att_status"],
    )


def _pending_confirmation(status: str | None) -> bool:
    return status != "attending"


async def fetch_home(conn: asyncpg.Connection, user_id: UUID, lang: str = "en") -> HomeResponse:
    await ensure_future_sessions_for_user(conn, user_id=user_id)
    rows = await conn.fetch(_FUTURE_ATTENDANCE_SQL, user_id)

    if not rows:
        return HomeResponse(circle=None, nextSession=None, myAttendance=None, myCircles=[], calendarSessions=[])

    primary = rows[0]
    circle = _circle_from_row(primary, lang)
    session = _session_from_row(primary)
    my_att = _attendance_from_row(primary, user_id)

    seen_circles: set[str] = set()
    my_circles: list[HomeCircleItem] = []
    calendar_sessions: list[HomeCalendarSession] = []

    for row in rows:
        sess = _session_from_row(row)
        att = _attendance_from_row(row, user_id)
        cal_item = HomeCalendarSession(
            session=sess,
            circleId=str(row["session_circle_id"]),
            ritualType=row["ritual_type"],
            hobyDisplayName=_localized_hoby_name(row, lang),
            hobyIcon=row.get("hoby_icon"),
            myAttendance=att,
            attendingCount=int(row.get("attending_count") or 0),
            memberCount=int(row.get("member_count") or 0),
            maxSize=int(row.get("max_size") or 6),
        )
        calendar_sessions.append(cal_item)

        cid = str(row["circle_id"])
        if cid in seen_circles:
            continue
        seen_circles.add(cid)
        c = _circle_from_row(row, lang)
        created_by = row.get("circle_created_by")
        is_creator = created_by is not None and created_by == user_id
        my_circles.append(
            HomeCircleItem(
                circle=c,
                nextSession=sess,
                myAttendance=att,
                pendingConfirmation=_pending_confirmation(row.get("att_status")),
                isCreator=is_creator,
            )
        )

    return HomeResponse(
        circle=circle,
        nextSession=session,
        myAttendance=my_att,
        myCircles=my_circles,
        calendarSessions=calendar_sessions,
    )
