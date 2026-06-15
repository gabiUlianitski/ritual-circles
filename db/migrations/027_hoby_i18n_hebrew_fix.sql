-- Fix Hebrew hobby translations (run in Supabase SQL Editor after 026).
-- Replaces bad mixed English/Hebrew strings and adds missing hobbies.

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"בייסבול","short_description":"ספורט קבוצתי עם מחבט וכדור"}'::jsonb
) WHERE slug = 'baseball';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"אופניים","short_description":"רכיבה על אופניים לכושר, לנסיעות או להנאה"}'::jsonb
) WHERE slug = 'bicycle';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"שחמט","short_description":"שחמט לחשיבה אסטרטגית ופתרון בעיות"}'::jsonb
) WHERE slug = 'chess';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"קפה","short_description":"הרגל יומי של הכנת קפה לפתיחת היום"}'::jsonb
) WHERE slug = 'coffee';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"בישול","short_description":"הכנה ובישול של ארוחות לעצמך או לאחרים"}'::jsonb
) WHERE slug = 'cooking';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"ריקוד","short_description":"שיפור תיאום וקצב באמצעות סגנונות ריקוד שונים"}'::jsonb
) WHERE slug = 'dancing';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"כדורגל","short_description":"משחק קבוצתי עם כדור — מסירות, בקיעות ושיתוף פעולה"}'::jsonb
) WHERE slug = 'football';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"פאדל","short_description":"ספורט מחבט מהיר בזוגות — דומה לטניס, במגרש מוקף"}'::jsonb
) WHERE slug = 'padel';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"טניס","short_description":"משחק מחבט וכדור — יחידים או זוגות במגרש"}'::jsonb
) WHERE slug = 'tennis';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  '{"display_name":"יוגה","short_description":"תרגול גוף ונשימה לגמישות, כוח ורוגע"}'::jsonb
) WHERE slug = 'yoga';
