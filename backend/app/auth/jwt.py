from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt


def _secret() -> str:
    # In dev, set JWT_SECRET in backend/.env
    return os.getenv("JWT_SECRET", "dev-secret-change-me")


def create_token(user_id: UUID, *, ttl_hours: int = 24 * 30) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_token(token: str) -> UUID:
    data = jwt.decode(token, _secret(), algorithms=["HS256"])
    return UUID(str(data["sub"]))


def create_google_registration_token(
    *,
    google_sub: str,
    email: str,
    first_name: str,
    last_name: str,
    ttl_minutes: int = 20,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "typ": "google_reg",
        "google_sub": google_sub,
        "email": email.strip().lower(),
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_google_registration_token(token: str) -> dict:
    data = jwt.decode(token, _secret(), algorithms=["HS256"])
    if data.get("typ") != "google_reg":
        raise ValueError("not a Google registration token")
    return data

