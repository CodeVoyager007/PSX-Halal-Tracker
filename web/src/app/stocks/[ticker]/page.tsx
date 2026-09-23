import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Check, ChevronDown, Plus, ShieldCheck } from "lucide-react";
import { fmtDate, fmtNum, fmtPct, fmtPrice, isoDaysAgo, toNum } from "@/lib/format";
import { ChangePill, TickerBadge } from "@/components/market";
import type { PricePoint, SnapshotRow } from "@/lib/types";
import { addTickerForm, removeTicker } from "@/app/dashboard/actions";
import PriceChart from "./price-chart";

const HISTORY_DAYS = 365;
const TABLE_ROWS = 30;

export async function generateMetadata({ params }: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;
  return { title: `${decodeURIComponent(ticker).toUpperCase()} · PSX Halal Tracker` };
}

export default async function StockPage({ params }: PageProps<"/stocks/[ticker]">) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  const supabase = await createClient();

  const since = isoDaysAgo(HISTORY_DAYS);
  const [{ data: snap }, { data: prices }, { data: indicators }, { data: watch }] = await Promise.all([
    supabase.from("latest_snapshot").select("*").eq("ticker", ticker).maybeSingle<SnapshotRow>(),
    supabase.from("price_history").select("trade_date, close_price").eq("ticker", ticker).gte("trade_date", since).order("trade_date"),
    supabase.from("technical_indicators").select("trade_date, sma_50, sma_200").eq("ticker", ticker).gte("trade_date", since),
    supabase.from("watchlists").select("ticker").eq("ticker", ticker),
  ]);

  // latest_snapshot only lists active (currently Shariah-compliant) companies
  if (!snap) notFound();

  const smaByDate = new Map((indicators ?? []).map((r) => [r.trade_date as string, r]));
  const points: PricePoint[] = (prices ?? []).map((p) => {
    const ind = smaByDate.get(p.trade_date);
    return {
      date: p.trade_date,
      close: toNum(p.close_price),
      sma50: toNum(ind?.sma_50),
      sma200: toNum(ind?.sma_200),
    };
  });
  const following = (watch ?? []).length > 0;

  const spike = toNum(snap.volume_spike_ratio);
  const stats: [string, string][] = [
    ["5-day change", fmtPct(snap.price_change_5d_pct)],
    ["RSI (14)", fmtNum(snap.rsi_14)],
    ["Volume", fmtNum(snap.volume)],
    ["Volume vs 20-day avg", spike === null ? "—" : `${fmtNum(spike, 1)}×`],
    ["50-day average", fmtPrice(snap.sma_50)],
    ["200-day average", fmtPrice(snap.sma_200)],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary">
        <ArrowLeft className="size-4" /> Back to watchlist
      </Link>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <TickerBadge ticker={snap.ticker} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{snap.ticker}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-ink">
                  <ShieldCheck className="size-3.5" /> Shariah-compliant
                </span>
                {snap.is_kmi_30 && (
                  <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">KMI-30</span>
                )}
              </div>
              <p className="mt-0.5 text-secondary">{snap.company_name}</p>
              {snap.sector && <p className="text-xs text-muted">{snap.sector}</p>}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-muted">Close · {fmtDate(snap.trade_date)}</div>
            <div className="mt-1 flex items-center gap-3 sm:justify-end">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                <span className="mr-1 text-base font-normal text-muted">PKR</span>
                {fmtPrice(snap.close_price)}
              </span>
              <ChangePill value={snap.change_1d_pct} size="md" />
            </div>
            <form action={following ? removeTicker : addTickerForm} className="mt-4">
              <input type="hidden" name="ticker" value={snap.ticker} />
              {following ? (
                <button className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-loss hover:text-loss">
                  <Check className="size-4" /> On your watchlist
                </button>
              ) : (
                <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-ink shadow-card transition hover:bg-brand-strong">
                  <Plus className="size-4" /> Add to watchlist
                </button>
              )}
            </form>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-surface p-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Price, last 12 months</h2>
          <span className="text-xs text-muted">Daily closes in PKR · hover or use arrow keys for values</span>
        </div>
        <PriceChart points={points} />

        <details className="group mt-6 border-t border-line pt-4 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-secondary hover:text-primary">
            <ChevronDown className="size-4 transition group-open:rotate-180" /> Data table (last {TABLE_ROWS} sessions)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Close</th>
                  <th className="py-2 pr-4 text-right font-medium">50-day avg</th>
                  <th className="py-2 text-right font-medium">200-day avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {points.slice(-TABLE_ROWS).reverse().map((p) => (
                  <tr key={p.date}>
                    <td className="py-2 pr-4">{fmtDate(p.date)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(p.close)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(p.sma50)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtPrice(p.sma200)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
