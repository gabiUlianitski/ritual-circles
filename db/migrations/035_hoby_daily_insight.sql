-- Today's AI insight for a hobby. Replaced when the stored day changes.
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS daily_insight_json JSONB NULL;
