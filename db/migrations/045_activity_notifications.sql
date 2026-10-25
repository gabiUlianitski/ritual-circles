-- In-app Activity notifications. One row per recipient and event.
-- Rows hold identifiers only; titles, dates, and copy are read and localized when the inbox is listed.
-- dedup_key is deterministic per event, so retries and repeated inbox fetches add nothing.
-- Read and dismissed state stays in the client inbox, like the other inbox items.
-- Push delivery is not implemented; nothing here records a "sent" state.

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
