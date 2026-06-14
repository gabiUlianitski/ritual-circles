from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.schemas import (
    CircleCreateRequest,
    CirclePaymentSpec,
    CircleResponse,
    GroupSizeSpec,
    JoinCircleResponse,
    MeetingPlacePatch,
)
from app.hoby_i18n import localized_display_name
from app.services.session_replenish import ensure_future_sessions_for_circle, ensure_future_sessions_for_user
from app.user_hobbies import user_can_join_circle
from app.services.time_utils import next_occurrence_utc, next_session_datetime_after


def _ritual_level_for_db(value: str | int | None) -> str | None:
    """PostgreSQL ritual_level is TEXT; clients may send numeric level keys (1, 2, …)."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _meeting_line_from_row(row: asyncpg.Record | dict[str, object]) -> str:
    mp = row.get("meeting_place") or row.get("meetingPlace")
    if mp is not None and str(mp).strip():
        return str(mp).strip()
    c = row.get("city")
    if c is not None and str(c).strip():
        return str(c).strip()
    return ""


def _meeting_display(row: asyncpg.Record | dict[str, object]) -> str | None:
    s = _meeting_line_from_row(row)
    return s or None


def _norm_country_code(code: str | None) -> str | None:
    if not code or not str(code).strip():
        return None
    u = str(code).strip().upper()
    if len(u) == 2 and u.isalpha():
        return u
    return None


def _norm_label(s: str | None) -> str | None:
    if not s or not str(s).strip():
        return None
    return str(s).strip()


def _group_size_from_json(raw: object) -> GroupSizeSpec | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    try:
        return GroupSizeSpec.model_validate(raw)
    except Exception:
        return None


def _group_size_to_json(spec: GroupSizeSpec | None) -> dict[str, object] | None:
    if spec is None:
        return None
    payload: dict[str, object] = {"type": spec.type}
    if spec.min is not None:
        payload["min"] = spec.min
    if spec.max is not None:
        payload["max"] = spec.max
    return payload


def _max_size_from_group_size(spec: GroupSizeSpec | None) -> int:
    if spec is None:
        return 6
    cap = 6
    if spec.type == "fixed":
        n = spec.min if spec.min is not None else spec.max or 6
        return min(cap, max(1, n))
    if spec.type == "max":
        return min(cap, max(1, spec.max or 6))
    if spec.type == "min":
        return cap
    if spec.type == "range":
        return min(cap, max(1, spec.max or 6))
    return 6


def _cost_payment_from_json(raw: object) -> CirclePaymentSpec | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    try:
        return CirclePaymentSpec.model_validate(raw)
    except Exception:
        return None


def _cost_payment_to_json(spec: CirclePaymentSpec | None) -> dict[str, object] | None:
    if spec is None:
        return None
    payload: dict[str, object] = {"type": spec.type, "currency": spec.currency}
    if spec.totalCost is not None:
        payload["totalCost"] = spec.totalCost
    if spec.pricePerPerson is not None:
        payload["pricePerPerson"] = spec.pricePerPerson
    if spec.paymentNote:
        payload["paymentNote"] = spec.paymentNote
    return payload


def _circle_response_from_row(
    row: asyncpg.Record,
    *,
    hoby_name: str | None,
    hoby_icon: str | None,
) -> CircleResponse:
    invite_only = bool(row.get("invite_only", True))
    cc_raw = row.get("country_code") or row.get("countryCode")
    cc_in = str(cc_raw).strip() if cc_raw is not None else None
    cn_val = row.get("city_name") or row.get("cityName")
    mp_val = row.get("meeting_place") or row.get("meetingPlace")
    return CircleResponse(
        id=str(row["id"]),
        ritualType=row["ritualType"],
        modality=row["modality"],
        recurringTime=row["recurringTime"],
        city=_meeting_display(row),
        countryCode=_norm_country_code(cc_in),
        cityName=_norm_label(str(cn_val) if cn_val is not None else None),
        meetingPlace=_norm_label(str(mp_val) if mp_val is not None else None),
        maxSize=int(row["maxSize"]),
        groupSize=_group_size_from_json(row.get("group_size_json")),
        costPayment=_cost_payment_from_json(row.get("cost_payment_json")),
        inviteCode=row["inviteCode"],
        inviteOnly=invite_only,
        ritualLevel=row.get("ritual_level"),
        ritualSubtype=row.get("ritual_subtype"),
        hobyDisplayName=hoby_name,
        hobyIcon=hoby_icon,
        isRecurring=bool(row.get("is_recurring", row.get("isRecurring", True))),
    )


async def hoby_meta_for_ritual_type(
    conn: asyncpg.Connection,
    ritual_type: str,
    lang: str = "en",
) -> tuple[str | None, str | None]:
    row = await conn.fetchrow(
        """
        SELECT display_name, icon, i18n_json
        FROM hobies
        WHERE lower(trim(slug)) = lower(trim($1))
        LIMIT 1
        """,
        ritual_type,
    )
    if not row:
        return None, None
    return localized_display_name(row, lang), row.get("icon")


async def _generate_unique_invite_code(conn: asyncpg.Connection) -> str:
    for _ in range(10):
        code = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
        exists = await conn.fetchrow('SELECT 1 FROM circles WHERE "inviteCode" = $1', code)
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Failed to generate invite code")


async def _complete_join_transaction(
    conn: asyncpg.Connection, *, user_id: UUID, circle: asyncpg.Record
) -> None:
    circle_id: UUID = circle["id"]
    await ensure_future_sessions_for_circle(conn, circle_id=circle_id)

    already_member = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1
          FROM attendance a
          JOIN sessions s ON s.id = a."sessionId"
          WHERE s."circleId" = $1
            AND a."userId" = $2
            AND s."dateTime" >= NOW()
        )
        """,
        circle_id,
        user_id,
    )
    if already_member:
        return

    member_count_row = await conn.fetchrow(
        """
        SELECT COUNT(DISTINCT a."userId") AS ct
        FROM attendance a
        JOIN sessions s ON s.id = a."sessionId"
        WHERE s."circleId" = $1
          AND s."dateTime" >= NOW()
        """,
        circle_id,
    )
    member_count = int(member_count_row["ct"] or 0)
    max_size = int(circle["maxSize"])
    if member_count >= max_size:
        raise HTTPException(status_code=409, detail="circle is full")

    user_row = await conn.fetchrow(
        """
        SELECT user_hobies_json, preferred_hoby_slug, preferred_hoby_level, preferred_hoby_subtype
        FROM users
        WHERE id = $1
        """,
        user_id,
    )
    if not user_row or not user_can_join_circle(user_row, circle):
        raise HTTPException(
            status_code=403,
            detail="Add this circle's hobby with your level on your profile before joining",
        )

    future_sessions = await conn.fetch(
        """
        SELECT id
        FROM sessions
        WHERE "circleId" = $1
          AND "dateTime" >= NOW()
        ORDER BY "dateTime" ASC
        """,
        circle_id,
    )
    if not future_sessions:
        raise HTTPException(status_code=409, detail="circle has no upcoming sessions")

    for srow in future_sessions:
        await conn.execute(
            """
            INSERT INTO attendance ("userId", "sessionId", status)
            VALUES ($1, $2, 'not_attending')
            ON CONFLICT ("userId", "sessionId") DO NOTHING
            """,
            user_id,
            srow["id"],
        )


async def _join_circle_response(conn: asyncpg.Connection, circle: asyncpg.Record, lang: str = "en") -> JoinCircleResponse:
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, circle["ritualType"], lang)
    return JoinCircleResponse(circle=_circle_response_from_row(circle, hoby_name=hoby_name, hoby_icon=hoby_icon))


async def create_circle(
    conn: asyncpg.Connection, *, user_id: UUID, payload: CircleCreateRequest, lang: str = "en"
) -> CircleResponse:
    line = ""
    if payload.meetingPlace and str(payload.meetingPlace).strip():
        line = str(payload.meetingPlace).strip()
    elif payload.city and str(payload.city).strip():
        line = str(payload.city).strip()

    if payload.modality == "offline" and not line:
        raise HTTPException(
            status_code=400,
            detail="meeting place required for offline circles (meetingPlace or city)",
        )

    cc = _norm_country_code(payload.countryCode) if payload.modality == "offline" else None
    cn = _norm_label(payload.cityName) if payload.modality == "offline" else None
    mp = line if payload.modality == "offline" else None

    exists = await conn.fetchrow("SELECT 1 FROM users WHERE id = $1", user_id)
    if not exists:
        raise HTTPException(status_code=400, detail="user must exist before creating a circle")

    circle_id = uuid4()
    invite_code = await _generate_unique_invite_code(conn)
    group_size = payload.groupSize
    max_size = _max_size_from_group_size(group_size)
    group_size_json = _group_size_to_json(group_size)
    cost_payment_json = _cost_payment_to_json(payload.costPayment)

    async with conn.transaction():
        try:
            await conn.execute(
                """
                INSERT INTO circles (
                  id, "ritualType", ritual_level, ritual_subtype, modality, "recurringTime",
                  city, country_code, city_name, meeting_place, "maxSize", group_size_json,
                  cost_payment_json, "inviteCode", created_by, invite_only, is_recurring
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                """,
                circle_id,
                payload.ritualType,
                _ritual_level_for_db(payload.ritualLevel),
                payload.ritualSubtype,
                payload.modality,
                payload.recurringTime,
                None,
                cc,
                cn,
                mp,
                max_size,
                json.dumps(group_size_json) if group_size_json is not None else None,
                json.dumps(cost_payment_json) if cost_payment_json is not None else None,
                invite_code,
                user_id,
                payload.inviteOnly,
                payload.isRecurring,
            )
        except asyncpg.exceptions.DataError as e:
            msg = str(e).lower()
            if "ritual_level" in msg and "integer" in msg:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Database ritual_level column must be TEXT (e.g. advanced, beginner). "
                        "Apply db/migrations/020_circle_ritual_level_text.sql."
                    ),
                ) from e
            raise

        if payload.firstSessionAt is not None:
            first_dt = payload.firstSessionAt
            if first_dt.tzinfo is None:
                first_dt = first_dt.replace(tzinfo=timezone.utc)
            else:
                first_dt = first_dt.astimezone(timezone.utc)
        else:
            first_dt = next_occurrence_utc(payload.recurringTime)
        session_ids: list[UUID] = []
        dt = first_dt
        loc_offline = line if payload.modality == "offline" else None
        session_count = 6 if payload.isRecurring else 1
        for _ in range(session_count):
            session_id = uuid4()
            session_ids.append(session_id)
            location_or_link = "https://example.com/meeting" if payload.modality == "online" else (loc_offline or "TBD")
            await conn.execute(
                """
                INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
                VALUES ($1, $2, $3, $4)
                """,
                session_id,
                circle_id,
                dt.astimezone(timezone.utc),
                location_or_link,
            )
            if payload.isRecurring:
                dt = next_session_datetime_after(dt, payload.recurringTime)

        for session_id in session_ids:
            await conn.execute(
                """
                INSERT INTO attendance ("userId", "sessionId", status)
                VALUES ($1, $2, 'not_attending')
                """,
                user_id,
                session_id,
            )

    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, payload.ritualType, lang)
    return CircleResponse(
        id=str(circle_id),
        ritualType=payload.ritualType,
        modality=payload.modality,
        recurringTime=payload.recurringTime,
        city=line if payload.modality == "offline" else None,
        countryCode=cc,
        cityName=cn,
        meetingPlace=mp,
        maxSize=max_size,
        groupSize=group_size,
        costPayment=payload.costPayment,
        inviteCode=invite_code,
        inviteOnly=payload.inviteOnly,
        ritualLevel=payload.ritualLevel,
        ritualSubtype=payload.ritualSubtype,
        hobyDisplayName=hoby_name,
        hobyIcon=hoby_icon,
        isRecurring=payload.isRecurring,
    )


async def join_circle(conn: asyncpg.Connection, *, user_id: UUID, invite_code: str, lang: str = "en") -> JoinCircleResponse:
    async with conn.transaction():
        circle = await conn.fetchrow(
            """
            SELECT *
            FROM circles
            WHERE "inviteCode" = $1
            FOR UPDATE
            """,
            invite_code,
        )
        if not circle:
            raise HTTPException(status_code=404, detail="circle not found")

        await _complete_join_transaction(conn, user_id=user_id, circle=circle)

    return await _join_circle_response(conn, circle, lang)


async def join_circle_open(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID, lang: str = "en") -> JoinCircleResponse:
    async with conn.transaction():
        circle = await conn.fetchrow(
            """
            SELECT *
            FROM circles
            WHERE id = $1
            FOR UPDATE
            """,
            circle_id,
        )
        if not circle:
            raise HTTPException(status_code=404, detail="circle not found")
        if bool(circle.get("invite_only", True)):
            raise HTTPException(
                status_code=403,
                detail="This circle is invite-only; join with an invite code",
            )

        await _complete_join_transaction(conn, user_id=user_id, circle=circle)

    return await _join_circle_response(conn, circle, lang)


async def _delete_circle_if_no_future_members(conn: asyncpg.Connection, *, circle_id: UUID) -> None:
    """Remove circle (and cascaded sessions/messages) when nobody is on future sessions."""
    remaining = await conn.fetchval(
        """
        SELECT COUNT(DISTINCT a."userId")::int
        FROM sessions s
        JOIN attendance a ON a."sessionId" = s.id
        WHERE s."circleId" = $1
          AND s."dateTime" >= NOW()
        """,
        circle_id,
    )
    if int(remaining or 0) == 0:
        await conn.execute("DELETE FROM circles WHERE id = $1", circle_id)


async def patch_circle(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    invite_only: bool | None = None,
    group_size: GroupSizeSpec | None = None,
    cost_payment: CirclePaymentSpec | None = None,
    first_session_at: datetime | None = None,
    recurring_time: str | None = None,
    is_recurring: bool | None = None,
    meeting_place_update: MeetingPlacePatch | None = None,
    lang: str = "en",
) -> CircleResponse:
    circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the circle creator can update circle settings")

    if invite_only is not None:
        await conn.execute(
            "UPDATE circles SET invite_only = $1 WHERE id = $2",
            invite_only,
            circle_id,
        )

    if group_size is not None:
        member_count_row = await conn.fetchrow(
            """
            SELECT COUNT(DISTINCT a."userId") AS ct
            FROM attendance a
            JOIN sessions s ON s.id = a."sessionId"
            WHERE s."circleId" = $1
              AND s."dateTime" >= NOW()
            """,
            circle_id,
        )
        member_count = int(member_count_row["ct"] or 0)
        max_size = _max_size_from_group_size(group_size)
        if member_count > max_size:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Group size allows at most {max_size} people, "
                    f"but {member_count} have already joined"
                ),
            )
        group_size_json = _group_size_to_json(group_size)
        await conn.execute(
            'UPDATE circles SET group_size_json = $1::jsonb, "maxSize" = $2 WHERE id = $3',
            json.dumps(group_size_json) if group_size_json is not None else None,
            max_size,
            circle_id,
        )

    if cost_payment is not None:
        cost_payment_json = _cost_payment_to_json(cost_payment)
        await conn.execute(
            "UPDATE circles SET cost_payment_json = $1::jsonb WHERE id = $2",
            json.dumps(cost_payment_json) if cost_payment_json is not None else None,
            circle_id,
        )

    schedule_updated = False
    if first_session_at is not None and recurring_time is not None and is_recurring is not None:
        from app.services.circle_suggestions import apply_circle_time_schedule

        async with conn.transaction():
            await apply_circle_time_schedule(
                conn,
                circle_id=circle_id,
                anchor=first_session_at,
                recurring_time=recurring_time,
                is_recurring=is_recurring,
            )
        schedule_updated = True

    if meeting_place_update is not None:
        from app.services.circle_suggestions import apply_circle_meeting_place

        async with conn.transaction():
            await apply_circle_meeting_place(
                conn,
                circle_id=circle_id,
                name=meeting_place_update.name,
                city=meeting_place_update.city,
                address=meeting_place_update.address,
            )

    if schedule_updated and is_recurring:
        await ensure_future_sessions_for_circle(conn, circle_id=circle_id)

    updated = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    hoby_name, hoby_icon = await hoby_meta_for_ritual_type(conn, updated["ritualType"], lang)
    return _circle_response_from_row(updated, hoby_name=hoby_name, hoby_icon=hoby_icon)


async def drop_circle(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> None:
    """Creator deletes the circle for everyone (cascade sessions/attendance/messages)."""
    circle = await conn.fetchrow(
        'SELECT id, created_by FROM circles WHERE id = $1',
        circle_id,
    )
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the circle creator can delete this circle")

    member = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1
          FROM attendance a
          JOIN sessions s ON s.id = a."sessionId"
          WHERE s."circleId" = $1
            AND a."userId" = $2
            AND s."dateTime" >= NOW()
        )
        """,
        circle_id,
        user_id,
    )
    if not member:
        raise HTTPException(status_code=404, detail="not a member of this circle")

    await conn.execute("DELETE FROM circles WHERE id = $1", circle_id)


async def leave_circle(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID) -> None:
    circle = await conn.fetchrow("SELECT created_by FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle["created_by"] == user_id:
        raise HTTPException(
            status_code=403,
            detail="Circle creators must delete the circle instead of leaving",
        )

    deleted = await conn.fetchval(
        """
        WITH del AS (
          DELETE FROM attendance a
          USING sessions s
          WHERE a."sessionId" = s.id
            AND a."userId" = $1
            AND s."circleId" = $2
            AND s."dateTime" >= NOW()
          RETURNING 1
        )
        SELECT COUNT(*)::int FROM del
        """,
        user_id,
        circle_id,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="not a member of this circle")

    await _delete_circle_if_no_future_members(conn, circle_id=circle_id)


async def get_circle_me(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID | None = None):
    await ensure_future_sessions_for_user(conn, user_id=user_id)

    if circle_id is not None:
        circle_row = await conn.fetchrow(
            """
            SELECT c.*
            FROM circles c
            WHERE c.id = $1
              AND EXISTS (
                SELECT 1
                FROM attendance a
                JOIN sessions s ON s.id = a."sessionId"
                WHERE a."userId" = $2
                  AND s."circleId" = c.id
                  AND s."dateTime" >= NOW()
              )
            """,
            circle_id,
            user_id,
        )
    else:
        circle_row = await conn.fetchrow(
            """
            WITH my_circle AS (
              SELECT s."circleId" AS circle_id
              FROM attendance a
              JOIN sessions s ON s.id = a."sessionId"
              WHERE a."userId" = $1
                AND s."dateTime" >= NOW()
              ORDER BY s."dateTime" ASC
              LIMIT 1
            )
            SELECT c.*
            FROM circles c
            JOIN my_circle mc ON mc.circle_id = c.id
            """,
            user_id,
        )
    if not circle_row:
        return None, []

    resolved_circle_id: UUID = circle_row["id"]

    member_rows = await conn.fetch(
        """
        SELECT u.id,
               u.user_name,
               u.first_name,
               u.last_name,
               u.city,
               u.availability_windows_json,
               u.availability_day,
               u.availability_time::text AS availability_time,
               u.user_hobies_json,
               u.preferred_hoby_slug,
               u.preferred_hoby_level,
               u.preferred_hoby_subtype
        FROM users u
        WHERE u.id IN (
            SELECT DISTINCT a."userId"
            FROM attendance a
            JOIN sessions s ON s.id = a."sessionId"
            WHERE s."circleId" = $1
              AND s."dateTime" >= NOW()
        )
        ORDER BY u.first_name ASC, u.last_name ASC, u.user_name ASC
        """,
        resolved_circle_id,
    )
    # Defensive: one entry per user (duplicate names => separate accounts, not duplicate rows).
    members_by_id: dict[UUID, asyncpg.Record] = {}
    for row in member_rows:
        members_by_id[row["id"]] = row
    members = sorted(
        members_by_id.values(),
        key=lambda r: (r["first_name"] or "", r["last_name"] or "", r["user_name"] or "", str(r["id"])),
    )

    return circle_row, members


async def get_next_session_attendance_roster(
    conn: asyncpg.Connection,
    *,
    circle_id: UUID,
) -> dict[str, object] | None:
    rows = await conn.fetch(
        """
        WITH next_s AS (
            SELECT s.id, s."dateTime"
            FROM sessions s
            WHERE s."circleId" = $1
              AND s."dateTime" >= NOW()
            ORDER BY s."dateTime" ASC
            LIMIT 1
        )
        SELECT
            ns.id AS session_id,
            ns."dateTime" AS session_datetime,
            u.id AS user_id,
            u.user_name,
            u.first_name,
            u.last_name,
            a.status
        FROM next_s ns
        JOIN attendance a ON a."sessionId" = ns.id
        JOIN users u ON u.id = a."userId"
        ORDER BY u.first_name ASC, u.last_name ASC, u.user_name ASC
        """,
        circle_id,
    )
    if not rows:
        return None
    return {
        "sessionId": str(rows[0]["session_id"]),
        "dateTime": rows[0]["session_datetime"],
        "members": [
            {
                "userId": str(r["user_id"]),
                "user_name": r["user_name"],
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "status": r["status"],
            }
            for r in rows
        ],
    }


async def list_circles_catalog(conn: asyncpg.Connection, *, user_id: UUID, lang: str = "en") -> list[dict[str, object]]:
    """Circles that still have future sessions, with member counts. Invite codes omitted."""
    rows = await conn.fetch(
        """
        SELECT c.id,
               c."ritualType" AS "ritualType",
               c.ritual_level AS "ritualLevel",
               c.ritual_subtype AS "ritualSubtype",
               c."recurringTime" AS "recurringTime",
               COALESCE(c.is_recurring, true) AS "isRecurring",
               c.city,
               c.country_code AS "countryCode",
               c.city_name AS "cityName",
               c.meeting_place AS "meetingPlace",
               c."maxSize" AS "maxSize",
               c.group_size_json AS group_size_json,
               c.cost_payment_json AS cost_payment_json,
               c.invite_only AS "inviteOnly",
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
               EXISTS (
                   SELECT 1
                   FROM sessions s2
                   JOIN attendance a2 ON a2."sessionId" = s2.id
                   WHERE s2."circleId" = c.id
                     AND s2."dateTime" >= NOW()
                     AND a2."userId" = $1
               ) AS "isYours",
               (c.created_by = $1) AS "isCreator",
               (
                   SELECT MIN(s4."dateTime")
                   FROM sessions s4
                   WHERE s4."circleId" = c.id
                     AND s4."dateTime" >= NOW()
               ) AS "nextSessionAt",
               COALESCE(
                   (
                       SELECT COUNT(*)::int
                       FROM circle_messages cm
                       WHERE cm.circle_id = c.id
                         AND cm.created_at >= NOW() - INTERVAL '7 days'
                   ),
                   0
               ) AS "messagesLastWeek",
               COALESCE(
                   (
                       SELECT COUNT(*)::int
                       FROM circle_messages cm2
                       WHERE cm2.circle_id = c.id
                         AND cm2.created_at >= NOW() - INTERVAL '1 day'
                   ),
                   0
               ) AS "messagesToday"
        FROM circles c
        LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
        WHERE EXISTS (
            SELECT 1
            FROM sessions s3
            JOIN attendance a3 ON a3."sessionId" = s3.id
            WHERE s3."circleId" = c.id
              AND s3."dateTime" >= NOW()
        )
        ORDER BY c."ritualType" ASC, c.id ASC
        """,
        user_id,
    )
    out: list[dict[str, object]] = []
    for r in rows:
        hoby_row = {"display_name": r.get("hoby_display_name_raw"), "i18n_json": r.get("hoby_i18n_json")}
        hoby_display = localized_display_name(hoby_row, lang) if r.get("hoby_display_name_raw") else None
        out.append(
            {
                "id": str(r["id"]),
                "ritualType": r["ritualType"],
                "recurringTime": r["recurringTime"],
                "isRecurring": bool(r["isRecurring"]),
                "city": _meeting_display(r),
                "countryCode": r.get("countryCode"),
                "cityName": r.get("cityName"),
                "meetingPlace": r.get("meetingPlace"),
                "maxSize": int(r["maxSize"]),
                "memberCount": int(r["memberCount"]),
                "isYours": bool(r["isYours"]),
                "isCreator": bool(r["isCreator"]),
                "ritualLevel": r["ritualLevel"],
                "ritualSubtype": r["ritualSubtype"],
                "hobyDisplayName": hoby_display,
                "hobyIcon": r["hobyIcon"],
                "groupSize": _group_size_from_json(r.get("group_size_json")),
                "costPayment": _cost_payment_from_json(r.get("cost_payment_json")),
                "inviteOnly": bool(r["inviteOnly"]),
                "nextSessionAt": r.get("nextSessionAt"),
                "messagesLastWeek": int(r.get("messagesLastWeek") or 0),
                "messagesToday": int(r.get("messagesToday") or 0),
            }
        )
    return out

