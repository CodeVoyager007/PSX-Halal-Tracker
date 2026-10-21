import Link from "next/link";
import { LogoMark } from "./logo";
import { SITE } from "@/lib/site";

const LINKS = [
  ["/about", "About"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-sm font-semibold">{SITE.name}</span>
          </div>
          <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted">
            For information only. Not investment advice, and not a recommendation to buy or sell any security. Shariah
            compliance follows the KMI All-Share index published by the Pakistan Stock Exchange. Prices are end-of-day
            closing prices from PSX&apos;s official daily file, cross-checked with an independent source, and may still
            contain errors.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="text-secondary hover:text-brand">
              {label}
            </Link>
          ))}
          {SITE.contactEmail && (
            <a href={`mailto:${SITE.contactEmail}`} className="text-secondary hover:text-brand">
              Contact
            </a>
          )}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
          © {new Date().getFullYear()} {SITE.name}
        </p>
      </div>
    </footer>
  );
}
