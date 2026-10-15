"use client";

import dynamic from "next/dynamic";

import type { Spot } from "@/lib/data/demo";

/**
 * Leaflet touches `window` on import, so the map is loaded client-side only.
 * `next/dynamic` with `ssr: false` must itself live in a Client Component,
 * which is why this thin loader exists separately from the page.
 */
const ParkMaps = dynamic(() => import("@/components/app/leaflet/ParkMaps"), {
  ssr: false,
  loading: () => (
    <div className="shimmer flex h-full w-full items-center justify-center">
      <span className="text-xs tracking-[0.25em] text-mist-500 uppercase">
        Loading map
      </span>
    </div>
  ),
});

export default function ParkingMapLoader(props: {
  spots: Spot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return <ParkMaps {...props} />;
}
