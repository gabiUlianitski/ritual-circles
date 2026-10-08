import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.schemas import (
    CircleInvitationPreviewResponse,
    CircleInvitationResponse,
    DeviceTokenRequest,
    PasswordChangeRequest,
    ForYouIntroResponse,
    UserLanguageItem,
    UserMeResponse,
    UserUpdateRequest,
)
from app.deps import CurrentUser, conn_dep, get_current_user, get_request_lang
from app.services.auth_service import change_password
from app.user_hobbies import parse_hoby_level_key, user_hobies_from_row
from app.user_availability_windows import availability_windows_from_row
from app.user_languages import user_languages_from_row
from app.services.circle_invitations import (
    get_invitation_preview,
    list_my_invitations,
    respond_to_invitation,
)
from app.services.for_you_intro import daily_for_you_intro
from app.services.users_service import delete_account, get_user, update_device_token, upsert_user

_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

router = APIRouter(prefix="", tags=["me"])


def _optional_date_iso(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    s = str(value).strip()
    return s or None


def _user_me_from_row(row) -> UserMeResponse:
    hobbies = user_hobies_from_row(row)
    first = hobbies[0] if hobbies else None
    return UserMeResponse(
        id=str(row["id"]),
        user_name=row["user_name"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        email=row["email"],
        phone=row["phone"],
        city=row["city"],
        hometown=row.get("hometown"),
        birthDate=_optional_date_iso(row.get("birth_date")),
        workSummary=row.get("work_summary"),
        educationSummary=row.get("education_summary"),
        languages=[UserLanguageItem(**x.model_dump()) for x in user_languages_from_row(row)],
        availabilityWindows=availability_windows_from_row(row),
        availability_day=row["availability_day"],
        availability_time=str(row["availability_time"]),
        deviceToken=row["device_token"],
        userHobies=hobbies,
        preferred_hoby_slug=first.slug if first else row.get("preferred_hoby_slug"),
        preferred_hoby_level=first.level if first else parse_hoby_level_key(row.get("preferred_hoby_level")),
        preferred_hoby_subtype=first.subtype if first else row.get("preferred_hoby_subtype"),
        createdAt=row["created_at"],
        passwordSet=bool(row["password_set"]),
        onboardingCompleted=bool(row.get("onboarding_completed", False)),
        avatarUrl=(str(row["avatar_url"]).strip() if row.get("avatar_url") else None) or None,
    )


@router.get("/me/invitations", response_model=list[CircleInvitationResponse])
async def my_invitations(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> list[CircleInvitationResponse]:
    rows = await list_my_invitations(conn, user_id=user.id)
    return [CircleInvitationResponse(**row) for row in rows]


@router.get("/me/invitations/{invitationId}", response_model=CircleInvitationPreviewResponse)
async def my_invitation_preview(
    invitationId: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
    lang: str = Depends(get_request_lang),
) -> CircleInvitationPreviewResponse:
    try:
        invitation_id = UUID(invitationId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid invitationId") from e
    row = await get_invitation_preview(conn, user_id=user.id, invitation_id=invitation_id, lang=lang)
    return CircleInvitationPreviewResponse(**row)


@router.post("/me/invitations/{invitationId}/accept", response_model=CircleInvitationResponse)
async def accept_my_invitation(
    invitationId: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleInvitationResponse:
    try:
        invitation_id = UUID(invitationId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid invitationId") from e
    row = await respond_to_invitation(conn, user_id=user.id, invitation_id=invitation_id, accept=True)
    return CircleInvitationResponse(**row)


@router.post("/me/invitations/{invitationId}/decline", response_model=CircleInvitationResponse)
async def decline_my_invitation(
    invitationId: str,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> CircleInvitationResponse:
    try:
        invitation_id = UUID(invitationId.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail="invalid invitationId") from e
    row = await respond_to_invitation(conn, user_id=user.id, invitation_id=invitation_id, accept=False)
    return CircleInvitationResponse(**row)


@router.get("/me/for-you", response_model=ForYouIntroResponse)
async def for_you_intro(
    day: str = Query(min_length=10, max_length=10),
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
    lang: str = Depends(get_request_lang),
) -> ForYouIntroResponse:
    """Stored once per local day. A repeat visit the same day does not call AI."""
    if not _DAY.match(day):
        raise HTTPException(status_code=400, detail="day must be YYYY-MM-DD")
    text = await daily_for_you_intro(conn, user_id=user.id, day=day, lang=lang)
    return ForYouIntroResponse(text=text, day=day)


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> UserMeResponse:
    row = await get_user(conn, user_id=user.id)
    return _user_me_from_row(row)


@router.patch("/me", response_model=UserMeResponse)
async def patch_me(
    payload: UserUpdateRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> UserMeResponse:
    row = await upsert_user(conn, user_id=user.id, payload=payload)
    return _user_me_from_row(row)


@router.post("/me/password")
async def post_change_password(
    payload: PasswordChangeRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await change_password(
        conn,
        user_id=user.id,
        current_password=payload.currentPassword,
        new_password=payload.newPassword,
    )
    return {"ok": True}


@router.delete("/me", status_code=204)
async def delete_me(
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    await delete_account(conn, user_id=user.id)
    return Response(status_code=204)


@router.post("/me/device-token")
async def post_device_token(
    payload: DeviceTokenRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await update_device_token(conn, user_id=user.id, payload=payload)
    return {"ok": True}
