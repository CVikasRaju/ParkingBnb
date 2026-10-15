"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";

import FormField from "@/components/auth/FormField";
import OAuthButtons from "@/components/auth/OAuthButtons";
import Icon from "@/components/marketing/Icon";
import { signUpAction, type AuthState } from "@/lib/auth/actions";
import { ROLES, type Role } from "@/lib/auth/roles";
import { isDemoMode } from "@/lib/config";

const INITIAL: AuthState = {};

export default function SignUpForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [role, setRole] = useState<Role>("driver");
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);

  return (
    <div className="space-y-6">
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
        <input type="hidden" name="role" value={role} />

        <fieldset>
          <legend className="mb-2.5 block text-[0.78rem] font-medium tracking-wide text-mist-300">
            I&apos;m joining as
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {ROLES.map((option) => {
              const selected = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  aria-pressed={selected}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? "border-brand-400/70 bg-brand-500/10"
                      : "border-ink-600/80 bg-ink-900/60 hover:border-ink-500"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selected ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-mist-400"
                    }`}
                  >
                    <Icon name={option.icon} size={16} />
                  </span>
                  <span
                    className={`mt-2.5 block text-[0.82rem] font-medium ${
                      selected ? "text-brand-200" : "text-mist-200"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] leading-snug text-mist-500">
                    {option.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <FormField
          label="Full name"
          name="name"
          placeholder="Arjun Mehta"
          autoComplete="name"
        />

        <FormField
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            hint="At least 6 characters"
          />
          <FormField
            label="Confirm password"
            name="confirm"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
          />
        </div>

        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-70">
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <OAuthButtons next={next} />

      {isDemoMode ? (
        <p className="rounded-xl border border-ink-700/70 bg-ink-900/60 px-4 py-3 text-[0.78rem] leading-relaxed text-mist-400">
          <span className="font-medium text-mist-200">Demo mode:</span> the account
          lives in a signed session cookie on this device only, so you can
          explore the full console without a backend. Connect Supabase to
          persist real users.
        </p>
      ) : null}
    </div>
  );
}
