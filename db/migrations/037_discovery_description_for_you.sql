-- Inspiring hobby copy, and the once-a-day Home "For You" sentence.
-- Home reads the stored sentence. It does not call AI on every visit.

ALTER TABLE hobies
  ADD COLUMN IF NOT EXISTS discovery_description TEXT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS for_you_intro_json JSONB NULL;
