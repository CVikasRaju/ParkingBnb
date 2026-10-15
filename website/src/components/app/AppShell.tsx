"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { LogoMark } from "@/components/marketing/Brand";
import Icon, { type IconName } from "@/components/marketing/Icon";
import { signOutAction } from "@/lib/auth/actions";
import type { Role } from "@/lib/auth/roles";
import { dataSourceLabel } from "@/lib/config";

interface NavItem {
  href:
    | "/dashboard"
    | "/dashboard/map"
    | "/dashboard/bookings"
    | "/dashboard/pass"
    | "/dashboard/provider"
    | "/dashboard/wallet"
    | "/dashboard/admin";
  label: string;
  icon: IconName;
  /** Role this console belongs to — used only to group, never to hide. */
  owner: Role;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "chart", owner: "driver" },
  { href: "/dashboard/map", label: "Find parking", icon: "pin", owner: "driver" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "clock", owner: "driver" },
  { href: "/dashboard/pass", label: "Active pass", icon: "qr", owner: "driver" },
  { href: "/dashboard/provider", label: "Host console", icon: "home", owner: "provider" },
  { href: "/dashboard/wallet", label: "Wallet", icon: "wallet", owner: "provider" },
  { href: "/dashboard/admin", label: "Admin", icon: "shield", owner: "admin" },
];

const ROLE_LABEL: Record<Role, string> = {
  driver: "Driver",
  provider: "Provider",
  admin: "Admin",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role; mode: "supabase" | "demo" };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer closes from the link that was tapped rather than from an effect
  // watching the pathname — no cascading render, and no stale open drawer.
  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-brand-500/12 font-medium text-brand-200"
                : "text-mist-300 hover:bg-ink-800 hover:text-mist-100"
            }`}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
            {item.owner === user.role && !active ? (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400/70" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarFooter = (
    <div className="mt-6 border-t border-ink-700/60 pt-5">
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-azure-500 text-[0.7rem] font-bold text-ink-950">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-mist-100">{user.name}</p>
          <p className="truncate text-[0.7rem] text-mist-500">{user.email}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 px-1">
        <span className="chip text-[0.68rem] text-mist-300">{ROLE_LABEL[user.role]}</span>
        <span className="chip text-[0.68rem] text-mist-400">{dataSourceLabel}</span>
      </div>

      <form action={signOutAction} className="mt-4 px-1">
        <button
          type="submit"
          className="w-full rounded-xl border border-ink-600/80 bg-ink-800/60 px-3 py-2 text-sm text-mist-300 transition-colors hover:border-flare-500/40 hover:text-flare-300"
        >
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-700/60 bg-ink-900/60 p-5 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-base font-semibold tracking-tight text-mist-50">
            Park<span className="text-brand-400">Peer</span>
          </span>
        </Link>

        <div className="mt-8 flex flex-1 flex-col">
          {renderNav()}
          {sidebarFooter}
        </div>
      </aside>

      {/* ── Mobile drawer ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink-700/60 bg-ink-900 p-5 lg:hidden"
            >
              <Link href="/" className="flex items-center gap-2.5">
                <LogoMark size={32} />
                <span className="text-base font-semibold text-mist-50">ParkPeer</span>
              </Link>
              <div className="mt-8 flex flex-1 flex-col">
                {renderNav(() => setDrawerOpen(false))}
                {sidebarFooter}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-strong sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-700/60 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-600/80 bg-ink-800/60 text-mist-200 lg:hidden"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-mist-100">
              {NAV.find((item) =>
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href),
              )?.label ?? "Dashboard"}
            </p>
            <p className="truncate text-[0.7rem] text-mist-500">
              {user.mode === "supabase"
                ? "Signed in with Supabase"
                : "Demo session — connect Supabase to persist data"}
            </p>
          </div>

          <Link
            href="/"
            className="hidden rounded-xl border border-ink-600/80 bg-ink-800/60 px-3.5 py-2 text-xs text-mist-300 transition-colors hover:text-mist-100 sm:block"
          >
            View site
          </Link>

          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-azure-500 text-[0.7rem] font-bold text-ink-950">
            {initials(user.name)}
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
