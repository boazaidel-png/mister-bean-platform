import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "סקר טעימות קפה",
  description: "דרגו כל בלנד לפי הטעם שלכם",
};

export default function TastingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
