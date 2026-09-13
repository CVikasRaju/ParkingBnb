import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/guards";
import { Errors } from "../../lib/errors";
import { db } from "../../lib/db";
import { getBooking, transition } from "../bookings/service";
import { refundBooking } from "../payments/service";

const reportSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.enum(["spot_blocked", "overstay_refusal", "damage", "other"]),
  description: z.string().min(3).max(2000),
  photo_evidence_url: z.string().url().optional(),
});

/**
 * Sprint 4 — "Report blocked spot". The driver is auto-refunded and the spot
 * is flagged for admin review once the report lands (blockage = not usable
 * → remove from search via `maintenance`). The booking moves to `disputed`
 * so no other lifecycle endpoint can mutate it while it's under review.
 */
export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/disputes/report", { onRequest: [requireRole("driver")] }, async (req) => {
    const body = reportSchema.parse(req.body);
    const booking = await getBooking(body.booking_id);
    if (booking.driver_id !== req.auth!.sub) throw Errors.forbidden("Not your booking");

    // Auto-refund: return the base amount to the driver (idempotent).
    const refund = await refundBooking(body.booking_id);

    // Move to disputed (only from live states; already-terminal stays as-is).
    if (!["cancelled", "completed", "disputed"].includes(booking.status)) {
      try {
        await transition(booking.id, "disputed");
      } catch {
        // If the booking is in a state that cannot move to disputed (e.g. a
        // race), leave it — the refund ledger is the source of truth.
      }
    }

    const { rows } = await db.query(
      `INSERT INTO disputes (booking_id, reporter_id, reason, description, photo_evidence_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, booking_id, reason, created_at`,
      [body.booking_id, req.auth!.sub, body.reason, body.description, body.photo_evidence_url ?? null]
    );

    // Put the spot into maintenance so it leaves the map immediately.
    await db.query(
      "UPDATE parking_spots SET status = 'maintenance' WHERE id = $1 AND has_iot_barrier = FALSE",
      [booking.spot_id]
    );

    return {
      success: true,
      data: {
        dispute_id: rows[0].id,
        refunded_amount: refund.amount,
        reason: rows[0].reason,
        status: "opened",
      },
    };
  });

  /** Provider/admin can list disputes touching them. */
  app.get("/disputes", { onRequest: [requireAuth] }, async (req) => {
    const { rows } = await db.query(
      `SELECT d.id, d.booking_id, d.reason, d.description, d.photo_evidence_url,
              d.resolved, d.admin_notes, d.created_at, b.driver_id
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       WHERE b.driver_id = $1 OR EXISTS (
         SELECT 1 FROM parking_spots ps WHERE ps.id = b.spot_id AND ps.provider_id = $1
       )
       ORDER BY d.created_at DESC`,
      [req.auth!.sub]
    );
    return { success: true, data: rows };
  });
}