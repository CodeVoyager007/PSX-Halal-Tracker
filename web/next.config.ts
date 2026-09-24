import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // All site photography is hotlinked from Unsplash and resized by its CDN
    loader: "custom",
    loaderFile: "./src/lib/unsplash-loader.ts",
  },
};

export default nextConfig;
