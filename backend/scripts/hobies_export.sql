-- Exported hobies from local DB

BEGIN;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('7733d08d-215c-4451-9ad2-0d145de410d8', 'baseball', 'Baseball', 'Team sport played with a bat and ball, scoring runs by running around bases', '⚾️', '[{"key": "beginner", "label": "Beginner", "description": "New to the game, learning basics"}, {"key": "intermediate", "label": "Intermediate", "description": "Developing skills, understanding strategies"}, {"key": "advanced", "label": "Advanced", "description": "Mastering techniques, refining performance"}, {"key": "expert", "label": "Expert", "description": "Highly skilled, competitive level"}]'::jsonb, '[{"key": "fastpitch", "label": "Fastpitch", "description": "Played with a smaller, harder ball"}, {"key": "slowpitch", "label": "Slowpitch", "description": "Emphasizes hitting and scoring"}, {"key": "indoor", "label": "Indoor Baseball", "description": "Played on artificial surfaces"}, {"key": "outdoor", "label": "Outdoor Baseball", "description": "Played on natural grass or dirt"}]'::jsonb, 'sports', '{"min": 5, "type": "min"}'::jsonb, '2026-06-09T06:21:06.641185+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('991de062-672a-4064-b324-b97ab1808159', 'bicycle', 'Bicycle', 'Ride a bicycle for exercise, transportation, or recreation.', '🚴', '[{"key": 1, "label": "Beginner", "description": "Learning basic bike handling skills"}, {"key": 2, "label": "Intermediate", "description": "Improving balance, speed, and control"}, {"key": 3, "label": "Advanced", "description": "Mastering complex maneuvers and techniques"}]'::jsonb, '[{"key": "road_bike", "label": "Road Bike", "description": "Biking on paved roads"}, {"key": "mountain_bike", "label": "Mountain Bike", "description": "Biking on off-road trails"}, {"key": "gravel_bike", "label": "Gravel Bike", "description": "Biking on mixed surfaces"}, {"key": "track_bike", "label": "Track Bike", "description": "Biking on a velodrome"}, {"key": "bmx_bike", "label": "BMX Bike", "description": "Biking on closed circuits or stunt riding"}]'::jsonb, NULL, '{"min": 3, "type": "min"}'::jsonb, '2026-05-11T08:16:07.128770+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('85f56b2d-bf42-4a1a-8218-b489d0c8f878', 'chess', 'Chess', 'Play chess to improve strategic thinking and problem-solving skills', '♟️', '[{"key": "beginner", "label": "Beginner", "description": "Basic understanding of chess rules and pieces"}, {"key": "intermediate", "label": "Intermediate", "description": "Understanding of basic tactics and strategies"}, {"key": "advanced", "label": "Advanced", "description": "Mastery of complex tactics and strategies"}, {"key": "expert", "label": "Expert", "description": "High-level understanding of chess theory and practice"}]'::jsonb, '[{"key": "blitz", "label": "Blitz Chess", "description": "Fast-paced chess with a short time limit"}, {"key": "classical", "label": "Classical Chess", "description": "Traditional chess with a longer time limit"}, {"key": "online", "label": "Online Chess", "description": "Chess played over the internet"}, {"key": "over_the_board", "label": "Over-the-Board Chess", "description": "Chess played in person"}]'::jsonb, 'games', '{"max": 2, "min": 2, "type": "fixed"}'::jsonb, '2026-05-11T08:20:49.393902+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('35a561f6-575c-4a59-880d-3b64e47ef87d', 'coffee', 'Coffee', 'Develop a daily coffee brewing habit to start your day', '☕️', '[{"key": "beginner", "label": "Beginner", "description": "Just starting to explore coffee brewing"}, {"key": "intermediate", "label": "Intermediate", "description": "Experimenting with different brewing methods and flavors"}, {"key": "advanced", "label": "Advanced", "description": "Refining techniques and exploring nuanced flavors"}, {"key": "expert", "label": "Expert", "description": "Mastering various brewing methods and flavor profiles"}]'::jsonb, '[{"key": "drip_brew", "label": "Drip Brew", "description": "Using an automatic drip coffee maker"}, {"key": "french_press", "label": "French Press", "description": "Using a manual French press coffee maker"}, {"key": "espresso", "label": "Espresso", "description": "Using an espresso machine"}, {"key": "pour_over", "label": "Pour Over", "description": "Manually pouring hot water over ground coffee beans"}, {"key": "cold_brew", "label": "Cold Brew", "description": "Steeping coarse-ground coffee in cold water"}]'::jsonb, 'social', NULL, '2026-05-11T08:32:18.792899+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('3d44dc68-9900-42d1-9039-55d5dce1d301', 'cooking', 'Cooking', 'Preparing and cooking meals for oneself or others', '🍳', '[{"key": "1", "label": "Beginner", "description": "Basic cooking skills and recipes"}, {"key": "2", "label": "Intermediate", "description": "More complex recipes and techniques"}, {"key": "3", "label": "Advanced", "description": "Specialized cooking techniques and ingredients"}, {"key": "4", "label": "Expert", "description": "Highly skilled and creative cooking"}, {"key": "5", "label": "Master", "description": "World-class cooking skills and knowledge"}]'::jsonb, '[{"key": "baking", "label": "Baking", "description": "Cooking using dry heat"}, {"key": "grilling", "label": "Grilling", "description": "Cooking over direct heat"}, {"key": "stir_frying", "label": "Stir Frying", "description": "Quick cooking in a wok"}, {"key": "roasting", "label": "Roasting", "description": "Cooking using dry heat in the oven"}, {"key": "general", "label": "General Cooking", "description": "Basic cooking techniques"}]'::jsonb, NULL, NULL, '2026-05-11T08:21:18.344529+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('7574a4df-5332-47e6-95f3-791aa9d9dde8', 'dancing', 'Dancing', 'Improve your coordination and rhythm through various dance styles', '💃', '[{"key": "1", "label": "Beginner", "description": "Basic steps and rhythm"}, {"key": "2", "label": "Intermediate", "description": "Developing technique and style"}, {"key": "3", "label": "Advanced", "description": "Mastering complex movements"}, {"key": "4", "label": "Expert", "description": "Refining and perfecting skills"}]'::jsonb, '[{"key": "ballroom", "label": "Ballroom", "description": "Traditional ballroom dance"}, {"key": "hip_hop", "label": "Hip-Hop", "description": "High-energy street dance"}, {"key": "contemporary", "label": "Contemporary", "description": "Expressive modern dance"}, {"key": "ballet", "label": "Ballet", "description": "Classical dance technique"}, {"key": "latin", "label": "Latin", "description": "Energetic partner dance"}]'::jsonb, NULL, NULL, '2026-05-11T08:20:08.234615+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('12caf213-c2ce-49a3-8013-2aa5378512eb', 'padel', 'Padel', 'A racquet sport played in doubles on a court with walls.', '🏸', '[{"key": "beginner", "label": "Beginner", "description": "New to Padel, learning basic strokes"}, {"key": "intermediate", "label": "Intermediate", "description": "Developing technique and strategy"}, {"key": "advanced", "label": "Advanced", "description": "Mastering complex shots and tactics"}, {"key": "expert", "label": "Expert", "description": "High-level play with refined skills"}]'::jsonb, '[{"key": "indoor", "label": "Indoor Padel", "description": "Played on indoor courts"}, {"key": "outdoor", "label": "Outdoor Padel", "description": "Played on outdoor courts"}, {"key": "glass_court", "label": "Glass Court Padel", "description": "Played on glass-enclosed courts"}]'::jsonb, 'sports', '{"max": 4, "min": 4, "type": "fixed"}'::jsonb, '2026-05-14T17:59:36.027703+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

INSERT INTO hobies (id, slug, display_name, short_description, icon, levels_json, types_json, interest_category, group_size_json, created_at)
VALUES ('5e249189-4ad6-48c1-a595-1869c4fd113a', 'tennis', 'Tennis', 'Play tennis to improve hand-eye coordination and overall fitness', '🎾', '[{"key": "beginner", "label": "Beginner", "description": "Basic understanding of rules and strokes"}, {"key": "intermediate", "label": "Intermediate", "description": "Developing technique and strategy"}, {"key": "advanced", "label": "Advanced", "description": "Mastering complex shots and tactics"}, {"key": "expert", "label": "Expert", "description": "High-level play with refined skills"}]'::jsonb, '[{"key": "hard_court", "label": "Hard Court", "description": "Played on hard surfaces"}, {"key": "clay_court", "label": "Clay Court", "description": "Played on clay surfaces"}, {"key": "grass_court", "label": "Grass Court", "description": "Played on grass surfaces"}, {"key": "indoor", "label": "Indoor", "description": "Played in indoor venues"}, {"key": "beach", "label": "Beach Tennis", "description": "Played on beach surfaces"}]'::jsonb, 'sports', NULL, '2026-05-11T08:29:34.508633+00:00')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  short_description = EXCLUDED.short_description,
  icon = EXCLUDED.icon,
  levels_json = EXCLUDED.levels_json,
  types_json = EXCLUDED.types_json,
  interest_category = EXCLUDED.interest_category,
  group_size_json = EXCLUDED.group_size_json;

COMMIT;