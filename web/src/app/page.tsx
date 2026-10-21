import { redirect } from "next/navigation";
import { ChevronDown, Lock, Mail, MousePointerClick, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ChangePill } from "@/components/market";
import { FillArt } from "@/components/art";
import LoginForm from "./login/login-form";
import CompanySearch from "./company-search";

// Illustrative figures for the sample email only; not live prices.
const SAMPLE = [
  { ticker: "SYS", note: "Volume 2.6× normal", price: "121.20", change: 2.41 },
  { ticker: "MEBL", note: "", price: "550.42", change: 1.84 },
  { ticker: "HUBC", note: "", price: "204.51", change: -0.62 },
  { ticker: "OGDC", note: "", price: "318.41", change: 0.29 },
];

const STEPS = [
  { icon: Mail, title: "Enter your email", body: "We send a sign-in link. No password to create." },
  { icon: MousePointerClick, title: "Pick your companies", body: "Tap the Shariah-compliant companies you follow." },
  { icon: ShieldCheck, title: "Get the email", body: "Every trading day around 5 PM, or once a week on Fridays." },
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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  // Public directory (ticker, name, sector only; no prices) for the halal-list search
  const { data: companies } = await supabase.rpc("company_directory");

  return (
    <>
      {/* Hero: the sign-up form is right here, not behind another page */}
      <section className="relative isolate overflow-hidden bg-[#04130d] text-white">
        <FillArt art="hero" sizes="100vw" preload className="-z-20 object-[70%_center] opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04130d] via-[#04130d]/80 to-[#04130d]/40" aria-hidden="true" />

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
              <ShieldCheck className="size-3.5 text-[#6ee7b7]" /> Only Shariah-compliant PSX companies
            </span>
            <h1 className="mt-5 text-4xl font-medium leading-tight sm:text-5xl lg:text-6xl">
              Your halal stocks,
              <br />
              <span className="font-display-italic text-[#e0b35c]">in one daily email.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
              Choose the companies you follow. After the market closes, we email you their closing prices and anything
              unusual. Free.
            </p>
          </div>

          <div id="signup" className="scroll-mt-24 rounded-2xl bg-surface p-6 text-primary shadow-lift sm:p-8">
            <h2 className="text-xl font-semibold">Start in under a minute</h2>
            <p className="mt-1 text-sm text-secondary">Enter your email. We&apos;ll send a link to sign in, no password needed.</p>
            <LoginForm next="/dashboard" autoFocus={false} cta="Get started free" />
            <p className="mt-5 flex items-center gap-2 text-xs text-muted">
              <Lock className="size-3.5 shrink-0" /> Your email is only used to sign you in and send the emails you choose.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                  {i + 1}
                </span>
                <Icon className="size-5 text-brand" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-secondary">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Check a company + what the email looks like */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-page p-6">
            <h2 className="text-2xl font-semibold tracking-tight">Is your company on the halal list?</h2>
            <p className="mt-1 text-sm text-secondary">
              Search {companies?.length ? `all ${companies.length}` : "300+"} Shariah-compliant companies by name, ticker or sector.
            </p>
            <div className="mt-5">
              <CompanySearch companies={companies ?? []} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-page p-6">
            <h2 className="text-2xl font-semibold tracking-tight">What the email looks like</h2>
            <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
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
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
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
        <p className="mt-8 text-center">
          <a href="#signup" className="font-medium text-brand hover:underline">
            Get started free ↑
          </a>
        </p>
      </section>
    </>
  );
}
