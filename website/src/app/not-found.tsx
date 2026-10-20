import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  description: "That page does not exist on ParkPeer.",
};

/**
 * 404. Static markup on purpose — the app shell depends on live data, and a
 * missing route must render even when the database is unreachable.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="panel w-full max-w-lg p-6 text-center">
        <span className="chip mx-auto">404</span>
        <h1 className="display mt-4 text-2xl text-white">No bay at this address.</h1>
        <p className="mt-2 text-sm text-slate-300">
          The page you asked for does not exist. The retired <code>/login</code>,{" "}
          <code>/signup</code> and <code>/dashboard</code> routes now redirect, so an old bookmark
          may simply need a refresh.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/explore" className="btn btn-primary">
            Find parking
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to the landing page
          </Link>
        </div>
      </div>
    </main>
  );
}
