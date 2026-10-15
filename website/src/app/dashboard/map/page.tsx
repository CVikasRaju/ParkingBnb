import type { Metadata } from "next";

import FindParkingClient from "@/components/app/FindParkingClient";

export const metadata: Metadata = {
  title: "Find parking",
  description: "Browse verified parking bays near you and hold one for ten minutes.",
};

export default function FindParkingPage() {
  return <FindParkingClient />;
}
