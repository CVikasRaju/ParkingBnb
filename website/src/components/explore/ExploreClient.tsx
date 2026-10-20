"use client";

/**
 * `/explore` — the 3D map and the four-phase booking engine.
 *
 * Server-rendered data arrives as props and is dropped into the store once on
 * mount; from then on the store is the single client-side source of truth and
 * Supabase Realtime keeps it honest. The map is code-split and never rendered on
 * the server, because MapLibre touches `window` at import time.
 *
 * One consequence worth knowing: the store hydrates in an effect, so the server
 * HTML and the first client paint show its *seed* state. That is harmless here
 * because the seed catalogue deliberately mirrors the live rows (`seed.ts`), but
 * it does mean anything that *labels* the data — the source chip, the warning
 * banner — reads from the server props rather than the store, so it is truthful
 * from the very first frame.
 */

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import BookingDrawer from "@/components/explore/BookingDrawer";
import HudBar, { DEFAULT_FILTERS, LEGEND, type ExploreFilters } from "@/components/explore/HudBar";
import { formatCurrency, formatDistance } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Booking, DataSource, LedgerEntry, Spot, SpotStatus, Vehicle } from "@/lib/types";
import { useParkPeerStore, type Viewer } from "@/store/useParkPeerStore";

const MapCanvas = dynamic(() => import("@/components/explore/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid-lines grid-lines-fade grid h-full w-full place-items-center bg-obsidian">
      <p className="mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">
        Booting MapLibre
      </p>
    </div>
  ),
});

export interface ExploreInitialData {
  spots: Spot[];
  vehicles: Vehicle[];
  bookings: Booking[];
  ledger: LedgerEntry[];
  source: DataSource;
  note: string | null;
  viewer: Viewer | null;
  center: { lat: number; lng: number };
}

export default function ExploreClient({ initial }: { initial: ExploreInitialData }) {
  const hydrate = useParkPeerStore((s) => s.hydrate);
  const spots = useParkPeerStore((s) => s.spots);
  const vehicles = useParkPeerStore((s) => s.vehicles);
  const selectedId = useParkPeerStore((s) => s.selectedSpotId);
  const selectSpot = useParkPeerStore((s) => s.selectSpot);
  const hoverSpot = useParkPeerStore((s) => s.hoverSpot);
  const sweepExpiredHolds = useParkPeerStore((s) => s.sweepExpiredHolds);

  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ── One-shot hydration ────────────────────────────────────────────────── */
  useEffect(() => {
    hydrate(initial);
  }, [hydrate, initial]);

  /* ── Expired holds, swept on mount ─────────────────────────────────────── */
  useEffect(() => {
    void sweepExpiredHolds();
  }, [sweepExpiredHolds]);

  /* ── Live bay state from Supabase Realtime ─────────────────────────────── */
  useEffect(() => {
    if (initial.source !== "supabase") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("parkpeer-spots")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parking_spots" },
        (payload) => {
          const row = payload.new as { id?: string; status?: SpotStatus };
          if (!row?.id || !row.status) return;
          useParkPeerStore.setState((state) => ({
            spots: state.spots.map((spot) =>
              spot.id === row.id ? { ...spot, status: row.status as SpotStatus } : spot,
            ),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.source]);

  /* ── Filters ───────────────────────────────────────────────────────────── */
  const visible = useMemo(() => {
    return spots.filter((spot) => {
      if (filters.maxPrice < 100 && spot.pricePerHour > filters.maxPrice) return false;
      if (filters.availableNow && spot.status !== "available") return false;
      if (filters.iotGate && !spot.hasIotBarrier) return false;
      if (filters.covered) {
        const covered = spot.features.some((f) => /covered|shade|lock/i.test(f));
        const indoors = spot.kind === "garage" || spot.kind === "basement";
        if (!covered && !indoors) return false;
      }
      if (filters.evCharger && !spot.features.some((f) => /ev/i.test(f))) return false;
      return true;
    });
  }, [spots, filters]);

  /* Keep the selection inside the filtered set so the drawer never lies. */
  useEffect(() => {
    if (visible.length === 0) return;
    if (!visible.some((spot) => spot.id === selectedId)) {
      selectSpot(visible[0].id);
    }
  }, [visible, selectedId, selectSpot]);

  const [mapCenter] = useState(initial.center);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-obsidian">
      <MapCanvas
        spots={visible}
        selectedId={selectedId}
        onSelect={(id) => {
          selectSpot(id);
          setDrawerOpen(true);
        }}
        onHover={hoverSpot}
        center={mapCenter}
      />

      <HudBar
        filters={filters}
        onFilters={setFilters}
        vehicles={vehicles}
        source={initial.source}
        note={initial.note}
        total={spots.length}
        shown={visible.length}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {/* Note banner when the live read fell back to the seed catalogue. */}
      {initial.note && (
        <p className="absolute top-36 left-1/2 z-30 max-w-lg -translate-x-1/2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          {initial.note}
        </p>
      )}

      {/* Desktop drawer */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-[420px] p-4 pt-32 lg:block xl:w-[460px]">
        <div className="pointer-events-auto h-full">
          <BookingDrawer />
        </div>
      </div>

      {/* Mobile sheet — Framer Motion owns the sheet's enter/exit so the map
          underneath never re-mounts while it animates. */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="absolute inset-0 z-40 lg:hidden">
            <motion.button
              type="button"
              aria-label="Close booking panel"
              onClick={() => setDrawerOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="glass-strong absolute inset-x-0 bottom-0 h-[85dvh] overflow-hidden rounded-t-3xl"
            >
              <BookingDrawer onClose={() => setDrawerOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legend + nearby strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3">
          <div className="glass pointer-events-auto flex flex-wrap items-center gap-4 rounded-xl px-4 py-2">
            {LEGEND.map((entry) => (
              <span key={entry.label} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`h-2 w-2 rounded-full ${entry.color}`} />
                {entry.label}
              </span>
            ))}
            <span className="mono ml-auto text-[10px] tracking-[0.18em] text-slate-500">
              PITCH 60° · {visible.length} LIVE PINS
            </span>
          </div>

          <ul className="pointer-events-auto flex gap-3 overflow-x-auto pb-1 lg:pl-[440px] xl:pl-[480px]">
            {visible.slice(0, 12).map((spot) => (
              <li key={spot.id} className="min-w-[240px]">
                <button
                  type="button"
                  onClick={() => {
                    selectSpot(spot.id);
                    setDrawerOpen(true);
                  }}
                  className={`panel w-full p-3 text-left transition hover:border-emerald-500/40 ${
                    spot.id === selectedId ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : ""
                  }`}
                >
                  <p className="truncate text-sm text-white">{spot.title}</p>
                  <p className="mono mt-1 text-[10px] text-slate-500">
                    {formatDistance(spot.distanceMeters)} · {spot.walkMinutes} min
                  </p>
                  <p className="mono mt-2 flex items-center justify-between text-xs">
                    <span
                      className={
                        spot.status === "available" ? "text-emerald-300" : "text-amber-300"
                      }
                    >
                      {spot.status === "available" ? "Available" : "Held"}
                    </span>
                    <span className="text-slate-200">{formatCurrency(spot.pricePerHour)}/hr</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
