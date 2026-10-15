import Icon, { type IconName } from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";

interface Phase {
  step: string;
  title: string;
  body: string;
  icon: IconName;
  chips: string[];
}

const PHASES: Phase[] = [
  {
    step: "01",
    title: "Discovery & race-condition-free hold",
    body: "Drivers browse verified nearby bays on an OpenStreetMap-backed map with PostGIS radius search. Reserving takes a single atomic Redis SET NX EX — the bay is yours for ten minutes while payment pre-authorises, so two drivers can never win the same spot.",
    icon: "locate",
    chips: ["Redis SET NX atomic", "ST_DWithin search", "10-minute TTL"],
  },
  {
    step: "02",
    title: "Instant handshake & navigation",
    body: "The moment the hold converts, the host receives the incoming vehicle's identity and arrival window, while the driver gets a digital pass, gate instructions and one-tap turn-by-turn navigation through native OS map intents — no paid navigation SDK.",
    icon: "route",
    chips: ["FCM arrival alerts", "Native deep links", "Gate codes"],
  },
  {
    step: "03",
    title: "Dual-tier verified check-in",
    body: "Access is proven, not assumed. A dynamic QR token is re-signed every 60 seconds, with a 4-digit PIN and a 50-metre GPS geofence as fallbacks. Commercial sites can go fully hands-free with IoT barrier relays and ANPR plate cameras.",
    icon: "scan",
    chips: ["HMAC QR · 60 s TTL", "PIN + ±50 m geofence", "IoT & ANPR webhooks"],
  },
  {
    step: "04",
    title: "Session tracking, overstay & escrow",
    body: "A live timer runs the session and overstays past the grace window bill automatically. Departure frees the listing instantly, platform commission is deducted server-side, and net earnings settle to the host's wallet — with automatic refunds if a spot is reported blocked.",
    icon: "wallet",
    chips: ["15-minute grace", "85 / 15 split", "Auto-refund on block"],
  },
];

export default function HowItWorks() {
  return (
    <section id="lifecycle" className="relative scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">The booking engine</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Four phases, <span className="text-gradient-brand">zero race conditions</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-mist-300">
            Every reservation moves through the same enforced state machine. The
            transitions live server-side, so the mobile app and this web console
            can never disagree about what a booking is allowed to do next.
          </p>
        </Reveal>

        <ol className="relative mt-16 space-y-10 lg:space-y-14">
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-6 left-[1.4rem] hidden w-px bg-gradient-to-b from-brand-500/60 via-azure-500/40 to-transparent sm:block"
          />

          {PHASES.map((phase, index) => (
            <Reveal as="li" key={phase.step} delay={index * 90} className="relative sm:pl-20">
              <span className="absolute top-0 left-0 hidden h-11 w-11 items-center justify-center rounded-2xl border border-brand-500/35 bg-ink-900 text-sm font-semibold text-brand-300 sm:flex">
                {phase.step}
              </span>

              <div className="card group p-6 sm:p-7">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-brand-300 transition-colors group-hover:bg-brand-500/15">
                    <Icon name={phase.icon} size={20} />
                  </span>
                  <h3 className="text-lg font-medium text-mist-50">{phase.title}</h3>
                  <span className="ml-auto text-xs tracking-[0.2em] text-mist-500 sm:hidden">
                    {phase.step}
                  </span>
                </div>

                <p className="mt-4 text-[0.95rem] leading-relaxed text-mist-300">
                  {phase.body}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {phase.chips.map((chip) => (
                    <span key={chip} className="chip font-mono text-[0.7rem] text-mist-300">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
