-- Ritual Circles — full database setup (single file for Supabase / PostgreSQL)
-- Run in Supabase SQL Editor → Run without RLS
-- Safe if you already ran schema.sql: adds missing columns, then indexes.

BEGIN;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  user_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NULL,
  password_hash TEXT NULL,
  phone TEXT NULL,
  city TEXT NULL,
  availability_day TEXT NOT NULL,
  availability_time TIME NOT NULL,
  device_token TEXT NULL,
  preferred_hoby_slug TEXT NULL,
  preferred_hoby_level INTEGER NULL,
  preferred_hoby_subtype TEXT NULL,
  user_hobies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_summary TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_summary TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_windows_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_user_name_uq
  ON users (LOWER(TRIM(user_name)));

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

-- ---------------------------------------------------------------------------
-- circles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circles (
  id UUID PRIMARY KEY,
  "ritualType" TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('online', 'offline')),
  "recurringTime" TEXT NOT NULL,
  city TEXT NULL,
  "maxSize" INTEGER NOT NULL DEFAULT 6,
  "inviteCode" TEXT NOT NULL UNIQUE,
  ritual_level TEXT NULL,
  ritual_subtype TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE circles ADD COLUMN IF NOT EXISTS country_code TEXT NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS city_name TEXT NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS meeting_place TEXT NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS group_size_json JSONB NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS cost_payment_json JSONB NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS invite_only BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE circles DROP CONSTRAINT IF EXISTS circles_maxSize_check;
ALTER TABLE circles DROP CONSTRAINT IF EXISTS "circles_maxSize_check";
ALTER TABLE circles DROP CONSTRAINT IF EXISTS circles_max_size_range;
ALTER TABLE circles ADD CONSTRAINT circles_max_size_range CHECK ("maxSize" >= 1 AND "maxSize" <= 6);

-- ritual_level may have been INTEGER in older schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'circles'
      AND column_name = 'ritual_level' AND data_type <> 'text'
  ) THEN
    ALTER TABLE circles ALTER COLUMN ritual_level TYPE TEXT USING ritual_level::text;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  "circleId" UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  "dateTime" TIMESTAMPTZ NOT NULL,
  "locationOrLink" TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "sessionId" UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_attending' CHECK (status IN ('attending', 'not_attending')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "sessionId")
);

-- ---------------------------------------------------------------------------
-- hobies (activity catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hobies (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  levels_json JSONB NULL,
  types_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hobies ADD COLUMN IF NOT EXISTS short_description TEXT NULL;
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS icon TEXT NULL;
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS interest_category TEXT NULL;
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS group_size_json JSONB NULL;
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS i18n_json JSONB NULL;

-- Rename legacy habits table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'habits'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hobies'
  ) THEN
    ALTER TABLE habits RENAME TO hobies;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- circle_messages (minimal per-circle chat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_messages (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_circle_datetime
  ON sessions ("circleId", "dateTime");

CREATE INDEX IF NOT EXISTS idx_attendance_session_status
  ON attendance ("sessionId", status);

CREATE INDEX IF NOT EXISTS idx_attendance_user_session
  ON attendance ("userId", "sessionId");

CREATE INDEX IF NOT EXISTS idx_attendance_updated_at
  ON attendance (updated_at);

CREATE INDEX IF NOT EXISTS idx_circle_messages_circle_created
  ON circle_messages (circle_id, created_at);

COMMIT;
