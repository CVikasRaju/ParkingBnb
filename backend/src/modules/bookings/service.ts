import { db } from "../../lib/db";
import { redis, REDIS_KEYS } from "../../lib/redis";
import { env } from "../../config/env";
import { Errors } from "../../lib/errors";
import { computeBaseAmount, computeCheckoutBreakdown } from "../../lib/money";
import { generateQrSecret, generatePin, verifyQrToken } from "../../lib/qr";
import { isWithinGeofence } from "../../lib/geo";
import { sendPush } from "../../lib/notifications";
import { broadcastSpotStatus } from "../../lib/realtime";
import { getSpotById } from "../spots/service";
import { assertTransition, type BookingStatus } from "../../lib/fsm";

const bookingSelect = `
  b.id, b.spot_id, b.driver_id, b.vehicle_id, b.status,
  b.start_time, b.expected_end_time, b.actual_check_in, b.actual_check_out,
  b.base_amount, b.overstay_amount, b.platform_fee, b.provider_earnings,
  b.pin_code, b.qr_secret, b.verified_via, b.payment_intent_id,
  b.created_at, b.updated_at
`;

export interface LockBookingInput {
  spotId: string;
  driverId: string;
  vehicleId: string;
  startTime: Date;
  durationHours: number;
}

export interface BookingRow {
  id: string;
  spot_id: string;
  driver_id: string;
  vehicle_id: string;
  status: BookingStatus;
  start_time: Date;
  expected_end_time: Date;
  actual_check_in: Date | null;
  actual_check_out: Date | null;
  base_amount: number;
  overstay_amount: number;
  platform_fee: number;
  provider_earnings: number;
  pin_code: string;
  qr_secret: string;
  verified_via: string | null;
  payment_intent_id: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Phase 1 — atomic SpotLock.
 *
 * `SET lock:spot:{id} <json> NX EX 600` is a single Redis command: no
 * read-then-write race. A driver's OLD lock on another spot is evicted first
 * (same driver can only hold one active lock) but another driver's lock is
 * untouched — that's the 409.
 *
 * Hardware (ANPR/IoT) spots publish over Redis as well via `SE`
 * (set-if-exists) shadow keys that let the gate webhook decide exactly one
 * booking. Simulated here as device shadow books (see webhooks module).
 */
export async function lockSpot(input: LockBookingInput) {
  const spot = await getSpotById(input.spotId);
  if (spot.status !== "available") {
    throw Errors.conflict("This slot is not available for booking right now.");
  }

  // 1. Release any older lock the same driver holds elsewhere.
  const prevDriverLockKey = await redis.get(REDIS_KEYS.driverActiveLock(input.driverId));
  if (prevDriverLockKey) {
    const prevKey = await redis.get(prevDriverLockKey);
    await redis.del(prevDriverLockKey);
    await redis.del(REDIS_KEYS.driverActiveLock(input.driverId));
    void prevKey; // tombstone read for correctness logging
  }

  // 2. Atomic acquire: SET ... NX EX <TTL>. NIL => lock held by someone else.
  const spotLockKey = REDIS_KEYS.spotLock(input.spotId);
  const bookingId = crypto.randomUUID();
  const lockValue = { booking_id: bookingId, driver_id: input.driverId };
  const acquired = await redis.set(spotLockKey, JSON.stringify(lockValue), "EX", env.BOOKING_LOCK_TTL_SECONDS, "NX");
  if (acquired !== "OK") {
    throw Errors.conflict(
      "This slot was just locked by another driver. Please select an alternate spot."
    );
  }
  await redis.set(REDIS_KEYS.driverActiveLock(input.driverId), spotLockKey);

  // 3. Mark the spot locked in Postgres (keeps the map + search honest).
  await db.query("UPDATE parking_spots SET status = 'locked' WHERE id = $1", [input.spotId]);

  // 4. Create booking row (pending_lock). Amount = base only; overstay later.
  const base = computeBaseAmount(Number(spot.hourly_rate), input.durationHours);
  const expectedEnd = new Date(input.startTime.getTime() + input.durationHours * 3_600_000);
  const gross = base;
  const platformFee = Math.round(gross * env.PLATFORM_COMMISSION_RATE * 100) / 100;
  const providerEarnings = Math.round((gross - platformFee) * 100) / 100;

  const booking = await db.one(
    `INSERT INTO bookings AS b (
       id, spot_id, driver_id, vehicle_id, status, start_time, expected_end_time,
       base_amount, overstay_amount, platform_fee, provider_earnings,
       pin_code, qr_secret, payment_intent_id
     ) VALUES ($1,$2,$3,$4,'pending_lock',$5,$6,$7,0,$8,$9,$10,$11,$12)
     RETURNING ${bookingSelect}`,
    [
      bookingId,
      input.spotId,
      input.driverId,
      input.vehicleId,
      input.startTime,
      expectedEnd,
      base,
      platformFee,
      providerEarnings,
      generatePin(),
      generateQrSecret(),
      `pending_${bookingId}`,
    ]
  );

  broadcastSpotStatus(input.spotId, "locked");
  return booking as unknown as BookingRow;
}

async function transition(bookingId: string, to: BookingStatus, extra?: Record<string, unknown>) {
  const before = await db.one<{ status: BookingStatus }>(
    "SELECT status FROM bookings WHERE id = $1",
    [bookingId]
  );
  assertTransition(before.status, to);
  const sets: string[] = ["status = $2"];
  const params: unknown[] = [bookingId, to];
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      params.push(v);
      sets.push(`${k} = $${params.length}`);
    }
  }
  const { rows } = await db.query(
    `UPDATE bookings AS b SET ${sets.join(", ")} WHERE id = $1 RETURNING ${bookingSelect}`,
    params
  );
  if (!rows[0]) throw Errors.notFound("Booking not found");
  return rows[0] as unknown as BookingRow;
}

/** Validate the caller can touch this booking (driver, provider, or admin). */
export async function assertBookingAccess(
  booking: BookingRow,
  userId: string,
  role: string
): Promise<void> {
  if (role === "admin") return;
  if (booking.driver_id === userId) return;
  const spot = await getSpotById(booking.spot_id);
  if (role === "provider" && spot.provider_id === userId) return;
  throw Errors.forbidden("Not your booking");
}

export async function getBooking(id: string): Promise<BookingRow> {
  const row = await db.maybeOne<BookingRow>(`SELECT ${bookingSelect} FROM bookings b WHERE b.id = $1`, [id]);
  if (!row) throw Errors.notFound("Booking not found");
  return row;
}

export async function getSpotBookings(spotId: string, status?: string) {
  const { rows } = await db.query(
    `SELECT ${bookingSelect} FROM bookings b WHERE b.spot_id = $1 ${status ? "AND b.status = $2" : ""} ORDER BY b.created_at DESC`,
    status ? [spotId, status] : [spotId]
  );
  return rows as unknown as BookingRow[];
}

/** Phase 2 — confirm payment (webhook or driver-direct). Frees the Redis lock. */
export async function confirmPayment(
  bookingId: string,
  paymentId: string,
  signature: string
): Promise<BookingRow> {
  const booking = await getBooking(bookingId);
  assertTransition(booking.status, "reserved");
  const updated = await transition(bookingId, "reserved");
  await redis.del(REDIS_KEYS.spotLock(booking.spot_id));
  await redis.del(REDIS_KEYS.driverActiveLock(booking.driver_id));

  // Provider alert: arrival of the vehicle's identity.
  const spot = await getSpotById(booking.spot_id);
  const vehicle = await db.one(
    "SELECT license_plate, make_model FROM vehicles WHERE id = $1",
    [booking.vehicle_id]
  );
  await sendPush(spot.provider_id, {
    title: "New reservation confirmed",
    body: `${vehicle.license_plate} (${vehicle.make_model}) arriving at ${spot.title}.`,
    data: { booking_id: bookingId, spot_id: booking.spot_id },
  });

  void paymentId;
  void signature;
  return updated;
}

/** Phase 3 — check in via pin/qr/geofence/iot_gate (validated server-side). */
export async function checkIn(
  bookingId: string,
  method: "pin" | "qr_code" | "geofence" | "iot_gate",
  opts: { pin?: string; token?: string; latitude?: number; longitude?: number }
): Promise<BookingRow> {
  const booking = await getBooking(bookingId);
  assertTransition(booking.status, "checked_in");

  if (method === "pin") {
    if (!opts.pin || opts.pin !== booking.pin_code) {
      throw Errors.badRequest("Invalid PIN. Please try again.");
    }
  } else if (method === "qr_code") {
    if (!opts.token) throw Errors.badRequest("Missing QR token");
    const ok = verifyQrToken(bookingId, booking.qr_secret, opts.token);
    if (!ok) throw Errors.badRequest("QR token expired or invalid.");
  } else if (method === "geofence") {
    if (opts.latitude === undefined || opts.longitude === undefined) {
      throw Errors.badRequest("Driver coordinates required for geofence check-in.");
    }
    const spot = await getSpotById(booking.spot_id);
    const distance = isWithinGeofence(opts.latitude, opts.longitude, Number(spot.latitude), Number(spot.longitude));
    if (!distance.within) {
      throw Errors.badRequest(
        `You are ${Math.round(distance.distanceMeters)} m from the spot — must be within ${env.CHECKIN_GEOFENCE_METERS} m.`
      );
    }
  } else if (method === "iot_gate") {
    // Device already authenticated via X-Device-Key + spot match (webhooks
    // module); nothing extra to verify here.
  }

  const updated = await transition(bookingId, "checked_in", {
    actual_check_in: new Date(),
    verified_via: method,
  });
  return updated;
}

/**
 * Phase 4 — check out. Computes overstay with the ARCHITECTURE formula and
 * triggers the escrow split (85% provider payout). All money math is
 * server-side; the client never sends amounts here.
 */
export async function checkOut(bookingId: string): Promise<{
  booking: BookingRow;
  breakdown: ReturnType<typeof computeCheckoutBreakdown>;
}> {
  const booking = await getBooking(bookingId);
  assertTransition(booking.status, "completed");

  const spot = await getSpotById(booking.spot_id);
  const now = new Date();
  const actualMinutes = Math.max(
    1,
    Math.round((now.getTime() - new Date(booking.actual_check_in ?? booking.start_time).getTime()) / 60_000)
  );
  const bookedMinutes = Math.max(
    1,
    Math.round((new Date(booking.expected_end_time).getTime() - new Date(booking.start_time).getTime()) / 60_000)
  );

  const breakdown = computeCheckoutBreakdown({
    base_amount: Number(booking.base_amount),
    hourly_rate: Number(spot.hourly_rate),
    overstay_multiplier: Number(spot.overstay_multiplier),
    parked_minutes: actualMinutes,
    booked_minutes: bookedMinutes,
  });

  // Persist the final ledger numbers BEFORE payout, so a worker retry can
  // never double-disburse (payout idem-keyed on booking below).
  const updated = await transition(bookingId, "completed", {
    actual_check_out: now,
    overstay_amount: breakdown.overstay_amount,
    platform_fee: breakdown.platform_fee,
    provider_earnings: breakdown.provider_earnings,
  });

  // Escrow split: 85/15 — idempotent (keyed on booking id).
  await settleEscrow({
    bookingId,
    driverId: booking.driver_id,
    spotId: booking.spot_id,
    grossAmount: breakdown.gross_amount,
    platformFee: breakdown.platform_fee,
    providerEarnings: breakdown.provider_earnings,
  });

  // Free the spot for the next driver.
  await db.query(
    "UPDATE parking_spots SET status = 'available' WHERE id = $1 AND has_iot_barrier = FALSE",
    [booking.spot_id]
  );
  broadcastSpotStatus(booking.spot_id, "available");

  return { booking: updated as unknown as BookingRow, breakdown };
}

/** Driver cancels before check-in: frees lock + restores spot + no charge. */
export async function cancelBooking(
  id: string,
  driverId: string
): Promise<BookingRow> {
  const booking = await getBooking(id);
  if (driverId && booking.driver_id !== driverId) throw Errors.forbidden("Not your booking");
  assertTransition(booking.status, "cancelled");
  const updated = await transition(booking.id, "cancelled");
  await redis.del(REDIS_KEYS.spotLock(booking.spot_id));
  await redis.del(REDIS_KEYS.driverActiveLock(booking.driver_id));
  await db.query(
    "UPDATE parking_spots SET status = 'available' WHERE id = $1 AND has_iot_barrier = FALSE",
    [booking.spot_id]
  );
  broadcastSpotStatus(booking.spot_id, "available");
  return updated as unknown as BookingRow;
}

/**
 * Idempotent escrow settlement → provider wallet. Paying a split transfer
 * through a live gateway (Stripe Connect / Razorpay Route) is handled in the
 * payments module; the ledger is what tests assert on.
 */
async function settleEscrow(args: {
  bookingId: string;
  driverId: string;
  spotId: string;
  grossAmount: number;
  platformFee: number;
  providerEarnings: number;
}) {
  const spot = await getSpotById(args.spotId);
  const done = await db.maybeOne("SELECT id FROM settlement_ledger WHERE booking_id = $1", [args.bookingId]);
  if (!done) {
    await db.query(
      `INSERT INTO settlement_ledger (booking_id, driver_id, provider_id, gross_amount, platform_fee, provider_earnings)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [args.bookingId, args.driverId, spot.provider_id, args.grossAmount, args.platformFee, args.providerEarnings]
    );
    await db.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2",
      [args.providerEarnings, spot.provider_id]
    );
  }
}

export { bookingSelect, transition };