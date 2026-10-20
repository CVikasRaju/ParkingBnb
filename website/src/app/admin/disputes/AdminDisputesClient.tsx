"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveDispute, type DisputeAction } from "@/lib/actions/admin";
import type { AdminDispute } from "@/lib/data/console";

export default function AdminDisputesClient({
  initialDisputes,
  
}: {
  initialDisputes: AdminDispute[];
}) {
  const [disputes, setDisputes] = useState(initialDisputes);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  function handleResolve(disputeId: string, action: DisputeAction) {
    startTransition(async () => {
      const result = await resolveDispute({ disputeId, action });
      if (result.ok) {
        setDisputes((prev) =>
          prev.map((d) => (d.id === disputeId ? { ...d, resolved: true } : d))
        );
        setMessage({
          tone: "ok",
          text:
            action === "refund"
              ? "Driver refunded and host fined. Booking cancelled."
              : "Dispute dismissed.",
        });
      } else {
        setMessage({ tone: "bad", text: result.error });
      }
    });
  }

  const openCount = disputes.filter((d) => !d.resolved).length;

  return (
    <div className="min-h-screen bg-obsidian px-5 pt-28 pb-16 sm:px-8 text-white">
      <div className="mx-auto max-w-[1400px]">
        {/* Navigation tabs */}
        <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
          <Link
            href="/admin"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            🛰️ God-View
          </Link>
          <Link
            href="/admin/disputes"
            className="rounded-lg bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30"
          >
            ⚖️ Disputes ({openCount})
          </Link>
          <Link
            href="/admin/locks"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            🔒 Redis Lock Inspector
          </Link>
          <Link
            href="/admin/analytics"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            📊 Platform Analytics
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl font-bold">Dispute Resolution Center</h1>
          <p className="mt-1 text-sm text-slate-400">
            Review driver obstruction claims, photo evidence, and execute instantaneous refunds or dismissals.
          </p>
        </header>

        {message && (
          <div
            className={`mb-6 rounded-xl border p-4 text-sm ${
              message.tone === "ok"
                ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
                : "border-red-500/30 bg-red-950/40 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-slate-400 uppercase">
              <tr>
                <th className="px-6 py-4">Status / Reason</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Evidence</th>
                <th className="px-6 py-4">Reporter</th>
                <th className="px-6 py-4">Reported At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {disputes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No disputes logged on the platform.
                  </td>
                </tr>
              ) : (
                disputes.map((d) => (
                  <tr key={d.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            d.resolved ? "bg-slate-500" : "bg-red-400 animate-pulse"
                          }`}
                        />
                        <span className="font-semibold text-slate-200">
                          {d.reason.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">Booking: {d.bookingId.slice(0, 8)}</span>
                    </td>
                    <td className="max-w-xs px-6 py-4 text-slate-300">
                      {d.description}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPhoto(
                            "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800"
                          )
                        }
                        className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-white/20"
                      >
                        📸 View Photo
                      </button>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {d.reporterEmail}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(d.at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {d.resolved ? (
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                          Resolved
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleResolve(d.id, "refund")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Refund Driver & Fine Host
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleResolve(d.id, "dismiss")}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-2xl rounded-2xl bg-slate-900 p-4 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Obstruction Evidence Photo</h3>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Dispute evidence"
              className="max-h-[70vh] w-full rounded-lg object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
