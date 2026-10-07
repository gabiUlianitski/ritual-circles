-- Optional circle description. Existing circles stay valid with NULL.
ALTER TABLE circles ADD COLUMN IF NOT EXISTS description TEXT NULL;
