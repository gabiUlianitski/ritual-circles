"""In-app circle invitations. Acceptance uses the existing join transaction."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.circle_identity import circle_identity
from app.hoby_i18n import localized_display_name
from app.services.circles_service import _complete_join_transaction, _optional_text


def _display_name(first: object, last: object, user_name: object) -> str:
    full = f"{first or ''} {last or ''}".strip()
    return full or str(user_name or "").strip() or "Member"


async def _circle_for_organizer(conn: asyncpg.Connection, *, circle_id: UUID, user_id: UUID) -> asyncpg.Record:
    circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1", circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")
    if circle.get("created_by") != user_id:
        raise HTTPException(status_code=403, detail="Only the circle organizer can invite")
    return circle


def _invitation_payload(row: asyncpg.Record) -> dict[str, object]:
    _stored, title, _custom, _hobby = circle_identity(row.get("circle_name"), row.get("ritualType"), row.get("ritualType"))
    return {
        "id": str(row["id"]),
        "circleId": str(row["circle_id"]),
        "status": row["status"],
        "createdAt": row["created_at"],
        "circleTitle": title,
        "inviterName": _display_name(row["inviter_first"], row["inviter_last"], row["inviter_user_name"]),
        "inviteeId": str(row["invitee_user_id"]),
        "inviteeName": _display_name(row["invitee_first"], row["invitee_last"], row["invitee_user_name"]),
    }


_INVITATION_SELECT = """
SELECT i.id, i.circle_id, i.status, i.created_at, i.invitee_user_id,
       c.name AS circle_name, c."ritualType" AS "ritualType",
       inviter.first_name AS inviter_first, inviter.last_name AS inviter_last, inviter.user_name AS inviter_user_name,
       invitee.first_name AS invitee_first, invitee.last_name AS invitee_last, invitee.user_name AS invitee_user_name
FROM circle_invitations i
JOIN circles c ON c.id = i.circle_id
JOIN users inviter ON inviter.id = i.inviter_user_id
JOIN users invitee ON invitee.id = i.invitee_user_id
"""


_REASON_TEXT = {
    "en": {
        "listed": "Interested in {hobby}",
        "preferred": "{hobby} is one of their primary interests",
        "played": "Participates in {hobby} activities",
        "city": "Also in {city}",
    },
    "he": {
        "listed": "מתעניין/ת ב{hobby}",
        "preferred": "{hobby} הוא אחד מתחומי העניין העיקריים שלהם",
        "played": "משתתף/ת בפעילויות {hobby}",
        "city": "גם ב{city}",
    },
}


def candidate_reason_label(
    *,
    listed: bool,
    preferred: bool,
    played: bool,
    same_city: bool,
    hobby_name: str,
    city_name: str,
    lang: str,
) -> str | None:
    """One plain reason. Higher tiers win. No score is returned."""
    pack = _REASON_TEXT["he" if lang == "he" else "en"]
    hobby = hobby_name.strip() or "this hobby"
    if listed and hobby:
        return pack["listed"].format(hobby=hobby)
    if preferred and hobby:
        return pack["preferred"].format(hobby=hobby)
    if played and hobby:
        return pack["played"].format(hobby=hobby)
    if same_city and city_name.strip():
        return pack["city"].format(city=city_name.strip())
    return None


async def search_invitation_candidates(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    circle_id: UUID,
    query: str,
    same_city: bool,
    lang: str = "en",
) -> list[dict[str, object]]:
    circle = await _circle_for_organizer(conn, circle_id=circle_id, user_id=user_id)
    ritual = str(circle.get("ritualType") or "").strip().lower()
    city = str(circle.get("city_name") or circle.get("city") or "").strip()
    q = query.strip()
    hoby_row = await conn.fetchrow(
        """
        SELECT display_name, i18n_json
        FROM hobies
        WHERE lower(trim(slug)) = $1
        LIMIT 1
        """,
        ritual,
    )
    hobby_name = localized_display_name(hoby_row, lang) if hoby_row and hoby_row.get("display_name") else ritual
    rows = await conn.fetch(
        """
        SELECT u.id, u.first_name, u.last_name, u.user_name, u.city, u.avatar_url,
               (lower(trim(COALESCE(u.preferred_hoby_slug, ''))) = $3) AS preferred_match,
               EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(u.user_hobies_json, '[]'::jsonb)) elem
                 WHERE lower(COALESCE(elem->>'slug', '')) = $3
               ) AS listed_hobby,
               EXISTS (
                 SELECT 1
                 FROM attendance a
                 JOIN sessions s ON s.id = a."sessionId"
                 JOIN circles other ON other.id = s."circleId"
                 WHERE a."userId" = u.id
                   AND other.id <> $1
                   AND lower(trim(other."ritualType")) = $3
               ) AS played_hobby,
               ($7 <> '' AND lower(trim(COALESCE(u.city, ''))) = lower($7)) AS same_city_match
        FROM users u
        WHERE u.id <> $2
          AND (
            $4 <> ''
            OR lower(trim(COALESCE(u.preferred_hoby_slug, ''))) = $3
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(u.user_hobies_json, '[]'::jsonb)) elem
              WHERE lower(COALESCE(elem->>'slug', '')) = $3
            )
            OR EXISTS (
              SELECT 1
              FROM attendance a
              JOIN sessions s ON s.id = a."sessionId"
              JOIN circles other ON other.id = s."circleId"
              WHERE a."userId" = u.id
                AND other.id <> $1
                AND lower(trim(other."ritualType")) = $3
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM attendance a
            JOIN sessions s ON s.id = a."sessionId"
            WHERE s."circleId" = $1
              AND a."userId" = u.id
              AND s."dateTime" >= NOW()
          )
          AND NOT EXISTS (
            SELECT 1
            FROM circle_invitations i
            WHERE i.circle_id = $1
              AND i.invitee_user_id = u.id
              AND i.status = 'pending'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM circle_invitations d
            WHERE d.circle_id = $1
              AND d.invitee_user_id = u.id
              AND d.status = 'declined'
              AND (d.responded_at IS NULL OR d.responded_at >= NOW() - INTERVAL '30 days')
          )
          AND (
            $4 = ''
            OR u.first_name ILIKE '%' || $4 || '%'
            OR u.last_name ILIKE '%' || $4 || '%'
            OR u.user_name ILIKE '%' || $4 || '%'
            OR (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) ILIKE '%' || $4 || '%'
          )
          AND (
            $5 = false
            OR $6 = ''
            OR lower(trim(COALESCE(u.city, ''))) = lower($6)
          )
        ORDER BY
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(u.user_hobies_json, '[]'::jsonb)) elem
              WHERE lower(COALESCE(elem->>'slug', '')) = $3
            ) THEN 1
            WHEN lower(trim(COALESCE(u.preferred_hoby_slug, ''))) = $3 THEN 2
            ELSE 3
          END,
          CASE WHEN $7 <> '' AND lower(trim(COALESCE(u.city, ''))) = lower($7) THEN 0 ELSE 1 END,
          u.first_name ASC,
          u.last_name ASC
        LIMIT 20
        """,
        circle_id,
        user_id,
        ritual,
        q,
        same_city and bool(city),
        city.lower(),
        city.lower(),
    )
    out: list[dict[str, object]] = []
    for r in rows:
        person_city = (str(r["city"]).strip() if r["city"] else None) or None
        out.append(
            {
                "id": str(r["id"]),
                "displayName": _display_name(r["first_name"], r["last_name"], r["user_name"]),
                "city": person_city,
                "avatarUrl": (str(r["avatar_url"]).strip() if r["avatar_url"] else None) or None,
                "reasonLabel": candidate_reason_label(
                    listed=bool(r["listed_hobby"]),
                    preferred=bool(r["preferred_match"]),
                    played=bool(r["played_hobby"]),
                    same_city=bool(r["same_city_match"]),
                    hobby_name=hobby_name or ritual,
                    city_name=person_city or "",
                    lang=lang,
                ),
            }
        )
    return out


async def list_circle_invitations(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID
) -> list[dict[str, object]]:
    await _circle_for_organizer(conn, circle_id=circle_id, user_id=user_id)
    rows = await conn.fetch(
        _INVITATION_SELECT + " WHERE i.circle_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC",
        circle_id,
    )
    return [_invitation_payload(r) for r in rows]


def invitee_listed_hobby(preferred: object, hobbies_json: object, ritual: str) -> bool:
    """True when this person already listed the circle's hobby. Does not read their level."""
    slug = ritual.strip().lower()
    if not slug:
        return False
    if str(preferred or "").strip().lower() == slug:
        return True
    data: object = hobbies_json
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return False
    if not isinstance(data, list):
        return False
    for item in data:
        if isinstance(item, dict) and str(item.get("slug") or "").strip().lower() == slug:
            return True
    return False


def _preview_payload(row: Any, lang: str) -> dict[str, object]:
    hoby_row = {"display_name": row.get("hoby_display_name_raw"), "i18n_json": row.get("hoby_i18n_json")}
    hoby_name = localized_display_name(hoby_row, lang) if row.get("hoby_display_name_raw") else None
    ritual = str(row.get("ritualType") or "")
    stored, title, has_custom, hobby_label = circle_identity(row.get("circle_name"), hoby_name, ritual)
    icon = _optional_text(row.get("hoby_icon"))
    matched = invitee_listed_hobby(row.get("preferred_hoby_slug"), row.get("user_hobies_json"), ritual)
    city_name = _optional_text(row.get("city_name"))
    meeting_place = _optional_text(row.get("meeting_place"))
    city = _optional_text(row.get("city"))
    return {
        "id": str(row["id"]),
        "circleId": str(row["circle_id"]),
        "status": row["status"],
        "inviterName": _display_name(row["inviter_first"], row["inviter_last"], row["inviter_user_name"]),
        "title": title,
        "name": stored,
        "hasCustomName": has_custom,
        "ritualType": ritual,
        "hobyDisplayName": hobby_label or hoby_name,
        "hobyIcon": icon,
        "description": _optional_text(row.get("description")),
        "recurringTime": str(row.get("recurringTime") or ""),
        "isRecurring": bool(row.get("is_recurring", True)),
        "nextSessionAt": row.get("next_session_at"),
        "modality": str(row.get("modality") or "offline"),
        "city": city,
        "cityName": city_name,
        "meetingPlace": meeting_place,
        "memberCount": int(row.get("member_count") or 0),
        "maxSize": int(row.get("maxSize") or 6),
        "matchedHobbyName": (hobby_label or hoby_name) if matched else None,
    }


_PREVIEW_SELECT = """
SELECT i.id, i.circle_id, i.status, i.invitee_user_id,
       c.name AS circle_name,
       c."ritualType" AS "ritualType",
       c.modality,
       c."recurringTime" AS "recurringTime",
       COALESCE(c.is_recurring, true) AS is_recurring,
       c.city,
       c.city_name,
       c.meeting_place,
       c.description,
       c."maxSize" AS "maxSize",
       inviter.first_name AS inviter_first,
       inviter.last_name AS inviter_last,
       inviter.user_name AS inviter_user_name,
       invitee.preferred_hoby_slug,
       invitee.user_hobies_json,
       h.display_name AS hoby_display_name_raw,
       h.icon AS hoby_icon,
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
       ) AS member_count,
       (
           SELECT MIN(s4."dateTime")
           FROM sessions s4
           WHERE s4."circleId" = c.id
             AND s4."dateTime" >= NOW()
       ) AS next_session_at
FROM circle_invitations i
JOIN circles c ON c.id = i.circle_id
JOIN users inviter ON inviter.id = i.inviter_user_id
JOIN users invitee ON invitee.id = i.invitee_user_id
LEFT JOIN hobies h ON lower(trim(h.slug)) = lower(trim(c."ritualType"))
"""


async def get_invitation_preview(
    conn: asyncpg.Connection, *, user_id: UUID, invitation_id: UUID, lang: str
) -> dict[str, object]:
    """Circle facts for the invitee while the invitation is still pending.

    Missing, someone else's, or already answered invitations all look the same: not found.
    This does not grant membership and does not return the invite code or member identities.
    """
    row = await conn.fetchrow(_PREVIEW_SELECT + " WHERE i.id = $1", invitation_id)
    if not row or row["invitee_user_id"] != user_id or row["status"] != "pending":
        raise HTTPException(status_code=404, detail="invitation not found")
    return _preview_payload(row, lang)


async def list_my_invitations(conn: asyncpg.Connection, *, user_id: UUID) -> list[dict[str, object]]:
    rows = await conn.fetch(
        _INVITATION_SELECT + " WHERE i.invitee_user_id = $1 AND i.status = 'pending' ORDER BY i.created_at DESC",
        user_id,
    )
    return [_invitation_payload(r) for r in rows]


async def create_invitation(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID, invitee_id: UUID
) -> dict[str, object]:
    if invitee_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot invite yourself")
    async with conn.transaction():
        circle = await conn.fetchrow("SELECT * FROM circles WHERE id = $1 FOR UPDATE", circle_id)
        if not circle:
            raise HTTPException(status_code=404, detail="circle not found")
        if circle.get("created_by") != user_id:
            raise HTTPException(status_code=403, detail="Only the circle organizer can invite")
        invitee = await conn.fetchrow("SELECT id FROM users WHERE id = $1", invitee_id)
        if not invitee:
            raise HTTPException(status_code=404, detail="person not found")
        member_count = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT a."userId")::int
            FROM attendance a
            JOIN sessions s ON s.id = a."sessionId"
            WHERE s."circleId" = $1 AND s."dateTime" >= NOW()
            """,
            circle_id,
        )
        if int(member_count or 0) >= int(circle["maxSize"]):
            raise HTTPException(status_code=409, detail="circle is full")
        already = await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1 FROM attendance a
              JOIN sessions s ON s.id = a."sessionId"
              WHERE s."circleId" = $1 AND a."userId" = $2 AND s."dateTime" >= NOW()
            )
            """,
            circle_id,
            invitee_id,
        )
        if already:
            raise HTTPException(status_code=409, detail="This person is already in the circle")
        invitation_id = uuid4()
        try:
            await conn.execute(
                """
                INSERT INTO circle_invitations (id, circle_id, inviter_user_id, invitee_user_id, status)
                VALUES ($1, $2, $3, $4, 'pending')
                """,
                invitation_id,
                circle_id,
                user_id,
                invitee_id,
            )
        except asyncpg.UniqueViolationError as e:
            raise HTTPException(status_code=409, detail="This person already has a pending invitation") from e
    row = await conn.fetchrow(_INVITATION_SELECT + " WHERE i.id = $1", invitation_id)
    if not row:
        raise HTTPException(status_code=500, detail="invitation was not saved")
    return _invitation_payload(row)


async def open_shared_circle_link(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID
) -> dict[str, object]:
    """Turn a shared circle link into the signed-in user's pending invitation.

    The link identifies the circle by id. The organizer is recorded as the inviter.
    An existing pending invitation is reused. Membership still happens only on accept.
    """
    circle = await conn.fetchrow(
        'SELECT id, created_by, "maxSize" FROM circles WHERE id = $1',
        circle_id,
    )
    if not circle:
        raise HTTPException(status_code=404, detail="circle not found")

    already_member = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1 FROM attendance a
          JOIN sessions s ON s.id = a."sessionId"
          WHERE s."circleId" = $1 AND a."userId" = $2 AND s."dateTime" >= NOW()
        )
        """,
        circle_id,
        user_id,
    )
    if already_member or circle["created_by"] == user_id:
        return {"circleId": str(circle_id), "invitationId": None, "alreadyMember": True}

    pending = await conn.fetchrow(
        """
        SELECT id FROM circle_invitations
        WHERE circle_id = $1 AND invitee_user_id = $2 AND status = 'pending'
        """,
        circle_id,
        user_id,
    )
    if pending:
        return {"circleId": str(circle_id), "invitationId": str(pending["id"]), "alreadyMember": False}

    member_count = await conn.fetchval(
        """
        SELECT COUNT(DISTINCT a."userId")::int
        FROM attendance a
        JOIN sessions s ON s.id = a."sessionId"
        WHERE s."circleId" = $1 AND s."dateTime" >= NOW()
        """,
        circle_id,
    )
    if int(member_count or 0) >= int(circle["maxSize"]):
        raise HTTPException(status_code=409, detail="circle is full")

    invitation_id = uuid4()
    try:
        await conn.execute(
            """
            INSERT INTO circle_invitations (id, circle_id, inviter_user_id, invitee_user_id, status)
            VALUES ($1, $2, $3, $4, 'pending')
            """,
            invitation_id,
            circle_id,
            circle["created_by"],
            user_id,
        )
    except asyncpg.UniqueViolationError:
        pending = await conn.fetchrow(
            """
            SELECT id FROM circle_invitations
            WHERE circle_id = $1 AND invitee_user_id = $2 AND status = 'pending'
            """,
            circle_id,
            user_id,
        )
        if not pending:
            raise
        invitation_id = pending["id"]
    return {"circleId": str(circle_id), "invitationId": str(invitation_id), "alreadyMember": False}


async def cancel_invitation(
    conn: asyncpg.Connection, *, user_id: UUID, circle_id: UUID, invitation_id: UUID
) -> dict[str, object]:
    await _circle_for_organizer(conn, circle_id=circle_id, user_id=user_id)
    row = await conn.fetchrow(
        """
        UPDATE circle_invitations
        SET status = 'canceled', canceled_at = NOW()
        WHERE id = $1 AND circle_id = $2 AND status = 'pending'
        RETURNING id
        """,
        invitation_id,
        circle_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="pending invitation not found")
    saved = await conn.fetchrow(_INVITATION_SELECT + " WHERE i.id = $1", invitation_id)
    return _invitation_payload(saved)


async def respond_to_invitation(
    conn: asyncpg.Connection, *, user_id: UUID, invitation_id: UUID, accept: bool
) -> dict[str, object]:
    async with conn.transaction():
        invitation = await conn.fetchrow(
            """
            SELECT * FROM circle_invitations
            WHERE id = $1
            FOR UPDATE
            """,
            invitation_id,
        )
        if not invitation or invitation["invitee_user_id"] != user_id:
            raise HTTPException(status_code=404, detail="invitation not found")
        if invitation["status"] != "pending":
            raise HTTPException(status_code=409, detail="invitation is no longer pending")
        if accept:
            circle = await conn.fetchrow(
                "SELECT * FROM circles WHERE id = $1 FOR UPDATE",
                invitation["circle_id"],
            )
            if not circle:
                raise HTTPException(status_code=404, detail="circle not found")
            await _complete_join_transaction(conn, user_id=user_id, circle=circle)
            await conn.execute(
                """
                UPDATE circle_invitations
                SET status = 'accepted', responded_at = NOW()
                WHERE id = $1
                """,
                invitation_id,
            )
        else:
            await conn.execute(
                """
                UPDATE circle_invitations
                SET status = 'declined', responded_at = NOW()
                WHERE id = $1
                """,
                invitation_id,
            )
    saved = await conn.fetchrow(_INVITATION_SELECT + " WHERE i.id = $1", invitation_id)
    return _invitation_payload(saved)
