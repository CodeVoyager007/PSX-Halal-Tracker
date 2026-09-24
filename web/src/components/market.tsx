import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { fmtPct, toNum } from "@/lib/format";

/** Signed change as a pill; the arrow and sign carry direction, so colour is never the only cue. */
export function ChangePill({ value, size = "sm" }: { value: number | string | null | undefined; size?: "sm" | "md" }) {
  const n = toNum(value);
  const tone =
    n === null || n === 0
      ? "bg-surface-2 text-muted"
      : n > 0
        ? "bg-gain-soft text-gain"
        : "bg-loss-soft text-loss";
  const Icon = n === null || n === 0 ? Minus : n > 0 ? ArrowUpRight : ArrowDownRight;
  const sizing = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full font-medium tabular-nums ${tone} ${sizing}`}>
      <Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden="true" />
      {fmtPct(n)}
    </span>
  );
}

/** Round monogram standing in for a company logo. */
export function TickerBadge({ ticker, size = "md" }: { ticker: string; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "size-14 text-base rounded-2xl" : "size-10 text-xs rounded-xl";
  return (
    <span
      className={`grid shrink-0 place-items-center bg-brand-soft font-semibold tracking-tight text-brand-soft-ink ${dims}`}
      aria-hidden="true"
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

/** Small static trend line for illustrations and summaries. */
export function Sparkline({
  values,
  className = "h-8 w-24",
  tone = "auto",
}: {
  values: number[];
  className?: string;
  tone?: "auto" | "gain" | "loss";
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / (max - min || 1)) * 24]);
  const up = tone === "auto" ? values[values.length - 1] >= values[0] : tone === "gain";
  const colour = up ? "var(--gain)" : "var(--loss)";
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={`${line}L100,32L0,32Z`} fill={colour} opacity="0.1" />
      <path d={line} fill="none" stroke={colour} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Diverging fill for heatmap tiles: gain or loss hue mixed into the surface by
 * magnitude, capped so text tokens stay readable on top. Direction is also
 * carried by the signed label, never by colour alone.
 */
export function heatColor(v: number | null, full = 2.5) {
  if (v === null) return "var(--surface-2)";
  const strength = Math.min(1, Math.abs(v) / full);
  const pct = Math.round(10 + strength * 35);
  return `color-mix(in oklab, ${v >= 0 ? "var(--gain)" : "var(--loss)"} ${pct}%, var(--surface-2))`;
}
