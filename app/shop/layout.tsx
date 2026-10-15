import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";

const BASE = "/shop";
const TITLE = "קפה DAdA לעובדים";
const DESCRIPTION = "פולי קפה טריים מבית הקלייה DAdA, במחיר מיוחד לעובדים";

// The order page employees get is DAdA's, not the Mister Bean system's: its
// own icon, name for the home screen, and the picture shown when the link is
// shared. These replace the system-wide ones from the root layout.
export const metadata: Metadata = {
  metadataBase: new URL("https://app.misterbean.co.il"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "DAdA",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE}/brand/favicon-64.png`, sizes: "64x64", type: "image/png" },
      { url: `${BASE}/brand/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    shortcut: `${BASE}/brand/favicon-64.png`,
    apple: [{ url: `${BASE}/brand/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "DAdA", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: "DAdA Fresh Coffee",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${BASE}/brand/share.jpg`, width: 1200, height: 630, alt: "DAdA Fresh Coffee" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [`${BASE}/brand/share.jpg`] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

// The order page has its own typeface, self-hosted by next/font.
const text = Heebo({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--sp-font" });

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={text.variable}>{children}</div>;
}
