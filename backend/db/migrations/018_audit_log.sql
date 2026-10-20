-- ============================================================================
-- 018 — audit log
--
-- WHY THIS EXISTS
--
-- Nothing recorded who changed a booking, who released a bay or who moved money.
-- Disputes ("I never checked in", "the host cancelled on me"), an operator
-- force-releasing a lock, a refund landing in the ledger — all of it was only
-- reconstructable from the current row, and the previous value was gone.
--
-- This adds an append-only `audit_log` that every stateful write feeds through a
-- single trigger. Two deliberate choices:
--
--   * **A curated column set, not `to_jsonb(NEW)`.** `bookings` holds `pin_code`
--     and `qr_secret`; `parking_spots` holds `entry_instructions` and
--     `iot_device_key`. Copying whole rows into a second table would defeat
--     migration 014, which went to the trouble of keeping those out of reads.
--   * **No-op UPDATEs are skipped**, so the audit log stays about intent, not
--     about every `updated_at` touch.
--
-- Reads are admin-only (RLS + a grant that covers only SELECT), and nothing but
-- the SECURITY DEFINER trigger may write.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  table_name  TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  -- `auth.uid()` when a user is behind the write; NULL for the booking worker.
  actor_id    UUID,
  entity_id   UUID,
  booking_id  UUID,
  changes     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (table_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_booking ON public.audit_log (booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_id, at DESC);

-- ── Diff helper ─────────────────────────────────────────────────────────────
-- `{ "status": { "from": "reserved", "to": "checked_in" }, … }`, limited to the
-- columns each table is allowed to report.
CREATE OR REPLACE FUNCTION public.audit_row_changes(
  old_row JSONB,
  new_row JSONB,
  keys TEXT[]
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    jsonb_object_agg(
      key,
      jsonb_build_object('from', old_row -> key, 'to', new_row -> key)
    ),
    '{}'::jsonb
  )
  FROM unnest(keys) AS key
  WHERE old_row -> key IS DISTINCT FROM new_row -> key;
$$;

-- ── The trigger ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old     JSONB := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_new     JSONB := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  v_keys    TEXT[];
  v_changes JSONB;
  v_actor   UUID;
  v_entity  UUID;
  v_booking UUID;
BEGIN
  v_keys := CASE TG_TABLE_NAME
    WHEN 'bookings' THEN ARRAY[
      'status', 'driver_id', 'spot_id', 'vehicle_id', 'start_time',
      'expected_end_time', 'actual_check_in', 'actual_check_out',
      'base_amount', 'overstay_amount', 'platform_fee', 'provider_earnings',
      'payment_intent_id', 'verified_via'
    ]
    WHEN 'parking_spots' THEN ARRAY[
      'status', 'provider_id', 'title', 'hourly_rate', 'overstay_multiplier',
      'has_iot_barrier'
    ]
    WHEN 'users' THEN ARRAY['role', 'is_verified', 'wallet_balance', 'email']
    WHEN 'settlement_ledger' THEN ARRAY[
      'status', 'gross_amount', 'platform_fee', 'provider_earnings', 'gateway_ref'
    ]
    WHEN 'refund_ledger' THEN ARRAY['amount']
    ELSE NULL
  END;

  v_changes := public.audit_row_changes(v_old, v_new, v_keys);

  -- Ignore updates that changed nothing a reader cares about.
  IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Dynamic so this migration also applies where the Supabase shim is not
  -- present (the local Postgres stack) without failing on a missing function.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'SELECT auth.uid()' INTO v_actor;
  END IF;

  v_entity := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  v_booking := CASE
    WHEN TG_TABLE_NAME = 'bookings' THEN v_entity
    WHEN TG_TABLE_NAME IN ('settlement_ledger', 'refund_ledger')
      THEN coalesce((v_new ->> 'booking_id')::uuid, (v_old ->> 'booking_id')::uuid)
    ELSE NULL
  END;

  INSERT INTO public.audit_log (table_name, op, actor_id, entity_id, booking_id, changes)
  VALUES (TG_TABLE_NAME, TG_OP, v_actor, v_entity, v_booking, v_changes);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS audit_bookings ON public.bookings;
CREATE TRIGGER audit_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_parking_spots ON public.parking_spots;
CREATE TRIGGER audit_parking_spots
  AFTER INSERT OR UPDATE OR DELETE ON public.parking_spots
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS audit_users ON public.users;
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- The ledgers are created by migrations 011/012; guard so this file stays
-- runnable against an older database.
DO $$
BEGIN
  IF to_regclass('public.settlement_ledger') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_settlement_ledger ON public.settlement_ledger';
    EXECUTE 'CREATE TRIGGER audit_settlement_ledger
             AFTER INSERT OR UPDATE OR DELETE ON public.settlement_ledger
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()';
  END IF;

  IF to_regclass('public.refund_ledger') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_refund_ledger ON public.refund_ledger';
    EXECUTE 'CREATE TRIGGER audit_refund_ledger
             AFTER INSERT OR UPDATE OR DELETE ON public.refund_ledger
             FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()';
  END IF;
END $$;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Supabase grants ALL on new tables in `public` to anon/authenticated by default
-- privileges, so an explicit revoke is required — otherwise the public anon key
-- could read every audit row.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM anon, authenticated;

DROP POLICY IF EXISTS "operators read the audit log" ON public.audit_log;
CREATE POLICY "operators read the audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;
