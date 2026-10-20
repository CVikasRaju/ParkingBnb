"use client";

/**
 * `/admin` — the operator god-view.
 *
 * Built around one question: *what is stuck?* The 3D city puts every listed bay
 * on a ring, column height encodes how long a hold has been alive, and the two
 * lists below are the only things an operator can act on — a stranded lock and
 * an unresolved dispute.
 */

import Link from "next/link";
import { useState, useTransition } from "react";

import SceneFrame from "@/components/three/SceneFrame";
import { TelemetryCity } from "@/components/three/TelemetryCity";
import { resolveDispute, type DisputeAction } from "@/lib/actions/admin";
import { forceReleaseLock } from "@/lib/actions/bookings";
import type { AdminOverview } from "@/lib/data/console";
import { bookingStatusMeta } from "@/lib/format";
import { formatCurrency, formatCurrencyPrecise, formatDateTime } from "@/lib/format";
import { LOCK_TTL_MS, PLATFORM } from "@/lib/types";
import { useNow } from "@/lib/useNow";

export default function AdminGodView({ initial }: { initial: AdminOverview }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const now = useNow();

  const { totals } = initial;
  const commission = totals.grossSettled
    ? totals.platformRevenue / totals.grossSettled
    : PLATFORM.commissionRate;

  function release(bookingId: string) {
    startTransition(async () => {
      const result = await forceReleaseLock(bookingId);
      setMessage(
        result.ok
          ? { tone: "ok", text: "Lock force-released; the bay is back on the map." }
          : { tone: "bad", text: result.error },
      );
    });
  }

  function resolve(disputeId: string, action: DisputeAction) {
    startTransition(async () => {
      const result = await resolveDispute({ disputeId, action });
      setMessage(
        result.ok
          ? {
              tone: "ok",
              text:
                action === "refund"
                  ? "Refund issued and the booking released."
                  : action === "maintenance"
                    ? "Bay pulled off the map for maintenance."
                    : "Case dismissed.",
            }
          : { tone: "bad", text: result.error },
      );
    });
  }

  return (
    <div className="relative min-h-[100dvh] bg-obsidian">
      {/* 3D telemetry backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SceneFrame
          className="absolute inset-0"
          alwaysOn
          cameraPosition={[0, 26, 24]}
          fov={42}
          maxDpr={1.5}
          fallback={<div className="telemetry-grid absolute inset-0 bg-obsidian" />}
        >
          <TelemetryCity
            spots={initial.spots}
            locks={initial.locks.map((lock) => ({
              spotId: lock.spotId,
              status: lock.status,
              ageMinutes: lockAgeMinutes(lock.createdAt, now),
            }))}
          />
        </SceneFrame>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-obsidian/80 via-obsidian/50 to-obsidian" />

      <div className="relative z-20 mx-auto max-w-[1500px] px-5 pt-28 pb-16 sm:px-8">
        {/* Navigation tabs */}
        <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
          <Link
            href="/admin"
            className="rounded-lg bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 ring-1 ring-red-500/30"
          >
            🛰️ God-View
          </Link>
          <Link
            href="/admin/disputes"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            ⚖️ Disputes
          </Link>
          <Link
            href="/admin/locks"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            🔒 Redis Lock Inspector
          </Link>
          <Link
            href="/admin/analytics"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            📊 Platform Analytics
          </Link>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono text-[10px] tracking-[0.28em] text-red-400 uppercase">
              Operator god-view
            </p>
            <h1 className="display mt-1 text-3xl text-white sm:text-4xl">
              Platform telemetry
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Live Redis-style holds, dispute desk and commission analytics.
            </p>
          </div>
          <span
            className={`chip ${
              initial.live
                ? "border-emerald-500/40 text-emerald-300"
                : "border-amber-500/40 text-amber-300"
            }`}
          >
            {initial.live ? "Supabase live" : "Seed catalogue"}
          </span>
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

        {/* ── Telemetry tiles ───────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Tile label="Listed bays" value={String(totals.listedBays)} />
          <Tile
            label="Active holds"
            value={String(totals.activeLocks)}
            tone={totals.activeLocks > 0 ? "text-amber-300" : "text-white"}
          />
          <Tile
            label="Open disputes"
            value={String(totals.openDisputes)}
            tone={totals.openDisputes > 0 ? "text-red-300" : "text-white"}
          />
          <Tile label="Gross settled" value={formatCurrency(totals.grossSettled)} />
          <Tile
            label="Platform revenue"
            value={formatCurrencyPrecise(totals.platformRevenue)}
            tone="text-emerald-300"
          />
          <Tile
            label="Host payouts"
            value={formatCurrencyPrecise(totals.providerPayouts)}
            tone="text-cyan-300"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          {/* ── Locks ───────────────────────────────────────────────────── */}
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="display text-lg text-white">Active locks & sessions</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Hold TTL {PLATFORM.lockTtlSeconds / 60} minutes. A hold past its window is
                  strandable — release it.
                </p>
              </div>
              <span className="mono text-[10px] tracking-[0.18em] text-slate-500">
                {initial.locks.length} rows
              </span>
            </div>

            {initial.locks.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                Nothing is held and no session is running. The map is fully available.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {initial.locks.map((lock) => {
                  const ageMinutes = lockAgeMinutes(lock.createdAt, now);
                  const stranded =
                    lock.status === "pending_lock" && ageMinutes * 60_000 > LOCK_TTL_MS;
                  const meta = bookingStatusMeta[lock.status];
                  return (
                    <li key={lock.bookingId} className="flex flex-wrap items-center gap-4 p-4">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                      <div className="min-w-[180px] flex-1">
                        <p className="truncate text-sm text-white">{lock.spotTitle}</p>
                        <p className="mono mt-1 text-[10px] text-slate-500">
                          {lock.plate} · host {lock.hostName}
                        </p>
                      </div>
                      <span className="mono text-[10px] text-slate-400">
                        {now === 0 ? "—" : `${ageMinutes}m${stranded ? " ⚠" : ""}`}
                      </span>
                      <span className={`chip ${meta.tone}`}>{meta.label}</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => release(lock.bookingId)}
                        className="btn btn-danger !px-3 !py-2 text-[11px]"
                      >
                        Force release
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Disputes + analytics ────────────────────────────────────── */}
          <div className="space-y-6">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 p-5">
                <h2 className="display text-lg text-white">Dispute desk</h2>
                <span className="mono text-[10px] tracking-[0.18em] text-slate-500">
                  {initial.disputes.filter((d) => !d.resolved).length} open
                </span>
              </div>

              {initial.disputes.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">
                  No reports filed. Blocked-bay reports from the app land here.
                </p>
              ) : (
                <ul className="max-h-[24rem] divide-y divide-white/5 overflow-y-auto">
                  {initial.disputes.map((dispute) => (
                    <li key={dispute.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white">{dispute.reason}</p>
                          <p className="mt-1 text-xs text-slate-400">{dispute.description}</p>
                          <p className="mono mt-2 text-[10px] text-slate-500">
                            {dispute.reporterEmail} · {formatDateTime(dispute.at)} · booking{" "}
                            {dispute.bookingId.slice(0, 8)}
                          </p>
                        </div>
                        <span
                          className={`chip ${
                            dispute.resolved
                              ? "border-white/15 text-slate-400"
                              : "border-red-500/40 text-red-300"
                          }`}
                        >
                          {dispute.resolved ? "resolved" : "open"}
                        </span>
                      </div>

                      {!dispute.resolved && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => resolve(dispute.id, "refund")}
                            className="btn btn-primary !px-3 !py-2 text-[11px]"
                          >
                            Refund driver
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => resolve(dispute.id, "maintenance")}
                            className="btn btn-amber !px-3 !py-2 text-[11px]"
                          >
                            Pull bay
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => resolve(dispute.id, "dismiss")}
                            className="btn btn-ghost !px-3 !py-2 text-[11px]"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="display text-lg text-white">Commission analytics</h2>
              <p className="mt-1 text-xs text-slate-500">
                Split across every settled session in `settlement_ledger`.
              </p>

              <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full bg-emerald-400"
                  style={{ width: `${(1 - commission) * 100}%` }}
                />
                <span
                  className="block h-full bg-amber-400"
                  style={{ width: `${commission * 100}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Hosts · {formatCurrencyPrecise(totals.providerPayouts)}
                </span>
                <span className="text-amber-300">
                  Platform · {formatCurrencyPrecise(totals.platformRevenue)} (
                  {(commission * 100).toFixed(1)}%)
                </span>
              </div>

              <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
                <Row label="Escrow held" value={formatCurrency(totals.grossSettled)} />
                <Row
                  label="Overstay grace"
                  value={`${PLATFORM.overstayGraceMinutes} min · ${PLATFORM.commissionRate * 100}% split`}
                />
                <Row
                  label="Lock TTL"
                  value={`${PLATFORM.lockTtlSeconds / 60} min · geofence ${PLATFORM.geofenceMeters} m`}
                />
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whole minutes a booking has been open. `now === 0` means the clock has not started. */
function lockAgeMinutes(createdAt: string, now: number): number {
  if (now === 0) return 0;
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
}

function Tile({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="mono text-[9px] tracking-[0.2em] text-slate-500 uppercase">{label}</p>
      <p className={`mono mt-1.5 text-lg ${tone}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="mono text-slate-200">{value}</dd>
    </div>
  );
}
