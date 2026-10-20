import type { Metadata } from "next";

import ExploreClient from "@/components/explore/ExploreClient";
import { getSessionUser } from "@/lib/auth/session";
import { loadBookingsFor, loadLedger, loadSpotFeed, loadVehicles } from "@/lib/data/spots";
import { DEFAULT_CENTER } from "@/lib/data/seed";

export const metadata: Metadata = {
  title: "Live 3D map",
  description:
    "Browse verified driveways, garages and basement bays on a 3D map, then hold one for ten minutes while escrow is pre-authorised.",
};

/* The session cookie and the live catalogue both make this dynamic — there is
   nothing to pre-render. */
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const user = await getSessionUser();

  // Hyderabad city centre: the frame the catalogue is clustered around.
  const feed = await loadSpotFeed(DEFAULT_CENTER);
  const [vehicles, ledger] = await Promise.all([loadVehicles(), loadLedger()]);
  const bookings = user
    ? await loadBookingsFor(user.id, { spots: feed.spots, vehicles })
    : [];

  return (
    <ExploreClient
      initial={{
        spots: feed.spots,
        vehicles,
        bookings,
        ledger,
        source: feed.source,
        note: feed.note,
        viewer: user
          ? { id: user.id, name: user.name, email: user.email, role: user.role }
          : null,
        center: DEFAULT_CENTER,
      }}
    />
  );
}
