-- ============================================================================
-- 015 — Supabase Auth bridge, row-level security for signed-in users, Realtime
--
-- WHY THIS EXISTS
--
-- The website authenticates through Supabase Auth, so its users live in
-- `auth.users`. The rest of this schema — `public.users`, `bookings.driver_id`,
-- `vehicles.driver_id` — keys off `public.users.id`. Nothing connected the two:
-- `auth.users` was empty and no trigger mirrored a sign-up, so a freshly
-- registered visitor had no `public.users` row and every insert into
-- `vehicles` / `bookings` failed its foreign key.
--
-- This migration closes that gap and finishes the access model:
--
--   1. `auth.users` → `public.users` mirror (trigger + idempotent backfill).
--   2. Row-level policies: a driver reads only their own rows, a host reads
--      their own bays and the bookings on them, admins read everything.
--   3. Column grants for `authenticated` — 014 revoked the blanket grants, so a
--      policy alone would still be denied at the privilege check.
--   4. Realtime on `parking_spots` + `bookings` so the map reacts live.
--   5. A curated `public_providers` view so the map can show host names without
--      exposing `users` (emails, phones, wallet balances).
--
-- One deliberate change to 013's intent: the public listing policy now also
-- surfaces `status = 'locked'`. `parking_spots.status` is precisely how the
-- booking engine publishes a 10-minute hold (`bookings/service.ts` sets it to
-- 'locked' on lock and back to 'available' on completion), and the map has to
-- paint those amber for everybody. The granted column set is unchanged and still
-- omits `entry_instructions` and `iot_device_key`, so no secret is added;
-- `maintenance` and `inactive` stay hidden.
-- ============================================================================

-- ── 1. Authorisation helpers ────────────────────────────────────────────────
-- SECURITY DEFINER so a policy on `users` can ask about `users` without
-- recursing, and so `bookings` policies need no read grant on `parking_spots`.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_spot(p_spot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parking_spots ps
    WHERE ps.id = p_spot_id AND ps.provider_id = auth.uid()
  );
$$;

-- Gate codes and the IoT device secret are never released by a plain table
-- read (014). They come through this function, which only answers for the host
-- that owns the bay or a driver holding a live booking on it.
CREATE OR REPLACE FUNCTION public.spot_access(p_spot_id uuid)
RETURNS TABLE (entry_instructions text, has_iot_barrier boolean, iot_device_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ps.entry_instructions,
    ps.has_iot_barrier,
    CASE WHEN public.owns_spot(p_spot_id) THEN ps.iot_device_key END
  FROM public.parking_spots ps
  WHERE ps.id = p_spot_id
    AND (
      public.owns_spot(p_spot_id)
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.spot_id = ps.id
          AND b.driver_id = auth.uid()
          AND b.status IN ('reserved', 'checked_in', 'overstayed')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spot_access(uuid) TO authenticated;

-- ── 2. Mirror Supabase Auth users into public.users ─────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meta  jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role  user_role;
  v_name  text;
  v_phone text;
BEGIN
  -- The role is honoured on INSERT only. Reading it again on UPDATE would let
  -- any user promote themselves to admin by editing their own metadata.
  v_role := CASE lower(coalesce(v_meta ->> 'role', 'driver'))
              WHEN 'provider' THEN 'provider'::user_role
              WHEN 'admin'    THEN 'admin'::user_role
              ELSE 'driver'::user_role
            END;

  v_name := nullif(
    btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name',
                   split_part(coalesce(NEW.email, ''), '@', 1))),
    '');
  v_phone := nullif(btrim(coalesce(v_meta ->> 'phone', NEW.phone, '')), '');

  -- `phone_number` is NOT NULL UNIQUE but Supabase sign-ups usually carry no
  -- phone. Derive a stable placeholder from the auth id (16 hex chars of a UUID
  -- is unique in practice; `+auth` + 14 keeps it inside VARCHAR(20)).
  IF v_phone IS NULL THEN
    v_phone := '+auth' || substr(replace(NEW.id::text, '-', ''), 1, 14);
  END IF;

  INSERT INTO public.users (
    id, full_name, email, phone_number, password_hash, role, is_verified
  )
  VALUES (
    NEW.id,
    coalesce(v_name, 'Member'),
    coalesce(NEW.email, ''),
    v_phone,
    -- Sentinel, not a credential: Supabase owns the password in `auth.users`.
    -- A well-formed 60-character bcrypt string means the Fastify verifier's
    -- bcrypt.compare() returns false instead of throwing on a malformed hash.
    '$2a$10$' || repeat('x', 53),
    v_role,
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Keeps the mirrored profile fresh (email change, confirmation, display name)
-- without ever touching `role`.
CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users u
     SET email       = coalesce(NEW.email, u.email),
         full_name   = coalesce(
                         nullif(btrim(coalesce(
                           NEW.raw_user_meta_data ->> 'full_name',
                           NEW.raw_user_meta_data ->> 'name')), ''),
                         u.full_name),
         is_verified = NEW.email_confirmed_at IS NOT NULL
   WHERE u.id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, raw_user_meta_data, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_profile();

-- Backfill anything that signed up before the trigger existed. Idempotent.
INSERT INTO public.users (
  id, full_name, email, phone_number, password_hash, role, is_verified
)
SELECT
  a.id,
  coalesce(nullif(btrim(coalesce(a.raw_user_meta_data ->> 'full_name',
                                 a.raw_user_meta_data ->> 'name')), ''), 'Member'),
  coalesce(a.email, ''),
  coalesce(nullif(btrim(coalesce(a.raw_user_meta_data ->> 'phone', a.phone, '')), ''),
           '+auth' || substr(replace(a.id::text, '-', ''), 1, 14)),
  '$2a$10$' || repeat('x', 53),
  CASE lower(coalesce(a.raw_user_meta_data ->> 'role', 'driver'))
    WHEN 'provider' THEN 'provider'::user_role
    WHEN 'admin'    THEN 'admin'::user_role
    ELSE 'driver'::user_role
  END,
  a.email_confirmed_at IS NOT NULL
FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
ON CONFLICT DO NOTHING;

-- ── 3. Column grants for `authenticated` ────────────────────────────────────

-- Own profile. Writes are limited to the two fields a user may edit.
GRANT SELECT (id, full_name, email, phone_number, role, stripe_account_id,
              wallet_balance, is_verified, created_at, updated_at)
  ON public.users TO authenticated;
GRANT UPDATE (full_name, phone_number) ON public.users TO authenticated;

-- A driver's garage. No secrets in this table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;

-- Bookings: rows are fenced by policy below. A driver must be able to read the
-- PIN and QR secret of their own booking, and the host of that bay must be able
-- to read them to verify arrival.
GRANT SELECT ON public.bookings TO authenticated;
GRANT INSERT (spot_id, driver_id, vehicle_id, status, start_time,
              expected_end_time, base_amount, overstay_amount, platform_fee,
              provider_earnings, pin_code, qr_secret, payment_intent_id)
  ON public.bookings TO authenticated;
GRANT UPDATE (status, actual_check_in, actual_check_out, expected_end_time,
              overstay_amount, payment_intent_id, verified_via, updated_at)
  ON public.bookings TO authenticated;

-- Hosts may edit their own bay. `entry_instructions` is write-only here: it is
-- absent from the SELECT grant, so a host can store a gate code without every
-- signed-in visitor being able to read it back off the listing.
GRANT UPDATE (title, description, address, hourly_rate, overstay_multiplier,
              status, entry_instructions, has_iot_barrier)
  ON public.parking_spots TO authenticated;

GRANT SELECT, INSERT ON public.disputes TO authenticated;
GRANT SELECT ON public.settlement_ledger TO authenticated;
GRANT SELECT ON public.refund_ledger TO authenticated;

-- ── 4. Row-level policies ───────────────────────────────────────────────────

-- users ---------------------------------------------------------------------
DROP POLICY IF EXISTS "users read their own profile" ON public.users;
CREATE POLICY "users read their own profile"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users update their own profile" ON public.users;
CREATE POLICY "users update their own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- vehicles ------------------------------------------------------------------
DROP POLICY IF EXISTS "drivers manage their own vehicles" ON public.vehicles;
CREATE POLICY "drivers manage their own vehicles"
  ON public.vehicles FOR ALL TO authenticated
  USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

-- bookings ------------------------------------------------------------------
DROP POLICY IF EXISTS "bookings visible to driver, host and admins" ON public.bookings;
CREATE POLICY "bookings visible to driver, host and admins"
  ON public.bookings FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.owns_spot(spot_id) OR public.is_admin());

DROP POLICY IF EXISTS "drivers create their own bookings" ON public.bookings;
CREATE POLICY "drivers create their own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "driver or host updates the booking" ON public.bookings;
CREATE POLICY "driver or host updates the booking"
  ON public.bookings FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.owns_spot(spot_id) OR public.is_admin())
  WITH CHECK (driver_id = auth.uid() OR public.owns_spot(spot_id) OR public.is_admin());

-- parking_spots -------------------------------------------------------------
-- Replaces 013's policy so a held bay stays visible (amber) instead of
-- vanishing from the map while someone else's 10-minute lock is live.
DROP POLICY IF EXISTS "available spots are publicly listed" ON public.parking_spots;
CREATE POLICY "listed bays are public, holds included"
  ON public.parking_spots FOR SELECT TO anon, authenticated
  USING (status IN ('available', 'locked'));

DROP POLICY IF EXISTS "hosts read their own bays" ON public.parking_spots;
CREATE POLICY "hosts read their own bays"
  ON public.parking_spots FOR SELECT TO authenticated
  USING (provider_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "hosts update their own bays" ON public.parking_spots;
CREATE POLICY "hosts update their own bays"
  ON public.parking_spots FOR UPDATE TO authenticated
  USING (provider_id = auth.uid() OR public.is_admin())
  WITH CHECK (provider_id = auth.uid() OR public.is_admin());

-- disputes ------------------------------------------------------------------
DROP POLICY IF EXISTS "disputes visible to reporter, host and admins" ON public.disputes;
CREATE POLICY "disputes visible to reporter, host and admins"
  ON public.disputes FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = disputes.booking_id AND public.owns_spot(b.spot_id)
    )
  );

DROP POLICY IF EXISTS "users raise their own disputes" ON public.disputes;
CREATE POLICY "users raise their own disputes"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- ledgers -------------------------------------------------------------------
DROP POLICY IF EXISTS "providers read their own settlements" ON public.settlement_ledger;
CREATE POLICY "providers read their own settlements"
  ON public.settlement_ledger FOR SELECT TO authenticated
  USING (provider_id = auth.uid() OR driver_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "drivers read their own refunds" ON public.refund_ledger;
CREATE POLICY "drivers read their own refunds"
  ON public.refund_ledger FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin());

-- ── 5. Host directory ───────────────────────────────────────────────────────
-- The map prints "hosted by …" on every pin. `users` is locked down to the
-- owner, so expose the two harmless columns through a curated view instead of
-- widening the table. Owned by the migration role, which owns `users`, so it
-- reads the base table without tripping that table's RLS.
CREATE OR REPLACE VIEW public.public_providers
  WITH (security_invoker = off) AS
    SELECT id, full_name, is_verified, created_at
    FROM public.users
    WHERE role = 'provider';

GRANT SELECT ON public.public_providers TO anon, authenticated;

-- ── 6. Realtime ─────────────────────────────────────────────────────────────
-- Full replica identity so an UPDATE carries the previous state too: the map
-- needs to know a bay went available → locked, not just its new value.
ALTER TABLE public.parking_spots REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'parking_spots'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_spots';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'bookings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings';
  END IF;
END $$;
