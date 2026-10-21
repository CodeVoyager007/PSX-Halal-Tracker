import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in and one-off pages have nothing for search engines
      disallow: ["/dashboard", "/stocks/", "/auth/", "/api/", "/unsubscribe"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
