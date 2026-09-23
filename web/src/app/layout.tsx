import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PSX Halal Tracker",
  description: "Follow Shariah-compliant Pakistan Stock Exchange companies and get a daily email digest.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              PSX Halal Tracker
            </Link>
            <div className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link href="/dashboard" className="text-secondary hover:text-primary">
                    Dashboard
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button className="text-secondary hover:text-primary">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
          For information only, not investment advice. Shariah compliance follows the KMI All-Share index
          published by PSX.
        </footer>
      </body>
    </html>
  );
}
