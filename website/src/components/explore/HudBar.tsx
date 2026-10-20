"use client";

/**
 * The floating HUD above the map: search, quick filters, vehicle selector,
 * role switcher and the live hold pill.
 *
 * Everything here is a filter over data the map already holds, so the HUD stays
 * a pure presentation layer — no fetching, no duplicated state.
 */

import Link from "next/link";

import { formatClock } from "@/lib/format";
import { useDeadline } from "@/lib/useNow";
import type { DataSource, Role, Vehicle } from "@/lib/types";
import { useParkPeerStore } from "@/store/useParkPeerStore";

export interface ExploreFilters {
  availableNow: boolean;
  evCharger: boolean;
  covered: boolean;
  iotGate: boolean;
  maxPrice: number;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  availableNow: false,
  evCharger: false,
  covered: false,
  iotGate: false,
  maxPrice: 100,
};

export default function HudBar({
  filters,
  onFilters,
  vehicles,
  source,
  note,
  total,
  shown,
  onOpenDrawer,
}: {
  filters: ExploreFilters;
  onFilters: (next: ExploreFilters) => void;
  vehicles: Vehicle[];
  source: DataSource;
  note: string | null;
  total: number;
  shown: number;
  onOpenDrawer: () => void;
}) {
  const viewer = useParkPeerStore((s) => s.viewer);
  const viewRole = useParkPeerStore((s) => s.viewRole);
  const setViewRole = useParkPeerStore((s) => s.setViewRole);
  const vehicleId = useParkPeerStore((s) => s.vehicleId);
  const setVehicle = useParkPeerStore((s) => s.setVehicle);
  const expiry = useParkPeerStore((s) => s.lockExpiresAt);
  const active = useParkPeerStore((s) => s.activeBooking());
  const deadline = useDeadline(active?.status === "pending_lock" ? expiry : null);

  const toggle = (key: keyof ExploreFilters) =>
    onFilters({ ...filters, [key]: !filters[key] });

  const roles: Role[] = ["driver", "provider", "admin"];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-4">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3">
        <div className="glass pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
          <Link href="/" className="display flex items-center gap-2 px-2 text-base text-white">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500">
              <span className="h-2 w-2 rounded-[2px] bg-obsidian" />
            </span>
            Park<span className="-ml-1.5 text-emerald-400">Peer</span>
          </Link>

          <span className="hidden h-7 w-px bg-white/10 sm:block" />

          <label className="flex min-w-[220px] flex-1 items-center gap-2">
            <span className="sr-only">Search an area</span>
            <span className="mono text-[10px] tracking-[0.2em] text-slate-500">NEAR</span>
            <input
              defaultValue="Jubilee Hills, Hyderabad"
              className="w-full bg-transparent text-sm text-slate-200 outline-none"
            />
          </label>

          <span className="hidden h-7 w-px bg-white/10 md:block" />

          <label className="flex items-center gap-2">
            <span className="sr-only">Vehicle</span>
            <select
              value={vehicleId}
              onChange={(event) => setVehicle(event.target.value)}
              className="rounded-xl border border-white/10 bg-obsidian/70 px-3 py-2 text-xs text-slate-200 outline-none"
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </option>
              ))}
            </select>
          </label>

          <span className="hidden h-7 w-px bg-white/10 md:block" />

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-obsidian/60 p-1">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setViewRole(role)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold capitalize transition ${
                  viewRole === role
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {viewRole !== "driver" && (
            <Link
              href={viewRole === "admin" ? "/admin" : "/provider"}
              className="btn btn-ghost !px-3 !py-2 text-[11px]"
            >
              Open {viewRole} console
            </Link>
          )}

          <button type="button" onClick={onOpenDrawer} className="btn btn-primary !px-4 !py-2 text-[11px] lg:hidden">
            Booking panel
          </button>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Chip active={filters.availableNow} onClick={() => toggle("availableNow")}>
            Available now
          </Chip>
          <Chip active={filters.evCharger} onClick={() => toggle("evCharger")}>
            EV charger
          </Chip>
          <Chip active={filters.covered} onClick={() => toggle("covered")}>
            Covered
          </Chip>
          <Chip active={filters.iotGate} onClick={() => toggle("iotGate")}>
            IoT gate
          </Chip>
          <Chip active={filters.maxPrice <= 45} onClick={() => onFilters({ ...filters, maxPrice: filters.maxPrice <= 45 ? 100 : 45 })}>
            Under ₹45/hr
          </Chip>

          <span className="mono rounded-xl border border-white/10 bg-obsidian/70 px-3 py-1.5 text-[10px] tracking-[0.16em] text-slate-400">
            {shown}/{total} BAYS
          </span>

          <span
            className={`mono rounded-xl border px-3 py-1.5 text-[10px] tracking-[0.16em] ${
              source === "supabase"
                ? "border-emerald-500/40 text-emerald-300"
                : "border-amber-500/40 text-amber-300"
            }`}
            title={note ?? undefined}
          >
            {source === "supabase" ? "SUPABASE LIVE" : "SEED CATALOGUE"}
          </span>

          {viewer && (
            <span className="mono rounded-xl border border-white/10 bg-obsidian/70 px-3 py-1.5 text-[10px] tracking-[0.16em] text-slate-400">
              {viewer.email}
            </span>
          )}

          {deadline !== null && (
            <span className="mono animate-pulse rounded-xl border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-[10px] tracking-[0.16em] text-amber-200">
              HOLD {formatClock(deadline / 1000)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip transition ${
        active
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : "border-white/12 bg-obsidian/70 text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export const LEGEND = [
  { color: "bg-emerald-400", label: "Available" },
  { color: "bg-amber-400", label: "Held 10 min" },
  { color: "bg-cyan-400", label: "Active session" },
  { color: "bg-red-400", label: "Overstay" },
] as const;
