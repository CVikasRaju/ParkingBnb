"use client";

import { useMemo, useState } from "react";

import Icon from "@/components/marketing/Icon";
import { bookings, type BookingStatus } from "@/lib/data/demo";
import {
  bookingStatusMeta,
  formatCurrency,
  formatDateTime,
  formatDuration,
} from "@/lib/format";

const FILTERS: { key: BookingStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RESERVED", label: "Reserved" },
  { key: "CHECKED_IN", label: "Parked" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function BookingsClient() {
  const [filter, setFilter] = useState<BookingStatus | "ALL">("ALL");

  const rows = useMemo(
    () => (filter === "ALL" ? bookings : bookings.filter((b) => b.status === filter)),
    [filter],
  );

  const totalSpend = bookings
    .filter((booking) => booking.status !== "CANCELLED")
    .reduce((sum, booking) => sum + booking.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-mist-50">Bookings</h1>
          <p className="mt-1.5 text-sm text-mist-300">
            Every reservation follows the same enforced state machine.
          </p>
        </div>
        <div className="chip text-mist-300">
          Lifetime spend <span className="font-mono text-mist-100">{formatCurrency(totalSpend)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = filter === option.key;
          const count =
            option.key === "ALL"
              ? bookings.length
              : bookings.filter((booking) => booking.status === option.key).length;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-2 text-[0.78rem] transition-colors ${
                active
                  ? "border-brand-400/60 bg-brand-500/12 text-brand-200"
                  : "border-ink-600/80 bg-ink-800/60 text-mist-300 hover:text-mist-100"
              }`}
            >
              {option.label}
              <span className="ml-2 font-mono text-[0.7rem] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {rows.map((booking) => {
          const meta = bookingStatusMeta[booking.status];
          return (
            <article key={booking.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-base font-medium text-mist-50">
                      {booking.spotTitle}
                    </h2>
                    <span className={`chip border text-[0.68rem] ${meta.tone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.82rem] text-mist-400">{booking.address}</p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold text-mist-50">
                    {booking.total > 0 ? formatCurrency(booking.total) : "—"}
                  </p>
                  <p className="text-[0.72rem] text-mist-500">
                    {formatCurrency(booking.hourlyRate)}/hr
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 border-t border-ink-700/60 pt-5 sm:grid-cols-4">
                {[
                  { k: "Window", v: formatDateTime(booking.startsAt) },
                  {
                    k: "Duration",
                    v: formatDuration(booking.startsAt, booking.endsAt),
                  },
                  { k: "Vehicle", v: booking.plate },
                  { k: "Booking ID", v: booking.id },
                ].map((row) => (
                  <div key={row.k}>
                    <dt className="text-[0.68rem] tracking-wide text-mist-500 uppercase">
                      {row.k}
                    </dt>
                    <dd className="mt-1 truncate font-mono text-[0.82rem] text-mist-200">
                      {row.v}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 flex items-center gap-2 text-[0.76rem] text-mist-400">
                <Icon name="clock" size={14} />
                {meta.description}
              </p>
            </article>
          );
        })}

        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-mist-400">
            No bookings with this status.
          </div>
        ) : null}
      </div>
    </div>
  );
}
