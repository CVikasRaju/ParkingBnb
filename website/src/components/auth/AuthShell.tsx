import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/marketing/Brand";
import Icon from "@/components/marketing/Icon";
import { isDemoMode } from "@/lib/config";

const HIGHLIGHTS = [
  {
    icon: "lock" as const,
    title: "Atomic 10-minute holds",
    body: "A bay is never sold twice — the claim is a single Redis operation.",
  },
  {
    icon: "scan" as const,
    title: "Verified check-in",
    body: "Rotating QR codes, PINs and a 50-metre geofence prove arrival.",
  },
  {
    icon: "wallet" as const,
    title: "Automatic settlement",
    body: "Overstay billing and the host payout split are computed server-side.",
  },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      {/* ── Brand panel ─────────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden border-r border-ink-700/60 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="grid-lines absolute inset-0 opacity-30" />
          <div className="absolute -top-32 -left-20 h-[26rem] w-[26rem] rounded-full bg-brand-500/14 blur-[120px]" />
          <div className="absolute -right-24 bottom-0 h-[24rem] w-[24rem] rounded-full bg-azure-500/14 blur-[120px]" />
        </div>

        <Link href="/" className="flex items-center gap-3">
          <LogoMark size={38} />
          <span className="text-lg font-semibold tracking-tight text-mist-50">
            Park<span className="text-brand-400">Peer</span>
          </span>
        </Link>

        <div>
          <h2 className="max-w-md text-[2.1rem] leading-[1.14] font-semibold tracking-tight">
            <span className="text-gradient-mist">Parking you can </span>
            <span className="text-gradient-brand">actually reserve.</span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-mist-300">
            ParkPeer connects drivers with private driveways, garages and
            commercial bays — with enforcement built into the booking engine
            rather than bolted on afterwards.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink-600/70 bg-ink-800/70 text-brand-300">
                  <Icon name={item.icon} size={18} />
                </span>
                <div>
                  <p className="text-sm font-medium text-mist-100">{item.title}</p>
                  <p className="mt-1 max-w-xs text-[0.82rem] leading-relaxed text-mist-400">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-mist-500">
          {isDemoMode
            ? "Running in demo mode — no credentials required."
            : "Connected to your live backend."}
        </p>
      </aside>

      {/* ── Form panel ──────────────────────────────────────────────────── */}
      <main className="relative flex flex-1 flex-col justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="pointer-events-none absolute inset-0 -z-10 lg:hidden">
          <div className="grid-lines grid-lines-fade absolute inset-0 opacity-25" />
        </div>

        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5 lg:hidden">
            <LogoMark size={34} />
            <span className="text-base font-semibold text-mist-50">
              Park<span className="text-brand-400">Peer</span>
            </span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-[1.75rem]">
            {title}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-mist-400">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-7 text-sm text-mist-400">{footer}</div>
        </div>
      </main>
    </div>
  );
}
