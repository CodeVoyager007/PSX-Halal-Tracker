"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { addTicker } from "./actions";

interface Option {
  ticker: string;
  company_name: string | null;
  sector: string | null;
}

const MAX_RESULTS = 8;

export default function AddStock({ options }: { options: Option[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Ticker prefix matches first, then name or sector matches
    const scored = options
      .map((o) => {
        const ticker = o.ticker.toLowerCase();
        const text = `${o.company_name ?? ""} ${o.sector ?? ""}`.toLowerCase();
        const score = ticker.startsWith(q) ? 0 : ticker.includes(q) ? 1 : text.includes(q) ? 2 : -1;
        return { o, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.o.ticker.localeCompare(b.o.ticker));
    return scored.slice(0, MAX_RESULTS).map((x) => x.o);
  }, [options, query]);

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
        className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent disabled:opacity-60"
      />
      {results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg"
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
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? "bg-page" : ""
              }`}
            >
              <span>
                <span className="font-medium">{o.ticker}</span>{" "}
                <span className="text-secondary">{o.company_name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{o.sector}</span>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !results.length && (
        <p className="mt-2 text-sm text-muted">No Shariah-compliant company matches “{query}”.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
