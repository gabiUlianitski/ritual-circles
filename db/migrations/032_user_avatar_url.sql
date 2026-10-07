-- Optional profile image URL. No storage or upload is implied.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;
