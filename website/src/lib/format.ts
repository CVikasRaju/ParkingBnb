import type { BookingStatus, SpotStatus } from "@/lib/types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact rupee amount, e.g. ₹1,240. */
export function formatCurrency(amount: number): string {
  return inr.format(amount);
}

/** Rupee amount with paise — used for escrow splits and ledger lines. */
export function formatCurrencyPrecise(amount: number): string {
  return inrPrecise.format(amount);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3h 20m" between two instants. */
export function formatDuration(fromIso: string, toIso: string): string {
  const ms = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());
  return formatMinutes(Math.round(ms / 60000));
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** mm:ss — the countdown format for the hold pill and session timer. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** hh:mm:ss — the long form for an active parking session. */
export function formatLongClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return [hh, mm, ss].map((v) => String(v).padStart(2, "0")).join(":");
}

/** "250 m" / "1.4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** "17.4325° N, 78.4073° E" — the mono readout in the HUD. */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/** "KA-19-MG-2026" → normalised, mono display plate. */
export function formatPlate(plate: string): string {
  return plate.trim().toUpperCase();
}

export const spotStatusMeta: Record<
  SpotStatus,
  { label: string; dot: string; text: string; border: string }
> = {
  available: {
    label: "Available",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
  },
  locked: {
    label: "Held",
    dot: "bg-amber-400",
    text: "text-amber-300",
    border: "border-amber-500/40",
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-red-400",
    text: "text-red-300",
    border: "border-red-500/40",
  },
  inactive: {
    label: "Inactive",
    dot: "bg-slate-400",
    text: "text-slate-300",
    border: "border-white/15",
  },
};

/**
 * Lifecycle presentation. Labels are the user-facing names of the four phases
 * in the spec; the underlying states are the backend FSM's.
 */
export const bookingStatusMeta: Record<
  BookingStatus,
  { label: string; tone: string; dot: string; description: string }
> = {
  pending_lock: {
    label: "Locked",
    tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    dot: "bg-amber-400",
    description: "10-minute hold — payment pre-authorising",
  },
  reserved: {
    label: "Reserved",
    tone: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
    dot: "bg-cyan-400",
    description: "Confirmed — your pass is live",
  },
  checked_in: {
    label: "Parked",
    tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    dot: "bg-emerald-400",
    description: "Session running — billed on checkout",
  },
  completed: {
    label: "Completed",
    tone: "text-slate-300 border-white/15 bg-white/5",
    dot: "bg-slate-400",
    description: "Settled — host paid out",
  },
  cancelled: {
    label: "Cancelled",
    tone: "text-slate-400 border-white/10 bg-white/[0.03]",
    dot: "bg-slate-500",
    description: "Released — no charge",
  },
  overstayed: {
    label: "Overstayed",
    tone: "text-red-300 border-red-500/40 bg-red-500/10",
    dot: "bg-red-400",
    description: "Past the end time — penalty accruing",
  },
  disputed: {
    label: "Disputed",
    tone: "text-red-300 border-red-500/40 bg-red-500/10",
    dot: "bg-red-400",
    description: "Under review by an operator",
  },
};

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
