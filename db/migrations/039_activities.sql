-- One planned gathering inside a circle.
-- Session and attendance stay as they are. This table does not reference them.
-- circle_id cascades with the circle, matching sessions, messages, and invitations.
-- created_by is restricted, matching circles.created_by, so a planner is not removed out from under a plan.

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
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'cancelled', 'completed')),
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
