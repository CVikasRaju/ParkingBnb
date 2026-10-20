/**
 * Seed catalogue.
 *
 * These are **the same eight bays the Supabase project already holds** — same
 * UUIDs, addresses, coordinates, rates and host names — expressed through the
 * same `toSpot` adapter that live rows go through. Two consequences worth
 * knowing:
 *
 *  1. With no credentials the console is a faithful preview of production, not
 *     a different-looking demo.
 *  2. A booking made in seed mode references ids that also exist in Supabase, so
 *     nothing has to be renumbered when credentials appear.
 *
 * Live rows always win; this is only the fallback in `src/lib/data/spots.ts`.
 */

import {
  toBooking,
  toSpot,
  type BookingRow,
  type ParkingSpotRow,
} from "@/lib/data/rows";
import { encodeEwkbPoint } from "@/lib/geo";
import type { Booking, Dispute, LedgerEntry, Spot, Vehicle } from "@/lib/types";

export const SEED_DRIVER_ID = "a1c1f0d2-0000-4000-8000-000000000001";

const HOSTS: Record<string, string> = {
  "5bfb4400-7dde-4b72-9588-412fd99d6f7c": "Priya R.",
  "087fedd8-4ff0-4b8f-926b-ce26eacf767b": "Cyber Towers Facility",
  "8fd601f3-10a7-4e0b-97b7-24d45f9f5682": "Ishaan M.",
  "4c4ee0cf-fc45-4323-9799-74b8a0c1e04d": "FinTech Plaza",
  "76c65578-9fe3-480c-a61f-7f7110036387": "Sridhar K.",
  "1b2ed10c-2cea-4c40-b66b-aac0d3f397d0": "My Home Constructions",
  "95ef9125-ddc2-42dc-93ce-52bebff7bfb6": "SkyPark Logistics",
  "7c59434e-0cab-42f9-9220-6f99a3450186": "Ravi T.",
};

/**
 * The `parking_spots` rows, with `location` encoded from the real coordinates.
 *
 * The hex is produced by `encodeEwkbPoint` rather than typed by hand: these are
 * the exact WGS-84 points the live rows hold, and building them from `lat`/`lng`
 * is the only way to be sure a bay is not quietly misplaced by a bad nibble.
 */
const SEED_ROWS: ParkingSpotRow[] = [
  {
    id: "6cf0ac0b-0cc1-480b-846a-067d636a463c",
    provider_id: "5bfb4400-7dde-4b72-9588-412fd99d6f7c",
    title: "Gated driveway · Jubilee Hills",
    address: "Road No. 36, Jubilee Hills",
    description: "Capacity 1 · CCTV · Gated · Well lit · Paved",
    location: encodeEwkbPoint(17.4325, 78.4073),
    hourly_rate: 60,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "157d960a-db87-4a37-a838-567147c559d1",
    provider_id: "087fedd8-4ff0-4b8f-926b-ce26eacf767b",
    title: "Basement bay · Hitec City",
    address: "Cyber Towers, Madhapur",
    description: "Capacity 12 · Covered · CCTV · EV charger · 24×7",
    location: encodeEwkbPoint(17.4504, 78.3808),
    hourly_rate: 45,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "307d5a5a-8081-4dbb-8426-b15fd70ac808",
    provider_id: "8fd601f3-10a7-4e0b-97b7-24d45f9f5682",
    title: "Private garage · Banjara Hills",
    address: "Road No. 12, Banjara Hills",
    description: "Capacity 1 · Covered · Locked · CCTV",
    location: encodeEwkbPoint(17.4126, 78.4392),
    hourly_rate: 90,
    overstay_multiplier: 1.5,
    status: "maintenance",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "196fe548-41bf-4f78-bb54-4d231e73cb48",
    provider_id: "4c4ee0cf-fc45-4323-9799-74b8a0c1e04d",
    title: "Commercial bay · Gachibowli",
    address: "Financial District, Gachibowli",
    description: "Capacity 40 · Covered · Valet · EV charger · CCTV · 24×7",
    location: encodeEwkbPoint(17.4401, 78.3489),
    hourly_rate: 55,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "b5644f73-1ad9-412b-b437-477bb5e2e36a",
    provider_id: "76c65578-9fe3-480c-a61f-7f7110036387",
    title: "Shaded driveway · Madhapur",
    address: "Ayyappa Society, Madhapur",
    description: "Capacity 2 · Shaded · Gated",
    location: encodeEwkbPoint(17.4487, 78.3915),
    hourly_rate: 40,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "7e338a24-f948-4d1e-b597-74a5039590e6",
    provider_id: "1b2ed10c-2cea-4c40-b66b-aac0d3f397d0",
    title: "Tower basement · Kondapur",
    address: "Botanical Garden Rd, Kondapur",
    description: "Capacity 24 · Covered · CCTV · Lift access",
    location: encodeEwkbPoint(17.4632, 78.3617),
    hourly_rate: 35,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "37226f8e-10ea-4d1c-a155-6305d198696e",
    provider_id: "95ef9125-ddc2-42dc-93ce-52bebff7bfb6",
    title: "Airport long-stay · Shamshabad",
    address: "RGIA Approach Rd, Shamshabad",
    description: "Capacity 300 · Shuttle · CCTV · 24×7 · Insured",
    location: encodeEwkbPoint(17.2403, 78.4294),
    hourly_rate: 25,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
  {
    id: "8815e504-7073-463a-aa2c-0e51e541fb9c",
    provider_id: "7c59434e-0cab-42f9-9220-6f99a3450186",
    title: "Corner garage · Begumpet",
    address: "Prakash Nagar, Begumpet",
    description: "Capacity 2 · Gated · CCTV",
    location: encodeEwkbPoint(17.4435, 78.4713),
    hourly_rate: 50,
    overstay_multiplier: 1.5,
    status: "available",
    has_iot_barrier: false,
    created_at: "2026-10-15T15:17:57.684530+00:00",
    updated_at: "2026-10-15T15:17:57.684530+00:00",
  },
];

/**
 * The catalogue. Built through the same adapter the live rows use, so a bay's
 * features, capacity, clearances and rating read identically in both modes.
 */
export const SEED_SPOTS: Spot[] = SEED_ROWS.map((row) =>
  toSpot(row, HOSTS[row.provider_id] ?? "Verified host"),
);

/** The viewer's own garage. Vehicle envelopes drive the 3D fit check. */
export const SEED_VEHICLES: Vehicle[] = [
  {
    id: "veh_hatch",
    kind: "hatchback",
    label: "Hatchback",
    plate: "KA-19-MG-2026",
    lengthM: 3.99,
    widthM: 1.74,
    heightM: 1.5,
  },
  {
    id: "veh_sedan",
    kind: "sedan",
    label: "Sedan",
    plate: "KA-19-MG-2026",
    lengthM: 4.72,
    widthM: 1.82,
    heightM: 1.45,
  },
  {
    id: "veh_suv",
    kind: "suv",
    label: "SUV",
    plate: "KA-19-MG-2026",
    lengthM: 4.86,
    widthM: 1.93,
    heightM: 1.78,
  },
  {
    id: "veh_ev",
    kind: "ev",
    label: "EV",
    plate: "KA-19-MG-2026",
    lengthM: 4.75,
    widthM: 1.89,
    heightM: 1.62,
  },
  {
    id: "veh_bike",
    kind: "motorcycle",
    label: "Motorcycle",
    plate: "KA-19-MG-2026",
    lengthM: 2.1,
    widthM: 0.8,
    heightM: 1.15,
  },
];

function minutesFromNow(offset: number): string {
  return new Date(Date.now() + offset * 60_000).toISOString();
}

function seedBooking(
  index: number,
  overrides: Partial<BookingRow> & { status: BookingRow["status"] },
): BookingRow {
  const startsAt = minutesFromNow(overrides.status === "completed" ? -200 : -95);
  return {
    id: `bk_seed_${index}`,
    spot_id: SEED_SPOTS[0].id,
    driver_id: SEED_DRIVER_ID,
    vehicle_id: "veh_suv",
    start_time: startsAt,
    expected_end_time: minutesFromNow(85),
    actual_check_in: null,
    actual_check_out: null,
    base_amount: 180,
    overstay_amount: 0,
    platform_fee: 27,
    provider_earnings: 153,
    pin_code: "4821",
    qr_secret: "seed-qr-secret",
    verified_via: null,
    payment_intent_id: "pi_seed_mock",
    created_at: startsAt,
    ...overrides,
  };
}

const SEED_BOOKING_ROWS: BookingRow[] = [
  seedBooking(1, {
    spot_id: SEED_SPOTS[5].id,
    status: "checked_in",
    actual_check_in: minutesFromNow(-85),
    verified_via: "qr_code",
    base_amount: 105,
    platform_fee: 15.75,
    provider_earnings: 89.25,
    pin_code: "7742",
    start_time: minutesFromNow(-90),
    expected_end_time: minutesFromNow(90),
  }),
  seedBooking(2, {
    spot_id: SEED_SPOTS[4].id,
    status: "reserved",
    start_time: minutesFromNow(210),
    expected_end_time: minutesFromNow(390),
    base_amount: 120,
    platform_fee: 18,
    provider_earnings: 102,
    pin_code: "3390",
  }),
  seedBooking(3, {
    spot_id: SEED_SPOTS[3].id,
    status: "pending_lock",
    start_time: minutesFromNow(4),
    expected_end_time: minutesFromNow(184),
    base_amount: 165,
    platform_fee: 24.75,
    provider_earnings: 140.25,
    pin_code: "1107",
  }),
  seedBooking(4, {
    spot_id: SEED_SPOTS[6].id,
    status: "completed",
    start_time: minutesFromNow(-6480),
    expected_end_time: minutesFromNow(-5040),
    actual_check_in: minutesFromNow(-6475),
    actual_check_out: minutesFromNow(-5035),
    verified_via: "pin",
    base_amount: 375,
    platform_fee: 56.25,
    provider_earnings: 318.75,
    pin_code: "2019",
  }),
];

const spotById = new Map(SEED_SPOTS.map((spot) => [spot.id, spot]));

export const SEED_BOOKINGS: Booking[] = SEED_BOOKING_ROWS.map((row) => {
  const spot = spotById.get(row.spot_id) ?? SEED_SPOTS[0];
  return toBooking(row, {
    spotTitle: spot.title,
    address: spot.address,
    hostName: spot.hostName,
    plate: "KA-19-MG-2026",
    hourlyRate: spot.pricePerHour,
  });
});

export const SEED_LEDGER: LedgerEntry[] = [
  {
    id: "tx_8812",
    label: "Gated driveway · Jubilee Hills",
    detail: "4h session · settled",
    amount: 204,
    kind: "earning",
    at: minutesFromNow(-60 * 26),
  },
  {
    id: "tx_8790",
    label: "Platform commission",
    detail: "15% of ₹240",
    amount: -36,
    kind: "commission",
    at: minutesFromNow(-60 * 26),
  },
  {
    id: "tx_8764",
    label: "Tower basement · Kondapur",
    detail: "3h session · settled",
    amount: 89.25,
    kind: "earning",
    at: minutesFromNow(-60 * 34),
  },
  {
    id: "tx_8741",
    label: "Payout to HDFC ••4412",
    detail: "Weekly settlement",
    amount: -1240,
    kind: "payout",
    at: minutesFromNow(-60 * 40),
  },
  {
    id: "tx_8702",
    label: "Refund · blocked bay",
    detail: "Auto-refund, bay obstructed",
    amount: -105,
    kind: "refund",
    at: minutesFromNow(-60 * 52),
  },
];

export const SEED_DISPUTES: Dispute[] = [
  {
    id: "dp_4471",
    bookingId: "bk_seed_4",
    spotTitle: "Airport long-stay · Shamshabad",
    reason: "Spot was occupied on arrival",
    description: "Another car was already in the bay when I arrived.",
    raisedBy: "arjun@parkpeer.app",
    reporterId: SEED_DRIVER_ID,
    resolved: false,
    at: minutesFromNow(-60 * 30),
  },
  {
    id: "dp_4468",
    bookingId: "bk_seed_3",
    spotTitle: "Commercial bay · Gachibowli",
    reason: "Overstay charge disputed",
    description: "I left within the grace window but was charged a penalty.",
    raisedBy: "arjun@parkpeer.app",
    reporterId: SEED_DRIVER_ID,
    resolved: false,
    at: minutesFromNow(-60 * 11),
  },
  {
    id: "dp_4450",
    bookingId: "bk_seed_1",
    spotTitle: "Tower basement · Kondapur",
    reason: "Gate code did not work",
    description: "Code was rejected twice; host opened it manually.",
    raisedBy: "priya@parkpeer.app",
    reporterId: "7c59434e-0cab-42f9-9220-6f99a3450186",
    resolved: true,
    at: minutesFromNow(-60 * 74),
  },
];

/** Provider-side listing rows, derived from the same bays. */
export const SEED_PROVIDER_LISTINGS = SEED_SPOTS.slice(0, 6).map((spot, index) => ({
  spotId: spot.id,
  title: spot.title,
  status: (index === 4 ? "paused" : "live") as "live" | "paused" | "pending",
  utilisation: 78 - index * 9,
  earnedThisMonth: Math.round(spot.pricePerHour * 141.7),
  nextBookingAt: index % 2 === 0 ? minutesFromNow(210 + index * 90) : null,
}));

/** Hyderabad city centre — the map's default frame and the seed distances' origin. */
export const DEFAULT_CENTER = { lat: 17.4435, lng: 78.4013 };

export const CITY_PINS = [
  { name: "Hyderabad", lat: 17.385, lng: 78.4867, spots: 1840, demand: 92 },
  { name: "Bengaluru", lat: 12.9716, lng: 77.5946, spots: 2310, demand: 96 },
  { name: "Mumbai", lat: 19.076, lng: 72.8777, spots: 1980, demand: 98 },
  { name: "Pune", lat: 18.5204, lng: 73.8567, spots: 940, demand: 81 },
  { name: "Chennai", lat: 13.0827, lng: 80.2707, spots: 1120, demand: 84 },
  { name: "Delhi NCR", lat: 28.6139, lng: 77.209, spots: 2640, demand: 94 },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, spots: 760, demand: 88 },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, spots: 610, demand: 90 },
];
