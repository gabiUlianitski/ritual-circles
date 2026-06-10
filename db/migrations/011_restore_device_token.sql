-- Restore push token column if it was dropped by mistake.
-- Nullable: most users have no token until the mobile app registers for APNs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS device_token TEXT NULL;
