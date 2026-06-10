from __future__ import annotations

import re
from uuid import UUID

import asyncpg
from fastapi import HTTPException

USER_NAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")


def validate_user_name(raw: str) -> str:
    s = raw.strip()
    if not USER_NAME_RE.match(s):
        raise HTTPException(
            status_code=400,
            detail="user_name must be 3–32 characters: letters, numbers, and underscore only",
        )
    return s.lower()


def user_full_name(first_name: str | None, last_name: str | None) -> str:
    return f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()


def user_display_label(
    *,
    user_name: str | None,
    first_name: str | None,
    last_name: str | None,
) -> str:
    full = user_full_name(first_name, last_name)
    if full:
        return full
    if user_name and str(user_name).strip():
        return str(user_name).strip()
    return "Unknown"


async def assert_user_name_available(
    conn: asyncpg.Connection,
    user_name: str,
    *,
    exclude_user_id: UUID | None = None,
) -> None:
    taken = await conn.fetchval(
        """
        SELECT EXISTS (
          SELECT 1 FROM users
          WHERE lower(trim(user_name)) = lower(trim($1))
            AND ($2::uuid IS NULL OR id <> $2)
        )
        """,
        user_name,
        exclude_user_id,
    )
    if taken:
        raise HTTPException(status_code=409, detail="user_name already taken")
