-- Ritual Circles — demo seed data
-- Creates 24 users and 45 open circles (with sessions + attendance).
--
-- Run in Supabase SQL Editor (after schema / migrations), or:
--   psql "$DATABASE_URL" -f db/seed_demo_data.sql
--
-- Safe to re-run: removes prior seed rows first (@ritualcircles.dev).
-- Synthetic users cannot log in; they exist only to make public demo circles feel active.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Remove previous seed data
-- ---------------------------------------------------------------------------
DELETE FROM circle_messages
WHERE circle_id IN (
  SELECT c.id FROM circles c
  JOIN users u ON u.id = c.created_by
  WHERE u.email LIKE '%@ritualcircles.dev'
     OR u.user_name LIKE 'seed_user_%'
);

DELETE FROM attendance
WHERE "sessionId" IN (
  SELECT s.id FROM sessions s
  JOIN circles c ON c.id = s."circleId"
  JOIN users u ON u.id = c.created_by
  WHERE u.email LIKE '%@ritualcircles.dev'
     OR u.user_name LIKE 'seed_user_%'
);

DELETE FROM sessions
WHERE "circleId" IN (
  SELECT c.id FROM circles c
  JOIN users u ON u.id = c.created_by
  WHERE u.email LIKE '%@ritualcircles.dev'
     OR u.user_name LIKE 'seed_user_%'
);

DELETE FROM circles
WHERE created_by IN (
  SELECT id FROM users
  WHERE email LIKE '%@ritualcircles.dev'
     OR user_name LIKE 'seed_user_%'
);

DELETE FROM users
WHERE email LIKE '%@ritualcircles.dev'
   OR user_name LIKE 'seed_user_%';

-- ---------------------------------------------------------------------------
-- 2) Users (24)
-- Password hashes are cleared below so public demo identities cannot be used to log in.
-- ---------------------------------------------------------------------------
INSERT INTO users (
  id, user_name, first_name, last_name, email, password_hash,
  city, availability_day, availability_time,
  user_hobies_json, preferred_hoby_slug
) VALUES
  ('10000000-0000-4000-8000-000000000001', 'noa_cohen',      'Noa',    'Cohen',    'noa.cohen@ritualcircles.dev',         '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Tel Aviv-Yafo',   'Mon', '09:00:00', '[{"slug":"tennis","level":"beginner"},{"slug":"coffee","level":"intermediate"}]'::jsonb, 'tennis'),
  ('10000000-0000-4000-8000-000000000002', 'yael_levi',      'Yael',   'Levi',     'yael.levi92@ritualcircles.dev',       '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Jerusalem',       'Tue', '10:00:00', '[{"slug":"chess","level":"intermediate"},{"slug":"cooking","level":"beginner"}]'::jsonb, 'chess'),
  ('10000000-0000-4000-8000-000000000003', 'maya_mizrahi',   'Maya',   'Mizrahi',  'maya.mizrahi@ritualcircles.dev',      '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Haifa',           'Wed', '11:00:00', '[{"slug":"padel","level":"advanced"},{"slug":"yoga","level":"beginner"}]'::jsonb, 'padel'),
  ('10000000-0000-4000-8000-000000000004', 'daniel_peretz',  'Daniel', 'Peretz',   'daniel.peretz@ritualcircles.dev',     '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Rishon LeZion',   'Thu', '17:00:00', '[{"slug":"bicycle","level":"intermediate"},{"slug":"tennis","level":"beginner"}]'::jsonb, 'bicycle'),
  ('10000000-0000-4000-8000-000000000005', 'omer_biton',     'Omer',   'Biton',    'omer.biton@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Raanana',         'Fri', '18:00:00', '[{"slug":"dancing","level":"beginner"},{"slug":"coffee","level":"advanced"}]'::jsonb, 'dancing'),
  ('10000000-0000-4000-8000-000000000006', 'avi_azoulay',    'Avi',    'Azoulay',  'avi.azoulay@ritualcircles.dev',       '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Herzliya',        'Sat', '19:00:00', '[{"slug":"football","level":"intermediate"},{"slug":"chess","level":"beginner"}]'::jsonb, 'football'),
  ('10000000-0000-4000-8000-000000000007', 'shira_friedman', 'Shira',  'Friedman', 'shira.friedman@ritualcircles.dev',    '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Beer Sheva',      'Sun', '20:00:00', '[{"slug":"cooking","level":"advanced"},{"slug":"padel","level":"intermediate"}]'::jsonb, 'cooking'),
  ('10000000-0000-4000-8000-000000000008', 'eitan_katz',     'Eitan',  'Katz',     'eitan.katz@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Netanya',         'Mon', '08:00:00', '[{"slug":"yoga","level":"intermediate"},{"slug":"bicycle","level":"beginner"}]'::jsonb, 'yoga'),
  ('10000000-0000-4000-8000-000000000009', 'lior_dahan',     'Lior',   'Dahan',    'lior.dahan@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Tel Aviv-Yafo',   'Tue', '09:00:00', '[{"slug":"tennis","level":"advanced"},{"slug":"dancing","level":"intermediate"}]'::jsonb, 'tennis'),
  ('10000000-0000-4000-8000-00000000000a', 'tamar_shapiro',  'Tamar',  'Shapiro',  'tamar.shapiro@ritualcircles.dev',     '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Jerusalem',       'Wed', '10:00:00', '[{"slug":"coffee","level":"beginner"},{"slug":"chess","level":"advanced"}]'::jsonb, 'coffee'),
  ('10000000-0000-4000-8000-00000000000b', 'ido_bar',        'Ido',    'Bar',      'ido.bar@ritualcircles.dev',           '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Haifa',           'Thu', '11:00:00', '[{"slug":"baseball","level":"beginner"},{"slug":"football","level":"intermediate"}]'::jsonb, 'baseball'),
  ('10000000-0000-4000-8000-00000000000c', 'ron_golan',      'Ron',    'Golan',    'ron.golan@ritualcircles.dev',         '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Rishon LeZion',   'Fri', '17:00:00', '[{"slug":"padel","level":"beginner"},{"slug":"cooking","level":"intermediate"}]'::jsonb, 'padel'),
  ('10000000-0000-4000-8000-00000000000d', 'gal_weiss',      'Gal',    'Weiss',    'gal.weiss@ritualcircles.dev',         '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Raanana',         'Sat', '18:00:00', '[{"slug":"bicycle","level":"advanced"},{"slug":"yoga","level":"beginner"}]'::jsonb, 'bicycle'),
  ('10000000-0000-4000-8000-00000000000e', 'neta_cohen',     'Neta',   'Cohen',    'neta.cohen@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Herzliya',        'Sun', '19:00:00', '[{"slug":"dancing","level":"intermediate"},{"slug":"tennis","level":"beginner"}]'::jsonb, 'dancing'),
  ('10000000-0000-4000-8000-00000000000f', 'amir_levi',      'Amir',   'Levi',     'amir.levi@ritualcircles.dev',         '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Beer Sheva',      'Mon', '20:00:00', '[{"slug":"chess","level":"intermediate"},{"slug":"coffee","level":"beginner"}]'::jsonb, 'chess'),
  ('10000000-0000-4000-8000-000000000010', 'hila_mizrahi',   'Hila',   'Mizrahi',  'hila.mizrahi@ritualcircles.dev',      '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Netanya',         'Tue', '08:00:00', '[{"slug":"cooking","level":"beginner"},{"slug":"padel","level":"advanced"}]'::jsonb, 'cooking'),
  ('10000000-0000-4000-8000-000000000011', 'tom_peretz',     'Tom',    'Peretz',   'tom.peretz@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Tel Aviv-Yafo',   'Wed', '09:00:00', '[{"slug":"football","level":"advanced"},{"slug":"bicycle","level":"intermediate"}]'::jsonb, 'football'),
  ('10000000-0000-4000-8000-000000000012', 'roni_biton',     'Roni',   'Biton',    'roni.biton@ritualcircles.dev',        '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Jerusalem',       'Thu', '10:00:00', '[{"slug":"yoga","level":"advanced"},{"slug":"dancing","level":"beginner"}]'::jsonb, 'yoga'),
  ('10000000-0000-4000-8000-000000000013', 'ben_azoulay',    'Ben',    'Azoulay',  'ben.azoulay@ritualcircles.dev',       '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Haifa',           'Fri', '11:00:00', '[{"slug":"tennis","level":"intermediate"},{"slug":"baseball","level":"beginner"}]'::jsonb, 'tennis'),
  ('10000000-0000-4000-8000-000000000014', 'dana_friedman',  'Dana',   'Friedman', 'dana.friedman@ritualcircles.dev',     '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Rishon LeZion',   'Sat', '17:00:00', '[{"slug":"coffee","level":"intermediate"},{"slug":"chess","level":"beginner"}]'::jsonb, 'coffee'),
  ('10000000-0000-4000-8000-000000000015', 'gil_katz',       'Gil',    'Katz',     'gil.katz@ritualcircles.dev',          '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Raanana',         'Sun', '18:00:00', '[{"slug":"padel","level":"intermediate"},{"slug":"cooking","level":"advanced"}]'::jsonb, 'padel'),
  ('10000000-0000-4000-8000-000000000016', 'maayan_dahan',   'Maayan', 'Dahan',    'maayan.dahan@ritualcircles.dev',      '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Herzliya',        'Mon', '19:00:00', '[{"slug":"bicycle","level":"beginner"},{"slug":"football","level":"intermediate"}]'::jsonb, 'bicycle'),
  ('10000000-0000-4000-8000-000000000017', 'yuval_shapiro',  'Yuval',  'Shapiro',  'yuval.shapiro@ritualcircles.dev',     '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Beer Sheva',      'Tue', '20:00:00', '[{"slug":"dancing","level":"advanced"},{"slug":"yoga","level":"intermediate"}]'::jsonb, 'dancing'),
  ('10000000-0000-4000-8000-000000000018', 'adi_bar',        'Adi',    'Bar',      'adi.bar@ritualcircles.dev',           '$pbkdf2-sha256$29000$xziHsHYOYSzFOMe4956zVg$5lAFhlOme1cLg8QWYUD7WelNjI3eKY2jQA6.jKPHGzk', 'Netanya',         'Wed', '08:00:00', '[{"slug":"cooking","level":"intermediate"},{"slug":"tennis","level":"advanced"}]'::jsonb, 'cooking');

-- Production-safe demo identities: visible as members, but not usable accounts.
UPDATE users
SET password_hash = NULL,
    onboarding_completed = TRUE
WHERE email LIKE '%@ritualcircles.dev';

-- ---------------------------------------------------------------------------
-- 3) Circles (45), sessions (6 each), creator + member attendance
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  user_ids UUID[] := ARRAY[
    '10000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid,
    '10000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    '10000000-0000-4000-8000-000000000006'::uuid,
    '10000000-0000-4000-8000-000000000007'::uuid,
    '10000000-0000-4000-8000-000000000008'::uuid,
    '10000000-0000-4000-8000-000000000009'::uuid,
    '10000000-0000-4000-8000-00000000000a'::uuid,
    '10000000-0000-4000-8000-00000000000b'::uuid,
    '10000000-0000-4000-8000-00000000000c'::uuid,
    '10000000-0000-4000-8000-00000000000d'::uuid,
    '10000000-0000-4000-8000-00000000000e'::uuid,
    '10000000-0000-4000-8000-00000000000f'::uuid,
    '10000000-0000-4000-8000-000000000010'::uuid,
    '10000000-0000-4000-8000-000000000011'::uuid,
    '10000000-0000-4000-8000-000000000012'::uuid,
    '10000000-0000-4000-8000-000000000013'::uuid,
    '10000000-0000-4000-8000-000000000014'::uuid,
    '10000000-0000-4000-8000-000000000015'::uuid,
    '10000000-0000-4000-8000-000000000016'::uuid,
    '10000000-0000-4000-8000-000000000017'::uuid,
    '10000000-0000-4000-8000-000000000018'::uuid
  ];

  rituals TEXT[] := ARRAY[
    'tennis','chess','padel','bicycle','dancing','football','cooking','yoga',
    'coffee','baseball','tennis','chess','padel','bicycle','dancing',
    'football','cooking','yoga','coffee','baseball','tennis','chess','padel',
    'bicycle','dancing','football','cooking','yoga','coffee','baseball',
    'tennis','chess','padel','bicycle','dancing','football','cooking',
    'yoga','coffee','baseball','tennis','chess','padel','bicycle','dancing','football'
  ];

  levels TEXT[] := ARRAY['beginner','intermediate','advanced'];
  days TEXT[] := ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  hours INT[] := ARRAY[8,9,10,11,17,18,19,20];
  cities TEXT[] := ARRAY[
    'Tel Aviv-Yafo','Jerusalem','Haifa','Rishon LeZion',
    'Raanana','Herzliya','Beer Sheva','Netanya'
  ];
  venues TEXT[] := ARRAY[
    'Community center','Park meeting point','Local café',
    'Sports club','Municipal court','Riverside path'
  ];

  i INT;
  circle_id UUID;
  creator_id UUID;
  ritual TEXT;
  ritual_level TEXT;
  modality TEXT;
  recurring TEXT;
  city_name TEXT;
  meeting_place TEXT;
  location_or_link TEXT;
  invite_code TEXT;
  first_dt TIMESTAMPTZ;
  session_dt TIMESTAMPTZ;
  session_id UUID;
  sess INT;
  member_id UUID;
  members_added INT;
  target_members INT;
  j INT;
BEGIN
  FOR i IN 1..45 LOOP
    circle_id := ('20000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid;
    creator_id := user_ids[1 + ((i - 1) % array_length(user_ids, 1))];
    ritual := rituals[i];
    ritual_level := levels[1 + ((i - 1) % 3)];
    modality := CASE WHEN i % 4 = 0 THEN 'online' ELSE 'offline' END;
    recurring := days[1 + ((i - 1) % 7)] || ' ' || lpad((hours[1 + ((i - 1) % 8)])::text, 2, '0') || ':00';
    city_name := cities[1 + ((i - 1) % 8)];
    meeting_place := venues[1 + ((i - 1) % 6)] || ', ' || city_name;
    location_or_link := CASE
      WHEN modality = 'online' THEN 'https://example.com/meeting'
      ELSE meeting_place
    END;
    invite_code := 'SEED' || lpad(i::text, 4, '0');

    first_dt := date_trunc('day', NOW() AT TIME ZONE 'UTC')
      + ((7 + (i % 14)) || ' days')::interval
      + (hours[1 + ((i - 1) % 8)] || ' hours')::interval;

    INSERT INTO circles (
      id, "ritualType", ritual_level, modality, "recurringTime",
      country_code, city_name, meeting_place, "maxSize",
      group_size_json, cost_payment_json, "inviteCode", created_by,
      invite_only, is_recurring
    ) VALUES (
      circle_id,
      ritual,
      ritual_level,
      modality,
      recurring,
      CASE WHEN modality = 'offline' THEN 'IL' ELSE NULL END,
      CASE WHEN modality = 'offline' THEN city_name ELSE NULL END,
      CASE WHEN modality = 'offline' THEN meeting_place ELSE NULL END,
      6,
      '{"type":"range","min":3,"max":6}'::jsonb,
      '{"type":"free"}'::jsonb,
      invite_code,
      creator_id,
      false,
      true
    );

    session_dt := first_dt;
    FOR sess IN 1..6 LOOP
      session_id := gen_random_uuid();
      INSERT INTO sessions (id, "circleId", "dateTime", "locationOrLink")
      VALUES (session_id, circle_id, session_dt, location_or_link);

      INSERT INTO attendance ("userId", "sessionId", status)
      VALUES (creator_id, session_id, 'not_attending')
      ON CONFLICT DO NOTHING;

      session_dt := session_dt + interval '7 days';
    END LOOP;

    target_members := 2 + (i % 4);
    members_added := 0;
    FOR j IN 1..array_length(user_ids, 1) LOOP
      EXIT WHEN members_added >= target_members;
      member_id := user_ids[j];
      IF member_id = creator_id THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = member_id
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(u.user_hobies_json) elem
            WHERE lower(elem->>'slug') = lower(ritual)
              AND coalesce(trim(elem->>'level'), '') <> ''
          )
      ) THEN
        INSERT INTO attendance ("userId", "sessionId", status)
        SELECT member_id, s.id, 'not_attending'
        FROM sessions s
        WHERE s."circleId" = circle_id
          AND s."dateTime" >= NOW()
        ON CONFLICT DO NOTHING;
        members_added := members_added + 1;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Some “attending” RSVPs for a live feel
-- ---------------------------------------------------------------------------
UPDATE attendance a
SET status = 'attending', updated_at = NOW()
FROM sessions s
JOIN circles c ON c.id = s."circleId"
JOIN users u ON u.id = c.created_by
WHERE a."sessionId" = s.id
  AND u.email LIKE '%@ritualcircles.dev'
  AND s."dateTime" >= NOW()
  AND random() < 0.45;

COMMIT;

-- Quick check (optional — comment out if your editor runs the whole file as one batch):
-- SELECT
--   (SELECT count(*) FROM users WHERE email LIKE '%@ritualcircles.dev') AS seed_users,
--   (SELECT count(*) FROM circles WHERE "inviteCode" LIKE 'SEED%') AS seed_circles;
