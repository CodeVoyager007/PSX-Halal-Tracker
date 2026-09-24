"use client";

/**
 * Resizes images on Unsplash's own image CDN instead of the Next.js optimizer,
 * which would first download each multi-megabyte original. Unsplash's API
 * guidelines ask for hotlinking with its URL parameters in any case.
 */
export default function unsplashLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  url.searchParams.set("auto", "format");
  url.searchParams.set("fit", "max");
  return url.toString();
}
