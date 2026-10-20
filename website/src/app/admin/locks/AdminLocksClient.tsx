"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { forceReleaseLock } from "@/lib/actions/bookings";
import type { AdminLock } from "@/lib/data/console";

export default function AdminLocksClient({
  initialLocks,
  
}: {
  initialLocks: AdminLock[];
}) {
  const [locks, setLocks] = useState(initialLocks);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function handleEvict(bookingId: string) {
    startTransition(async () => {
      const result = await forceReleaseLock(bookingId);
      if (result.ok) {
        setLocks((prev) => prev.filter((l) => l.bookingId !== bookingId));
        setMessage({
          tone: "ok",
          text: `Lock key for booking ${bookingId.slice(0, 8)} successfully evicted from Redis cache. Spot restored to AVAILABLE.`,
        });
      } else {
        setMessage({ tone: "bad", text: result.error });
      }
    });
  }

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
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            ⚖️ Disputes
          </Link>
          <Link
            href="/admin/locks"
            className="rounded-lg bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30"
          >
            🔒 Redis Lock Inspector ({locks.length})
          </Link>
          <Link
            href="/admin/analytics"
            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            📊 Platform Analytics
          </Link>
        </div>

        <header className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Redis Concurrency Inspector</h1>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-400 ring-1 ring-amber-500/30">
              Pattern: lock:spot:* (NX EX 600)
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real-time atomic distributed locks currently active across the Redis cluster. Force-evict stuck locks caused by network drops or crashed checkout sessions.
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
                <th className="px-6 py-4">Redis Lock Key</th>
                <th className="px-6 py-4">Spot Title & Bay</th>
                <th className="px-6 py-4">Driver / Plate</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Lock Age / TTL</th>
                <th className="px-6 py-4 text-right">Emergency Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {locks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No active Redis locks detected. Concurrency pipeline is clear.
                  </td>
                </tr>
              ) : (
                locks.map((lock) => (
                  <tr key={lock.bookingId} className="hover:bg-white/5">
                    <td className="px-6 py-4 font-mono text-xs text-cyan-300">
                      lock:spot:{lock.spotId.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200">{lock.spotTitle}</div>
                      <div className="text-xs text-slate-400">Host: {lock.hostName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-300">{lock.driverEmail}</div>
                      <div className="font-mono text-xs text-slate-500">{lock.plate}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
                        {lock.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      Created: {new Date(lock.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleEvict(lock.bookingId)}
                        className="rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-500 disabled:opacity-50"
                      >
                        Force Evict Lock
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
