import asyncpg
from fastapi import APIRouter, Depends

from app.schemas import (
    DeviceTokenRequest,
    PasswordChangeRequest,
    UserLanguageItem,
    UserMeResponse,
    UserUpdateRequest,
)
from app.deps import CurrentUser, conn_dep, get_current_user
from app.services.auth_service import change_password
from app.user_hobbies import parse_hoby_level_key, user_hobies_from_row
from app.user_availability_windows import availability_windows_from_row
from app.user_languages import user_languages_from_row
from app.services.users_service import get_user, update_device_token, upsert_user

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
    )


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


@router.post("/me/device-token")
async def post_device_token(
    payload: DeviceTokenRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    await update_device_token(conn, user_id=user.id, payload=payload)
    return {"ok": True}
