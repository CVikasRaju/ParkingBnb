/**
 * Removes the demo fixtures migration 017 restored.
 *
 * Those eight provider rows and eight bays exist so the map has something to
 * draw and the e2e scripts have something to book. Two of their properties make
 * them wrong for a launch:
 *
 *   - the provider accounts have a *published* password (`secret123`), and
 *     `parking_spots.provider_id` cascades, so anyone who guessed the address
 *     could edit a live listing; and
 *   - the bays are invented addresses, so a driver could book one and drive to
 *     a driveway that does not exist.
 *
 * Deliberately interactive-free but double-guarded: it refuses to run without
 * an explicit confirmation flag, and refuses outright if any real booking has
 * ever been made against a fixture bay (that is a data-migration decision, not
 * a cleanup).
 *
 * Usage:
 *   npm run db:purge-demo -- --yes
 *   # or: CONFIRM_PURGE_DEMO=yes npm run db:purge-demo
 */
import "dotenv/config";
import { Pool } from "pg";

const SEED_EMAIL_DOMAIN = "@seed.parkpeer.local";

const confirmed =
  process.argv.includes("--yes") || (process.env.CONFIRM_PURGE_DEMO ?? "").toLowerCase() === "yes";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://parkpeer:parkpeer@localhost:5432/parkpeer",
});

async function run(): Promise<void> {
  if (!confirmed) {
    console.error(
      [
        "Refusing to purge demo fixtures without confirmation.",
        "",
        "This deletes every user whose email ends in " + SEED_EMAIL_DOMAIN,
        "together with every parking spot they own (ON DELETE CASCADE).",
        "",
        "Re-run with: npm run db:purge-demo -- --yes",
      ].join("\n")
    );
    process.exit(2);
  }

  const providers = await pool.query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE email LIKE $1 ORDER BY email",
    [`%${SEED_EMAIL_DOMAIN}`]
  );

  if (providers.rowCount === 0) {
    console.log("• No demo providers found — nothing to purge.");
    await pool.end();
    return;
  }

  const providerIds = providers.rows.map((row) => row.id);

  const { rows: bookingUsage } = await pool.query<{ bookings: string }>(
    `SELECT count(*)::text AS bookings
       FROM bookings b
       JOIN parking_spots ps ON ps.id = b.spot_id
      WHERE ps.provider_id = ANY($1::uuid[])`,
    [providerIds]
  );

  if (Number(bookingUsage[0]?.bookings ?? "0") > 0) {
    console.error(
      [
        `Refusing to purge: ${bookingUsage[0]?.bookings} booking(s) reference a demo bay.`,
        "Decide what happens to that history (archive the rows, or keep the fixtures)",
        "and delete them yourself; this script will not cascade away real money.",
      ].join("\n")
    );
    process.exit(3);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removedSpots = await client.query(
      "DELETE FROM parking_spots WHERE provider_id = ANY($1::uuid[])",
      [providerIds]
    );
    const removedUsers = await client.query(
      "DELETE FROM users WHERE id = ANY($1::uuid[])",
      [providerIds]
    );
    await client.query("COMMIT");
    console.log(
      `✔ purged ${removedUsers.rowCount} demo provider(s) and ${removedSpots.rowCount} demo bay(s)`
    );
    for (const provider of providers.rows) console.log(`  · ${provider.email}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
