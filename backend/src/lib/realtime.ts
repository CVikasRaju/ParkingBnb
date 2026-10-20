/**
 * Realtime hub — in-process pub/sub used by the `/ws` route and by services
 * that need to broadcast, e.g. `spot:{id} -> status:locked/available`.
 * Uses a Redis pub/sub receiver so a multi-instance backend stays consistent.
 */
import { redis } from "./redis";
import { EventEmitter } from "node:events";

const CHANNEL = "parkpeer:rt";
const emitter = new EventEmitter();
emitter.setMaxListeners(1000);

let receiverReady: Promise<void> | null = null;

export type RealtimeEvent =
  | { type: "spot_status"; spotId: string; status: "locked" | "available" | "maintenance" }
  | { type: "driver_alert"; driverId: string; alert: string; data?: Record<string, unknown> };

/**
 * Subscribe the in-process hub to Redis pub/sub exactly once.
 *
 * The promise is cached and awaited so a publish issued just after boot —
 * before the subscriber handshake completes — is never dropped. Redis pub/sub
 * has no replay: a `spot:{id} -> locked` frame emitted in that window would
 * otherwise leave every connected map screen showing a stale `available` pin.
 */
function ensureRedisReceiver(): Promise<void> {
  if (!receiverReady) {
    const sub = redis.duplicate();
    sub.on("message", (_ch, raw) => {
      try {
        emitter.emit("event", JSON.parse(raw) as RealtimeEvent);
      } catch {
        /* ignore malformed frames */
      }
    });
    // A dropped subscriber connection must not crash the process.
    sub.on("error", (err: Error) => {
      console.error("[realtime] subscriber error:", err.message);
    });
    receiverReady = sub
      .subscribe(CHANNEL)
      .then(() => undefined)
      .catch((err: Error) => {
        receiverReady = null; // let the next caller retry
        throw err;
      });
  }
  return receiverReady;
}

/**
 * Await the Redis subscriber during boot so the gateway can broadcast from the
 * very first request. Never fatal *and never blocking*: realtime is a
 * best-effort side channel, and ioredis queues a command issued while the
 * socket is down, which would otherwise hold the whole process at boot until
 * Redis came back. The wait is capped, and `onRealtime()` re-subscribes on the
 * next subscriber.
 */
export const REALTIME_BOOT_TIMEOUT_MS = 3000;

export async function initRealtime(): Promise<void> {
  try {
    await Promise.race([
      ensureRedisReceiver(),
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          console.warn(
            `[realtime] Redis subscriber not ready after ${REALTIME_BOOT_TIMEOUT_MS}ms — starting anyway (updates resume once Redis is reachable)`
          );
          resolve();
        }, REALTIME_BOOT_TIMEOUT_MS);
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);
  } catch (err) {
    console.error("[realtime] could not subscribe — realtime updates disabled", err);
  }
}

export function publishRealtime(event: RealtimeEvent): void {
  redis.publish(CHANNEL, JSON.stringify(event)).catch(() => {});
}

export function onRealtime(listener: (event: RealtimeEvent) => void): () => void {
  void ensureRedisReceiver().catch(() => {});
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

/** Broadcast that a spot's lock status changed (map purge / grey-out). */
export function broadcastSpotStatus(
  spotId: string,
  status: "locked" | "available" | "maintenance"
): void {
  publishRealtime({ type: "spot_status", spotId, status });
}

/** Send a targeted alert to a driver (overstay T-15/T-0, penalty receipt…). */
export function broadcastDriverAlert(
  driverId: string,
  alert: string,
  data?: Record<string, unknown>
): void {
  publishRealtime({ type: "driver_alert", driverId, alert, data });
}