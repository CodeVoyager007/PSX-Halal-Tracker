"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, LoaderCircle, MailCheck, Search, Send, X } from "lucide-react";
import { searchCompanies, type CompanyOption } from "@/lib/search";
import { completeSetup, type DigestChoice, type SendResult } from "./actions";

const FREQUENCIES: { value: DigestChoice; label: string; hint: string }[] = [
  { value: "daily", label: "Daily", hint: "Each trading day, ~5 PM" },
  { value: "weekly", label: "Weekly", hint: "Fridays" },
  { value: "off", label: "Off", hint: "No emails" },
];

/** A whole card is the button: tap anywhere on it to select or unselect. */
function CompanyCard({ c, selected, onToggle }: { c: CompanyOption; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`lift flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        selected ? "border-brand bg-brand-soft ring-2 ring-brand/25" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-md border transition ${
          selected ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface"
        }`}
        aria-hidden="true"
      >
        {selected && <Check className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{c.ticker}</span>
        <span className="block truncate text-xs text-muted">{c.company_name}</span>
      </span>
    </button>
  );
}

export default function SetupWizard({
  options,
  popular,
  email,
}: {
  options: CompanyOption[];
  popular: CompanyOption[];
  email: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [frequency, setFrequency] = useState<DigestChoice>("daily");
  const [result, setResult] = useState<(SendResult & { saved?: boolean }) | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const byTicker = useMemo(() => new Map(options.map((o) => [o.ticker, o])), [options]);
  const results = useMemo(() => searchCompanies(options, query, 9), [options, query]);
  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length >= 50 ? s : [...s, t]));

  // Popular companies plus anything picked from search, so selections stay visible
  const shown = [...popular, ...selected.map((t) => byTicker.get(t)).filter((c): c is CompanyOption => !!c)]
    .filter((c, i, all) => all.findIndex((x) => x.ticker === c.ticker) === i);

  if (result?.saved) {
    const sentTo = result.email ?? email;
    return (
      <section className="reveal overflow-hidden rounded-3xl border border-line bg-surface p-6 text-center shadow-lift sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-brand-ink">
          <CircleCheck className="size-9" />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">You&apos;re all set!</h2>
        <p className="mx-auto mt-2 max-w-md text-secondary">
          Following {selected.length} {selected.length === 1 ? "company" : "companies"}:{" "}
          <strong className="text-primary">{selected.join(", ")}</strong>.
        </p>
        <div className="mx-auto mt-6 max-w-md rounded-2xl bg-brand-soft p-4 text-left text-sm text-brand-soft-ink">
          {result.sent ? (
            <p className="flex gap-2">
              <MailCheck className="size-5 shrink-0" /> Your first email is on its way to <strong>{sentTo}</strong>. Check
              your inbox (and Spam, the first time).
            </p>
          ) : result.already ? (
            <p className="flex gap-2">
              <MailCheck className="size-5 shrink-0" /> You already have the latest email. The next one comes after the
              next trading day.
            </p>
          ) : frequency === "off" ? (
            <p>Emails are off. You can switch them on any time from your dashboard.</p>
          ) : (
            <p>{result.error ?? "Your first email will arrive after the market closes today."}</p>
          )}
          {frequency !== "off" && (
            <p className="mt-2 text-xs opacity-80">
              From now on: {frequency === "weekly" ? "every Friday after the close" : "every trading day around 5 PM PKT"}.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong"
        >
          Go to my watchlist
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="reveal rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink">1</span>
          <div>
            <h2 className="text-lg font-semibold">Tap the companies you want to follow</h2>
            <p className="mt-0.5 text-sm text-secondary">All are Shariah-compliant (KMI All-Share index). Tap again to unselect.</p>
          </div>
        </div>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any company by name or ticker"
            aria-label="Search companies"
            className="w-full rounded-xl border border-line bg-surface-2 py-3 pl-11 pr-10 outline-none transition placeholder:text-muted focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-primary">
              <X className="size-4" />
            </button>
          )}
        </div>

        {query.trim() ? (
          results.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {results.map((c) => (
                <CompanyCard key={c.ticker} c={c} selected={selected.includes(c.ticker)} onToggle={() => toggle(c.ticker)} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No Shariah-compliant company matches “{query}”.</p>
          )
        ) : (
          <>
            <p className="mt-4 text-sm text-secondary">Popular choices:</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shown.map((c) => (
                <CompanyCard key={c.ticker} c={c} selected={selected.includes(c.ticker)} onToggle={() => toggle(c.ticker)} />
              ))}
            </div>
          </>
        )}
        <p className="mt-4 text-sm font-medium text-brand" aria-live="polite">
          {selected.length ? `${selected.length} selected: ${selected.join(", ")}` : "Nothing selected yet"}
        </p>
      </section>

      <section className="reveal rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-ink">2</span>
          <h2 className="text-lg font-semibold">How often should we email you?</h2>
        </div>
        <div role="radiogroup" aria-label="How often to email you" className="mt-5 grid grid-cols-3 gap-2">
          {FREQUENCIES.map((f) => {
            const on = f.value === frequency;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFrequency(f.value)}
                className={`flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:gap-3 sm:px-4 ${
                  on ? "border-brand bg-brand-soft ring-2 ring-brand/20" : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${on ? "border-brand bg-brand text-brand-ink" : "border-line-strong"}`} aria-hidden="true">
                  {on && <Check className="size-3.5" />}
                </span>
                <span>
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-xs text-muted">{f.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-4 z-10 rounded-2xl border border-line bg-surface/95 p-4 shadow-lift backdrop-blur">
        <button
          type="button"
          disabled={!selected.length || pending}
          onClick={() => startTransition(async () => setResult(await completeSetup(selected, frequency)))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-ink shadow-card transition hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? (
            <>
              <LoaderCircle className="size-5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Send className="size-5" /> {frequency === "off" ? "Save my companies" : "Save and send my first email"}
            </>
          )}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          {selected.length
            ? frequency === "off"
              ? "You can turn emails on later."
              : `Your first email goes to ${email ?? "your inbox"} right away.`
            : "Select at least one company above."}
        </p>
        {result?.error && !result.saved && (
          <p role="alert" className="mt-2 text-center text-sm text-loss">
            {result.error}
          </p>
        )}
      </div>
    </div>
  );
}
