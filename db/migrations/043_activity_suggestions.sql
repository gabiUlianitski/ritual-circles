-- Time and place suggestions for one activity, or one date of a recurring activity.
-- Accepting a suggestion is the only path that changes the plan.

ALTER TABLE activity_occurrences
  ADD COLUMN IF NOT EXISTS location_name_override TEXT,
  ADD COLUMN IF NOT EXISTS location_address_override TEXT;

ALTER TABLE activity_participants
  ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE activity_occurrence_participants
  ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN NOT NULL DEFAULT FALSE;

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
