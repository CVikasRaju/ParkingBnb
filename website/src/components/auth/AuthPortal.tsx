"use client";

/**
 * The unified auth portal.
 *
 * One form, two modes, three roles. Switching role changes the 3D camera pose
 * behind the glass panel and swaps the fields (`plate` only exists for drivers),
 * so the form itself explains who you are signing up as.
 */

import Link from "next/link";
import { useActionState, useState } from "react";

import AuthScene from "@/components/three/AuthScene";
import SceneFrame from "@/components/three/SceneFrame";
import { oauthAction, signInAction, signUpAction } from "@/lib/auth/actions";
import { ROLES, SIGNUP_ROLES, type Role } from "@/lib/auth/roles";
import { EMPTY_AUTH_STATE, type AuthState } from "@/lib/auth/state";
import { isSupabaseConfigured } from "@/lib/config";

type Mode = "signin" | "signup";

export default function AuthPortal({
  initialRole,
  next,
  initialError,
}: {
  initialRole: Role;
  next: string;
  initialError: string | null;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  // Coming from `/auth?role=admin` is fine for signing in; creating one is not
  // offered, so the selection falls back to driver for a new account.
  const [role, setRole] = useState<Role>(initialRole === "admin" ? "driver" : initialRole);
  const [plate, setPlate] = useState("KA-19-MG-2026");

  const initial: AuthState = initialError
    ? { ...EMPTY_AUTH_STATE, error: initialError }
    : EMPTY_AUTH_STATE;

  const [signInState, submitSignIn, signingIn] = useActionState(signInAction, initial);
  const [signUpState, submitSignUp, signingUp] = useActionState(signUpAction, initial);

  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signingIn : signingUp;
  const submit = mode === "signin" ? submitSignIn : submitSignUp;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-obsidian">
      {/* 3D backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SceneFrame
          className="absolute inset-0"
          alwaysOn
          cameraPosition={[7.5, 2.4, 9]}
          fov={40}
          maxDpr={1.6}
          fallback={<div className="grid-lines grid-lines-fade absolute inset-0 bg-obsidian" />}
        >
          <AuthScene role={role} plate={plate} />
        </SceneFrame>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-obsidian/70 via-obsidian/40 to-obsidian/90" />

      {/* Panel */}
      <div className="relative z-20 mx-auto flex min-h-[100dvh] max-w-[1400px] items-center justify-between gap-10 px-5 py-24 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="display mb-8 inline-flex items-center gap-2 text-lg text-white">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-obsidian" />
            </span>
            Park<span className="-ml-2 text-emerald-400">Peer</span>
          </Link>

          <div className="glass-strong rounded-3xl p-6 sm:p-7">
            {/* Mode toggle */}
            <div className="mb-6 flex rounded-2xl border border-white/10 bg-obsidian/60 p-1">
              {(["signin", "signup"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                    mode === value
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {value === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {/* Role selector */}
            <p className="mono mb-2 text-[10px] tracking-[0.24em] text-slate-500 uppercase">
              I am a
            </p>
            <div className={`mb-6 grid gap-2 ${mode === "signup" ? "grid-cols-2" : "grid-cols-3"}`}>
              {(mode === "signup" ? SIGNUP_ROLES : ROLES).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    role === option.value
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      role === option.value ? "text-emerald-300" : "text-slate-300"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                    {option.blurb}
                  </span>
                </button>
              ))}
            </div>

            {state.error && (
              <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {state.error}
              </p>
            )}
            {state.notice && (
              <p className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                {state.notice}
              </p>
            )}

            <form action={submit} className="space-y-3">
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="next" value={next} />

              {mode === "signup" && (
                <Field label="Full name" name="full_name" placeholder="Arjun Mehta" autoComplete="name" />
              )}

              <Field
                label="Email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />

              <Field
                label="Password"
                name="password"
                type="password"
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />

              {mode === "signup" && role === "driver" && (
                <label className="block">
                  <span className="mono block text-[10px] tracking-[0.2em] text-slate-500 uppercase">
                    Licence plate
                  </span>
                  <input
                    name="plate"
                    value={plate}
                    onChange={(event) => setPlate(event.target.value)}
                    className="mono field mt-1 tracking-[0.16em] uppercase"
                    placeholder="KA-19-MG-2026"
                    maxLength={14}
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Shown live on the 3D plate above the car.
                  </span>
                </label>
              )}

              {mode === "signup" && role === "provider" && (
                <Field
                  label="Phone"
                  name="phone"
                  placeholder="+91 99000 00000"
                  autoComplete="tel"
                />
              )}

              <button type="submit" disabled={pending} className="btn btn-primary w-full">
                {pending
                  ? "Working…"
                  : mode === "signin"
                    ? "Sign in"
                    : `Create ${role} account`}
              </button>

              {mode === "signup" ? (
                <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
                  By creating an account you agree to the{" "}
                  <Link href="/terms" className="text-slate-300 underline hover:text-white">
                    terms of service
                  </Link>{" "}
                  and the{" "}
                  <Link href="/privacy" className="text-slate-300 underline hover:text-white">
                    privacy policy
                  </Link>
                  .
                </p>
              ) : null}
            </form>

            {isSupabaseConfigured ? (
              <>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="mono text-[10px] tracking-[0.2em] text-slate-500">OR</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["google", "github"] as const).map((provider) => (
                    <form key={provider} action={oauthAction}>
                      <input type="hidden" name="provider" value={provider} />
                      <input type="hidden" name="next" value={next} />
                      <button type="submit" className="btn btn-ghost w-full capitalize">
                        {provider}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Supabase keys are missing, so accounts are disabled. Add
                <span className="mono"> NEXT_PUBLIC_SUPABASE_URL </span> and
                <span className="mono"> NEXT_PUBLIC_SUPABASE_ANON_KEY </span>
                to <span className="mono">website/.env.local</span> to enable sign-in.
              </p>
            )}

            <p className="mt-5 text-center text-xs text-slate-500">
              Or{" "}
              <Link href="/explore" className="text-emerald-300 hover:underline">
                explore the map as a guest
              </Link>{" "}
              — bookings are simulated until you sign in.
            </p>
          </div>
        </div>

        {/* Spacer so the 3D city stays visible on wide screens. */}
        <div className="hidden flex-1 lg:block" />
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mono block text-[10px] tracking-[0.2em] text-slate-500 uppercase">
        {label}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="field mt-1"
      />
    </label>
  );
}
