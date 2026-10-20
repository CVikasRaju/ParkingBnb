"use client";

/**
 * The live 3D map.
 *
 * Two decisions worth knowing:
 *
 * 1. **Markers are WebGL layers, not DOM.** Each bay becomes a small polygon
 *    that is extruded into a column (`fill-extrusion`), so the pins stand up out
 *    of the basemap at the 60° pitch the spec asks for. A DOM `<Marker>` per bay
 *    would thrash layout once the catalogue grows; three GPU layers do not care.
 * 2. **The style is remote but failure-tolerant.** The free OpenFreeMap dark
 *    style is the primary source; if it cannot load, the map swaps to a minimal
 *    inline style so the pins, the drawer and the whole booking flow still work
 *    offline.
 */

import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

import { statusColor } from "@/components/three/primitives";
import type { LatLng } from "@/lib/geo";
import type { Spot } from "@/lib/types";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Used when the remote style cannot be reached — pins still work. */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "parkpeer-void",
      type: "background",
      paint: { "background-color": "#060911" },
    },
  ],
};

type Feature = {
  type: "Feature";
  id: string;
  properties: {
    id: string;
    status: string;
    price: number;
    label: string;
    selected: boolean;
  };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

/** A ~16 m square around a point, which the extrusion turns into a column. */
function columnAround(lat: number, lng: number): number[][][] {
  const d = 0.00008;
  return [
    [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ],
  ];
}

function toGeoJson(spots: Spot[], selectedId: string | null): {
  type: "FeatureCollection";
  features: Feature[];
} {
  return {
    type: "FeatureCollection",
    features: spots.map((spot) => ({
      type: "Feature",
      id: spot.id,
      properties: {
        id: spot.id,
        status: spot.status,
        price: spot.pricePerHour,
        label: `₹${Math.round(spot.pricePerHour)}/hr`,
        selected: spot.id === selectedId,
      },
      geometry: { type: "Polygon", coordinates: columnAround(spot.lat, spot.lng) },
    })),
  };
}

export interface MapCanvasProps {
  spots: Spot[];
  selectedId: string | null;
  onSelect: (spotId: string) => void;
  onHover: (spotId: string | null) => void;
  center: LatLng;
  /** Fires once the map is ready to take commands. */
  onReady?: () => void;
}

const EMPTY = { type: "FeatureCollection" as const, features: [] as Feature[] };

export default function MapCanvas({
  spots,
  selectedId,
  onSelect,
  onHover,
  center,
  onReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  const geojson = useMemo(() => toGeoJson(spots, selectedId), [spots, selectedId]);

  /* ── Map bootstrap ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 16.4,
      pitch: 60,
      bearing: -20,
      // MapLibre v5 moved the WebGL context options under this key.
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "bottom-right",
    );

    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;

      // ── 3D basemap buildings ──
      // The dark style ships footprints but no extrusion; lift them so the map
      // reads as a city at 60° rather than a flat sheet.
      const buildingLayer = map
        .getStyle()
        ?.layers?.find((layer) => layer.id === "building");
      const buildingSource =
        buildingLayer && "source" in buildingLayer ? buildingLayer.source : undefined;

      if (buildingSource && !map.getLayer("parkpeer-buildings")) {
        try {
          map.addLayer(
            {
              id: "parkpeer-buildings",
              type: "fill-extrusion",
              source: String(buildingSource),
              "source-layer": "building",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#0d1626",
                "fill-extrusion-height": [
                  "coalesce",
                  ["get", "render_height"],
                  ["get", "height"],
                  8,
                ],
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                "fill-extrusion-opacity": 0.78,
              },
            },
            buildingLayer?.id,
          );
        } catch {
          // Layer already added by a previous HMR pass — harmless.
        }
      }

      // Created empty: the data effect below fills it on the same commit, and
      // keeping the source out of the bootstrap effect means the map is built
      // exactly once regardless of how often the catalogue changes.
      map.addSource("parkpeer-spots", {
        type: "geojson",
        data: EMPTY,
        promoteId: "id",
      });

      // The marker column. Height and colour both encode state.
      map.addLayer({
        id: "parkpeer-columns",
        type: "fill-extrusion",
        source: "parkpeer-spots",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["==", ["get", "status"], "available"],
            statusColor("available"),
            ["==", ["get", "status"], "locked"],
            statusColor("locked"),
            "#64748b",
          ],
          "fill-extrusion-height": ["case", ["get", "selected"], 46, 24],
          "fill-extrusion-opacity": ["case", ["get", "selected"], 0.5, 0.28],
        },
      });

      map.addLayer({
        id: "parkpeer-glow",
        type: "circle",
        source: "parkpeer-spots",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "status"], "locked"],
            statusColor("locked"),
            statusColor("available"),
          ],
          "circle-radius": 16,
          "circle-blur": 1,
          "circle-opacity": 0.28,
        },
      });

      map.addLayer({
        id: "parkpeer-pin",
        type: "circle",
        source: "parkpeer-spots",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "status"], "locked"],
            statusColor("locked"),
            statusColor("available"),
          ],
          "circle-radius": ["case", ["get", "selected"], 9, 6],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#060911",
        },
      });

      map.addLayer({
        id: "parkpeer-price",
        type: "symbol",
        source: "parkpeer-spots",
        minzoom: 15,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, -1.6],
          "text-allow-overlap": true,
          "text-font": ["Noto Sans Regular"],
        },
        paint: {
          "text-color": "#e2e8f4",
          "text-halo-color": "#060911",
          "text-halo-width": 2,
        },
      });

      // Halo on the selected bay only.
      map.addLayer({
        id: "parkpeer-selected",
        type: "circle",
        source: "parkpeer-spots",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-color": "transparent",
          "circle-radius": 22,
          "circle-stroke-width": 2,
          "circle-stroke-color": statusColor("available"),
        },
      });

      // Slow breathing glow, driven by one paint property instead of geometry.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let frame = 0;
        const pulse = () => {
          if (!mapRef.current || !map.getLayer("parkpeer-glow")) return;
          frame = window.requestAnimationFrame(pulse);
          const t = performance.now() / 900;
          map.setPaintProperty("parkpeer-glow", "circle-radius", 15 + Math.sin(t) * 3.5);
        };
        frame = window.requestAnimationFrame(pulse);
        map.once("remove", () => window.cancelAnimationFrame(frame));
      }

      setReady(true);
      onReady?.();
    };

    map.once("load", markReady);

    // Style unreachable (offline, blocked host) — swap to the inline void style
    // and build the marker layers on top of it instead of showing a blank map.
    let swapped = false;
    const swapToFallback = () => {
      if (swapped || ready) return;
      swapped = true;
      map.setStyle(FALLBACK_STYLE);
      map.once("styledata", markReady);
    };
    map.once("error", swapToFallback);
    const guard = window.setTimeout(swapToFallback, 8000);

    return () => {
      window.clearTimeout(guard);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Push data changes into the source ─────────────────────────────────── */
  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current?.getSource("parkpeer-spots");
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(geojson as never);
    }
  }, [geojson, ready]);

  /* ── Interactions ────────────────────────────────────────────────────────
     Bound in their own effect so the handlers always close over the current
     callbacks. The alternative — stashing props in refs — is what trips the
     React Compiler's "no ref writes during render" rule, and it is genuinely
     unnecessary here: MapLibre's `off` removes exactly the handler given. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const interactive = ["parkpeer-pin", "parkpeer-columns", "parkpeer-price"];

    const onClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") onSelect(id);
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onMove = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") onHover(id);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      onHover(null);
    };

    for (const layer of interactive) {
      map.on("click", layer, onClick);
      map.on("mouseenter", layer, onEnter);
      map.on("mousemove", layer, onMove);
      map.on("mouseleave", layer, onLeave);
    }

    return () => {
      if (!mapRef.current) return;
      for (const layer of interactive) {
        map.off("click", layer, onClick);
        map.off("mouseenter", layer, onEnter);
        map.off("mousemove", layer, onMove);
        map.off("mouseleave", layer, onLeave);
      }
    };
  }, [ready, onSelect, onHover]);

  /* ── Frame the selection ───────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;
    const spot = spots.find((candidate) => candidate.id === selectedId);
    if (!spot) return;

    map.flyTo({
      center: [spot.lng, spot.lat],
      zoom: Math.max(map.getZoom(), 17),
      pitch: 62,
      duration: 900,
      essential: true,
    });
  }, [selectedId, spots, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="grid-lines grid-lines-fade absolute inset-0 grid place-items-center bg-obsidian">
          <p className="mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">
            Aligning satellite grid
          </p>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {spots.length} bays on the map
      </span>
    </div>
  );
}

export { EMPTY as EMPTY_FEATURES };
