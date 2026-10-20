/**
 * Per-IP rate limiting.
 *
 * Two reasons this lives behind one small function rather than a plugin
 * dependency:
 *
 *  - **Some limits are global, some are per-route.** Login has to be slow
 *    (brute force) while the map endpoint has to be fast, so the limits are
 *    passed in at the call site.
 *  - **It must not take the API down.** Redis is the shared counter, but when
 *    Redis is unreachable (or a single-box dev machine has none) the limiter
 *    falls back to an in-process window and keeps serving. It never queues a
 *    request behind a dead connection: `ioredis`'s offline queue would happily
 *    hang a request forever, so the Redis path is only used when the socket is
 *    actually `ready`.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

import { env } from "../config/env";
import { AppError } from "./errors";
import { redis } from "./redis";

export type RateLimitRule = {
  /** Namespace so two rules never share a counter. */
  scope: string;
  /** Requests allowed inside the window. `<= 0` disables the rule. */
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  store: "redis" | "memory" | "disabled";
};

export type MemoryRecord = { count: number; expiresAt: number };

/** Exported for tests; the live process uses the module-level store below. */
export const memoryStore = new Map<string, MemoryRecord>();

let warnedAboutRedis = false;

/**
 * Fixed-window increment against a plain `Map`. Separate from the Redis path so
 * the window maths is unit-testable without a Redis server.
 */
export function consumeMemory(
  store: Map<string, MemoryRecord>,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): { count: number; resetInMs: number; limited: boolean } {
  const existing = store.get(key);
  if (!existing || existing.expiresAt <= now) {
    store.set(key, { count: 1, expiresAt: now + windowMs });
    return { count: 1, resetInMs: windowMs, limited: limit < 1 };
  }
  existing.count += 1;
  return {
    count: existing.count,
    resetInMs: Math.max(0, existing.expiresAt - now),
    limited: existing.count > limit,
  };
}

/** Drops expired windows so a long-running process does not leak keys. */
export function pruneMemory(store: Map<string, MemoryRecord>, now: number = Date.now()): void {
  for (const [key, record] of store) {
    if (record.expiresAt <= now) store.delete(key);
  }
}

/**
 * Count one request against a rule for `identifier` (an IP, in practice).
 *
 * The Redis path is a fixed window: INCR then EXPIRE on first hit, which is
 * atomic enough for abuse control. If Redis is missing or errors mid-flight the
 * call degrades to the in-process window rather than failing the request.
 */
export async function consume(
  rule: RateLimitRule,
  identifier: string,
  now: number = Date.now()
): Promise<RateLimitResult> {
  if (rule.limit <= 0) {
    return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0, store: "disabled" };
  }

  const key = `ratelimit:${rule.scope}:${identifier}`;
  const windowMs = rule.windowSeconds * 1000;

  if (redis.status === "ready") {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, rule.windowSeconds);
      let ttl = await redis.ttl(key);
      if (ttl < 1) {
        await redis.expire(key, rule.windowSeconds);
        ttl = rule.windowSeconds;
      }
      return {
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: ttl,
        store: "redis",
      };
    } catch (err) {
      if (!warnedAboutRedis) {
        warnedAboutRedis = true;
        console.warn(
          `[ratelimit] Redis unavailable, falling back to per-process windows: ${(err as Error).message}`
        );
      }
    }
  } else if (!warnedAboutRedis) {
    warnedAboutRedis = true;
    console.warn("[ratelimit] Redis not connected — using per-process windows (single instance only).");
  }

  if (memoryStore.size > 5000) pruneMemory(memoryStore, now);
  const mem = consumeMemory(memoryStore, key, rule.limit, windowMs, now);
  return {
    allowed: !mem.limited,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - mem.count),
    retryAfterSeconds: Math.ceil(mem.resetInMs / 1000),
    store: "memory",
  };
}

/** The health checks must always answer, even for a banned IP. */
export function isRateLimitExempt(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return (
    path.startsWith("/health") ||
    path.includes("/webhooks/") ||
    path.includes("/payments/webhook")
  );
}

/**
 * Build a Fastify `preHandler`. Attach it per route (`auth/login`) or app-wide
 * through `onRequest`.
 */
export function rateLimit(rule: RateLimitRule, options: { skip?: (req: FastifyRequest) => boolean } = {}) {
  return async function rateLimitPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (options.skip?.(req)) return;
    const result = await consume(rule, req.ip);
    reply.header("X-RateLimit-Limit", String(result.limit));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", String(result.retryAfterSeconds));
    if (!result.allowed) {
      reply.header("Retry-After", String(Math.max(1, result.retryAfterSeconds)));
      throw new AppError(429, "Too many requests — slow down and try again shortly.", "RATE_LIMITED");
    }
  };
}

/** Convenience wrappers for the limits the server actually uses. */
export const globalRateLimit = () =>
  rateLimit(
    { scope: "global", limit: env.RATE_LIMIT_MAX, windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS },
    { skip: (req) => isRateLimitExempt(req.url) }
  );

export const authRateLimit = () =>
  rateLimit({
    scope: "auth",
    limit: env.AUTH_RATE_LIMIT_MAX,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  });

export const webhookRateLimit = () =>
  rateLimit({
    scope: "webhook",
    limit: env.WEBHOOK_RATE_LIMIT_MAX,
    windowSeconds: env.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
  });

/** Lets a test (or a graceful shutdown) reset the fallback counters. */
export function resetRateLimitState(): void {
  memoryStore.clear();
  warnedAboutRedis = false;
}
