import type { CapacitorConfig } from "@capacitor/cli";

// Native shell for Move. NOT built or run from this repository yet (needs the Android SDK and a device).
// See docs/NATIVE.md for the steps and the open decisions below.
const config: CapacitorConfig = {
  // PLACEHOLDER: the application id is permanent once the app is published. The owner must choose it.
  appId: "bd.move.app",
  appName: "Move",
  // Output of `npm run build:static` (Next.js static export): the whole app ships inside the APK and opens offline.
  webDir: "out",
  android: {
    // Required by @capacitor-community/background-geolocation: without it Android stops delivering locations
    // about five minutes after the app goes to the background.
    useLegacyBridge: true,
  },
};

export default config;
