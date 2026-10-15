import type { Metadata } from "next";

import BookingsClient from "@/components/app/BookingsClient";

export const metadata: Metadata = {
  title: "Bookings",
  description: "All your ParkPeer reservations and their current lifecycle state.",
};

export default function BookingsPage() {
  return <BookingsClient />;
}
