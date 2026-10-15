import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SESSION_COOKIE = "parkpeer_session";

import { ROLES, normalizeRole, type Role } from "@/lib/auth/roles";

// Re-exported so server code has one import site for session + role metadata.
export { ROLES, normalizeRole };
export type { Role };

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Which backend authenticated this user. */
  mode: "supabase" | "demo";
}


/* ── Demo-mode session cookie ────────────────────────────────────────────────
   Signed with HMAC-SHA256 so a user cannot simply hand-edit the cookie to
   escalate their role. When Supabase is configured this path is unused and
   Supabase's own JWT cookies take over.
   ─────────────────────────────────────────────────────────────────────────── */

function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // Dev fallback only. Documented in .env.example as required for production.
  return "parkpeer-dev-insecure-session-secret";
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function encodeSession(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string): SessionUser | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionUser>;
    if (!parsed?.email || typeof parsed.email !== "string") return null;
    return {
      id: parsed.id ?? "demo-user",
      email: parsed.email,
      name: parsed.name?.trim() || parsed.email.split("@")[0],
      role: normalizeRole(parsed.role),
      mode: "demo",
    };
  } catch {
    return null;
  }
}

/* ── Public session API ─────────────────────────────────────────────────── */

/** Resolve the current user, or `null` when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return null;

      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      return {
        id: user.id,
        email: user.email ?? "",
        name:
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          user.email?.split("@")[0] ||
          "Member",
        role: normalizeRole(meta.role),
        mode: "supabase",
      };
    }
  }

  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

/** Like `getSessionUser`, but bounces anonymous visitors to the login page. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");
  return user;
}

/** Persist a demo-mode session (no-op when Supabase owns the session). */
export async function writeDemoSession(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Clear both demo and Supabase session state. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.signOut();
  }
}
