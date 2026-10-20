import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/guards";
import { Errors } from "../../lib/errors";
import { db } from "../../lib/db";
import { getBooking, transition } from "../bookings/service";
import { refundBooking } from "../payments/service";
import { TERMINAL_STATUSES } from "../../lib/fsm";

const reportSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.enum(["spot_blocked", "overstay_refusal", "damage", "other"]).default("spot_blocked"),
  description: z.string().min(3).max(2000),
  photo_evidence_url: z.string().url().optional(),
  photo_url: z.string().url().optional(),
});

const resolveSchema = z.object({
  action: z.enum(["refund", "refund_driver", "release", "reject", "dismiss"]).optional(),
  admin_notes: z.string().max(2000).optional(),
  resolved: z.boolean().optional(),
});

async function handleDisputeReport(req: any) {
  const body = reportSchema.parse(req.body);
  const photo = body.photo_evidence_url ?? body.photo_url ?? null;
  const booking = await getBooking(body.booking_id);
  if (booking.driver_id !== req.auth!.sub && req.auth!.role !== "admin") {
    throw Errors.forbidden("Not your booking");
  }

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
    `INSERT INTO disputes (booking_id, reporter_id, reason, description, photo_evidence_url, photo_url)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id, booking_id, reason, created_at`,
    [body.booking_id, req.auth!.sub, body.reason, body.description, photo]
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
}

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  /** Sprint 4 — "Report blocked spot" (Driver submits blocked spot report). */
  app.post("/disputes/report", { onRequest: [requireRole("driver")] }, handleDisputeReport);
  app.post("/disputes", { onRequest: [requireRole("driver")] }, handleDisputeReport);

  /** List disputes: admins see all; drivers/providers see disputes touching them. */
  app.get("/disputes", { onRequest: [requireAuth] }, async (req) => {
    if (req.auth!.role === "admin") {
      const { rows } = await db.query(
        `SELECT d.id, d.booking_id, d.reason, d.description,
                COALESCE(d.photo_evidence_url, d.photo_url) AS photo_evidence_url,
                COALESCE(d.photo_url, d.photo_evidence_url) AS photo_url,
                d.resolved, d.admin_notes, d.created_at,
                b.status AS booking_status, b.driver_id,
                ps.id AS spot_id, ps.title AS spot_title, ps.provider_id,
                u.full_name AS driver_name, u.email AS driver_email, u.phone_number AS driver_phone,
                host.full_name AS provider_name, host.email AS provider_email, host.phone_number AS provider_phone
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
         JOIN parking_spots ps ON ps.id = b.spot_id
         JOIN users u ON u.id = b.driver_id
         JOIN users host ON host.id = ps.provider_id
         ORDER BY d.resolved ASC, d.created_at DESC`
      );
      return { success: true, data: rows };
    }

    const { rows } = await db.query(
      `SELECT d.id, d.booking_id, d.reason, d.description,
              COALESCE(d.photo_evidence_url, d.photo_url) AS photo_evidence_url,
              COALESCE(d.photo_url, d.photo_evidence_url) AS photo_url,
              d.resolved, d.admin_notes, d.created_at, b.driver_id,
              ps.title AS spot_title
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       JOIN parking_spots ps ON ps.id = b.spot_id
       WHERE b.driver_id = $1 OR ps.provider_id = $1
       ORDER BY d.created_at DESC`,
      [req.auth!.sub]
    );
    return { success: true, data: rows };
  });

  /** Admin resolves a dispute (with refund or dismiss action). */
  app.patch("/disputes/:id/resolve", { onRequest: [requireRole("admin")] }, async (req) => {
    const { id } = req.params as { id: string };
    const { action, admin_notes } = resolveSchema.parse(req.body);

    const dispute = await db.one("SELECT booking_id FROM disputes WHERE id = $1", [id]);
    const booking = await db.one("SELECT status, id, spot_id FROM bookings WHERE id = $1", [dispute.booking_id]);

    if (action === "refund" || action === "refund_driver") {
      await refundBooking(booking.id);
      if (!TERMINAL_STATUSES.has(booking.status)) {
        await transition(booking.id, "cancelled");
      }
    } else if (action === "release" || action === "dismiss" || action === "reject") {
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
      [admin_notes ?? action ?? "resolved", id]
    );

    return {
      success: true,
      data: {
        dispute_id: id,
        action: action ?? "resolved",
        resolved: true,
      },
    };
  });
}
