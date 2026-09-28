"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { LoaderCircle, Plus, Search } from "lucide-react";
import { TickerBadge } from "@/components/market";
import { searchCompanies, type CompanyOption } from "@/lib/search";
import { addTicker } from "./actions";


const MAX_RESULTS = 8;

export default function AddStock({ options }: { options: CompanyOption[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const listId = useId();

  const results = useMemo(() => searchCompanies(options, query, MAX_RESULTS), [options, query]);

  function add(ticker: string) {
    setError("");
    startTransition(async () => {
      const res = await addTicker(ticker);
      if (res.error) setError(res.error);
      else setQuery("");
    });
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
      add(results[Math.min(active, results.length - 1)].ticker);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Add a company
      </label>
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
        disabled={pending}
        placeholder="Add a company: search by ticker, name or sector"
        className="w-full rounded-xl border border-line bg-surface-2 py-3 pl-11 pr-10 outline-none transition placeholder:text-muted focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15 disabled:opacity-60"
      />
      <Search className="pointer-events-none absolute left-4 top-[1.4rem] size-4 -translate-y-1/2 text-muted" />
      {pending && (
        <LoaderCircle className="absolute right-4 top-[1.4rem] size-4 -translate-y-1/2 animate-spin text-brand" />
      )}
      {results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lift"
        >
          {results.map((o, i) => (
            <li
              key={o.ticker}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the input
                add(o.ticker);
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === active ? "bg-surface-2" : ""
              }`}
            >
              <TickerBadge ticker={o.ticker} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{o.ticker}</span>
                <span className="block truncate text-xs text-secondary">{o.company_name}</span>
              </span>
              <span className="hidden shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted sm:inline">
                {o.sector ?? "Other"}
              </span>
              <Plus className={`size-4 shrink-0 ${i === active ? "text-brand" : "text-muted"}`} />
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !results.length && (
        <p className="mt-3 text-sm text-muted">No Shariah-compliant company matches “{query}”.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
