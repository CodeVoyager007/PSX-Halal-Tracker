// Supabase returns NUMERIC columns as numbers or strings depending on size; normalise both.
export function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtPrice(v: number | string | null | undefined): string {
  const n = toNum(v);
  return n === null ? "—" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(v: number | string | null | undefined): string {
  const n = toNum(v);
  return n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtNum(v: number | string | null | undefined, digits = 0): string {
  const n = toNum(v);
  return n === null ? "—" : n.toLocaleString("en-PK", { maximumFractionDigits: digits });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Tailwind text colour for a signed change, using text tokens (not series colours). */
export function changeClass(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n === null || n === 0) return "text-muted";
  return n > 0 ? "text-gain" : "text-loss";
}

/** Only allow same-site relative redirects, so ?next= cannot send users elsewhere. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** ISO date (YYYY-MM-DD) the given number of days before now. */
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
