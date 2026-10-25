-- The week each recurring date was made for. start_at can move when a time suggestion is accepted.
-- scheduled_at never changes, so new dates are never added twice for the same week.

ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL;

UPDATE activity_occurrences SET scheduled_at = start_at WHERE scheduled_at IS NULL;

ALTER TABLE activity_occurrences ALTER COLUMN scheduled_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS activity_occurrences_activity_slot
  ON activity_occurrences (activity_id, scheduled_at);
