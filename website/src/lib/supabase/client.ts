"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/config";

/**
 * Browser-side Supabase client.
 *
 * Returns `null` when credentials are absent so callers can fall back to demo
 * behaviour instead of throwing — the site must never hard-fail because a
 * credential is missing.
 */
export function createSupabaseBrowserClient() {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) return null;
  return createBrowserClient(supabaseConfig.url, supabaseConfig.anonKey);
}
