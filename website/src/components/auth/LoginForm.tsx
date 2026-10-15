"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import FormField from "@/components/auth/FormField";
import OAuthButtons from "@/components/auth/OAuthButtons";
import { demoSignInAction, signInAction, type AuthState } from "@/lib/auth/actions";
import { ROLES } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";

const INITIAL: AuthState = {};

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const callbackError = params.get("error");

  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <div className="space-y-6">
      {callbackError ? (
        <p className="rounded-xl border border-flare-500/40 bg-flare-500/10 px-4 py-3 text-[0.82rem] text-flare-300">
          {callbackError}
        </p>
      ) : null}

      {state?.error ? (
        <p className="rounded-xl border border-flare-500/40 bg-flare-500/10 px-4 py-3 text-[0.82rem] text-flare-300">
          {state.error}
        </p>
      ) : null}

      {state?.notice ? (
        <p className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-[0.82rem] text-brand-200">
          {state.notice}
        </p>
      ) : null}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={next} />

        <FormField
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          defaultValue={isDemoMode ? "arjun@parkpeer.demo" : undefined}
        />

        <FormField
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          minLength={6}
          defaultValue={isDemoMode ? "demo1234" : undefined}
        />

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-70">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <OAuthButtons next={next} />

      {isDemoMode ? (
        <div className="rounded-2xl border border-ink-700/70 bg-ink-900/60 p-5">
          <p className="text-[0.78rem] font-medium text-mist-200">Try it instantly</p>
          <p className="mt-1.5 text-[0.78rem] leading-relaxed text-mist-400">
            No backend is connected yet, so any email and password will sign you
            in. Role is inferred from the address — or jump straight in as:
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {ROLES.map((role) => (
              <form key={role.value} action={demoSignInAction}>
                <input type="hidden" name="role" value={role.value} />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-ink-600 bg-ink-800/70 px-3 py-2.5 text-[0.8rem] font-medium text-mist-200 transition-colors hover:border-brand-400/50 hover:text-brand-200"
                >
                  {role.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-center text-[0.78rem] text-mist-500">
        {isDemoMode
          ? "Demo mode: any email and password signs you in on this device only."
          : "Password reset and email confirmation are handled by Supabase."}{" "}
        <Link href="/signup" className="text-brand-300 hover:text-brand-200">
          Create an account
        </Link>
      </p>
    </div>
  );
}
