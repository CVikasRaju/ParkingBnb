/**
 * Host console and operator god-view loaders.
 *
 * Both use the service-role client, on purpose. A host has to see the *driver's*
 * plate and PIN to verify an arrival, and `vehicles` / `bookings` are fenced by
 * RLS to their own owner — a host could never read them through the user-scoped
 * client. Authorisation therefore happens before the query (the caller has
 * already passed `requireRole`), and every query is filtered by the acting
 * user's own id.
 */

import { isSupabaseConfigured } from "@/lib/config";
import { toSpot, type ParkingSpotRow, type ProviderRow } from "@/lib/data/rows";
import {
  SEED_BOOKINGS,
  SEED_DISPUTES,
  SEED_LEDGER,
  SEED_PROVIDER_LISTINGS,
  SEED_SPOTS,
} from "@/lib/data/seed";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PLATFORM, type Booking, type BookingStatus, type Dispute, type LedgerEntry, type Spot } from "@/lib/types";

export interface HostListing {
  spot: Spot;
  /** Sessions taken in the last 30 days, as a share of available hours. */
  utilisation: number;
  earnedThisMonth: number;
  nextBookingAt: string | null;
}

export interface HostConsole {
  listings: HostListing[];
  arrivals: Booking[];
  ledger: LedgerEntry[];
  note: string | null;
  live: boolean;
}

export interface AdminLock {
  bookingId: string;
  spotId: string;
  spotTitle: string;
  hostName: string;
  driverEmail: string;
  status: BookingStatus;
  plate: string;
  createdAt: string;
}

export interface AdminDispute {
  id: string;
  bookingId: string;
  reason: string;
  description: string;
  reporterEmail: string;
  resolved: boolean;
  at: string;
}

export interface AdminOverview {
  spots: Spot[];
  locks: AdminLock[];
  disputes: AdminDispute[];
  totals: {
    listedBays: number;
    activeLocks: number;
    openDisputes: number;
    grossSettled: number;
    platformRevenue: number;
    providerPayouts: number;
  };
  live: boolean;
  note: string | null;
}

const SPOT_COLUMNS =
  "id, provider_id, title, description, address, location, hourly_rate, status, has_iot_barrier, created_at, updated_at";

async function hostsById(): Promise<Record<string, string>> {
  const db = createSupabaseAdminClient();
  if (!db) return {};
  const { data } = await db.from("public_providers").select("id, full_name");
  return Object.fromEntries(((data ?? []) as ProviderRow[]).map((row) => [row.id, row.full_name]));
}

/* ── Host console ──────────────────────────────────────────────────────────── */

export async function loadHostConsole(
  providerId: string,
): Promise<HostConsole> {
  const db = createSupabaseAdminClient();

  if (!isSupabaseConfigured || !db) {
    return {
      listings: SEED_PROVIDER_LISTINGS.map((listing, index) => ({
        spot: SEED_SPOTS[index] ?? SEED_SPOTS[0],
        utilisation: listing.utilisation,
        earnedThisMonth: listing.earnedThisMonth,
        nextBookingAt: listing.nextBookingAt,
      })),
      arrivals: SEED_BOOKINGS.filter((booking) => booking.status === "reserved"),
      ledger: SEED_LEDGER,
      note: isSupabaseConfigured
        ? null
        : "Supabase is not configured — this console is running on the seed catalogue.",
      live: false,
    };
  }

  try {
    const [{ data: spotRows }, hosts] = await Promise.all([
      db.from("parking_spots").select(SPOT_COLUMNS).eq("provider_id", providerId),
      hostsById(),
    ]);

    const spots = ((spotRows ?? []) as unknown as ParkingSpotRow[]).map((row) =>
      toSpot(row, hosts[row.provider_id] ?? "You"),
    );

    if (spots.length === 0) {
      return {
        listings: [],
        arrivals: [],
        ledger: [],
        note: "You have no bays listed yet. Create one from the mobile app to see it here.",
        live: true,
      };
    }

    const spotIds = spots.map((spot) => spot.id);
    const spotById = new Map(spots.map((spot) => [spot.id, spot]));

    const [{ data: bookingRows }, { data: settlementRows }] = await Promise.all([
      db
        .from("bookings")
        .select(
          "id, spot_id, driver_id, vehicle_id, status, start_time, expected_end_time, base_amount, created_at, pin_code",
        )
        .in("spot_id", spotIds)
        .order("created_at", { ascending: false })
        .limit(60),
      db
        .from("settlement_ledger")
        .select("id, gross_amount, platform_fee, provider_earnings, status, created_at, booking_id")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    type BookingLite = {
      id: string;
      spot_id: string;
      vehicle_id: string;
      status: BookingStatus;
      start_time: string;
      expected_end_time: string;
      base_amount: number | string;
      created_at: string;
      driver_id: string;
    };

    const rows = (bookingRows ?? []) as BookingLite[];
    const vehicleIds = [...new Set(rows.map((row) => row.vehicle_id))];
    const { data: vehicleRows } = vehicleIds.length
      ? await db.from("vehicles").select("id, license_plate").in("id", vehicleIds)
      : { data: [] as Array<{ id: string; license_plate: string }> };
    const plateById = new Map(
      ((vehicleRows ?? []) as Array<{ id: string; license_plate: string }>).map((row) => [
        row.id,
        row.license_plate,
      ]),
    );

    const arrivals: Booking[] = rows
      .filter((row) => row.status === "reserved" || row.status === "checked_in")
      .map((row) => {
        const spot = spotById.get(row.spot_id);
        return {
          id: row.id,
          spotId: row.spot_id,
          driverId: row.driver_id,
          vehicleId: row.vehicle_id,
          status: row.status,
          startsAt: row.start_time,
          expectedEndAt: row.expected_end_time,
          actualCheckIn: null,
          actualCheckOut: null,
          baseAmount: Number(row.base_amount),
          overstayAmount: 0,
          platformFee: 0,
          providerEarnings: 0,
          // The host console never needs the PIN to *display*; verification
          // happens in the modal against the stored value.
          pin: "",
          qrSecret: "",
          verifiedVia: null,
          paymentIntentId: "",
          createdAt: row.created_at,
          spotTitle: spot?.title ?? "Bay",
          address: spot?.address ?? "",
          hostName: spot?.hostName ?? "You",
          plate: plateById.get(row.vehicle_id) ?? "—",
          hourlyRate: spot?.pricePerHour ?? 0,
        };
      });

    const now = Date.now();
    const monthStart = now - 30 * 24 * 3600 * 1000;

    const settled = ((settlementRows ?? []) as Array<{
      provider_earnings: number | string;
      platform_fee: number | string;
      gross_amount: number | string;
      status: string;
      created_at: string;
      id: string;
      booking_id: string;
    }>) ?? [];

    const ledger: LedgerEntry[] = [];
    for (const row of settled) {
      const at = row.created_at;
      ledger.push({
        id: `${row.id}_net`,
        label: "Session payout",
        detail: `${row.status} · gross ₹${Number(row.gross_amount).toFixed(2)}`,
        amount: Number(row.provider_earnings),
        kind: "earning",
        at,
      });
      ledger.push({
        id: `${row.id}_fee`,
        label: "Platform commission",
        detail: `${Math.round(PLATFORM.commissionRate * 100)}% of gross`,
        amount: -Number(row.platform_fee),
        kind: "commission",
        at,
      });
    }

    const listings: HostListing[] = spots.map((spot) => {
      const mine = rows.filter((row) => row.spot_id === spot.id);
      const completed = mine.filter((row) => row.status === "completed").length;
      const upcoming = mine
        .filter(
          (row) =>
            (row.status === "reserved" || row.status === "pending_lock") &&
            new Date(row.start_time).getTime() > now,
        )
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

      const earnings = settled
        .filter((row) => mine.some((booking) => booking.id === row.booking_id))
        .filter((row) => new Date(row.created_at).getTime() >= monthStart)
        .reduce((sum, row) => sum + Number(row.provider_earnings), 0);

      return {
        spot,
        utilisation: Math.min(100, Math.round((completed / 30) * 100)),
        earnedThisMonth: Math.round(earnings),
        nextBookingAt: upcoming?.start_time ?? null,
      };
    });

    return { listings, arrivals, ledger, note: null, live: true };
  } catch (error) {
    return {
      listings: SEED_PROVIDER_LISTINGS.map((listing, index) => ({
        spot: SEED_SPOTS[index] ?? SEED_SPOTS[0],
        utilisation: listing.utilisation,
        earnedThisMonth: listing.earnedThisMonth,
        nextBookingAt: listing.nextBookingAt,
      })),
      arrivals: SEED_BOOKINGS.filter((booking) => booking.status === "reserved"),
      ledger: SEED_LEDGER,
      note: `Host console read failed (${(error as Error).message}) — showing seed data.`,
      live: false,
    };
  }
}

/* ── Operator god-view ─────────────────────────────────────────────────────── */

const ACTIVE: BookingStatus[] = ["pending_lock", "reserved", "checked_in", "overstayed"];

export async function loadAdminOverview(): Promise<AdminOverview> {
  const db = createSupabaseAdminClient();
  const hosts = await hostsById();

  if (!isSupabaseConfigured || !db) {
    return {
      spots: SEED_SPOTS,
      locks: SEED_BOOKINGS.filter((booking) => ACTIVE.includes(booking.status)).map(
        (booking) => ({
          bookingId: booking.id,
          spotId: booking.spotId,
          spotTitle: booking.spotTitle,
          hostName: booking.hostName,
          driverEmail: "arjun@parkpeer.app",
          status: booking.status,
          plate: booking.plate,
          createdAt: booking.createdAt,
        }),
      ),
      disputes: SEED_DISPUTES.map((dispute) => ({
        id: dispute.id,
        bookingId: dispute.bookingId,
        reason: dispute.reason,
        description: dispute.description,
        reporterEmail: dispute.raisedBy,
        resolved: dispute.resolved,
        at: dispute.at,
      })),
      totals: {
        listedBays: SEED_SPOTS.length,
        activeLocks: SEED_BOOKINGS.filter((b) => ACTIVE.includes(b.status)).length,
        openDisputes: SEED_DISPUTES.filter((d) => !d.resolved).length,
        grossSettled: 0,
        platformRevenue: 0,
        providerPayouts: 0,
      },
      live: false,
      note: isSupabaseConfigured
        ? null
        : "Supabase is not configured — the god-view is running on the seed catalogue.",
    };
  }

  try {
    const [{ data: spotRows }, { data: bookingRows }, { data: disputeRows }, { data: settledRows }] =
      await Promise.all([
        db.from("parking_spots").select(SPOT_COLUMNS).order("created_at", { ascending: false }),
        db
          .from("bookings")
          .select(
            "id, spot_id, driver_id, vehicle_id, status, created_at, start_time, base_amount, platform_fee, provider_earnings",
          )
          .in("status", ACTIVE)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("disputes")
          .select("id, booking_id, reporter_id, reason, description, resolved, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        db
          .from("settlement_ledger")
          .select("gross_amount, platform_fee, provider_earnings"),
      ]);

    const spots = ((spotRows ?? []) as unknown as ParkingSpotRow[]).map((row) =>
      toSpot(row, hosts[row.provider_id] ?? "Verified host"),
    );
    const spotById = new Map(spots.map((spot) => [spot.id, spot]));

    type BookingLite = {
      id: string;
      spot_id: string;
      driver_id: string;
      vehicle_id: string;
      status: BookingStatus;
      created_at: string;
    };
    const rows = (bookingRows ?? []) as BookingLite[];

    const vehicleIds = [...new Set(rows.map((row) => row.vehicle_id))];
    const driverIds = [...new Set(rows.map((row) => row.driver_id))];

    const [{ data: vehicleRows }, { data: userRows }] = await Promise.all([
      vehicleIds.length
        ? db.from("vehicles").select("id, license_plate").in("id", vehicleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; license_plate: string }> }),
      driverIds.length
        ? db.from("users").select("id, email").in("id", driverIds)
        : Promise.resolve({ data: [] as Array<{ id: string; email: string }> }),
    ]);

    const plateById = new Map(
      ((vehicleRows ?? []) as Array<{ id: string; license_plate: string }>).map((row) => [
        row.id,
        row.license_plate,
      ]),
    );
    const emailById = new Map(
      ((userRows ?? []) as Array<{ id: string; email: string }>).map((row) => [row.id, row.email]),
    );

    const locks: AdminLock[] = rows.map((row) => ({
      bookingId: row.id,
      spotId: row.spot_id,
      spotTitle: spotById.get(row.spot_id)?.title ?? "Bay",
      hostName: spotById.get(row.spot_id)?.hostName ?? "—",
      driverEmail: emailById.get(row.driver_id) ?? "—",
      status: row.status,
      plate: plateById.get(row.vehicle_id) ?? "—",
      createdAt: row.created_at,
    }));

    const disputes: AdminDispute[] = (
      (disputeRows ?? []) as Array<{
        id: string;
        booking_id: string;
        reporter_id: string;
        reason: string;
        description: string;
        resolved: boolean;
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      reason: row.reason,
      description: row.description,
      reporterEmail: emailById.get(row.reporter_id) ?? "—",
      resolved: row.resolved,
      at: row.created_at,
    }));

    const settled = (settledRows ?? []) as Array<{
      gross_amount: number | string;
      platform_fee: number | string;
      provider_earnings: number | string;
    }>;

    return {
      spots,
      locks,
      disputes,
      totals: {
        listedBays: spots.length,
        activeLocks: locks.filter((lock) => lock.status === "pending_lock").length,
        openDisputes: disputes.filter((dispute) => !dispute.resolved).length,
        grossSettled: settled.reduce((sum, row) => sum + Number(row.gross_amount), 0),
        platformRevenue: settled.reduce((sum, row) => sum + Number(row.platform_fee), 0),
        providerPayouts: settled.reduce((sum, row) => sum + Number(row.provider_earnings), 0),
      },
      live: true,
      note: null,
    };
  } catch (error) {
    return {
      spots: SEED_SPOTS,
      locks: [],
      disputes: SEED_DISPUTES.map((dispute) => ({
        id: dispute.id,
        bookingId: dispute.bookingId,
        reason: dispute.reason,
        description: dispute.description,
        reporterEmail: dispute.raisedBy,
        resolved: dispute.resolved,
        at: dispute.at,
      })),
      totals: {
        listedBays: SEED_SPOTS.length,
        activeLocks: 0,
        openDisputes: SEED_DISPUTES.filter((d) => !d.resolved).length,
        grossSettled: 0,
        platformRevenue: 0,
        providerPayouts: 0,
      },
      live: false,
      note: `God-view read failed (${(error as Error).message}) — showing seed data.`,
    };
  }
}

export type { Dispute };
