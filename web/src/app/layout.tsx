import type { Metadata } from "next";
import { Aref_Ruqaa, Bricolage_Grotesque, Fraunces } from "next/font/google";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import "./globals.css";

// Display: Fraunces, a soft "wonky" old-style serif with an optical-size axis
const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
});

// Body and UI: Bricolage Grotesque, a characterful grotesque that stays crisp small
const body = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

// A single calligraphic Arabic accent (حلال) on the landing page
const arabic = Aref_Ruqaa({
  variable: "--font-ruqaa",
  subsets: ["arabic"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "PSX Halal Tracker: Shariah-compliant stock alerts",
  description:
    "Follow Shariah-compliant Pakistan Stock Exchange companies and get a daily email digest after the market closes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${arabic.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
