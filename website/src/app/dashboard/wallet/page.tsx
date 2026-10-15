import type { Metadata } from "next";

import Icon, { type IconName } from "@/components/marketing/Icon";
import StatCard from "@/components/app/StatCard";
import { ledger, platformStats } from "@/lib/data/demo";
import { formatCurrency, formatCurrencyPrecise, formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Escrow balance, settlement ledger and payout details.",
};

const KIND_META: Record<
  (typeof ledger)[number]["kind"],
  { label: string; icon: IconName; tone: string }
> = {
  earning: { label: "Session earning", icon: "check", tone: "text-brand-300 bg-brand-500/12" },
  commission: { label: "Platform fee", icon: "chart", tone: "text-azure-300 bg-azure-500/12" },
  payout: { label: "Payout", icon: "wallet", tone: "text-mist-300 bg-ink-700" },
  refund: { label: "Refund", icon: "gavel", tone: "text-flare-300 bg-flare-500/12" },
};

export default function WalletPage() {
  const credits = ledger
    .filter((entry) => entry.amount > 0)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const debits = ledger
    .filter((entry) => entry.amount < 0)
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const available = credits - debits;

  // The host keeps everything except the platform commission.
  const lifetimeGross = credits / (1 - platformStats.commissionRate);
  const platformFees = lifetimeGross * platformStats.commissionRate;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mist-50">Wallet</h1>
        <p className="mt-1.5 text-sm text-mist-300">
          Escrow settlement, commission and payouts — all computed server-side.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatCurrency(available)}
          hint="Ready to withdraw"
          icon="wallet"
          tone="brand"
        />
        <StatCard
          label="Session earnings"
          value={formatCurrency(credits)}
          hint="Net of platform commission"
          icon="chart"
          tone="azure"
        />
        <StatCard
          label="Platform fees paid"
          value={formatCurrency(platformFees)}
          hint={`${platformStats.commissionRate * 100}% take rate`}
          icon="gavel"
          tone="muted"
        />
        <StatCard
          label="Payouts made"
          value={formatCurrency(debits)}
          hint="Weekly settlement cycle"
          icon="check"
          tone="flare"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Ledger */}
        <section className="card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-ink-700/60 px-6 py-5">
            <h2 className="text-base font-medium text-mist-50">Ledger</h2>
            <span className="text-[0.72rem] text-mist-500">
              {ledger.length} entries · {formatCurrencyPrecise(available)} available
            </span>
          </div>

          <ul className="divide-y divide-ink-700/60">
            {ledger.map((entry) => {
              const meta = KIND_META[entry.kind];
              return (
                <li key={entry.id} className="flex items-center gap-4 px-6 py-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                  >
                    <Icon name={meta.icon} size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.86rem] font-medium text-mist-100">
                      {entry.label}
                    </p>
                    <p className="truncate text-[0.74rem] text-mist-500">
                      {meta.label} · {entry.detail} · {formatDateTime(entry.at)}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 font-mono text-sm ${
                      entry.amount >= 0 ? "text-brand-300" : "text-mist-300"
                    }`}
                  >
                    {entry.amount >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(entry.amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Payout + escrow */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-medium text-mist-50">Payout method</h2>
            <div className="mt-5 flex items-center gap-4 rounded-xl border border-ink-700/70 bg-ink-900/60 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-azure-500/12 text-azure-300">
                <Icon name="wallet" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.86rem] font-medium text-mist-100">
                  HDFC Bank ••4412
                </p>
                <p className="text-[0.74rem] text-mist-500">
                  Weekly settlement · every Monday
                </p>
              </div>
              <span className="chip border-brand-500/40 text-[0.66rem] text-brand-200">
                Verified
              </span>
            </div>

            <button
              type="button"
              disabled
              className="btn-primary mt-5 w-full text-sm opacity-60"
            >
              Withdraw {formatCurrency(available)}
            </button>
            <p className="mt-2.5 text-center text-[0.72rem] text-mist-500">
              Withdrawals activate once a payment provider is connected.
            </p>
          </section>

          <section className="card p-6">
            <h2 className="text-base font-medium text-mist-50">How settlement works</h2>
            <ul className="mt-4 space-y-4">
              {[
                {
                  icon: "lock" as const,
                  title: "Pre-authorised at booking",
                  body: "Funds are held when the driver's spot is locked, then captured at checkout.",
                },
                {
                  icon: "chart" as const,
                  title: `${platformStats.commissionRate * 100}% platform fee`,
                  body: "Deducted from the gross session amount before your payout.",
                },
                {
                  icon: "clock" as const,
                  title: "Overstay billed automatically",
                  body: "Past the grace window, the session bills by the minute at your rate.",
                },
                {
                  icon: "gavel" as const,
                  title: "Disputes can reverse a charge",
                  body: "A upheld dispute refunds the driver and adjusts your ledger accordingly.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-brand-300">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <div>
                    <p className="text-[0.84rem] font-medium text-mist-100">{item.title}</p>
                    <p className="mt-0.5 text-[0.74rem] leading-relaxed text-mist-400">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
