import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRole, type Role } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Always `supabase` — anonymous visitors simply have no session. */
  mode: "supabase";
}

/**
 * Resolve the signed-in user, or `null`.
 *
 * Identity comes from Supabase Auth alone. There is no parallel cookie and no
 * demo session: `backend/db/migrations/015` mirrors every `auth.users` row into
 * `public.users` with the same UUID, so the `id` returned here is directly
 * usable as `bookings.driver_id` and `vehicles.driver_id`.
 *
 * The role is read from the auth metadata the account signed up with, falling
 * back to the mirrored `public.users.role` row — readable by its owner under the
 * policy added in 015 — for accounts created before that metadata existed.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? "";

  const role =
    "role" in meta
      ? normalizeRole(meta.role)
      : await loadRoleFromProfile(supabase, user.id);

  return {
    id: user.id,
    email,
    name:
      (typeof meta.full_name === "string" && meta.full_name.trim()) ||
      (typeof meta.name === "string" && meta.name.trim()) ||
      email.split("@")[0] ||
      "Member",
    role,
    mode: "supabase",
  };
}

/** Fallback for accounts whose metadata carries no role. */
async function loadRoleFromProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Role> {
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return normalizeRole((data as { role?: unknown } | null)?.role);
}

/** Like `getSessionUser`, but bounces anonymous visitors to the auth portal. */
export async function requireSessionUser(nextPath = "/explore"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Guard a role-scoped console.
 *
 * Admins may inspect either console. Everyone else is returned to the map with
 * a reason, never to the page they were just refused — that would loop.
 */
export async function requireRole(role: Role, nextPath: string): Promise<SessionUser> {
  const user = await requireSessionUser(nextPath);
  const allowed = user.role === role || (role !== "admin" && user.role === "admin");
  if (!allowed) redirect(`/explore?denied=${role}`);
  return user;
}
