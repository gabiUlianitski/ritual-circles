from __future__ import annotations

import json
import secrets
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
from app.circle_identity import circle_identity
from app.hoby_i18n import localized_display_name
from app.services.circle_members import activate_member, is_active_member, leave_member
from app.services.circle_next_activity import public_next_activities
from app.user_hobbies import user_can_join_circle
from app.services.users_service import ensure_user_hobby

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


def _optional_text(raw: object) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _identity_kwargs(name: object, hobby_display_name: object, ritual_type: object) -> dict[str, object]:
    stored, title, has_custom, _hobby = circle_identity(name, hobby_display_name, ritual_type)
    return {"name": stored, "displayTitle": title, "hasCustomName": has_custom}


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
        description=_optional_text(row.get("description")),
        **_identity_kwargs(row.get("name"), hoby_name, row.get("ritualType")),
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
    already_member = await is_active_member(conn, user_id=user_id, circle_id=circle_id)
    if already_member:
        await activate_member(conn, user_id=user_id, circle_id=circle_id)
        return

    user_row = await conn.fetchrow(
        """
        SELECT user_hobies_json, preferred_hoby_slug, preferred_hoby_level, preferred_hoby_subtype
        FROM users
        WHERE id = $1
        """,
        user_id,
    )
    if not user_row:
        raise HTTPException(status_code=400, detail="user must exist before joining a circle")

    if not user_can_join_circle(user_row, circle):
        # Joining is the intent: adopt the circle's hobby instead of blocking.
        await ensure_user_hobby(
            conn,
            user_id=user_id,
            slug=str(circle.get("ritualType") or ""),
            preferred_level=circle.get("ritual_level"),
            subtype=circle.get("ritual_subtype"),
        )

    await activate_member(conn, user_id=user_id, circle_id=circle_id)


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

    # Creating a circle for a hobby means you do it: keep the profile in step.
    await ensure_user_hobby(
        conn,
        user_id=user_id,
        slug=payload.ritualType,
        preferred_level=payload.ritualLevel,
        subtype=payload.ritualSubtype,
    )

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
                  cost_payment_json, "inviteCode", created_by, invite_only, is_recurring, description, name
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
                _optional_text(payload.description),
                payload.name,
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

        await activate_member(conn, user_id=user_id, circle_id=circle_id)

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
        description=_optional_text(payload.description),
        **_identity_kwargs(payload.name, hoby_name, payload.ritualType),
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
        if circle["created_by"] == user_id:
            raise HTTPException(status_code=403, detail="You created this circle")

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
                detail="This circle is invite-only. Ask the organizer to invite you.",
            )
        if circle["created_by"] == user_id:
            raise HTTPException(status_code=403, detail="You created this circle")

        await _complete_join_transaction(conn, user_id=user_id, circle=circle)

    return await _join_circle_response(conn, circle, lang)


async def _delete_circle_if_no_future_members(conn: asyncpg.Connection, *, circle_id: UUID) -> None:
    """Remove the circle when nobody belongs to it anymore."""
    remaining = await conn.fetchval(
        """
        SELECT COUNT(*)::int
        FROM circle_members
        WHERE circle_id = $1 AND status = 'active'
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
    meeting_place_update: MeetingPlacePatch | None = None,
    description: str | None = None,
    update_description: bool = False,
    name: str | None = None,
    update_name: bool = False,
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
        max_size = _max_size_from_group_size(group_size)
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

    if update_description:
        await conn.execute(
            "UPDATE circles SET description = $1 WHERE id = $2",
            _optional_text(description),
            circle_id,
        )

    if update_name:
        await conn.execute(
            "UPDATE circles SET name = $1 WHERE id = $2",
            name,
            circle_id,
        )

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

    member = await is_active_member(conn, user_id=user_id, circle_id=circle_id)
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

    left = await leave_member(conn, user_id=user_id, circle_id=circle_id)
    if not left:
        raise HTTPException(status_code=404, detail="not a member of this circle")

    await _delete_circle_if_no_future_members(conn, circle_id=circle_id)


async def get_circle_me(conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID | None = None):
    if circle_id is not None:
        circle_row = await conn.fetchrow(
            """
            SELECT c.*
            FROM circles c
            WHERE c.id = $1
              AND EXISTS (
                SELECT 1
                FROM circle_members m
                WHERE m.user_id = $2
                  AND m.circle_id = c.id
                  AND m.status = 'active'
              )
            """,
            circle_id,
            user_id,
        )
    else:
        circle_row = await conn.fetchrow(
            """
            WITH my_circle AS (
              SELECT m.circle_id
              FROM circle_members m
              WHERE m.user_id = $1
                AND m.status = 'active'
              ORDER BY m.joined_at ASC
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
               u.preferred_hoby_subtype,
               u.avatar_url
        FROM users u
        WHERE u.id IN (
            SELECT m.user_id
            FROM circle_members m
            WHERE m.circle_id = $1
              AND m.status = 'active'
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


async def list_circles_catalog(conn: asyncpg.Connection, *, user_id: UUID, lang: str = "en") -> list[dict[str, object]]:
    """Every circle, with member counts and its next Activity. Invite codes omitted.

    A circle is listed whether or not it has Sessions or Activities.
    """
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
               c.description,
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
               ) AS "memberCount",
               EXISTS (
                   SELECT 1
                   FROM circle_members m2
                   WHERE m2.circle_id = c.id
                     AND m2.user_id = $1
                     AND m2.status = 'active'
               ) AS "isYours",
               (c.created_by = $1) AS "isCreator",
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
        ORDER BY c."ritualType" ASC, c.id ASC
        """,
        user_id,
    )
    next_activities = await public_next_activities(conn, [r["id"] for r in rows])
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
                "description": _optional_text(r.get("description")),
                **_identity_kwargs(r.get("name"), hoby_display, r.get("ritualType")),
                "groupSize": _group_size_from_json(r.get("group_size_json")),
                "costPayment": _cost_payment_from_json(r.get("cost_payment_json")),
                "inviteOnly": bool(r["inviteOnly"]),
                "nextActivity": next_activities.get(r["id"]),
                "messagesLastWeek": int(r.get("messagesLastWeek") or 0),
                "messagesToday": int(r.get("messagesToday") or 0),
            }
        )
    return out

