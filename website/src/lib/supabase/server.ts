import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { hasServiceRole, supabaseConfig } from "@/lib/config";

/**
 * Server-side Supabase client bound to the Next.js cookie store.
 *
 * This is the *user-scoped* client: it carries the visitor's session, so every
 * query runs under their RLS policies and cannot see another user's rows.
 *
 * Returns `null` in seed mode. The `setAll` write is wrapped because Next forbids
 * mutating cookies during a Server Component render pass; that is expected and
 * harmless — `/auth/callback` and the server actions are what refresh the
 * session cookie.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — safe to ignore.
        }
      },
    },
  });
}

/**
 * Privileged, RLS-bypassing client for server-only work: the booking
 * lifecycle, expired-hold cleanup and admin overrides.
 *
 * Every caller is responsible for its own authorisation check before using it —
 * see `src/lib/actions/bookings.ts`, which resolves the session first and refuses
 * unless the acting user owns the row (or is an admin). Never import this from a
 * client component: the key has no `NEXT_PUBLIC_` prefix, so the browser build
 * would get `undefined` and silently do nothing rather than leak it.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("createSupabaseAdminClient() must only run on the server.");
  }
  if (!supabaseConfig.url || !hasServiceRole) return null;

  return createClient(
    supabaseConfig.url,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "parkpeer-web/admin" } },
    },
  );
}
