-- Actual attendance for an Activity that has ended, kept apart from the RSVP in status (going | cancelled).
-- One-time Activities record it on activity_participants; a recurring Activity records it per date
-- on activity_occurrence_participants. Existing rows become 'pending': nothing is inferred from dates
-- and nothing is read from the legacy attendance table.
-- The roster queries filter by activity or date and status = 'going', which the existing partial
-- indexes already cover, so no index is added.

ALTER TABLE activity_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (attendance_status IN ('pending', 'attended', 'no_show'));

ALTER TABLE activity_occurrence_participants
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (attendance_status IN ('pending', 'attended', 'no_show'));
