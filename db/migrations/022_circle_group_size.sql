-- Circle group size policy (fixed / max / min / range) + variable maxSize for join cap

ALTER TABLE circles DROP CONSTRAINT IF EXISTS circles_maxSize_check;
ALTER TABLE circles DROP CONSTRAINT IF EXISTS "circles_maxSize_check";

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS group_size_json JSONB NULL;

ALTER TABLE circles
  ADD CONSTRAINT circles_max_size_range CHECK ("maxSize" >= 1 AND "maxSize" <= 6);
