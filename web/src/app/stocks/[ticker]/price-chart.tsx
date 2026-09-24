"use client";

import { useEffect, useRef, useState } from "react";
import type { PricePoint } from "@/lib/types";

const SERIES = [
  { key: "close", label: "Close", color: "var(--series-1)" },
  { key: "sma50", label: "50-day avg", color: "var(--series-2)" },
  { key: "sma200", label: "200-day avg", color: "var(--series-3)" },
] as const;

const HEIGHT = 300;
const M = { top: 12, right: 88, bottom: 28, left: 56 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  // Start at or below min and keep adding steps until the top tick covers max,
  // so the highest values are never clipped above the plot
  const ticks = [];
  for (let v = Math.floor(min / step) * step; ; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= max - step * 1e-9) break;
  }
  return ticks;
}

function fmt(v: number | null) {
  return v === null ? "—" : v.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PriceChart({ points }: { points: PricePoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.flatMap((p) => [p.close, p.sma50, p.sma200]).filter((v): v is number => v !== null);
  if (points.length < 2 || !values.length) {
    return <p className="text-sm text-muted">Not enough price history to draw a chart yet.</p>;
  }

  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  // A null value breaks the line instead of bridging the gap
  const path = (key: (typeof SERIES)[number]["key"]) => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Month labels at each month's first trading day, skipping ones that would collide
  const monthTicks: { i: number; label: string }[] = [];
  points.forEach((p, i) => {
    const d = new Date(`${p.date}T00:00:00`);
    const prev = i ? new Date(`${points[i - 1].date}T00:00:00`) : null;
    if (prev && d.getMonth() === prev.getMonth()) return;
    const last = monthTicks[monthTicks.length - 1];
    if (last && x(i) - x(last.i) < 48) return;
    monthTicks.push({ i, label: d.getMonth() === 0 || !prev ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()] });
  });

  // Direct labels at the right end, nudged apart so they never overlap
  const endLabels = SERIES.map((s) => {
    const lastIdx = points.findLastIndex((p) => p[s.key] !== null);
    return lastIdx < 0 ? null : { ...s, y: y(points[lastIdx][s.key] as number) };
  })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + 14);
  }

  function indexAt(clientX: number, rect: DOMRect) {
    const rel = (clientX - rect.left - M.left) / plotW;
    return Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1))));
  }

  const hp = hover !== null ? points[hover] : null;
  const tooltipLeft = hover !== null ? x(hover) : 0;
  const flip = tooltipLeft > width - 200;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-secondary" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="16" height="4" aria-hidden="true">
              <rect width="16" height="2" y="1" rx="1" fill={s.color} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Closing price with 50- and 200-day moving averages, ${points[0].date} to ${points[points.length - 1].date}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)">
                {t.toLocaleString("en-PK")}
              </text>
            </g>
          ))}
          {monthTicks.map((m) => (
            <text key={m.i} x={x(m.i)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
              {m.label}
            </text>
          ))}

          {[...SERIES].reverse().map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {endLabels.map((l) => (
            <text key={l.key} x={M.left + plotW + 8} y={l.y} dy="0.32em" fontSize={11} fill="var(--text-secondary)">
              {l.label}
            </text>
          ))}

          {hp && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} stroke="var(--text-muted)" strokeWidth={1} />
              {SERIES.map((s) =>
                hp[s.key] === null ? null : (
                  <circle key={s.key} cx={x(hover)} cy={y(hp[s.key] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                ),
              )}
            </g>
          )}

          {/* Hit area bigger than the lines: the whole plot. Arrow keys move the crosshair. */}
          <rect
            x={M.left}
            y={M.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label="Chart. Use left and right arrow keys to read values by date."
            className="outline-none focus-visible:stroke-[var(--text-muted)]"
            onPointerMove={(e) => setHover(indexAt(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? points.length - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
            }}
          />
        </svg>

        {hp && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md"
            style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
          >
            <div className="mb-1 font-medium text-primary">
              {new Date(`${hp.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 text-secondary">
                <span className="flex items-center gap-1.5">
                  <svg width="10" height="4" aria-hidden="true">
                    <rect width="10" height="2" y="1" rx="1" fill={s.color} />
                  </svg>
                  {s.label}
                </span>
                <span className="tabular-nums text-primary">{fmt(hp[s.key])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
