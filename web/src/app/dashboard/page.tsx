import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronRight, Inbox, Layers, Mail, Plus, TrendingDown, TrendingUp, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtNum, fmtPrice, toNum } from "@/lib/format";
import type { Profile, SnapshotRow } from "@/lib/types";
import { ChangePill, TickerBadge } from "@/components/market";
import AddStock from "./add-stock";
import MarketOverview from "./market-overview";
import { addTickerForm, removeTicker, updateDigest } from "./actions";

export const metadata = { title: "Dashboard · PSX Halal Tracker" };

// Offered as one-click adds on an empty watchlist, when present in the universe
const SUGGESTED = ["MEBL", "OGDC", "SYS", "HUBC", "ENGROH", "PPL", "EFERT", "ATRL"];

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm text-secondary">
        <Icon className="size-4 text-brand" /> {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

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
  const rows = all
    .filter((r) => watched.has(r.ticker))
    .sort((a, b) => Math.abs(toNum(b.change_1d_pct) ?? 0) - Math.abs(toNum(a.change_1d_pct) ?? 0));
  const options = all
    .filter((r) => !watched.has(r.ticker))
    .map(({ ticker, company_name, sector }) => ({ ticker, company_name, sector }));
  const suggestions = SUGGESTED.filter((t) => options.some((o) => o.ticker === t));
  const marketDate = all.reduce<string | null>(
    (max, r) => (r.trade_date && (!max || r.trade_date > max) ? r.trade_date : max),
    null,
  );

  const gainers = rows.filter((r) => (toNum(r.change_1d_pct) ?? 0) > 0).length;
  const losers = rows.filter((r) => (toNum(r.change_1d_pct) ?? 0) < 0).length;
  const digestLabel = !profile?.digest_enabled
    ? "Off"
    : profile.digest_frequency === "weekly"
      ? "Fridays"
      : "Daily";

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#065f46] via-[#047857] to-[#0f766e] px-6 py-8 text-white shadow-lift sm:px-8">
        <div className="pattern-star absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-[#e0b35c]/30 blur-3xl" aria-hidden="true" />
        <p className="text-sm text-white/75">Assalam-o-Alaikum</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your halal watchlist</h1>
        <p className="mt-2 text-sm text-white/80">
          Closing prices for {fmtDate(marketDate)} · updated after each trading day
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Layers} label="Following" value={`${rows.length} / 50`} hint="companies" />
        <StatCard icon={TrendingUp} label="Up today" value={String(gainers)} hint="closed higher" />
        <StatCard icon={TrendingDown} label="Down today" value={String(losers)} hint="closed lower" />
        <StatCard
          icon={CalendarClock}
          label="Email digest"
          value={digestLabel}
          hint={profile?.digest_enabled ? "around 5 PM PKT" : "turned off"}
        />
      </div>

      <section className="rounded-2xl border border-line bg-surface shadow-card">
        <div className="border-b border-line p-5">
          <AddStock options={options} />
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-soft-ink">
              <Inbox className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">Start your watchlist</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-secondary">
              Search above, or add some of the most-followed Shariah-compliant companies:
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((t) => (
                <form key={t} action={addTickerForm}>
                  <input type="hidden" name="ticker" value={t} />
                  <button className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium shadow-card transition hover:border-brand hover:text-brand">
                    <Plus className="size-3.5" /> {t}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            {/* relative keeps the absolutely positioned sr-only header inside this scroll area */}
            <table className="w-full text-sm md:min-w-[720px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium sm:px-5">Company</th>
                  <th className="px-2 py-3 text-right font-medium sm:px-5">Close</th>
                  <th className="px-2 py-3 text-right font-medium sm:px-5">1 day</th>
                  <th className="hidden px-5 py-3 text-right font-medium md:table-cell">5 days</th>
                  <th className="hidden px-5 py-3 text-right font-medium md:table-cell">RSI 14</th>
                  <th className="hidden px-5 py-3 text-right font-medium md:table-cell">Volume vs avg</th>
                  <th className="px-2 py-3 sm:px-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const spike = toNum(r.volume_spike_ratio);
                  const stale = r.trade_date && marketDate && r.trade_date < marketDate;
                  return (
                    <tr key={r.ticker} className="group transition hover:bg-surface-2/60">
                      <td className="px-4 py-3.5 sm:px-5">
                        <Link href={`/stocks/${r.ticker}`} className="flex items-center gap-3">
                          <span className="hidden sm:block">
                            <TickerBadge ticker={r.ticker} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 font-semibold group-hover:text-brand">
                              {r.ticker}
                              <ChevronRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                            </span>
                            <span className="block max-w-[7.5rem] truncate text-xs text-muted sm:max-w-[16rem]">
                              {stale ? `Last traded ${fmtDate(r.trade_date)}` : r.company_name}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-3.5 text-right font-medium tabular-nums sm:px-5">{fmtPrice(r.close_price)}</td>
                      <td className="px-2 py-3.5 text-right sm:px-5">
                        <ChangePill value={r.change_1d_pct} />
                      </td>
                      <td className="hidden px-5 py-3.5 text-right md:table-cell">
                        <ChangePill value={r.price_change_5d_pct} />
                      </td>
                      <td className="hidden px-5 py-3.5 text-right tabular-nums text-secondary md:table-cell">{fmtNum(r.rsi_14)}</td>
                      <td className="hidden px-5 py-3.5 text-right tabular-nums md:table-cell">
                        {spike === null ? (
                          <span className="text-muted">—</span>
                        ) : spike >= 2 ? (
                          <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                            {fmtNum(spike, 1)}× unusual
                          </span>
                        ) : (
                          <span className="text-secondary">{fmtNum(spike, 1)}×</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-right sm:px-5">
                        <form action={removeTicker}>
                          <input type="hidden" name="ticker" value={r.ticker} />
                          <button
                            className="grid size-8 place-items-center rounded-lg text-muted opacity-60 transition hover:bg-loss-soft hover:text-loss group-hover:opacity-100"
                            aria-label={`Remove ${r.ticker} from watchlist`}
                            title="Remove"
                          >
                            <X className="size-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <MarketOverview rows={all} marketDate={marketDate} watched={watched} />

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-soft-ink">
            <Mail className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Email digest</h2>
            <p className="mt-1 text-sm text-secondary">
              Sent to <span className="font-medium text-primary">{profile?.email}</span> after the market closes.
            </p>

            <form action={updateDigest} className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={profile?.digest_enabled ?? true}
                  className="peer sr-only"
                />
                <span className="relative h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow after:transition peer-checked:after:translate-x-5" />
                Send me the digest
              </label>

              <fieldset className="flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
                <legend className="sr-only">Frequency</legend>
                {[
                  ["daily", "Every trading day"],
                  ["weekly", "Weekly (Fri)"],
                ].map(([value, label]) => (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="frequency"
                      value={value}
                      defaultChecked={(profile?.digest_frequency ?? "daily") === value}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg px-3.5 py-1.5 text-secondary transition peer-checked:bg-surface peer-checked:font-medium peer-checked:text-primary peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
                      {label}
                    </span>
                  </label>
                ))}
              </fieldset>

              <button className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-ink shadow-card transition hover:bg-brand-strong">
                Save settings
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
