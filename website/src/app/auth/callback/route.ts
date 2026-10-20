import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Completes the Supabase auth round trip.
 *
 * Supabase redirects here with a `?code=` after an OAuth handshake or an email
 * confirmation link; this exchanges it for a session cookie (the `setAll` in
 * `createSupabaseServerClient` writes the refreshed cookies, which route
 * handlers are allowed to do) and then forwards the visitor to `next`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const rawNext = url.searchParams.get("next") ?? "/explore";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/explore";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.redirect(
        new URL("/auth?error=not-configured", url.origin),
      );
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/auth?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
