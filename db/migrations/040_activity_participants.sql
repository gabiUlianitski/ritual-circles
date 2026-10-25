-- One participation row per person per activity.
-- Leaving sets status to 'cancelled' and keeps the row. Joining again sets it back to 'going'.
-- activity_id cascades when an activity row is removed with its circle.
-- The product cancels activities instead of deleting them, so those rows stay.
-- user_id cascades, matching circle_members.

CREATE TABLE IF NOT EXISTS activity_participants (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_participants_going
  ON activity_participants (activity_id)
  WHERE status = 'going';
