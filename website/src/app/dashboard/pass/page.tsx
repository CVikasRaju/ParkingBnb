import type { Metadata } from "next";

import ActivePass from "@/components/app/ActivePass";
import { bookings } from "@/lib/data/demo";

export const metadata: Metadata = {
  title: "Active pass",
  description: "Your rotating QR check-in pass, PIN fallback and live session timer.",
};

export default function ActivePassPage() {
  // Prefer a live session, then the nearest upcoming reservation.
  const active =
    bookings.find((booking) => booking.status === "CHECKED_IN") ??
    bookings.find((booking) => booking.status === "RESERVED") ??
    null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mist-50">
          Active pass
        </h1>
        <p className="mt-1.5 text-sm text-mist-300">
          Show this at the barrier, or check in automatically by geofence on arrival.
        </p>
      </div>

      <ActivePass booking={active} />
    </div>
  );
}
