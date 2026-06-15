-- Hebrew translations for hobby types and levels (merge into i18n_json.he).
-- Run in Supabase SQL Editor after 027.
-- Uses dollar-quoting ($$) so apostrophes in Hebrew/English text are safe.

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "blitz": {"label": "בליץ", "description": "שחמט מהיר עם הגבלת זמן קצרה"},
      "classical": {"label": "שחמט קלאסי", "description": "שחמט מסורתי עם זמן ארוך יותר"},
      "online": {"label": "שחמט אונליין", "description": "שחמט באינטרנט"},
      "over_the_board": {"label": "שחמט על הלוח", "description": "שחמט פנים מול פנים"}
    },
    "levels": {
      "beginner": {"label": "מתחיל", "description": "הבנה בסיסית של כללי השחמט והכלים"},
      "intermediate": {"label": "בינוני", "description": "הבנת טקטיקות ואסטרטגיות בסיסיות"},
      "advanced": {"label": "מתקדם", "description": "שליטה בטקטיקות ואסטרטגיות מורכבות"},
      "expert": {"label": "מומחה", "description": "הבנה ברמה גבוהה של תיאוריית שחמט ותרגול"}
    }
  }$$::jsonb
) WHERE slug = 'chess';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "hard_court": {"label": "מגרש קשה", "description": "משחק על משטח קשה"},
      "clay_court": {"label": "מגרש חימר", "description": "משחק על משטח חימר"},
      "grass_court": {"label": "מגרש דשא", "description": "משחק על דשא"},
      "indoor": {"label": "מקורה", "description": "משחק באולם מקורה"},
      "beach": {"label": "טניס חוף", "description": "משחק על חוף הים"}
    },
    "levels": {
      "beginner": {"label": "מתחיל", "description": "הבנה בסיסית של כללים ומכות"},
      "intermediate": {"label": "בינוני", "description": "פיתוח טכניקה ואסטרטגיה"},
      "advanced": {"label": "מתקדם", "description": "שליטה במכות וטקטיקות מורכבות"},
      "expert": {"label": "מומחה", "description": "משחק ברמה גבוהה עם מיומנויות מלוטשות"}
    }
  }$$::jsonb
) WHERE slug = 'tennis';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "indoor": {"label": "פאדל מקורה", "description": "משחק במגרשים מקורים"},
      "outdoor": {"label": "פאדל חיצוני", "description": "משחק במגרשים פתוחים"},
      "glass_court": {"label": "מגרש זכוכית", "description": "משחק במגרש מוקף זכוכית"}
    },
    "levels": {
      "beginner": {"label": "מתחיל", "description": "חדש בפאדל, לומד מכות בסיסיות"},
      "intermediate": {"label": "בינוני", "description": "פיתוח טכניקה ואסטרטגיה"},
      "advanced": {"label": "מתקדם", "description": "שליטה במכות וטקטיקות מורכבות"},
      "expert": {"label": "מומחה", "description": "משחק ברמה גבוהה"}
    }
  }$$::jsonb
) WHERE slug = 'padel';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "fastpitch": {"label": "פיצ'ר מהיר", "description": "משחק עם כדור קטן וקשה יותר"},
      "slowpitch": {"label": "פיצ'ר איטי", "description": "דגש על חבטה וניקוד"},
      "indoor": {"label": "בייסבול מקורה", "description": "משחק על משטחים מלאכותיים"},
      "outdoor": {"label": "בייסבול חיצוני", "description": "משחק על דשא או אדמה"}
    },
    "levels": {
      "beginner": {"label": "מתחיל", "description": "חדש במשחק, לומד את הבסיס"},
      "intermediate": {"label": "בינוני", "description": "פיתוח מיומנויות והבנת אסטרטגיות"},
      "advanced": {"label": "מתקדם", "description": "שליטה בטכניקות ושיפור ביצועים"},
      "expert": {"label": "מומחה", "description": "רמה תחרותית גבוהה"}
    }
  }$$::jsonb
) WHERE slug = 'baseball';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "road_bike": {"label": "אופני כביש", "description": "רכיבה על כבישים סלולים"},
      "mountain_bike": {"label": "אופני הרים", "description": "רכיבה בשבילי שטח"},
      "gravel_bike": {"label": "אופני גרוול", "description": "רכיבה על משטחים מעורבים"},
      "track_bike": {"label": "אופני מסלול", "description": "רכיבה בוולודרום"},
      "bmx_bike": {"label": "BMX", "description": "רכיבה במסלולים סגורים או טריקים"}
    },
    "levels": {
      "1": {"label": "מתחיל", "description": "לימוד מיומנויות רכיבה בסיסיות"},
      "2": {"label": "בינוני", "description": "שיפור איזון, מהירות ושליטה"},
      "3": {"label": "מתקדם", "description": "שליטה בתנועות וטכניקות מורכבות"}
    }
  }$$::jsonb
) WHERE slug = 'bicycle';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "drip_brew": {"label": "טפטוף", "description": "מכונת קפה אוטומטית"},
      "french_press": {"label": "פרנץ' פרס", "description": "הכנה ידנית בפרנץ' פרס"},
      "espresso": {"label": "אספרסו", "description": "מכונת אספרסו"},
      "pour_over": {"label": "שפיכה ידנית", "description": "שפיכת מים חמים על קפה טחון"},
      "cold_brew": {"label": "חליטה קרה", "description": "השריית קפה גס במים קרים"}
    },
    "levels": {
      "beginner": {"label": "מתחיל", "description": "תחילת הכרות עם הכנת קפה"},
      "intermediate": {"label": "בינוני", "description": "ניסוי בשיטות וטעמים שונים"},
      "advanced": {"label": "מתקדם", "description": "שיפור טכניקות וטעמים עדינים"},
      "expert": {"label": "מומחה", "description": "שליטה בשיטות הכנה ופרופילי טעם"}
    }
  }$$::jsonb
) WHERE slug = 'coffee';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "baking": {"label": "אפייה", "description": "בישול בחום יבש"},
      "grilling": {"label": "גריל", "description": "בישול על אש ישירה"},
      "stir_frying": {"label": "מוקפץ", "description": "בישול מהיר בווק"},
      "roasting": {"label": "צלייה", "description": "בישול בחום יבש בתנור"},
      "general": {"label": "בישול כללי", "description": "טכניקות בישול בסיסיות"}
    },
    "levels": {
      "1": {"label": "מתחיל", "description": "מיומנויות ומתכונים בסיסיים"},
      "2": {"label": "בינוני", "description": "מתכונים וטכניקות מורכבים יותר"},
      "3": {"label": "מתקדם", "description": "טכניקות ומרכיבים מתקדמים"},
      "4": {"label": "מומחה", "description": "בישול מיומן ויצירתי"},
      "5": {"label": "מאסטר", "description": "רמה מקצועית גבוהה"}
    }
  }$$::jsonb
) WHERE slug = 'cooking';

UPDATE hobies SET i18n_json = jsonb_set(
  COALESCE(i18n_json, '{}'::jsonb),
  '{he}',
  COALESCE(i18n_json->'he', '{}'::jsonb) || $${
    "types": {
      "ballroom": {"label": "ריקודי אולם", "description": "ריקוד אולם מסורתי"},
      "hip_hop": {"label": "היפ הופ", "description": "ריקוד רחוב אנרגטי"},
      "contemporary": {"label": "עכשווי", "description": "ריקוד מודרני וביטויי"},
      "ballet": {"label": "בלט", "description": "טכניקת בלט קלאסית"},
      "latin": {"label": "לטיני", "description": "ריקוד זוגות אנרגטי"}
    },
    "levels": {
      "1": {"label": "מתחיל", "description": "צעדים וקצב בסיסיים"},
      "2": {"label": "בינוני", "description": "פיתוח טכניקה וסגנון"},
      "3": {"label": "מתקדם", "description": "שליטה בתנועות מורכבות"},
      "4": {"label": "מומחה", "description": "שיפור וליטוש מיומנויות"}
    }
  }$$::jsonb
) WHERE slug = 'dancing';
