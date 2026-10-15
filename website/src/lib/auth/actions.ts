"use server";

import { redirect } from "next/navigation";

import { isSupabaseConfigured, siteUrl } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearSession, writeDemoSession } from "@/lib/auth/session";
import { normalizeRole, type Role } from "@/lib/auth/roles";

export type AuthState = { error?: string; notice?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only allow same-site redirect targets through `?next=`. */
function safeNext(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

function titleCaseFromEmail(email: string): string {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Supabase client unavailable." };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
  } else {
    // Demo mode: no user directory exists yet, so any well-formed credentials
    // are accepted and the role is inferred from the email address.
    await writeDemoSession({
      id: `demo-${email}`,
      email,
      name: titleCaseFromEmail(email),
      role: inferRoleFromEmail(email),
      mode: "demo",
    });
  }

  redirect(next);
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const role = normalizeRole(String(formData.get("role") ?? "driver")) as Role;
  const next = safeNext(formData.get("next"));

  if (name.length < 2) return { error: "Please enter your full name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { error: "Supabase client unavailable." };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, role },
        // Without this the confirmation link lands on the project's root Site
        // URL with a `?code=` that nothing exchanges. Point it at the callback
        // handler so the code is traded for a session cookie.
        emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return { error: error.message };

    // Email confirmation is on by default in new Supabase projects.
    if (!data.session) {
      return {
        notice: `Account created. Check ${email} to confirm your address, then sign in.`,
      };
    }
  } else {
    await writeDemoSession({ id: `demo-${email}`, email, name, role, mode: "demo" });
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

/**
 * One-click demo entry used by the "try it instantly" buttons.
 * Only ever active in demo mode — with Supabase configured these buttons are
 * not rendered, because the action would bypass the real user directory.
 */
export async function demoSignInAction(formData: FormData): Promise<void> {
  if (isSupabaseConfigured) redirect("/login");

  const role = normalizeRole(String(formData.get("role") ?? "driver"));
  const email = `${role}@parkpeer.demo`;

  await writeDemoSession({
    id: `demo-${role}`,
    email,
    name: role === "admin" ? "Ops Admin" : role === "provider" ? "Priya (Host)" : "Arjun (Driver)",
    role,
    mode: "demo",
  });

  redirect("/dashboard");
}

function inferRoleFromEmail(email: string): Role {
  if (email.includes("admin")) return "admin";
  if (email.includes("provider") || email.includes("host")) return "provider";
  return "driver";
}
