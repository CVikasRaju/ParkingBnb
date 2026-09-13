import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/routes";
import { spotRoutes } from "./modules/spots/routes";
import { bookingRoutes } from "./modules/bookings/routes";
import { vehicleRoutes } from "./modules/vehicles/routes";
import { disputeRoutes } from "./modules/disputes/routes";
import { adminRoutes } from "./modules/admin/routes";
import { webhookRoutes } from "./modules/webhooks/routes";
import { realtimeRoutes } from "./modules/realtime/routes";
import { paymentRoutes } from "./modules/payments/routes";
import { initFcm } from "./lib/notifications";

export function buildServer() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "test" ? "silent" : "info" },
    bodyLimit: 5 * 1024 * 1024,
  });

  // Raw-body capture so webhook signature verification can hash exact bytes.
  // Custom JSON parser: reads body as buffer, stores raw string, parses JSON.
  // Empty bodies (POST with no payload) are tolerated as `null`.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const raw = body.toString("utf8");
    (req as unknown as Record<string, unknown>)._parkpeerRawBody = raw;
    if (raw.trim() === "") return done(null, null);
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error);
    }
  });

  app.register(cors, { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") });

  app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

  // Versioned REST API per API_SPEC (`/api/v1`).
  void app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(spotRoutes);
      await api.register(bookingRoutes);
      await api.register(vehicleRoutes);
      await api.register(disputeRoutes);
      await api.register(adminRoutes);
      await api.register(webhookRoutes);
      await api.register(paymentRoutes);
    },
    { prefix: env.API_PREFIX }
  );

  // Realtime gateway at the spec's bare `/ws`.
  void app.register(realtimeRoutes);

  // Central error handler — surfaces AppErrors as { success:false, error }.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          message: "Validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = status >= 500 ? "Internal server error" : err.message;
    if (status >= 500) req.log.error(err, "unhandled error");
    return reply.status(status).send({ success: false, error: message });
  });

  return app;
}

async function main(): Promise<void> {
  await initFcm();

  const app = buildServer();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Single-box dev convenience: run the overstay worker in-process.
  if (process.env.OVERSTAY_WORKER !== "0") {
    const { startOverstayWorker } = await import("./workers/overstayWorker");
    await startOverstayWorker();
  }
}

if (require.main === module) {
  void main();
}