-- Default group size preference per catalogue hoby (used when creating circles)

ALTER TABLE hobies
  ADD COLUMN IF NOT EXISTS group_size_json JSONB NULL;
