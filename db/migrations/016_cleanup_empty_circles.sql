-- Remove circles that still have future sessions but no members (leftover after drop/leave).
DELETE FROM circles c
WHERE EXISTS (
  SELECT 1
  FROM sessions s
  WHERE s."circleId" = c.id
    AND s."dateTime" >= NOW()
)
AND NOT EXISTS (
  SELECT 1
  FROM sessions s
  JOIN attendance a ON a."sessionId" = s.id
  WHERE s."circleId" = c.id
    AND s."dateTime" >= NOW()
);
