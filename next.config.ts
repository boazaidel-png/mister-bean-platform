import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/mister-bean-platform",
  assetPrefix: "/mister-bean-platform/",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
