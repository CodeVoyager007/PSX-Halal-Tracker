import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { changeClass, fmtDate, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { Profile, SnapshotRow } from "@/lib/types";
import AddStock from "./add-stock";
import { removeTicker, updateDigest } from "./actions";

export const metadata = { title: "Dashboard · PSX Halal Tracker" };

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: watch }, { data: universe }] = await Promise.all([
    supabase.from("profiles").select("email, digest_enabled, digest_frequency").eq("id", user.id).single<Profile>(),
    supabase.from("watchlists").select("ticker"),
    supabase.from("latest_snapshot").select("*").order("ticker").returns<SnapshotRow[]>(),
  ]);

  const watched = new Set((watch ?? []).map((w) => w.ticker as string));
  const all = universe ?? [];
  const rows = all.filter((r) => watched.has(r.ticker));
  const options = all
    .filter((r) => !watched.has(r.ticker))
    .map(({ ticker, company_name, sector }) => ({ ticker, company_name, sector }));
  const marketDate = all.reduce<string | null>((max, r) => (r.trade_date && (!max || r.trade_date > max) ? r.trade_date : max), null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your watchlist</h1>
        <p className="mt-1 text-sm text-secondary">
          {rows.length} of 50 companies · prices as of {fmtDate(marketDate)} close
        </p>
      </div>

      <AddStock options={options} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-secondary">
          Your watchlist is empty. Search above to add the companies you want in your email.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 text-right font-medium">Close (PKR)</th>
                <th className="px-4 py-2 text-right font-medium">1-day</th>
                <th className="px-4 py-2 text-right font-medium">5-day</th>
                <th className="px-4 py-2 text-right font-medium">RSI 14</th>
                <th className="px-4 py-2 text-right font-medium">Volume vs avg</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/stocks/${r.ticker}`} className="font-medium hover:underline">
                      {r.ticker}
                    </Link>
                    <div className="text-xs text-muted">{r.company_name}</div>
                    {r.trade_date && marketDate && r.trade_date < marketDate && (
                      <div className="text-xs text-muted">Last traded {fmtDate(r.trade_date)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtPrice(r.close_price)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${changeClass(r.change_1d_pct)}`}>
                    {fmtPct(r.change_1d_pct)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${changeClass(r.price_change_5d_pct)}`}>
                    {fmtPct(r.price_change_5d_pct)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.rsi_14)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.volume_spike_ratio === null ? "—" : `${fmtNum(r.volume_spike_ratio, 1)}×`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={removeTicker}>
                      <input type="hidden" name="ticker" value={r.ticker} />
                      <button className="text-xs text-muted hover:text-loss" aria-label={`Remove ${r.ticker}`}>
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium">Email digest</h2>
        <p className="mt-1 text-sm text-secondary">
          Sent to {profile?.email} after the market closes (around 5 PM PKT).
        </p>
        <form action={updateDigest} className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={profile?.digest_enabled ?? true} className="accent-accent" />
            Send me the digest
          </label>
          <label className="flex items-center gap-2">
            Frequency
            <select
              name="frequency"
              defaultValue={profile?.digest_frequency ?? "daily"}
              className="rounded-md border border-line bg-surface px-2 py-1"
            >
              <option value="daily">Every trading day</option>
              <option value="weekly">Weekly (Fridays)</option>
            </select>
          </label>
          <button className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-page">Save</button>
        </form>
      </section>
    </div>
  );
}
