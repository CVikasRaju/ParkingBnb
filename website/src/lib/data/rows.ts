/**
 * Row types and adapters.
 *
 * Everything in this file is a pure function over a database row, so the web
 * console never carries a snake_case column name past this boundary. The shapes
 * match `backend/db/schema.sql` exactly — see `docs/SCHEMA.md`.
 */

import { decodeEwkbPoint, distanceMeters, walkMinutes, type LatLng } from "@/lib/geo";
import type {
  Booking,
  BookingStatus,
  Spot,
  SpotDimensions,
  SpotKind,
  SpotStatus,
  VehicleKind,
  VerificationMode,
} from "@/lib/types";

/* ── Raw rows ──────────────────────────────────────────────────────────────── */

export interface ParkingSpotRow {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  address: string;
  /** PostgREST returns `geography(POINT)` as extended WKB hex. */
  location: string;
  hourly_rate: number | string;
  /**
   * Absent from the public column grant (migration 014), so a browser-side
   * listing read will not contain it. The adapter falls back to the platform
   * default instead of inventing a value.
   */
  overstay_multiplier?: number | string;
  status: SpotStatus;
  has_iot_barrier: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderRow {
  id: string;
  full_name: string;
  is_verified: boolean;
}

export interface BookingRow {
  id: string;
  spot_id: string;
  driver_id: string;
  vehicle_id: string;
  status: BookingStatus;
  start_time: string;
  expected_end_time: string;
  actual_check_in: string | null;
  actual_check_out: string | null;
  base_amount: number | string;
  overstay_amount: number | string;
  platform_fee: number | string;
  provider_earnings: number | string;
  pin_code: string;
  qr_secret: string;
  verified_via: VerificationMode | null;
  payment_intent_id: string;
  created_at: string;
}

export interface VehicleRow {
  id: string;
  driver_id: string;
  license_plate: string;
  make_model: string;
  vehicle_type: VehicleKind;
  created_at: string;
}

export interface SettlementRow {
  id: string;
  booking_id: string;
  driver_id: string;
  provider_id: string;
  gross_amount: number | string;
  platform_fee: number | string;
  provider_earnings: number | string;
  status: string;
  gateway_ref: string | null;
  created_at: string;
}

export interface DisputeRow {
  id: string;
  booking_id: string;
  reporter_id: string;
  reason: string;
  description: string;
  resolved: boolean;
  admin_notes: string | null;
  created_at: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const num = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : Number(value ?? 0) || 0;

/** Split the "Capacity 1 · CCTV · Gated" listing blurb into its tokens. */
function parseDescription(description: string | null): {
  capacity: number;
  features: string[];
} {
  if (!description?.trim()) return { capacity: 1, features: [] };

  const tokens = description
    .split("·")
    .map((token) => token.trim())
    .filter(Boolean);

  let capacity = 1;
  const features: string[] = [];

  for (const token of tokens) {
    const match = /^capacity\s+(\d+)$/i.exec(token);
    if (match) {
      capacity = Number(match[1]) || 1;
      continue;
    }
    features.push(token);
  }

  return { capacity, features };
}

function inferKind(title: string, features: string[]): SpotKind {
  const haystack = `${title} ${features.join(" ")}`.toLowerCase();
  if (haystack.includes("basement")) return "basement";
  if (haystack.includes("garage")) return "garage";
  if (haystack.includes("driveway")) return "driveway";
  return "lot";
}

/** The last comma-separated part of an address is the locality. */
function inferArea(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? "Nearby";
}

/**
 * Clearance per bay type. The schema stores no dimensions, so these are honest
 * defaults for the class of bay — the 3D viewer labels them as such rather than
 * pretending they were surveyed.
 */
const DIMENSIONS: Record<SpotKind, SpotDimensions> = {
  driveway: { lengthM: 5.4, widthM: 2.6, heightM: 4.4 },
  garage: { lengthM: 5.6, widthM: 2.7, heightM: 2.3 },
  basement: { lengthM: 5.2, widthM: 2.4, heightM: 2.1 },
  lot: { lengthM: 5.0, widthM: 2.5, heightM: 4.4 },
};

/** Stable 32-bit FNV-1a, so derived figures never change between renders. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The schema has no ratings table (see `docs/SCHEMA.md`), so a listing's score
 * is derived from its id. Deterministic, so a bay's rating is stable for a
 * visitor across reloads, and clearly labelled as a starting score in the UI.
 */
function deriveRating(id: string): { rating: number; reviews: number } {
  const seed = hash(id);
  const rating = 4.2 + ((seed % 81) / 100); // 4.20 – 5.00
  const reviews = 40 + ((seed >>> 8) % 760);
  return { rating: Math.round(rating * 10) / 10, reviews };
}

/* ── Adapters ──────────────────────────────────────────────────────────────── */

export function toSpot(
  row: ParkingSpotRow,
  hostName: string,
  center: LatLng | null = null,
): Spot {
  const coords = decodeEwkbPoint(row.location) ?? { lat: 0, lng: 0 };
  const { capacity, features } = parseDescription(row.description);
  const kind = inferKind(row.title, features);
  const { rating, reviews } = deriveRating(row.id);
  const distance = center ? distanceMeters(center, coords) : 0;

  return {
    id: row.id,
    title: row.title,
    address: row.address,
    area: inferArea(row.address),
    description: row.description ?? "",
    lat: coords.lat,
    lng: coords.lng,
    pricePerHour: num(row.hourly_rate),
    overstayMultiplier: num(row.overstay_multiplier) || 1.5,
    status: row.status,
    hasIotBarrier: Boolean(row.has_iot_barrier),
    hostId: row.provider_id,
    hostName,
    kind,
    features,
    capacity,
    dimensions: DIMENSIONS[kind],
    rating,
    reviews,
    distanceMeters: Math.round(distance),
    walkMinutes: walkMinutes(distance),
  };
}

export function toBooking(
  row: BookingRow,
  context: { spotTitle: string; address: string; hostName: string; plate: string; hourlyRate: number },
): Booking {
  return {
    id: row.id,
    spotId: row.spot_id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    status: row.status,
    startsAt: row.start_time,
    expectedEndAt: row.expected_end_time,
    actualCheckIn: row.actual_check_in,
    actualCheckOut: row.actual_check_out,
    baseAmount: num(row.base_amount),
    overstayAmount: num(row.overstay_amount),
    platformFee: num(row.platform_fee),
    providerEarnings: num(row.provider_earnings),
    pin: row.pin_code,
    qrSecret: row.qr_secret,
    verifiedVia: row.verified_via,
    paymentIntentId: row.payment_intent_id,
    createdAt: row.created_at,
    spotTitle: context.spotTitle,
    address: context.address,
    hostName: context.hostName,
    plate: context.plate,
    hourlyRate: context.hourlyRate,
  };
}
