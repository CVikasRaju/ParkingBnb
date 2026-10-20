import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/guards";
import {
  getChargingSession,
  recordMeterReading,
  turnPowerOn,
  turnPowerOff,
} from "./service";
import { getBooking, assertBookingAccess } from "../bookings/service";

const meterSchema = z.object({
  booking_id: z.string().uuid(),
  kwh: z.number().nonnegative(),
  device_id: z.string().optional(),
});

const relayToggleSchema = z.object({
  booking_id: z.string().uuid(),
  action: z.enum(["ON", "OFF"]),
});

export async function energyRoutes(app: FastifyInstance): Promise<void> {
  /** Ingest live telemetry from Shelly/Sonoff smart breaker meters. */
  app.post("/energy/meter-telemetry", async (req) => {
    const body = meterSchema.parse(req.body);
    const session = await recordMeterReading(body.booking_id, body.kwh);
    return {
      success: true,
      data: session ?? { message: "No active charging session found" },
    };
  });

  /** Get live EV charging session status for a driver or provider. */
  app.get(
    "/energy/session/:bookingId",
    { onRequest: [requireAuth] },
    async (req) => {
      const { bookingId } = req.params as { bookingId: string };
      const booking = await getBooking(bookingId);
      await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);

      const session = await getChargingSession(bookingId);
      return {
        success: true,
        data: session ?? {
          booking_id: bookingId,
          status: "OFF",
          kwh_consumed: Number(booking.energy_kwh ?? 0),
          energy_amount: Number(booking.energy_amount ?? 0),
        },
      };
    }
  );

  /** Manual smart switch relay trigger. */
  app.post(
    "/energy/relay/toggle",
    { onRequest: [requireAuth] },
    async (req) => {
      const body = relayToggleSchema.parse(req.body);
      const booking = await getBooking(body.booking_id);
      await assertBookingAccess(booking, req.auth!.sub, req.auth!.role);

      if (body.action === "ON") {
        const session = await turnPowerOn(
          booking.spot_id,
          booking.id,
          booking.driver_id
        );
        return { success: true, data: session };
      } else {
        const result = await turnPowerOff(booking.id, booking.actual_check_in);
        return { success: true, data: result };
      }
    }
  );
}
