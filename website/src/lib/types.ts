/**
 * The web platform's domain model.
 *
 * These types are deliberately shaped like the Postgres schema in
 * `backend/db/schema.sql` (and `docs/SCHEMA.md`): a `Spot` is a `parking_spots`
 * row, a `Booking` is a `bookings` row. `src/lib/data/db.ts` adapts raw rows
 * into these, so nothing downstream ever sees a database column name.
 */

export type Role = "driver" | "provider" | "admin";

/** `spot_status` enum. `locked` = a live 10-minute hold, painted amber. */
export type SpotStatus = "available" | "locked" | "maintenance" | "inactive";

/** `booking_status` enum, in lifecycle order. */
export type BookingStatus =
  | "pending_lock"
  | "reserved"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "overstayed"
  | "disputed";

/** `vehicle_type` enum. */
export type VehicleKind = "hatchback" | "sedan" | "suv" | "ev" | "motorcycle";

/** `verification_mode` enum — how arrival was proved. */
export type VerificationMode = "qr_code" | "pin" | "geofence" | "iot_gate";

/** Presentation-only classification, inferred from the listing text. */
export type SpotKind = "driveway" | "garage" | "basement" | "lot";

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  /** Display label shown in the vehicle switcher, e.g. "KA-19-MG-2026 SUV". */
  label: string;
  plate: string;
  /** Physical envelope, compared against a bay's clearances in the 3D viewer. */
  lengthM: number;
  widthM: number;
  heightM: number;
}

export interface SpotDimensions {
  lengthM: number;
  widthM: number;
  heightM: number;
}

export interface Spot {
  id: string;
  title: string;
  address: string;
  /** Neighbourhood, parsed off the address for grouping and quick filters. */
  area: string;
  description: string;
  lat: number;
  lng: number;
  pricePerHour: number;
  overstayMultiplier: number;
  status: SpotStatus;
  hasIotBarrier: boolean;
  hostId: string;
  hostName: string;
  kind: SpotKind;
  features: string[];
  capacity: number;
  dimensions: SpotDimensions;
  /** Derived deterministically — the schema has no ratings table. */
  rating: number;
  reviews: number;
  distanceMeters: number;
  walkMinutes: number;
}

export interface Booking {
  id: string;
  spotId: string;
  driverId: string;
  vehicleId: string;
  status: BookingStatus;
  startsAt: string;
  expectedEndAt: string;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  baseAmount: number;
  overstayAmount: number;
  platformFee: number;
  providerEarnings: number;
  pin: string;
  qrSecret: string;
  verifiedVia: VerificationMode | null;
  paymentIntentId: string;
  createdAt: string;
  /* ── Denormalised for display, joined at load time ─────────────────────── */
  spotTitle: string;
  address: string;
  hostName: string;
  plate: string;
  hourlyRate: number;
}

export type LedgerKind = "earning" | "payout" | "refund" | "commission";

export interface LedgerEntry {
  id: string;
  label: string;
  detail: string;
  amount: number;
  kind: LedgerKind;
  at: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  spotTitle: string;
  reason: string;
  description: string;
  raisedBy: string;
  reporterId: string;
  resolved: boolean;
  at: string;
}

/** Where a dataset came from, surfaced in the UI so nothing is ambiguous. */
export type DataSource = "supabase" | "seed";

export interface SpotFeed {
  spots: Spot[];
  source: DataSource;
  /** Set when a Supabase read failed and the seed was substituted. */
  note: string | null;
}

/* ── Platform invariants ─────────────────────────────────────────────────────
   Values mirror `backend/.env.example` so the web console and the API agree.
   -------------------------------------------------------------------------- */

export const PLATFORM = {
  /** `BOOKING_LOCK_TTL_SECONDS` — the atomic hold that stops double-booking. */
  lockTtlSeconds: 600,
  /** `CHECKIN_GEOFENCE_METERS` — arrival radius for check-in. */
  geofenceMeters: 50,
  /** `PLATFORM_COMMISSION_RATE` — the house cut of every session. */
  commissionRate: 0.15,
  /** `OVERSTAY_GRACE_MINUTES` — free minutes past the end time. */
  overstayGraceMinutes: 15,
  /**
   * Visual cadence of the rotating pass. The API mints a QR token with a
   * 60-second TTL (`QR_TOKEN_TTL_SECONDS`); the web console spins it faster so
   * the ring reads as "live" without ever being the thing that authorises.
   */
  qrRefreshSeconds: 30,
  currency: "INR",
} as const;

export const LOCK_TTL_MS = PLATFORM.lockTtlSeconds * 1000;
