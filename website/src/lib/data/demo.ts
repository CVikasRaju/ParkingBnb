/**
 * Built-in demo dataset.
 *
 * This is what every screen reads while no backend is configured, so the web
 * app is fully explorable before any credentials exist. The shapes deliberately
 * mirror the real API in `docs/API_SPEC.md` (spot fields, booking FSM states,
 * 15% platform commission) so switching to live data is a transport change, not
 * a rewrite.
 */

export type SpotType = "Driveway" | "Private garage" | "Commercial bay" | "Basement";

export interface Spot {
  id: string;
  title: string;
  address: string;
  area: string;
  lat: number;
  lng: number;
  pricePerHour: number;
  rating: number;
  reviews: number;
  available: boolean;
  instantBook: boolean;
  type: SpotType;
  providerName: string;
  distanceMeters: number;
  walkMinutes: number;
  capacity: number;
  features: string[];
}

export type BookingStatus =
  | "LOCKED"
  | "RESERVED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED";

export interface Booking {
  id: string;
  spotId: string;
  spotTitle: string;
  address: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  hourlyRate: number;
  total: number;
  pin: string;
  plate: string;
  providerName: string;
}

export interface LedgerEntry {
  id: string;
  label: string;
  detail: string;
  amount: number;
  kind: "earning" | "payout" | "refund" | "commission";
  at: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  spotTitle: string;
  reason: string;
  raisedBy: string;
  status: "open" | "reviewing" | "resolved";
  at: string;
}

export interface CityPin {
  name: string;
  country: string;
  lat: number;
  lng: number;
  spots: number;
  providers: number;
  demand: number;
}

/** Coordinates below are real city centres, used by the 3D globe. */
export const cities: CityPin[] = [
  { name: "Hyderabad", country: "India", lat: 17.385, lng: 78.4867, spots: 1840, providers: 620, demand: 92 },
  { name: "Bengaluru", country: "India", lat: 12.9716, lng: 77.5946, spots: 2310, providers: 780, demand: 96 },
  { name: "Mumbai", country: "India", lat: 19.076, lng: 72.8777, spots: 1980, providers: 540, demand: 98 },
  { name: "Pune", country: "India", lat: 18.5204, lng: 73.8567, spots: 940, providers: 310, demand: 81 },
  { name: "Chennai", country: "India", lat: 13.0827, lng: 80.2707, spots: 1120, providers: 360, demand: 84 },
  { name: "Delhi NCR", country: "India", lat: 28.6139, lng: 77.209, spots: 2640, providers: 830, demand: 94 },
  { name: "Dubai", country: "UAE", lat: 25.2048, lng: 55.2708, spots: 760, providers: 240, demand: 88 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198, spots: 610, providers: 190, demand: 90 },
  { name: "London", country: "UK", lat: 51.5072, lng: -0.1276, spots: 1420, providers: 470, demand: 89 },
  { name: "New York", country: "USA", lat: 40.7128, lng: -74.006, spots: 1730, providers: 520, demand: 93 },
];

export const spots: Spot[] = [
  {
    id: "sp_9f2a",
    title: "Gated driveway · Jubilee Hills",
    address: "Road No. 36, Jubilee Hills",
    area: "Jubilee Hills",
    lat: 17.4325,
    lng: 78.4073,
    pricePerHour: 60,
    rating: 4.9,
    reviews: 214,
    available: true,
    instantBook: true,
    type: "Driveway",
    providerName: "Priya R.",
    distanceMeters: 320,
    walkMinutes: 4,
    capacity: 1,
    features: ["CCTV", "Gated", "Well lit", "Paved"],
  },
  {
    id: "sp_73bd",
    title: "Basement bay · Hitec City",
    address: "Cyber Towers, Madhapur",
    area: "Hitec City",
    lat: 17.4504,
    lng: 78.3808,
    pricePerHour: 45,
    rating: 4.7,
    reviews: 486,
    available: true,
    instantBook: true,
    type: "Basement",
    providerName: "Cyber Towers Facility",
    distanceMeters: 640,
    walkMinutes: 8,
    capacity: 12,
    features: ["Covered", "CCTV", "EV charger", "24×7"],
  },
  {
    id: "sp_2c11",
    title: "Private garage · Banjara Hills",
    address: "Road No. 12, Banjara Hills",
    area: "Banjara Hills",
    lat: 17.4126,
    lng: 78.4392,
    pricePerHour: 90,
    rating: 5.0,
    reviews: 92,
    available: false,
    instantBook: false,
    type: "Private garage",
    providerName: "Ishaan M.",
    distanceMeters: 810,
    walkMinutes: 10,
    capacity: 1,
    features: ["Covered", "Locked", "CCTV"],
  },
  {
    id: "sp_5e90",
    title: "Commercial bay · Gachibowli",
    address: "Financial District, Gachibowli",
    area: "Gachibowli",
    lat: 17.4401,
    lng: 78.3489,
    pricePerHour: 55,
    rating: 4.6,
    reviews: 331,
    available: true,
    instantBook: true,
    type: "Commercial bay",
    providerName: "FinTech Plaza",
    distanceMeters: 1150,
    walkMinutes: 14,
    capacity: 40,
    features: ["Covered", "Valet", "EV charger", "CCTV", "24×7"],
  },
  {
    id: "sp_88ac",
    title: "Shaded driveway · Madhapur",
    address: "Ayyappa Society, Madhapur",
    area: "Madhapur",
    lat: 17.4487,
    lng: 78.3915,
    pricePerHour: 40,
    rating: 4.5,
    reviews: 128,
    available: true,
    instantBook: false,
    type: "Driveway",
    providerName: "Sridhar K.",
    distanceMeters: 1420,
    walkMinutes: 17,
    capacity: 2,
    features: ["Shaded", "Gated"],
  },
  {
    id: "sp_1dd7",
    title: "Tower basement · Kondapur",
    address: "Botanical Garden Rd, Kondapur",
    area: "Kondapur",
    lat: 17.4632,
    lng: 78.3617,
    pricePerHour: 35,
    rating: 4.4,
    reviews: 205,
    available: true,
    instantBook: true,
    type: "Basement",
    providerName: "My Home Constructions",
    distanceMeters: 1780,
    walkMinutes: 21,
    capacity: 24,
    features: ["Covered", "CCTV", "Lift access"],
  },
  {
    id: "sp_6b42",
    title: "Airport long-stay · Shamshabad",
    address: "RGIA Approach Rd, Shamshabad",
    area: "Shamshabad",
    lat: 17.2403,
    lng: 78.4294,
    pricePerHour: 25,
    rating: 4.3,
    reviews: 764,
    available: true,
    instantBook: true,
    type: "Commercial bay",
    providerName: "SkyPark Logistics",
    distanceMeters: 21400,
    walkMinutes: 0,
    capacity: 300,
    features: ["Shuttle", "CCTV", "24×7", "Insured"],
  },
  {
    id: "sp_4402",
    title: "Corner garage · Begumpet",
    address: "Prakash Nagar, Begumpet",
    area: "Begumpet",
    lat: 17.4435,
    lng: 78.4713,
    pricePerHour: 50,
    rating: 4.8,
    reviews: 143,
    available: false,
    instantBook: false,
    type: "Private garage",
    providerName: "Fatima S.",
    distanceMeters: 3260,
    walkMinutes: 38,
    capacity: 1,
    features: ["Covered", "Locked"],
  },
];

/** Bookings are relative to "now" so the dashboard always looks alive. */
function at(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

export const bookings: Booking[] = [
  {
    id: "bk_7c41a9",
    spotId: "sp_73bd",
    spotTitle: "Basement bay · Hitec City",
    address: "Cyber Towers, Madhapur",
    status: "CHECKED_IN",
    startsAt: at(-95),
    endsAt: at(85),
    hourlyRate: 45,
    total: 135,
    pin: "4821",
    plate: "TS09 EA 4412",
    providerName: "Cyber Towers Facility",
  },
  {
    id: "bk_2f80de",
    spotId: "sp_9f2a",
    spotTitle: "Gated driveway · Jubilee Hills",
    address: "Road No. 36, Jubilee Hills",
    status: "RESERVED",
    startsAt: at(210),
    endsAt: at(390),
    hourlyRate: 60,
    total: 180,
    pin: "3390",
    plate: "TS09 EA 4412",
    providerName: "Priya R.",
  },
  {
    id: "bk_91b3c0",
    spotId: "sp_5e90",
    spotTitle: "Commercial bay · Gachibowli",
    address: "Financial District, Gachibowli",
    status: "LOCKED",
    startsAt: at(4),
    endsAt: at(184),
    hourlyRate: 55,
    total: 165,
    pin: "1107",
    plate: "TS09 EA 4412",
    providerName: "FinTech Plaza",
  },
  {
    id: "bk_4ae176",
    spotId: "sp_1dd7",
    spotTitle: "Tower basement · Kondapur",
    address: "Botanical Garden Rd, Kondapur",
    status: "COMPLETED",
    startsAt: at(-2280),
    endsAt: at(-2100),
    hourlyRate: 35,
    total: 105,
    pin: "7742",
    plate: "TS09 EA 4412",
    providerName: "My Home Constructions",
  },
  {
    id: "bk_c50f88",
    spotId: "sp_6b42",
    spotTitle: "Airport long-stay · Shamshabad",
    address: "RGIA Approach Rd, Shamshabad",
    status: "COMPLETED",
    startsAt: at(-6480),
    endsAt: at(-5040),
    hourlyRate: 25,
    total: 600,
    pin: "2019",
    plate: "TS09 EA 4412",
    providerName: "SkyPark Logistics",
  },
  {
    id: "bk_1d99e2",
    spotId: "sp_88ac",
    spotTitle: "Shaded driveway · Madhapur",
    address: "Ayyappa Society, Madhapur",
    status: "CANCELLED",
    startsAt: at(-3600),
    endsAt: at(-3480),
    hourlyRate: 40,
    total: 0,
    pin: "5560",
    plate: "TS09 EA 4412",
    providerName: "Sridhar K.",
  },
];

export const ledger: LedgerEntry[] = [
  {
    id: "tx_8812",
    label: "Gated driveway · Jubilee Hills",
    detail: "4h session · settled",
    amount: 204,
    kind: "earning",
    at: at(-60 * 26),
  },
  {
    id: "tx_8790",
    label: "Platform commission",
    detail: "15% of ₹240",
    amount: -36,
    kind: "commission",
    at: at(-60 * 26),
  },
  {
    id: "tx_8764",
    label: "Tower basement · Kondapur",
    detail: "3h session · settled",
    amount: 89.25,
    kind: "earning",
    at: at(-60 * 34),
  },
  {
    id: "tx_8741",
    label: "Payout to HDFC ••4412",
    detail: "Weekly settlement",
    amount: -1240,
    kind: "payout",
    at: at(-60 * 40),
  },
  {
    id: "tx_8702",
    label: "Refund · blocked spot",
    detail: "Auto-refund, spot obstructed",
    amount: -105,
    kind: "refund",
    at: at(-60 * 52),
  },
];

export const disputes: Dispute[] = [
  {
    id: "dp_4471",
    bookingId: "bk_4ae176",
    spotTitle: "Tower basement · Kondapur",
    reason: "Spot was occupied on arrival",
    raisedBy: "arjun@parkpeer.demo",
    status: "reviewing",
    at: at(-60 * 30),
  },
  {
    id: "dp_4468",
    bookingId: "bk_c50f88",
    spotTitle: "Airport long-stay · Shamshabad",
    reason: "Overstay charge disputed",
    raisedBy: "arjun@parkpeer.demo",
    status: "open",
    at: at(-60 * 11),
  },
  {
    id: "dp_4450",
    bookingId: "bk_1d99e2",
    spotTitle: "Shaded driveway · Madhapur",
    reason: "Gate code did not work",
    raisedBy: "priya@parkpeer.demo",
    status: "resolved",
    at: at(-60 * 74),
  },
];

export const platformStats = {
  citiesLive: cities.length,
  spotsListed: cities.reduce((sum, c) => sum + c.spots, 0),
  providers: cities.reduce((sum, c) => sum + c.providers, 0),
  avgMatchSeconds: 38,
  commissionRate: 0.15,
  lockTtlMinutes: 10,
  geofenceMeters: 50,
};

/** Provider-side listing rows, derived from the same spot set. */
export interface ProviderListing {
  spotId: string;
  title: string;
  status: "live" | "paused" | "pending";
  pricePerHour: number;
  utilisation: number;
  earnedThisMonth: number;
  nextBookingAt: string | null;
}

export const providerListings: ProviderListing[] = [
  {
    spotId: "sp_9f2a",
    title: "Gated driveway · Jubilee Hills",
    status: "live",
    pricePerHour: 60,
    utilisation: 78,
    earnedThisMonth: 8460,
    nextBookingAt: at(210),
  },
  {
    spotId: "sp_2c11",
    title: "Private garage · Banjara Hills",
    status: "paused",
    pricePerHour: 90,
    utilisation: 31,
    earnedThisMonth: 2340,
    nextBookingAt: null,
  },
  {
    spotId: "sp_88ac",
    title: "Shaded driveway · Madhapur",
    status: "live",
    pricePerHour: 40,
    utilisation: 64,
    earnedThisMonth: 5120,
    nextBookingAt: at(1440),
  },
  {
    spotId: "sp_4402",
    title: "Corner garage · Begumpet",
    status: "pending",
    pricePerHour: 50,
    utilisation: 0,
    earnedThisMonth: 0,
    nextBookingAt: null,
  },
];

export const waitlistSeed = ["arjun@parkpeer.demo", "priya@parkpeer.demo"];
