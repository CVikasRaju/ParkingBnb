"use client";

import Link from "next/link";
import { useState } from "react";

import Icon from "@/components/marketing/Icon";
import SceneFrame from "@/components/three/SceneFrame";
import HeroCity, { type BayInfo } from "@/components/three/HeroCity";
import { platformStats } from "@/lib/data/demo";
import { formatCurrency } from "@/lib/format";

const STATS = [
  { label: "Cities live", value: String(platformStats.citiesLive) },
  { label: "Spots listed", value: `${(platformStats.spotsListed / 1000).toFixed(1)}k` },
  { label: "Avg. match", value: `${platformStats.avgMatchSeconds}s` },
  { label: "Hold window", value: `${platformStats.lockTtlMinutes} min` },
];

export default function Hero() {
  const [hovered, setHovered] = useState<BayInfo | null>(null);
  const [reserved, setReserved] = useState<BayInfo | null>(null);

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-lines grid-lines-fade absolute inset-0 opacity-40" />
        <div className="absolute top-[-14rem] left-1/2 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand-500/12 blur-[130px]" />
        <div className="absolute top-[8rem] right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-azure-500/14 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.02fr_1fr] lg:gap-10">
        {/* ── Copy ─────────────────────────────────────────────────────────── */}
        <div className="animate-rise">
          <span className="chip text-mist-300">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-brand-400" />
            Zero double-bookings, guaranteed by design
          </span>

          <h1 className="mt-6 text-[2.6rem] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-[4.1rem]">
            <span className="text-gradient-mist">Parking, found in</span>
            <br />
            <span className="text-gradient-brand">seconds — not laps.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-mist-300">
            ParkPeer turns empty driveways, garages and commercial bays into
            bookable parking. An atomic 10-minute hold keeps a spot yours while
            payment pre-authorises, and payouts settle to hosts automatically.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary">
              Reserve a spot
              <Icon name="arrow" size={18} />
            </Link>
            <a href="#lifecycle" className="btn-ghost">
              See the booking engine
            </a>
          </div>

          <dl className="mt-12 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dd className="text-2xl font-semibold tracking-tight text-mist-50">
                  {stat.value}
                </dd>
                <dt className="mt-1 text-[0.78rem] tracking-wide text-mist-400 uppercase">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>

        {/* ── 3D city ──────────────────────────────────────────────────────── */}
        <div className="relative">
          <div className="glass relative h-[26rem] overflow-hidden rounded-[1.75rem] sm:h-[32rem] lg:h-[38rem]">
            <div className="grid-lines absolute inset-0 opacity-25" />
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5">
              <span className="chip border-brand-500/30 bg-ink-900/80 text-brand-200">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                Live availability
              </span>
              <span className="hidden text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase sm:block">
                Drag-free · hover a bay
              </span>
            </div>

            <SceneFrame
              className="absolute inset-0"
              cameraPosition={[7, 6, 7]}
              fov={38}
              fog={["#04060c", 13, 30]}
              maxDpr={1.6}
            >
              <HeroCity onHover={setHovered} onSelect={setReserved} />
            </SceneFrame>

            {/* Interaction read-out */}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
              {reserved ? (
                <div className="glass-strong animate-rise flex items-center gap-3.5 rounded-2xl px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <Icon name="lock" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-mist-50">
                      Spot locked for {platformStats.lockTtlMinutes}:00
                    </p>
                    <p className="truncate text-xs text-mist-400">
                      {reserved.label} · {formatCurrency(reserved.pricePerHour)}/hr — payment
                      pre-authorising
                    </p>
                  </div>
                  <span className="ml-auto hidden shrink-0 text-xs font-medium text-brand-300 sm:block">
                    Reserved
                  </span>
                </div>
              ) : hovered ? (
                <div className="glass-strong flex items-center gap-3.5 rounded-2xl px-4 py-3.5">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      hovered.available
                        ? "bg-brand-500/15 text-brand-300"
                        : "bg-ink-700 text-mist-400"
                    }`}
                  >
                    <Icon name="pin" size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-mist-50">
                      {hovered.label}
                    </p>
                    <p className="truncate text-xs text-mist-400">
                      {formatCurrency(hovered.pricePerHour)}/hr ·{" "}
                      {hovered.available ? "available now" : "currently occupied"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="glass-strong flex items-center gap-3 rounded-2xl px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-mist-300">
                    <Icon name="car" size={19} />
                  </span>
                  <p className="text-xs leading-relaxed text-mist-400">
                    Hover a bay to inspect it, then{" "}
                    <span className="text-mist-200">click to watch a car park</span>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Floating accent chips around the canvas */}
          <div className="glass animate-float absolute -top-4 -left-4 hidden rounded-2xl px-3.5 py-2.5 lg:block">
            <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">Lock TTL</p>
            <p className="text-sm font-semibold text-brand-300">
              {platformStats.lockTtlMinutes}m atomically held
            </p>
          </div>
          <div className="glass animate-float-slow absolute -right-4 -bottom-5 hidden rounded-2xl px-3.5 py-2.5 lg:block">
            <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">Check-in fence</p>
            <p className="text-sm font-semibold text-azure-300">
              ±{platformStats.geofenceMeters} m GPS
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
