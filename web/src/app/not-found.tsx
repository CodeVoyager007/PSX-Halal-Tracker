import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { FillArt } from "@/components/art";

export const metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[70vh] items-center overflow-hidden bg-[#04130d] text-white">
      <FillArt art="hero" sizes="100vw" className="settle -z-20 opacity-40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04130d] via-[#04130d]/85 to-[#04130d]/40" aria-hidden="true" />
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <Compass className="fade-up size-10 text-[#e0b35c]" aria-hidden="true" />
        <p className="fade-up mt-6 font-display text-7xl font-medium text-[#e0b35c]">404</p>
        <h1 className="fade-up mt-2 text-3xl font-medium sm:text-4xl">This page doesn&apos;t exist.</h1>
        <p className="fade-up mt-3 max-w-lg text-white/80">
          The link may be old, or the company may have left the Shariah-compliant list. Let&apos;s get you back.
        </p>
        <div className="fade-up mt-8 flex flex-wrap gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-[#34d399] px-5 py-3 font-medium text-[#04130d] transition hover:bg-[#6ee7b7]">
            <ArrowLeft className="size-4" /> Go to the home page
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-medium text-white transition hover:bg-white/15">
            My watchlist
          </Link>
        </div>
      </div>
    </section>
  );
}
