"use client";

import { useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";

import Icon from "@/components/marketing/Icon";
import type { Booking } from "@/lib/data/demo";
import { formatCurrency, formatDateTime, formatTime } from "@/lib/format";

/** Mirrors `QR_TOKEN_TTL_SECONDS` in the backend environment. */
const TOKEN_TTL_SECONDS = 60;

/* ── The live clock, modelled as an external store ───────────────────────────
   A session timer and a rotating QR token both need "now", but reading the
   clock during render is impure: the server and the client would disagree and
   hydration would mismatch. Subscribing to a one-second interval instead means
   React owns the subscription, the server snapshot is `null` (so the first
   render is identical on both sides), and the real value arrives right after
   hydration. One source drives the timer and the token, so they cannot drift.
   ─────────────────────────────────────────────────────────────────────────── */

const CLOCK_TICK_MS = 1000;

function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, CLOCK_TICK_MS);
  return () => clearInterval(timer);
}

/** Whole seconds since the epoch — stable within each second. */
function getClockSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

/** Server render and hydration: the time is not known yet. */
function getServerClockSnapshot(): number | null {
  return null;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export default function ActivePass({ booking }: { booking: Booking | null }) {
  const clockSeconds = useSyncExternalStore<number | null>(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );

  const [revealed, setRevealed] = useState(false);
  const [stage, setStage] = useState<"reserved" | "parked">(
    booking?.status === "CHECKED_IN" ? "parked" : "reserved",
  );

  if (!booking) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-mist-400">
          <Icon name="qr" size={20} />
        </span>
        <p className="mt-4 text-sm text-mist-300">
          No active reservation right now.
        </p>
        <p className="mt-1.5 text-[0.78rem] text-mist-500">
          Hold a bay from the map and the pass appears here immediately.
        </p>
      </div>
    );
  }

  const secondsNow = clockSeconds ?? 0;
  const rotation = Math.floor(secondsNow / TOKEN_TTL_SECONDS);
  const secondsLeft = TOKEN_TTL_SECONDS - (secondsNow % TOKEN_TTL_SECONDS);

  // Demo payload. The live backend returns a compact HMAC-signed JWT from
  // `GET /bookings/:id/qr`; this mirrors its shape so the UI is final.
  const payload = JSON.stringify({
    b: booking.id,
    p: booking.pin,
    r: rotation,
    exp: (rotation + 1) * TOKEN_TTL_SECONDS,
    demo: true,
  });

  const startedAt = new Date(booking.startsAt).getTime();
  const elapsedMs =
    clockSeconds === null ? 0 : Math.max(0, clockSeconds * 1000 - startedAt);
  const elapsedHours = elapsedMs / 3_600_000;
  const indicativeBill = Math.round(elapsedHours * booking.hourlyRate);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
      {/* ── Pass ────────────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase">
              Access pass
            </p>
            <h2 className="mt-2 text-lg font-medium text-mist-50">{booking.spotTitle}</h2>
            <p className="mt-1 text-[0.82rem] text-mist-400">{booking.address}</p>
          </div>
          <span
            className={`chip shrink-0 ${
              stage === "parked"
                ? "border-brand-500/40 text-brand-200"
                : "border-azure-500/40 text-azure-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stage === "parked" ? "bg-brand-400" : "bg-azure-400"
              }`}
            />
            {stage === "parked" ? "Checked in" : "Reserved"}
          </span>
        </div>

        {/* QR */}
        <div className="mt-6 flex flex-col items-center">
          <div className="rounded-2xl bg-mist-100 p-4 shadow-[0_20px_60px_-30px_rgba(13,217,163,0.5)]">
            <QRCode
              value={payload}
              size={188}
              bgColor="#e3eaf9"
              fgColor="#04060c"
              level="M"
            />
          </div>

          <div className="mt-4 w-full max-w-[15rem]">
            <div className="flex items-center justify-between text-[0.72rem] text-mist-400">
              <span>Token rotates in</span>
              <span className="font-mono text-mist-200">{secondsLeft}s</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-azure-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${(secondsLeft / TOKEN_TTL_SECONDS) * 100}%` }}
              />
            </div>
            <p className="mt-2.5 text-center text-[0.7rem] leading-relaxed text-mist-500">
              Signed server-side with HMAC-SHA256 and verified on every scan.
            </p>
          </div>
        </div>

        {/* PIN fallback */}
        <div className="mt-6 rounded-2xl border border-ink-700/70 bg-ink-900/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.7rem] tracking-wide text-mist-500 uppercase">
                4-digit PIN fallback
              </p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tracking-[0.35em] text-mist-50">
                {revealed ? booking.pin : "••••"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="btn-ghost text-xs"
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Session ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="text-base font-medium text-mist-50">Live session</h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-700/70 bg-ink-900/60 p-4">
              <p className="text-[0.68rem] tracking-wide text-mist-500 uppercase">
                Time on site
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-brand-300">
                {clockSeconds === null ? "--:--:--" : formatElapsed(elapsedMs)}
              </p>
            </div>
            <div className="rounded-2xl border border-ink-700/70 bg-ink-900/60 p-4">
              <p className="text-[0.68rem] tracking-wide text-mist-500 uppercase">
                Indicative bill
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-mist-50">
                {formatCurrency(indicativeBill)}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 border-t border-ink-700/60 pt-5 text-[0.82rem]">
            {[
              { k: "Booked window", v: `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)}` },
              { k: "Starts", v: formatDateTime(booking.startsAt) },
              { k: "Vehicle", v: booking.plate },
              { k: "Rate", v: `${formatCurrency(booking.hourlyRate)}/hr` },
              { k: "Host", v: booking.providerName },
            ].map((row) => (
              <div key={row.k} className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">{row.k}</dt>
                <dd className="truncate font-mono text-mist-200">{row.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {stage === "reserved" ? (
              <button
                type="button"
                onClick={() => setStage("parked")}
                className="btn-primary text-sm"
              >
                <Icon name="scan" size={17} />
                Check in
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStage("reserved")}
                className="btn-primary text-sm"
              >
                <Icon name="check" size={17} />
                Check out & settle
              </button>
            )}
            <button type="button" className="btn-ghost text-sm">
              <Icon name="route" size={17} />
              Navigate
            </button>
          </div>

          <p className="mt-3.5 text-[0.72rem] leading-relaxed text-mist-500">
            Check-out releases the listing immediately and settles escrow: the
            platform keeps 15% and the remainder is paid to the host&apos;s wallet.
          </p>
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-medium text-mist-50">Check-in methods</h3>
          <ul className="mt-4 space-y-3">
            {[
              {
                icon: "qr" as const,
                label: "Rotating QR",
                detail: "Scanned at the barrier or by the host's app",
                active: true,
              },
              {
                icon: "key" as const,
                label: "4-digit PIN",
                detail: "Fallback when a camera is unavailable",
                active: true,
              },
              {
                icon: "locate" as const,
                label: "GPS geofence",
                detail: "Auto check-in within 50 metres of the bay",
                active: true,
              },
              {
                icon: "camera" as const,
                label: "ANPR plate camera",
                detail: "Not enabled at this site",
                active: false,
              },
            ].map((method) => (
              <li key={method.label} className="flex items-start gap-3.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    method.active ? "bg-brand-500/12 text-brand-300" : "bg-ink-700 text-mist-500"
                  }`}
                >
                  <Icon name={method.icon} size={16} />
                </span>
                <div>
                  <p
                    className={`text-[0.84rem] font-medium ${
                      method.active ? "text-mist-100" : "text-mist-400"
                    }`}
                  >
                    {method.label}
                  </p>
                  <p className="text-[0.74rem] text-mist-500">{method.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
