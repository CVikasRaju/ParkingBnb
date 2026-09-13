/**
 * Booking finite state machine — the single source of truth for every
 * allowed transition. Mirrors docs/ARCHITECTURE.md §2; any transition not
 * listed here is rejected with 409.
 */

export const BOOKING_STATUSES = [
  "pending_lock",
  "reserved",
  "checked_in",
  "completed",
  "cancelled",
  "overstayed",
  "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Terminal statuses after which a spot can be re-locked. */
export const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "completed",
  "cancelled",
  "overstayed",
  "disputed",
]);

/**
 * Allowed FSM edges.
 *  pending_lock -> reserved    : payment webhook / confirm-payment
 *  pending_lock -> cancelled   : driver cancels before payment
 *  reserved     -> checked_in  : QR / PIN / geofence / IoT verification
 *  reserved     -> cancelled   : driver cancels before check-in
 *  checked_in   -> completed   : driver check-out (escrow settlement)
 *  checked_in   -> overstayed  : background worker flags overstay session
 *  overstayed   -> completed   : driver finally checks out (escrow settlement)
 *  *            -> disputed    : admin raises a dispute on any non-terminal
 *  cancelled/disputed -> completed : admin resolution (refund/escrow)
 */
export const FSM_EDGES: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  pending_lock: new Set(["reserved", "cancelled", "disputed"]),
  reserved: new Set(["checked_in", "cancelled", "disputed"]),
  checked_in: new Set(["completed", "overstayed", "disputed"]),
  completed: new Set(["disputed"]),
  cancelled: new Set(["disputed", "completed"]),
  overstayed: new Set(["completed", "disputed"]),
  disputed: new Set(["completed"]),
};

/** Throws a 409 if `from -> to` is not a legal edge. */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!FSM_EDGES[from].has(to)) {
    throw Object.assign(
      new Error(
        `Illegal booking transition: ${from} -> ${to}. Allowed: ${[...FSM_EDGES[from]].join(", ")}`
      ),
      { statusCode: 409, code: "ILLEGAL_TRANSITION" }
    );
  }
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}