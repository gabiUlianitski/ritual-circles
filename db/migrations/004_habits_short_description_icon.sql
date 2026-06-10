-- Habit catalog: short blurb + display icon (typically one emoji from AI).

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS short_description TEXT NULL;

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS icon TEXT NULL;
