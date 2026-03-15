import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "../components/layout/AppShell";
import FarcasterReady from "../components/FarcasterReady";

export const metadata: Metadata = {
  title: "Manga Reader",
  description: "Personal manga library reader",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Manga Reader",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
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
        <FarcasterReady />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
