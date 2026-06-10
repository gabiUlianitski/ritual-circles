-- Split offline location: country (ISO alpha-2), locality label, meeting venue text.
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS country_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS city_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS meeting_place TEXT NULL;

UPDATE circles
SET meeting_place = city
WHERE meeting_place IS NULL
  AND city IS NOT NULL
  AND TRIM(city) <> '';
