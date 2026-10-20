"use client";

/**
 * The landing page shell: one fixed WebGL canvas, five scroll acts on top.
 *
 * Lenis owns inertia scrolling and GSAP's ScrollTrigger scrubs the act progress
 * that `LandingScene` reads. The act index — the only value that reaches React
 * — changes five times across the whole page, so the DOM never re-renders while
 * the visitor scrolls.
 */

import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";

import LandingScene from "@/components/three/LandingScene";
import SceneFrame from "@/components/three/SceneFrame";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/format";
import { PLATFORM } from "@/lib/types";

gsap.registerPlugin(ScrollTrigger);

const ACTS = [
  {
    id: "act-1",
    index: "00",
    phase: "Overview",
    title: "Park anywhere. Own the curb.",
    body: "ParkPeer matches a driver to a private driveway, garage or basement bay in seconds. Atomic ten-minute holds mean the bay you see is the bay you get.",
  },
  {
    id: "act-2",
    index: "01",
    phase: "Phase 01 · Instant lock",
    title: "Ten minutes, held atomically.",
    body: "One tap takes a Redis-backed hold on the bay and pre-authorises escrow. Every other map in the city paints it amber — nobody else can take it while you finish.",
  },
  {
    id: "act-3",
    index: "02",
    phase: "Phase 02 · Handshake",
    title: "The host is notified before you arrive.",
    body: "The provider gets the plate, the vehicle class and your ETA. A cyan route lights the driveway entrance and hands off to turn-by-turn navigation.",
  },
  {
    id: "act-4",
    index: "03",
    phase: "Phase 03 · Arrival",
    title: "The gate opens to a verified pass.",
    body: "Arrival is proved three ways — a rotating QR the server re-signs, a four-digit PIN, or a GPS geofence check. IoT barriers lift on the same verification.",
  },
  {
    id: "act-5",
    index: "04",
    phase: "Phase 04 · Settlement",
    title: "The curb pays its owner.",
    body: "Checkout settles the escrow in one movement: 85% to the host's wallet, 15% platform commission, with an automatic 1.5× penalty beyond the grace window.",
  },
] as const;

export default function LandingExperience({ signedIn }: { signedIn: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [act, setAct] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.6 });
    const tick = (time: number) => lenis.raf(time * 1000);

    // Progressive enhancement: every act's copy is fully visible until this flag
    // is set, so a browser without JavaScript (or one where GSAP failed to boot)
    // gets five readable sections instead of one visible act and four invisible
    // ones. Only once the scroll system is genuinely live does the CSS hide the
    // inactive acts. Written imperatively to avoid a state update in an effect.
    if (root) root.dataset.ready = "true";

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const trigger = ScrollTrigger.create({
      trigger: scrollRef.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const value = self.progress;
        progress.current = value;

        // Act index: the only value pushed into React, and it changes at most
        // five times on the way down.
        const nextAct = Math.min(ACTS.length - 1, Math.floor(value * ACTS.length));
        setAct((current) => (current === nextAct ? current : nextAct));

        const nextGate = value > 0.68;
        setGateOpen((current) => (current === nextGate ? current : nextGate));
      },
    });

    return () => {
      trigger.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
      if (root) delete root.dataset.ready;
    };
  }, []);

  return (
    <div ref={scrollRef} className="group relative">
      {/* ── Persistent WebGL canvas ─────────────────────────────────────── */}
      {/* The `group-data-[ready]` variants below are what make the acts
          scroll-driven; without them all five stay legible. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SceneFrame
          className="absolute inset-0"
          alwaysOn
          cameraPosition={[40, 52, 38]}
          fov={42}
          maxDpr={1.6}
          fallback={
            <div className="grid-lines grid-lines-fade absolute inset-0 bg-obsidian" />
          }
        >
          <LandingScene progress={progress} gateOpen={gateOpen} />
        </SceneFrame>
      </div>

      {/* ── HUD overlays, one per act ───────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-20 hidden lg:block">
        <div className="relative mx-auto h-full max-w-[1400px] px-8">
          {act === 1 && <HoldHud />}
          {act === 2 && <HandshakeHud />}
          {act === 3 && <ArrivalHud gateOpen={gateOpen} />}
          {act === 4 && <SettlementHud />}
        </div>
      </div>

      {/* ── Scroll content ──────────────────────────────────────────────── */}
      <main className="relative z-10">
        {ACTS.map((item, index) => (
          <section
            key={item.id}
            id={item.id}
            className="pointer-events-none flex min-h-screen items-center"
          >
            <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-8">
              <div
                className={`pointer-events-auto max-w-xl transition-opacity duration-500 group-data-[ready=true]:opacity-0 ${
                  act === index ? "group-data-[ready=true]:opacity-100" : ""
                }`}
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="mono text-[11px] tracking-[0.3em] text-emerald-400">
                    {item.index}
                  </span>
                  <span className="h-px w-10 bg-white/20" />
                  <span className="mono text-[11px] tracking-[0.24em] text-slate-400 uppercase">
                    {item.phase}
                  </span>
                </div>

                {index === 0 ? (
                  <>
                    <h1 className="display text-gradient-mist text-5xl sm:text-6xl xl:text-7xl">
                      Park anywhere.
                      <br />
                      <span className="text-gradient-neon">Own the curb.</span>
                    </h1>
                    <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-400">
                      {item.body}
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <Link href="/explore" className="btn btn-primary">
                        Open the live 3D map
                        <span aria-hidden>→</span>
                      </Link>
                      <Link href={signedIn ? "/provider" : "/auth?role=provider"} className="btn btn-ghost">
                        List your driveway
                      </Link>
                    </div>
                    <QuickSearch />
                  </>
                ) : (
                  <>
                    <h2 className="display text-3xl text-white sm:text-4xl xl:text-5xl">
                      {item.title}
                    </h2>
                    <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400">
                      {item.body}
                    </p>
                    {index === ACTS.length - 1 && (
                      <div className="mt-8 flex flex-wrap gap-3">
                        <Link href="/explore" className="btn btn-primary">
                          Find a bay near you
                        </Link>
                        <Link href="/auth" className="btn btn-ghost">
                          Create an account
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        ))}

        <footer className="border-t border-white/10 bg-obsidian/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <p className="display text-xl text-white">ParkPeer</p>
              <p className="mt-1 text-sm text-slate-500">
                The peer-to-peer parking marketplace. Built with Next.js, React Three
                Fiber, MapLibre and Supabase.
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-slate-400">
              <Link className="hover:text-emerald-300" href="/explore">
                Live map
              </Link>
              <Link className="hover:text-emerald-300" href="/provider">
                Host console
              </Link>
              <Link className="hover:text-emerald-300" href="/admin">
                Operator desk
              </Link>
              <Link className="hover:text-emerald-300" href="/auth">
                {signedIn ? "Account" : "Sign in"}
              </Link>
              <Link className="hover:text-emerald-300" href="/terms">
                Terms
              </Link>
              <Link className="hover:text-emerald-300" href="/privacy">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ── Act 1 extra: the quick search command bar ─────────────────────────────── */

function QuickSearch() {
  const [category, setCategory] = useState<string>("all");

  return (
    <div className="mt-9">
      <div className="mb-3 flex flex-wrap gap-2">
        {[
          { id: "all", label: "🅿️ All Parking" },
          { id: "ev_p2p_charge", label: "⚡ P2P EV Socket" },
          { id: "commercial_cpo", label: "⚡ Fast CPO Hub" },
          { id: "fuel_pump", label: "⛽ Fuel / CNG" },
        ].map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setCategory(pill.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              category === pill.id
                ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>
      <form
        action="/explore"
        className="glass flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="category" value={category} />
        <label className="flex-1">
          <span className="sr-only">Where are you parking?</span>
          <input
            name="q"
            defaultValue="Indiranagar, Bengaluru"
            className="w-full rounded-xl bg-transparent px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-500"
            placeholder="Where are you parking?"
          />
        </label>
        <span className="hidden h-6 w-px bg-white/10 sm:block" />
        <label className="sm:w-40">
          <span className="sr-only">Vehicle</span>
          <select
            name="vehicle"
            className="w-full rounded-xl bg-transparent px-4 py-3 text-sm text-slate-300 outline-none"
            defaultValue="ev"
          >
            <option value="hatchback">Hatchback</option>
            <option value="sedan">Sedan</option>
            <option value="suv">SUV</option>
            <option value="ev">EV</option>
            <option value="motorcycle">Motorcycle</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary sm:px-6">
          Find parking
        </button>
      </form>
    </div>
  );
}

/* ── Act 2 HUD: the live hold ──────────────────────────────────────────────── */

function HoldHud() {
  const total: number = PLATFORM.lockTtlSeconds;
  const [remaining, setRemaining] = useState<number>(total);
  const ring = useMemo(() => 2 * Math.PI * 22, []);

  // The countdown loops for the duration of the act — it is a demonstration of
  // the hold, not the hold itself, so it never reaches a terminal state.
  useEffect(() => {
    const id = window.setInterval(
      () => setRemaining((value) => (value <= 1 ? total : value - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [total]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="animate-rise absolute top-28 right-8 w-80">
      <div className="glass rounded-2xl p-5 ring-1 ring-amber-500/30">
        <p className="mono text-[10px] tracking-[0.28em] text-amber-300 uppercase">
          Hold active
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
              <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <circle
                cx="26"
                cy="26"
                r="22"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - remaining / total)}
              />
            </svg>
          </div>
          <div>
            <p className="mono text-3xl text-amber-300 tabular-nums">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </p>
            <p className="mono text-[10px] tracking-[0.2em] text-slate-500 uppercase">
              Bay · Jubilee Hills
            </p>
          </div>
        </div>
        <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
          <Row label="Escrow pre-authorised" value={formatCurrency(180)} />
          <Row label="Status" value="Amber everywhere" tone="text-amber-300" />
        </dl>
      </div>
    </div>
  );
}

/* ── Act 3 HUD: the host notification ──────────────────────────────────────── */

function HandshakeHud() {
  return (
    <div className="animate-rise absolute top-28 right-8 w-80 space-y-3">
      <div className="glass rounded-2xl p-5 ring-1 ring-cyan-500/30">
        <p className="mono text-[10px] tracking-[0.28em] text-cyan-300 uppercase">
          Host notified
        </p>
        <p className="display mt-3 text-lg text-white">
          Incoming: KA-19-MG-2026 SUV
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Arriving in 6 minutes · gate instructions shared
        </p>
        <div className="mt-4 flex gap-2">
          <span className="chip border-cyan-500/40 text-cyan-300">Route locked</span>
          <span className="chip border-emerald-500/40 text-emerald-300">Plate matched</span>
        </div>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="mono text-[10px] tracking-[0.24em] text-slate-400 uppercase">
          Turn-by-turn
        </p>
        <p className="mono mt-2 text-sm text-slate-300">
          Road No. 36 · 1.4 km · 4 min
        </p>
        <div className="road-chevrons mt-3 h-1.5 rounded-full" />
      </div>
    </div>
  );
}

/* ── Act 4 HUD: arrival verification ───────────────────────────────────────── */

function ArrivalHud({ gateOpen }: { gateOpen: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const progress = (tick % PLATFORM.qrRefreshSeconds) / PLATFORM.qrRefreshSeconds;
  const payload = `parkpeer://checkin?b=bk_demo&t=${Math.floor(tick / PLATFORM.qrRefreshSeconds)}`;

  return (
    <div className="animate-rise absolute top-28 right-8 w-80">
      <div className="glass rounded-2xl p-5 ring-1 ring-emerald-500/30">
        <div className="flex items-center justify-between">
          <p className="mono text-[10px] tracking-[0.28em] text-emerald-300 uppercase">
            Arrival pass
          </p>
          <span
            className={`chip ${
              gateOpen
                ? "animate-blink border-emerald-500/50 text-emerald-300"
                : "border-amber-500/40 text-amber-300"
            }`}
          >
            {gateOpen ? "Gate open" : "Gate closed"}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="relative rounded-xl bg-white p-2">
            <QRCode value={payload} size={86} bgColor="#ffffff" fgColor="#060911" />
            <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden">
              <span className="animate-scan block h-full w-full bg-emerald-500/80" />
            </span>
          </div>
          <div>
            <p className="mono text-[10px] tracking-[0.2em] text-slate-500 uppercase">
              PIN fallback
            </p>
            <p className="mono text-3xl tracking-[0.3em] text-white">8821</p>
            <p className="mono mt-2 text-[10px] text-slate-500">
              re-signed in {PLATFORM.qrRefreshSeconds - Math.floor(progress * PLATFORM.qrRefreshSeconds)}s
            </p>
          </div>
        </div>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${(1 - progress) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Act 5 HUD: the escrow split ───────────────────────────────────────────── */

function SettlementHud() {
  const gross = 180;
  const fee = gross * PLATFORM.commissionRate;
  const payout = gross - fee;

  return (
    <div className="animate-rise absolute top-28 right-8 w-80">
      <div className="glass rounded-2xl p-5 ring-1 ring-emerald-500/30">
        <p className="mono text-[10px] tracking-[0.28em] text-emerald-300 uppercase">
          Escrow released
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Base fee · 3h" value={formatCurrencyPrecise(gross)} />
          <Row label="Provider payout · 85%" value={formatCurrencyPrecise(payout)} tone="text-emerald-300" />
          <Row label="Platform commission · 15%" value={formatCurrencyPrecise(fee)} tone="text-amber-300" />
        </dl>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-[85%] bg-emerald-400" />
          <span className="block h-full w-[15%] bg-amber-400" />
        </div>
        <p className="mono mt-3 text-[10px] text-slate-500">
          Overstay penalty 1.5× after {PLATFORM.overstayGraceMinutes} min grace
        </p>
      </div>
    </div>
  );
}

function Row({
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

export { ACTS };
