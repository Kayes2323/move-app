import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SyncBootstrap } from "./components/SyncBootstrap";
import { AppDialogHost } from "./components/AppDialogHost";
import { AppToastHost } from "./components/AppToastHost";
import { LaunchIntro } from "./components/LaunchIntro";
import { PwaRegister } from "./components/PwaRegister";
import { ThemeSync } from "./components/ThemeSync";
import { THEME_INIT_SCRIPT } from "./lib/theme";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0A0A0C" };

export const metadata: Metadata = {
  title: "MOVE — Run. Conquer. Repeat.",
  description: "Bangladesh's First Virtual Run App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="MOVE" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <LaunchIntro />
        <PwaRegister />
        <SyncBootstrap />
        <ThemeSync />
        <AppDialogHost />
        <AppToastHost />
        {children}
      </body>
    </html>
  );
}