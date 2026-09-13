/**
 * Geofence verification — server-side Haversine check (ARCHITECTURE §4):
 * pass if distance(driver, spot) <= 50 m. Never trust a client-side claim.
 */
import { env } from "../config/env";

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function isWithinGeofence(
  driverLat: number,
  driverLng: number,
  spotLat: number,
  spotLng: number,
  radiusMeters: number = env.CHECKIN_GEOFENCE_METERS
): { within: boolean; distanceMeters: number } {
  const distanceMeters = haversineMeters(driverLat, driverLng, spotLat, spotLng);
  return { within: distanceMeters <= radiusMeters, distanceMeters };
}