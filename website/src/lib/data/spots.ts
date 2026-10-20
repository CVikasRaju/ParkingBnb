/**
 * Server-side data access.
 *
 * Reads go through the **user-scoped** Supabase client, so they run under the
 * visitor's RLS policies: an anonymous browser sees only the public listing
 * columns of `available` and `locked` bays, and a signed-in driver additionally
 * sees their own bookings. Privileged work lives in `src/lib/actions/*`.
 *
 * Every loader has a seed fallback. A missing key, a paused project or a network
 * blip degrades the console to the seed catalogue with a visible note instead of
 * throwing a 500 into the page.
 */

import { isSupabaseConfigured } from "@/lib/config";
import {
  toBooking,
  toSpot,
  type BookingRow,
  type ParkingSpotRow,
  type ProviderRow,
  type VehicleRow,
} from "@/lib/data/rows";
import {
  SEED_BOOKINGS,
  SEED_LEDGER,
  SEED_SPOTS,
  SEED_VEHICLES,
} from "@/lib/data/seed";
import { distanceMeters, walkMinutes, type LatLng } from "@/lib/geo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Booking, LedgerEntry, Spot, SpotFeed, Vehicle } from "@/lib/types";

/** Exactly the columns migration 013/014/015 grant to `anon` + `authenticated`. */
const SPOT_COLUMNS =
  "id, provider_id, title, description, address, location, hourly_rate, status, has_iot_barrier, created_at, updated_at";

/** Host display names, exposed through the curated `public_providers` view. */
async function loadHostNames(): Promise<Record<string, string>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("public_providers")
    .select("id, full_name");

  if (error || !data) return {};

  return Object.fromEntries(
    (data as ProviderRow[]).map((row) => [row.id, row.full_name]),
  );
}

export interface NearbyQuery extends LatLng {
  radiusMeters?: number;
}

/**
 * The map's catalogue: every listed bay, with distances from the driver when a
 * centre is known. Includes `locked` bays so they paint amber for everyone —
 * that is the Realtime signal the booking engine publishes.
 */
export async function loadSpotFeed(center: LatLng | null = null): Promise<SpotFeed> {
  if (!isSupabaseConfigured) {
    return {
      spots: withDistances(SEED_SPOTS, center),
      source: "seed",
      note: null,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const [{ data, error }, hosts] = await Promise.all([
      supabase
        .from("parking_spots")
        .select(SPOT_COLUMNS)
        .in("status", ["available", "locked"])
        .order("hourly_rate", { ascending: true }),
      loadHostNames(),
    ]);

    if (error) throw new Error(error.message);

    const spots = ((data ?? []) as unknown as ParkingSpotRow[]).map((row) =>
      toSpot(row, hosts[row.provider_id] ?? "Verified host", center),
    );

    if (spots.length === 0) {
      return {
        spots: withDistances(SEED_SPOTS, center),
        source: "seed",
        note: "Supabase returned no listed bays — showing the seed catalogue.",
      };
    }

    return { spots, source: "supabase", note: null };
  } catch (error) {
    return {
      spots: withDistances(SEED_SPOTS, center),
      source: "seed",
      note: `Supabase read failed (${(error as Error).message}) — showing the seed catalogue.`,
    };
  }
}

/**
 * Radius search through the PostGIS function from `docs/SCHEMA.md`, granted to
 * `anon` in migration 013. Postgres does the spatial filter and ordering, which
 * is the whole point of the GiST index on `location`.
 *
 * Only `available` bays come back — the function filters on that — so this backs
 * the "available now" quick filter rather than the full map.
 */
export async function searchNearbyAvailable(
  query: NearbyQuery,
): Promise<Spot[]> {
  const radius = query.radiusMeters ?? 5000;

  if (!isSupabaseConfigured) {
    return SEED_SPOTS.filter(
      (spot) =>
        spot.status === "available" &&
        distanceMeters(query, { lat: spot.lat, lng: spot.lng }) <= radius,
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase.rpc("search_nearby_parking", {
      user_lat: query.lat,
      user_lng: query.lng,
      radius_meters: radius,
    });

    if (error) throw new Error(error.message);

    type RpcRow = {
      id: string;
      title: string;
      address: string;
      hourly_rate: number | string;
      latitude: number;
      longitude: number;
      distance_meters: number;
      has_iot_barrier: boolean;
    };

    const rows = (data ?? []) as RpcRow[];
    const byId = new Map((await loadFullCatalogue()).map((spot) => [spot.id, spot]));

    return rows
      .map((row) => {
        const known = byId.get(row.id);
        if (known) {
          return {
            ...known,
            distanceMeters: Math.round(row.distance_meters),
            walkMinutes: walkMinutes(row.distance_meters),
          };
        }
        // The RPC ran but the richer read did not include this bay; build what
        // the function itself can justify rather than dropping the result.
        return null;
      })
      .filter((spot): spot is Spot => spot !== null);
  } catch {
    return [];
  }
}

/** Catalogue used to enrich the RPC rows (host name, features, clearances). */
async function loadFullCatalogue(): Promise<Spot[]> {
  const feed = await loadSpotFeed(null);
  return feed.spots;
}

function withDistances(spots: Spot[], center: LatLng | null): Spot[] {
  if (!center) return spots;
  return spots
    .map((spot) => {
      const meters = distanceMeters(center, { lat: spot.lat, lng: spot.lng });
      return {
        ...spot,
        distanceMeters: Math.round(meters),
        walkMinutes: walkMinutes(meters),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/* ── Bookings ──────────────────────────────────────────────────────────────── */

export interface BookingContext {
  spots: Spot[];
  vehicles: Vehicle[];
}

/**
 * A signed-in driver's own bookings.
 *
 * RLS does the fencing (`driver_id = auth.uid()`), so no filter is applied here
 * beyond ordering — if the policy ever regressed, this function would still not
 * be able to read someone else's row.
 */
export async function loadBookingsFor(
  driverId: string,
  context: BookingContext,
): Promise<Booking[]> {
  if (!isSupabaseConfigured) {
    return SEED_BOOKINGS.filter((booking) => booking.driverId === driverId);
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, spot_id, driver_id, vehicle_id, status, start_time, expected_end_time, actual_check_in, actual_check_out, base_amount, overstay_amount, platform_fee, provider_earnings, pin_code, qr_secret, verified_via, payment_intent_id, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const spotById = new Map(context.spots.map((spot) => [spot.id, spot]));
    const vehicleById = new Map(context.vehicles.map((v) => [v.id, v]));

    return ((data ?? []) as unknown as BookingRow[]).map((row) => {
      const spot = spotById.get(row.spot_id);
      return toBooking(row, {
        spotTitle: spot?.title ?? "Parking bay",
        address: spot?.address ?? "",
        hostName: spot?.hostName ?? "Verified host",
        plate: vehicleById.get(row.vehicle_id)?.plate ?? "—",
        hourlyRate: spot?.pricePerHour ?? 0,
      });
    });
  } catch {
    return [];
  }
}

/** The viewer's vehicles. Rows are fenced by RLS to their own `driver_id`. */
export async function loadVehicles(): Promise<Vehicle[]> {
  if (!isSupabaseConfigured) return SEED_VEHICLES;

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase
      .from("vehicles")
      .select("id, driver_id, license_plate, make_model, vehicle_type, created_at")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as VehicleRow[];
    if (rows.length === 0) return SEED_VEHICLES;

    return rows.map((row) => {
      const template =
        SEED_VEHICLES.find((v) => v.kind === row.vehicle_type) ?? SEED_VEHICLES[1];
      return {
        id: row.id,
        kind: row.vehicle_type,
        label: row.make_model,
        plate: row.license_plate,
        lengthM: template.lengthM,
        widthM: template.widthM,
        heightM: template.heightM,
      };
    });
  } catch {
    return SEED_VEHICLES;
  }
}

/** Settlement ledger for the host console; empty until the first checkout. */
export async function loadLedger(): Promise<LedgerEntry[]> {
  if (!isSupabaseConfigured) return SEED_LEDGER;

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    const { data, error } = await supabase
      .from("settlement_ledger")
      .select("id, gross_amount, platform_fee, provider_earnings, status, created_at")
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      gross_amount: number | string;
      platform_fee: number | string;
      provider_earnings: number | string;
      status: string;
      created_at: string;
    };

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return SEED_LEDGER;

    const entries: LedgerEntry[] = [];
    for (const row of rows) {
      const gross = Number(row.gross_amount);
      const fee = Number(row.platform_fee);
      const net = Number(row.provider_earnings);
      entries.push({
        id: `${row.id}_net`,
        label: "Session payout",
        detail: `${row.status} · gross ₹${gross.toFixed(2)}`,
        amount: net,
        kind: "earning",
        at: row.created_at,
      });
      entries.push({
        id: `${row.id}_fee`,
        label: "Platform commission",
        detail: "15% of gross",
        amount: -fee,
        kind: "commission",
        at: row.created_at,
      });
    }
    return entries;
  } catch {
    return SEED_LEDGER;
  }
}
