-- Migration: events_mode_location_consistency
-- Enforces:
--   mode = 'online'              -> venue IS NULL AND location_id IS NULL
--   mode IN ('offline','hybrid') -> location_id IS NOT NULL (venue stays optional)
--
-- Pre-checked: 0 existing rows violate this rule.

ALTER TABLE events
  ADD CONSTRAINT events_mode_location_consistency
  CHECK (
    (mode = 'online'              AND venue IS NULL AND location_id IS NULL) OR
    (mode IN ('offline','hybrid') AND location_id IS NOT NULL)
  );
