/**
 * Money math — a line-for-line mirror of `backend/src/lib/money.ts`, which is
 * the project's single source of truth (`docs/ARCHITECTURE.md` §5).
 *
 * It is duplicated here for one reason: the web console previews a receipt
 * before the API is involved. Whenever a booking is actually written, the
 * server recomputes and stores these numbers — the client figure is never
 * trusted. If the formulas ever diverge, the backend wins.
 */

import { PLATFORM } from "@/lib/types";

export interface MoneyBreakdown {
  baseAmount: number;
  overstayAmount: number;
  grossAmount: number;
  platformFee: number;
  providerEarnings: number;
}

export interface CheckoutInput {
  baseAmount: number;
  hourlyRate: number;
  overstayMultiplier: number;
  /** Minutes actually parked (or expected, when previewing). */
  parkedMinutes: number;
  /** Minutes booked: start → expected end. */
  bookedMinutes: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Base booking amount for a duration at an hourly rate. */
export function computeBaseAmount(hourlyRate: number, durationHours: number): number {
  return round2(hourlyRate * durationHours);
}

/**
 * Overstay formula (ARCHITECTURE §5):
 *
 *   T_overstay = max(0, actual_checkout - expected_end)
 *   if T_overstay > grace:
 *     Penalty = ceil(T_overstay / 60) × (Hourly Rate × Overstay Multiplier)
 *
 * Zero inside the grace window, and zero when leaving early or on time.
 */
export function computeOverstayFee(
  overstayMinutes: number,
  hourlyRate: number,
  overstayMultiplier: number,
): number {
  if (overstayMinutes <= PLATFORM.overstayGraceMinutes) return 0;
  return round2(Math.ceil(overstayMinutes / 60) * (hourlyRate * overstayMultiplier));
}

/** Full escrow breakdown: base + penalty, then the 15/85 split. */
export function computeCheckoutBreakdown(input: CheckoutInput): MoneyBreakdown {
  const overstayMinutes = Math.max(0, input.parkedMinutes - input.bookedMinutes);
  const overstayAmount = computeOverstayFee(
    overstayMinutes,
    input.hourlyRate,
    input.overstayMultiplier,
  );
  const grossAmount = round2(input.baseAmount + overstayAmount);
  const platformFee = round2(grossAmount * PLATFORM.commissionRate);
  const providerEarnings = round2(grossAmount - platformFee);

  return {
    baseAmount: round2(input.baseAmount),
    overstayAmount,
    grossAmount,
    platformFee,
    providerEarnings,
  };
}

/** Minutes between two instants, floored at zero. */
export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
}
