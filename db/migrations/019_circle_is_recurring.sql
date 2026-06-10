-- One-time circles: single upcoming session; weekly circles unchanged (default).
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true;
