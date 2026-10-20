import { NextResponse } from "next/server";

import { dataSourceLabel, hasApiBackend, hasServiceRole, isSupabaseConfigured } from "@/lib/config";

/**
 * Uptime-check endpoint for the web deployment.
 *
 * Reports the *configuration* it is running with, never a secret — an operator
 * asking "is production actually pointing at Supabase, or did someone ship the
 * seed catalogue?" gets the answer from a single curl. It deliberately does not
 * query the database: a health check that fails because a third party is slow
 * will page someone at 3am for a working site.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const configured = isSupabaseConfigured;

  return NextResponse.json(
    {
      status: "ok",
      mode: configured ? "live" : "seed",
      dataSource: dataSourceLabel,
      checks: {
        supabase: configured ? "configured" : "missing",
        serviceRole: hasServiceRole ? "configured" : "missing",
        apiBackend: hasApiBackend ? "configured" : "missing",
      },
      deployment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
