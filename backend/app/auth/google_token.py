from __future__ import annotations

import os

import httpx
from fastapi import HTTPException


def google_client_id() -> str:
    return os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()


def verify_google_id_token(token: str) -> dict:
    client_id = google_client_id()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on the server")

    try:
        r = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token},
            timeout=15.0,
        )
        r.raise_for_status()
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired Google sign-in") from e

    if str(data.get("aud") or "") != client_id:
        raise HTTPException(status_code=401, detail="Google sign-in audience mismatch")
    iss = str(data.get("iss") or "")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Invalid Google sign-in issuer")

    sub = str(data.get("sub") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    if not sub or not email or "@" not in email:
        raise HTTPException(status_code=401, detail="Google account is missing email")

    verified = data.get("email_verified")
    if verified in (False, "false", "0"):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    return data
