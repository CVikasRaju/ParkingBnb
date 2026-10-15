const ITEMS = [
  "Redis atomic locks",
  "PostGIS radius search",
  "Dynamic QR check-in",
  "4-digit PIN fallback",
  "50 m geofence",
  "ANPR plate recognition",
  "IoT barrier relay",
  "Escrow pre-authorisation",
  "85/15 host split",
  "Automatic overstay billing",
  "FCM arrival alerts",
  "Dispute resolution desk",
];

export default function Marquee() {
  return (
    <section className="relative border-y border-ink-700/50 bg-ink-900/50 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-950 to-transparent" />

      <div className="flex w-max animate-marquee items-center gap-10 pr-10">
        {[...ITEMS, ...ITEMS].map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="flex items-center gap-3 text-sm whitespace-nowrap text-mist-400"
          >
            <span className="h-1 w-1 rounded-full bg-brand-500/70" />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
