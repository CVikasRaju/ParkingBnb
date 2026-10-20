"use client";

/**
 * The live 3D map.
 *
 * Designed for crystal-clear readability in both Dark and Light modes:
 * 1. Supports 3 vector styles (Streets, Light, Dark) from OpenFreeMap plus
 *    an automatic zero-fail OpenStreetMap raster fallback.
 * 2. Synchronizes with the global site theme, and provides an on-canvas
 *    quick-switch pill [ Streets | Light | Dark ].
 * 3. Markers are high-contrast WebGL layers with glowing halos and clear
 *    pill badges, so price and status are immediately readable from any angle.
 */

import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

import { THEME_EVENT } from "@/components/theme/ThemeProvider";
import type { LatLng } from "@/lib/geo";
import type { Spot } from "@/lib/types";

export type MapStyleKey = "streets" | "light" | "dark";

const MAP_STYLES: Record<MapStyleKey, string> = {
  streets: "https://tiles.openfreemap.org/styles/liberty",
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** High-reliability OpenStreetMap raster fallback style if vector tiles are unreachable */
const OSM_RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-raster-layer",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 19,
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
  onReady?: () => void;
}

const EMPTY: { type: "FeatureCollection"; features: Feature[] } = {
  type: "FeatureCollection",
  features: [],
};

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
  const [styleKey, setStyleKey] = useState<MapStyleKey>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("light") ? "light" : "streets";
    }
    return "streets";
  });
  const fallbackActive = useRef(false);

  const geojson = useMemo(() => toGeoJson(spots, selectedId), [spots, selectedId]);
  const geojsonRef = useRef(geojson);

  useEffect(() => {
    geojsonRef.current = geojson;
  }, [geojson]);

  // Synchronize with external theme changes (from Nav or HudBar)
  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const custom = event as CustomEvent<{ theme: "dark" | "light" }>;
      if (custom.detail?.theme === "light") {
        setStyleKey("light");
      } else {
        setStyleKey("streets");
      }
    };

    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, []);

  // Re-attach custom parking spot layers whenever style changes or loads
  const setupLayers = (map: MapLibreMap) => {
    // 1. 3D basemap buildings (subtle, non-blocking)
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
              "fill-extrusion-color": "#475569",
              "fill-extrusion-height": [
                "coalesce",
                ["get", "render_height"],
                ["get", "height"],
                6,
              ],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.18,
            },
          },
          buildingLayer?.id,
        );
      } catch {
        // layer might exist on HMR
      }
    }

    // 2. Parking spots GeoJSON source
    if (!map.getSource("parkpeer-spots")) {
      map.addSource("parkpeer-spots", {
        type: "geojson",
        data: geojsonRef.current,
        promoteId: "id",
      });
    }

    // 3. Extruded bay beacon column
    if (!map.getLayer("parkpeer-columns")) {
      map.addLayer({
        id: "parkpeer-columns",
        type: "fill-extrusion",
        source: "parkpeer-spots",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["==", ["get", "status"], "available"],
            "#10b981",
            ["==", ["get", "status"], "locked"],
            "#f59e0b",
            "#06b6d4",
          ],
          "fill-extrusion-height": ["case", ["get", "selected"], 38, 20],
          "fill-extrusion-opacity": ["case", ["get", "selected"], 0.45, 0.24],
        },
      });
    }

    // 4. Glowing base pulse
    if (!map.getLayer("parkpeer-glow")) {
      map.addLayer({
        id: "parkpeer-glow",
        type: "circle",
        source: "parkpeer-spots",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "status"], "locked"],
            "#f59e0b",
            ["==", ["get", "status"], "available"],
            "#10b981",
            "#06b6d4",
          ],
          "circle-radius": 18,
          "circle-blur": 0.9,
          "circle-opacity": 0.35,
        },
      });
    }

    // 5. Crisp high-contrast spot pin
    if (!map.getLayer("parkpeer-pin")) {
      map.addLayer({
        id: "parkpeer-pin",
        type: "circle",
        source: "parkpeer-spots",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "status"], "locked"],
            "#f59e0b",
            ["==", ["get", "status"], "available"],
            "#10b981",
            "#06b6d4",
          ],
          "circle-radius": ["case", ["get", "selected"], 9, 6.5],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    // 6. High-contrast price badge
    if (!map.getLayer("parkpeer-price")) {
      map.addLayer({
        id: "parkpeer-price",
        type: "symbol",
        source: "parkpeer-spots",
        minzoom: 14.5,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, -1.8],
          "text-allow-overlap": true,
          "text-font": ["Noto Sans Bold", "Open Sans Bold"],
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": [
            "case",
            ["==", ["get", "status"], "available"],
            "#059669",
            ["==", ["get", "status"], "locked"],
            "#d97706",
            "#0284c7",
          ],
          "text-halo-width": 4,
          "text-halo-blur": 0.5,
        },
      });
    }

    // 7. Selected bay outer ring
    if (!map.getLayer("parkpeer-selected")) {
      map.addLayer({
        id: "parkpeer-selected",
        type: "circle",
        source: "parkpeer-spots",
        filter: ["==", ["get", "selected"], true],
        paint: {
          "circle-color": "transparent",
          "circle-radius": 24,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#10b981",
        },
      });
    }
  };

  /* ── Bootstrap Map ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialStyleUrl = MAP_STYLES[styleKey] || MAP_STYLES.streets;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyleUrl,
      center: [center.lng, center.lat],
      zoom: 16.2,
      pitch: 38,
      bearing: -15,
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

    let isMapReady = false;
    const markReady = () => {
      if (isMapReady) return;
      isMapReady = true;

      setupLayers(map);

      // Smooth pulsing glow
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let frame = 0;
        const pulse = () => {
          if (!mapRef.current || !map.getLayer("parkpeer-glow")) return;
          frame = window.requestAnimationFrame(pulse);
          const t = performance.now() / 900;
          map.setPaintProperty("parkpeer-glow", "circle-radius", 16 + Math.sin(t) * 3.5);
        };
        frame = window.requestAnimationFrame(pulse);
        map.once("remove", () => window.cancelAnimationFrame(frame));
      }

      setReady(true);
      onReady?.();
    };

    map.once("load", markReady);

    // Resilient fallback: if remote vector style fails or times out, swap to OSM raster
    const swapToOsmFallback = () => {
      if (fallbackActive.current || isMapReady) return;
      fallbackActive.current = true;
      map.setStyle(OSM_RASTER_FALLBACK);
      map.once("styledata", markReady);
    };

    map.once("error", swapToOsmFallback);
    const guardTimer = window.setTimeout(swapToOsmFallback, 7000);

    return () => {
      window.clearTimeout(guardTimer);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Switch style dynamically ───────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const styleUrl = MAP_STYLES[styleKey];
    if (!styleUrl) return;

    try {
      map.setStyle(styleUrl);
      map.once("styledata", () => {
        setupLayers(map);
        const source = map.getSource("parkpeer-spots");
        if (source && "setData" in source) {
          (source as maplibregl.GeoJSONSource).setData(geojsonRef.current as never);
        }
      });
    } catch {
      // ignore
    }
  }, [styleKey, ready]);

  /* ── Push GeoJSON changes into source ───────────────────────────────────── */
  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current?.getSource("parkpeer-spots");
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(geojson as never);
    }
  }, [geojson, ready]);

  /* ── Interactive Click & Hover ─────────────────────────────────────────── */
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

  /* ── Frame Selection ────────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedId) return;
    const spot = spots.find((candidate) => candidate.id === selectedId);
    if (!spot) return;

    map.flyTo({
      center: [spot.lng, spot.lat],
      zoom: Math.max(map.getZoom(), 16.8),
      pitch: 42,
      duration: 800,
      essential: true,
    });
  }, [selectedId, spots, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Floating Style Picker Pill on the Map */}
      <div className="absolute top-24 right-4 z-20 flex items-center gap-1 rounded-2xl border border-slate-300 bg-white/90 p-1 shadow-md backdrop-blur-md dark:border-white/12 dark:bg-obsidian/85 dark:shadow-none">
        <button
          type="button"
          onClick={() => setStyleKey("streets")}
          aria-label="Streets map style"
          className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
            styleKey === "streets"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          🗺️ Streets
        </button>
        <button
          type="button"
          onClick={() => setStyleKey("light")}
          aria-label="Light map style"
          className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
            styleKey === "light"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          ☀️ Light
        </button>
        <button
          type="button"
          onClick={() => setStyleKey("dark")}
          aria-label="Dark map style"
          className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
            styleKey === "dark"
              ? "bg-emerald-500 text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          🌙 Dark
        </button>
      </div>

      {!ready && (
        <div className="grid-lines grid-lines-fade absolute inset-0 grid place-items-center bg-obsidian">
          <p className="mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">
            Loading map tiles & parking spots…
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
