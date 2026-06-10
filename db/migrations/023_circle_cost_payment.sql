-- Circle cost & payment policy (MVP — organizer handles payment)

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS cost_payment_json JSONB NULL;
