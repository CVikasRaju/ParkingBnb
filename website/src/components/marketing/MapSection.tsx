"use client";

import { useState } from "react";

import ParkingMapLoader from "@/components/app/ParkingMapLoader";
import Icon from "@/components/marketing/Icon";
import { isDemoMode } from "@/lib/config";
import { spots } from "@/lib/data/demo";
import { formatCurrency } from "@/lib/format";

/**
 * Landing-page map.
 *
 * The map previously only existed behind the login, so the marketing site never
 * actually showed the product. This section puts the real Leaflet map (same
 * component the dashboard uses, so price pins and the radius circle can never
 * drift apart) on the home page, plus a clickable list that drives it.
 */
export default function MapSection() {
  const [selectedId, setSelectedId] = useState<string | null>(spots[0]?.id ?? null);
  const selected = spots.find((spot) => spot.id === selectedId) ?? null;

  return (
    <section id="map" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-[-10rem] h-[28rem] w-[28rem] rounded-full bg-azure-500/12 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl animate-rise">
            <span className="chip text-mist-300">
              <span className="h-1.5 w-1.5 animate-blink rounded-full bg-brand-400" />
              Live map · {spots.length} bays in this view
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              <span className="text-gradient-mist">Every empty driveway,</span>{" "}
              <span className="text-gradient-brand">on the map.</span>
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-mist-300">
              Drivers see real availability, real prices and the walk to their
              destination — not a list of addresses. Tap a bay to inspect it, then
              the 10-minute hold takes over while payment pre-authorises.
            </p>
          </div>

          <div className="glass animate-rise rounded-2xl px-4 py-3">
            <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">
              Data source
            </p>
            <p className="mt-1 text-sm font-semibold text-mist-100">
              {isDemoMode ? "Demo inventory" : "Live Supabase inventory"}
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ── The map itself ─────────────────────────────────────────────── */}
          <div className="glass relative h-[26rem] overflow-hidden rounded-[1.75rem] sm:h-[32rem] lg:h-[38rem]">
            <ParkingMapLoader
              spots={spots}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            {/* Read-out for the selected bay */}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[400]">
              {selected ? (
                <div className="glass-strong animate-rise flex items-center gap-3.5 rounded-2xl px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <Icon name="pin" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-mist-50">
                      {selected.title}
                    </p>
                    <p className="truncate text-xs text-mist-400">
                      {formatCurrency(selected.pricePerHour)}/hr · {selected.area} ·{" "}
                      {selected.distanceMeters} m · {selected.walkMinutes} min walk
                    </p>
                  </div>
                  <span className="ml-auto hidden shrink-0 text-xs font-medium text-brand-300 sm:block">
                    {selected.available ? "Available" : "Occupied"}
                  </span>
                </div>
              ) : (
                <div className="glass-strong rounded-2xl px-4 py-3.5">
                  <p className="text-xs text-mist-400">
                    Pick a bay to see its price, distance and walk time.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Clickable list that drives the map ─────────────────────────── */}
          <div className="glass rounded-[1.75rem] p-4">
            <p className="px-1 text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase">
              Nearest to you
            </p>
            <ul className="mt-3 space-y-2">
              {spots.map((spot) => {
                const active = spot.id === selectedId;
                return (
                  <li key={spot.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(spot.id)}
                      aria-pressed={active}
                      className={`w-full rounded-xl border p-3 text-left transition-all ${
                        active
                          ? "border-brand-400/70 bg-brand-500/10"
                          : "border-ink-600/80 bg-ink-900/60 hover:border-ink-500"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`text-[0.82rem] font-medium ${
                            active ? "text-brand-200" : "text-mist-200"
                          }`}
                        >
                          {spot.title}
                        </span>
                        <span className="shrink-0 text-[0.82rem] font-semibold text-mist-50">
                          {formatCurrency(spot.pricePerHour)}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.7rem] text-mist-500">
                        {spot.distanceMeters} m · {spot.walkMinutes} min walk ·{" "}
                        {spot.rating}★ ({spot.reviews})
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
