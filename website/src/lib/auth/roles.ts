/**
 * Role metadata — intentionally free of server-only imports (`node:crypto`,
 * `next/headers`) so client components like the sign-up form can import it
 * without dragging server code into the browser bundle.
 */

export type Role = "driver" | "provider" | "admin";

export interface RoleOption {
  value: Role;
  label: string;
  blurb: string;
  icon: "car" | "home" | "shield";
}

export const ROLES: RoleOption[] = [
  {
    value: "driver",
    label: "Driver",
    blurb: "Find and reserve nearby parking",
    icon: "car",
  },
  {
    value: "provider",
    label: "Provider",
    blurb: "List your space and earn",
    icon: "home",
  },
  {
    value: "admin",
    label: "Admin",
    blurb: "Moderate the marketplace",
    icon: "shield",
  },
];

/**
 * Roles a visitor may choose for themselves.
 *
 * `admin` is deliberately absent. Operator accounts are created out of band —
 * migration 019 no longer honours `role: "admin"` from sign-up metadata at all,
 * and the Fastify API requires the `ADMIN_SIGNUP_SECRET` — so offering it here
 * would only produce a driver account and an angry operator.
 */
export const SIGNUP_ROLES: RoleOption[] = ROLES.filter((option) => option.value !== "admin");

/**
 * `admin` is still accepted while signing *in* (an existing operator arrives on
 * `/auth?role=admin` and must not be silently switched to a driver), but the
 * sign-up form filters it out of its choices.
 */
export function normalizeRole(value: unknown): Role {
  return value === "provider" || value === "admin" ? value : "driver";
}
