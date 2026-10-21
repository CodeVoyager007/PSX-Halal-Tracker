import { LogoMark } from "./logo";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-7" />
          <span className="text-sm font-semibold">PSX Halal Tracker</span>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-muted md:text-right">
          For information only. Not investment advice, and not a recommendation to buy or sell any security.
          Shariah compliance follows the KMI All-Share index published by the Pakistan Stock Exchange. Prices
          are end-of-day closing prices from PSX&apos;s official daily file, cross-checked with an independent source,
          and may still contain errors.
        </p>
      </div>
    </footer>
  );
}
