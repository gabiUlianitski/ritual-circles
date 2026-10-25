-- Plan lifecycle. Existing rows keep draft, open, cancelled, or completed.
-- Nothing is marked confirmed from capacity, payment, or recurrence.
-- A recurring plan can give each date its own status. One-time plans keep status on the activity.

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_status_check;

ALTER TABLE activities ADD CONSTRAINT activities_status_check
  CHECK (status IN ('draft', 'open', 'confirmed', 'cancelled', 'completed'));

ALTER TABLE activities ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS activity_occurrences (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'confirmed', 'cancelled', 'completed')),
  cancellation_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, start_at),
  CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_activity_occurrences_activity
  ON activity_occurrences (activity_id, start_at);
