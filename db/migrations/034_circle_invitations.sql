-- One pending in-app invitation per person per circle.
CREATE TABLE IF NOT EXISTS circle_invitations (
  id UUID PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  CHECK (inviter_user_id <> invitee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_invitee
  ON circle_invitations (invitee_user_id, status);

CREATE INDEX IF NOT EXISTS idx_circle_invitations_circle
  ON circle_invitations (circle_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_circle_invitations_pending
  ON circle_invitations (circle_id, invitee_user_id)
  WHERE status = 'pending';
