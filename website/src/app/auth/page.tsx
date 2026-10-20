import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthPortal from "@/components/auth/AuthPortal";
import { getSessionUser } from "@/lib/auth/session";
import { normalizeRole } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to ParkPeer as a driver, a host or an operator. One account covers the map, the host console and the operator desk.",
};

export const dynamic = "force-dynamic";

/** Only same-origin absolute paths survive the round trip. */
function safeNext(raw: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return fallback;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next, "/explore");
  const role = normalizeRole(Array.isArray(params.role) ? params.role[0] : params.role);
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;

  // Already signed in? Go where they were headed.
  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <AuthPortal
      initialRole={role}
      next={next}
      initialError={rawError ? decodeURIComponent(rawError) : null}
    />
  );
}
