"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/fsm";
import { computeBaseAmount, computeCheckoutBreakdown, minutesBetween } from "@/lib/money";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  LOCK_TTL_MS,
  PLATFORM,
  type Booking,
  type BookingStatus,
  type VerificationMode,
  type VehicleKind,
} from "@/lib/types";

/**
 * The four-phase booking lifecycle, executed server-side against Supabase.
 *
 * These are the only writes the website performs, and every one of them runs
 * through the service-role client because the public roles have no write grants
 * on `bookings`/`parking_spots` beyond what RLS narrowly allows (migrations
 * 014/015). Because that client bypasses RLS, authorisation is enforced *here*,
 * explicitly, before any query — see `requireActor` and the per-action checks.
 *
 * Money is always recomputed on this side. A figure sent by the browser is
 * never written to the database.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface Actor {
  user: SessionUser;
  db: SupabaseClient;
}

async function requireActor(): Promise<ActionResult<Actor>> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Sign in to lock a bay — your booking has to belong to an account." };
  }

  const db = createSupabaseAdminClient();
  if (!db) {
    return {
      ok: false,
      error:
        "Booking writes need SUPABASE_SERVICE_ROLE_KEY in website/.env.local. Add it and restart.",
    };
  }

  return { ok: true, data: { user, db } };
}

function randomDigits(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

function randomToken(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

const BOOKING_COLUMNS =
  "id, spot_id, driver_id, vehicle_id, status, start_time, expected_end_time, actual_check_in, actual_check_out, base_amount, overstay_amount, platform_fee, provider_earnings, pin_code, qr_secret, verified_via, payment_intent_id, created_at";

interface SpotMini {
  id: string;
  title: string;
  address: string;
  hourly_rate: number;
  status: string;
  provider_id: string;
}

async function loadSpot(db: SupabaseClient, spotId: string): Promise<SpotMini | null> {
  const { data } = await db
    .from("parking_spots")
    .select("id, title, address, hourly_rate, status, provider_id")
    .eq("id", spotId)
    .maybeSingle();

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    title: String(row.title),
    address: String(row.address),
    hourly_rate: Number(row.hourly_rate),
    status: String(row.status),
    provider_id: String(row.provider_id),
  };
}

async function loadBooking(
  db: SupabaseClient,
  bookingId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function releaseSpot(db: SupabaseClient, spotId: string): Promise<void> {
  // Mirrors `bookings/service.ts`: a bay with an IoT barrier stays locked until
  // the barrier itself reports clear, so the web console never frees one.
  await db
    .from("parking_spots")
    .update({ status: "available" })
    .eq("id", spotId)
    .eq("has_iot_barrier", false);
}

/* ── Phase 1 · Lock & pre-authorise ────────────────────────────────────────── */

export interface LockInput {
  spotId: string;
  hours: number;
  vehicleKind: VehicleKind;
  plate: string;
  makeModel?: string;
}

/**
 * Create the 10-minute hold.
 *
 * The hold's deadline is derived from `created_at + BOOKING_LOCK_TTL_SECONDS`
 * rather than a stored column — the schema has no expiry field because the
 * production API keeps the TTL in Redis (`backend/src/lib/redis.ts`). Any reader
 * treats an older `pending_lock` as expired, and `releaseExpiredLocks()` sweeps
 * them, so abandoning a hold can never strand a bay.
 */
export async function lockSpot(input: LockInput): Promise<ActionResult<Booking>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const hours = Number(input.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { ok: false, error: "Choose a stay between 1 and 24 hours." };
  }

  const plate = input.plate.trim().toUpperCase();
  if (plate.length < 3) {
    return { ok: false, error: "Enter the licence plate of the car you're parking." };
  }

  const spot = await loadSpot(db, input.spotId);
  if (!spot) return { ok: false, error: "That bay no longer exists." };
  if (spot.status !== "available") {
    return { ok: false, error: "Someone else just took this bay. Pick another one." };
  }

  // Reuse the driver's existing vehicle for this plate, or register it once.
  const { data: existingVehicle } = await db
    .from("vehicles")
    .select("id, driver_id")
    .eq("license_plate", plate)
    .maybeSingle();

  let vehicleId: string;
  if (existingVehicle) {
    const row = existingVehicle as { id: string; driver_id: string };
    if (row.driver_id !== user.id) {
      return { ok: false, error: "That plate is already registered to another account." };
    }
    vehicleId = row.id;
  } else {
    const { data: created, error: vehicleError } = await db
      .from("vehicles")
      .insert({
        driver_id: user.id,
        license_plate: plate,
        make_model: input.makeModel?.trim() || `${input.vehicleKind.toUpperCase()} · ${plate}`,
        vehicle_type: input.vehicleKind,
      })
      .select("id")
      .single();

    if (vehicleError || !created) {
      return { ok: false, error: vehicleError?.message ?? "Could not register the vehicle." };
    }
    vehicleId = (created as { id: string }).id;
  }

  const baseAmount = computeBaseAmount(spot.hourly_rate, hours);
  const platformFee = Math.round(baseAmount * PLATFORM.commissionRate * 100) / 100;
  const providerEarnings = Math.round((baseAmount - platformFee) * 100) / 100;
  const startTime = new Date();
  const expectedEnd = new Date(startTime.getTime() + hours * 3600_000);

  const { data: inserted, error: insertError } = await db
    .from("bookings")
    .insert({
      spot_id: spot.id,
      driver_id: user.id,
      vehicle_id: vehicleId,
      status: "pending_lock" satisfies BookingStatus,
      start_time: startTime.toISOString(),
      expected_end_time: expectedEnd.toISOString(),
      base_amount: baseAmount,
      overstay_amount: 0,
      platform_fee: platformFee,
      provider_earnings: providerEarnings,
      pin_code: randomDigits(4),
      qr_secret: randomToken(32),
      payment_intent_id: `pi_web_${randomToken(18)}`,
    })
    .select(BOOKING_COLUMNS)
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Could not create the hold." };
  }

  await db.from("parking_spots").update({ status: "locked" }).eq("id", spot.id);

  revalidatePath("/explore");
  revalidatePath("/admin");

  return {
    ok: true,
    data: toBooking(inserted as Record<string, unknown>, spot, plate),
  };
}

/**
 * Row → `Booking`.
 *
 * `hostName` is intentionally blank: the caller already holds the `Spot` it is
 * acting on and merges the two, which avoids a second provider lookup on every
 * lifecycle write.
 */
function toBooking(
  row: Record<string, unknown>,
  spot: SpotMini,
  plate: string,
): Booking {
  return {
    id: String(row.id),
    spotId: String(row.spot_id),
    driverId: String(row.driver_id),
    vehicleId: String(row.vehicle_id),
    status: String(row.status) as BookingStatus,
    startsAt: String(row.start_time),
    expectedEndAt: String(row.expected_end_time),
    actualCheckIn: (row.actual_check_in as string | null) ?? null,
    actualCheckOut: (row.actual_check_out as string | null) ?? null,
    baseAmount: Number(row.base_amount),
    overstayAmount: Number(row.overstay_amount),
    platformFee: Number(row.platform_fee),
    providerEarnings: Number(row.provider_earnings),
    pin: String(row.pin_code),
    qrSecret: String(row.qr_secret),
    verifiedVia: (row.verified_via as VerificationMode | null) ?? null,
    paymentIntentId: String(row.payment_intent_id),
    createdAt: String(row.created_at),
    spotTitle: spot.title,
    address: spot.address,
    hostName: "",
    plate,
    hourlyRate: spot.hourly_rate,
  };
}

/* ── Phase 2 · Escrow authorised ───────────────────────────────────────────── */

export async function confirmEscrow(bookingId: string): Promise<ActionResult<Booking>> {
  return advance(bookingId, "reserved", {
    // The production gateway writes this from its webhook; the web console mints
    // a mock authorisation id so the row is always traceable to a payment.
    payment_intent_id: `pi_web_auth_${randomToken(16)}`,
  });
}

/* ── Phase 3 · Arrival ─────────────────────────────────────────────────────── */

export interface CheckInInput {
  bookingId: string;
  mode: VerificationMode;
  /** Metres from the bay, when the driver shared a location. */
  distanceMeters?: number;
  pin?: string;
}

export async function checkIn(input: CheckInInput): Promise<ActionResult<Booking>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const booking = await loadBooking(db, input.bookingId);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (String(booking.driver_id) !== user.id && user.role !== "admin") {
    return { ok: false, error: "This booking belongs to someone else." };
  }

  // Geofence check-ins are verified against the real distance the browser
  // measured, and refused outside CHECKIN_GEOFENCE_METERS.
  if (input.mode === "geofence") {
    const distance = Number(input.distanceMeters ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(distance) || distance > PLATFORM.geofenceMeters) {
      return {
        ok: false,
        error: `You're ${Math.round(distance)} m away. Get within ${PLATFORM.geofenceMeters} m of the bay, or verify with the PIN instead.`,
      };
    }
  }

  if (input.mode === "pin") {
    const supplied = String(input.pin ?? "").trim();
    if (!supplied) return { ok: false, error: "Enter the 4-digit PIN from your pass." };
    if (supplied !== String(booking.pin_code)) {
      return { ok: false, error: "That PIN doesn't match this booking." };
    }
  }

  try {
    assertTransition(String(booking.status) as BookingStatus, "checked_in");
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const { data, error } = await db
    .from("bookings")
    .update({
      status: "checked_in" satisfies BookingStatus,
      actual_check_in: new Date().toISOString(),
      verified_via: input.mode,
    })
    .eq("id", input.bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Check-in failed." };

  const spot = await loadSpot(db, String(booking.spot_id));
  revalidatePath("/explore");

  return {
    ok: true,
    data: toBooking(data as Record<string, unknown>, spot ?? emptySpot(String(booking.spot_id)), "—"),
  };
}

function emptySpot(id: string): SpotMini {
  return { id, title: "Parking bay", address: "", hourly_rate: 0, status: "locked", provider_id: "" };
}

/* ── Phase 4 · Checkout & settlement ───────────────────────────────────────── */

export interface CheckoutInput {
  bookingId: string;
  /** Minutes of simulated overstay, from the fast-forward control. */
  overstayMinutes?: number;
}

export async function checkout(input: CheckoutInput): Promise<ActionResult<Booking>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const booking = await loadBooking(db, input.bookingId);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (String(booking.driver_id) !== user.id && user.role !== "admin") {
    return { ok: false, error: "This booking belongs to someone else." };
  }

  const spot = await loadSpot(db, String(booking.spot_id));
  const rate = spot?.hourly_rate ?? 0;

  const bookedMinutes = minutesBetween(
    String(booking.start_time),
    String(booking.expected_end_time),
  );
  const elapsed = minutesBetween(String(booking.actual_check_in ?? booking.start_time), new Date().toISOString());
  const parkedMinutes = Math.max(elapsed, bookedMinutes) + Math.max(0, Number(input.overstayMinutes ?? 0));

  const breakdown = computeCheckoutBreakdown({
    baseAmount: Number(booking.base_amount),
    hourlyRate: rate,
    overstayMultiplier: 1.5,
    parkedMinutes,
    bookedMinutes,
  });

  const late = breakdown.overstayAmount > 0;
  try {
    assertTransition(String(booking.status) as BookingStatus, "completed");
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const { data, error } = await db
    .from("bookings")
    .update({
      status: "completed" satisfies BookingStatus,
      actual_check_out: new Date().toISOString(),
      overstay_amount: breakdown.overstayAmount,
      platform_fee: breakdown.platformFee,
      provider_earnings: breakdown.providerEarnings,
    })
    .eq("id", input.bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Checkout failed." };

  // Settlement row: this is what makes the host's payout ledger real rather
  // than derived, and it mirrors `backend/src/modules/bookings/service.ts`.
  if (spot) {
    await db.from("settlement_ledger").insert({
      booking_id: input.bookingId,
      driver_id: String(booking.driver_id),
      provider_id: spot.provider_id,
      gross_amount: breakdown.grossAmount,
      platform_fee: breakdown.platformFee,
      provider_earnings: breakdown.providerEarnings,
      status: late ? "settled_overstay" : "settled",
      gateway_ref: `web_${randomToken(12)}`,
    });
    await releaseSpot(db, spot.id);
  }

  revalidatePath("/explore");
  revalidatePath("/provider");
  revalidatePath("/admin");

  return {
    ok: true,
    data: toBooking(data as Record<string, unknown>, spot ?? emptySpot(String(booking.spot_id)), "—"),
  };
}

/* ── Cancel / release ──────────────────────────────────────────────────────── */

async function advance(
  bookingId: string,
  next: BookingStatus,
  patch: Record<string, unknown> = {},
): Promise<ActionResult<Booking>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const booking = await loadBooking(db, bookingId);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (String(booking.driver_id) !== user.id && user.role !== "admin") {
    return { ok: false, error: "This booking belongs to someone else." };
  }

  try {
    assertTransition(String(booking.status) as BookingStatus, next);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const { data, error } = await db
    .from("bookings")
    .update({ status: next, ...patch })
    .eq("id", bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Update failed." };

  const spot = await loadSpot(db, String(booking.spot_id));
  revalidatePath("/explore");

  return {
    ok: true,
    data: toBooking(data as Record<string, unknown>, spot ?? emptySpot(String(booking.spot_id)), "—"),
  };
}

export async function cancelBooking(bookingId: string): Promise<ActionResult<Booking>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { db } = actor.data;

  const booking = await loadBooking(db, bookingId);
  if (!booking) return { ok: false, error: "Booking not found." };

  const result = await advance(bookingId, "cancelled");
  if (result.ok) {
    await releaseSpot(db, String(booking.spot_id));
    revalidatePath("/provider");
  }
  return result;
}

/**
 * Sweep holds that outlived their TTL.
 *
 * The API does this with a Redis key expiry plus the overstay worker; without
 * Redis the web console does it on read, so an abandoned browser tab can never
 * leave a bay locked. Safe to call repeatedly — it only touches `pending_lock`
 * rows older than the TTL.
 */
export async function releaseExpiredLocks(): Promise<number> {
  const db = createSupabaseAdminClient();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const { data } = await db
    .from("bookings")
    .select("id, spot_id")
    .eq("status", "pending_lock")
    .lt("created_at", cutoff);

  const rows = (data ?? []) as Array<{ id: string; spot_id: string }>;
  for (const row of rows) {
    await db.from("bookings").update({ status: "cancelled" }).eq("id", row.id);
    await releaseSpot(db, row.spot_id);
  }

  return rows.length;
}

/* ── Host + operator controls ──────────────────────────────────────────────── */

/** A host may re-price a bay they own. Admins may re-price any bay. */
export async function updateSpotRate(
  spotId: string,
  hourlyRate: number,
): Promise<ActionResult<{ id: string; hourly_rate: number }>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const rate = Math.round(Number(hourlyRate));
  if (!Number.isFinite(rate) || rate < 10 || rate > 500) {
    return { ok: false, error: "Set a rate between ₹10 and ₹500 per hour." };
  }

  const spot = await loadSpot(db, spotId);
  if (!spot) return { ok: false, error: "Bay not found." };
  if (spot.provider_id !== user.id && user.role !== "admin") {
    return { ok: false, error: "You can only re-price bays you host." };
  }

  const { error } = await db
    .from("parking_spots")
    .update({ hourly_rate: rate })
    .eq("id", spotId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/provider");
  revalidatePath("/explore");
  return { ok: true, data: { id: spotId, hourly_rate: rate } };
}

/** Pause (`inactive`) or re-list (`available`) a bay. */
export async function setSpotStatus(
  spotId: string,
  status: "available" | "inactive" | "maintenance",
): Promise<ActionResult<{ id: string; status: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  const spot = await loadSpot(db, spotId);
  if (!spot) return { ok: false, error: "Bay not found." };
  if (spot.provider_id !== user.id && user.role !== "admin") {
    return { ok: false, error: "You can only manage bays you host." };
  }

  const { error } = await db.from("parking_spots").update({ status }).eq("id", spotId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/provider");
  revalidatePath("/explore");
  return { ok: true, data: { id: spotId, status } };
}

/**
 * Operator override: tear down a Redis/DB hold that is stuck.
 *
 * Admins only. This is the "Force Release Lock" control in the god-view, and it
 * is the one action that can cancel a booking belonging to somebody else.
 */
export async function forceReleaseLock(
  bookingId: string,
): Promise<ActionResult<{ bookingId: string; spotId: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (user.role !== "admin") {
    return { ok: false, error: "Only an operator can force-release a lock." };
  }

  const db = createSupabaseAdminClient();
  if (!db) return { ok: false, error: "Service role key missing — cannot override locks." };

  const booking = await loadBooking(db, bookingId);
  if (!booking) return { ok: false, error: "Booking not found." };

  const { error } = await db
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await db.from("parking_spots").update({ status: "available" }).eq("id", String(booking.spot_id));

  revalidatePath("/admin");
  revalidatePath("/explore");
  return { ok: true, data: { bookingId, spotId: String(booking.spot_id) } };
}

/** Raise a dispute against a booking the actor was party to. */
export async function raiseDispute(input: {
  bookingId: string;
  reason: string;
  description: string;
}): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor.data;

  if (!input.description.trim()) {
    return { ok: false, error: "Describe what went wrong." };
  }

  const { data, error } = await db
    .from("disputes")
    .insert({
      booking_id: input.bookingId,
      reporter_id: user.id,
      reason: input.reason.trim() || "spot_blocked",
      description: input.description.trim(),
      resolved: false,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not file the report." };

  revalidatePath("/admin");
  return { ok: true, data: { id: (data as { id: string }).id } };
}
