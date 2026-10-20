/**
 * Runtime configuration.
 *
 * Everything the web console needs is derived here, from the environment, at
 * render time — so pasting credentials into `.env.local` and restarting is the
 * whole integration. When the public Supabase values are missing the console
 * still runs, backed by the seed catalogue in `src/lib/data/seed.ts`, and says
 * so in the UI instead of rendering an empty map.
 */

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
} as const;

/**
 * True when the public Supabase pair is present. Both the browser and the
 * server clients key off this; RLS is what protects the data.
 */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * Server-only. Present means privileged writes (the booking lifecycle, admin
 * overrides) work. Never read this from a client component.
 */
export const hasServiceRole = serviceRoleKey.length > 0;

/** No Supabase at all — every screen falls back to the seed catalogue. */
export const isSeedMode = !isSupabaseConfigured;

/** Optional ParkPeer Fastify backend (see `backend/`). */
export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim();

export const hasApiBackend = apiBaseUrl.length > 0;

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).trim();

/** Label shown in the HUD so the data behind the screen is never a mystery. */
export const dataSourceLabel = isSupabaseConfigured
  ? hasServiceRole
    ? "Supabase live"
    : "Supabase read-only"
  : "Seed catalogue";
