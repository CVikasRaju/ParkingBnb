import { Pool } from "pg";
import { env } from "../config/env";

/**
 * The connection pool.
 *
 * `DATABASE_SSL=true` is what managed Postgres (Supabase, Neon, RDS) needs.
 * Certificate verification stays on by default; `DATABASE_SSL_NO_VERIFY=true`
 * is the explicit opt-out for a provider whose CA the container does not ship,
 * and it is worth knowing you turned it off.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: !env.DATABASE_SSL_NO_VERIFY } : undefined,
});

// A pool-level error is a dropped idle connection, not a failed request; without
// this listener node-postgres rethrows it as an uncaught exception.
pool.on("error", (err) => {
  console.error(`[db] idle client error: ${err.message}`);
});

/** Convenience helpers to keep route code lean. */
export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  one: async <T = any>(text: string, params?: unknown[]): Promise<T> => {
    const { rows } = await pool.query(text, params);
    if (!rows[0]) throw new Error("Row not found");
    return rows[0] as T;
  },
  maybeOne: async <T = any>(text: string, params?: unknown[]): Promise<T | null> => {
    const { rows } = await pool.query(text, params);
    return (rows[0] as T) ?? null;
  },
};

/** Readiness probe: a real round trip, with a ceiling so a hung DB fails fast. */
export async function pingDatabase(timeoutMs = 2000): Promise<boolean> {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("database ping timed out")), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
