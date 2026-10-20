/**
 * Phase-4 money math — the exact formulas from docs/ARCHITECTURE.md §5
 * and decentralized EV charging metering.
 *
 * Formula:
 *   Total Gross = Base Parking + Overstay Penalty + (kWh x Rate/kWh)
 *   Platform Commission (15%) = Total Gross x 0.15
 *   Provider Disbursement (85%) = Total Gross - Platform Commission
 *
 * Computed server-side only, never trusted from the client.
 */
import { env } from "../config/env";

export interface MoneyBreakdown {
  base_amount: number;
  overstay_amount: number;
  energy_kwh: number;
  energy_rate_per_kwh: number;
  energy_amount: number;
  gross_amount: number;
  platform_fee: number;
  provider_earnings: number;
}

export interface CheckoutComputeInput {
  base_amount: number;
  hourly_rate: number;
  overstay_multiplier: number;
  /** minutes actually parked (or expected, for previews) */
  parked_minutes: number;
  /** minutes booked: start -> expected_end */
  booked_minutes: number;
  /** energy consumed in kWh (P2P EV / commercial charging) */
  energy_kwh?: number;
  /** electricity tariff charged per kWh by host */
  energy_rate_per_kwh?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Overstay formula (ARCHITECTURE §5):
 *   T_overstay = max(0, T_actual_checkout - T_expected_end)
 *   if T_overstay > 15 min:
 *     Penalty = ceil(T_overstay / 60) x (Hourly Rate x Overstay Multiplier)
 * Returns 0 within grace or when ending early/on time.
 */
export function computeOverstayFee(
  overstayMinutes: number,
  hourlyRate: number,
  overstayMultiplier: number
): number {
  if (overstayMinutes <= env.OVERSTAY_GRACE_MINUTES) return 0;
  return round2(Math.ceil(overstayMinutes / 60) * (hourlyRate * overstayMultiplier));
}

/**
 * Metered EV charging fee formula:
 *   Energy Fee = kWh x Rate/kWh
 */
export function computeEnergyFee(kwh: number, ratePerKwh: number): number {
  if (kwh <= 0 || ratePerKwh <= 0) return 0;
  return round2(kwh * ratePerKwh);
}

/** Full escrow breakdown matching the API_SPEC checkout response and EV charging specs. */
export function computeCheckoutBreakdown(i: CheckoutComputeInput): MoneyBreakdown {
  const overstayMinutes = Math.max(0, i.parked_minutes - i.booked_minutes);
  const overstayAmount = computeOverstayFee(
    overstayMinutes,
    i.hourly_rate,
    i.overstay_multiplier
  );
  const energyKwh = i.energy_kwh ?? 0;
  const energyRate = i.energy_rate_per_kwh ?? 0;
  const energyAmount = computeEnergyFee(energyKwh, energyRate);

  const gross = round2(i.base_amount + overstayAmount + energyAmount);
  const platformFee = round2(gross * env.PLATFORM_COMMISSION_RATE);
  const providerEarnings = round2(gross - platformFee);

  return {
    base_amount: round2(i.base_amount),
    overstay_amount: overstayAmount,
    energy_kwh: energyKwh,
    energy_rate_per_kwh: energyRate,
    energy_amount: energyAmount,
    gross_amount: gross,
    platform_fee: platformFee,
    provider_earnings: providerEarnings,
  };
}

/** Base booking amount for duration_hours at hourly_rate. */
export function computeBaseAmount(hourlyRate: number, durationHours: number): number {
  return round2(hourlyRate * durationHours);
}
