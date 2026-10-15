"use client";

import Icon, { type IconName } from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";
import SceneFrame from "@/components/three/SceneFrame";
import ParkingWave from "@/components/three/ParkingWave";

const PILLARS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "bolt",
    title: "Deterministic concurrency",
    body: "Holds are a single atomic Redis operation, so a spot is never sold twice — even under a burst of simultaneous taps.",
  },
  {
    icon: "sensor",
    title: "Hardware-agnostic check-in",
    body: "QR, PIN and GPS today; IoT barriers and ANPR cameras plug in through the same webhook contract.",
  },
  {
    icon: "chart",
    title: "Money math, server-side only",
    body: "Overstay penalties, commission and host payouts are computed on the backend so no client can influence a cent.",
  },
];

export default function WaveSection() {
  return (
    <section id="platform" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-28">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">Platform</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Built like infrastructure, <span className="text-gradient-brand">not a listings board</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-mist-300">
            Move your cursor across the field below — each column is a parking bay
            responding in real time, the same way availability propagates through
            the live map.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <div className="glass relative h-[24rem] overflow-hidden rounded-[1.75rem] sm:h-[30rem]">
            <SceneFrame
              className="absolute inset-0"
              cameraPosition={[0, 3.5, 7.4]}
              fov={46}
              fog={["#04060c", 8, 24]}
              maxDpr={1.5}
            >
              <ParkingWave />
            </SceneFrame>

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
              <span className="chip border-azure-500/30 bg-ink-900/80 text-azure-200">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-azure-400" />
                Availability stream
              </span>
              <span className="hidden text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase sm:block">
                Move your cursor
              </span>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-x-8 gap-y-3 bg-gradient-to-t from-ink-950/90 to-transparent px-5 pt-16 pb-5">
              {[
                { k: "Match latency", v: "< 40 ms" },
                { k: "Hold collisions", v: "0" },
                { k: "Uptime target", v: "99.95%" },
              ].map((item) => (
                <div key={item.k}>
                  <p className="text-[0.7rem] tracking-wide text-mist-400 uppercase">{item.k}</p>
                  <p className="text-lg font-semibold text-mist-50">{item.v}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 90}>
              <div className="card h-full p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-brand-300">
                  <Icon name={pillar.icon} size={19} />
                </span>
                <h3 className="mt-4 text-base font-medium text-mist-50">{pillar.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-mist-300">{pillar.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
