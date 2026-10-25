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
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

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
ALTER TABLE circles ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS name TEXT NULL;

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
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS daily_insight_json JSONB NULL;

CREATE TABLE IF NOT EXISTS hobby_insights (
  id UUID PRIMARY KEY,
  hobby_id UUID NOT NULL REFERENCES hobies(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (
    insight_type IN ('discovery', 'motivation', 'social_connection', 'interesting_fact')
  ),
  content_en TEXT NOT NULL CHECK (char_length(btrim(content_en)) > 0),
  content_he TEXT NULL,
  generation_batch_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby ON hobby_insights (hobby_id);
CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby_active ON hobby_insights (hobby_id, is_active);
CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby_type ON hobby_insights (hobby_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_hobby_insights_batch ON hobby_insights (generation_batch_id);

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

CREATE TABLE IF NOT EXISTS circle_invitations (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  CHECK (inviter_user_id <> invitee_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_circle_invitations_pending
  ON circle_invitations (circle_id, invitee_user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS circle_members (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'left')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle_active
  ON circle_members (circle_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_circle_members_user_active
  ON circle_members (user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NULL,
  recurrence_type TEXT NOT NULL DEFAULT 'one_time' CHECK (recurrence_type IN ('one_time', 'recurring')),
  recurrence_rule TEXT NULL,
  location_name TEXT NULL,
  location_address TEXT NULL,
  group_size INTEGER NOT NULL CHECK (group_size > 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('free', 'paid')),
  price_amount NUMERIC(12, 2) NULL,
  currency TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'confirmed', 'cancelled', 'completed')),
  cancellation_reason TEXT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at IS NULL OR end_at > start_at),
  CHECK (
    (
      recurrence_type = 'one_time'
      AND recurrence_rule IS NULL
    )
    OR (
      recurrence_type = 'recurring'
      AND recurrence_rule IS NOT NULL
      AND char_length(btrim(recurrence_rule)) > 0
    )
  ),
  CHECK (
    (
      payment_type = 'free'
      AND price_amount IS NULL
      AND currency IS NULL
    )
    OR (
      payment_type = 'paid'
      AND price_amount IS NOT NULL
      AND price_amount >= 0
      AND currency IS NOT NULL
      AND char_length(btrim(currency)) = 3
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_activities_circle_start
  ON activities (circle_id, start_at);

CREATE TABLE IF NOT EXISTS activity_occurrences (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'confirmed', 'cancelled', 'completed')),
  cancellation_reason TEXT NULL,
  location_name_override TEXT NULL,
  location_address_override TEXT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, start_at),
  CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_activity_occurrences_activity
  ON activity_occurrences (activity_id, start_at);

CREATE UNIQUE INDEX IF NOT EXISTS activity_occurrences_activity_slot
  ON activity_occurrences (activity_id, scheduled_at);

CREATE TABLE IF NOT EXISTS activity_occurrence_participants (
  id UUID PRIMARY KEY,
  occurrence_id UUID NOT NULL REFERENCES activity_occurrences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (occurrence_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_occurrence_participants_going
  ON activity_occurrence_participants (occurrence_id)
  WHERE status = 'going';

CREATE TABLE IF NOT EXISTS activity_participants (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_participants_going
  ON activity_participants (activity_id)
  WHERE status = 'going';

CREATE TABLE IF NOT EXISTS activity_suggestions (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  occurrence_id UUID NULL REFERENCES activity_occurrences(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('time', 'location')),
  proposed_start_at TIMESTAMPTZ NULL,
  proposed_end_at TIMESTAMPTZ NULL,
  proposed_location_name TEXT NULL,
  proposed_location_address TEXT NULL,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'declined', 'withdrawn')),
  decided_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    type <> 'time'
    OR (
      proposed_start_at IS NOT NULL
      AND proposed_location_name IS NULL
      AND proposed_location_address IS NULL
      AND (proposed_end_at IS NULL OR proposed_end_at > proposed_start_at)
    )
  ),
  CHECK (
    type <> 'location'
    OR (
      proposed_start_at IS NULL
      AND proposed_end_at IS NULL
      AND proposed_location_name IS NOT NULL
      AND length(btrim(proposed_location_name)) > 0
    )
  ),
  CHECK (
    (status = 'open' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'open' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_activity_suggestions_activity
  ON activity_suggestions (activity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_suggestions_occurrence
  ON activity_suggestions (occurrence_id, created_at DESC)
  WHERE occurrence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_suggestions_open
  ON activity_suggestions (activity_id, type, status)
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS activity_suggestions_open_time_no_end
  ON activity_suggestions (
    activity_id,
    COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'::uuid),
    created_by,
    proposed_start_at
  )
  WHERE status = 'open' AND type = 'time' AND proposed_end_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activity_suggestions_open_time_with_end
  ON activity_suggestions (
    activity_id,
    COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'::uuid),
    created_by,
    proposed_start_at,
    proposed_end_at
  )
  WHERE status = 'open' AND type = 'time' AND proposed_end_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activity_suggestions_open_location
  ON activity_suggestions (
    activity_id,
    COALESCE(occurrence_id, '00000000-0000-0000-0000-000000000000'::uuid),
    created_by,
    lower(btrim(proposed_location_name)),
    lower(btrim(COALESCE(proposed_location_address, '')))
  )
  WHERE status = 'open' AND type = 'location';

CREATE TABLE IF NOT EXISTS activity_suggestion_support (
  id UUID PRIMARY KEY,
  suggestion_id UUID NOT NULL REFERENCES activity_suggestions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (suggestion_id, user_id)
);

CREATE TABLE IF NOT EXISTS activity_notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'activity_cancelled',
    'activity_confirmed',
    'activity_changed',
    'reconfirmation_required',
    'upcoming_activity',
    'suggestion_accepted',
    'suggestion_declined'
  )),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  occurrence_id UUID NULL REFERENCES activity_occurrences(id) ON DELETE CASCADE,
  suggestion_id UUID NULL REFERENCES activity_suggestions(id) ON DELETE CASCADE,
  dedup_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_activity_notifications_user_created
  ON activity_notifications (user_id, created_at DESC);

ALTER TABLE activity_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (attendance_status IN ('pending', 'attended', 'no_show'));

ALTER TABLE activity_occurrence_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (attendance_status IN ('pending', 'attended', 'no_show'));

ALTER TABLE hobies ADD COLUMN IF NOT EXISTS discovery_description TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS for_you_intro_json JSONB NULL;

COMMIT;
