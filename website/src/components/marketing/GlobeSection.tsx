"use client";

import { useState } from "react";

import Icon from "@/components/marketing/Icon";
import Reveal from "@/components/marketing/Reveal";
import SceneFrame from "@/components/three/SceneFrame";
import CityGlobe from "@/components/three/CityGlobe";
import { cities, platformStats, type CityPin } from "@/lib/data/demo";

export default function GlobeSection() {
  const [active, setActive] = useState<CityPin | null>(null);
  const focused = active ?? cities[0];

  return (
    <section id="coverage" className="relative scroll-mt-24 py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-[-10rem] h-[30rem] w-[30rem] rounded-full bg-azure-500/10 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <span className="chip text-mist-300">Coverage</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
            Live in <span className="text-gradient-brand">{platformStats.citiesLive} cities</span>,
            built to add more
          </h2>
          <p className="mt-5 text-base leading-relaxed text-mist-300">
            Spin the globe and hover a marker to inspect supply and demand. Every
            location runs the same booking engine, pricing rules and escrow maths.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          {/* Height: the globe */}
          <Reveal className="order-2 lg:order-1">
            <div className="glass relative h-[24rem] overflow-hidden rounded-[1.75rem] p-6 sm:h-[30rem]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase">
                    Selected market
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-mist-50">
                    {focused.name}
                  </p>
                  <p className="text-sm text-mist-400">{focused.country}</p>
                </div>
                <span className="chip border-brand-500/30 text-brand-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  Active
                </span>
              </div>

              <dl className="mt-7 grid grid-cols-3 gap-4">
                {[
                  { k: "Spots", v: focused.spots.toLocaleString("en-IN") },
                  { k: "Hosts", v: focused.providers.toLocaleString("en-IN") },
                  { k: "Demand", v: `${focused.demand}%` },
                ].map((stat) => (
                  <div key={stat.k} className="rounded-2xl border border-ink-700/70 bg-ink-900/60 p-3.5">
                    <dd className="text-lg font-semibold text-mist-50">{stat.v}</dd>
                    <dt className="mt-0.5 text-[0.68rem] tracking-wide text-mist-400 uppercase">
                      {stat.k}
                    </dt>
                  </div>
                ))}
              </dl>

              <div className="mt-7 space-y-1.5">
                <p className="text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase">
                  All markets
                </p>
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {cities.map((city) => (
                    <li key={city.name}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(city)}
                        onFocus={() => setActive(city)}
                        onMouseLeave={() => setActive(null)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          focused.name === city.name
                            ? "bg-brand-500/10 text-brand-200"
                            : "text-mist-300 hover:bg-ink-800"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon name="pin" size={15} />
                          {city.name}
                        </span>
                        <span className="font-mono text-xs text-mist-500">
                          {city.spots.toLocaleString("en-IN")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* Height: the canvas */}
          <Reveal delay={120} className="order-1 lg:order-2">
            <div className="glass relative h-[26rem] overflow-hidden rounded-[1.75rem] sm:h-[30rem]">
              <SceneFrame
                className="absolute inset-0"
                cameraPosition={[0, 1.1, 5.4]}
                fov={40}
                maxDpr={1.6}
              >
                <CityGlobe onHover={setActive} />
              </SceneFrame>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
                <span className="chip border-azure-500/30 bg-ink-900/80 text-azure-200">
                  Drag to spin · hover a marker
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
