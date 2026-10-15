import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind v4 is wired through Turbopack's CSS pipeline.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
