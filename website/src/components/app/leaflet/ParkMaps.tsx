"use client";

// Leaflet ships its own stylesheet; imported here so it only loads with the map.
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import type { Spot } from "@/lib/data/demo";
import { formatCurrency, formatDistance } from "@/lib/format";

/** Hyderabad city centre — mirrors the demo dataset. */
const CENTER: [number, number] = [17.385, 78.4867];

function markerIcon(spot: Spot, selected: boolean) {
  const background = selected
    ? "#e9eefb"
    : spot.available
      ? "#0dd9a3"
      : "#61708f";
  const ring = selected
    ? "0 0 0 6px rgba(233,238,251,0.25)"
    : spot.available
      ? "0 0 0 6px rgba(13,217,163,0.18)"
      : "0 0 0 5px rgba(97,112,143,0.16)";
  const colour = spot.available || selected ? "#04060c" : "#0a1120";

  return L.divIcon({
    className: "parkpeer-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:${background};box-shadow:${ring};color:${colour};font:600 11px/1 ui-sans-serif,system-ui,sans-serif;">₹${spot.pricePerHour}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

export default function ParkMaps({
  spots,
  selectedId,
  onSelect,
}: {
  spots: Spot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Rebuilding icons when the selection changes keeps the active pin legible.
  const iconFor = useMemo(
    () => (spot: Spot) => markerIcon(spot, spot.id === selectedId),
    [selectedId],
  );

  return (
    <MapContainer
      center={CENTER}
      zoom={12}
      scrollWheelZoom={false}
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      {/* Search radius, matching the API's default ST_DWithin envelope. */}
      <Circle
        center={CENTER}
        radius={5000}
        pathOptions={{
          color: "#0dd9a3",
          weight: 1,
          opacity: 0.4,
          fillColor: "#0dd9a3",
          fillOpacity: 0.05,
        }}
      />

      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={iconFor(spot)}
          eventHandlers={{ click: () => onSelect(spot.id) }}
        >
          <Popup>
            <div style={{ minWidth: 190 }}>
              <strong style={{ fontSize: 13, color: "#04060c" }}>{spot.title}</strong>
              <div style={{ marginTop: 4, fontSize: 12, color: "#33405c" }}>
                {spot.address}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "#04060c",
                }}
              >
                <span>{formatCurrency(spot.pricePerHour)}/hr</span>
                <span>{formatDistance(spot.distanceMeters)}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#5c6a86" }}>
                {spot.available ? "Available now" : "Currently occupied"} · {spot.rating}★
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
