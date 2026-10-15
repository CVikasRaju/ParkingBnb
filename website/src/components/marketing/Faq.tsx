"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import Reveal from "@/components/marketing/Reveal";

const QUESTIONS = [
  {
    q: "How does ParkPeer stop two drivers booking the same spot?",
    a: "A reservation claims the bay with a single atomic Redis operation (SET NX with a ten-minute expiry). Because the check and the write happen in one step, there is no window in which two requests can both succeed — the second one is simply told the bay is gone.",
  },
  {
    q: "What happens if I arrive and the spot is blocked?",
    a: "Report the blockage from your active pass. The booking is refunded automatically, the spot is taken out of circulation pending review, and a case is opened for the operator with the full booking history attached.",
  },
  {
    q: "How and when do hosts get paid?",
    a: "The driver's payment is pre-authorised at reservation and captured at checkout. Platform commission is deducted server-side, and the net amount settles into the host's wallet automatically after each completed session.",
  },
  {
    q: "What if I overstay my booked window?",
    a: "There is a grace period, after which the session bills by the minute at the host's hourly rate. The calculation runs entirely on the backend so no client can influence the amount charged.",
  },
  {
    q: "Do I need an IoT barrier to use ParkPeer?",
    a: "No. Check-in works with a rotating QR code, a 4-digit PIN, or GPS geofencing within 50 metres. IoT barrier relays and ANPR plate cameras are optional upgrades for commercial sites that want fully hands-free access.",
  },
  {
    q: "What does it cost a driver?",
    a: "Nothing beyond the hourly rate you book at. There is no subscription, no booking fee and no charge for cancelling before the session starts.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <span className="chip text-mist-300">FAQ</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.4rem] sm:leading-[1.1]">
            Questions, <span className="text-gradient-brand">answered plainly</span>
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-ink-700/60 overflow-hidden rounded-3xl border border-ink-700/60 bg-ink-900/60">
          {QUESTIONS.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left transition-colors hover:bg-ink-850"
                >
                  <span className="text-[0.98rem] font-medium text-mist-50">{item.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                      isOpen
                        ? "rotate-45 border-brand-400/60 text-brand-300"
                        : "border-ink-500 text-mist-400"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-6 text-sm leading-relaxed text-mist-300">{item.a}</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
