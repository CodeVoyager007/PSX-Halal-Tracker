import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Lets visitors add the site to their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f5",
    theme_color: SITE.themeColor,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
