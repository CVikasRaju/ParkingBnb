"use client";

import { useMemo, useState } from "react";

import Icon, { type IconName } from "@/components/marketing/Icon";
import StatCard from "@/components/app/StatCard";
import { disputes, platformStats, providerListings, type Dispute } from "@/lib/data/demo";
import { formatCurrency, formatDateTime } from "@/lib/format";

const STATUS_META: Record<
  Dispute["status"],
  { label: string; tone: string; dot: string }
> = {
  open: { label: "Open", tone: "border-flare-500/40 text-flare-300", dot: "bg-flare-400" },
  reviewing: {
    label: "Reviewing",
    tone: "border-azure-500/40 text-azure-200",
    dot: "bg-azure-400",
  },
  resolved: { label: "Resolved", tone: "border-brand-500/40 text-brand-200", dot: "bg-brand-400" },
};

const VERIFICATION_QUEUE: { name: string; type: string; submitted: string; icon: IconName }[] = [
  { name: "Corner garage · Begumpet", type: "Property", submitted: "2 hours ago", icon: "home" },
  { name: "Ishaan M.", type: "Identity", submitted: "6 hours ago", icon: "users" },
  { name: "FinTech Plaza", type: "Commercial", submitted: "1 day ago", icon: "shield" },
];

export default function AdminClient() {
  const [rows, setRows] = useState(disputes);

  const counts = useMemo(
    () => ({
      open: rows.filter((row) => row.status === "open").length,
      reviewing: rows.filter((row) => row.status === "reviewing").length,
      resolved: rows.filter((row) => row.status === "resolved").length,
    }),
    [rows],
  );

  const advance = (id: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              status:
                row.status === "open" ? "reviewing" : row.status === "reviewing" ? "resolved" : "resolved",
            }
          : row,
      ),
    );
  };

  const pendingListings = providerListings.filter((listing) => listing.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mist-50">Admin</h1>
        <p className="mt-1.5 text-sm text-mist-300">
          Moderate disputes, verify hosts and properties, and watch escrow health.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open disputes"
          value={String(counts.open)}
          hint={`${counts.reviewing} under review`}
          icon="gavel"
          tone="flare"
        />
        <StatCard
          label="Pending listings"
          value={String(pendingListings)}
          hint="Awaiting verification"
          icon="home"
          tone="azure"
        />
        <StatCard
          label="Markets live"
          value={String(platformStats.citiesLive)}
          hint={`${platformStats.providers.toLocaleString("en-IN")} hosts`}
          icon="globe"
          tone="brand"
        />
        <StatCard
          label="Take rate"
          value={`${platformStats.commissionRate * 100}%`}
          hint="Applied to every completed session"
          icon="chart"
          tone="muted"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Disputes */}
        <section className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-medium text-mist-50">Dispute desk</h2>
            <span className="text-[0.72rem] text-mist-500">
              Refund, then advance the case stage
            </span>
          </div>

          <ul className="mt-5 space-y-3">
            {rows.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-ink-700/60 bg-ink-900/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <p className="truncate text-[0.86rem] font-medium text-mist-100">
                          {row.spotTitle}
                        </p>
                        <span className={`chip border text-[0.66rem] ${meta.tone}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.74rem] text-mist-500">
                        {row.reason} · raised by {row.raisedBy}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.68rem] text-mist-500">
                        {row.bookingId} · {formatDateTime(row.at)}
                      </p>
                    </div>

                    {row.status !== "resolved" ? (
                      <button
                        type="button"
                        onClick={() => advance(row.id)}
                        className="shrink-0 rounded-xl border border-brand-500/40 px-3.5 py-2 text-[0.78rem] text-brand-200 transition-colors hover:bg-brand-500/10"
                      >
                        {row.status === "open" ? "Start review" : "Resolve & refund"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[0.74rem] text-mist-500">Closed</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-6">
          {/* Verification queue */}
          <section className="card p-6">
            <h2 className="text-base font-medium text-mist-50">Verification queue</h2>
            <ul className="mt-4 space-y-3">
              {VERIFICATION_QUEUE.map((item) => (
                <li key={item.name} className="flex items-center gap-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-azure-300">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.84rem] text-mist-100">{item.name}</p>
                    <p className="text-[0.72rem] text-mist-500">
                      {item.type} · {item.submitted}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-ink-600 px-3 py-1.5 text-[0.72rem] text-mist-300 transition-colors hover:border-brand-400/50 hover:text-brand-200"
                  >
                    Review
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Escrow health */}
          <section className="card p-6">
            <h2 className="text-base font-medium text-mist-50">Escrow health</h2>
            <dl className="mt-4 space-y-3.5">
              {[
                { k: "Held in escrow", v: formatCurrency(184200) },
                { k: "Settled this week", v: formatCurrency(96240) },
                { k: "Refunds issued", v: formatCurrency(4380) },
                { k: "Failed session rate", v: "0.42%" },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex items-center justify-between border-b border-ink-700/50 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-[0.82rem] text-mist-400">{row.k}</dt>
                  <dd className="font-mono text-[0.86rem] text-mist-100">{row.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-mist-500">
              Figures are illustrative. With the API connected these come from the
              payments module in <span className="font-mono">backend/src/modules/payments</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
