"use client";

import { useMemo, useState } from "react";

import Icon from "@/components/marketing/Icon";
import StatCard from "@/components/app/StatCard";
import { bookings, platformStats, providerListings, type ProviderListing } from "@/lib/data/demo";
import { formatCurrency, formatDateTime } from "@/lib/format";

const STATUS_META: Record<
  ProviderListing["status"],
  { label: string; tone: string; dot: string }
> = {
  live: {
    label: "Live",
    tone: "border-brand-500/40 text-brand-200",
    dot: "bg-brand-400",
  },
  paused: {
    label: "Paused",
    tone: "border-flare-500/40 text-flare-300",
    dot: "bg-flare-400",
  },
  pending: {
    label: "Pending review",
    tone: "border-azure-500/40 text-azure-200",
    dot: "bg-azure-400",
  },
};

export default function ProviderClient() {
  const [listings, setListings] = useState(providerListings);

  const totals = useMemo(() => {
    const live = listings.filter((listing) => listing.status === "live");
    const earned = listings.reduce((sum, listing) => sum + listing.earnedThisMonth, 0);
    const utilisation =
      listings.length === 0
        ? 0
        : Math.round(
            listings.reduce((sum, listing) => sum + listing.utilisation, 0) / listings.length,
          );
    return { live: live.length, earned, utilisation };
  }, [listings]);

  const incoming = bookings.filter(
    (booking) => booking.status === "RESERVED" || booking.status === "LOCKED",
  );

  const toggle = (spotId: string) => {
    setListings((current) =>
      current.map((listing) =>
        listing.spotId === spotId
          ? {
              ...listing,
              status: listing.status === "live" ? "paused" : "live",
            }
          : listing,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mist-50">
          Host console
        </h1>
        <p className="mt-1.5 text-sm text-mist-300">
          Manage your bays, watch arrivals, and track what you&apos;ve earned this month.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Earned this month"
          value={formatCurrency(totals.earned)}
          hint={`After ${platformStats.commissionRate * 100}% platform fee`}
          icon="wallet"
          tone="brand"
        />
        <StatCard
          label="Live listings"
          value={String(totals.live)}
          hint={`${listings.length} total bays`}
          icon="home"
          tone="azure"
        />
        <StatCard
          label="Avg. utilisation"
          value={`${totals.utilisation}%`}
          hint="Share of bookable hours sold"
          icon="chart"
          tone="brand"
        />
        <StatCard
          label="Incoming arrivals"
          value={String(incoming.length)}
          hint="Confirmed vehicles on the way"
          icon="bell"
          tone="flare"
        />
      </div>

      {/* Incoming arrivals */}
      <section className="card p-6">
        <h2 className="text-base font-medium text-mist-50">Incoming arrivals</h2>
        <ul className="mt-5 space-y-3">
          {incoming.map((booking) => (
            <li
              key={booking.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-700/60 bg-ink-900/50 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-azure-500/12 text-azure-300">
                <Icon name="car" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.86rem] font-medium text-mist-100">
                  {booking.spotTitle}
                </p>
                <p className="truncate text-[0.74rem] text-mist-500">
                  {booking.plate} · {formatDateTime(booking.startsAt)}
                </p>
              </div>
              <span className="chip font-mono text-[0.7rem] text-mist-300">
                PIN {booking.pin}
              </span>
              <span className="shrink-0 text-sm font-medium text-mist-100">
                {formatCurrency(booking.total)}
              </span>
            </li>
          ))}
          {incoming.length === 0 ? (
            <li className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-4 text-sm text-mist-400">
              No vehicles inbound right now.
            </li>
          ) : null}
        </ul>
      </section>

      {/* Listings */}
      <section className="card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-mist-50">Your listings</h2>
          <span className="text-[0.74rem] text-mist-500">
            Toggling a bay here maps to the live availability flag in search.
          </span>
        </div>

        <ul className="mt-5 space-y-3">
          {listings.map((listing) => {
            const meta = STATUS_META[listing.status];
            return (
              <li
                key={listing.spotId}
                className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="truncate text-[0.88rem] font-medium text-mist-100">
                        {listing.title}
                      </p>
                      <span className={`chip border text-[0.66rem] ${meta.tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.74rem] text-mist-500">
                      {formatCurrency(listing.pricePerHour)}/hr ·{" "}
                      {listing.nextBookingAt
                        ? `Next arrival ${formatDateTime(listing.nextBookingAt)}`
                        : "No upcoming bookings"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-mist-50">
                      {formatCurrency(listing.earnedThisMonth)}
                    </p>
                    <p className="text-[0.68rem] text-mist-500">this month</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggle(listing.spotId)}
                    disabled={listing.status === "pending"}
                    className={`shrink-0 rounded-xl border px-3.5 py-2 text-[0.78rem] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      listing.status === "live"
                        ? "border-flare-500/40 text-flare-300 hover:bg-flare-500/10"
                        : "border-brand-500/40 text-brand-200 hover:bg-brand-500/10"
                    }`}
                  >
                    {listing.status === "live"
                      ? "Pause"
                      : listing.status === "paused"
                        ? "Go live"
                        : "Awaiting review"}
                  </button>
                </div>

                <div className="mt-3.5">
                  <div className="flex items-center justify-between text-[0.68rem] text-mist-500">
                    <span>Utilisation</span>
                    <span className="font-mono text-mist-300">{listing.utilisation}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-azure-400"
                      style={{ width: `${listing.utilisation}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
