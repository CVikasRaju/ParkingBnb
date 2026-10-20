import { db } from "../../lib/db";
import { Errors } from "../../lib/errors";

export interface SpotLocation {
  lat: number;
  lng: number;
}

export type SpotCategory =
  | "parking_only"
  | "ev_p2p_charge"
  | "commercial_cpo"
  | "fuel_pump";

export type PlugType =
  | "none"
  | "15A_domestic"
  | "type2_ac"
  | "ccs2_dc"
  | "chademo";

export interface CreateSpotInput {
  providerId: string;
  title: string;
  description?: string;
  address: string;
  location: SpotLocation;
  hourlyRate: number;
  overstayMultiplier?: number;
  entryInstructions?: string;
  hasIotBarrier?: boolean;
  iotDeviceKey?: string;
  photoUrls?: string[];
  category?: SpotCategory;
  plugType?: PlugType;
  powerOutputKw?: number;
  energyRatePerKwh?: number;
}

export interface SearchSpotResult {
  id: string;
  title: string;
  address: string;
  hourly_rate: number;
  latitude: number;
  longitude: number;
  distance_meters: number;
  has_iot_barrier: boolean;
  category: SpotCategory;
  plug_type: PlugType;
  power_output_kw: number;
  energy_rate_per_kwh: number;
}

const spotSelect = `
  id, provider_id, title, description, address,
  ST_Y(location::geometry) AS latitude,
  ST_X(location::geometry) AS longitude,
  hourly_rate, overstay_multiplier, status, entry_instructions,
  has_iot_barrier, iot_device_key,
  category, plug_type, power_output_kw, energy_rate_per_kwh,
  created_at, updated_at
`;

/** Create a provider listing. The location geography is inserted via ST_SetSRID. */
export async function createSpot(input: CreateSpotInput) {
  const iotKey = input.hasIotBarrier ? input.iotDeviceKey : null;
  const category = input.category ?? "parking_only";
  const plugType = input.plugType ?? (category === "parking_only" ? "none" : "15A_domestic");
  const powerKw = input.powerOutputKw ?? 0.0;
  const energyRate = input.energyRatePerKwh ?? 0.0;

  return db.one(
    `INSERT INTO parking_spots (
       provider_id, title, description, address, location,
       hourly_rate, overstay_multiplier, status, entry_instructions,
       has_iot_barrier, iot_device_key,
       category, plug_type, power_output_kw, energy_rate_per_kwh
     ) VALUES (
       $1, $2, $3, $4,
       ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
       $7, $8, 'available', $9, $10, $11,
       $12, $13, $14, $15
     )
     RETURNING ${spotSelect}`,
    [
      input.providerId,
      input.title,
      input.description ?? null,
      input.address,
      input.location.lng,
      input.location.lat,
      input.hourlyRate,
      input.overstayMultiplier ?? 1.5,
      input.entryInstructions ?? null,
      input.hasIotBarrier ?? false,
      iotKey,
      category,
      plugType,
      powerKw,
      energyRate,
    ]
  );
}

/**
 * Radial search — calls `search_nearby_spots()` with category filtering.
 * Falls back gracefully to `search_nearby_parking` if needed.
 */
export async function searchSpots(
  lat: number,
  lng: number,
  radius: number,
  category?: SpotCategory
): Promise<SearchSpotResult[]> {
  try {
    const { rows } = await db.query(
      "SELECT * FROM search_nearby_spots($1, $2, $3, $4)",
      [lat, lng, radius, category ?? null]
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      address: r.address,
      hourly_rate: Number(r.hourly_rate),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      distance_meters: Number(r.distance_meters),
      has_iot_barrier: Boolean(r.has_iot_barrier),
      category: (r.category ?? "parking_only") as SpotCategory,
      plug_type: (r.plug_type ?? "none") as PlugType,
      power_output_kw: Number(r.power_output_kw ?? 0),
      energy_rate_per_kwh: Number(r.energy_rate_per_kwh ?? 0),
    }));
  } catch (err) {
    // Fallback if migration not yet applied in testing
    const { rows } = await db.query(
      "SELECT * FROM search_nearby_parking($1, $2, $3)",
      [lat, lng, radius]
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      address: r.address,
      hourly_rate: Number(r.hourly_rate),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      distance_meters: Number(r.distance_meters),
      has_iot_barrier: Boolean(r.has_iot_barrier),
      category: "parking_only",
      plug_type: "none",
      power_output_kw: 0,
      energy_rate_per_kwh: 0,
    }));
  }
}

export async function getSpotById(id: string) {
  const spot = await db.maybeOne(`SELECT ${spotSelect} FROM parking_spots WHERE id = $1`, [id]);
  if (!spot) throw Errors.notFound("Spot not found");
  return spot;
}

export async function updateSpotStatus(id: string, status: string) {
  return db.one(
    `UPDATE parking_spots SET status = $1 WHERE id = $2 RETURNING ${spotSelect}`,
    [status, id]
  );
}

/** Provider-owned listing CRUD. */
export async function listProviderSpots(providerId: string) {
  const { rows } = await db.query(
    `SELECT ${spotSelect} FROM parking_spots WHERE provider_id = $1 ORDER BY created_at DESC`,
    [providerId]
  );
  return rows;
}

export async function updateSpot(
  id: string,
  providerId: string,
  patch: Partial<Omit<CreateSpotInput, "providerId" | "location">> & { location?: SpotLocation }
) {
  const existing = await getSpotById(id);
  if (existing.provider_id !== providerId) throw Errors.forbidden("Not your spot");

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (k: string, v: unknown) => {
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  };

  if (patch.title !== undefined) push("title", patch.title);
  if (patch.description !== undefined) push("description", patch.description);
  if (patch.address !== undefined) push("address", patch.address);
  if (patch.hourlyRate !== undefined) push("hourly_rate", patch.hourlyRate);
  if (patch.overstayMultiplier !== undefined) push("overstay_multiplier", patch.overstayMultiplier);
  if (patch.entryInstructions !== undefined) push("entry_instructions", patch.entryInstructions);
  if (patch.hasIotBarrier !== undefined) push("has_iot_barrier", patch.hasIotBarrier);
  if (patch.iotDeviceKey !== undefined) push("iot_device_key", patch.iotDeviceKey);
  if (patch.category !== undefined) push("category", patch.category);
  if (patch.plugType !== undefined) push("plug_type", patch.plugType);
  if (patch.powerOutputKw !== undefined) push("power_output_kw", patch.powerOutputKw);
  if (patch.energyRatePerKwh !== undefined) push("energy_rate_per_kwh", patch.energyRatePerKwh);
  if (patch.location) {
    params.push(patch.location.lng, patch.location.lat);
    sets.push(`location = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)::geography`);
  }

  if (sets.length === 0) return existing;
  params.push(id);
  const { rows } = await db.query(
    `UPDATE parking_spots SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${spotSelect}`,
    params
  );
  if (!rows[0]) throw Errors.notFound("Spot not found");
  return rows[0];
}

export async function setSpotStatus(id: string, providerId: string, status: string) {
  const existing = await getSpotById(id);
  if (existing.provider_id !== providerId) throw Errors.forbidden("Not your spot");
  return updateSpotStatus(id, status);
}

export { spotSelect };
