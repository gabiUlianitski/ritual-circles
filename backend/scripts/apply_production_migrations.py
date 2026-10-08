"""Apply pending production SQL. Uses DATABASE_URL from backend/.env.

Refuses localhost unless ALLOW_LOCAL_MIGRATE=1. Does not print the connection string.
Each file uses IF NOT EXISTS, so running this again is safe.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
PENDING = [
    "031_circle_description.sql",
    "032_user_avatar_url.sql",
    "033_circle_name.sql",
    "034_circle_invitations.sql",
]


def statements(sql: str) -> list[str]:
    buf: list[str] = []
    out: list[str] = []
    for line in sql.splitlines():
        if line.strip().startswith("--"):
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
    tail = "\n".join(buf).strip()
    if tail:
        out.append(tail)
    return out


async def main() -> None:
    load_dotenv(ROOT / "backend" / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL missing in backend/.env")
    host = url.split("@")[-1].split("/")[0].split(":")[0].lower()
    if host in {"localhost", "127.0.0.1"} and os.getenv("ALLOW_LOCAL_MIGRATE", "").strip().lower() not in {
        "1",
        "true",
        "yes",
    }:
        raise SystemExit("Refusing localhost. Point backend/.env at Supabase, or set ALLOW_LOCAL_MIGRATE=1.")
    kwargs: dict = {}
    ssl = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl in ("1", "true", "yes", "require") or "supabase.com" in url:
        kwargs["ssl"] = "require"
    names = sys.argv[1:] or PENDING
    conn = await asyncpg.connect(url, **kwargs)
    try:
        for name in names:
            path = ROOT / "db" / "migrations" / name
            if not path.is_file():
                raise SystemExit(f"Missing {path}")
            for stmt in statements(path.read_text(encoding="utf-8")):
                await conn.execute(stmt)
            print(f"applied {name}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
