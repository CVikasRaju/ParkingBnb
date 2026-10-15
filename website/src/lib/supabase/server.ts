import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config";

/**
 * Server-side Supabase client bound to the Next.js cookie store.
 *
 * Returns `null` in demo mode. The `setAll` write is wrapped because Next
 * forbids mutating cookies from a Server Component render pass; that is
 * expected and harmless — the auth callback route refreshes them instead.
 */
export async function createSupabaseServerClient() {
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
          // Called from a Server Component — safe to ignore.
        }
      },
    },
  });
}
