-- Browse-by-interest: one category per hoby (sports | arts | games | learning | social).
ALTER TABLE hobies ADD COLUMN IF NOT EXISTS interest_category TEXT NULL;

-- Best-effort backfill for existing hobies (slug + display name patterns).
UPDATE hobies
SET interest_category = CASE
  WHEN lower(coalesce(slug, '') || ' ' || coalesce(display_name, '')) ~ '(tennis|padel|soccer|football|basketball|running|sport|golf|yoga|fitness|gym|hiking|cycling|swim|volleyball|badminton|climb|ski|surf|martial|boxing|cricket|rugby|baseball|softball|pickleball|squash|futsal|handball|athletic|workout|crossfit|pilates|barre|dance_fitness|dancefitness)'
    THEN 'sports'
  WHEN lower(coalesce(slug, '') || ' ' || coalesce(display_name, '')) ~ '(chess|board.?game|poker|dnd|video.?game|gaming|backgammon|go_|_go|mahjong|scrabble|monopoly|tabletop|esport|e.?sport|videogame|card.?game|bridge|domino|checkers|draughts|warhammer|magic.?gathering|mtg|role.?play|roleplay|rpg)'
    THEN 'games'
  WHEN lower(coalesce(slug, '') || ' ' || coalesce(display_name, '')) ~ '(book|read|study|language|learn|coding|programming|course|writing|tutor|lecture|workshop|education|math|science|history|philosophy|debate|public.?speaking|speaking|podcast|journal|research|academic|university|school|classroom|literature|poetry|essay|coding|developer|software|python|javascript|tech)'
    THEN 'learning'
  WHEN lower(coalesce(slug, '') || ' ' || coalesce(display_name, '')) ~ '(coffee|social|brunch|dinner|tea|network|meetup|chat|conversation|friend|community|walk.?club|walking.?club|pub|bar|wine|beer|food|restaurant|cooking.?club|supper|lunch|happy.?hour|mixer|hangout|gathering)'
    THEN 'social'
  WHEN lower(coalesce(slug, '') || ' ' || coalesce(display_name, '')) ~ '(art|paint|music|photo|craft|draw|dance|theater|theatre|film|creative|sketch|sculpt|ceramic|pottery|knit|sew|design|sing|choir|band|orchestra|violin|piano|guitar|drum|ballet|hip.?hop|hiphop|jazz|comedy|improv|acting|cinema|movie|gallery|museum|calligraphy|watercolor|watercolour|illustration|animation|filmmaking|photography|songwriting|composition)'
    THEN 'arts'
  ELSE NULL
END
WHERE interest_category IS NULL;
