-- Participation for one date of a recurring activity.
-- One-time activities keep using activity_participants.
-- No rows are copied from the parent activity. Recurring join was not available before this table.

CREATE TABLE IF NOT EXISTS activity_occurrence_participants (
  id UUID PRIMARY KEY,
  occurrence_id UUID NOT NULL REFERENCES activity_occurrences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (occurrence_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_occurrence_participants_going
  ON activity_occurrence_participants (occurrence_id)
  WHERE status = 'going';
