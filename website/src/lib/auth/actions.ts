"use server";

import { redirect } from "next/navigation";

import { normalizeRole } from "@/lib/auth/roles";
import type { AuthState } from "@/lib/auth/state";
import { isSupabaseConfigured, siteUrl } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Only same-origin, absolute-path redirect targets are honoured. */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/explore";
}

function notConfigured(): AuthState {
  return {
    error:
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to website/.env.local and restart.",
    notice: null,
    role: null,
  };
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured) return notConfigured();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address.", notice: null, role: null };
  }
  if (password.length === 0) {
    return { error: "Enter your password.", notice: null, role: null };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "That email and password combination is not recognised."
          : error.message,
      notice: null,
      role: null,
    };
  }

  redirect(next);
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured) return notConfigured();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  // `admin` is never granted through sign-up: migration 019 maps any admin
  // request in metadata to `driver`, and the form no longer offers it. Clamping
  // here too means the user gets a driver account rather than a silent surprise.
  const requested = normalizeRole(formData.get("role"));
  const role = requested === "admin" ? "driver" : requested;
  const plate = String(formData.get("plate") ?? "").trim().toUpperCase();
  const next = safeNext(formData.get("next"));

  if (!fullName) {
    return { error: "Tell us your name.", notice: null, role };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address.", notice: null, role };
  }
  if (password.length < MIN_PASSWORD) {
    return {
      error: `Use at least ${MIN_PASSWORD} characters for your password.`,
      notice: null,
      role,
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      // `role` is consumed by the `on_auth_user_created` trigger in
      // `backend/db/migrations/015` when it mirrors the row into public.users.
      data: {
        full_name: fullName,
        role,
        ...(phone ? { phone } : {}),
        ...(plate ? { plate } : {}),
      },
    },
  });

  if (error) {
    return { error: error.message, notice: null, role };
  }

  // With email confirmation enabled Supabase returns a user but no session.
  if (!data.session) {
    return {
      error: null,
      notice: `Almost there — we sent a confirmation link to ${email}. Open it to activate your account.`,
      role,
    };
  }

  redirect(next);
}

/**
 * Kick off an OAuth handshake. `next` survives the round trip through
 * `/auth/callback`, which exchanges the code for a session cookie.
 */
export async function oauthAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured) redirect("/auth?error=not-configured");

  const provider = String(formData.get("provider") ?? "");
  if (provider !== "google" && provider !== "github") {
    redirect("/auth?error=unknown-provider");
  }

  const next = safeNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/auth?error=not-configured");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(`/auth?error=${encodeURIComponent(error?.message ?? "oauth-failed")}`);
  }

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/");
}
