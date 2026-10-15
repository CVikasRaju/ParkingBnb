import Icon, { type IconName } from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "Atomic 10-minute hold",
    body: "A single Redis SET NX EX claims the bay. No read-then-write window means no double bookings.",
  },
  {
    icon: "qr",
    title: "Rotating QR passes",
    body: "HMAC-signed tokens refresh every 60 seconds and are re-verified server-side on every scan.",
  },
  {
    icon: "locate",
    title: "Geofenced check-in",
    body: "Arrival is validated within 50 metres, so a pass cannot be redeemed from across the city.",
  },
  {
    icon: "camera",
    title: "ANPR plate recognition",
    body: "IoT cameras can confirm the vehicle at the barrier and open the gate without a phone.",
  },
  {
    icon: "plug",
    title: "EV & amenity filters",
    body: "Chargers, covered bays, CCTV, lift access and 24×7 sites are filterable before you book.",
  },
  {
    icon: "bell",
    title: "Real-time host alerts",
    body: "Push notifications carry the plate, arrival window and gate instructions to the host instantly.",
  },
  {
    icon: "gavel",
    title: "Dispute desk",
    body: "Reported blockages trigger an automatic refund and open a case with the booking history attached.",
  },
  {
    icon: "clock",
    title: "Automatic overstay billing",
    body: "Sessions past the grace window bill by the minute — computed server-side, never on the client.",
  },
  {
    icon: "key",
    title: "Emergency unlock",
    body: "Operators can release a stuck hold immediately, freeing the listing and settling escrow cleanly.",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">Capabilities</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Everything enforcement needs, <span className="text-gradient-brand">nothing it doesn&apos;t</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-ink-700/60 bg-ink-700/40 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={(index % 3) * 80}>
              <div className="group h-full bg-ink-900/80 p-6 transition-colors hover:bg-ink-850">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-brand-300 transition-colors group-hover:bg-brand-500/12">
                  <Icon name={feature.icon} size={19} />
                </span>
                <h3 className="mt-4 text-[0.98rem] font-medium text-mist-50">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-400">{feature.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
