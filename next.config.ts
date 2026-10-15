import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Served from the root of https://app.misterbean.co.il (GitHub Pages custom domain).
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
