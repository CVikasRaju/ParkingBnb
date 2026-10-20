"use client";

/**
 * `/provider` — the host console.
 *
 * Five things a host actually does, in the order they do them: shape the bay,
 * price it, watch arrivals, verify one at the gate, and read the payout ledger.
 * Every mutation is a server action; the list below is refreshed from the server
 * via `revalidatePath`, so what is on screen is what is in the database.
 */

import { useState, useTransition } from "react";

import SceneFrame from "@/components/three/SceneFrame";
import { BAY_KINDS, SlotPreview } from "@/components/three/TelemetryCity";
import { hostVerifyArrival } from "@/lib/actions/admin";
import { setSpotStatus, updateSpotRate } from "@/lib/actions/bookings";
import { formatCurrency, formatCurrencyPrecise, formatDateTime, formatMinutes } from "@/lib/format";
import type { HostConsole } from "@/lib/data/console";
import { bookingStatusMeta } from "@/lib/format";
import type { SpotKind } from "@/lib/types";
import { useNow } from "@/lib/useNow";

export default function ProviderStudio({
  initial,
  provider,
}: {
  initial: HostConsole;
  provider: { id: string; name: string; email: string };
}) {
  const [selectedId, setSelectedId] = useState(initial.listings[0]?.spot.id ?? null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const [pin, setPin] = useState("");
  const [passPayload, setPassPayload] = useState("");

  const selected = initial.listings.find((listing) => listing.spot.id === selectedId);
  const [rate, setRate] = useState(selected?.spot.pricePerHour ?? 50);
  const [kind, setKind] = useState<SpotKind>(selected?.spot.kind ?? "driveway");

  useNow(); // keeps relative times in this table fresh

  function pick(spotId: string) {
    setSelectedId(spotId);
    const listing = initial.listings.find((item) => item.spot.id === spotId);
    if (listing) {
      setRate(listing.spot.pricePerHour);
      setKind(listing.spot.kind);
    }
  }

  function commitRate() {
    if (!selected) return;
    startTransition(async () => {
      const result = await updateSpotRate(selected.spot.id, rate);
      setMessage(
        result.ok
          ? { tone: "ok", text: `Rate updated to ${formatCurrency(rate)}/hr.` }
          : { tone: "bad", text: result.error },
      );
    });
  }

  function toggleListing(spotId: string, next: "available" | "inactive") {
    startTransition(async () => {
      const result = await setSpotStatus(spotId, next);
      setMessage(
        result.ok
          ? { tone: "ok", text: next === "available" ? "Bay re-listed." : "Bay paused." }
          : { tone: "bad", text: result.error },
      );
    });
  }

  function verify() {
    startTransition(async () => {
      const result = await hostVerifyArrival({
        pin: pin || undefined,
        qrPayload: passPayload || undefined,
      });
      if (result.ok) {
        setPin("");
        setPassPayload("");
        setMessage({ tone: "ok", text: "Arrival verified — the session has started." });
      } else {
        setMessage({ tone: "bad", text: result.error });
      }
    });
  }

  const live = initial.listings.filter((listing) => listing.spot.status === "available").length;
  const earned = initial.listings.reduce((sum, listing) => sum + listing.earnedThisMonth, 0);

  return (
    <div className="min-h-[100dvh] bg-obsidian pb-16">
      <div className="mx-auto max-w-[1500px] px-5 pt-28 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono text-[10px] tracking-[0.28em] text-emerald-400 uppercase">
              Host console
            </p>
            <h1 className="display mt-1 text-3xl text-white sm:text-4xl">{provider.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{provider.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat label="Bays live" value={`${live}/${initial.listings.length}`} />
            <Stat label="Earned · 30d" value={formatCurrency(earned)} />
            <Stat
              label="Data"
              value={initial.live ? "Supabase live" : "Seed catalogue"}
              tone={initial.live ? "text-emerald-300" : "text-amber-300"}
            />
          </div>
        </header>

        {initial.note && (
          <p className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
            {initial.note}
          </p>
        )}
        {message && (
          <p
            className={`mt-5 rounded-xl border px-4 py-2 text-xs ${
              message.tone === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/40 bg-red-500/10 text-red-200"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
          {/* ── 3D slot configurator ─────────────────────────────────────── */}
          <section className="panel overflow-hidden">
            <div className="border-b border-white/10 p-5">
              <h2 className="display text-lg text-white">Slot preview</h2>
              <p className="mt-1 text-xs text-slate-500">
                Shape the bay and price it. The render updates before anything is saved.
              </p>
            </div>

            <SceneFrame
              className="h-64 w-full border-b border-white/10"
              cameraPosition={[5.5, 4.4, 6.5]}
              fov={38}
              maxDpr={1.5}
              fallback={<div className="shimmer h-64 w-full" />}
            >
              <SlotPreview kind={kind} hourlyRate={rate} gated={selected?.spot.hasIotBarrier ?? false} />
            </SceneFrame>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2">
                {BAY_KINDS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setKind(option.key)}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                      kind === option.key
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <span
                      className={`block text-xs font-semibold ${
                        kind === option.key ? "text-emerald-300" : "text-slate-300"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                      {option.blurb}
                    </span>
                  </button>
                ))}
              </div>

              <div>
                <label className="flex items-center justify-between text-sm text-slate-300">
                  <span>Hourly rate</span>
                  <span className="mono text-emerald-300">{formatCurrency(rate)}/hr</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="mt-2 w-full accent-emerald-400"
                />
                <div className="mt-3 flex items-center justify-between">
                  <p className="mono text-[10px] text-slate-500">
                    {rate <= 40
                      ? "Priced to fill · ~"
                      : rate >= 150
                        ? "Premium · ~"
                        : "Market rate · ~"}
                    {formatCurrency(Math.round(rate * 141.7))} / 30d
                  </p>
                  <button
                    type="button"
                    onClick={commitRate}
                    disabled={pending || !selected}
                    className="btn btn-ghost !px-3 !py-2 text-xs"
                  >
                    {pending ? "Saving…" : "Save rate"}
                  </button>
                </div>
              </div>

              <p className="mono text-[10px] text-slate-500">
                Bay type is a preview control — the stored listing keeps its own class. Rate
                changes write straight to `parking_spots.hourly_rate`.
              </p>
            </div>
          </section>

          {/* ── Listings ─────────────────────────────────────────────────── */}
          <section className="space-y-6">
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 p-5">
                <h2 className="display text-lg text-white">Your bays</h2>
                <span className="chip border-white/15 text-slate-400">
                  {initial.listings.length} listed
                </span>
              </div>

              {initial.listings.length === 0 ? (
                <p className="p-5 text-sm text-slate-400">{initial.note}</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {initial.listings.map((listing) => (
                    <li
                      key={listing.spot.id}
                      className={`flex flex-wrap items-center gap-4 p-4 transition ${
                        listing.spot.id === selectedId ? "bg-emerald-500/[0.06]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => pick(listing.spot.id)}
                        className="min-w-[200px] flex-1 text-left"
                      >
                        <span className="block text-sm text-white">{listing.spot.title}</span>
                        <span className="mono mt-1 block text-[10px] text-slate-500">
                          {listing.spot.area} · {formatCurrency(listing.spot.pricePerHour)}/hr ·{" "}
                          {listing.utilisation}% utilised
                        </span>
                      </button>

                      <span className="mono text-right text-xs text-slate-400">
                        {formatCurrency(listing.earnedThisMonth)}
                        <span className="block text-[10px] text-slate-600">30d</span>
                      </span>

                      <span
                        className={`chip ${
                          listing.spot.status === "available"
                            ? "border-emerald-500/40 text-emerald-300"
                            : listing.spot.status === "locked"
                              ? "border-amber-500/40 text-amber-300"
                              : "border-white/15 text-slate-400"
                        }`}
                      >
                        {listing.spot.status}
                      </span>

                      <button
                        type="button"
                        disabled={pending || listing.spot.status === "locked"}
                        onClick={() =>
                          toggleListing(
                            listing.spot.id,
                            listing.spot.status === "available" ? "inactive" : "available",
                          )
                        }
                        className="btn btn-ghost !px-3 !py-2 text-[11px]"
                      >
                        {listing.spot.status === "available" ? "Pause" : "Re-list"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* ── Arrivals + verifier ─────────────────────────────────── */}
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 p-5">
                  <h2 className="display text-lg text-white">Incoming radar</h2>
                  <span className="relative grid h-8 w-8 place-items-center">
                    <span className="absolute inset-0 animate-radar rounded-full border border-cyan-400/40 [background:conic-gradient(from_0deg,rgba(6,182,212,0.35),transparent_45%)]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  </span>
                </div>

                <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
                  {initial.arrivals.length === 0 && (
                    <li className="p-5 text-sm text-slate-500">
                      No car is on its way right now. Reserved bays appear here with their
                      plate.
                    </li>
                  )}
                  {initial.arrivals.map((arrival) => {
                    const meta = bookingStatusMeta[arrival.status];
                    return (
                      <li key={arrival.id} className="flex items-center gap-4 p-4">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">{arrival.spotTitle}</p>
                          <p className="mono mt-1 text-[10px] text-slate-500">
                            {arrival.plate} · {formatDateTime(arrival.startsAt)}
                          </p>
                        </div>
                        <span className={`chip ${meta.tone}`}>{meta.label}</span>
                      </li>
                    );
                  })}
                </ul>

                <div className="space-y-3 border-t border-white/10 p-5">
                  <p className="mono text-[10px] tracking-[0.2em] text-slate-500 uppercase">
                    Verify an arrival
                  </p>
                  <input
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    inputMode="numeric"
                    placeholder="4-digit PIN"
                    className="mono field text-center tracking-[0.4em]"
                    aria-label="Driver PIN"
                  />
                  <input
                    value={passPayload}
                    onChange={(event) => setPassPayload(event.target.value)}
                    placeholder="…or paste the scanned pass payload"
                    className="mono field text-xs"
                    aria-label="Scanned pass payload"
                  />
                  <button
                    type="button"
                    onClick={verify}
                    disabled={pending || (!pin && !passPayload)}
                    className="btn btn-primary w-full"
                  >
                    {pending ? "Verifying…" : "Verify & start session"}
                  </button>
                </div>
              </div>

              {/* ── Wallet ──────────────────────────────────────────────── */}
              <div className="panel overflow-hidden">
                <div className="border-b border-white/10 p-5">
                  <h2 className="display text-lg text-white">Payout ledger</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Escrow splits settle here: 85% host, 15% platform.
                  </p>
                </div>
                <ul className="max-h-[26rem] divide-y divide-white/5 overflow-y-auto">
                  {initial.ledger.length === 0 && (
                    <li className="p-5 text-sm text-slate-500">
                      No settlements yet. The first completed session appears here within
                      seconds of checkout.
                    </li>
                  )}
                  {initial.ledger.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{entry.label}</p>
                        <p className="mono mt-1 text-[10px] text-slate-500">
                          {entry.detail} · {formatDateTime(entry.at)}
                        </p>
                      </div>
                      <span
                        className={`mono text-sm ${
                          entry.amount >= 0 ? "text-emerald-300" : "text-slate-400"
                        }`}
                      >
                        {entry.amount >= 0 ? "+" : "−"}
                        {formatCurrencyPrecise(Math.abs(entry.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 p-5">
                  <p className="mono text-[10px] text-slate-500">
                    Sessions this month: {initial.listings.reduce(
                      (sum, listing) => sum + Math.round((listing.utilisation / 100) * 30),
                      0,
                    )}{" "}
                    · avg{" "}
                    {formatMinutes(
                      initial.listings.length
                        ? (initial.listings.reduce((s, l) => s + l.utilisation, 0) /
                            initial.listings.length) *
                            4.3
                        : 0,
                    )}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="panel px-4 py-3">
      <p className="mono text-[9px] tracking-[0.2em] text-slate-500 uppercase">{label}</p>
      <p className={`mono mt-1 text-sm ${tone}`}>{value}</p>
    </div>
  );
}
