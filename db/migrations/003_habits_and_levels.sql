-- Add habits catalog + optional ritual level on circles.
-- This is an approved new table for structured habit/level selection.

CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  levels_json JSONB NULL,
  types_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS ritual_level INTEGER NULL;

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS ritual_subtype TEXT NULL;

