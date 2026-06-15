-- Per-hoby translations (Hebrew). Safe to re-run; uses jsonb_set to replace each language block.
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS i18n_json JSONB NULL;

-- Run 027_hoby_i18n_hebrew_fix.sql for the actual translation payloads (keeps this file idempotent).
