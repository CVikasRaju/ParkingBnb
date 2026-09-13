/**
 * Migration runner for ParkPeer.
 *
 * Applies the baseline `docs/SCHEMA.md` schema (verbatim) plus any ordered
 * `.sql` files in `db/migrations/`. Tracks applied files in a metadata
 * `schema_migrations` table so re-runs are no-ops.
 *
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { Pool } from "pg";

const SCHEMA_BASELINE = "000_baseline.sql";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://parkpeer:parkpeer@localhost:5432/parkpeer",
});

async function ensureMetaTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(filename: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1",
    [filename]
  );
  return rows.length > 0;
}

async function recordApplied(filename: string, client: { query: (q: string, p?: unknown[]) => Promise<unknown> }): Promise<void> {
  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
    [filename]
  );
}

function loadMigrations(): Array<{ filename: string; sql: string }> {
  const dir = join(__dirname, "..", "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => ({ filename: f, sql: readFileSync(join(dir, f), "utf8") }));
}

async function run(): Promise<void> {
  await ensureMetaTable();

  // 1. Baseline schema (verbatim from docs/SCHEMA.md)
  if (await isApplied(SCHEMA_BASELINE)) {
    console.log(`• ${SCHEMA_BASELINE} already applied, skipping`);
  } else {
    // The Docker init script may already have run schema.sql verbatim.
    // Detect that and record the baseline instead of double-applying.
    const { rows: existing } = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings'"
    );
    if (existing.length > 0) {
      await recordApplied(SCHEMA_BASELINE, pool);
      console.log(`• ${SCHEMA_BASELINE} detected as pre-applied (container init), recording`);
    } else {
      const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await recordApplied(SCHEMA_BASELINE, client);
        await client.query("COMMIT");
        console.log(`✔ applied ${SCHEMA_BASELINE}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  }

  // 2. Ordered follow-up migrations
  for (const { filename, sql } of loadMigrations()) {
    if (await isApplied(filename)) {
      console.log(`• ${filename} already applied, skipping`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await recordApplied(filename, client);
      await client.query("COMMIT");
      console.log(`✔ applied ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✘ failed ${filename}: ${(err as Error).message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migration run complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});