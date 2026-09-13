-- ParkPeer migrations — one idempotent baseline + one extension per concern.
-- 000_baseline.sql is generated verbatim from docs/SCHEMA.md (schema.sql).
-- 009 frees any spot whose bookings have all reached a terminal state so it
--   becomes searchable again. Mirror of the same check the app performs in
--   the bookings service (kept as a DB-level safety net).

BEGIN;

UPDATE parking_spots ps
SET status = 'available'
WHERE ps.status = 'locked'
  AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.spot_id = ps.id
        AND b.status IN ('pending_lock', 'reserved', 'checked_in')
  );

COMMIT;