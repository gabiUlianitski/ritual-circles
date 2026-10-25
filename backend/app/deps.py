from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, HTTPException, Request

from app.auth.jwt import decode_token
from app.security_config import is_hobby_admin, security_config
from app.hoby_i18n import normalize_app_lang

from app.db import acquire_conn

logger = logging.getLogger(__name__)


async def conn_dep(request: Request):
    async for conn in acquire_conn(request):
        yield conn


@dataclass(frozen=True)
class CurrentUser:
    id: UUID


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    conn: asyncpg.Connection = Depends(conn_dep),
) -> CurrentUser:
    # Preferred: Bearer JWT (email+password auth)
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            return CurrentUser(id=decode_token(token))
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token") from e

    if x_user_id:
        if not security_config().allow_dev_user_header:
            logger.warning("Rejected disabled development authentication header")
            raise HTTPException(status_code=401, detail="Missing auth")
        try:
            user_id = UUID(x_user_id)
        except ValueError as e:
            raise HTTPException(status_code=401, detail="Invalid X-User-Id") from e
        try:
            exists = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", user_id)
        except Exception as e:
            logger.exception("Development authentication user lookup failed")
            raise HTTPException(status_code=401, detail="Invalid X-User-Id") from e
        if not exists:
            raise HTTPException(status_code=401, detail="Invalid X-User-Id")
        return CurrentUser(id=user_id)

    raise HTTPException(status_code=401, detail="Missing auth")


async def get_optional_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    conn: asyncpg.Connection = Depends(conn_dep),
) -> CurrentUser | None:
    """Read-only endpoints that guests may browse without an account."""
    try:
        return await get_current_user(
            authorization=authorization,
            x_user_id=x_user_id,
            conn=conn,
        )
    except HTTPException:
        return None


async def require_hobby_admin(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    if not is_hobby_admin(user.id):
        logger.warning("Denied Hobby administration mutation")
        raise HTTPException(status_code=403, detail="Hobby admin required")
    return user

def get_request_lang(
    accept_language: str | None = Header(default=None, alias="Accept-Language"),
) -> str:
    return normalize_app_lang(accept_language)

