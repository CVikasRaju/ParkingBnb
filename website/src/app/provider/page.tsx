import type { Metadata } from "next";

import Nav from "@/components/shell/Nav";
import ProviderStudio from "@/components/provider/ProviderStudio";
import { requireRole } from "@/lib/auth/session";
import { loadHostConsole } from "@/lib/data/console";

export const metadata: Metadata = {
  title: "Host console",
  description:
    "Shape a bay, price it, watch arrivals, verify a driver at the gate and read the payout ledger.",
};

export const dynamic = "force-dynamic";

export default async function ProviderPage() {
  // Providers and operators only; everyone else is returned to the map.
  const user = await requireRole("provider", "/provider");
  const console = await loadHostConsole(user.id);

  return (
    <>
      <Nav user={user} />
      <ProviderStudio
        initial={console}
        provider={{ id: user.id, name: user.name, email: user.email }}
      />
    </>
  );
}
