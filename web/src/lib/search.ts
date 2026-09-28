export interface CompanyOption {
  ticker: string;
  company_name: string | null;
  sector: string | null;
}

/**
 * Rank companies for a query: ticker prefix first, then ticker contains, then
 * name or sector contains. Used by the landing-page search and the watchlist picker.
 */
export function searchCompanies<T extends CompanyOption>(options: T[], query: string, limit: number): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return options
    .map((o) => {
      const ticker = o.ticker.toLowerCase();
      const text = `${o.company_name ?? ""} ${o.sector ?? ""}`.toLowerCase();
      const score = ticker.startsWith(q) ? 0 : ticker.includes(q) ? 1 : text.includes(q) ? 2 : -1;
      return { o, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.o.ticker.localeCompare(b.o.ticker))
    .slice(0, limit)
    .map((x) => x.o);
}
