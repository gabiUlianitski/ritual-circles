-- Ritual Circles V1 (strict schema)
-- PostgreSQL DDL (tables: users, circles, sessions, attendance)

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

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_user_name_uq
  ON users (LOWER(TRIM(user_name)));

CREATE TABLE IF NOT EXISTS circles (
  id UUID PRIMARY KEY,
  "ritualType" TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('online', 'offline')),
  "recurringTime" TEXT NOT NULL,
  city TEXT NULL,
  country_code TEXT NULL,
  city_name TEXT NULL,
  meeting_place TEXT NULL,
  "maxSize" INTEGER NOT NULL DEFAULT 6 CHECK ("maxSize" >= 1 AND "maxSize" <= 6),
  group_size_json JSONB NULL,
  cost_payment_json JSONB NULL,
  "inviteCode" TEXT NOT NULL UNIQUE,
  invite_only BOOLEAN NOT NULL DEFAULT true,
  ritual_level TEXT NULL,
  ritual_subtype TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  "circleId" UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  "dateTime" TIMESTAMPTZ NOT NULL,
  "locationOrLink" TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "sessionId" UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_attending' CHECK (status IN ('attending', 'not_attending')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("userId", "sessionId")
);

CREATE TABLE IF NOT EXISTS hobies (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  short_description TEXT NULL,
  icon TEXT NULL,
  levels_json JSONB NULL,
  types_json JSONB NULL,
  interest_category TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_circle_datetime
  ON sessions ("circleId", "dateTime");

CREATE INDEX IF NOT EXISTS idx_attendance_session_status
  ON attendance ("sessionId", status);

CREATE INDEX IF NOT EXISTS idx_attendance_user_session
  ON attendance ("userId", "sessionId");

CREATE INDEX IF NOT EXISTS idx_attendance_updated_at
  ON attendance (updated_at);

CREATE TABLE IF NOT EXISTS circle_messages (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circle_messages_circle_created
  ON circle_messages (circle_id, created_at);

