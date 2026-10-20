import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import type { SessionUser } from "@/lib/auth/session";

const LINKS = [
  { href: "/explore", label: "Live map" },
  { href: "/provider", label: "Host console" },
  { href: "/admin", label: "Operator desk" },
];

/**
 * Fixed glass navigation, shared by every route.
 *
 * A Server Component: the session is resolved once on the server and the only
 * interactive piece is the sign-out form, which posts straight to a server
 * action — so the whole bar ships as markup with no client bundle.
 */
export default function Nav({ user }: { user: SessionUser | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6">
        <nav className="glass flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-obsidian" />
              <span className="absolute inset-0 animate-pulse-ring rounded-xl border border-emerald-400/50" />
            </span>
            <span className="display text-lg text-white">
              Park<span className="text-emerald-400">Peer</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3.5 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:flex">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-300 uppercase">
                    {user.name.slice(0, 1)}
                  </span>
                  <span className="text-xs text-slate-300">{user.name}</span>
                  <span className="mono text-[10px] tracking-[0.16em] text-slate-500 uppercase">
                    {user.role}
                  </span>
                </span>
                <form action={signOutAction}>
                  <button type="submit" className="btn btn-ghost !px-4 !py-2 text-xs">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/auth" className="btn btn-ghost !px-4 !py-2 text-xs">
                  Sign in
                </Link>
                <Link href="/explore" className="btn btn-primary !px-4 !py-2 text-xs">
                  Find parking
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
