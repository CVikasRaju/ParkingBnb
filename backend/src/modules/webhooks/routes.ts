import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env, isProd } from "../../config/env";
import { db } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { webhookRateLimit } from "../../lib/rateLimit";
import { confirmPayment, checkIn, checkOut } from "../bookings/service";
import { broadcastSpotStatus } from "../../lib/realtime";

/**
 * Payment gateway webhooks.
 *
 *  - Stripe: verifies `stripe-signature` (webhook signing secret).
 *  - Razorpay: verifies Razorpay X-Signature (HMAC SHA256).
 *  - Mock: no signature exists, so in production it must present the shared
 *    `X-Mock-Payment-Secret` — otherwise anyone who can reach the endpoint could
 *    confirm a booking without paying (`MOCK_PAYMENT_SECRET`, enforced at boot
 *    by `productionEnvProblems`). In development the mock stays open.
 */
async function verifyStripe(body: string, sig: string | undefined): Promise<boolean> {
  if (env.PAYMENT_PROVIDER !== "stripe" || !env.STRIPE_WEBHOOK_SECRET) return true;
  if (!sig) return false;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  try {
    const event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
    return event.type === "payment_intent.amount_capturable_updated" || event.type === "payment_intent.succeeded";
  } catch {
    return false;
  }
}

async function verifyRazorpay(orderId: string, signature: string): Promise<boolean> {
  if (env.PAYMENT_PROVIDER !== "razorpay") return true;
  const { createHmac, timingSafeEqual: equal } = await import("node:crypto");
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET || "").update(orderId).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && equal(a, b);
}

/** Shared-secret check for the mock gateway (constant time, length-tolerant). */
function verifyMock(provided: string | undefined): boolean {
  if (env.PAYMENT_PROVIDER !== "mock") return true;
  const expected = env.MOCK_PAYMENT_SECRET;
  // Development convenience: an unset secret means the endpoint stays usable
  // locally. Production cannot get here — the env contract requires the secret.
  if (!expected) return !isProd;
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const iotHookSchema = z.object({
  event_type: z.enum(["plate_detected", "barrier_open", "barrier_closed", "exit_detected", "vehicle_departure"]),
  license_plate: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Gateways and barriers are machines: they retry in bursts, so the ceiling is
  // high but it is not absent.
  app.addHook("preHandler", webhookRateLimit());

  /**
   * Payment intent confirmation — mirrors the FSM edge
   * `LOCKED -> RESERVED` fired by the gateway's
   * `payment_intent.amount_capturable_updated` event (ARCHITECTURE §2).
   *
   * Body shape: the API_SPEC §3 confirm flow and common gateway payloads all
   * surface a `booking_id` (mock eases local testing); Stripe/Razorpay webhooks
   * carry it in metadata and are verified via signing secrets above.
   */
  app.post("/webhooks/payment", async (req, reply) => {
    const raw =
      (req.rawBody as string | undefined) ??
      ((req as unknown as Record<string, unknown>)._parkpeerRawBody as string) ??
      JSON.stringify(req.body ?? {});
    const sig = (req.headers["stripe-signature"] as string) || undefined;
    if (!(await verifyStripe(raw, sig))) {
      throw Errors.unauthorized("Invalid payment webhook signature");
    }
    const body = (req.body ?? {}) as {
      type?: string;
      data?: { object?: { id?: string; metadata?: { booking_id?: string } } };
      payload?: { payment?: { entity?: { order_id?: string } } };
      booking_id?: string;
      payment_id?: string;
    };

    // Razorpay HMAC check when the configured provider is razorpay.
    if (env.PAYMENT_PROVIDER === "razorpay") {
      const sigRz = (req.headers["x-razorpay-signature"] as string) || "";
      const orderId = body.payload?.payment?.entity?.order_id ?? "";
      if (orderId && !(await verifyRazorpay(orderId, sigRz))) {
        throw Errors.unauthorized("Invalid Razorpay signature");
      }
    }

    // Mock gateway: shared secret required in production.
    if (env.PAYMENT_PROVIDER === "mock") {
      const provided = (req.headers["x-mock-payment-secret"] as string) || undefined;
      if (!verifyMock(provided)) {
        throw Errors.unauthorized("Invalid or missing mock payment secret");
      }
    }

    const bookingId =
      body.booking_id ?? body.data?.object?.metadata?.booking_id;
    const paymentId = body.payment_id ?? body.data?.object?.id;

    if (!bookingId) {
      return reply.status(200).send({ received: true, ignored: true });
    }

    await confirmPayment(bookingId, paymentId ?? `gw_${bookingId}`, sig ?? "verified");
    return reply.status(200).send({ received: true, booking_id: bookingId });
  });

  /**
   * IoT barrier / ANPR — high-tech check-in (ARCHITECTURE §4 Tier 2 & API_SPEC §4).
   * Supports both /webhooks/gate and /webhooks/iot-barrier.
   * `X-Device-Key` must match the spot's `iot_device_key`. A `plate_detected`
   * event whose plate matches an active reserved booking opens the gate and
   * starts the session; `exit_detected` or `vehicle_departure` mirrors an IoT check-out.
   */
  const handleGateWebhook = async (req: any, reply: any) => {
    const deviceKey = req.headers["x-device-key"] as string | undefined;
    if (!deviceKey) throw Errors.unauthorized("Missing X-Device-Key header");
    const body = iotHookSchema.parse(req.body);

    const spot = await db.maybeOne(
      `SELECT id, provider_id FROM parking_spots WHERE iot_device_key = $1 AND has_iot_barrier = TRUE`,
      [deviceKey]
    );
    if (!spot) throw Errors.unauthorized("Unknown device key");

    if (body.event_type === "plate_detected" || body.event_type === "vehicle_departure") {
      const plate = (body.license_plate ?? "").toUpperCase();
      const isEntry = body.event_type === "plate_detected";
      const booking = await db.maybeOne(
        `SELECT id FROM bookings
         WHERE spot_id = $1 AND vehicle_id = (
           SELECT id FROM vehicles WHERE license_plate = $2
         )
         AND status = $3
         ORDER BY created_at DESC LIMIT 1`,
        [spot.id, plate, isEntry ? "reserved" : "checked_in"]
      );

      if (!booking) {
        // Unknown plate — keep the barrier closed.
        return reply.status(200).send({ barrier_action: "STAY_CLOSED" });
      }

      if (isEntry) {
        // reserved -> checked_in
        const updated = await checkIn(booking.id, "iot_gate", {});
        return reply.send({ barrier_action: "OPEN", booking_id: updated.id });
      }
      // exit_detected → check the vehicle out
      const { booking: updated } = await checkOut(booking.id);
      return reply.send({ barrier_action: "CLOSED_AFTER_EXIT", booking_id: updated.id });
    }

    if (body.event_type === "barrier_open") {
      broadcastSpotStatus(spot.id, "locked");
    }
    return reply.status(200).send({ received: true });
  };

  app.post("/webhooks/gate", handleGateWebhook);
  app.post("/webhooks/iot-barrier", handleGateWebhook);

  /** Smart breaker / energy meter telemetry webhook. */
  app.post("/webhooks/smart-meter", async (req, reply) => {
    const meterSchema = z.object({
      booking_id: z.string().uuid(),
      kwh: z.number().nonnegative(),
    });
    const body = meterSchema.parse(req.body);
    const { recordMeterReading } = await import("../energy/service");
    const session = await recordMeterReading(body.booking_id, body.kwh);
    return reply.status(200).send({ received: true, session });
  });
}
