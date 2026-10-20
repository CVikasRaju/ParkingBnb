import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The Content-Security-Policy is assembled from the environment because the
 * bundle legitimately needs to reach three different places: the OpenFreeMap
 * tiles under the MapLibre canvas, the Supabase project (REST + Realtime), and
 * optionally the Fastify API. Anything not listed is blocked by the browser, so
 * a missing entry shows up as a broken map rather than as a silent hole.
 *
 * `'unsafe-inline'`/`'unsafe-eval'` for scripts is the concession Next makes for
 * its inline bootstrap and hydration data; tightening that means a nonce
 * middleware, which is worth doing once the routes stop being mostly RSC.
 */
function contentSecurityPolicy(): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");

  const ws = (url: string) =>
    url.startsWith("https://")
      ? url.replace(/^https:/, "wss:")
      : url.replace(/^http:/, "ws:");

  const connect = [
    "'self'",
    "blob:",
    "data:",
    "https://tiles.openfreemap.org",
    "https://*.openfreemap.org",
    supabaseUrl,
    supabaseUrl ? ws(supabaseUrl) : "",
    apiBaseUrl,
    apiBaseUrl ? ws(apiBaseUrl) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org",
    "font-src 'self' data:",
    // MapLibre compiles tile workers, three.js compiles shaders: both use blobs.
    "worker-src 'self' blob:",
    `connect-src ${connect}`,
    // Nothing may frame the console, and it may not be embedded elsewhere.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Stop advertising the framework: one less fingerprint, and it is not free.
  poweredByHeader: false,
  reactStrictMode: true,

  // Tailwind v4 is wired through Turbopack's CSS pipeline.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // HSTS: the deployment is HTTPS-only. Two years, subdomains included.
          // Vercel's own edge also sets this, so it costs nothing to be explicit.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  /**
   * The previous site exposed `/dashboard/*` plus `/login` and `/signup`. Those
   * routes are gone — the platform is now the five-act landing page, `/explore`,
   * `/auth`, `/provider` and `/admin`. Anything linking to an old URL still
   * lands somewhere useful instead of a 404.
   */
  async redirects() {
    return [
      { source: "/login", destination: "/auth", permanent: true },
      { source: "/signup", destination: "/auth", permanent: true },
      { source: "/dashboard", destination: "/explore", permanent: true },
      { source: "/dashboard/:path*", destination: "/explore", permanent: true },
    ];
  },
};

export default nextConfig;
