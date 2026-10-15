import Link from "next/link";

import Icon, { type IconName } from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";

interface Persona {
  role: string;
  headline: string;
  body: string;
  icon: IconName;
  accent: "brand" | "azure" | "flare";
  points: string[];
}

const PERSONAS: Persona[] = [
  {
    role: "Driver",
    headline: "Stop circling the block",
    body: "Find a verified bay, hold it while you pay, and get gate access plus navigation in one tap.",
    icon: "car",
    accent: "brand",
    points: [
      "Live map of nearby bays with real availability",
      "10-minute hold — no double-booking, ever",
      "QR, PIN or geofence check-in when you arrive",
      "Turn-by-turn navigation via native maps",
    ],
  },
  {
    role: "Provider",
    headline: "Earn from the space you already own",
    body: "List a driveway, garage or commercial bay, set your schedule and price, and get paid automatically.",
    icon: "home",
    accent: "azure",
    points: [
      "Arrival alerts with the vehicle's identity",
      "Set operating hours and hourly pricing",
      "Automatic payouts after the 15% platform fee",
      "Overstay protection — penalties bill on your behalf",
    ],
  },
  {
    role: "Admin",
    headline: "Run the marketplace with evidence",
    body: "Verify hosts and properties, settle disputes, and release funds or refunds with a full audit trail.",
    icon: "shield",
    accent: "flare",
    points: [
      "Property and identity verification queue",
      "Dispute desk with booking-level history",
      "Emergency unlock for obstructed spots",
      "Escrow, commission and refund oversight",
    ],
  },
];

const ACCENTS = {
  brand: {
    ring: "border-brand-500/30",
    iconWrap: "bg-brand-500/12 text-brand-300",
    dot: "bg-brand-400",
  },
  azure: {
    ring: "border-azure-500/30",
    iconWrap: "bg-azure-500/12 text-azure-300",
    dot: "bg-azure-400",
  },
  flare: {
    ring: "border-flare-500/30",
    iconWrap: "bg-flare-500/12 text-flare-300",
    dot: "bg-flare-400",
  },
} as const;

export default function Personas() {
  return (
    <section id="personas" className="relative scroll-mt-24 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">Who it&apos;s for</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Three roles, <span className="text-gradient-brand">one marketplace</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-mist-300">
            Drivers, hosts and operators each get a purpose-built console over the
            same enforced booking lifecycle.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PERSONAS.map((persona, index) => {
            const accent = ACCENTS[persona.accent];
            return (
              <Reveal as="article" key={persona.role} delay={index * 110}>
                <div className={`card flex h-full flex-col p-7 ${accent.ring}`}>
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.iconWrap}`}
                    >
                      <Icon name={persona.icon} size={22} />
                    </span>
                    <span className="text-[0.72rem] font-semibold tracking-[0.22em] text-mist-400 uppercase">
                      {persona.role}
                    </span>
                  </div>

                  <h3 className="mt-6 text-xl font-medium tracking-tight text-mist-50">
                    {persona.headline}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-mist-300">{persona.body}</p>

                  <ul className="mt-6 space-y-3">
                    {persona.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-mist-200">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
                  >
                    Get started as a {persona.role.toLowerCase()}
                    <Icon name="arrow" size={16} />
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
