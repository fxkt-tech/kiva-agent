import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Corners host application controls on desktop/mobile; hide only the dev badge.
  // Next's runtime/build error feedback remains enabled.
  devIndicators: false,
};

export default nextConfig;
