import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@300;400;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}