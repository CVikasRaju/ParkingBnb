/**
 * Geodesy helpers.
 *
 * Distances are great-circle metres from the haversine formula — accurate to
 * roughly 0.5% at city scale, which is far inside the tolerance of a 50-metre
 * check-in fence. Anything that needs PostGIS precision (radius search, the
 * `search_nearby_parking` RPC) stays on the server.
 */

import { PLATFORM } from "@/lib/types";

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres between two WGS-84 points. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is the driver inside the check-in fence?
 *
 * Returns the distance too, so the UI can say how far outside the fence they
 * are instead of just refusing.
 */
export function insideGeofence(
  driver: LatLng,
  spot: LatLng,
  radiusMeters: number = PLATFORM.geofenceMeters,
): { inside: boolean; distance: number } {
  const distance = distanceMeters(driver, spot);
  return { inside: distance <= radiusMeters, distance };
}

/** Straight-line walking estimate at 1.35 m/s, rounded to whole minutes. */
export function walkMinutes(meters: number): number {
  return Math.max(0, Math.round(meters / 1.35 / 60));
}

/** Bounding box around a centre, used to pre-filter before exact distance. */
export function boundingBox(center: LatLng, radiusMeters: number) {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngDelta =
    latDelta / Math.max(0.01, Math.cos(toRadians(center.lat)));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/**
 * Decode a PostGIS `geography(POINT)` as returned by PostgREST.
 *
 * PostgREST hands geometry back as extended WKB hex rather than a lat/lng, e.g.
 * `0101000020E61000004BEA0434119A53401F85EB51B86E3140`. Layout for a point with
 * an SRID: 1 byte byte-order, 4 bytes type (high bit = SRID present), 4 bytes
 * SRID, then X (double LE) and Y (double LE). Coordinates are X = longitude,
 * Y = latitude.
 */
export function decodeEwkbPoint(hex: string): LatLng | null {
  if (typeof hex !== "string" || hex.length < 42) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }

  const view = new DataView(bytes.buffer);
  const littleEndian = view.getUint8(0) === 1;
  const typeWord = view.getUint32(1, littleEndian);
  const hasSrid = (typeWord & 0x20000000) !== 0;
  const offset = hasSrid ? 9 : 5;

  if (bytes.length < offset + 16) return null;

  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * The inverse of `decodeEwkbPoint`: encode a WGS-84 point as the extended WKB
 * hex PostgREST expects.
 *
 * Used by the seed catalogue so fixtures carry real coordinates instead of
 * pasted hex. Pasted hex is unreadable and unverifiable — a single wrong nibble
 * silently mislocates a bay — whereas this keeps the source of truth as
 * `lat`/`lng` and proves the round trip in the process.
 */
export function encodeEwkbPoint(lat: number, lng: number): string {
  const buffer = new ArrayBuffer(25);
  const view = new DataView(buffer);

  view.setUint8(0, 1); // little-endian
  view.setUint32(1, 0x20000001, true); // geometry type 1 (point) | SRID flag
  view.setUint32(5, 4326, true); // SRID
  view.setFloat64(9, lng, true); // X = longitude
  view.setFloat64(17, lat, true); // Y = latitude

  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
