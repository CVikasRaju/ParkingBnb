/**
 * Security response headers.
 *
 * A JSON API does not render HTML, but the headers still matter: browsers that
 * embed these responses (`fetch` from another origin) and intermediaries that
 * sniff content types are the attack surface. Hand-rolled instead of pulling in
 * `@fastify/helmet` — the list is short, explicit and easy to audit.
 *
 * HSTS is production-only on purpose: sending it from `http://localhost` teaches
 * the developer's own browser to force HTTPS on localhost, which is a nasty
 * thing to discover later.
 */
import type { FastifyInstance } from "fastify";

import { isProd } from "../config/env";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
  "X-DNS-Prefetch-Control": "off",
  // Nothing here is a document; a hard deny keeps that true.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export const HSTS_HEADER = "max-age=63072000; includeSubDomains; preload";

/** Endpoints that echo or accept credentials must never be cached. */
const NO_STORE_PATHS = ["/auth/", "/bookings/", "/admin/", "/payments/"];

export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (req, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
    if (isProd) reply.header("Strict-Transport-Security", HSTS_HEADER);

    const path = (req.url.split("?")[0] ?? "").toLowerCase();
    if (NO_STORE_PATHS.some((segment) => path.includes(segment))) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });
}
