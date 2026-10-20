import type { Metadata } from "next";
import Nav from "@/components/shell/Nav";
import { requireRole } from "@/lib/auth/session";
import { loadAdminOverview } from "@/lib/data/console";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export const metadata: Metadata = {
  title: "Platform Revenue & Analytics — Operator Desk",
  description: "Gross merchandise value, platform commission yields, energy distribution metrics, and bay liquidity.",
};

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const user = await requireRole("admin", "/admin/analytics");
  const overview = await loadAdminOverview();

  return (
    <>
      <Nav user={user} />
      <AdminAnalyticsClient initialOverview={overview} />
    </>
  );
}
