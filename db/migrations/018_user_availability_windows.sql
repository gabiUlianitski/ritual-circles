-- Profile availability windows (weekday evenings, weekends). Optional / empty by default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_windows_json JSONB NOT NULL DEFAULT '[]'::jsonb;
