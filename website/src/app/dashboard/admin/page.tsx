import type { Metadata } from "next";

import AdminClient from "@/components/app/AdminClient";

export const metadata: Metadata = {
  title: "Admin",
  description: "Dispute resolution, verification queue and escrow oversight.",
};

export default function AdminPage() {
  return <AdminClient />;
}
