-- ============================================================================
-- 019 — stop admin self-registration
--
-- THE HOLE
--
-- `handle_new_auth_user()` read the new user's role straight out of
-- `raw_user_meta_data` when mirroring `auth.users` into `public.users`. That
-- metadata is whatever the client sent to `supabase.auth.signUp({ options: {
-- data: { role: 'admin' } } })` — so any visitor who could reach the sign-up
-- form could create themselves an operator account, and with it the god-view:
-- force-release any bay, read every booking, settlement and audit row.
--
-- The Fastify API had the same shape (`role: 'admin'` accepted by
-- `/auth/register`); it now requires the operator secret from
-- `ADMIN_SIGNUP_SECRET`.
--
-- THE FIX
--
-- Only `provider` is honoured from client metadata. Everything else — including
-- a request for `admin` — lands on `driver`. Operators are promoted out of band,
-- by someone who already has database access:
--
--   UPDATE public.users SET role = 'admin' WHERE email = 'ops@parkpeer.example';
--
-- The escalation guard from 015 is otherwise unchanged: `role` is still read on
-- INSERT only, so a later metadata edit cannot re-run the mapping.
--
-- Idempotent: safe to re-run.
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
  -- `provider` is a self-service choice; `admin` is not. Anything unrecognised
  -- degrades to `driver` rather than failing the sign-up.
  v_role := CASE lower(coalesce(v_meta ->> 'role', 'driver'))
              WHEN 'provider' THEN 'provider'::user_role
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
    '$2a$10$' || repeat('x', 53),
    v_role,
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ── Report (do not silently demote) ─────────────────────────────────────────
-- Accounts that already self-assigned the admin role are listed here so an
-- operator can decide. A blanket UPDATE would be a worse bug than the one this
-- migration fixes: it could demote the legitimate operator account.
DO $$
DECLARE
  v_suspects integer;
BEGIN
  SELECT count(*) INTO v_suspects
  FROM public.users u
  JOIN auth.users a ON a.id = u.id
  WHERE u.role = 'admin'
    AND lower(coalesce(a.raw_user_meta_data ->> 'role', '')) = 'admin';

  IF v_suspects > 0 THEN
    RAISE WARNING
      '% account(s) self-assigned the admin role before 019. Review public.users and demote anything unexpected.',
      v_suspects;
  END IF;
END $$;
