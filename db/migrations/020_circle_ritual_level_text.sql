-- Level keys may be numeric (1, 2) or textual (beginner, advanced).
ALTER TABLE circles
  ALTER COLUMN ritual_level TYPE TEXT USING ritual_level::text;
