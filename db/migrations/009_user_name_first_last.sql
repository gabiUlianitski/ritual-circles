-- Rename name -> user_name (unique), add first_name / last_name

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE users RENAME COLUMN name TO user_name;

-- Resolve duplicate display names before unique index
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(trim(user_name))
           ORDER BY created_at NULLS LAST, id
         ) AS rn
  FROM users
)
UPDATE users u
SET user_name = trim(u.user_name) || '_' || substr(u.id::text, 1, 8)
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

-- Backfill first / last from legacy user_name when missing
UPDATE users
SET first_name = COALESCE(NULLIF(trim(first_name), ''), split_part(trim(user_name), ' ', 1)),
    last_name = COALESCE(
      NULLIF(trim(last_name), ''),
      CASE
        WHEN position(' ' IN trim(user_name)) > 0 THEN
          trim(substring(trim(user_name) FROM position(' ' IN trim(user_name)) + 1))
        ELSE ''
      END
    )
WHERE first_name IS NULL OR trim(first_name) = '';

UPDATE users
SET first_name = COALESCE(NULLIF(trim(first_name), ''), trim(user_name)),
    last_name = COALESCE(last_name, '')
WHERE first_name IS NULL OR trim(first_name) = '';

ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_user_name_uq
  ON users (lower(trim(user_name)));
