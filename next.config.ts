import type { NextConfig } from "next";

// E2E=1 swaps the Firebase SDK for the in-memory stand-ins in e2e/mocks (see e2e/README.md). Never set in production.
const e2e: Record<string, string> = process.env.E2E
  ? { "firebase/app": "./e2e/mocks/app.ts", "firebase/auth": "./e2e/mocks/auth.ts", "firebase/firestore": "./e2e/mocks/firestore.ts" }
  : {};

const nextConfig: NextConfig = {
  turbopack: { resolveAlias: e2e },
  // CAPACITOR=1 builds the static bundle (out/) that the native shell ships inside the app, so it opens offline.
  ...(process.env.CAPACITOR ? { output: "export" as const, trailingSlash: true } : {}),
};

export default nextConfig;
