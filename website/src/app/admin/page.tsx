import type { Metadata } from "next";

import Nav from "@/components/shell/Nav";
import AdminGodView from "@/components/admin/AdminGodView";
import { requireRole } from "@/lib/auth/session";
import { loadAdminOverview } from "@/lib/data/console";

export const metadata: Metadata = {
  title: "Operator desk",
  description:
    "Platform telemetry: active holds, force-release controls, the dispute desk and commission analytics.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Operators only. Providers are bounced to the map rather than to /admin.
  const user = await requireRole("admin", "/admin");
  const overview = await loadAdminOverview();

  return (
    <>
      <Nav user={user} />
      <AdminGodView initial={overview} />
    </>
  );
}
