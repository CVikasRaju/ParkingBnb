"use client";

/**
 * The booking drawer: the whole four-phase transaction, left of the map.
 *
 * Each phase is gated by the store's current FSM state rather than by a local
 * `step` counter, so the UI can never drift out of sync with the booking it is
 * describing — including when the same booking is changed from another tab via
 * Supabase Realtime.
 */

import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

import SpotVisualizer, { computeFit } from "@/components/three/SpotVisualizer";
import { formatClock, formatCurrency, formatCurrencyPrecise, formatDistance, formatLongClock } from "@/lib/format";
import { insideGeofence, type LatLng } from "@/lib/geo";
import { useDeadline, useElapsed } from "@/lib/useNow";
import { useParkPeerStore } from "@/store/useParkPeerStore";
import { useShallow } from "zustand/react/shallow";
import { PLATFORM, type VerificationMode } from "@/lib/types";

const PHASES = [
  { key: "pending_lock", label: "Lock" },
  { key: "reserved", label: "Handshake" },
  { key: "checked_in", label: "Arrival" },
  { key: "completed", label: "Settle" },
] as const;

function phaseIndex(status: string | undefined): number {
  switch (status) {
    case "pending_lock":
      return 0;
    case "reserved":
      return 1;
    case "checked_in":
    case "overstayed":
      return 2;
    default:
      return 3;
  }
}

export default function BookingDrawer({ onClose }: { onClose?: () => void }) {
  const spot = useParkPeerStore((s) => s.selectedSpot());
  const vehicle = useParkPeerStore((s) => s.activeVehicle());
  const hours = useParkPeerStore((s) => s.hours);
  const setHours = useParkPeerStore((s) => s.setHours);
  /* `quote()` builds a fresh breakdown object every call. Subscribing to it
     directly hands useSyncExternalStore a new snapshot on every store read,
     which re-renders forever (React #185), so compare it field by field. */
  const quote = useParkPeerStore(useShallow((s) => s.quote()));
  const booking = useParkPeerStore((s) => s.activeBooking());
  const lockExpiresAt = useParkPeerStore((s) => s.lockExpiresAt);
  const overstayMinutes = useParkPeerStore((s) => s.overstayMinutes);
  const setOverstayMinutes = useParkPeerStore((s) => s.setOverstayMinutes);
  const busy = useParkPeerStore((s) => s.busy);
  const error = useParkPeerStore((s) => s.error);
  const notice = useParkPeerStore((s) => s.notice);
  const persistence = useParkPeerStore((s) => s.persistence);
  const viewer = useParkPeerStore((s) => s.viewer);
  const source = useParkPeerStore((s) => s.source);

  const lock = useParkPeerStore((s) => s.lock);
  const confirm = useParkPeerStore((s) => s.confirm);
  const verify = useParkPeerStore((s) => s.verify);
  const endSession = useParkPeerStore((s) => s.endSession);
  const cancel = useParkPeerStore((s) => s.cancel);
  const clearMessages = useParkPeerStore((s) => s.clearMessages);

  const deadline = useDeadline(booking?.status === "pending_lock" ? lockExpiresAt : null);
  const elapsed = useElapsed(
    booking && (booking.status === "checked_in" || booking.status === "overstayed")
      ? (booking.actualCheckIn ?? booking.startsAt)
      : null,
  );

  const fit = spot ? computeFit(spot, vehicle) : null;
  const phase = booking ? phaseIndex(booking.status) : -1;

  const nearestMapsLink = useMemo(() => {
    if (!spot) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${spot.lat},${spot.lng}`,
    )}&travelmode=driving`;
  }, [spot]);

  if (!spot) {
    return (
      <aside className="panel flex h-full w-full flex-col items-center justify-center p-8 text-center">
        <p className="mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">
          No bay selected
        </p>
        <p className="mt-3 max-w-xs text-sm text-slate-400">
          Pick a glowing pin on the map to inspect it and start a booking.
        </p>
      </aside>
    );
  }

  return (
    <aside className="panel flex h-full w-full flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="border-b border-white/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono text-[10px] tracking-[0.26em] text-emerald-400 uppercase">
              {spot.area}
            </p>
            <h2 className="display mt-1 text-xl leading-tight text-white">{spot.title}</h2>
            <p className="mt-1 text-xs text-slate-400">
              Hosted by {spot.hostName} · {spot.rating.toFixed(1)}★ ({spot.reviews})
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white lg:hidden"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip border-white/15 text-slate-300">{spot.kind}</span>
          <span className="chip border-white/15 text-slate-300">Capacity {spot.capacity}</span>
          {spot.hasIotBarrier && (
            <span className="chip border-cyan-500/40 text-cyan-300">IoT gate</span>
          )}
          {spot.features.slice(0, 3).map((feature) => (
            <span key={feature} className="chip border-white/10 text-slate-400">
              {feature}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-end justify-between">
          <p className="mono text-2xl text-white">
            {formatCurrency(spot.pricePerHour)}
            <span className="text-xs text-slate-500">/hr</span>
          </p>
          <p className="mono text-[10px] text-slate-500">
            {formatDistance(spot.distanceMeters)} · {spot.walkMinutes} min walk
          </p>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </p>
        )}

        <SpotVisualizer spot={spot} vehicle={vehicle} />

        {fit && !fit.fits && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Your {vehicle.label.toLowerCase()} is{" "}
            {fit.lengthSlack < 0
              ? `${Math.abs(fit.lengthSlack).toFixed(2)} m too long`
              : fit.widthSlack < 0
                ? `${Math.abs(fit.widthSlack).toFixed(2)} m too wide`
                : `${Math.abs(fit.heightSlack).toFixed(2)} m too tall`}{" "}
            for this bay. Park at your own risk.
          </p>
        )}

        {/* Phase rail */}
        <ol className="flex items-center gap-1.5">
          {PHASES.map((item, index) => {
            const done = phase >= index;
            return (
              <li key={item.key} className="flex-1">
                <span
                  className={`block h-1 rounded-full ${
                    done ? "bg-emerald-400" : "bg-white/10"
                  }`}
                />
                <span
                  className={`mono mt-1.5 block text-[9px] tracking-[0.14em] uppercase ${
                    done ? "text-emerald-300" : "text-slate-600"
                  }`}
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* ── Phase 1 · Lock ─────────────────────────────────────────────── */}
        {!booking && (
          <section className="space-y-4">
            <div>
              <label className="flex items-center justify-between text-sm text-slate-300">
                <span>Duration</span>
                <span className="mono text-emerald-300">{hours}h</span>
              </label>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
                className="mt-2 w-full accent-emerald-400"
              />
            </div>

            <dl className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <Line label={`Base · ${hours}h × ${formatCurrency(spot.pricePerHour)}`} value={formatCurrencyPrecise(quote.base)} />
              <Line label="Escrow hold" value={formatCurrencyPrecise(quote.gross)} />
              <Line label="Host payout (85%)" value={formatCurrencyPrecise(quote.providerEarnings)} tone="text-emerald-300" />
              <Line label="Platform (15%)" value={formatCurrencyPrecise(quote.platformFee)} tone="text-amber-300" />
            </dl>

            <button
              type="button"
              disabled={busy || spot.status !== "available"}
              onClick={() => void lock()}
              className="btn btn-primary w-full"
            >
              {spot.status === "available"
                ? `Lock bay for ${PLATFORM.lockTtlSeconds / 60} mins & authorise payment`
                : "Bay currently held"}
            </button>

            <p className="text-center text-[11px] text-slate-500">
              {viewer
                ? "Writes a real booking to Supabase and holds the bay for everyone."
                : source === "supabase"
                  ? "Explore as a guest. Sign in before locking to keep the booking."
                  : "Supabase is not configured — this booking runs locally."}
            </p>
          </section>
        )}

        {/* ── Phase 2 · Hold + handshake ─────────────────────────────────── */}
        {booking && (booking.status === "pending_lock" || booking.status === "reserved") && (
          <section className="space-y-4">
            {booking.status === "pending_lock" && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="mono text-[10px] tracking-[0.24em] text-amber-300 uppercase">
                  Hold expires in
                </p>
                <p className="mono mt-1 text-4xl text-amber-200">
                  {deadline === null ? "--:--" : formatClock(deadline / 1000)}
                </p>
                <p className="mt-2 text-xs text-amber-200/80">
                  The bay is amber for every other driver right now.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <p className="mono text-[10px] tracking-[0.22em] text-slate-500 uppercase">
                Access
              </p>
              <p className="text-slate-300">{spot.address}</p>
              <p className="text-xs text-slate-500">
                Gate code unlocks once the host confirms — the API releases it to a
                booked driver only.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="chip border-cyan-500/40 text-cyan-300">Host notified</span>
                <span className="chip border-emerald-500/40 text-emerald-300">
                  {booking.plate}
                </span>
                <span className="chip border-white/15 text-slate-300">
                  {persistence === "supabase" ? "Supabase row" : "Local hold"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {booking.status === "pending_lock" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirm()}
                    className="btn btn-primary flex-1"
                  >
                    Authorise escrow
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel()}
                    className="btn btn-ghost"
                  >
                    Release
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={nearestMapsLink ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary flex-1"
                  >
                    Launch turn-by-turn
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel()}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── Phase 3 · Arrival ──────────────────────────────────────────── */}
        {booking && booking.status === "reserved" && (
          /* Keyed on the booking so a new hold starts from a clean PIN, gate and
             geofence state without a reset effect. */
          <ArrivalPanel
            key={booking.id}
            bookingId={booking.id}
            qrSecret={booking.qrSecret}
            spotLat={spot.lat}
            spotLng={spot.lng}
            verify={verify}
          />
        )}

        {/* ── Phase 4 · Session ──────────────────────────────────────────── */}
        {booking && (booking.status === "checked_in" || booking.status === "overstayed") && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="mono text-[10px] tracking-[0.24em] text-emerald-300 uppercase">
                Session running
              </p>
              <p className="mono mt-1 text-4xl text-emerald-200">
                {elapsed === null ? "--:--:--" : formatLongClock(elapsed)}
              </p>
              <p className="mt-2 text-xs text-emerald-200/80">
                Verified via {booking.verifiedVia?.replace("_", " ") ?? "qr code"} · bills on
                checkout
              </p>
            </div>

            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="text-sm text-slate-300">
                Fast-forward overstay
                <span className="mono ml-2 text-xs text-amber-300">+{overstayMinutes}m</span>
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setOverstayMinutes(overstayMinutes + 30)}
                  className="rounded-lg border border-amber-500/40 px-3 py-1 text-xs text-amber-300"
                >
                  +30m
                </button>
                <button
                  type="button"
                  onClick={() => setOverstayMinutes(0)}
                  className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400"
                >
                  Reset
                </button>
              </span>
            </label>

            <p className="text-xs text-slate-500">
              Penalty is{" "}
              <span className="mono text-amber-300">
                ceil(minutes / 60) × rate × {spot.overstayMultiplier}×
              </span>{" "}
              after a {PLATFORM.overstayGraceMinutes}-minute grace window. Current overstay
              charge: <span className="mono text-amber-300">{formatCurrencyPrecise(quote.overstay)}</span>
            </p>

            <button
              type="button"
              disabled={busy}
              onClick={() => void endSession()}
              className="btn btn-primary w-full"
            >
              End session & release escrow
            </button>
          </section>
        )}

        {/* ── Settlement receipt ─────────────────────────────────────────── */}
        {booking && (booking.status === "completed" || booking.status === "cancelled") && (
          <Receipt bookingId={booking.id} />
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        <button
          type="button"
          onClick={clearMessages}
          className="mono text-[10px] tracking-[0.2em] text-slate-500 uppercase hover:text-slate-300"
        >
          Clear messages
        </button>
      </div>
    </aside>
  );
}

/* ── Phase 3 sub-panel ─────────────────────────────────────────────────────── */

function ArrivalPanel({
  bookingId,
  qrSecret,
  spotLat,
  spotLng,
  verify,
}: {
  bookingId: string;
  qrSecret: string;
  spotLat: number;
  spotLng: number;
  verify: (
    mode: VerificationMode,
    options?: { pin?: string; distanceMeters?: number },
  ) => Promise<boolean>;
}) {
  const [pin, setPin] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  function checkGeofence() {
    if (!navigator.geolocation) {
      useParkPeerStore.setState({ error: "This browser has no location access." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const driver: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const result = insideGeofence(driver, { lat: spotLat, lng: spotLng });
        setDistance(Math.round(result.distance));
        setLocating(false);
        void verify("geofence", { distanceMeters: result.distance });
      },
      () => {
        setLocating(false);
        useParkPeerStore.setState({
          error: "Location permission denied — use the PIN or the gate button instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const rotation = tick % PLATFORM.qrRefreshSeconds;
  const remaining = PLATFORM.qrRefreshSeconds - rotation;
  const payload = `parkpeer://checkin?b=${bookingId}&k=${qrSecret.slice(0, 8)}&t=${Math.floor(
    tick / PLATFORM.qrRefreshSeconds,
  )}`;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-4">
        <p className="mono text-[10px] tracking-[0.24em] text-cyan-300 uppercase">
          Arrival verification
        </p>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative rounded-xl bg-white p-2">
            <QRCode value={payload} size={92} bgColor="#ffffff" fgColor="#060911" />
            <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden">
              <span className="animate-scan block h-full w-full bg-cyan-500/80" />
            </span>
          </div>
          <div className="flex-1">
            <p className="mono text-[10px] tracking-[0.2em] text-slate-400 uppercase">
              PIN fallback
            </p>
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="••••"
              className="mono field mt-1 text-center text-xl tracking-[0.4em]"
              aria-label="Four digit check-in PIN"
            />
            <p className="mono mt-2 text-[10px] text-slate-500">ring resets in {remaining}s</p>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-cyan-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${(1 - rotation / PLATFORM.qrRefreshSeconds) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={checkGeofence}
          disabled={locating}
          className="btn btn-ghost w-full"
        >
          {locating
            ? "Locating…"
            : distance === null
              ? `Verify arrival via GPS geofence (≤${PLATFORM.geofenceMeters} m)`
              : `Geofence check failed (${distance} m) — retry`}
        </button>
        <button
          type="button"
          onClick={() => void verify("pin", { pin })}
          disabled={pin.length !== 4}
          className="btn btn-ghost w-full"
        >
          Verify with PIN
        </button>
        <button
          type="button"
          onClick={async () => {
            setGateOpen(true);
            await verify("iot_gate");
          }}
          className={`btn w-full ${gateOpen ? "btn-primary" : "btn-ghost"}`}
        >
          {gateOpen ? "Gate open — session started" : "Simulate IoT ANPR gate open"}
        </button>
      </div>
    </section>
  );
}

/* ── Receipt ───────────────────────────────────────────────────────────────── */

function Receipt({ bookingId }: { bookingId: string }) {
  const booking = useParkPeerStore((s) =>
    s.bookings.find((item) => item.id === bookingId),
  );

  if (!booking) return null;
  const gross = booking.baseAmount + booking.overstayAmount;

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="mono text-[10px] tracking-[0.24em] text-slate-500 uppercase">
        {booking.status === "cancelled" ? "Released" : "Final receipt"}
      </p>
      <dl className="space-y-2 text-sm">
        <Line label="Base fee" value={formatCurrencyPrecise(booking.baseAmount)} />
        {booking.overstayAmount > 0 && (
          <Line
            label={`Overstay penalty (${booking.hourlyRate} × 1.5)`}
            value={formatCurrencyPrecise(booking.overstayAmount)}
            tone="text-amber-300"
          />
        )}
        <Line label="Gross" value={formatCurrencyPrecise(gross)} />
        <Line label="Host payout · 85%" value={formatCurrencyPrecise(booking.providerEarnings)} tone="text-emerald-300" />
        <Line label="Platform · 15%" value={formatCurrencyPrecise(booking.platformFee)} tone="text-amber-300" />
      </dl>
      <p className="mono text-[10px] text-slate-500">
        {booking.status === "cancelled"
          ? "No charge — escrow released back to the driver."
          : `Settled · ref ${booking.paymentIntentId.slice(0, 14)}…`}
      </p>
    </section>
  );
}

function Line({
  label,
  value,
  tone = "text-slate-200",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`mono ${tone}`}>{value}</dd>
    </div>
  );
}

export type { VerificationMode };
