import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, CircleCheck, Lock, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChangePill } from "@/components/market";
import { FillArt, type ArtKey } from "@/components/art";
import LoginForm from "./login/login-form";
import CompanySearch from "./company-search";
import { SITE } from "@/lib/site";

// Illustrative figures for the decorative tape and sample email only; not live prices.
const SAMPLE = [
  { ticker: "SYS", note: "Volume 2.6× normal", price: "121.20", change: 2.41 },
  { ticker: "MEBL", note: "", price: "550.42", change: 1.84 },
  { ticker: "HUBC", note: "", price: "204.51", change: -0.62 },
  { ticker: "OGDC", note: "", price: "318.41", change: 0.29 },
];

const TAPE: [string, number][] = [
  ["MEBL", 1.84], ["OGDC", 0.29], ["HUBC", -0.62], ["SYS", 2.41], ["LUCK", 0.95], ["PPL", -0.31],
  ["EFERT", 1.12], ["ATRL", -1.08], ["AIRLINK", 3.02], ["PSO", 0.44], ["MARI", 1.37], ["FCCL", 1.66],
  ["BIPL", 0.73], ["SEARL", -0.21], ["PAEL", 2.15], ["ENGROH", 0.38],
];

const STEPS: { art: ArtKey; title: string; body: string }[] = [
  { art: "arches", title: "Enter your email", body: "We send a sign-in link. No password to create or remember." },
  { art: "shariah", title: "Pick your companies", body: "Tap the Shariah-compliant companies you follow, from the official KMI list." },
  { art: "email", title: "Get the email", body: "Every trading day around 5 PM, or once a week on Fridays." },
];

const FAQ = [
  [
    "Where do the prices come from?",
    "From the Pakistan Stock Exchange's official closing-price file for each trading day, cross-checked against a second independent source before you see them.",
  ],
  [
    "How do you decide what is halal?",
    "We don't judge it ourselves. The list is exactly the KMI All-Share index, which PSX maintains with Al Meezan using published Shariah criteria. It refreshes every week.",
  ],
  ["Is it free?", "Yes. No card, no trial. Unsubscribe from any email in one click."],
  [
    "Is this investment advice?",
    "No. We report prices and standard indicators and never tell you to buy or sell. Prices are closing prices, not live quotes.",
  ],
];

function TickerTape() {
  const items = [...TAPE, ...TAPE];
  return (
    <div className="ticker-wrap overflow-hidden border-y border-line bg-surface py-3" tabIndex={0} aria-label="Sample daily moves (illustrative); hover or focus to pause">
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

// Structured data so search engines understand what the site is
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: SITE.name, url: SITE.url, description: SITE.description, inLanguage: "en" },
    {
      "@type": "WebApplication",
      name: SITE.name,
      url: SITE.url,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "PKR" },
      description: SITE.description,
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const deleted = (await searchParams).deleted === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  // Public directory (ticker, name, sector only; no prices) for the halal-list search
  const { data: companies } = await supabase.rpc("company_directory");
  const count = companies?.length ? String(companies.length) : "300+";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      {deleted && (
        <div role="status" className="flex items-center justify-center gap-2 bg-brand-soft px-4 py-3 text-sm text-brand-soft-ink">
          <CircleCheck className="size-4" /> Your account and all its data have been deleted.
        </div>
      )}
      {/* Hero: commissioned Karachi-skyline artwork, sign-up form right here */}
      <section className="relative isolate overflow-hidden bg-[#04130d] text-white">
        <FillArt art="hero" sizes="100vw" preload className="settle -z-20 object-[70%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04130d] via-[#04130d]/75 to-[#04130d]/10" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-[#04130d]/80 to-transparent" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <span
              className="fade-up font-arabic block text-4xl leading-tight text-[#e0b35c] drop-shadow-[0_2px_12px_rgba(224,179,92,0.4)] sm:text-5xl"
              lang="ar"
              aria-hidden="true"
            >
              حلال
            </span>
            <span
              className="fade-up mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur"
              style={{ "--delay": "0.1s" } as React.CSSProperties}
            >
              <ShieldCheck className="size-3.5 text-[#6ee7b7]" /> Only Shariah-compliant PSX companies
            </span>
            <h1 className="fade-up mt-5 text-4xl font-medium leading-tight sm:text-5xl lg:text-6xl" style={{ "--delay": "0.2s" } as React.CSSProperties}>
              Your halal stocks,
              <br />
              <span className="font-display-italic shimmer bg-gradient-to-r from-[#6ee7b7] via-[#e0b35c] to-[#6ee7b7] bg-clip-text pr-2 text-transparent">
                in one daily email.
              </span>
            </h1>
            <p className="fade-up mt-5 max-w-lg text-lg leading-relaxed text-white/80" style={{ "--delay": "0.3s" } as React.CSSProperties}>
              Choose the companies you follow. After the market closes, we email you their closing prices and anything
              unusual. Free.
            </p>
            <dl className="fade-up mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6" style={{ "--delay": "0.4s" } as React.CSSProperties}>
              {[
                [count, "halal companies"],
                ["5 PM", "daily email (PKT)"],
                ["Free", "no card needed"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-3xl font-medium">{v}</dd>
                  <dd className="text-xs text-white/60">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            {/* Decorative: what lands in the inbox */}
            <div className="float absolute -top-6 right-4 z-10 hidden w-64 rounded-xl border border-line bg-surface p-3.5 text-primary shadow-lift sm:block lg:-right-6 lg:-top-10">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-muted">Today, 5:04 PM</div>
                  <div className="truncate text-sm font-semibold">Your halal watchlist</div>
                  <div className="truncate text-xs text-secondary">SYS +2.41%, MEBL +1.84%</div>
                </div>
              </div>
            </div>

            <div id="signup" className="fade-up relative scroll-mt-24 rounded-2xl bg-surface p-6 text-primary shadow-lift sm:p-8" style={{ "--delay": "0.3s" } as React.CSSProperties}>
              <h2 className="text-xl font-semibold">Start in under a minute</h2>
              <p className="mt-1 text-sm text-secondary">Enter your email. We&apos;ll send a link to sign in, no password needed.</p>
              <LoginForm next="/dashboard" autoFocus={false} cta="Get started free" />
              <p className="mt-5 flex items-center gap-2 text-xs text-muted">
                <Lock className="size-3.5 shrink-0" /> Your email is only used to sign you in and send the emails you choose.
              </p>
            </div>
          </div>
        </div>
      </section>

      <TickerTape />

      {/* How it works: one picture per step */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="reveal text-center text-sm font-semibold text-brand">How it works</p>
        <h2 className="reveal mt-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">Set it up once. Stay informed daily.</h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {STEPS.map(({ art, title, body }, i) => (
            <li key={title} className="reveal lift overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="relative h-40">
                <FillArt art={art} sizes="(min-width: 640px) 33vw, 100vw" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" aria-hidden="true" />
                <span className="absolute bottom-3 left-4 grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink shadow-lift">
                  {i + 1}
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-secondary">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Check a company + what the email looks like */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="reveal relative isolate overflow-hidden rounded-2xl border border-line bg-page p-6">
            <div className="pattern-star absolute inset-0 -z-10 opacity-[0.08] invert dark:invert-0" aria-hidden="true" />
            <h2 className="text-2xl font-semibold tracking-tight">Is your company on the halal list?</h2>
            <p className="mt-1 text-sm text-secondary">Search all {count} Shariah-compliant companies by name, ticker or sector.</p>
            <div className="mt-5">
              <CompanySearch companies={companies ?? []} />
            </div>
          </div>

          <div className="reveal rounded-2xl border border-line bg-page p-6">
            <h2 className="text-2xl font-semibold tracking-tight">What the email looks like</h2>
            <div className="lift mt-5 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-muted">
                Daily halal watchlist · 22 Sep: SYS +2.41%, MEBL +1.84%
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {SAMPLE.map((r) => (
                    <tr key={r.ticker}>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{r.ticker}</div>
                        {r.note && <div className="text-xs text-gold">{r.note}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.price}</td>
                      <td className="px-4 py-2.5 text-right">
                        <ChangePill value={r.change} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Sample figures · Unsubscribe in one click</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="reveal text-center text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="reveal mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action over the coastal-city artwork */}
      <section className="px-4 pb-16 sm:px-6">
        <div className="reveal relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-16 text-center text-white shadow-lift sm:px-8">
          <FillArt art="city" sizes="(min-width: 1152px) 1152px, 100vw" className="-z-20" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#065f46]/95 via-[#047857]/85 to-[#0f766e]/80" aria-hidden="true" />
          <div className="pattern-star absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your first email is one trading day away.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Free, private, and built around the companies you already believe in.</p>
          <a
            href="#signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-medium text-[#065f46] shadow-lg transition hover:-translate-y-0.5 hover:bg-white/90"
          >
            Get started free <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </>
  );
}
