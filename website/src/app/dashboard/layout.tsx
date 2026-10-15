import type { Metadata } from "next";
import type { ReactNode } from "react";

import AppShell from "@/components/app/AppShell";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your ParkPeer reservations, passes and payouts.",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Bounces anonymous visitors to /login before any child route renders.
  const user = await requireSessionUser();

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, mode: user.mode }}
    >
      {children}
    </AppShell>
  );
}
