type Num = number | string | null;

/** A row of the latest_snapshot view (db/schema.sql). */
export interface SnapshotRow {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  is_kmi_30: boolean;
  market_cap_m: Num;
  trade_date: string | null;
  close_price: Num;
  prev_close: Num;
  change_1d_pct: Num;
  volume: Num;
  rsi_14: Num;
  sma_50: Num;
  sma_200: Num;
  volume_spike_ratio: Num;
  price_change_5d_pct: Num;
  trending_score: Num;
  atr_14: Num;
  high_52w: Num;
  low_52w: Num;
  pct_from_52w_high: Num;
  return_1m_pct: Num;
  return_3m_pct: Num;
  return_1y_pct: Num;
  /** From company_stats (TradingView), refreshed each daily run; null until first refresh. */
  market_cap: Num;
  pe_ratio: Num;
  eps_ttm: Num;
  dividend_yield_pct: Num;
  beta_1y: Num;
  stats_as_of: string | null;
}

export type DigestFrequency = "daily" | "weekly";

export interface Profile {
  email: string;
  digest_enabled: boolean;
  digest_frequency: DigestFrequency;
}

export interface PricePoint {
  date: string;
  close: number | null;
  sma50: number | null;
  sma200: number | null;
}
