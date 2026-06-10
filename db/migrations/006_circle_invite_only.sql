-- Open vs invite-only join policy (default true = existing behavior).
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS invite_only BOOLEAN NOT NULL DEFAULT true;
