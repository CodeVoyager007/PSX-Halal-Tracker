import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  ChartLine,
  ChevronDown,
  Clock,
  Lock,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChangePill, Sparkline, TickerBadge } from "@/components/market";

// Illustrative figures for the product previews only; not live prices.
const PREVIEW = [
  { ticker: "MEBL", name: "Meezan Bank", price: "550.42", change: 1.84, trend: [30, 31, 30.5, 32, 33, 32.6, 34, 35] },
  { ticker: "OGDC", name: "Oil & Gas Development", price: "318.41", change: 0.29, trend: [20, 21, 20.4, 21.5, 21, 22, 21.8, 22.3] },
  { ticker: "LUCK", name: "Lucky Cement", price: "423.79", change: -0.62, trend: [40, 41, 42, 41.5, 41, 40.2, 40.5, 39.8] },
  { ticker: "SYS", name: "Systems Limited", price: "121.20", change: 2.41, trend: [10, 10.4, 10.2, 10.9, 11.3, 11.1, 11.8, 12.2] },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Shariah-screened universe",
    body: "Only companies in the official KMI All-Share index. The list refreshes every week, so non-compliant stocks drop out automatically.",
  },
  {
    icon: Mail,
    title: "One email after the close",
    body: "Around 5 PM PKT each trading day, or a Friday wrap-up. Your companies, biggest movers first. No app to open.",
  },
  {
    icon: Search,
    title: "Pick from 300+ companies",
    body: "Search by ticker, name or sector and follow up to 50. Change your list any time.",
  },
  {
    icon: ChartLine,
    title: "Charts that make sense",
    body: "Twelve months of prices with 50- and 200-day averages for every company you follow.",
  },
  {
    icon: BellRing,
    title: "Know what's unusual",
    body: "We flag trading volume well above normal and RSI at extremes, in plain language, without buy or sell calls.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "No passwords to leak. Your watchlist is visible only to you, and you can unsubscribe in one click.",
  },
];

const FAQ = [
  [
    "Where does the data come from?",
    "End-of-day prices from the Pakistan Stock Exchange's public data portal, collected after the market closes each trading day.",
  ],
  [
    "How is Shariah compliance decided?",
    "We don't screen companies ourselves. The universe is exactly the KMI All-Share index, which PSX maintains with Al Meezan Investments using published Shariah criteria.",
  ],
  [
    "Is this investment advice?",
    "No. We report prices and standard indicators factually. We never tell you to buy or sell. Please consult a licensed adviser for investment decisions.",
  ],
  ["Is it free?", "Yes. Create an account with your email, pick your companies, and the digest starts the next trading day."],
  [
    "Are prices live?",
    "No. Prices are closing prices, updated once per trading day after the market closes, and shown with the date they apply to.",
  ],
];

function ProductPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-brand/10 blur-2xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
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

      {/* Email notification card */}
      <div className="absolute -bottom-20 left-6 hidden w-72 rounded-xl border border-line bg-surface p-4 shadow-lift sm:block lg:-left-8">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-xs text-muted">Today, 5:04 PM</div>
            <div className="truncate text-sm font-semibold">Daily halal watchlist · 22 Sep</div>
            <div className="truncate text-xs text-secondary">SYS +2.41%, MEBL +1.84%, LUCK −0.62%</div>
          </div>
        </div>
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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="pattern-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-16 sm:px-6 sm:pb-32 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-secondary shadow-card">
              <ShieldCheck className="size-3.5 text-brand" /> Based on the official KMI All-Share index
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Halal PSX investing,
              <br />
              <span className="text-brand">minus the noise.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-secondary">
              Pick the Shariah-compliant companies you care about. After every trading day, get one clear email
              with how they moved, and what&apos;s unusual.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong"
              >
                Start free <ArrowRight className="size-4" />
              </Link>
              <a
                href="#how"
                className="rounded-xl border border-line bg-surface px-5 py-3 font-medium text-primary shadow-card transition hover:border-line-strong"
              >
                See how it works
              </a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
              {[
                ["300+", "halal companies"],
                ["5 PM", "daily digest (PKT)"],
                ["Free", "no card needed"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-2xl font-semibold tracking-tight">{v}</dd>
                  <dd className="text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-semibold text-brand">Features</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need to follow your halal portfolio. Nothing you don&apos;t.
          </h2>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-soft-ink">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Set it up once. Stay informed daily.</h2>
            <ol className="mt-10 space-y-8">
              {[
                ["Sign in with your email", "We send a one-time link. No password to create or remember."],
                ["Build your watchlist", "Search the KMI All-Share index and add up to 50 companies."],
                [
                  "Get your digest",
                  "Every trading day around 5 PM PKT, or weekly on Fridays. Unsubscribe any time.",
                ],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-sm font-semibold text-brand shadow-card">
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
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand px-8 py-16 text-center text-brand-ink shadow-lift">
          <div className="pattern-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true" />
          <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Your first digest is one trading day away.</h2>
          <p className="relative mx-auto mt-4 max-w-xl opacity-90">
            Free, private, and built around the companies you already believe in.
          </p>
          <Link
            href="/login"
            className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-ink px-6 py-3 font-medium text-brand transition hover:opacity-90"
          >
            Create your watchlist <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
