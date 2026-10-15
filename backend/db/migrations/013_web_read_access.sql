-- ============================================================================
-- 013 — read access for the public web map
--
-- Supabase enables RLS on tables in `public`, and this schema shipped with no
-- policies at all. The result: the anon key used by `website/` could read
-- nothing, every query returned an empty array, and the map rendered no bays.
--
-- ATTENTION: this policy alone is NOT sufficient. Supabase grants `anon` and
-- `authenticated` ALL on new tables in `public`, verified on this project. As
-- soon as a SELECT policy exists, those grants go live and expose
-- `iot_device_key` (hardware auth secret) and `entry_instructions` (gate codes)
-- — the two fields a driver should only receive *after* a confirmed booking.
-- Migration 014 revokes the blanket grants and re-grants the safe columns; the
-- two run as a pair and neither is safe without the other.
--
-- Net effect (with 014 applied): a logged-out visitor can see that an available
-- bay exists, where it is and what it costs. Nothing else. Writes, bookings and
-- users stay closed.
-- ============================================================================

-- 1. Let the public map call the PostGIS radial search. It runs as the caller
--    (SECURITY INVOKER) and only reads the granted columns below.
GRANT EXECUTE ON FUNCTION search_nearby_parking(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) TO anon, authenticated;

-- 2. Column-scoped read access. Deliberately omits:
--      iot_device_key      — hardware auth secret
--      entry_instructions  — gate codes, released only to a booked driver
GRANT SELECT (
    id,
    provider_id,
    title,
    description,
    address,
    location,
    hourly_rate,
    status,
    has_iot_barrier,
    created_at,
    updated_at
) ON parking_spots TO anon, authenticated;

-- 3. Row-level policy: only bays that are actually bookable are visible.
--    `maintenance` and `inactive` rows stay hidden from the public map.
DROP POLICY IF EXISTS "available spots are publicly listed" ON parking_spots;
CREATE POLICY "available spots are publicly listed"
    ON parking_spots
    FOR SELECT
    TO anon, authenticated
    USING (status = 'available');

-- 4. The map shows a photo per bay; brand assets are not sensitive.
GRANT SELECT ON spot_photos TO anon, authenticated;
DROP POLICY IF EXISTS "spot photos are public" ON spot_photos;
CREATE POLICY "spot photos are public"
    ON spot_photos
    FOR SELECT
    TO anon, authenticated
    USING (TRUE);
