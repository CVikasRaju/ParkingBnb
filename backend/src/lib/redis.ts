import Redis from "ioredis";
import { env } from "../config/env";

export const redis: Redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
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