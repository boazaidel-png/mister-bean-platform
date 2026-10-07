import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ViewportSync } from "@/components/viewport-sync";

export const metadata: Metadata = {
  title: "Mister Bean Service Hub",
  description: "מערכת ניהול ושירות לקוחות לעסקי קפה",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  manifest: "/mister-bean-platform/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/mister-bean-platform/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/mister-bean-platform/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/mister-bean-platform/favicon-64.png",
    apple: [
      { url: "/mister-bean-platform/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Mister Bean",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f5a45",
  // Android: let the keyboard shrink the layout so fixed dialogs stay above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><head><meta name="format-detection" content="telephone=no"/></head><body><ViewportSync/>{children}</body></html>;
}
