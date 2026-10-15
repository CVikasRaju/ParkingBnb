"use client";

import { useState } from "react";

import { isSupabaseConfigured } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Social sign-in.
 *
 * Renders nothing until Supabase credentials exist — with no provider
 * configured there is nothing to redirect to, so showing dead buttons would be
 * worse than showing none. Enable the provider in your Supabase dashboard and
 * these light up automatically.
 */
export default function OAuthButtons({ next = "/dashboard" }: { next?: string }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return null;

  const start = async (provider: "google" | "github") => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    setError(null);
    setPending(provider);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    // On success the browser navigates away, so only failures reach here.
    if (oauthError) {
      setError(oauthError.message);
      setPending(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-700" />
        <span className="text-[0.7rem] tracking-widest text-mist-500 uppercase">or</span>
        <span className="h-px flex-1 bg-ink-700" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {(["google", "github"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => start(provider)}
            disabled={pending !== null}
            className="btn-ghost text-sm capitalize disabled:opacity-60"
          >
            {pending === provider ? "Redirecting…" : `Continue with ${provider}`}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-[0.78rem] text-flare-300">{error}</p>
      ) : null}
    </div>
  );
}
