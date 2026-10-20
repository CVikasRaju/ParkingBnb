import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/guards";
import { Errors } from "../../lib/errors";
import { db } from "../../lib/db";
import { env } from "../../config/env";
import { signQrToken } from "../../lib/qr";
import {
  lockSpot,
  confirmPayment,
  checkIn,
  checkOut,
  cancelBooking,
  getBooking,
  assertBookingAccess,
} from "./service";
import { createPaymentOrder, verifyPaymentConfirmation } from "../payments/gateway";

const lockSchema = z.object({
  spot_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  start_time: z.string().datetime(),
  duration_hours: z.number().positive().max(24),
});

const confirmSchema = z.object({
  payment_id: z.string().min(1),
  signature: z.string().min(1),
});

const checkInSchema = z
  .object({
    method: z.enum(["pin", "qr_code", "geofence"]),
    pin_code: z.string().regex(/^\d{4}$/).optional(),
    qr_token: z.string().optional(),
    driver_lat: z.number().min(-90).max(90).optional(),
    driver_lng: z.number().min(-180).max(180).optional(),
  })
  .refine((b) => b.method !== "qr_code" || !!b.qr_token, {
    message: "qr_token required for qr_code method",
  })
  .refine((b) => b.method !== "pin" || !!b.pin_code, {
    message: "pin_code required for pin method",
  })
  .refine((b) => b.method !== "geofence" || (b.driver_lat !== undefined && b.driver_lng !== undefined), {
    message: "driver_lat/driver_lng required for geofence method",
  });

const deviceCheckOutSchema = z.object({
  timestamp: z.string().datetime(),
});

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  /** Sprint 2: Phase 1 lock + payment pre-auth. */
  app.post("/bookings/lock", { onRequest: [requireRole("driver")] }, async (req) => {
    const body = lockSchema.parse(req.body);

    // Prerequisite: the vehicle must belong to the caller.
    const vehicle = await db.one(
      "SELECT id FROM vehicles WHERE id = $1 AND driver_id = $2",
      [body.vehicle_id, req.auth!.sub]
    );

    const booking = await lockSpot({
      spotId: body.spot_id,
      driverId: req.auth!.sub,
      vehicleId: vehicle.id,
      startTime: new Date(body.start_time),
      durationHours: body.duration_hours,
    });

    const spot = await db.one(
      `SELECT hourly_rate, category, plug_type, power_output_kw, energy_rate_per_kwh FROM parking_spots WHERE id = $1`,
      [body.spot_id]
    );
    const base = Number(booking.base_amount);

    const order = await createPaymentOrder({
      bookingId: booking.id,
      amount: base,
    });

    return {
      success: true,
      data: {
        booking_id: booking.id,
        lock_expires_at: new Date(Date.now() + 600_000).toISOString(),
        base_amount: base,
        currency: order.currency,
        payment_gateway: {
          provider: order.gateway,
          order_id: order.order_id,
          amount: order.amount,
        },
        hourly_rate: Number(spot.hourly_rate),
        duration_hours: body.duration_hours,
        category: spot.category ?? "parking_only",
        plug_type: spot.plug_type ?? "none",
        power_output_kw: Number(spot.power_output_kw ?? 0),
        energy_rate_per_kwh: Number(spot.energy_rate_per_kwh ?? 0),
      },
    };
  });

  /** Sprint 2: Phase 2 confirm payment → reserved, unlock, push provider. */
  app.post("/bookings/:id/confirm-payment", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = confirmSchema.parse(req.body);
    const booking = await getBooking(id);
    if (booking.driver_id !== req.auth!.sub) throw Errors.forbidden("Not your booking");

    const verified = await verifyPaymentConfirmation({
      bookingId: id,
      paymentId: body.payment_id,
      signature: body.signature,
    });
    if (!verified) throw Errors.badRequest("Payment signature verification failed");

    const updated = await confirmPayment(id, body.payment_id, body.signature);

    // Compose navigation deep links + verification pass for the Active Pass.
    const spot = await db.one(
      `SELECT id, title, address, entry_instructions,
              ST_Y(location::geometry) AS latitude,
              ST_X(location::geometry) AS longitude
       FROM parking_spots WHERE id = $1`,
      [booking.spot_id]
    );
    const lat = Number(spot.latitude);
    const lng = Number(spot.longitude);

    return {
      success: true,
      data: {
        booking_id: updated.id,
        status: "reserved",
        navigation: {
          latitude: lat,
          longitude: lng,
          address: spot.address,
          entry_instructions: spot.entry_instructions,
          google_maps_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
          apple_maps_url: `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
        },
        verification: {
          pin_code: updated.pin_code,
          dynamic_qr_payload: signQrToken(updated.id, updated.qr_secret),
        },
      },
    };
  });

  /** Sprint 3: fresh 60s QR payload (server signs; never exposes qr_secret). */
  app.get("/bookings/:id/qr", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const booking = await getBooking(id);
    await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);
    if (booking.status !== "reserved" && booking.status !== "pending_lock") {
      throw Errors.conflict(`QR tokens are only issued while the booking is not terminal (status=${booking.status})`);
    }
    return {
      success: true,
      data: {
        booking_id: id,
        dynamic_qr_payload: signQrToken(id, booking.qr_secret),
        expires_in_seconds: env.QR_TOKEN_TTL_SECONDS,
      },
    };
  });

  /** Sprint 3: Phase 3 check-in (pin / QR / geofence). */
  app.post("/bookings/:id/check-in", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = checkInSchema.parse(req.body);
    const booking = await getBooking(id);
    await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);

    const updated = await checkIn(id, body.method, {
      pin: body.pin_code,
      token: body.qr_token,
      latitude: body.driver_lat,
      longitude: body.driver_lng,
    });

    return {
      success: true,
      data: {
        booking_id: updated.id,
        status: "checked_in",
        session_start_time: updated.actual_check_in,
        barrier_triggered: false,
      },
    };
  });

  /** Sprint 3: Phase 4 check-out (overstay + escrow split). */
  app.post("/bookings/:id/check-out", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const booking = await getBooking(id);
    await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);

    const { booking: updated, breakdown } = await checkOut(id);

    const bookedMinutes = Math.round(
      (new Date(updated.expected_end_time).getTime() - new Date(updated.start_time).getTime()) / 60_000
    );
    const actualMinutes = Math.round(
      (new Date(updated.actual_check_out!).getTime() - new Date(updated.actual_check_in ?? updated.start_time).getTime()) / 60_000
    );
    const overstayMinutes = Math.max(0, actualMinutes - bookedMinutes);

    return {
      success: true,
      data: {
        booking_id: updated.id,
        status: "completed",
        breakdown: {
          booked_duration_minutes: bookedMinutes,
          actual_duration_minutes: actualMinutes,
          overstay_minutes: overstayMinutes,
          base_fee: breakdown.base_amount,
          overstay_fee: breakdown.overstay_amount,
          energy_kwh: breakdown.energy_kwh,
          energy_rate_per_kwh: breakdown.energy_rate_per_kwh,
          energy_fee: breakdown.energy_amount,
          total_charged: breakdown.gross_amount,
          platform_commission_15_pct: breakdown.platform_fee,
          provider_payout_amount: breakdown.provider_earnings,
        },
      },
    };
  });

  /** Driver cancels a pending_lock/reserved booking. */
  app.post("/bookings/:id/cancel", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const booking = await cancelBooking(id, req.auth!.sub);
    return { success: true, data: { booking_id: booking.id, status: booking.status } };
  });

  /**
   * Driver taps "I'm leaving" — records a provisional checkout timestamp
   * used to compute the actual duration. System accepts the earlier of this
   * and the definitive check-out call below.
   */
  app.post("/bookings/:id/device-checkout", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    deviceCheckOutSchema.parse(req.body);
    const booking = await getBooking(id);
    if (booking.driver_id !== req.auth!.sub) throw Errors.forbidden("Not your booking");
    return { success: true, data: { booking_id: id, checkout_provisional: true } };
  });

  /** List bookings: driver gets their bookings; provider gets bookings on their spots. */
  app.get("/bookings", { onRequest: [requireAuth] }, async (req) => {
    const query = req.query as { role?: string; status?: string };
    const isProvider = query?.role === "provider" || req.auth!.role === "provider";

    if (isProvider) {
      const { rows } = await db.query(
        `SELECT b.*,
                ps.title AS spot_title, ps.address AS spot_address, ps.category, ps.plug_type,
                ps.hourly_rate, ps.energy_rate_per_kwh,
                v.license_plate, v.make_model, v.vehicle_type,
                u.full_name AS driver_name, u.phone_number AS driver_phone
         FROM bookings b
         JOIN parking_spots ps ON ps.id = b.spot_id
         JOIN vehicles v ON v.id = b.vehicle_id
         JOIN users u ON u.id = b.driver_id
         WHERE ps.provider_id = $1
         ORDER BY b.start_time DESC
         LIMIT 100`,
        [req.auth!.sub]
      );
      return { success: true, data: rows };
    }

    const { rows } = await db.query(
      `SELECT b.*,
              ps.title AS spot_title, ps.address AS spot_address, ps.category, ps.plug_type,
              ps.hourly_rate, ps.energy_rate_per_kwh,
              v.license_plate, v.make_model, v.vehicle_type,
              host.full_name AS provider_name, host.phone_number AS provider_phone
       FROM bookings b
       JOIN parking_spots ps ON ps.id = b.spot_id
       JOIN vehicles v ON v.id = b.vehicle_id
       JOIN users host ON host.id = ps.provider_id
       WHERE b.driver_id = $1
       ORDER BY b.created_at DESC
       LIMIT 100`,
      [req.auth!.sub]
    );
    return { success: true, data: rows };
  });

  /** Get single booking details with full receipt. */
  app.get("/bookings/:id", { onRequest: [requireAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const booking = await getBooking(id);
    await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);

    const spot = await db.one(
      `SELECT title, address, hourly_rate, category, plug_type, power_output_kw, energy_rate_per_kwh, entry_instructions
       FROM parking_spots WHERE id = $1`,
      [booking.spot_id]
    );

    const vehicle = await db.maybeOne(
      `SELECT license_plate, make_model, vehicle_type FROM vehicles WHERE id = $1`,
      [booking.vehicle_id]
    );

    const baseAmount = Number(booking.base_amount);
    const overstayAmount = Number(booking.overstay_amount ?? 0);
    const energyAmount = Number(booking.energy_amount ?? 0);
    const energyKwh = Number(booking.energy_kwh ?? 0);
    const totalCharged = baseAmount + overstayAmount + energyAmount;

    return {
      success: true,
      data: {
        ...booking,
        spot,
        vehicle,
        itemized_receipt: {
          base_amount: baseAmount,
          overstay_amount: overstayAmount,
          energy_kwh: energyKwh,
          energy_rate_per_kwh: Number(spot.energy_rate_per_kwh ?? 0),
          energy_amount: energyAmount,
          total_paid: totalCharged,
          platform_fee: Number(booking.platform_fee),
          provider_earnings: Number(booking.provider_earnings),
        },
      },
    };
  });
}