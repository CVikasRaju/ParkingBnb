import type { FastifyInstance } from "fastify";
import { onRealtime } from "../../lib/realtime";

/**
 * `/ws` realtime gateway (API_SPEC §6).
 *
 * Client sends after connect:
 *   { "op": "subscribe_spot", "spot_id": "…" }
 *   { "op": "subscribe_driver", "driver_id": "…" }
 *
 * Server pushes:
 *   {"type":"spot_status","spotId":"…","status":"locked"|"available"}
 *   {"type":"driver_alert","driverId":"…","alert":"overstay_warning",…}
 */
export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/websocket"));

  app.get("/ws", { websocket: true }, (socket) => {
    const subscriptions = new Set<string>();
    const unsubscribe = onRealtime((event) => {
      if (event.type === "spot_status" && subscriptions.has(`spot:${event.spotId}`)) {
        socket.send(JSON.stringify(event));
      }
      if (event.type === "driver_alert" && subscriptions.has(`driver:${event.driverId}`)) {
        socket.send(JSON.stringify(event));
      }
    });

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.op === "subscribe_spot" && msg.spot_id) {
          subscriptions.add(`spot:${msg.spot_id}`);
        } else if (msg.op === "subscribe_driver" && msg.driver_id) {
          subscriptions.add(`driver:${msg.driver_id}`);
        }
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.on("close", () => unsubscribe());
  });
}