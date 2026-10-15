import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes the Supabase auth round-trip.
 *
 * Used for OAuth providers and for email confirmation magic links: Supabase
 * redirects here with a `?code=`, which we exchange for a session cookie.
 * In demo mode there is no code and the visitor is simply sent to the app.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/dashboard";

  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
        );
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
