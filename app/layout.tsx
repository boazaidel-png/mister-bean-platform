import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mister Bean Service Hub",
  description: "מערכת ניהול ושירות לקוחות לעסקי קפה",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
