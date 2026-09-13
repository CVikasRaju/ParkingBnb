import { Pool } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
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