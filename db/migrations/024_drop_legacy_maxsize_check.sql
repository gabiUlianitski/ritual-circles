-- Migration 022 added a flexible maxSize range but the legacy CHECK (maxSize = 6 only)
-- may still exist on some databases. Drop it so fixed/min/range group sizes work.

ALTER TABLE circles DROP CONSTRAINT IF EXISTS circles_maxSize_check;
ALTER TABLE circles DROP CONSTRAINT IF EXISTS "circles_maxSize_check";
