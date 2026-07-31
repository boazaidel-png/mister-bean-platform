import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mister Bean Service Hub",
  description: "מערכת ניהול ושירות לקוחות לעסקי קפה",
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
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
