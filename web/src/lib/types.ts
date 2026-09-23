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
