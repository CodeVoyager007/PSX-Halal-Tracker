import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(SITE.updated);
  return [
    { url: SITE.url, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/about`, lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/login`, lastModified: updated, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE.url}/privacy`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/terms`, lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
  ];
}
