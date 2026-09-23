import Link from "next/link";

/** Brand mark: a crescent cradling a rising line. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M20.5 7.5a9 9 0 1 0 4 12.3 7 7 0 1 1-4-12.3Z"
        fill="var(--gold)"
        opacity="0.95"
      />
      <path
        d="M9 21.5l4.2-4.4 3 2.6 6.3-7.2"
        fill="none"
        stroke="var(--brand-ink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="12.5" r="1.6" fill="var(--brand-ink)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="PSX Halal Tracker home">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">PSX Halal Tracker</span>
        <span className="hidden text-[11px] text-muted sm:block">Shariah-screened stock alerts</span>
      </span>
    </Link>
  );
}
