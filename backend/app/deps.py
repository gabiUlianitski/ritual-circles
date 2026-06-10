from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request

from app.auth.jwt import decode_token

from app.db import acquire_conn


@dataclass(frozen=True)
class CurrentUser:
    id: UUID


async def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> CurrentUser:
    # Preferred: Bearer JWT (email+password auth)
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            return CurrentUser(id=decode_token(token))
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token") from e

    # Dev/back-compat: X-User-Id
    if x_user_id:
        try:
            user_id = UUID(x_user_id)
        except ValueError as e:
            raise HTTPException(status_code=401, detail="Invalid X-User-Id") from e
        return CurrentUser(id=user_id)

    raise HTTPException(status_code=401, detail="Missing auth")


async def conn_dep(request: Request):
    async for conn in acquire_conn(request):
        yield conn

