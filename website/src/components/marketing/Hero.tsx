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

/**
 * The 3D city is the page background rather than a card in the corner, so the
 * hero is the product: traffic drives past, a car parks itself, and you can
 * click any bay to claim it. The copy sits on a scrim for legibility.
 */
export default function Hero() {
  const [hovered, setHovered] = useState<BayInfo | null>(null);
  const [reserved, setReserved] = useState<BayInfo | null>(null);

  return (
    <section className="relative isolate flex min-h-[46rem] items-center overflow-hidden pt-32 pb-20 sm:min-h-[52rem] sm:pt-40 lg:min-h-[56rem]">
      {/* ── Full-bleed 3D city ─────────────────────────────────────────────── */}
      <SceneFrame
        className="absolute inset-0 -z-20"
        cameraPosition={[7, 6, 7]}
        fov={42}
        fog={["#04060c", 14, 34]}
        maxDpr={1.6}
      >
        <HeroCity onHover={setHovered} onSelect={setReserved} />
      </SceneFrame>

      {/* ── Scrims: keep the headline readable over the scene ──────────────── */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-[#04060c] via-[#04060c]/88 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#04060c] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#04060c] to-transparent" />
        <div className="grid-lines grid-lines-fade absolute inset-0 opacity-25" />
        <div className="absolute top-[-12rem] left-1/4 h-[34rem] w-[44rem] rounded-full bg-brand-500/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl animate-rise">
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
            <a href="#map" className="btn-ghost">
              See what&apos;s nearby
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

        {/* ── Live read-out for whatever bay is under the cursor ──────────── */}
        <div className="pointer-events-none mt-14 max-w-xl">
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
                  {reserved.label} · {formatCurrency(reserved.pricePerHour)}/hr
                  — payment pre-authorising
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
                Cars are parking in the scene behind you —{" "}
                <span className="text-mist-200">
                  hover a bay to inspect it, click it to lock it
                </span>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Floating accent chips */}
      <div className="glass animate-float absolute top-32 right-8 hidden rounded-2xl px-3.5 py-2.5 xl:block">
        <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">Lock TTL</p>
        <p className="text-sm font-semibold text-brand-300">
          {platformStats.lockTtlMinutes}m atomically held
        </p>
      </div>
      <div className="glass animate-float-slow absolute right-12 bottom-24 hidden rounded-2xl px-3.5 py-2.5 xl:block">
        <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">
          Check-in fence
        </p>
        <p className="text-sm font-semibold text-azure-300">
          ±{platformStats.geofenceMeters} m GPS
        </p>
      </div>
    </section>
  );
}
