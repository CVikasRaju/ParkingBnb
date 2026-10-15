import Link from "next/link";

import Icon from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";

interface Tier {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  href: string;
  highlight?: boolean;
  points: string[];
}

const TIERS: Tier[] = [
  {
    name: "Driver",
    price: "Free",
    cadence: "no subscription",
    blurb: "Pay only for the hours you actually park.",
    cta: "Start parking",
    href: "/signup",
    points: [
      "Live map of verified nearby bays",
      "10-minute hold on every reservation",
      "QR, PIN and geofence check-in",
      "Native turn-by-turn navigation",
      "Automatic refund if a spot is blocked",
    ],
  },
  {
    name: "Provider",
    price: "15%",
    cadence: "per completed booking",
    blurb: "No listing fees, no monthly cost. We earn when you do.",
    cta: "List your space",
    href: "/signup",
    highlight: true,
    points: [
      "Unlimited listings and schedules",
      "Arrival alerts with vehicle identity",
      "Automatic payouts to your wallet",
      "Overstay penalties billed for you",
      "Utilisation and earnings analytics",
      "Priority placement in search",
    ],
  },
  {
    name: "Operator",
    price: "Custom",
    cadence: "commercial sites",
    blurb: "For malls, campuses, airports and multi-site portfolios.",
    cta: "Talk to us",
    href: "/signup",
    points: [
      "IoT barrier and ANPR integration",
      "Bulk bays and capacity management",
      "Custom commission structures",
      "Shared asset and team accounts",
      "SLA-backed support",
    ],
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">Pricing</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Free for drivers,{" "}
            <span className="text-gradient-brand">commission for hosts</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-mist-300">
            One transparent take rate on completed bookings. No subscriptions, no
            listing charges, no hidden fees on either side.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier, index) => (
            <Reveal key={tier.name} delay={index * 110}>
              <div
                className={`card relative flex h-full flex-col p-7 ${
                  tier.highlight
                    ? "border-brand-500/50 shadow-[0_30px_80px_-40px_rgba(13,217,163,0.45)]"
                    : ""
                }`}
              >
                {tier.highlight ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-ink-950 uppercase">
                    Most popular
                  </span>
                ) : null}

                <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-mist-400 uppercase">
                  {tier.name}
                </p>

                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-semibold tracking-tight text-mist-50">
                    {tier.price}
                  </span>
                  <span className="pb-1 text-sm text-mist-400">{tier.cadence}</span>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-mist-300">{tier.blurb}</p>

                <ul className="mt-7 space-y-3">
                  {tier.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm text-mist-200">
                      <Icon
                        name="check"
                        size={16}
                        className={tier.highlight ? "mt-0.5 text-brand-400" : "mt-0.5 text-azure-400"}
                      />
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`${tier.highlight ? "btn-primary" : "btn-ghost"} mt-9 w-full text-sm`}
                >
                  {tier.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
