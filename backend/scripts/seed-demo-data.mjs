/**
 * Seed realistic demo data into the database `DATABASE_URL` points at.
 *
 * The web console reads spots from Supabase; without rows the map is empty and
 * the app looks broken. This loads the same Hyderabad inventory the marketing
 * site uses so a fresh project has something to show.
 *
 * Usage:
 *   cd backend
 *   node scripts/seed-demo-data.mjs          # seed (idempotent)
 *   node scripts/seed-demo-data.mjs --clear  # remove only the seeded rows
 *
 * Reads DATABASE_URL from backend/.env — never hard-code credentials here.
 *
 * NOTE: the app's `users` table is NOT linked to Supabase Auth's `auth.users`
 * (there is no auth_user_id column), so these provider rows are inventory
 * owners only — they cannot sign in. See the report for that design gap.
 */
import "dotenv/config";
import { Pool } from "pg";

const SEED_EMAIL_DOMAIN = "seed.parkpeer.local";

/** title, address, lat, lng, hourlyRate, status, provider, capacity, features */
const SPOTS = [
  ["Gated driveway · Jubilee Hills", "Road No. 36, Jubilee Hills", 17.4325, 78.4073, 60, "available", "Priya R.", 1, ["CCTV", "Gated", "Well lit", "Paved"]],
  ["Basement bay · Hitec City", "Cyber Towers, Madhapur", 17.4504, 78.3808, 45, "available", "Cyber Towers Facility", 12, ["Covered", "CCTV", "EV charger", "24×7"]],
  ["Private garage · Banjara Hills", "Road No. 12, Banjara Hills", 17.4126, 78.4392, 90, "maintenance", "Ishaan M.", 1, ["Covered", "Locked", "CCTV"]],
  ["Commercial bay · Gachibowli", "Financial District, Gachibowli", 17.4401, 78.3489, 55, "available", "FinTech Plaza", 40, ["Covered", "Valet", "EV charger", "CCTV", "24×7"]],
  ["Shaded driveway · Madhapur", "Ayyappa Society, Madhapur", 17.4487, 78.3915, 40, "available", "Sridhar K.", 2, ["Shaded", "Gated"]],
  ["Tower basement · Kondapur", "Botanical Garden Rd, Kondapur", 17.4632, 78.3617, 35, "available", "My Home Constructions", 24, ["Covered", "CCTV", "Lift access"]],
  ["Airport long-stay · Shamshabad", "RGIA Approach Rd, Shamshabad", 17.2403, 78.4294, 25, "available", "SkyPark Logistics", 300, ["Shuttle", "CCTV", "24×7", "Insured"]],
  ["Corner garage · Begumpet", "Prakash Nagar, Begumpet", 17.4435, 78.4713, 50, "available", "Ravi T.", 2, ["Gated", "CCTV"]],
];

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://parkpeer:parkpeer@localhost:5432/parkpeer",
});

const emailFor = (name) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@${SEED_EMAIL_DOMAIN}`;

async function clear(client) {
  // Only touch rows this script created, identified by the seed email domain.
  const removed = await client.query(
    `DELETE FROM parking_spots
      WHERE provider_id IN (SELECT id FROM users WHERE email LIKE $1)
      RETURNING id`,
    [`%@${SEED_EMAIL_DOMAIN}`],
  );
  const providers = await client.query(
    "DELETE FROM users WHERE email LIKE $1 RETURNING id",
    [`%@${SEED_EMAIL_DOMAIN}`],
  );
  console.log(`  cleared ${removed.rowCount} spot(s), ${providers.rowCount} provider(s)`);
}

async function seed(client) {
  const providers = new Map();
  let phone = 9900000000;

  for (const [, , , , , , providerName] of SPOTS) {
    if (providers.has(providerName)) continue;
    const { rows } = await client.query(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role, is_verified)
       VALUES ($1, $2, $3, $4, 'provider', TRUE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [providerName, emailFor(providerName), `+91${phone++}`, "seeded-not-a-login"],
    );
    providers.set(providerName, rows[0].id);
  }
  console.log(`  upserted ${providers.size} provider(s)`);

  let inserted = 0;
  for (const [title, address, lat, lng, rate, status, providerName, capacity, features] of SPOTS) {
    await client.query(
      `INSERT INTO parking_spots
         (provider_id, title, description, address, location, hourly_rate, status, has_iot_barrier)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $7, $8::spot_status, FALSE)`,
      [
        providers.get(providerName),
        title,
        `Capacity ${capacity} · ${features.join(" · ")}`,
        address,
        lat,
        lng,
        rate,
        status,
      ],
    );
    inserted += 1;
  }
  console.log(`  inserted ${inserted} spot(s)`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await clear(client);
    if (!process.argv.includes("--clear")) await seed(client);
    await client.query("COMMIT");
    const { rows } = await client.query(
      `SELECT count(*) FILTER (WHERE status = 'available') AS available, count(*) AS total
         FROM parking_spots`,
    );
    console.log(`  parking_spots now: ${rows[0].available} available / ${rows[0].total} total`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
