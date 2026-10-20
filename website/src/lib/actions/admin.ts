"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionResult } from "@/lib/actions/bookings";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/fsm";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { BookingStatus, VerificationMode } from "@/lib/types";

/**
 * Host and operator actions.
 *
 * Both run on the service-role client, both resolve the session first, and both
 * refuse unless the caller is the host of the bay in question or an admin. That
 * check is the entire security boundary for these two operations — there is no
 * RLS underneath to catch a mistake.
 */

async function requireActor(): Promise<
  { ok: true; user: SessionUser; db: SupabaseClient } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const db = createSupabaseAdminClient();
  if (!db) {
    return {
      ok: false,
      error: "This needs SUPABASE_SERVICE_ROLE_KEY in website/.env.local.",
    };
  }

  return { ok: true, user, db };
}

export interface HostVerifyInput {
  /** Either a 4-digit PIN from the driver's pass… */
  pin?: string;
  /** …or the payload decoded off their QR code. */
  qrPayload?: string;
  bookingId?: string;
}

/** Pull the booking id and secret out of `parkpeer://checkin?b=…&k=…`. */
function parseQrPayload(payload: string): { bookingId: string; secret: string } | null {
  try {
    const query = payload.includes("?") ? payload.slice(payload.indexOf("?") + 1) : payload;
    const params = new URLSearchParams(query);
    const bookingId = params.get("b");
    const secret = params.get("k");
    if (!bookingId || !secret) return null;
    return { bookingId, secret };
  } catch {
    return null;
  }
}

/**
 * A host verifying a driver's arrival.
 *
 * Deliberately separate from the driver's own `checkIn`: this path is reached
 * from the host console, so it authorises the *host* of the bay rather than the
 * driver on the booking. Matching is done against `pin_code` / `qr_secret`,
 * exactly as the API's verifier does.
 */
export async function hostVerifyArrival(
  input: HostVerifyInput,
): Promise<ActionResult<{ bookingId: string; spotId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor;

  let bookingId = input.bookingId ?? null;
  let secret: string | null = null;

  if (input.qrPayload) {
    const parsed = parseQrPayload(input.qrPayload);
    if (!parsed) return { ok: false, error: "That doesn't look like a ParkPeer pass." };
    bookingId = parsed.bookingId;
    secret = parsed.secret;
  }

  if (!bookingId) {
    // A PIN alone is enough to find the row — PINs are only 4 digits, so the
    // lookup also checks the bay belongs to this host before accepting one.
    const supplied = (input.pin ?? "").trim();
    if (supplied.length !== 4) {
      return { ok: false, error: "Enter the driver's 4-digit PIN, or scan their pass." };
    }
    const { data } = await db
      .from("bookings")
      .select("id, spot_id, status")
      .eq("pin_code", supplied)
      .in("status", ["reserved", "pending_lock"])
      .order("created_at", { ascending: false })
      .limit(10);

    const candidates = (data ?? []) as Array<{ id: string; spot_id: string }>;
    for (const candidate of candidates) {
      const { data: spot } = await db
        .from("parking_spots")
        .select("provider_id")
        .eq("id", candidate.spot_id)
        .maybeSingle();
      if ((spot as { provider_id?: string } | null)?.provider_id === user.id || user.role === "admin") {
        bookingId = candidate.id;
        break;
      }
    }

    if (!bookingId) {
      return { ok: false, error: "No booking of yours matches that PIN." };
    }
  }

  const { data: bookingRow } = await db
    .from("bookings")
    .select("id, spot_id, status, pin_code, qr_secret")
    .eq("id", bookingId)
    .maybeSingle();

  if (!bookingRow) return { ok: false, error: "Booking not found." };
  const booking = bookingRow as {
    id: string;
    spot_id: string;
    status: BookingStatus;
    pin_code: string;
    qr_secret: string;
  };

  const { data: spotRow } = await db
    .from("parking_spots")
    .select("provider_id")
    .eq("id", booking.spot_id)
    .maybeSingle();

  const hostId = (spotRow as { provider_id?: string } | null)?.provider_id;
  if (hostId !== user.id && user.role !== "admin") {
    return { ok: false, error: "That booking is not on one of your bays." };
  }

  const pinOk = input.pin ? input.pin.trim() === booking.pin_code : false;
  const qrOk = secret ? booking.qr_secret.startsWith(secret) || secret === booking.qr_secret : false;
  if (!pinOk && !qrOk) {
    return { ok: false, error: "That PIN or pass doesn't match this booking." };
  }

  try {
    assertTransition(booking.status, "checked_in");
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  const verifiedVia: VerificationMode = pinOk ? "pin" : "qr_code";

  const { error } = await db
    .from("bookings")
    .update({
      status: "checked_in" satisfies BookingStatus,
      actual_check_in: new Date().toISOString(),
      verified_via: verifiedVia,
    })
    .eq("id", bookingId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/provider");
  revalidatePath("/explore");
  return { ok: true, data: { bookingId, spotId: booking.spot_id } };
}

export type DisputeAction = "refund" | "maintenance" | "dismiss";

/**
 * Resolve a dispute.
 *
 * `refund` writes a `refund_ledger` row and releases the booking; `maintenance`
 * pulls the bay off the map (`spot_status = 'maintenance'`), which is exactly
 * what the Fastify dispute route does; `dismiss` just closes the case.
 */
export async function resolveDispute(input: {
  disputeId: string;
  action: DisputeAction;
  notes?: string;
}): Promise<ActionResult<{ disputeId: string }>> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { user, db } = actor;

  if (user.role !== "admin") {
    return { ok: false, error: "Only an operator can resolve a dispute." };
  }

  const { data: disputeRow } = await db
    .from("disputes")
    .select("id, booking_id, reporter_id")
    .eq("id", input.disputeId)
    .maybeSingle();

  if (!disputeRow) return { ok: false, error: "Dispute not found." };
  const dispute = disputeRow as { id: string; booking_id: string; reporter_id: string };

  const { data: bookingRow } = await db
    .from("bookings")
    .select("id, spot_id, driver_id, base_amount, overstay_amount")
    .eq("id", dispute.booking_id)
    .maybeSingle();

  const booking = bookingRow as
    | { id: string; spot_id: string; driver_id: string; base_amount: number; overstay_amount: number }
    | null;

  await db
    .from("disputes")
    .update({ resolved: true, admin_notes: input.notes?.trim() || `Resolved: ${input.action}` })
    .eq("id", input.disputeId);

  if (booking) {
    if (input.action === "refund") {
      await db.from("refund_ledger").insert({
        booking_id: booking.id,
        driver_id: booking.driver_id,
        amount: Number(booking.base_amount) + Number(booking.overstay_amount),
      });
      await db
        .from("bookings")
        .update({ status: "cancelled" satisfies BookingStatus })
        .eq("id", booking.id);
      await db
        .from("parking_spots")
        .update({ status: "available" })
        .eq("id", booking.spot_id)
        .eq("has_iot_barrier", false);
    }

    if (input.action === "maintenance") {
      await db
        .from("parking_spots")
        .update({ status: "maintenance" })
        .eq("id", booking.spot_id)
        .eq("has_iot_barrier", false);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/explore");
  return { ok: true, data: { disputeId: input.disputeId } };
}
