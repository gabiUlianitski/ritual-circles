-- Run this if full_migration.sql failed partway (e.g. after schema.sql).
-- Adds missing columns then creates the google_sub index.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_summary TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_summary TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_windows_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;
