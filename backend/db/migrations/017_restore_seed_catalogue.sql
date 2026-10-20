-- ============================================================================
-- 017 — restore the seed catalogue
--
-- WHAT HAPPENED
--
-- Migration 016 originally ended with a blanket "delete any public.users row
-- with no matching auth.users row". The seeded provider accounts are exactly
-- that — legitimate fixture rows that were never Supabase Auth users — and
-- `parking_spots.provider_id` cascades on delete. The sweep therefore emptied
-- `users` *and* `parking_spots`.
--
-- No account data was lost: `auth.users` was empty at the time and `bookings`,
-- `vehicles`, `disputes`, `settlement_ledger` and `refund_ledger` held no rows.
-- Only these fixtures went, and this migration is the deterministic re-seed.
-- 016's sweep has since been removed, so it cannot happen again.
--
-- WHAT THIS PUTS BACK
--
-- The same eight provider accounts and the same eight bays, with their original
-- UUIDs, so anything referencing those ids (the web platform's seed catalogue in
-- `website/src/lib/data/seed.ts` does, by design) lines up again.
--
-- Idempotent: every insert is `ON CONFLICT DO NOTHING`, so re-running is a no-op.
--
-- ⚠ These are DEMO fixtures with a published password. Delete them, or rotate
-- `password_hash`, before this database carries real traffic.
-- ============================================================================

-- ── Provider accounts ───────────────────────────────────────────────────────
-- `password_hash` is a bcrypt hash of the documented development password
-- (`secret123`), which is what these fixtures were always meant to accept. Real
-- accounts sign in through Supabase Auth and get the non-login sentinel that
-- `handle_new_auth_user()` writes.

INSERT INTO public.users (id, full_name, email, phone_number, password_hash, role, is_verified)
VALUES
  ('5bfb4400-7dde-4b72-9588-412fd99d6f7c', 'Priya R.',                'priya.r@seed.parkpeer.local',                '+919900000000', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('087fedd8-4ff0-4b8f-926b-ce26eacf767b', 'Cyber Towers Facility',   'cyber.towers.facility@seed.parkpeer.local',  '+919900000001', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('8fd601f3-10a7-4e0b-97b7-24d45f9f5682', 'Ishaan M.',               'ishaan.m@seed.parkpeer.local',               '+919900000002', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('4c4ee0cf-fc45-4323-9799-74b8a0c1e04d', 'FinTech Plaza',           'fintech.plaza@seed.parkpeer.local',          '+919900000003', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('76c65578-9fe3-480c-a61f-7f7110036387', 'Sridhar K.',              'sridhar.k@seed.parkpeer.local',              '+919900000004', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('1b2ed10c-2cea-4c40-b66b-aac0d3f397d0', 'My Home Constructions',   'my.home.constructions@seed.parkpeer.local',  '+919900000005', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('95ef9125-ddc2-42dc-93ce-52bebff7bfb6', 'SkyPark Logistics',       'skypark.logistics@seed.parkpeer.local',      '+919900000006', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE),
  ('7c59434e-0cab-42f9-9220-6f99a3450186', 'Ravi T.',                 'ravi.t@seed.parkpeer.local',                 '+919900000007', crypt('secret123', gen_salt('bf', 10)), 'provider', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── Bays ────────────────────────────────────────────────────────────────────
-- Locations are built from the coordinates with PostGIS rather than pasted as
-- WKB, so there is no chance of a transcription error: longitude first, as
-- `ST_MakePoint` expects.

INSERT INTO public.parking_spots (
  id, provider_id, title, description, address, location,
  hourly_rate, overstay_multiplier, status, has_iot_barrier
)
VALUES
  ('6cf0ac0b-0cc1-480b-846a-067d636a463c', '5bfb4400-7dde-4b72-9588-412fd99d6f7c',
   'Gated driveway · Jubilee Hills', 'Capacity 1 · CCTV · Gated · Well lit · Paved',
   'Road No. 36, Jubilee Hills',
   ST_SetSRID(ST_MakePoint(78.40730, 17.43250), 4326)::geography, 60, 1.50, 'available', FALSE),

  ('157d960a-db87-4a37-a838-567147c559d1', '087fedd8-4ff0-4b8f-926b-ce26eacf767b',
   'Basement bay · Hitec City', 'Capacity 12 · Covered · CCTV · EV charger · 24×7',
   'Cyber Towers, Madhapur',
   ST_SetSRID(ST_MakePoint(78.38080, 17.45040), 4326)::geography, 45, 1.50, 'available', FALSE),

  ('307d5a5a-8081-4dbb-8426-b15fd70ac808', '8fd601f3-10a7-4e0b-97b7-24d45f9f5682',
   'Private garage · Banjara Hills', 'Capacity 1 · Covered · Locked · CCTV',
   'Road No. 12, Banjara Hills',
   ST_SetSRID(ST_MakePoint(78.43920, 17.41260), 4326)::geography, 90, 1.50, 'maintenance', FALSE),

  ('196fe548-41bf-4f78-bb54-4d231e73cb48', '4c4ee0cf-fc45-4323-9799-74b8a0c1e04d',
   'Commercial bay · Gachibowli', 'Capacity 40 · Covered · Valet · EV charger · CCTV · 24×7',
   'Financial District, Gachibowli',
   ST_SetSRID(ST_MakePoint(78.34890, 17.44010), 4326)::geography, 55, 1.50, 'available', FALSE),

  ('b5644f73-1ad9-412b-b437-477bb5e2e36a', '76c65578-9fe3-480c-a61f-7f7110036387',
   'Shaded driveway · Madhapur', 'Capacity 2 · Shaded · Gated',
   'Ayyappa Society, Madhapur',
   ST_SetSRID(ST_MakePoint(78.39150, 17.44870), 4326)::geography, 40, 1.50, 'available', FALSE),

  ('7e338a24-f948-4d1e-b597-74a5039590e6', '1b2ed10c-2cea-4c40-b66b-aac0d3f397d0',
   'Tower basement · Kondapur', 'Capacity 24 · Covered · CCTV · Lift access',
   'Botanical Garden Rd, Kondapur',
   ST_SetSRID(ST_MakePoint(78.36170, 17.46320), 4326)::geography, 35, 1.50, 'available', FALSE),

  ('37226f8e-10ea-4d1c-a155-6305d198696e', '95ef9125-ddc2-42dc-93ce-52bebff7bfb6',
   'Airport long-stay · Shamshabad', 'Capacity 300 · Shuttle · CCTV · 24×7 · Insured',
   'RGIA Approach Rd, Shamshabad',
   ST_SetSRID(ST_MakePoint(78.42940, 17.24030), 4326)::geography, 25, 1.50, 'available', FALSE),

  ('8815e504-7073-463a-aa2c-0e51e541fb9c', '7c59434e-0cab-42f9-9220-6f99a3450186',
   'Corner garage · Begumpet', 'Capacity 2 · Gated · CCTV',
   'Prakash Nagar, Begumpet',
   ST_SetSRID(ST_MakePoint(78.47130, 17.44350), 4326)::geography, 50, 1.50, 'available', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── Opening hours ───────────────────────────────────────────────────────────
-- Every bay is 24×7 unless it says otherwise; the schedule table exists so a
-- host can narrow that later, and `spot_schedules` is readable by the public map.
INSERT INTO public.spot_schedules (spot_id, day_of_week, open_time, close_time)
SELECT ps.id, day, '00:00'::time, '23:59'::time
FROM public.parking_spots ps
CROSS JOIN generate_series(0, 6) AS day
WHERE NOT EXISTS (
  SELECT 1 FROM public.spot_schedules s
  WHERE s.spot_id = ps.id AND s.day_of_week = day
);
