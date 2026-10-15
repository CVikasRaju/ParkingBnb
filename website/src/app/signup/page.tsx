import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthShell from "@/components/auth/AuthShell";
import SignUpForm from "@/components/auth/SignUpForm";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Join ParkPeer as a driver to reserve verified parking, or as a provider to list your driveway, garage or commercial bay.",
};

export default async function SignUpPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <AuthShell
      title="Create your account"
      subtitle="Reserve parking as a driver, or list a space and start earning as a host."
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Sign in
          </Link>
        </span>
      }
    >
      <Suspense fallback={<div className="shimmer h-96 rounded-2xl" />}>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
