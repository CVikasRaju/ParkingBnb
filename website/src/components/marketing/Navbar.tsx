"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/marketing/Brand";

export interface NavUser {
  name: string;
  email: string;
  role: "driver" | "provider" | "admin";
}

const LINKS = [
  { href: "#lifecycle", label: "How it works" },
  { href: "#personas", label: "Who it's for" },
  { href: "#platform", label: "Platform" },
  { href: "#coverage", label: "Coverage" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Navbar({ user }: { user: NavUser | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "glass-strong border-b border-ink-700/60" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="ParkPeer home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm text-mist-300 transition-colors hover:bg-ink-800/70 hover:text-mist-50"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="hidden items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 py-1.5 pr-3.5 pl-1.5 text-sm font-medium text-brand-200 transition-colors hover:bg-brand-500/20 sm:flex"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-azure-500 text-[0.7rem] font-bold text-ink-950">
                {initials(user.name)}
              </span>
              Open app
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden text-sm font-medium text-mist-300 transition-colors hover:text-mist-50 sm:block"
            >
              Sign in
            </Link>
          )}

          {/* Dedicated login / account icon — the entry point into the web app. */}
          <Link
            href={user ? "/dashboard" : "/login"}
            aria-label={user ? "Open your ParkPeer dashboard" : "Log in to ParkPeer"}
            title={user ? "Open dashboard" : "Log in"}
            className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-ink-500/80 bg-ink-800/70 text-mist-200 transition-all hover:border-brand-400/60 hover:bg-ink-700 hover:text-brand-300"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <circle cx="12" cy="8.2" r="3.5" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M4.8 19.4a7.6 7.6 0 0 1 14.4 0"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            {user ? (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-brand-400" />
            ) : null}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-500/80 bg-ink-800/70 text-mist-200 lg:hidden"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong overflow-hidden border-t border-ink-700/60 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm text-mist-200 transition-colors hover:bg-ink-800"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex gap-2">
                {user ? (
                  <Link href="/dashboard" className="btn-primary flex-1 text-sm">
                    Open dashboard
                  </Link>
                ) : (
                  <>
                    <Link href="/login" className="btn-ghost flex-1 text-sm">
                      Sign in
                    </Link>
                    <Link href="/signup" className="btn-primary flex-1 text-sm">
                      Get started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
