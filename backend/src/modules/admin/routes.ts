import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guards";
import { Errors } from "../../lib/errors";
import { db } from "../../lib/db";
import { redis, REDIS_KEYS } from "../../lib/redis";
import { transition } from "../bookings/service";
import { broadcastSpotStatus } from "../../lib/realtime";
import { TERMINAL_STATUSES } from "../../lib/fsm";

const adminOnly = [requireRole("admin")];

const resolveSchema = z.object({
  action: z.enum(["refund", "release", "reject"]),
  admin_notes: z.string().max(2000).optional(),
});

const unlockSchema = z.object({
  booking_id: z.string().uuid().optional(),
  spot_id: z.string().uuid().optional(),
});

/**
 * Sprint 4 admin surface:
 *  - dispute inbox (spot_blocked / overstay_refusal / damage)
 *  - dispute resolution (refund / release  / reject)
 *  - emergency unlock for orphaned Redis locks
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/disputes", { onRequest: adminOnly }, async () => {
    const { rows } = await db.query(
      `SELECT d.id, d.booking_id, d.reason, d.description, d.photo_evidence_url,
              d.resolved, d.admin_notes, d.created_at,
              b.status AS booking_status, b.driver_id,
              ps.title AS spot_title, ps.provider_id
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       JOIN parking_spots ps ON ps.id = b.spot_id
       ORDER BY d.resolved ASC, d.created_at DESC`
    );
    return { success: true, data: rows };
  });

  app.patch("/admin/disputes/:id", { onRequest: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { action, admin_notes } = resolveSchema.parse(req.body);
    const dispute = await db.one("SELECT booking_id FROM disputes WHERE id = $1", [id]);

    const booking = await db.one("SELECT status, id FROM bookings WHERE id = $1", [dispute.booking_id]);

    if (action === "refund") {
      const { refundBooking } = await import("../payments/service");
      await refundBooking(booking.id);
      if (!TERMINAL_STATUSES.has(booking.status)) {
        await transition(booking.id, "cancelled");
      }
    } else if (action === "release") {
      // Cancel only if still active; leave ledger history intact.
      if (!TERMINAL_STATUSES.has(booking.status)) {
        await transition(booking.id, "cancelled");
      }
      await db.query(
        "UPDATE parking_spots SET status = 'available' WHERE id = (SELECT spot_id FROM bookings WHERE id = $1)",
        [booking.id]
      );
    }

    await db.query(
      "UPDATE disputes SET resolved = TRUE, admin_notes = $1 WHERE id = $2",
      [admin_notes ?? action, id]
    );
    return { success: true, data: { dispute_id: id, action, resolved: true } };
  });

  /**
   * Emergency unlock — admins evict orphaned locks (crash, gateway timeout).
   * Deletes the Redis shadow AND the driver-active index for the booking's
   * owner, then restores the spot to available (or cancels the booking).
   */
  app.post("/admin/locks/unlock", { onRequest: adminOnly }, async (req) => {
    const { booking_id, spot_id } = unlockSchema.parse(req.body);
    if (!booking_id && !spot_id) throw Errors.badRequest("booking_id or spot_id required");

    const booking = booking_id
      ? await db.one("SELECT id, spot_id, driver_id, status FROM bookings WHERE id = $1", [booking_id])
      : await db.one(
          `SELECT id, spot_id, driver_id, status FROM bookings
           WHERE spot_id = $1 AND status = 'pending_lock' ORDER BY created_at DESC LIMIT 1`,
          [spot_id]
        );
    if (!booking) throw Errors.notFound("No matching booking");

    // Release all shadows for this spot + this driver's active pointer.
    await redis.del(REDIS_KEYS.spotLock(booking.spot_id));
    await redis.del(REDIS_KEYS.driverActiveLock(booking.driver_id));

    let newStatus = booking.status;
    if (booking.status === "pending_lock" || booking.status === "reserved") {
      const updated = await transition(booking.id, "cancelled");
      newStatus = updated.status;
    }
    await db.query("UPDATE parking_spots SET status = 'available' WHERE id = $1", [booking.spot_id]);
    broadcastSpotStatus(booking.spot_id, "available");

    return {
      success: true,
      data: {
        booking_id: booking.id,
        previous_status: booking.status,
        status: newStatus,
        spot_released: true,
      },
    };
  });

  /** Admin ledger overview. */
  app.get("/admin/ledger", { onRequest: adminOnly }, async () => {
    const { rows } = await db.query(
      `SELECT id, booking_id, provider_id, gross_amount, platform_fee, provider_earnings, status, created_at
       FROM settlement_ledger ORDER BY created_at DESC LIMIT 200`
    );
    return { success: true, data: rows };
  });
}