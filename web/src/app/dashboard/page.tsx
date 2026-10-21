import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtNum, fmtPrice, toNum } from "@/lib/format";
import type { Profile, SnapshotRow } from "@/lib/types";
import { ChangePill, TickerBadge } from "@/components/market";
import AddStock from "./add-stock";
import DigestPicker from "./digest-picker";
import MarketOverview from "./market-overview";
import { addTickerForm, removeTicker, type DigestChoice } from "./actions";

export const metadata = { title: "My watchlist · PSX Halal Tracker" };

// Offered as one-tap adds while setting up, when present in the universe
const POPULAR = ["MEBL", "OGDC", "LUCK", "SYS", "HUBC", "ENGROH", "PPL", "EFERT", "MARI", "FCCL", "BIPL", "ATRL"];

function Card({ step, title, hint, children }: { step?: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        {step && (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-secondary">{hint}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
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
  const popular = POPULAR.map((t) => all.find((r) => r.ticker === t)).filter(
    (r): r is SnapshotRow => !!r && !watched.has(r.ticker),
  );
  const marketDate = all.reduce<string | null>(
    (max, r) => (r.trade_date && (!max || r.trade_date > max) ? r.trade_date : max),
    null,
  );
  const digest: DigestChoice = !profile?.digest_enabled ? "off" : profile.digest_frequency === "weekly" ? "weekly" : "daily";
  const settingUp = rows.length === 0;

  const popularButtons = popular.length > 0 && (
    <div className="mt-4">
      <p className="text-sm text-secondary">Popular choices, tap to add:</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {popular.slice(0, settingUp ? 12 : 6).map((r) => (
          <form key={r.ticker} action={addTickerForm}>
            <input type="hidden" name="ticker" value={r.ticker} />
            <button className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition hover:border-brand hover:bg-brand-soft">
              <Plus className="size-4 shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.ticker}</span>
                <span className="block truncate text-xs text-muted">{r.company_name}</span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{settingUp ? "Welcome! Two quick steps" : "My watchlist"}</h1>
        <p className="mt-1 text-sm text-secondary">
          {settingUp
            ? "Choose your companies and how often you want the email. You can change both any time."
            : `Closing prices for ${fmtDate(marketDate)}. Updated every trading day after 5 PM PKT.`}
        </p>
      </div>

      {settingUp ? (
        <>
          <Card step={1} title="Pick the companies you want to follow" hint="All of them are Shariah-compliant (KMI All-Share index).">
            <AddStock options={options} />
            {popularButtons}
          </Card>
          <Card step={2} title="How often should we email you?">
            <DigestPicker value={digest} email={profile?.email ?? null} />
          </Card>
        </>
      ) : (
        <>
          <Card title="Your email">
            <DigestPicker value={digest} email={profile?.email ?? null} />
          </Card>

          <Card title={`Companies you follow (${rows.length} of 50)`} hint="Tap a company for its chart and details.">
            <AddStock options={options} />
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
              {rows.map((r) => {
                const spike = toNum(r.volume_spike_ratio);
                const stale = r.trade_date && marketDate && r.trade_date < marketDate;
                return (
                  <li key={r.ticker} className="group flex items-center gap-3 bg-surface px-3 py-3 sm:px-4">
                    <Link href={`/stocks/${r.ticker}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <TickerBadge ticker={r.ticker} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-semibold group-hover:text-brand">
                          {r.ticker}
                          <ChevronRight className="size-3.5 text-muted" />
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {stale ? `Last traded ${fmtDate(r.trade_date)}` : r.company_name}
                        </span>
                        {spike !== null && spike >= 2 && (
                          <span className="mt-1 inline-block rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">
                            Unusual volume: {fmtNum(spike, 1)}× normal
                          </span>
                        )}
                      </span>
                    </Link>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium tabular-nums">{fmtPrice(r.close_price)}</span>
                      <ChangePill value={r.change_1d_pct} />
                    </span>
                    <form action={removeTicker}>
                      <input type="hidden" name="ticker" value={r.ticker} />
                      <button
                        className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-loss-soft hover:text-loss"
                        aria-label={`Stop following ${r.ticker}`}
                        title="Stop following"
                      >
                        <X className="size-4" />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
            {rows.length < 6 && popularButtons}
          </Card>

          <MarketOverview rows={all} marketDate={marketDate} watched={watched} />
        </>
      )}
    </div>
  );
}
