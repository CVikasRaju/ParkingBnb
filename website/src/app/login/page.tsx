import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to ParkPeer to manage your parking reservations and passes.",
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to reserve a bay, manage bookings and open your active pass."
      footer={
        <span>
          New to ParkPeer?{" "}
          <Link href="/signup" className="font-medium text-brand-300 hover:text-brand-200">
            Create an account
          </Link>
        </span>
      }
    >
      {/* useSearchParams() needs a boundary so the shell can prerender. */}
      <Suspense fallback={<div className="shimmer h-72 rounded-2xl" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
