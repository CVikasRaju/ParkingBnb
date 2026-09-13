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

let subscribed = false;

export type RealtimeEvent =
  | { type: "spot_status"; spotId: string; status: "locked" | "available" | "maintenance" }
  | { type: "driver_alert"; driverId: string; alert: string; data?: Record<string, unknown> };

function startRedisReceiver(): void {
  if (subscribed) return;
  subscribed = true;
  const sub = redis.duplicate();
  sub.subscribe(CHANNEL);
  sub.on("message", (_ch, raw) => {
    try {
      emitter.emit("event", JSON.parse(raw) as RealtimeEvent);
    } catch {
      /* ignore malformed frames */
    }
  });
}

export function publishRealtime(event: RealtimeEvent): void {
  redis.publish(CHANNEL, JSON.stringify(event)).catch(() => {});
}

export function onRealtime(listener: (event: RealtimeEvent) => void): () => void {
  startRedisReceiver();
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