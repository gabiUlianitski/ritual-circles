-- User hobby interests (profile → Hobies tab)

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_hoby_slug TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_hoby_level INTEGER NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_hoby_subtype TEXT NULL;
