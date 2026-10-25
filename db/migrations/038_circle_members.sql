-- Community membership, separate from session attendance.
-- One row per person per circle. Leaving sets status to 'left' and keeps the row.

CREATE TABLE IF NOT EXISTS circle_members (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'left')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_members_circle_active
  ON circle_members (circle_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_circle_members_user_active
  ON circle_members (user_id)
  WHERE status = 'active';

-- People who currently belong via future session attendance, plus each circle creator.
INSERT INTO circle_members (id, circle_id, user_id, status, joined_at, created_at, updated_at)
SELECT gen_random_uuid(), src.circle_id, src.user_id, 'active', NOW(), NOW(), NOW()
FROM (
  SELECT DISTINCT s."circleId" AS circle_id, a."userId" AS user_id
  FROM attendance a
  JOIN sessions s ON s.id = a."sessionId"
  WHERE s."dateTime" >= NOW()
  UNION
  SELECT c.id AS circle_id, c.created_by AS user_id
  FROM circles c
) src
ON CONFLICT (circle_id, user_id) DO NOTHING;
