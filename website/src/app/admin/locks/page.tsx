import type { Metadata } from "next";
import Nav from "@/components/shell/Nav";
import { requireRole } from "@/lib/auth/session";
import { loadAdminOverview } from "@/lib/data/console";
import AdminLocksClient from "./AdminLocksClient";

export const metadata: Metadata = {
  title: "Redis Lock Concurrency Inspector — Operator Desk",
  description: "Monitor live distributed locks, inspect TTL expirations, and force-evict orphaned locks.",
};

export const dynamic = "force-dynamic";

export default async function AdminLocksPage() {
  const user = await requireRole("admin", "/admin/locks");
  const overview = await loadAdminOverview();

  return (
    <>
      <Nav user={user} />
      <AdminLocksClient initialLocks={overview.locks} />
    </>
  );
}
