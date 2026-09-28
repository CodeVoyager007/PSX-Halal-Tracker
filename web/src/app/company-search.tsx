"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { TickerBadge } from "@/components/market";
import { searchCompanies, type CompanyOption } from "@/lib/search";

type Company = CompanyOption & { is_kmi_30: boolean };

const MAX_RESULTS = 4;
const TRY = ["cement", "bank", "MEBL", "fertilizer", "pharma"];

/** Live search over the whole halal universe, for visitors who have not signed up yet. */
export default function CompanySearch({ companies }: { companies: Company[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listId = useId();

  const results = useMemo(() => searchCompanies(companies, query, MAX_RESULTS), [companies, query]);
  const total = useMemo(() => searchCompanies(companies, query, Infinity).length, [companies, query]);

  function open(ticker: string) {
    // Stock pages need an account; signed-out visitors are sent to sign in first
    router.push(`/stocks/${ticker}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(results[Math.min(active, results.length - 1)].ticker);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search Shariah-compliant companies
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm transition focus-within:border-brand focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand/15">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Try a name, ticker or sector"
          className="w-full bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </div>

      {query.trim() === "" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TRY.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setQuery(t)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-secondary transition hover:border-brand hover:text-brand"
            >
              {t}
            </button>
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No Shariah-compliant company matches “{query}”.</p>
      ) : (
        <>
          <ul id={listId} role="listbox" className="mt-2 space-y-1">
            {results.map((c, i) => (
              <li
                key={c.ticker}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(c.ticker)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
                  i === active ? "bg-brand-soft" : ""
                }`}
              >
                <TickerBadge ticker={c.ticker} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {c.ticker}
                    {c.is_kmi_30 && (
                      <span className="rounded bg-gold-soft px-1 text-[10px] font-medium text-gold">KMI-30</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{c.company_name}</span>
                </span>
                <ChevronRight className={`size-4 shrink-0 ${i === active ? "text-brand" : "text-muted"}`} />
              </li>
            ))}
          </ul>
          <p className="mt-2 px-2 text-xs text-muted" role="status">
            {total} {total === 1 ? "match" : "matches"} · press Enter to open
          </p>
        </>
      )}
    </div>
  );
}
