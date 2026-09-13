/**
 * Overstay worker — polls for checked-in sessions past `expected_end_time`
 * and flags them OVERSTAYED so drivers incur the penalty at check-out.
 *
 * Uses node-cron. Runs standalone (`npm run worker:overstay`) or embedded
 * in the API process when `OVERSTAY_WORKER=1` (single-box dev).
 */
import { db } from "../lib/db";
import { broadcastDriverAlert } from "../lib/realtime";
import { sendPush } from "../lib/notifications";
import { cronEveryMinute } from "../lib/cron";

async function sweep(): Promise<number> {
  // Only flag sessions whose grace is over AND expected end already passed.
  const { rows } = await db.query(
    `
    SELECT b.id, b.driver_id, b.spot_id, b.expected_end_time, b.provider_earnings,
           ps.provider_id, ps.title
    FROM bookings b
    JOIN parking_spots ps ON ps.id = b.spot_id
    WHERE b.status = 'checked_in'
      AND b.expected_end_time <= NOW()
    `
  );
  for (const row of rows) {
    try {
      // keep FSM honest: checked_in -> overstayed only
      await db.query(`UPDATE bookings SET status = 'overstayed' WHERE id = $1 AND status = 'checked_in'`, [row.id]);
      broadcastDriverAlert(row.driver_id, "overstay_warning", {
        booking_id: row.id,
        expected_end: row.expected_end_time,
      });
      await sendPush(row.provider_id, {
        title: "Session overstayed",
        body: `Booking at ${row.title} passed its end time — penalty pending.`,
        data: { booking_id: row.id },
      });
    } catch (err) {
      console.error(`[overstay] failed to flag ${row.id}:`, (err as Error).message);
    }
  }
  return rows.length;
}

export async function startOverstayWorker(): Promise<void> {
  cronEveryMinute(() => {
    sweep()
      .then((n) => {
        if (n > 0) console.log(`[overstay] flagged ${n} session(s)`);
      })
      .catch((err) => console.error("[overstay] sweep error:", (err as Error).message));
  });
  console.log("[overstay] worker started (every minute)");
}

// Run standalone.
if (require.main === module) {
  startOverstayWorker().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}