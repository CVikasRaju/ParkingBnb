import Link from "next/link";

export type LegalSection = {
  heading: string;
  /** One paragraph per entry; keep the source text plain and factual. */
  paragraphs: string[];
  bullets?: string[];
};

/**
 * Shared shell for `/terms` and `/privacy`.
 *
 * Deliberately plain markup: these are the only two pages on the platform that
 * must remain readable with JavaScript disabled and with the 3D canvas absent,
 * because app-store reviewers and payment providers read them with a crawler.
 */
export default function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 pt-28 pb-20 sm:px-8">
      <Link href="/" className="mono text-xs tracking-[0.2em] text-emerald-400 uppercase">
        ← ParkPeer
      </Link>

      <h1 className="display mt-6 text-4xl text-white sm:text-5xl">{title}</h1>
      <p className="mono mt-3 text-xs tracking-[0.18em] text-slate-500 uppercase">{updated}</p>

      <p className="mt-8 text-sm leading-relaxed text-slate-300">{intro}</p>

      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.heading} className="panel p-5">
            <h2 className="display text-xl text-white">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-slate-300">
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <footer className="mt-12 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6 text-xs text-slate-400">
        <Link href="/terms" className="hover:text-white">
          Terms of service
        </Link>
        <Link href="/privacy" className="hover:text-white">
          Privacy policy
        </Link>
        <Link href="/explore" className="hover:text-white">
          Live map
        </Link>
        <span className="ml-auto mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">
          Questions? legal@parkpeer.example
        </span>
      </footer>
    </main>
  );
}
