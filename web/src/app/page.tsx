import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  ChartLine,
  ChevronDown,
  CircleCheck,
  Clock,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChangePill, Sparkline, TickerBadge, heatColor } from "@/components/market";
import { FillPhoto, PhotoCredit } from "@/components/photo";

// Illustrative figures for the marketing previews only; not live prices.
const PREVIEW = [
  { ticker: "MEBL", name: "Meezan Bank", price: "550.42", change: 1.84, trend: [30, 31, 30.5, 32, 33, 32.6, 34, 35] },
  { ticker: "OGDC", name: "Oil & Gas Development", price: "318.41", change: 0.29, trend: [20, 21, 20.4, 21.5, 21, 22, 21.8, 22.3] },
  { ticker: "HUBC", name: "Hub Power Company", price: "204.51", change: -0.62, trend: [40, 41, 42, 41.5, 41, 40.2, 40.5, 39.8] },
  { ticker: "SYS", name: "Systems Limited", price: "121.20", change: 2.41, trend: [10, 10.4, 10.2, 10.9, 11.3, 11.1, 11.8, 12.2] },
];

const TAPE: [string, number][] = [
  ["MEBL", 1.84], ["OGDC", 0.29], ["HUBC", -0.62], ["SYS", 2.41], ["ENGROH", 0.95], ["PPL", -0.31],
  ["EFERT", 1.12], ["ATRL", -1.08], ["AIRLINK", 3.02], ["PSO", 0.44], ["SNGP", -0.57], ["DGKC", 1.66],
  ["MLCF", 0.73], ["SEARL", -0.21], ["PAEL", 2.15], ["NML", 0.38],
];

// Illustrative sector moves for the heatmap tile (percent)
const HEAT = [2.1, 0.8, -0.4, 1.3, -1.6, 0.2, 0.9, -0.7, 1.8, -0.2, 0.5, -1.1, 1.4, 0.1, -0.9, 0.6, 2.4, -0.3, 0.7, -1.4];

const FAQ = [
  [
    "Where does the data come from?",
    "End-of-day prices from the Pakistan Stock Exchange's public data portal, collected after the market closes each trading day.",
  ],
  [
    "How is Shariah compliance decided?",
    "We don't screen companies ourselves. The universe is exactly the KMI All-Share index, which PSX maintains with Al Meezan Investments using published Shariah criteria. It refreshes every week.",
  ],
  [
    "Is this investment advice?",
    "No. We report prices and standard indicators factually and never tell you to buy or sell. Please consult a licensed adviser for investment decisions.",
  ],
  ["Is it free?", "Yes. Create an account with your email, pick your companies, and the digest starts the next trading day."],
  [
    "Are prices live?",
    "No. Prices are closing prices, updated once per trading day after the market closes, and always shown with the date they apply to.",
  ],
];

function ProductPreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-sm font-semibold">Your watchlist</div>
            <div className="text-xs text-muted">4 companies · Close, Tue 22 Sep</div>
          </div>
          <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-medium text-gold">Illustrative</span>
        </div>
        <ul className="divide-y divide-line">
          {PREVIEW.map((r) => (
            <li key={r.ticker} className="flex items-center gap-3 px-5 py-3">
              <TickerBadge ticker={r.ticker} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{r.ticker}</div>
                <div className="truncate text-xs text-muted">{r.name}</div>
              </div>
              <Sparkline values={r.trend} className="hidden h-8 w-20 sm:block" />
              <div className="w-24 text-right">
                <div className="text-sm font-medium tabular-nums">{r.price}</div>
                <ChangePill value={r.change} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute -bottom-20 left-6 hidden w-72 rounded-xl border border-line bg-surface p-4 shadow-lift sm:block lg:-left-8">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs text-muted">Today, 5:04 PM</div>
            <div className="truncate text-sm font-semibold">Daily halal watchlist · 22 Sep</div>
            <div className="truncate text-xs text-secondary">SYS +2.41%, MEBL +1.84%, HUBC −0.62%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerTape() {
  const items = [...TAPE, ...TAPE];
  return (
    <div className="ticker-wrap overflow-hidden border-y border-line bg-surface py-3" aria-label="Illustrative sample of daily moves">
      <div className="ticker-track flex w-max gap-8">
        {items.map(([t, c], i) => (
          <span key={i} className="flex items-center gap-2 text-sm" aria-hidden={i >= TAPE.length}>
            <span className="font-semibold">{t}</span>
            <ChangePill value={c} />
          </span>
        ))}
      </div>
    </div>
  );
}

function EmailPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
      <div className="border-b border-line bg-surface-2 px-5 py-3 text-xs text-muted">
        <div>
          <span className="font-medium text-secondary">From:</span> PSX Halal Tracker
        </div>
        <div>
          <span className="font-medium text-secondary">Subject:</span> Daily halal watchlist · 22 Sep: SYS +2.41%,
          MEBL +1.84%
        </div>
      </div>
      <div className="p-5">
        <div className="text-base font-semibold">Daily update for Tue 22 Sep 2026</div>
        <div className="mt-0.5 text-xs text-muted">Your 4 watched stocks, biggest movers first.</div>
        <table className="mt-4 w-full text-sm">
          <tbody className="divide-y divide-line">
            {[...PREVIEW]
              .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
              .map((r) => (
                <tr key={r.ticker}>
                  <td className="py-2.5">
                    <div className="font-semibold">{r.ticker}</div>
                    {r.ticker === "SYS" && <div className="text-xs text-gold">Volume 2.6× its 20-day average</div>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{r.price}</td>
                  <td className="py-2.5 text-right">
                    <ChangePill value={r.change} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="mt-4 text-[11px] text-muted">For information only, not investment advice. · Unsubscribe</div>
      </div>
    </div>
  );
}

function ChartIllustration() {
  // Deterministic sample series: a rising close with a smoother average beneath it
  const close = [42, 44, 43, 47, 46, 50, 49, 53, 52, 57, 55, 60, 59, 63];
  const avg = close.map((_, i) => {
    const w = close.slice(Math.max(0, i - 4), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1)) * 100},${60 - (v - 38) * 2}`).join("");
  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-28 w-full" aria-hidden="true">
      {[15, 30, 45].map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={toPath(avg)} fill="none" stroke="var(--series-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={toPath(close)} fill="none" stroke="var(--series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function VolumeIllustration() {
  const bars = [30, 42, 35, 28, 40, 33, 38, 31, 36, 29, 41, 34, 37, 92];
  return (
    <div className="flex h-24 items-end gap-1" aria-hidden="true">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t ${i === bars.length - 1 ? "bg-gold" : "bg-line-strong"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <>
      {/* Hero: always dark, over a photo of Karachi at night */}
      <section className="relative isolate overflow-hidden bg-[#050b08] text-white">
        <FillPhoto photo="karachiNight" sizes="100vw" preload className="-z-20 opacity-70" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#050b08] via-[#050b08]/85 to-[#050b08]/30" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#050b08] via-transparent to-transparent" aria-hidden="true" />
        <div className="pattern-star absolute inset-0 -z-10 opacity-40 [mask-image:linear-gradient(to_right,black,transparent_60%)]" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-32 pt-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-36 lg:pt-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
              <ShieldCheck className="size-3.5 text-[#6ee7b7]" /> Based on the official KMI All-Share index
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
              Halal PSX investing,
              <br />
              <span className="bg-gradient-to-r from-[#6ee7b7] to-[#e0b35c] bg-clip-text text-transparent">
                minus the noise.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              Pick the Shariah-compliant companies you care about. After every trading day, get one clear email with how
              they moved, and what&apos;s unusual.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-[#34d399] px-5 py-3 font-medium text-[#04130d] shadow-lg shadow-emerald-900/40 transition hover:bg-[#6ee7b7]"
              >
                Start free <ArrowRight className="size-4" />
              </Link>
              <a
                href="#how"
                className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-medium text-white backdrop-blur transition hover:bg-white/15"
              >
                See how it works
              </a>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/15 pt-6">
              {[
                ["300+", "halal companies"],
                ["5 PM", "daily digest (PKT)"],
                ["Free", "no card needed"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-2xl font-semibold tracking-tight">{v}</dd>
                  <dd className="text-xs text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ProductPreview />
        </div>
        <PhotoCredit photo="karachiNight" className="absolute bottom-3 right-4" />
      </section>

      <TickerTape />

      {/* Bento grid */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-semibold text-brand">Features</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need to follow your halal portfolio. Nothing you don&apos;t.
          </h2>

          <div className="mt-12 grid auto-rows-[minmax(13rem,auto)] gap-4 md:grid-cols-6">
            {/* Shariah universe: photo tile */}
            <article className="relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden rounded-3xl p-7 text-white md:col-span-4 md:row-span-2">
              <FillPhoto photo="mosaic" sizes="(min-width: 768px) 66vw, 100vw" className="-z-20" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/95 via-black/60 to-black/0" aria-hidden="true" />
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                <ShieldCheck className="size-3.5" /> Shariah-screened
              </span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Only KMI All-Share companies</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/80">
                Your choices come straight from the official index, refreshed every week. When a company stops being
                compliant, it drops out automatically.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Islamic banking", "Cement", "Fertilizer", "Oil & gas", "Technology", "Pharma", "Power", "+ 30 more sectors"].map((s) => (
                  <span key={s} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs backdrop-blur">
                    {s}
                  </span>
                ))}
              </div>
              <PhotoCredit photo="mosaic" className="absolute right-4 top-4" />
            </article>

            {/* Universe size + heatmap */}
            <article className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-card md:col-span-2">
              <div className="text-4xl font-semibold tracking-tight">300+</div>
              <p className="mt-1 text-sm text-secondary">halal companies, searchable by name, ticker or sector</p>
              <div className="mt-auto grid grid-cols-5 gap-1 pt-5" aria-hidden="true">
                {HEAT.map((v, i) => (
                  <span key={i} className="aspect-square rounded-md" style={{ background: heatColor(v) }} />
                ))}
              </div>
            </article>

            {/* Email: photo tile */}
            <article className="relative isolate flex min-h-[13rem] flex-col justify-end overflow-hidden rounded-3xl p-6 text-white md:col-span-2">
              <FillPhoto photo="phoneCoffee" sizes="(min-width: 768px) 33vw, 100vw" className="-z-20" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden="true" />
              <span className="absolute left-5 top-5 flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-xs font-medium text-[#0c1512] shadow-lg">
                <Mail className="size-3.5 text-[#047857]" /> Daily digest · 5:04 PM
              </span>
              <h3 className="text-lg font-semibold">One email after the close</h3>
              <p className="mt-1 text-sm text-white/80">Daily, or a Friday wrap-up. No app to open.</p>
              <PhotoCredit photo="phoneCoffee" className="absolute right-3 top-3" />
            </article>

            {/* Charts */}
            <article className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-card md:col-span-2">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-soft-ink">
                <ChartLine className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">Charts that make sense</h3>
              <p className="mt-1 text-sm text-secondary">Twelve months of prices with 50- and 200-day averages.</p>
              <div className="mt-auto pt-4">
                <ChartIllustration />
              </div>
            </article>

            {/* Unusual volume */}
            <article className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-card md:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gold-soft text-gold">
                  <BellRing className="size-5" />
                </span>
                <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-medium text-gold">2.6× avg volume</span>
              </div>
              <h3 className="mt-4 font-semibold">Know what&apos;s unusual</h3>
              <p className="mt-1 text-sm text-secondary">Volume spikes and RSI extremes, in plain language.</p>
              <div className="mt-auto pt-4">
                <VolumeIllustration />
              </div>
            </article>

            {/* Privacy */}
            <article className="relative isolate flex flex-col overflow-hidden rounded-3xl bg-brand p-6 text-brand-ink shadow-card md:col-span-2">
              <div className="pattern-star absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
              <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                <Lock className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">Private by design</h3>
              <p className="mt-1 text-sm opacity-85">
                No passwords to leak. Your watchlist is visible only to you. Unsubscribe in one click.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Set it up once. Stay informed daily.</h2>
            <ol className="relative mt-10 space-y-8 before:absolute before:bottom-4 before:left-[1.1rem] before:top-4 before:w-px before:bg-line">
              {[
                ["Sign in with your email", "We send a one-time link. No password to create or remember."],
                ["Build your watchlist", "Search the KMI All-Share index and add up to 50 companies."],
                ["Get your digest", "Every trading day around 5 PM PKT, or weekly on Fridays. Unsubscribe any time."],
              ].map(([title, body], i) => (
                <li key={title} className="relative flex gap-4">
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink shadow-card">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-secondary">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-10 flex items-center gap-2 text-sm text-muted">
              <Clock className="size-4" /> Prices are end-of-day closing prices, not live quotes.
            </p>
          </div>
          <EmailPreview />
        </div>
      </section>

      {/* Photo split */}
      <section>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-lift">
            <FillPhoto photo="karachiSunset" sizes="(min-width: 1024px) 50vw, 100vw" />
            <PhotoCredit photo="karachiSunset" className="absolute bottom-3 right-3" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand">Made for Pakistan</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Built around how PSX actually works
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["Prices in PKR", "Closing prices exactly as PSX reports them."],
                ["PSX trading hours", "Digests wait for the Friday half-session to close."],
                ["Holidays handled", "No trading day, no email. Nothing duplicated."],
                ["KMI All-Share", "The index Pakistani Islamic funds are built on."],
              ].map(([t, b]) => (
                <li key={t} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-center gap-2 font-medium">
                    <CircleCheck className="size-4 text-brand" /> {t}
                  </div>
                  <p className="mt-1 text-sm text-secondary">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <p className="text-center text-sm font-semibold text-brand">FAQ</p>
          <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight">Questions, answered</h2>
          <div className="mt-12 divide-y divide-line rounded-2xl border border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-secondary">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24 sm:px-6">
        <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#065f46] via-[#047857] to-[#0f766e] px-8 py-20 text-center text-white shadow-lift">
          <div className="pattern-star absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
          <div className="absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-[#e0b35c]/30 blur-3xl" aria-hidden="true" />
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your first digest is one trading day away.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Free, private, and built around the companies you already believe in.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-medium text-[#065f46] shadow-lg transition hover:bg-white/90"
          >
            Create your watchlist <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
