import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { changeClass, fmtDate, fmtNum, fmtPct, fmtPrice, isoDaysAgo, toNum } from "@/lib/format";
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

  const stats: [string, string, string?][] = [
    ["1-day", fmtPct(snap.change_1d_pct), changeClass(snap.change_1d_pct)],
    ["5-day", fmtPct(snap.price_change_5d_pct), changeClass(snap.price_change_5d_pct)],
    ["RSI 14", fmtNum(snap.rsi_14)],
    ["Volume", fmtNum(snap.volume)],
    ["Volume vs 20-day avg", snap.volume_spike_ratio === null ? "—" : `${fmtNum(snap.volume_spike_ratio, 1)}×`],
    ["Market cap (PKR m)", fmtNum(snap.market_cap_m)],
  ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-secondary hover:text-primary">
        ← Watchlist
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {snap.ticker}{" "}
            {snap.is_kmi_30 && (
              <span className="ml-1 rounded border border-line px-1.5 py-0.5 align-middle text-xs font-normal text-secondary">
                KMI-30
              </span>
            )}
          </h1>
          <p className="text-secondary">{snap.company_name}</p>
          <p className="text-xs text-muted">{snap.sector}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">PKR {fmtPrice(snap.close_price)}</div>
          <div className="text-xs text-muted">Close on {fmtDate(snap.trade_date)}</div>
          <form action={following ? removeTicker : addTickerForm} className="mt-2">
            <input type="hidden" name="ticker" value={snap.ticker} />
            <button className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-page">
              {following ? "Remove from watchlist" : "Add to watchlist"}
            </button>
          </form>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value, cls]) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`mt-1 font-medium tabular-nums ${cls ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 font-medium">Price, last 12 months</h2>
        <PriceChart points={points} />

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-secondary">Show data table (last {TABLE_ROWS} sessions)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Close</th>
                  <th className="py-2 pr-4 text-right font-medium">50-day avg</th>
                  <th className="py-2 text-right font-medium">200-day avg</th>
                </tr>
              </thead>
              <tbody>
                {points.slice(-TABLE_ROWS).reverse().map((p) => (
                  <tr key={p.date} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-4">{fmtDate(p.date)}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{fmtPrice(p.close)}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{fmtPrice(p.sma50)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPrice(p.sma200)}</td>
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
