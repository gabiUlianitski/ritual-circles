-- Optional community name. Existing circles stay valid with NULL.
ALTER TABLE circles ADD COLUMN IF NOT EXISTS name TEXT NULL;
