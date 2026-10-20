import type { Metadata } from "next";
import Nav from "@/components/shell/Nav";
import { requireRole } from "@/lib/auth/session";
import { loadAdminOverview } from "@/lib/data/console";
import AdminDisputesClient from "./AdminDisputesClient";

export const metadata: Metadata = {
  title: "Dispute Resolution Center — Operator Desk",
  description: "Review and resolve active parking obstructions and EV socket disputes.",
};

export const dynamic = "force-dynamic";

export default async function AdminDisputesPage() {
  const user = await requireRole("admin", "/admin/disputes");
  const overview = await loadAdminOverview();

  return (
    <>
      <Nav user={user} />
      <AdminDisputesClient initialDisputes={overview.disputes} />
    </>
  );
}
