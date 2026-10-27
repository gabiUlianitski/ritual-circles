-- Let an in-app notification say that someone suggested a new time or place.
-- Existing databases already have the shorter type check from migration 045.

ALTER TABLE activity_notifications DROP CONSTRAINT IF EXISTS activity_notifications_type_check;

ALTER TABLE activity_notifications ADD CONSTRAINT activity_notifications_type_check CHECK (type IN (
  'activity_cancelled',
  'activity_confirmed',
  'activity_changed',
  'reconfirmation_required',
  'upcoming_activity',
  'suggestion_accepted',
  'suggestion_declined',
  'suggestion_created'
));
