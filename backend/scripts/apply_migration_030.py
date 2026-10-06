"""Apply db/migrations/030_hoby_archived.sql using backend/.env"""
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
    host = url.split("@")[-1].split("/")[0].split(":")[0].lower()
    if host in {"localhost", "127.0.0.1"} and os.getenv("ALLOW_LOCAL_MIGRATE", "").strip().lower() not in {"1", "true", "yes"}:
        raise SystemExit("Refusing localhost. Point backend/.env at Supabase, or set ALLOW_LOCAL_MIGRATE=1.")
    kwargs: dict = {}
    ssl = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl in ("1", "true", "yes", "require") or "supabase.com" in url:
        kwargs["ssl"] = "require"
    conn = await asyncpg.connect(url, **kwargs)
    try:
        await conn.execute("ALTER TABLE hobies ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL")
        exists = await conn.fetchval(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'hobies' AND column_name = 'archived_at'
            """
        )
        print("applied 030_hoby_archived" if exists else "column_missing")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
