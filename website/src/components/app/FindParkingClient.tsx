"use client";

import { useEffect, useMemo, useState } from "react";

import Icon from "@/components/marketing/Icon";
import ParkingMapLoader from "@/components/app/ParkingMapLoader";
import { spots as allSpots, platformStats, type Spot } from "@/lib/data/demo";
import { formatCurrency, formatDistance } from "@/lib/format";

type FilterKey = "instantBook" | "Covered" | "EV charger" | "24×7";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "instantBook", label: "Instant book" },
  { key: "Covered", label: "Covered" },
  { key: "EV charger", label: "EV charging" },
  { key: "24×7", label: "24×7 access" },
];

const LOCK_SECONDS = platformStats.lockTtlMinutes * 60;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function FindParkingClient() {
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lock, setLock] = useState<{ spot: Spot; secondsLeft: number } | null>(null);
  const [confirmed, setConfirmed] = useState<Spot | null>(null);

  const filtered = useMemo(() => {
    return allSpots.filter((spot) => {
      return activeFilters.every((filter) => {
        if (filter === "instantBook") return spot.instantBook;
        return spot.features.includes(filter);
      });
    });
  }, [activeFilters]);

  const selected = useMemo(
    () => filtered.find((spot) => spot.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  // Tick the hold countdown down once per second.
  useEffect(() => {
    if (!lock || lock.secondsLeft <= 0) return;
    const timer = setTimeout(
      () => setLock({ spot: lock.spot, secondsLeft: lock.secondsLeft - 1 }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [lock]);

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const availableCount = filtered.filter((spot) => spot.available).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-mist-50">
            Find parking
          </h1>
          <p className="mt-1.5 text-sm text-mist-300">
            {availableCount} of {filtered.length} bays available within 5 km of
            Hyderabad centre.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = activeFilters.includes(filter.key);
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => toggleFilter(filter.key)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-2 text-[0.78rem] transition-colors ${
                  active
                    ? "border-brand-400/60 bg-brand-500/12 text-brand-200"
                    : "border-ink-600/80 bg-ink-800/60 text-mist-300 hover:text-mist-100"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active hold banner */}
      {lock ? (
        <div
          className={`flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 ${
            lock.secondsLeft > 0
              ? "border-flare-500/40 bg-flare-500/10"
              : "border-ink-600/70 bg-ink-900/60"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-900/70 text-flare-300">
            <Icon name="lock" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-mist-50">
              {lock.secondsLeft > 0
                ? `Hold active — ${lock.spot.title}`
                : "Hold expired — the bay was released"}
            </p>
            <p className="text-[0.78rem] text-mist-400">
              {lock.secondsLeft > 0
                ? "Payment pre-authorising. The bay cannot be booked by anyone else."
                : "Lock TTL elapsed before confirmation, exactly as the backend would release it."}
            </p>
          </div>
          <span
            className={`shrink-0 font-mono text-xl font-semibold ${
              lock.secondsLeft > 0 ? "text-flare-300" : "text-mist-400"
            }`}
          >
            {formatClock(Math.max(0, lock.secondsLeft))}
          </span>
          {lock.secondsLeft > 0 ? (
            <button
              type="button"
              onClick={() => {
                setConfirmed(lock.spot);
                setLock(null);
              }}
              className="btn-primary shrink-0 text-sm"
            >
              Confirm booking
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLock(null)}
              className="btn-ghost shrink-0 text-sm"
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null}

      {confirmed ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
            <Icon name="check" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-mist-50">
              Reserved — {confirmed.title}
            </p>
            <p className="text-[0.78rem] text-mist-400">
              Your pass is ready. In the live system this fires the booking FSM
              transition to RESERVED and pushes the arrival alert to the host.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmed(null)}
            className="btn-ghost shrink-0 text-sm"
          >
            Book another
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Map */}
        <div className="card overflow-hidden p-0">
          <div className="h-[26rem] sm:h-[32rem]">
            <ParkingMapLoader
              spots={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>

        {/* Detail + list */}
        <div className="space-y-6">
          {selected ? (
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.7rem] tracking-[0.2em] text-mist-500 uppercase">
                    {selected.type}
                  </p>
                  <h2 className="mt-2 text-lg font-medium text-mist-50">
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-[0.82rem] text-mist-400">{selected.address}</p>
                </div>
                <span
                  className={`chip shrink-0 ${
                    selected.available
                      ? "border-brand-500/40 text-brand-200"
                      : "text-mist-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selected.available ? "bg-brand-400" : "bg-mist-500"
                    }`}
                  />
                  {selected.available ? "Available" : "Occupied"}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { k: "Rate", v: `${formatCurrency(selected.pricePerHour)}/hr` },
                  { k: "Distance", v: formatDistance(selected.distanceMeters) },
                  { k: "Rating", v: `${selected.rating}★ (${selected.reviews})` },
                ].map((stat) => (
                  <div
                    key={stat.k}
                    className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-3"
                  >
                    <dd className="text-sm font-semibold text-mist-50">{stat.v}</dd>
                    <dt className="mt-0.5 text-[0.66rem] tracking-wide text-mist-500 uppercase">
                      {stat.k}
                    </dt>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {selected.features.map((feature) => (
                  <span key={feature} className="chip text-[0.7rem] text-mist-300">
                    {feature}
                  </span>
                ))}
              </div>

              <p className="mt-5 text-[0.8rem] text-mist-400">
                Hosted by <span className="text-mist-200">{selected.providerName}</span> ·{" "}
                {selected.walkMinutes} min walk · capacity {selected.capacity}
              </p>

              <button
                type="button"
                disabled={!selected.available || lock !== null || confirmed !== null}
                onClick={() => {
                  setLock({ spot: selected, secondsLeft: LOCK_SECONDS });
                  setConfirmed(null);
                }}
                className="btn-primary mt-6 w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="lock" size={17} />
                {selected.available ? `Hold for ${platformStats.lockTtlMinutes} minutes` : "Unavailable"}
              </button>
              <p className="mt-2.5 text-center text-[0.72rem] text-mist-500">
                Atomic hold — no other driver can claim this bay while it is yours.
              </p>
            </div>
          ) : (
            <div className="card p-6">
              <p className="text-sm text-mist-300">
                Select a pin on the map or a spot below to see rates, amenities and
                the hold action.
              </p>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-base font-medium text-mist-50">Nearby bays</h2>
            <ul className="mt-4 max-h-[24rem] space-y-2.5 overflow-y-auto pr-1">
              {filtered.map((spot) => (
                <li key={spot.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(spot.id)}
                    className={`flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-colors ${
                      spot.id === selectedId
                        ? "border-brand-400/60 bg-brand-500/10"
                        : "border-ink-700/60 bg-ink-900/50 hover:border-ink-600"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        spot.available
                          ? "bg-brand-500/12 text-brand-300"
                          : "bg-ink-700 text-mist-400"
                      }`}
                    >
                      <Icon name="pin" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-medium text-mist-100">
                        {spot.title}
                      </p>
                      <p className="truncate text-[0.72rem] text-mist-500">
                        {formatDistance(spot.distanceMeters)} · {spot.walkMinutes} min walk ·{" "}
                        {spot.type}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-mist-100">
                      {formatCurrency(spot.pricePerHour)}
                      <span className="text-[0.7rem] text-mist-500">/hr</span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-4 text-sm text-mist-400">
                  No bays match these filters. Try removing one.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
