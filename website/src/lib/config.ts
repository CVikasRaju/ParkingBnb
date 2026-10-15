/**
 * Runtime configuration.
 *
 * The whole site is designed around one idea: it must work *today*, with no
 * credentials, and light up automatically the moment real ones appear in the
 * environment. Nothing here is read at build time only — every consumer asks
 * `isSupabaseConfigured` / `isDemoMode` at render time, so pasting keys into
 * `.env.local` and restarting is the entire integration step.
 */

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
} as const;

/** True when both public Supabase values are present and non-empty. */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/** The site runs on built-in demo data while no backend is configured. */
export const isDemoMode = !isSupabaseConfigured;

/** Optional ParkPeer Fastify backend (see `backend/`). Blank = demo data. */
export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

export const hasApiBackend = apiBaseUrl.length > 0 && !isDemoMode;

export const siteUrl =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();

/** Human-readable label for the current data source, shown in the UI. */
export const dataSourceLabel = isSupabaseConfigured
  ? "Supabase connected"
  : "Demo data";
