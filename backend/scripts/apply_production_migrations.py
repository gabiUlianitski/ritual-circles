"""Apply pending production SQL. Uses DATABASE_URL from backend/.env.

Refuses localhost unless ALLOW_LOCAL_MIGRATE=1. Never prints the connection string.
Each file uses IF NOT EXISTS, so running this again is safe.

Execution is statement by statement in autocommit mode. A file is NOT atomic:
if statement 3 of a file fails, statements 1-2 of that file stay applied.
The runner stops at the first failure, names the file and statement number,
and exits with status 1. Fix the cause and run it again.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "db" / "migrations"
PENDING = [
    "031_circle_description.sql",
    "032_user_avatar_url.sql",
    "033_circle_name.sql",
    "034_circle_invitations.sql",
    "035_hoby_daily_insight.sql",
    "036_hobby_insights.sql",
    "037_discovery_description_for_you.sql",
    "038_circle_members.sql",
    "039_activities.sql",
    "040_activity_participants.sql",
    "041_activity_lifecycle.sql",
    "042_activity_occurrence_participants.sql",
    "043_activity_suggestions.sql",
    "044_activity_occurrence_slots.sql",
    "045_activity_notifications.sql",
    "046_activity_attendance_outcomes.sql",
    "047_activity_min_participants.sql",
    "048_suggestion_created_notification.sql",
]
TRUE_VALUES = {"1", "true", "yes"}


def statements(sql: str) -> list[str]:
    """Split on lines ending with ';'. Does not understand $$ blocks; 031-047 have none."""
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


def target_url(*, allow_local: bool) -> str:
    load_dotenv(ROOT / "backend" / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL missing in backend/.env")
    host = url.split("@")[-1].split("/")[0].split(":")[0].lower()
    if host in {"localhost", "127.0.0.1"} and not allow_local:
        raise SystemExit("Refusing localhost. Point backend/.env at Supabase, or set ALLOW_LOCAL_MIGRATE=1.")
    return url


def connect_kwargs(url: str) -> dict:
    ssl = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl in ("1", "true", "yes", "require") or "supabase.com" in url:
        return {"ssl": "require"}
    return {}


def _failure_reason(exc: Exception) -> str:
    if isinstance(exc, asyncpg.PostgresError):
        return f"{type(exc).__name__} (SQLSTATE {exc.sqlstate}): {exc.args[0] if exc.args else ''}"
    return type(exc).__name__


async def main() -> int:
    names = sys.argv[1:] or PENDING
    missing = [name for name in names if not (MIGRATIONS / name).is_file()]
    if missing:
        print("Missing migration files: " + ", ".join(missing))
        return 1

    allow_local = os.getenv("ALLOW_LOCAL_MIGRATE", "").strip().lower() in TRUE_VALUES
    url = target_url(allow_local=allow_local)
    try:
        conn = await asyncpg.connect(url, **connect_kwargs(url))
    except Exception as exc:
        print(f"Could not connect to the target database ({type(exc).__name__}).")
        return 1

    completed: list[str] = []
    try:
        for name in names:
            parts = statements((MIGRATIONS / name).read_text(encoding="utf-8"))
            print(f"==> {name} ({len(parts)} statements)")
            for number, stmt in enumerate(parts, start=1):
                try:
                    await conn.execute(stmt)
                except Exception as exc:
                    print(f"FAILED {name} at statement {number} of {len(parts)}: {_failure_reason(exc)}")
                    print("Statements before it in this file stay applied (no per-file transaction).")
                    _summary(names, completed, failed=name)
                    return 1
            completed.append(name)
            print(f"applied {name}")
    finally:
        await conn.close()

    _summary(names, completed, failed=None)
    return 0


def _summary(names: list[str], completed: list[str], *, failed: str | None) -> None:
    print("")
    print(f"Completed {len(completed)} of {len(names)} files:")
    for name in completed:
        print(f"  ok      {name}")
    if failed is not None:
        print(f"  FAILED  {failed}")
        for name in names[names.index(failed) + 1 :]:
            print(f"  not run {name}")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
