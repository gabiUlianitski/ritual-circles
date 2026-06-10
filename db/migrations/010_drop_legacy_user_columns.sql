-- Optional cleanup: remove mistaken duplicate columns on users (NOT device_token).
--
-- device_token (snake_case) is the real column — KEEP IT for push reminders.
-- deviceToken (camelCase) should NOT exist in PostgreSQL; drop only if it was added by mistake.
--
-- Migration 009 renames name -> user_name. After 009, "name" should not exist.
-- Run this only if information_schema shows extra columns you do not want.

-- Inspect first:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users'
-- ORDER BY ordinal_position;

-- Mistaken API-style column name only (safe no-op if missing).
-- NEVER run: ALTER TABLE users DROP COLUMN device_token;
ALTER TABLE users DROP COLUMN IF EXISTS "deviceToken";

-- Legacy display name only if user_name already exists (partial / manual migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_name'
  ) THEN
    ALTER TABLE users DROP COLUMN name;
  END IF;
END $$;
