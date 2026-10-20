import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guards";
import { Errors } from "../../lib/errors";
import { db } from "../../lib/db";
import { redis, REDIS_KEYS, releaseLock } from "../../lib/redis";
import { transition } from "../bookings/service";
import { broadcastSpotStatus } from "../../lib/realtime";
import { TERMINAL_STATUSES } from "../../lib/fsm";

const adminOnly = [requireRole("admin")];

const resolveSchema = z.object({
  action: z.enum(["refund", "refund_driver", "release", "reject", "dismiss"]),
  admin_notes: z.string().max(2000).optional(),
});

const unlockSchema = z.object({
  booking_id: z.string().uuid().optional(),
  spot_id: z.string().uuid().optional(),
});

/**
 * Sprint 4 admin surface:
 *  - dispute inbox (spot_blocked / overstay_refusal / damage)
 *  - dispute resolution (refund / release / reject)
 *  - Redis lock inspector and emergency eviction
 *  - platform analytics & revenue overview
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /** Dispute inbox. */
  app.get("/admin/disputes", { onRequest: adminOnly }, async () => {
    const { rows } = await db.query(
      `SELECT d.id, d.booking_id, d.reason, d.description,
              COALESCE(d.photo_evidence_url, d.photo_url) AS photo_evidence_url,
              COALESCE(d.photo_url, d.photo_evidence_url) AS photo_url,
              d.resolved, d.admin_notes, d.created_at,
              b.status AS booking_status, b.driver_id,
              ps.title AS spot_title, ps.provider_id,
              u.full_name AS driver_name, u.email AS driver_email,
              host.full_name AS provider_name, host.email AS provider_email
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       JOIN parking_spots ps ON ps.id = b.spot_id
       JOIN users u ON u.id = b.driver_id
       JOIN users host ON host.id = ps.provider_id
       ORDER BY d.resolved ASC, d.created_at DESC`
    );
    return { success: true, data: rows };
  });

  /** Resolve dispute via /admin/disputes/:id. */
  app.patch("/admin/disputes/:id", { onRequest: adminOnly }, async (req) => {
    const { id } = req.params as { id: string };
    const { action, admin_notes } = resolveSchema.parse(req.body);
    const dispute = await db.one("SELECT booking_id FROM disputes WHERE id = $1", [id]);
    const booking = await db.one("SELECT status, id, spot_id FROM bookings WHERE id = $1", [dispute.booking_id]);

    if (action === "refund" || action === "refund_driver") {
      const { refundBooking } = await import("../payments/service");
      await refundBooking(booking.id);
      if (!TERMINAL_STATUSES.has(booking.status)) {
        await transition(booking.id, "cancelled");
      }
    } else if (action === "release" || action === "reject" || action === "dismiss") {
      if (!TERMINAL_STATUSES.has(booking.status)) {
        await transition(booking.id, "cancelled");
      }
      await db.query(
        "UPDATE parking_spots SET status = 'available' WHERE id = $1",
        [booking.spot_id]
      );
    }

    await db.query(
      "UPDATE disputes SET resolved = TRUE, admin_notes = $1 WHERE id = $2",
      [admin_notes ?? action, id]
    );
    return { success: true, data: { dispute_id: id, action, resolved: true } };
  });

  /**
   * Redis Concurrency Inspector: scan all active keys matching lock:spot:*
   */
  app.get("/admin/locks", { onRequest: adminOnly }, async () => {
    let keys: string[] = [];
    try {
      keys = await redis.keys("lock:spot:*");
    } catch {
      keys = [];
    }

    const locks = [];
    for (const key of keys) {
      const spotId = key.replace("lock:spot:", "");
      const ttl = await redis.ttl(key);
      const valStr = await redis.get(key);
      let payload: { booking_id?: string; driver_id?: string } = {};
      if (valStr) {
        try {
          payload = JSON.parse(valStr);
        } catch {
          payload = { booking_id: valStr };
        }
      }

      // Fetch spot & driver details if available
      const spot = await db.maybeOne("SELECT title, address, hourly_rate FROM parking_spots WHERE id = $1", [spotId]);
      const driver = payload.driver_id
        ? await db.maybeOne("SELECT full_name, email FROM users WHERE id = $1", [payload.driver_id])
        : null;

      locks.push({
        key,
        spot_id: spotId,
        spot_title: spot?.title ?? "Unknown Spot",
        address: spot?.address ?? "N/A",
        booking_id: payload.booking_id ?? null,
        driver_id: payload.driver_id ?? null,
        driver_name: driver?.full_name ?? "Unknown Driver",
        driver_email: driver?.email ?? "N/A",
        ttl_seconds: ttl,
      });
    }

    return { success: true, data: locks };
  });

  /**
   * Force release an active lock by spot ID.
   */
  app.delete("/admin/locks/:spotId", { onRequest: adminOnly }, async (req) => {
    const { spotId } = req.params as { spotId: string };
    const key = REDIS_KEYS.spotLock(spotId);
    const valStr = await redis.get(key);
    let driverId: string | undefined;

    if (valStr) {
      try {
        const parsed = JSON.parse(valStr);
        driverId = parsed.driver_id;
      } catch {
        // ignore
      }
    }

    await releaseLock(spotId, driverId);

    // Cancel pending lock booking if one is tied to this spot
    const pendingBooking = await db.maybeOne(
      "SELECT id FROM bookings WHERE spot_id = $1 AND status = 'pending_lock' ORDER BY created_at DESC LIMIT 1",
      [spotId]
    );
    if (pendingBooking) {
      try {
        await transition(pendingBooking.id, "cancelled");
      } catch {
        // ignore
      }
    }

    await db.query("UPDATE parking_spots SET status = 'available' WHERE id = $1", [spotId]);
    broadcastSpotStatus(spotId, "available");

    return {
      success: true,
      data: {
        spot_id: spotId,
        released: true,
      },
    };
  });

  /**
   * Emergency unlock — legacy endpoint keeping full backward compatibility.
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

  /** Platform Analytics & Revenue */
  app.get("/admin/analytics", { onRequest: adminOnly }, async () => {
    const bookingStats = await db.one(`
      SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_sessions,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_bookings,
        COALESCE(SUM(base_amount + overstay_amount + COALESCE(energy_amount, 0)), 0)::numeric AS gmv,
        COALESCE(SUM(platform_fee), 0)::numeric AS platform_revenue,
        COALESCE(SUM(provider_earnings), 0)::numeric AS provider_payouts,
        COALESCE(SUM(energy_kwh), 0)::numeric AS total_energy_kwh
      FROM bookings
    `);

    const spotStats = await db.one(`
      SELECT
        COUNT(*)::int AS total_spots,
        COUNT(*) FILTER (WHERE status = 'available')::int AS available_spots,
        COUNT(*) FILTER (WHERE category = 'ev_p2p_charge' OR category = 'commercial_cpo')::int AS ev_spots
      FROM parking_spots
    `);

    const disputeStats = await db.one(`
      SELECT
        COUNT(*)::int AS total_disputes,
        COUNT(*) FILTER (WHERE resolved = FALSE)::int AS active_disputes
      FROM disputes
    `);

    return {
      success: true,
      data: {
        total_bookings: bookingStats.total_bookings,
        active_sessions: bookingStats.active_sessions,
        completed_bookings: bookingStats.completed_bookings,
        gmv: Number(bookingStats.gmv),
        platform_revenue: Number(bookingStats.platform_revenue),
        provider_payouts: Number(bookingStats.provider_payouts),
        total_energy_kwh: Number(bookingStats.total_energy_kwh),
        total_spots: spotStats.total_spots,
        available_spots: spotStats.available_spots,
        ev_spots: spotStats.ev_spots,
        total_disputes: disputeStats.total_disputes,
        active_disputes: disputeStats.active_disputes,
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
