-- ============================================================================
-- 016 — harden the Supabase Auth mirror against collisions
--
-- WHY THIS EXISTS
--
-- 015's `handle_new_auth_user()` inserted straight into `public.users` and could
-- raise on either of that table's two UNIQUE columns. A raising trigger is not a
-- detail: Supabase Auth turns it into an opaque
-- "Database error creating new user" and the sign-up is simply lost.
--
-- Reproduced while verifying the web platform: delete a Supabase Auth user (the
-- dashboard, the admin API, or a wipe) and its mirrored `public.users` row stays
-- behind, because nothing links the two tables by foreign key. The next person
-- to sign up with that email — or with the phone number `phone_number` still
-- claims — could not create an account at all.
--
-- Two changes:
--
--   1. `email` — Supabase Auth guarantees uniqueness, so any `public.users` row
--      holding this address under a *different* id is an orphan from a deleted
--      account. It is replaced.
--   2. `phone_number` — NOT NULL UNIQUE, but phone numbers are not actually
--      unique in the world: numbers get recycled, families share them, and the
--      app does not verify one. If the claimed number is taken, the trigger now
--      falls back to the derived `+auth…` placeholder rather than failing the
--      sign-up. The number the user typed stays in `auth.users` metadata either
--      way, so nothing is lost.
--
-- The role-escalation guard from 015 is unchanged: `role` is still read from
-- metadata on INSERT only.
-- ============================================================================

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
  v_role := CASE lower(coalesce(v_meta ->> 'role', 'driver'))
              WHEN 'provider' THEN 'provider'::user_role
              WHEN 'admin'    THEN 'admin'::user_role
              ELSE 'driver'::user_role
            END;

  v_name := nullif(
    btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name',
                   split_part(coalesce(NEW.email, ''), '@', 1))),
    '');

  -- Supabase Auth is the authority on email uniqueness, so a row holding this
  -- address under another id belongs to an account that no longer exists.
  DELETE FROM public.users u
   WHERE u.email = coalesce(NEW.email, '')
     AND u.id <> NEW.id;

  v_phone := nullif(btrim(coalesce(v_meta ->> 'phone', NEW.phone, '')), '');

  -- Never let a contested number block a sign-up; fall back to the placeholder.
  IF v_phone IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.users p
       WHERE p.phone_number = v_phone AND p.id <> NEW.id
     )
  THEN
    v_phone := NULL;
  END IF;

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

-- The trigger itself is unchanged; only the function body above is replaced.
-- Re-declared so this migration is self-contained and a fresh database ends up
-- in the same state as an upgraded one.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- NOTE — a blanket "delete rows with no matching auth.users" sweep used to be
-- here, and it was destructive: the seeded provider accounts are legitimate
-- `public.users` rows that were never Supabase Auth users, and
-- `parking_spots.provider_id` cascades on delete, so the sweep emptied the
-- listings too. Stale rows are now cleaned up per sign-up inside the trigger
-- above, scoped to the one email being registered, which is all that is needed
-- to stop an orphan blocking an address.
