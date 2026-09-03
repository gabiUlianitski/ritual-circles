-- First-run welcome tutorial: existing accounts skip it; new accounts see it once.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users
  ALTER COLUMN onboarding_completed SET DEFAULT false;
