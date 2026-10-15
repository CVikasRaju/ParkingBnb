import type { BookingStatus } from "@/lib/data/demo";

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

/** Rupee amount with paise, used for escrow splits and ledgers. */
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

/** "3h 20m" style duration between two ISO timestamps. */
export function formatDuration(fromIso: string, toIso: string): string {
  const ms = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** "250 m" / "1.4 km" from a metre distance. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Booking FSM presentation. The state names mirror the backend state machine
 * in `backend/src/lib/fsm.ts` so the web UI and the mobile app agree.
 */
export const bookingStatusMeta: Record<
  BookingStatus,
  { label: string; tone: string; dot: string; description: string }
> = {
  LOCKED: {
    label: "Locked",
    tone: "text-flare-300 border-flare-500/40 bg-flare-500/10",
    dot: "bg-flare-400",
    description: "10-minute hold — payment pre-authorizing",
  },
  RESERVED: {
    label: "Reserved",
    tone: "text-azure-300 border-azure-500/40 bg-azure-500/10",
    dot: "bg-azure-400",
    description: "Confirmed — your pass is ready",
  },
  CHECKED_IN: {
    label: "Parked",
    tone: "text-brand-300 border-brand-500/40 bg-brand-500/10",
    dot: "bg-brand-400",
    description: "Session running — billed on checkout",
  },
  COMPLETED: {
    label: "Completed",
    tone: "text-mist-300 border-ink-500 bg-ink-700/60",
    dot: "bg-mist-400",
    description: "Settled — provider paid out",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "text-mist-400 border-ink-600 bg-ink-800/60",
    dot: "bg-mist-500",
    description: "Released — no charge",
  },
};

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}
