"""Read-only check that the target database has the objects from migrations 031-046.

Uses DATABASE_URL from backend/.env. Never prints the connection string or host.
The session is set to READ ONLY, and only catalog SELECTs run, so nothing is
created, altered, inserted, updated or deleted. There is no migration ledger:
this inspects the real schema objects instead of guessing which files ran.

  cd backend
  .\\.venv\\Scripts\\python.exe scripts\\check_production_schema.py

Exit status 0 when everything is present, 1 otherwise.
"""
from __future__ import annotations

import asyncio
import sys

import asyncpg

from apply_production_migrations import connect_kwargs, target_url

REQUIRED_COLUMNS: dict[str, tuple[str, ...]] = {
    "circles": ("description", "name"),
    "users": ("avatar_url", "for_you_intro_json"),
    "hobies": ("daily_insight_json", "discovery_description"),
    "circle_invitations": ("id", "circle_id", "inviter_user_id", "invitee_user_id", "status", "responded_at"),
    "hobby_insights": ("id", "hobby_id", "insight_type", "content_en", "generation_batch_id", "is_active"),
    "circle_members": ("id", "circle_id", "user_id", "status", "joined_at"),
    "activities": (
        "id", "circle_id", "title", "start_at", "end_at", "recurrence_type", "recurrence_rule",
        "location_name", "location_address", "group_size", "payment_type", "status", "created_by",
        "cancellation_reason",
    ),
    "activity_participants": (
        "id", "activity_id", "user_id", "status", "confirmation_required", "attendance_status",
    ),
    "activity_occurrences": (
        "id", "activity_id", "start_at", "end_at", "status", "cancellation_reason",
        "location_name_override", "location_address_override", "scheduled_at",
    ),
    "activity_occurrence_participants": (
        "id", "occurrence_id", "user_id", "status", "confirmation_required", "attendance_status",
    ),
    "activity_suggestions": (
        "id", "activity_id", "occurrence_id", "created_by", "type", "proposed_start_at",
        "proposed_location_name", "note", "status", "decided_by",
    ),
    "activity_suggestion_support": ("id", "suggestion_id", "user_id"),
    "activity_notifications": (
        "id", "user_id", "type", "activity_id", "occurrence_id", "suggestion_id", "dedup_key",
    ),
}

NOT_NULL_COLUMNS: tuple[tuple[str, str], ...] = (
    ("activity_occurrences", "scheduled_at"),
    ("activity_participants", "confirmation_required"),
    ("activity_participants", "attendance_status"),
    ("activity_occurrence_participants", "confirmation_required"),
    ("activity_occurrence_participants", "attendance_status"),
)

UNIQUE_COLUMN_SETS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("circle_members", ("circle_id", "user_id")),
    ("activity_participants", ("activity_id", "user_id")),
    ("activity_occurrences", ("activity_id", "start_at")),
    ("activity_occurrences", ("activity_id", "scheduled_at")),
    ("activity_occurrence_participants", ("occurrence_id", "user_id")),
    ("activity_suggestion_support", ("suggestion_id", "user_id")),
    ("activity_notifications", ("user_id", "dedup_key")),
)

NAMED_UNIQUE_INDEXES: tuple[str, ...] = (
    "uq_circle_invitations_pending",
    "activity_suggestions_open_time_no_end",
    "activity_suggestions_open_time_with_end",
    "activity_suggestions_open_location",
    "activity_occurrences_activity_slot",
)

CHECK_CONTAINS: tuple[tuple[str, str, str], ...] = (
    ("activities", "activities_status_check", "confirmed"),
    ("activity_participants", "attendance_status", "no_show"),
    ("activity_occurrence_participants", "attendance_status", "no_show"),
)


async def run_checks(conn: asyncpg.Connection) -> list[str]:
    problems: list[str] = []

    columns = await conn.fetch(
        """
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        """
    )
    present = {(r["table_name"], r["column_name"]): r["is_nullable"] for r in columns}
    tables = {table for table, _ in present}

    for table, wanted in REQUIRED_COLUMNS.items():
        if table not in tables:
            problems.append(f"missing table {table}")
            continue
        for column in wanted:
            if (table, column) not in present:
                problems.append(f"missing column {table}.{column}")

    for table, column in NOT_NULL_COLUMNS:
        if present.get((table, column)) == "YES":
            problems.append(f"column {table}.{column} should be NOT NULL")

    unique_rows = await conn.fetch(
        """
        SELECT t.relname AS table_name,
               i.relname AS index_name,
               ix.indpred IS NOT NULL AS partial,
               array(
                 SELECT a.attname
                 FROM unnest(ix.indkey) k
                 JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k
               ) AS columns
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND ix.indisunique
        """
    )
    full_unique = {(r["table_name"], frozenset(r["columns"])) for r in unique_rows if not r["partial"]}
    index_names = {r["index_name"] for r in unique_rows}

    for table, cols in UNIQUE_COLUMN_SETS:
        if (table, frozenset(cols)) not in full_unique:
            problems.append(f"missing unique ({', '.join(cols)}) on {table}")

    for name in NAMED_UNIQUE_INDEXES:
        if name not in index_names:
            problems.append(f"missing unique index {name}")

    checks = await conn.fetch(
        """
        SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND c.contype = 'c'
        """
    )
    for table, needle, value in CHECK_CONTAINS:
        found = any(
            r["table_name"] == table and (needle in r["conname"] or needle in r["definition"]) and value in r["definition"]
            for r in checks
        )
        if not found:
            problems.append(f"missing check on {table} ({needle} allowing '{value}')")

    return problems


async def main() -> int:
    url = target_url(allow_local=True)
    try:
        conn = await asyncpg.connect(url, **connect_kwargs(url))
    except Exception as exc:
        print(f"Could not connect to the target database ({type(exc).__name__}).")
        return 1
    try:
        await conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        problems = await run_checks(conn)
    finally:
        await conn.close()

    checked = (
        sum(len(c) for c in REQUIRED_COLUMNS.values())
        + len(NOT_NULL_COLUMNS)
        + len(UNIQUE_COLUMN_SETS)
        + len(NAMED_UNIQUE_INDEXES)
        + len(CHECK_CONTAINS)
    )
    if problems:
        print(f"Schema check FAILED ({len(problems)} problems out of {checked} checks):")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"Schema check OK: {checked} checks for migrations 031-046 passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
