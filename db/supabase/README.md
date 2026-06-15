# Supabase database setup

## Quick setup (recommended)

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the entire contents of **`full_migration.sql`** (this folder).
3. Click **Run** → choose **Run without RLS** (the app uses FastAPI + `DATABASE_URL`, not Supabase anon keys).

That single file creates all tables and indexes for a **fresh** project.

## Manual setup (legacy)

Alternatively run `db/schema.sql` then each file in `db/migrations/` in order (`003` … `025`). Only use this if you are upgrading an old database.

## Connection string for Render

Use **Session mode** (port **5432**) as `DATABASE_URL` on Render, plus `DATABASE_SSL=require`.
