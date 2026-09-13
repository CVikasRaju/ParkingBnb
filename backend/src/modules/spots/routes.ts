import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guards";
import { db } from "../../lib/db";
import { createSpot, searchSpots, listProviderSpots, updateSpot, setSpotStatus } from "./service";

const createSpotSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().max(2000).optional(),
  address: z.string().min(5).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  hourly_rate: z.number().positive(),
  overstay_multiplier: z.number().min(1).max(9).optional(),
  entry_instructions: z.string().max(2000).optional(),
  has_iot_barrier: z.boolean().optional(),
  iot_device_key: z.string().max(128).optional(),
  photo_urls: z.array(z.string().url()).optional(),
});

const updateSpotSchema = createSpotSchema.partial();

const searchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(50_000).default(3000),
});

async function insertSpotPhotos(spotId: string, urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    await db.query(
      "INSERT INTO spot_photos (spot_id, url, position) VALUES ($1, $2, $3)",
      [spotId, urls[i], i]
    );
  }
}

export async function spotRoutes(app: FastifyInstance): Promise<void> {
  /** Sprint 1: provider creates a listing (photos, geo point, price). */
  app.post("/spots", { onRequest: [requireRole("provider")] }, async (req) => {
    const body = createSpotSchema.parse(req.body);
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
    });
    if (body.photo_urls && body.photo_urls.length > 0) {
      await insertSpotPhotos(spot.id, body.photo_urls);
    }
    return { success: true, data: { ...spot, photo_urls: body.photo_urls ?? [] } };
  });

  /** Sprint 1: radial search via search_nearby_parking(). Public read. */
  app.get("/spots/search", async (req) => {
    const { lat, lng, radius } = searchSchema.parse(req.query);
    const spots = await searchSpots(lat, lng, radius);
    return { success: true, data: spots };
  });

  /** Provider's own listings. */
  app.get("/spots/mine", { onRequest: [requireRole("provider")] }, async (req) => {
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