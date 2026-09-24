import Link from "next/link";
import { Activity, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { fmtNum, fmtPct, fmtPrice, toNum } from "@/lib/format";
import type { SnapshotRow } from "@/lib/types";
import { ChangePill, TickerBadge, heatColor } from "@/components/market";
import { addTickerForm } from "./actions";

const LIST_SIZE = 5;
const MIN_SECTOR_SIZE = 3; // smaller sectors make the average one company's move
const MAX_SECTORS = 12;

function MoverRow({ row, watched, value }: { row: SnapshotRow; watched: boolean; value: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Link href={`/stocks/${row.ticker}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand">
        <TickerBadge ticker={row.ticker} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{row.ticker}</span>
          <span className="block truncate text-xs text-muted">{row.company_name}</span>
        </span>
      </Link>
      <span className="shrink-0 text-right">
        <span className="block text-xs tabular-nums text-secondary">{fmtPrice(row.close_price)}</span>
        {value}
      </span>
      {watched ? (
        <span className="size-7 shrink-0" aria-hidden="true" />
      ) : (
        <form action={addTickerForm}>
          <input type="hidden" name="ticker" value={row.ticker} />
          <button
            className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand"
            aria-label={`Add ${row.ticker} to watchlist`}
            title="Add to watchlist"
          >
            <Plus className="size-4" />
          </button>
        </form>
      )}
    </li>
  );
}

function Panel({
  title,
  icon: Icon,
  tone = "brand",
  className = "",
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "gain" | "loss" | "gold";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    brand: "bg-brand-soft text-brand-soft-ink",
    gain: "bg-gain-soft text-gain",
    loss: "bg-loss-soft text-loss",
    gold: "bg-gold-soft text-gold",
  };
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span className={`grid size-8 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function MarketOverview({
  rows,
  marketDate,
  watched,
}: {
  rows: SnapshotRow[];
  marketDate: string | null;
  watched: Set<string>;
}) {
  // Only companies that traded on the latest session count toward today's moves
  const today = rows.filter((r) => r.trade_date === marketDate && toNum(r.change_1d_pct) !== null);
  if (today.length === 0) return null;

  const byChange = [...today].sort((a, b) => toNum(b.change_1d_pct)! - toNum(a.change_1d_pct)!);
  const gainers = byChange.filter((r) => toNum(r.change_1d_pct)! > 0).slice(0, LIST_SIZE);
  const losers = byChange.filter((r) => toNum(r.change_1d_pct)! < 0).reverse().slice(0, LIST_SIZE);
  const unusual = today
    .filter((r) => (toNum(r.volume_spike_ratio) ?? 0) >= 2)
    .sort((a, b) => toNum(b.volume_spike_ratio)! - toNum(a.volume_spike_ratio)!)
    .slice(0, LIST_SIZE);

  const sectors = new Map<string, number[]>();
  for (const r of today) {
    if (!r.sector) continue;
    sectors.set(r.sector, [...(sectors.get(r.sector) ?? []), toNum(r.change_1d_pct)!]);
  }
  const sectorTiles = [...sectors.entries()]
    .filter(([, v]) => v.length >= MIN_SECTOR_SIZE)
    .map(([name, v]) => ({ name, avg: v.reduce((a, b) => a + b, 0) / v.length, count: v.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_SECTORS)
    .sort((a, b) => b.avg - a.avg);

  const up = today.filter((r) => toNum(r.change_1d_pct)! > 0).length;
  const down = today.filter((r) => toNum(r.change_1d_pct)! < 0).length;
  const flat = today.length - up - down;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Halal market today</h2>
        <p className="text-sm text-muted">{today.length} Shariah-compliant companies traded</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Sectors" icon={Activity} className="lg:col-span-2">
          <p className="mt-1 text-xs text-muted">Average 1-day change of companies in each sector</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sectorTiles.map((s) => (
              <div
                key={s.name}
                className="flex min-h-20 flex-col justify-between rounded-xl p-3"
                style={{ background: heatColor(s.avg, 2) }}
              >
                <span className="line-clamp-2 text-xs font-medium text-primary">{s.name}</span>
                <span className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold tabular-nums text-primary">{fmtPct(s.avg)}</span>
                  <span className="text-[11px] text-secondary">{s.count} cos</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              <span className="bg-gain" style={{ flexGrow: up }} />
              <span className="bg-line-strong" style={{ flexGrow: flat }} />
              <span className="bg-loss" style={{ flexGrow: down }} />
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-secondary">
              <span>
                <strong className="text-gain">{up}</strong> up
              </span>
              <span>
                <strong className="text-primary">{flat}</strong> unchanged
              </span>
              <span>
                <strong className="text-loss">{down}</strong> down
              </span>
            </p>
          </div>
        </Panel>

        <Panel title="Unusual volume" icon={Activity} tone="gold">
          <p className="mt-1 text-xs text-muted">Traded at least 2× their 20-day average</p>
          {unusual.length ? (
            <ul className="mt-2 divide-y divide-line">
              {unusual.map((r) => (
                <MoverRow
                  key={r.ticker}
                  row={r}
                  watched={watched.has(r.ticker)}
                  value={
                    <span className="mt-0.5 inline-block rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                      {fmtNum(r.volume_spike_ratio, 1)}×
                    </span>
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted">Nothing unusual today.</p>
          )}
        </Panel>

        <Panel title="Top gainers" icon={TrendingUp} tone="gain">
          <ul className="mt-2 divide-y divide-line">
            {gainers.map((r) => (
              <MoverRow key={r.ticker} row={r} watched={watched.has(r.ticker)} value={<ChangePill value={r.change_1d_pct} />} />
            ))}
          </ul>
        </Panel>

        <Panel title="Top losers" icon={TrendingDown} tone="loss">
          <ul className="mt-2 divide-y divide-line">
            {losers.map((r) => (
              <MoverRow key={r.ticker} row={r} watched={watched.has(r.ticker)} value={<ChangePill value={r.change_1d_pct} />} />
            ))}
          </ul>
        </Panel>

        <Panel title="Most active by volume" icon={Activity}>
          <ul className="mt-2 divide-y divide-line">
            {[...today]
              .sort((a, b) => (toNum(b.volume) ?? 0) - (toNum(a.volume) ?? 0))
              .slice(0, LIST_SIZE)
              .map((r) => (
                <MoverRow
                  key={r.ticker}
                  row={r}
                  watched={watched.has(r.ticker)}
                  value={<span className="text-xs font-medium tabular-nums">{fmtNum(r.volume)} shares</span>}
                />
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
