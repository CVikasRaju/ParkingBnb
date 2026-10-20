import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guards";
import { db } from "../../lib/db";
import {
  createSpot,
  searchSpots,
  listProviderSpots,
  updateSpot,
  setSpotStatus,
  type SpotCategory,
  type PlugType,
} from "./service";

const createSpotSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().max(2000).optional(),
  address: z.string().min(5).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  hourly_rate: z.number().positive(),
  overstay_multiplier: z.number().min(1).max(9).optional(),
  geo_radius_meters: z.number().optional(),
  entry_instructions: z.string().max(2000).optional(),
  has_iot_barrier: z.boolean().optional(),
  iot_device_key: z.string().max(128).optional(),
  photo_urls: z.array(z.string().url()).optional(),
  photos: z.array(z.string().url()).optional(),
  category: z
    .enum(["parking_only", "ev_p2p_charge", "commercial_cpo", "fuel_pump"])
    .optional(),
  plug_type: z
    .enum(["none", "15A_domestic", "type2_ac", "ccs2_dc", "chademo"])
    .optional(),
  power_output_kw: z.number().nonnegative().optional(),
  energy_rate_per_kwh: z.number().nonnegative().optional(),
  schedules: z
    .array(
      z.object({
        dow: z.array(z.number().min(0).max(6)).optional(),
        day_of_week: z.number().min(0).max(6).optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
        open_time: z.string().optional(),
        close_time: z.string().optional(),
      })
    )
    .optional(),
});

const updateSpotSchema = createSpotSchema.partial();

const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(50_000).optional(),
  radius_m: z.coerce.number().int().positive().max(50_000).optional(),
  category: z
    .enum(["parking_only", "ev_p2p_charge", "commercial_cpo", "fuel_pump"])
    .optional(),
});

async function insertSpotPhotos(spotId: string, urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    await db.query(
      "INSERT INTO spot_photos (spot_id, url, position) VALUES ($1, $2, $3)",
      [spotId, urls[i], i]
    );
  }
}

async function insertSpotSchedules(
  spotId: string,
  schedules: NonNullable<z.infer<typeof createSpotSchema>["schedules"]>
): Promise<void> {
  for (const s of schedules) {
    const open = s.open_time ?? s.start_time ?? "00:00";
    const close = s.close_time ?? s.end_time ?? "23:59";
    const days: number[] = Array.isArray(s.dow)
      ? s.dow
      : s.day_of_week !== undefined
      ? [s.day_of_week]
      : [0, 1, 2, 3, 4, 5, 6];
    for (const day of days) {
      await db.query(
        "INSERT INTO spot_schedules (spot_id, day_of_week, open_time, close_time) VALUES ($1, $2, $3, $4)",
        [spotId, day, open, close]
      );
    }
  }
}

export async function spotRoutes(app: FastifyInstance): Promise<void> {
  /** Sprint 1: provider creates a listing (photos, geo point, price, EV charging specs). */
  app.post("/spots", { onRequest: [requireRole("provider")] }, async (req) => {
    const body = createSpotSchema.parse(req.body);
    const photos = body.photo_urls ?? body.photos ?? [];
    const spot = await createSpot({
      providerId: req.auth!.sub,
      title: body.title,
      description: body.description,
      address: body.address,
      location: { lat: body.latitude, lng: body.longitude },
      hourlyRate: body.hourly_rate,
      overstayMultiplier: body.overstay_multiplier,
      entryInstructions: body.entry_instructions,
      hasIotBarrier: body.has_iot_barrier,
      iotDeviceKey: body.iot_device_key,
      category: body.category as SpotCategory | undefined,
      plugType: body.plug_type as PlugType | undefined,
      powerOutputKw: body.power_output_kw,
      energyRatePerKwh: body.energy_rate_per_kwh,
    });
    if (photos.length > 0) {
      await insertSpotPhotos(spot.id, photos);
    }
    if (body.schedules && body.schedules.length > 0) {
      await insertSpotSchedules(spot.id, body.schedules);
    }
    return { success: true, data: { ...spot, photo_urls: photos } };
  });

  /** Sprint 1: radial search via search_nearby_spots() with category filter. Public read. */
  app.get("/spots/search", async (req) => {
    const query = searchSchema.parse(req.query);
    const radius = query.radius ?? query.radius_m ?? 3000;
    const spots = await searchSpots(
      query.lat,
      query.lng,
      radius,
      query.category as SpotCategory | undefined
    );
    return { success: true, data: spots };
  });

  /** Provider's own listings. */
  app.get("/spots/mine", { onRequest: [requireRole("provider")] }, async (req) => {
    const spots = await listProviderSpots(req.auth!.sub);
    return { success: true, data: spots };
  });

  app.get("/spots/provider/me", { onRequest: [requireRole("provider")] }, async (req) => {
    const spots = await listProviderSpots(req.auth!.sub);
    return { success: true, data: spots };
  });

  /** Provider updates a listing. */
  app.patch("/spots/:id", { onRequest: [requireRole("provider")] }, async (req) => {
    const body = updateSpotSchema.parse(req.body);
    const { id } = req.params as { id: string };
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.address !== undefined) patch.address = body.address;
    if (body.hourly_rate !== undefined) patch.hourlyRate = body.hourly_rate;
    if (body.overstay_multiplier !== undefined) patch.overstayMultiplier = body.overstay_multiplier;
    if (body.entry_instructions !== undefined) patch.entryInstructions = body.entry_instructions;
    if (body.has_iot_barrier !== undefined) patch.hasIotBarrier = body.has_iot_barrier;
    if (body.iot_device_key !== undefined) patch.iotDeviceKey = body.iot_device_key;
    if (body.category !== undefined) patch.category = body.category;
    if (body.plug_type !== undefined) patch.plugType = body.plug_type;
    if (body.power_output_kw !== undefined) patch.powerOutputKw = body.power_output_kw;
    if (body.energy_rate_per_kwh !== undefined) patch.energyRatePerKwh = body.energy_rate_per_kwh;
    if (body.latitude !== undefined && body.longitude !== undefined) {
      patch.location = { lat: body.latitude, lng: body.longitude };
    }
    const spot = await updateSpot(id, req.auth!.sub, patch);
    return { success: true, data: spot };
  });

  /** Provider sets availability (available/maintenance/inactive). */
  app.patch("/spots/:id/status", { onRequest: [requireRole("provider")] }, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(["available", "maintenance", "inactive"]) }).parse(req.body);
    const spot = await setSpotStatus(id, req.auth!.sub, status);
    return { success: true, data: spot };
  });
}
