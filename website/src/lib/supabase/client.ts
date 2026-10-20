"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseConfig } from "@/lib/config";

/**
 * Browser-side Supabase client.
 *
 * Returns `null` when credentials are absent so callers fall back to the seed
 * catalogue instead of throwing — the map must never hard-fail because a key is
 * missing. Uses the anon key, so every read is governed by the RLS policies in
 * `backend/db/migrations/013`–`015`.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) return null;
  return createBrowserClient(supabaseConfig.url, supabaseConfig.anonKey);
}
