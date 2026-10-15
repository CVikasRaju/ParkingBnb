import Link from "next/link";

import Icon from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";
import { Wordmark } from "@/components/marketing/Brand";
import { dataSourceLabel, isSupabaseConfigured } from "@/lib/config";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#lifecycle" },
      { label: "Platform", href: "#platform" },
      { label: "Coverage", href: "#coverage" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "App",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Find parking", href: "/dashboard/map" },
      { label: "My bookings", href: "/dashboard/bookings" },
      { label: "Host console", href: "/dashboard/provider" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "API specification", href: "#faq" },
      { label: "Architecture", href: "#platform" },
      { label: "Status", href: "#faq" },
      { label: "Changelog", href: "#faq" },
    ],
  },
];

export default function CtaFooter() {
  return (
    <>
      <section className="relative py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <Reveal>
            <div className="glass relative overflow-hidden rounded-[2rem] px-7 py-14 text-center sm:px-14">
              <div className="pointer-events-none absolute inset-0">
                <div className="grid-lines absolute inset-0 opacity-30" />
                <div className="absolute -top-24 left-1/2 h-72 w-[38rem] -translate-x-1/2 rounded-full bg-brand-500/16 blur-[110px]" />
              </div>

              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-[2.7rem] sm:leading-[1.08]">
                  Your next parking spot is{" "}
                  <span className="text-gradient-brand">already waiting</span>
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-mist-300">
                  Create an account to book a bay, or list the space you already
                  own and start earning this week.
                </p>

                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/signup" className="btn-primary">
                    Create your account
                    <Icon name="arrow" size={18} />
                  </Link>
                  <Link href="/login" className="btn-ghost">
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-ink-700/60 bg-ink-950/80">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <Wordmark />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-mist-400">
                A real-time peer-to-peer parking marketplace — atomic holds,
                verified check-in, and automated escrow settlement.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="chip font-mono text-[0.68rem] text-mist-400">
                  {dataSourceLabel}
                </span>
                <span className="chip font-mono text-[0.68rem] text-mist-400">
                  {isSupabaseConfigured ? "auth: supabase" : "auth: demo mode"}
                </span>
              </div>
            </div>

            {COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="text-[0.72rem] font-semibold tracking-[0.2em] text-mist-400 uppercase">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-mist-300 transition-colors hover:text-brand-300"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-ink-700/60 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-mist-500">
              © {new Date().getFullYear()} ParkPeer. All rights reserved.
            </p>
            <p className="text-xs text-mist-500">
              Built with Next.js, React Three Fiber and Tailwind CSS.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
