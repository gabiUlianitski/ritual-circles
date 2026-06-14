-- Per-hoby translations: display_name, short_description, levels/types labels (by key).
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS i18n_json JSONB NULL;

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'בייסבול', 'short_description', 'ענף ספורט קבוצתי עם מחבט וכדור')
) WHERE slug = 'baseball';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'אופניים', 'short_description', 'רכיבה על אופניים לכושר, תחבורה או הנאה')
) WHERE slug = 'bicycle';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'שחמט', 'short_description', 'שחמט לחשיבה אסטרטגית ופתרון בעיות')
) WHERE slug = 'chess';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'קפה', 'short_description', 'הרגל יומי של הכנת קפה לפתיחת היום')
) WHERE slug = 'coffee';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'כדורגל', 'short_description', 'משחק קבוצתי עם כדור — מסירות, בקיעות ושיתוף פעולה')
) WHERE slug = 'football';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'פאדל', 'short_description', 'ספורט מחבט מהיר — דומה לטניס, משחקים בזוגות במגרש מוקף')
) WHERE slug = 'padel';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'טניס', 'short_description', 'משחק מחבט וכדור — יחידים או זוגות במגרש')
) WHERE slug = 'tennis';

UPDATE hobies SET i18n_json = COALESCE(i18n_json, '{}'::jsonb) || jsonb_build_object(
  'he', jsonb_build_object('display_name', 'יוגה', 'short_description', 'תרגול גוף ונשימה לגמישות, כוח ורוגע')
) WHERE slug = 'yoga';
