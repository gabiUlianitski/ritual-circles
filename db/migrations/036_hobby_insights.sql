-- Reusable insight library for a hobby. Home reads the active batch; it does not generate.
CREATE TABLE IF NOT EXISTS hobby_insights (
  id UUID PRIMARY KEY,
  hobby_id UUID NOT NULL REFERENCES hobies(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (
    insight_type IN ('discovery', 'motivation', 'social_connection', 'interesting_fact')
  ),
  content_en TEXT NOT NULL CHECK (char_length(btrim(content_en)) > 0),
  content_he TEXT NULL,
  generation_batch_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby
  ON hobby_insights (hobby_id);

CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby_active
  ON hobby_insights (hobby_id, is_active);

CREATE INDEX IF NOT EXISTS idx_hobby_insights_hobby_type
  ON hobby_insights (hobby_id, insight_type);

CREATE INDEX IF NOT EXISTS idx_hobby_insights_batch
  ON hobby_insights (generation_batch_id);
