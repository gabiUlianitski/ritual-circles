"""Apply db/migrations/029_user_onboarding_completed.sql using backend/.env"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


async def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL missing")
    kwargs: dict = {}
    ssl = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl in ("1", "true", "yes", "require") or "supabase.com" in url:
        kwargs["ssl"] = "require"
    conn = await asyncpg.connect(url, **kwargs)
    try:
        await conn.execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true"
        )
        await conn.execute("ALTER TABLE users ALTER COLUMN onboarding_completed SET DEFAULT false")
        print("applied 029_user_onboarding_completed")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
