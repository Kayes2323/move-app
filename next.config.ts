import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: [],
  },
  // Leaflet CSS import করতে দেয়
  transpilePackages: ["leaflet"],
};

export default nextConfig;