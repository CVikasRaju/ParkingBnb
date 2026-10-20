/**
 * Booking finite state machine — a mirror of `backend/src/lib/fsm.ts`.
 *
 * The web console drives the same lifecycle as the mobile app, so it validates
 * against the same table. The server action in `src/lib/actions/bookings.ts`
 * refuses any edge the API would refuse with a 409, which keeps the two front
 * ends consistent even though the browser never talks to the Fastify API
 * directly.
 */

import type { BookingStatus } from "@/lib/types";

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending_lock",
  "reserved",
  "checked_in",
  "completed",
  "cancelled",
  "overstayed",
  "disputed",
];

/** Once a booking is terminal the bay may be re-locked by someone else. */
export const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "completed",
  "cancelled",
  "overstayed",
  "disputed",
]);

/**
 * Allowed edges.
 *  pending_lock → reserved    payment authorised
 *  pending_lock → cancelled   driver bailed before paying / hold expired
 *  reserved     → checked_in  QR · PIN · geofence · IoT gate
 *  reserved     → cancelled   driver cancelled before arriving
 *  checked_in   → completed   checkout, escrow settled
 *  checked_in   → overstayed  the overstay worker flagged the session
 *  overstayed   → completed   late checkout, penalty applied
 *  *            → disputed    admin opened a case
 */
export const FSM_EDGES: Record<BookingStatus, readonly BookingStatus[]> = {
  pending_lock: ["reserved", "cancelled", "disputed"],
  reserved: ["checked_in", "cancelled", "disputed"],
  checked_in: ["completed", "overstayed", "disputed"],
  completed: ["disputed"],
  cancelled: ["disputed", "completed"],
  overstayed: ["completed", "disputed"],
  disputed: ["completed"],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return FSM_EDGES[from].includes(to);
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Throws when `from → to` is not a legal edge; callers surface the message. */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal booking transition: ${from} → ${to}. Allowed: ${FSM_EDGES[from].join(", ") || "none"}`,
    );
  }
}
