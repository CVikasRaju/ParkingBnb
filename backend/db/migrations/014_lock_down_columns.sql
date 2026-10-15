-- ============================================================================
-- 014 — lock the public role down to a safe column set
--
-- WHY THIS EXISTS
--
-- Supabase applies default privileges that grant `anon` and `authenticated`
-- ALL on every new table in `public` — verified on this project:
--
--     anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- Until now that was masked, because RLS was enabled with zero policies and so
-- denied everything. The moment migration 013 added a SELECT policy, those
-- table-wide grants became live: an anonymous visitor could read
-- `iot_device_key` (the gate hardware secret) and `entry_instructions` (gate
-- codes) straight off an available bay, and could INSERT/UPDATE/DELETE rows.
--
-- 013 alone would have leaked exactly the two fields a driver only earns after
-- a confirmed booking. A column-level GRANT cannot subtract from a table-level
-- one, so the privileges must be REVOKED first and re-granted narrowly.
--
-- Writes belong to the Fastify backend, which connects as the table owner over
-- the pooler and is unaffected by these grants. The browser should never write
-- to these tables directly.
-- ============================================================================

-- 1. Drop the blanket grants from the public-facing roles.
REVOKE ALL ON parking_spots, spot_photos, spot_schedules FROM anon, authenticated;
REVOKE ALL ON users, vehicles, bookings, disputes FROM anon, authenticated;
REVOKE ALL ON settlement_ledger, refund_ledger FROM anon, authenticated;

-- 2. Re-grant reads of the *listing* fields only.
--    `iot_device_key` and `entry_instructions` are deliberately absent — they
--    are released to a booked driver by the API, never by direct table read.
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

-- 3. Photos are listing assets, not secrets.
GRANT SELECT ON spot_photos TO anon, authenticated;

-- 4. Operators need to see when a bay is open, but the schedule holds no
--    personal data — only spot_id, day and opening hours.
GRANT SELECT (id, spot_id, day_of_week, open_time, close_time)
    ON spot_schedules TO anon, authenticated;

-- 5. Belt and braces: even if a policy is added to these by mistake later, the
--    privileges are gone, so nothing is readable or writable.
--    (users = emails/phones, bookings = PINs and QR secrets, ledgers = money.)
