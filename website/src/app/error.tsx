"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Without one, a throw inside a Server Component (a Supabase outage, a bad row
 * shape from the API) lands on Next's bare error page and the visitor loses the
 * navigation entirely. This keeps them inside the product and offers the two
 * things that actually help: retry, or go somewhere that does not depend on the
 * failed data.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side rendering errors are already logged by the runtime; this is
    // the client half. Point it at an error reporter (Sentry et al.) when one
    // is wired up — see DEPLOYMENT.md → Observability.
    console.error("[parkpeer] route error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="panel w-full max-w-lg p-6 text-center">
        <span className="chip mx-auto">Something broke</span>
        <h1 className="display mt-4 text-2xl text-white">That screen could not load.</h1>
        <p className="mt-2 text-sm text-slate-300">
          The request failed before it could render. Retrying is usually enough — if it keeps
          failing, the map and the booking flow are still reachable from the live map.
        </p>
        {error.digest ? (
          <p className="mono mt-3 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
            Reference {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/explore" className="btn btn-ghost">
            Go to the live map
          </Link>
        </div>
      </div>
    </main>
  );
}
