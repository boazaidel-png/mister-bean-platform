import type { Metadata } from "next";
import { Heebo } from "next/font/google";

export const metadata: Metadata = {
  title: "קפה DAdA לעובדים",
  description: "פולי קפה טריים מבית הקלייה DAdA, במחיר מיוחד לעובדים",
};

// The order page has its own typeface, self-hosted by next/font.
const text = Heebo({ subsets: ["hebrew", "latin"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--sp-font" });

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={text.variable}>{children}</div>;
}
