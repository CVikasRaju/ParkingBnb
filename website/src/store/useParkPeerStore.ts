"use client";

/**
 * The single client-side store.
 *
 * One rule keeps this sane: **the store holds data and intent, never frames.**
 * The 3D canvases read the same store the DOM does, so the map marker, the HUD
 * pill and the WebGL pin can never disagree — but nothing animated is stored
 * here. Timers are derived from `lockExpiresAt` / `expectedEndAt` by whoever
 * draws them (`useNow`), which is what stops a 60 fps scene from re-rendering
 * the React tree 60 times a second.
 *
 * It is seeded so every flow works with no credentials at all, then `hydrate()`
 * swaps in live Supabase rows when they exist.
 */

import { create } from "zustand";

import {
  cancelBooking as cancelBookingAction,
  checkIn as checkInAction,
  checkout as checkoutAction,
  confirmEscrow,
  lockSpot,
  releaseExpiredLocks,
} from "@/lib/actions/bookings";
import {
  SEED_BOOKINGS,
  SEED_LEDGER,
  SEED_SPOTS,
  SEED_VEHICLES,
} from "@/lib/data/seed";
import { canTransition } from "@/lib/fsm";
import { computeBaseAmount, computeCheckoutBreakdown, minutesBetween } from "@/lib/money";
import type {
  Booking,
  BookingStatus,
  DataSource,
  LedgerEntry,
  Role,
  Spot,
  Vehicle,
  VehicleKind,
  VerificationMode,
} from "@/lib/types";
import { LOCK_TTL_MS, PLATFORM } from "@/lib/types";

export type ViewRole = Role;

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface HydrateInput {
  spots: Spot[];
  vehicles: Vehicle[];
  bookings: Booking[];
  ledger: LedgerEntry[];
  source: DataSource;
  note: string | null;
  viewer: Viewer | null;
}

/** How a lifecycle action was resolved — drives the honest toast copy. */
export type Persistence = "supabase" | "local";

interface ParkPeerState {
  /* ── Data ─────────────────────────────────────────────────────────────── */
  spots: Spot[];
  vehicles: Vehicle[];
  bookings: Booking[];
  ledger: LedgerEntry[];
  source: DataSource;
  note: string | null;
  hydrated: boolean;

  /* ── Identity ─────────────────────────────────────────────────────────── */
  viewer: Viewer | null;
  /** Which console the visitor is looking at; independent of their real role. */
  viewRole: ViewRole;

  /* ── Explore intent ───────────────────────────────────────────────────── */
  selectedSpotId: string | null;
  hoveredSpotId: string | null;
  vehicleId: string;
  hours: number;
  overstayMinutes: number;

  /* ── Lifecycle ────────────────────────────────────────────────────────── */
  activeBookingId: string | null;
  /** Epoch ms at which the 10-minute hold releases. Null when nothing is held. */
  lockExpiresAt: number | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  persistence: Persistence | null;

  /* ── Actions ──────────────────────────────────────────────────────────── */
  hydrate: (input: HydrateInput) => void;
  setViewRole: (role: ViewRole) => void;
  selectSpot: (spotId: string | null) => void;
  hoverSpot: (spotId: string | null) => void;
  setVehicle: (vehicleId: string) => void;
  setHours: (hours: number) => void;
  setOverstayMinutes: (minutes: number) => void;
  clearMessages: () => void;

  lock: () => Promise<boolean>;
  confirm: () => Promise<boolean>;
  verify: (mode: VerificationMode, options?: { pin?: string; distanceMeters?: number }) => Promise<boolean>;
  endSession: () => Promise<boolean>;
  cancel: () => Promise<boolean>;
  sweepExpiredHolds: () => Promise<void>;

  /* ── Selectors (plain functions, safe to call outside React) ──────────── */
  selectedSpot: () => Spot | null;
  activeBooking: () => Booking | null;
  spotById: (spotId: string) => Spot | undefined;
  activeVehicle: () => Vehicle;
  quote: () => { base: number; overstay: number; gross: number; platformFee: number; providerEarnings: number };
}

const DEFAULT_VEHICLE = SEED_VEHICLES[2]; // SUV — the spec's hero vehicle

function makeId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function pin(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

/** Merge a booking returned by a server action into the list, newest first. */
function upsertBooking(bookings: Booking[], next: Booking): Booking[] {
  const index = bookings.findIndex((booking) => booking.id === next.id);
  if (index === -1) return [next, ...bookings];
  const copy = [...bookings];
  copy[index] = { ...copy[index], ...next };
  return copy;
}

export const useParkPeerStore = create<ParkPeerState>()((set, get) => ({
  /* ── Initial (seed) state ─────────────────────────────────────────────── */
  spots: SEED_SPOTS,
  vehicles: SEED_VEHICLES,
  bookings: SEED_BOOKINGS,
  ledger: SEED_LEDGER,
  source: "seed",
  note: null,
  hydrated: false,

  viewer: null,
  viewRole: "driver",

  selectedSpotId: SEED_SPOTS[0]?.id ?? null,
  hoveredSpotId: null,
  vehicleId: DEFAULT_VEHICLE.id,
  hours: 3,
  overstayMinutes: 0,

  activeBookingId: null,
  lockExpiresAt: null,
  busy: false,
  error: null,
  notice: null,
  persistence: null,

  /* ── Setters ──────────────────────────────────────────────────────────── */
  hydrate: (input) =>
    set((state) => ({
      spots: input.spots.length > 0 ? input.spots : state.spots,
      vehicles: input.vehicles.length > 0 ? input.vehicles : state.vehicles,
      bookings: input.bookings.length > 0 ? input.bookings : input.viewer ? [] : state.bookings,
      ledger: input.ledger.length > 0 ? input.ledger : state.ledger,
      source: input.source,
      note: input.note,
      viewer: input.viewer,
      viewRole: input.viewer?.role ?? state.viewRole,
      hydrated: true,
      // Keep the selection pointing at a bay that still exists in live data.
      selectedSpotId:
        state.selectedSpotId &&
        input.spots.some((spot) => spot.id === state.selectedSpotId)
          ? state.selectedSpotId
          : (input.spots.find((spot) => spot.status === "available")?.id ??
            input.spots[0]?.id ??
            null),
    })),

  setViewRole: (viewRole) => set({ viewRole }),
  selectSpot: (selectedSpotId) =>
    set({ selectedSpotId, error: null, overstayMinutes: 0 }),
  hoverSpot: (hoveredSpotId) => set({ hoveredSpotId }),
  setVehicle: (vehicleId) => set({ vehicleId }),
  setHours: (hours) => set({ hours: Math.min(24, Math.max(1, Math.round(hours))) }),
  setOverstayMinutes: (overstayMinutes) =>
    set({ overstayMinutes: Math.max(0, Math.round(overstayMinutes)) }),
  clearMessages: () => set({ error: null, notice: null }),

  /* ── Phase 1 · Lock & pre-authorise ───────────────────────────────────── */
  lock: async () => {
    const state = get();
    const spot = state.selectedSpot();
    if (!spot) {
      set({ error: "Pick a bay on the map first." });
      return false;
    }
    if (spot.status !== "available") {
      set({ error: "That bay is already held. Choose another." });
      return false;
    }

    set({ busy: true, error: null, notice: null, overstayMinutes: 0 });

    const vehicle = state.activeVehicle();

    if (state.viewer) {
      const result = await lockSpot({
        spotId: spot.id,
        hours: state.hours,
        vehicleKind: vehicle.kind,
        plate: vehicle.plate,
        makeModel: vehicle.label,
      });

      if (!result.ok) {
        set({ busy: false, error: result.error });
        return false;
      }

      set((prev) => ({
        busy: false,
        persistence: "supabase",
        activeBookingId: result.data.id,
        lockExpiresAt: new Date(result.data.createdAt).getTime() + LOCK_TTL_MS,
        bookings: upsertBooking(prev.bookings, { ...result.data, hostName: spot.hostName }),
        spots: prev.spots.map((s) =>
          s.id === spot.id ? { ...s, status: "locked" } : s,
        ),
        notice: `Held for ${PLATFORM.lockTtlSeconds / 60} minutes. Escrow pre-authorised — the bay is reserved to you.`,
      }));
      return true;
    }

    // Anonymous visitor: the hold is simulated so the lifecycle stays explorable.
    const baseAmount = computeBaseAmount(spot.pricePerHour, state.hours);
    const now = new Date();
    const booking: Booking = {
      id: makeId("bk_local"),
      spotId: spot.id,
      driverId: "guest",
      vehicleId: vehicle.id,
      status: "pending_lock",
      startsAt: now.toISOString(),
      expectedEndAt: new Date(now.getTime() + state.hours * 3600_000).toISOString(),
      actualCheckIn: null,
      actualCheckOut: null,
      baseAmount,
      overstayAmount: 0,
      platformFee: Math.round(baseAmount * PLATFORM.commissionRate * 100) / 100,
      providerEarnings: Math.round(baseAmount * (1 - PLATFORM.commissionRate) * 100) / 100,
      pin: pin(),
      qrSecret: makeId("qr"),
      verifiedVia: null,
      paymentIntentId: makeId("pi_local"),
      createdAt: now.toISOString(),
      spotTitle: spot.title,
      address: spot.address,
      hostName: spot.hostName,
      plate: vehicle.plate,
      hourlyRate: spot.pricePerHour,
    };

    set((prev) => ({
      busy: false,
      persistence: "local",
      activeBookingId: booking.id,
      lockExpiresAt: now.getTime() + LOCK_TTL_MS,
      bookings: [booking, ...prev.bookings],
      spots: prev.spots.map((s) => (s.id === spot.id ? { ...s, status: "locked" } : s)),
      notice: `Held for ${PLATFORM.lockTtlSeconds / 60} minutes. Sign in to write this booking to Supabase and keep it past this tab.`,
    }));
    return true;
  },

  /* ── Phase 2 · Escrow authorised ──────────────────────────────────────── */
  confirm: async () => {
    const booking = get().activeBooking();
    if (!booking) return false;
    if (!canTransition(booking.status, "reserved")) {
      set({ error: "That step is out of order." });
      return false;
    }

    set({ busy: true, error: null });

    if (get().viewer && get().persistence === "supabase") {
      const result = await confirmEscrow(booking.id);
      if (!result.ok) {
        set({ busy: false, error: result.error });
        return false;
      }
      set((prev) => ({
        busy: false,
        bookings: upsertBooking(prev.bookings, { ...result.data, hostName: booking.hostName }),
        lockExpiresAt: null,
        notice: "Escrow authorised. Your pass is live — the QR and PIN below get you in.",
      }));
      return true;
    }

    set((prev) => ({
      busy: false,
      lockExpiresAt: null,
      bookings: prev.bookings.map((b) =>
        b.id === booking.id
          ? { ...b, status: "reserved", paymentIntentId: makeId("pi_local_auth") }
          : b,
      ),
      notice: "Escrow authorised. Your pass is live — the QR and PIN below get you in.",
    }));
    return true;
  },

  /* ── Phase 3 · Arrival ────────────────────────────────────────────────── */
  verify: async (mode, options) => {
    const booking = get().activeBooking();
    if (!booking) return false;
    if (!canTransition(booking.status, "checked_in")) {
      set({ error: "This session has already started." });
      return false;
    }

    set({ busy: true, error: null });

    if (get().viewer && get().persistence === "supabase") {
      const result = await checkInAction({
        bookingId: booking.id,
        mode,
        pin: options?.pin,
        distanceMeters: options?.distanceMeters,
      });
      if (!result.ok) {
        set({ busy: false, error: result.error });
        return false;
      }
      set((prev) => ({
        busy: false,
        bookings: upsertBooking(prev.bookings, {
          ...result.data,
          hostName: booking.hostName,
          plate: booking.plate,
        }),
        notice: `Arrival verified (${mode.replace("_", " ")}). The session timer is running.`,
      }));
      return true;
    }

    if (mode === "geofence" && (options?.distanceMeters ?? Infinity) > PLATFORM.geofenceMeters) {
      set({
        busy: false,
        error: `You're ${Math.round(options?.distanceMeters ?? 0)} m away — move within ${PLATFORM.geofenceMeters} m of the bay.`,
      });
      return false;
    }
    if (mode === "pin" && (options?.pin ?? "") !== booking.pin) {
      set({ busy: false, error: "That PIN doesn't match this booking." });
      return false;
    }

    const now = new Date().toISOString();
    set((prev) => ({
      busy: false,
      bookings: prev.bookings.map((b) =>
        b.id === booking.id
          ? { ...b, status: "checked_in", actualCheckIn: now, verifiedVia: mode }
          : b,
      ),
      notice: `Arrival verified (${mode.replace("_", " ")}). The session timer is running.`,
    }));
    return true;
  },

  /* ── Phase 4 · Checkout & settlement ──────────────────────────────────── */
  endSession: async () => {
    const state = get();
    const booking = state.activeBooking();
    if (!booking) return false;

    set({ busy: true, error: null });

    if (state.viewer && state.persistence === "supabase") {
      const result = await checkoutAction({
        bookingId: booking.id,
        overstayMinutes: state.overstayMinutes,
      });
      if (!result.ok) {
        set({ busy: false, error: result.error });
        return false;
      }
      const spot = state.spotById(result.data.spotId);
      set((prev) => ({
        busy: false,
        overstayMinutes: 0,
        bookings: upsertBooking(prev.bookings, {
          ...result.data,
          hostName: spot?.hostName ?? booking.hostName,
          plate: booking.plate,
        }),
        spots: prev.spots.map((s) =>
          s.id === result.data.spotId && !s.hasIotBarrier ? { ...s, status: "available" } : s,
        ),
        ledger: buildLocalLedger(result.data, prev.ledger),
        notice: "Settled. 85% released to the host, 15% platform commission.",
      }));
      return true;
    }

    const now = new Date().toISOString();
    const bookedMinutes = minutesBetween(booking.startsAt, booking.expectedEndAt);
    const breakdown = computeCheckoutBreakdown({
      baseAmount: booking.baseAmount,
      hourlyRate: booking.hourlyRate,
      overstayMultiplier: 1.5,
      parkedMinutes: bookedMinutes + state.overstayMinutes,
      bookedMinutes,
    });

    const settled: Booking = {
      ...booking,
      status: "completed",
      actualCheckOut: now,
      overstayAmount: breakdown.overstayAmount,
      platformFee: breakdown.platformFee,
      providerEarnings: breakdown.providerEarnings,
    };

    set((prev) => ({
      busy: false,
      overstayMinutes: 0,
      bookings: upsertBooking(prev.bookings, settled),
      spots: prev.spots.map((s) =>
        s.id === booking.spotId && !s.hasIotBarrier ? { ...s, status: "available" } : s,
      ),
      ledger: buildLocalLedger(settled, prev.ledger),
      notice: "Settled. 85% released to the host, 15% platform commission.",
    }));
    return true;
  },

  /* ── Cancel ───────────────────────────────────────────────────────────── */
  cancel: async () => {
    const state = get();
    const booking = state.activeBooking();
    if (!booking) return false;

    set({ busy: true, error: null });

    if (state.viewer && state.persistence === "supabase") {
      const result = await cancelBookingAction(booking.id);
      if (!result.ok) {
        set({ busy: false, error: result.error });
        return false;
      }
      set((prev) => ({
        busy: false,
        lockExpiresAt: null,
        activeBookingId: null,
        bookings: upsertBooking(prev.bookings, result.data),
        spots: prev.spots.map((s) =>
          s.id === result.data.spotId ? { ...s, status: "available" } : s,
        ),
        notice: "Released — no charge.",
      }));
      return true;
    }

    set((prev) => ({
      busy: false,
      lockExpiresAt: null,
      activeBookingId: null,
      bookings: prev.bookings.map((b) =>
        b.id === booking.id ? { ...b, status: "cancelled" } : b,
      ),
      spots: prev.spots.map((s) =>
        s.id === booking.spotId ? { ...s, status: "available" } : s,
      ),
      notice: "Released — no charge.",
    }));
    return true;
  },

  /**
   * Drop holds whose 10 minutes are up. Called when the map mounts, which is
   * the web stand-in for the Redis key expiry the API relies on.
   */
  sweepExpiredHolds: async () => {
    const expired = get().bookings.filter(
      (booking) =>
        booking.status === "pending_lock" &&
        Date.now() - new Date(booking.createdAt).getTime() > LOCK_TTL_MS,
    );

    if (get().viewer && get().source === "supabase") {
      const released = await releaseExpiredLocks();
      if (released === 0 && expired.length === 0) return;
    }

    if (expired.length === 0) return;

    const expiredIds = new Set(expired.map((booking) => booking.id));
    set((prev) => ({
      bookings: prev.bookings.map((booking) =>
        expiredIds.has(booking.id) ? { ...booking, status: "cancelled" } : booking,
      ),
      spots: prev.spots.map((spot) =>
        expired.some((booking) => booking.spotId === spot.id)
          ? { ...spot, status: "available" }
          : spot,
      ),
      activeBookingId: expiredIds.has(prev.activeBookingId ?? "")
        ? null
        : prev.activeBookingId,
      lockExpiresAt: expiredIds.has(prev.activeBookingId ?? "")
        ? null
        : prev.lockExpiresAt,
    }));
  },

  /* ── Selectors ────────────────────────────────────────────────────────── */
  selectedSpot: () => {
    const { spots, selectedSpotId } = get();
    return spots.find((spot) => spot.id === selectedSpotId) ?? null;
  },

  activeBooking: () => {
    const { bookings, activeBookingId } = get();
    return bookings.find((booking) => booking.id === activeBookingId) ?? null;
  },

  spotById: (spotId) => get().spots.find((spot) => spot.id === spotId),

  activeVehicle: () => {
    const { vehicles, vehicleId } = get();
    return vehicles.find((vehicle) => vehicle.id === vehicleId) ?? vehicles[1] ?? DEFAULT_VEHICLE;
  },

  quote: () => {
    const { hours, overstayMinutes } = get();
    const spot = get().selectedSpot();
    const rate = spot?.pricePerHour ?? 0;
    const base = computeBaseAmount(rate, hours);
    const breakdown = computeCheckoutBreakdown({
      baseAmount: base,
      hourlyRate: rate,
      overstayMultiplier: spot?.overstayMultiplier ?? 1.5,
      parkedMinutes: hours * 60 + overstayMinutes,
      bookedMinutes: hours * 60,
    });
    return {
      base,
      overstay: breakdown.overstayAmount,
      gross: breakdown.grossAmount,
      platformFee: breakdown.platformFee,
      providerEarnings: breakdown.providerEarnings,
    };
  },
}));

/** Prepend the settlement pair a checkout just produced to the local ledger. */
function buildLocalLedger(booking: Booking, ledger: LedgerEntry[]): LedgerEntry[] {
  const at = booking.actualCheckOut ?? new Date().toISOString();
  const gross = booking.baseAmount + booking.overstayAmount;
  return [
    {
      id: `${booking.id}_net`,
      label: booking.spotTitle,
      detail: "Session settled",
      amount: booking.providerEarnings,
      kind: "earning" as const,
      at,
    },
    {
      id: `${booking.id}_fee`,
      label: "Platform commission",
      detail: `15% of ₹${gross.toFixed(2)}`,
      amount: -booking.platformFee,
      kind: "commission" as const,
      at,
    },
    ...ledger,
  ];
}

/** Latest booking in a non-terminal state, if any. */
export function selectCurrentBooking(state: ParkPeerState): Booking | null {
  const byId =
    state.activeBookingId !== null
      ? state.bookings.find((booking) => booking.id === state.activeBookingId)
      : undefined;
  if (byId) return byId;
  return (
    state.bookings.find((booking) =>
      (["pending_lock", "reserved", "checked_in", "overstayed"] as BookingStatus[]).includes(
        booking.status,
      ),
    ) ?? null
  );
}

export type { ParkPeerState };
export { PLATFORM as PARKPEER_PLATFORM };
export type { VehicleKind };
