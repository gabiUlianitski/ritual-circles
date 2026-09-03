"""
Copy all rows from local hobies table to Supabase (upsert by slug).

Usage (from backend/ with venv active):

  set SUPABASE_DATABASE_URL=postgresql://postgres....:5432/postgres
  set DATABASE_SSL=require
  python scripts/migrate_hobies_to_supabase.py

Local DB is read from DATABASE_URL in backend/.env (localhost).
Password with @ must be URL-encoded as %40 in SUPABASE_DATABASE_URL.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

HOBY_SELECT = """
SELECT id, slug, display_name, short_description, icon,
       levels_json, types_json, interest_category, group_size_json, created_at
FROM hobies
ORDER BY display_name
"""

UPSERT = """
INSERT INTO hobies (
  id, slug, display_name, short_description, icon,
  levels_json, types_json, interest_category, group_size_json, created_at
)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json
"""


def _json_text(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _connect_kwargs(url: str) -> dict:
    kwargs: dict = {}
    ssl_env = os.getenv("DATABASE_SSL", "").strip().lower()
    if ssl_env in ("1", "true", "yes", "require") or "supabase.com" in url:
        kwargs["ssl"] = "require"
    return kwargs


async def export_sql(path: Path) -> None:
    local_url = os.getenv("DATABASE_URL")
    if not local_url:
        print("ERROR: DATABASE_URL not set (backend/.env)", file=sys.stderr)
        sys.exit(1)

    conn = await asyncpg.connect(local_url)
    try:
        rows = await conn.fetch(HOBY_SELECT)
        lines = [
            "-- Exported hobies from local DB",
            "BEGIN;",
        ]
        for r in rows:
            levels = _json_text(r["levels_json"])
            types = _json_text(r["types_json"])
            gs = _json_text(r["group_size_json"])
            sd = (r["short_description"] or "").replace("'", "''")
            icon = (r["icon"] or "").replace("'", "''")
            dn = r["display_name"].replace("'", "''")
            slug = r["slug"].replace("'", "''")
            ic = r["interest_category"]
            ic_sql = "NULL" if ic is None else f"'{ic.replace(chr(39), chr(39)+chr(39))}'"
            lines.append(
                f"""INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('{r["id"]}', '{slug}', '{dn}', {f"'{sd}'" if r["short_description"] else "NULL"}, {f"'{icon}'" if r["icon"] else "NULL"}, {f"'{levels}'::jsonb" if levels else "NULL"}, {f"'{types}'::jsonb" if types else "NULL"}, {ic_sql}, {f"'{gs}'::jsonb" if gs else "NULL"}, '{r["created_at"].isoformat()}')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;"""
            )
        lines.append("COMMIT;")
        path.write_text("\n\n".join(lines), encoding="utf-8")
        print(f"Wrote {len(rows)} hobies to {path}")
    finally:
        await conn.close()


async def main() -> None:
    local_url = os.getenv("DATABASE_URL")
    remote_url = os.getenv("SUPABASE_DATABASE_URL") or os.getenv("TARGET_DATABASE_URL")

    if not local_url:
        print("ERROR: DATABASE_URL not set (backend/.env)", file=sys.stderr)
        sys.exit(1)
    if not remote_url:
        print(
            "ERROR: Set SUPABASE_DATABASE_URL to your Supabase Session pooler URI.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Connecting to local database…")
    local = await asyncpg.connect(local_url)
    print("Connecting to Supabase…")
    remote = await asyncpg.connect(remote_url, **_connect_kwargs(remote_url))

    try:
        rows = await local.fetch(HOBY_SELECT)
        print(f"Found {len(rows)} hobies locally.")

        if not rows:
            print("Nothing to migrate.")
            return

        async with remote.transaction():
            for r in rows:
                await remote.execute(
                    UPSERT,
                    r["id"],
                    r["slug"],
                    r["display_name"],
                    r["short_description"],
                    r["icon"],
                    _json_text(r["levels_json"]),
                    _json_text(r["types_json"]),
                    r["interest_category"],
                    _json_text(r["group_size_json"]),
                    r["created_at"],
                )
                print(f"  ✓ {r['display_name']} ({r['slug']})")

        remote_count = await remote.fetchval("SELECT COUNT(*)::int FROM hobies")
        print(f"\nDone. Supabase hobies count: {remote_count}")
    finally:
        await local.close()
        await remote.close()


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--export":
        out = Path(sys.argv[2]) if len(sys.argv) > 2 else BACKEND_DIR / "hobies_export.sql"
        asyncio.run(export_sql(out))
    else:
        asyncio.run(main())
