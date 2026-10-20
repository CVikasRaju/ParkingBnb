import Redis from "ioredis";
import { env } from "../config/env";

/**
 * One shared Redis connection.
 *
 * `maxRetriesPerRequest: null` keeps a command queued while the socket
 * reconnects instead of failing the request — the booking lock is the reason:
 * a momentary blip must not look like "no lock exists".
 *
 * The `error` listener is not optional. `ioredis` is an EventEmitter, and an
 * unhandled `'error'` event takes the whole process down, so a Redis restart
 * would kill the API with a stack trace that says nothing about Redis.
 */
export const redis: Redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

let reportedError = false;
redis.on("error", (err: Error) => {
  // Log the first failure at full volume, then stay quiet: ioredis retries
  // forever, and one line per retry would bury every other log line.
  if (!reportedError) {
    reportedError = true;
    console.error(`[redis] connection error: ${err.message}`);
  }
});
redis.on("ready", () => {
  if (reportedError) {
    reportedError = false;
    console.info("[redis] connection restored");
  }
});

export const REDIS_KEYS = {
  /** `lock:spot:{spotId}` value = JSON { booking_id, driver_id } — 10 min TTL */
  spotLock: (spotId: string) => `lock:spot:${spotId}`,
  /** Supersedes any older lock held by the same driver on another spot. */
  driverActiveLock: (driverId: string) => `lock:driver:${driverId}`,
};

export type SpotLockValue = {
  booking_id: string;
  driver_id: string;
};

/**
 * Atomic distributed lock for Phase 1:
 * `SET lock:spot:{spotId} {driver_id} NX EX 600` (10-minute TTL).
 * Prevents race conditions at cache layer before database write.
 */
export async function acquireLock(
  spotId: string,
  driverId: string,
  bookingId?: string,
  ttlSeconds: number = env.BOOKING_LOCK_TTL_SECONDS
): Promise<{ acquired: boolean; key: string; bookingId: string }> {
  // 1. Evict any older lock held by the same driver elsewhere.
  const prevDriverLockKey = await redis.get(REDIS_KEYS.driverActiveLock(driverId));
  if (prevDriverLockKey) {
    await redis.del(prevDriverLockKey);
    await redis.del(REDIS_KEYS.driverActiveLock(driverId));
  }

  // 2. Atomic SET ... NX EX <TTL>. NIL => lock held by another driver.
  const assignedBookingId = bookingId ?? crypto.randomUUID();
  const spotLockKey = REDIS_KEYS.spotLock(spotId);
  const lockPayload: SpotLockValue = {
    booking_id: assignedBookingId,
    driver_id: driverId,
  };

  const reply = await redis.set(
    spotLockKey,
    JSON.stringify(lockPayload),
    "EX",
    ttlSeconds,
    "NX"
  );

  if (reply === "OK") {
    await redis.set(REDIS_KEYS.driverActiveLock(driverId), spotLockKey, "EX", ttlSeconds);
    return { acquired: true, key: spotLockKey, bookingId: assignedBookingId };
  }

  return { acquired: false, key: spotLockKey, bookingId: assignedBookingId };
}

/**
 * Release a spot lock explicitly upon payment confirmation, cancellation,
 * or admin emergency eviction.
 */
export async function releaseLock(spotId: string, driverId?: string): Promise<boolean> {
  const spotLockKey = REDIS_KEYS.spotLock(spotId);
  const deleted = await redis.del(spotLockKey);
  if (driverId) {
    await redis.del(REDIS_KEYS.driverActiveLock(driverId));
  }
  return deleted > 0;
}

/** Used by the readiness probe and by graceful shutdown. */
export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  try {
    const reply = await Promise.race([
      redis.ping(),
      new Promise<string>((_resolve, reject) =>
        setTimeout(() => reject(new Error("redis ping timed out")), timeoutMs)
      ),
    ]);
    return reply === "PONG";
  } catch {
    return false;
  }
}
