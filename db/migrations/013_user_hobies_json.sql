-- Multiple user hobbies (profile → Hobbies tab)

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_hobies_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migrate legacy single preferred_* into array when empty
UPDATE users
SET user_hobies_json = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'slug', preferred_hoby_slug,
      'subtype', preferred_hoby_subtype,
      'level', preferred_hoby_level
    )
  )
)
WHERE preferred_hoby_slug IS NOT NULL
  AND TRIM(preferred_hoby_slug) <> ''
  AND (user_hobies_json IS NULL OR user_hobies_json = '[]'::jsonb);
