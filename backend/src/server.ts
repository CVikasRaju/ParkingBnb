import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

import { env, isProd } from "./config/env";
import { authRoutes } from "./modules/auth/routes";
import { spotRoutes } from "./modules/spots/routes";
import { bookingRoutes } from "./modules/bookings/routes";
import { vehicleRoutes } from "./modules/vehicles/routes";
import { disputeRoutes } from "./modules/disputes/routes";
import { adminRoutes } from "./modules/admin/routes";
import { webhookRoutes } from "./modules/webhooks/routes";
import { realtimeRoutes } from "./modules/realtime/routes";
import { paymentRoutes } from "./modules/payments/routes";
import { energyRoutes } from "./modules/energy/routes";
import { initFcm } from "./lib/notifications";
import { initRealtime } from "./lib/realtime";
import { pingDatabase, pool } from "./lib/db";
import { globalRateLimit } from "./lib/rateLimit";
import { pingRedis, redis } from "./lib/redis";
import { registerSecurityHeaders } from "./lib/security";

/**
 * Central error handler — surfaces AppErrors as `{ success:false, error }` and
 * hides 5xx internals from the client while logging them server-side.
 * Exported so tests can assert the same envelope the deployed API returns.
 */
export function applyErrorHandler(app: FastifyInstance): void {
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
}

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Never let a credential reach the log store.
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-device-key']",
        "req.headers['stripe-signature']",
        "req.headers['x-razorpay-signature']",
        "res.headers['set-cookie']",
      ],
    },
    bodyLimit: 5 * 1024 * 1024,
    // Behind a load balancer/proxy this is what makes `req.ip` (and therefore
    // rate limiting) see the real client. Off unless asked for: trusting a
    // forwarded header you do not control lets anyone spoof their IP.
    trustProxy: env.TRUST_PROXY,
    genReqId: () => randomUUID(),
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

  app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Key", "Stripe-Signature", "X-Razorpay-Signature"],
    maxAge: 86_400,
  });

  void registerSecurityHeaders(app);

  /**
   * Liveness. Deliberately dependency-free: an orchestrator asking "is this
   * process alive?" must not get a 503 because Postgres is briefly slow, or it
   * will kill a perfectly healthy pod.
   */
  const live = async () => ({ status: "ok", time: new Date().toISOString() });
  app.get("/health", live);
  app.get("/health/live", live);

  /**
   * Readiness. This one *does* touch both datastores: a pod that cannot reach
   * Postgres or Redis must be taken out of rotation, because it cannot lock a
   * bay (Redis) or read the catalogue (Postgres).
   */
  app.get("/health/ready", async (_req, reply) => {
    const [database, cache] = await Promise.all([pingDatabase(), pingRedis()]);
    const ready = database && cache;
    return reply.status(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      checks: { database: database ? "up" : "down", redis: cache ? "up" : "down" },
      payments: env.PAYMENT_PROVIDER,
      time: new Date().toISOString(),
    });
  });

  // Versioned REST API per API_SPEC (`/api/v1`).
  void app.register(
    async (api) => {
      // One generous ceiling for the whole API; the per-route limits below it
      // are the ones that actually stop abuse.
      api.addHook("preHandler", globalRateLimit());

      await api.register(authRoutes);
      await api.register(spotRoutes);
      await api.register(bookingRoutes);
      await api.register(vehicleRoutes);
      await api.register(disputeRoutes);
      await api.register(adminRoutes);
      await api.register(webhookRoutes);
      await api.register(paymentRoutes);
      await api.register(energyRoutes);
    },
    { prefix: env.API_PREFIX }
  );

  // Realtime gateway at the spec's bare `/ws`.
  void app.register(realtimeRoutes);

  applyErrorHandler(app);

  return app;
}

/**
 * Drain in-flight work before the process dies. Without this, a rolling deploy
 * drops every open WebSocket and every in-flight booking write.
 */
export async function shutdown(app: FastifyInstance, signal: string): Promise<void> {
  app.log.info(`[shutdown] received ${signal} — draining`);
  const force = setTimeout(() => {
    app.log.error("[shutdown] drain timed out after 10s — exiting hard");
    process.exit(1);
  }, 10_000);

  try {
    await app.close();
    await Promise.allSettled([pool.end(), redis.quit()]);
    clearTimeout(force);
    app.log.info("[shutdown] clean exit");
    process.exit(0);
  } catch (err) {
    clearTimeout(force);
    app.log.error(err, "[shutdown] error while closing");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await initFcm();
  // Subscribe to Redis pub/sub before accepting traffic: the WS gateway must be
  // able to broadcast spot status changes from the very first request.
  await initRealtime();

  const app = buildServer();
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(app, signal));
  }

  // A crash must be visible and must not leave a half-dead process behind;
  // the orchestrator restarts a clean one.
  process.on("unhandledRejection", (reason) => {
    app.log.error(reason as Error, "[process] unhandled rejection");
  });
  process.on("uncaughtException", (err) => {
    app.log.error(err, "[process] uncaught exception — exiting");
    void shutdown(app, "uncaughtException");
  });

  // Single-box convenience: run the overstay worker in-process. Off by default
  // in production, where the worker runs as its own service (see DEPLOYMENT.md)
  // so several API instances cannot each sweep the same sessions.
  const runWorkerInProcess =
    process.env.OVERSTAY_WORKER !== undefined ? process.env.OVERSTAY_WORKER !== "0" : !isProd;
  if (runWorkerInProcess) {
    const { startOverstayWorker } = await import("./workers/overstayWorker");
    await startOverstayWorker();
  } else {
    app.log.info("[overstay] in-process worker disabled — expecting a dedicated worker service");
  }
}

if (require.main === module) {
  void main();
}
