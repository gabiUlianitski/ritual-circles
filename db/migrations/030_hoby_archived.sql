-- Archive hides a hobby from user-facing screens without deleting circles that use it.
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
