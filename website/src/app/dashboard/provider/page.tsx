import type { Metadata } from "next";

import ProviderClient from "@/components/app/ProviderClient";

export const metadata: Metadata = {
  title: "Host console",
  description: "Manage listings, arrivals and earnings as a ParkPeer host.",
};

export default function ProviderPage() {
  return <ProviderClient />;
}
