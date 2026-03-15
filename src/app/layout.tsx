import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "../components/layout/AppShell";

export const metadata: Metadata = {
  title: "InkShelf — Comic Reader",
  description: "Open-source comic and manga reader",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "InkShelf",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
