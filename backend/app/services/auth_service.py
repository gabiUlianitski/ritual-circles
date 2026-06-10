from __future__ import annotations

from datetime import time
from uuid import UUID, uuid4

import asyncpg
from fastapi import HTTPException

from app.auth.google_token import verify_google_id_token
from app.auth.jwt import (
    create_google_registration_token,
    create_token,
    decode_google_registration_token,
)
from app.auth.passwords import hash_password, verify_password
from app.user_fields import assert_user_name_available, validate_user_name


def _parse_time(s: str) -> time:
    parts = s.strip().split(":")
    if len(parts) not in (2, 3):
        raise ValueError("availability_time must be HH:MM or HH:MM:SS")
    hh = int(parts[0])
    mm = int(parts[1])
    ss = int(parts[2]) if len(parts) == 3 else 0
    return time(hour=hh, minute=mm, second=ss)


async def register_with_email_password(
    conn: asyncpg.Connection,
    *,
    email: str,
    password: str,
    user_name: str,
    first_name: str,
    last_name: str,
    availability_day: str,
    availability_time: str,
    city: str | None,
) -> str:
    email_norm = email.strip().lower()
    if not email_norm or "@" not in email_norm:
        raise HTTPException(status_code=400, detail="invalid email")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="password too short")

    uname = validate_user_name(user_name)
    fn = first_name.strip()
    ln = last_name.strip()
    if not fn:
        raise HTTPException(status_code=400, detail="first_name is required")
    if not ln:
        raise HTTPException(status_code=400, detail="last_name is required")

    exists = await conn.fetchrow("SELECT id FROM users WHERE LOWER(email)= $1", email_norm)
    if exists:
        raise HTTPException(status_code=409, detail="email already registered")

    await assert_user_name_available(conn, uname)

    try:
        at = _parse_time(availability_time)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user_id = uuid4()
    pw_hash = hash_password(password)

    await conn.execute(
        """
        INSERT INTO users (
          id, user_name, first_name, last_name, email, password_hash,
          city, availability_day, availability_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        user_id,
        uname,
        fn,
        ln,
        email_norm,
        pw_hash,
        city,
        availability_day,
        at,
    )
    return create_token(user_id)


async def login_with_email_password(conn: asyncpg.Connection, *, email: str, password: str) -> str:
    email_norm = email.strip().lower()
    row = await conn.fetchrow(
        """
        SELECT id, password_hash
        FROM users
        WHERE LOWER(email) = $1
        """,
        email_norm,
    )
    if not row or not row["password_hash"]:
        raise HTTPException(status_code=401, detail="invalid credentials")

    if not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")

    return create_token(row["id"])


def _names_from_google_claims(claims: dict) -> tuple[str, str]:
    given = str(claims.get("given_name") or "").strip()
    family = str(claims.get("family_name") or "").strip()
    if given or family:
        return given, family
    full = str(claims.get("name") or "").strip()
    if not full:
        return "", ""
    parts = full.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


async def authenticate_with_google(
    conn: asyncpg.Connection,
    *,
    id_token: str,
) -> dict[str, object]:
    claims = verify_google_id_token(id_token)
    google_sub = str(claims["sub"]).strip()
    email = str(claims["email"]).strip().lower()
    first_name, last_name = _names_from_google_claims(claims)

    by_sub = await conn.fetchrow(
        "SELECT id FROM users WHERE google_sub = $1",
        google_sub,
    )
    if by_sub:
        return {"status": "authenticated", "token": create_token(by_sub["id"])}

    by_email = await conn.fetchrow(
        "SELECT id, google_sub FROM users WHERE LOWER(email) = $1",
        email,
    )
    if by_email:
        if by_email["google_sub"] and str(by_email["google_sub"]) != google_sub:
            raise HTTPException(status_code=409, detail="email linked to another Google account")
        await conn.execute(
            "UPDATE users SET google_sub = $2 WHERE id = $1",
            by_email["id"],
            google_sub,
        )
        return {"status": "authenticated", "token": create_token(by_email["id"])}

    reg_token = create_google_registration_token(
        google_sub=google_sub,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    return {
        "status": "needs_profile",
        "registrationToken": reg_token,
        "email": email,
        "firstName": first_name or None,
        "lastName": last_name or None,
    }


async def complete_google_registration(
    conn: asyncpg.Connection,
    *,
    registration_token: str,
    user_name: str,
    first_name: str,
    last_name: str | None,
    availability_day: str,
    availability_time: str,
    city: str | None,
) -> str:
    try:
        data = decode_google_registration_token(registration_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Registration session expired — try Google again") from e

    google_sub = str(data["google_sub"]).strip()
    email = str(data["email"]).strip().lower()
    fn = first_name.strip() or str(data.get("first_name") or "").strip()
    ln = (last_name or "").strip() or str(data.get("last_name") or "").strip()
    if not fn:
        raise HTTPException(status_code=400, detail="first_name is required")

    if await conn.fetchrow("SELECT id FROM users WHERE google_sub = $1", google_sub):
        raise HTTPException(status_code=409, detail="Google account already registered")
    if await conn.fetchrow("SELECT id FROM users WHERE LOWER(email) = $1", email):
        raise HTTPException(status_code=409, detail="email already registered")

    uname = validate_user_name(user_name)
    await assert_user_name_available(conn, uname)

    try:
        at = _parse_time(availability_time)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user_id = uuid4()
    await conn.execute(
        """
        INSERT INTO users (
          id, user_name, first_name, last_name, email, password_hash, google_sub,
          city, availability_day, availability_time
        )
        VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)
        """,
        user_id,
        uname,
        fn,
        ln,
        email,
        google_sub,
        city,
        availability_day,
        at,
    )
    return create_token(user_id)


async def change_password(
    conn: asyncpg.Connection,
    *,
    user_id: UUID,
    current_password: str,
    new_password: str,
) -> None:
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="password too short")
    row = await conn.fetchrow(
        "SELECT password_hash FROM users WHERE id = $1",
        user_id,
    )
    if not row or not row["password_hash"]:
        raise HTTPException(
            status_code=400,
            detail="No password is set for this account. Use email registration to create a password.",
        )
    if not verify_password(current_password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    await conn.execute(
        "UPDATE users SET password_hash = $2 WHERE id = $1",
        user_id,
        hash_password(new_password),
    )
