import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/config";

/**
 * robots.txt.
 *
 * The public pages (landing, map, both legal documents) are indexable; the
 * consoles are not. `/admin` and `/provider` are behind a session anyway, but
 * leaving them crawlable invites a login-wall 200 into the index — and there is
 * nothing there for a search engine to rank.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/terms", "/privacy"],
        disallow: ["/admin", "/provider", "/auth", "/api/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
