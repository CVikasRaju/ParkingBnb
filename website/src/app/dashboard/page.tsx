import Link from "next/link";

import Icon from "@/components/marketing/Icon";
import StatCard from "@/components/app/StatCard";
import { requireSessionUser } from "@/lib/auth/session";
import { bookings, platformStats, spots } from "@/lib/data/demo";
import {
  bookingStatusMeta,
  formatCurrency,
  formatDateTime,
  formatDistance,
} from "@/lib/format";

export default async function DashboardOverviewPage() {
  const user = await requireSessionUser();

  const active = bookings.filter(
    (booking) => booking.status === "CHECKED_IN" || booking.status === "RESERVED",
  );
  const spend = bookings
    .filter((booking) => booking.status !== "CANCELLED")
    .reduce((total, booking) => total + booking.total, 0);

  const nearby = spots.filter((spot) => spot.available).slice(0, 4);

  return (
    <div className="space-y-7">
      {/* Greeting */}
      <div className="card relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brand-500/12 blur-[90px]" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[0.72rem] tracking-[0.2em] text-mist-400 uppercase">
              Signed in as {user.role}
            </p>
            <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-mist-50">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist-300">
              {active.length > 0
                ? `You have ${active.length} reservation${active.length > 1 ? "s" : ""} in flight. Your active pass holds the gate code and rotating QR token.`
                : "No reservations in flight right now. Find a bay near you and hold it for ten minutes."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link href="/dashboard/map" className="btn-primary text-sm">
              Find parking
              <Icon name="arrow" size={17} />
            </Link>
            {active.length > 0 ? (
              <Link href="/dashboard/pass" className="btn-ghost text-sm">
                Open active pass
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active reservations"
          value={String(active.length)}
          hint={`${platformStats.lockTtlMinutes}-minute hold on every claim`}
          icon="lock"
          tone="brand"
        />
        <StatCard
          label="Total spend"
          value={formatCurrency(spend)}
          hint={`${bookings.length} bookings all-time`}
          icon="wallet"
          tone="azure"
        />
        <StatCard
          label="Nearby availability"
          value={String(spots.filter((spot) => spot.available).length)}
          hint="Within the search radius"
          icon="pin"
          tone="brand"
        />
        <StatCard
          label="Avg. match time"
          value={`${platformStats.avgMatchSeconds}s`}
          hint="From tap to confirmed hold"
          icon="bolt"
          tone="flare"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* Recent bookings */}
        <section className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-medium text-mist-50">Recent bookings</h2>
            <Link
              href="/dashboard/bookings"
              className="text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              View all
            </Link>
          </div>

          <ul className="mt-5 divide-y divide-ink-700/60">
            {bookings.slice(0, 4).map((booking) => {
              const meta = bookingStatusMeta[booking.status];
              return (
                <li key={booking.id} className="flex items-center gap-4 py-3.5 first:pt-0">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-mist-100">
                      {booking.spotTitle}
                    </p>
                    <p className="truncate text-[0.76rem] text-mist-500">
                      {formatDateTime(booking.startsAt)} · {booking.plate}
                    </p>
                  </div>
                  <span
                    className={`chip shrink-0 border text-[0.68rem] ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-mist-300 sm:block">
                    {booking.total > 0 ? formatCurrency(booking.total) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Nearby */}
        <section className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-medium text-mist-50">Available nearby</h2>
            <Link
              href="/dashboard/map"
              className="text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              Open map
            </Link>
          </div>

          <ul className="mt-5 space-y-3">
            {nearby.map((spot) => (
              <li
                key={spot.id}
                className="flex items-center gap-3.5 rounded-xl border border-ink-700/60 bg-ink-900/50 p-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300">
                  <Icon name={spot.instantBook ? "bolt" : "pin"} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.84rem] font-medium text-mist-100">
                    {spot.title}
                  </p>
                  <p className="truncate text-[0.72rem] text-mist-500">
                    {formatDistance(spot.distanceMeters)} · {spot.walkMinutes} min walk ·{" "}
                    {spot.rating}★
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-mist-100">
                  {formatCurrency(spot.pricePerHour)}
                  <span className="text-[0.7rem] text-mist-500">/hr</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
