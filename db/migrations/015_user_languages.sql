-- Languages the user speaks (ISO codes + display names). Nullable / empty by default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages_json JSONB NOT NULL DEFAULT '[]'::jsonb;
