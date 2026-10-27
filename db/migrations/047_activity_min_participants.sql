-- Readiness is a derived Activity/date participation threshold, not a lifecycle state.
-- Existing Activities keep their previous implicit requirement: all configured places.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS min_participants INTEGER;

UPDATE activities
SET min_participants = group_size
WHERE min_participants IS NULL;

ALTER TABLE activities
  ALTER COLUMN min_participants SET NOT NULL;

ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_min_participants_check;

ALTER TABLE activities
  ADD CONSTRAINT activities_min_participants_check
  CHECK (min_participants >= 1 AND min_participants <= group_size);
