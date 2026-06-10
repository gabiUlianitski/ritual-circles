-- Optional profile fields (Facebook-style About sections). All nullable.
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_summary TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_summary TEXT;
