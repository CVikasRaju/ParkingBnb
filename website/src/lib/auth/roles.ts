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

export function normalizeRole(value: unknown): Role {
  return value === "provider" || value === "admin" ? value : "driver";
}
