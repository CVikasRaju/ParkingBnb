import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guards";
import { db } from "../../lib/db";

const vehicleSchema = z.object({
  license_plate: z.string().min(2).max(20),
  make_model: z.string().min(2).max(100),
  vehicle_type: z.enum(["sedan", "suv", "hatchback", "ev", "motorcycle"]).default("sedan"),
});

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  app.post("/vehicles", { onRequest: [requireRole("driver")] }, async (req) => {
    const body = vehicleSchema.parse(req.body);
    try {
      const { rows } = await db.query(
        `INSERT INTO vehicles (driver_id, license_plate, make_model, vehicle_type)
         VALUES ($1, $2, $3, $4) RETURNING id, license_plate, make_model, vehicle_type`,
        [req.auth!.sub, body.license_plate.toUpperCase(), body.make_model, body.vehicle_type]
      );
      return { success: true, data: rows[0] };
    } catch (err) {
      const e = err as { constraint?: string; message?: string };
      if (e?.constraint === "vehicles_license_plate_key" || /duplicate key/i.test(e.message ?? "")) {
        throw Object.assign(new Error("License plate already registered"), { statusCode: 409 });
      }
      throw err;
    }
  });

  app.get("/vehicles", { onRequest: [requireRole("driver")] }, async (req) => {
    const { rows } = await db.query(
      "SELECT id, license_plate, make_model, vehicle_type FROM vehicles WHERE driver_id = $1 ORDER BY created_at DESC",
      [req.auth!.sub]
    );
    return { success: true, data: rows };
  });

  app.patch("/vehicles/:id", { onRequest: [requireRole("driver")] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = vehicleSchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (k: string, v: unknown) => {
      params.push(v);
      sets.push(`${k} = $${params.length}`);
    };
    if (body.license_plate !== undefined) push("license_plate", body.license_plate.toUpperCase());
    if (body.make_model !== undefined) push("make_model", body.make_model);
    if (body.vehicle_type !== undefined) push("vehicle_type", body.vehicle_type);
    if (sets.length === 0)
      throw Object.assign(new Error("Nothing to update"), { statusCode: 400 });
    params.push(id);
    const { rows } = await db.query(
      `UPDATE vehicles SET ${sets.join(", ")} WHERE id = $${params.length} AND driver_id = $${params.length + 1} RETURNING id, license_plate, make_model, vehicle_type`,
      [...params, req.auth!.sub]
    );
    if (!rows[0]) throw Object.assign(new Error("Vehicle not found"), { statusCode: 404 });
    return { success: true, data: rows[0] };
  });
}