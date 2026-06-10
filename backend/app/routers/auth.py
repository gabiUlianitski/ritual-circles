import asyncpg
from fastapi import APIRouter, Depends

from app.auth.google_token import google_client_id
from app.deps import conn_dep
from app.schemas import (
    AuthConfigResponse,
    AuthStartRequest,
    AuthTokenResponse,
    AuthVerifyRequest,
    GoogleAuthCompleteRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
)
from app.services.auth_service import (
    authenticate_with_google,
    complete_google_registration,
    login_with_email_password,
    register_with_email_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config", response_model=AuthConfigResponse)
async def auth_config() -> AuthConfigResponse:
    cid = google_client_id()
    return AuthConfigResponse(googleClientId=cid or None)


@router.post("/start", response_model=AuthTokenResponse)
async def auth_start(
    payload: AuthStartRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> AuthTokenResponse:
    token = await register_with_email_password(
        conn,
        email=payload.email,
        password=payload.password,
        user_name=payload.user_name,
        first_name=payload.first_name,
        last_name=payload.last_name,
        availability_day=payload.availability_day,
        availability_time=payload.availability_time,
        city=payload.city,
    )
    return AuthTokenResponse(token=token)


@router.post("/verify", response_model=AuthTokenResponse)
async def auth_verify(
    payload: AuthVerifyRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> AuthTokenResponse:
    token = await login_with_email_password(conn, email=payload.email, password=payload.password)
    return AuthTokenResponse(token=token)


@router.post("/google", response_model=GoogleAuthResponse)
async def auth_google(
    payload: GoogleAuthRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> GoogleAuthResponse:
    result = await authenticate_with_google(conn, id_token=payload.idToken)
    return GoogleAuthResponse(**result)


@router.post("/google/complete", response_model=AuthTokenResponse)
async def auth_google_complete(
    payload: GoogleAuthCompleteRequest,
    conn: asyncpg.Connection = Depends(conn_dep),
) -> AuthTokenResponse:
    token = await complete_google_registration(
        conn,
        registration_token=payload.registrationToken,
        user_name=payload.user_name,
        first_name=payload.first_name,
        last_name=payload.last_name,
        city=payload.city,
        availability_day=payload.availability_day,
        availability_time=payload.availability_time,
    )
    return AuthTokenResponse(token=token)
