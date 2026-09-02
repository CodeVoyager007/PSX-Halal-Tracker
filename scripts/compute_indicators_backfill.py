import os
import pandas as pd
import pandas_ta_classic as ta
from supabase import create_client, Client
from datetime import datetime
import numpy as np
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def verify_pandas_ta_column_order(df: pd.DataFrame):
    """
    One-time verification step: confirms pandas-ta's native output order for MACD and BBANDS
    before applying `col_names` positional overrides.
    """
    print("\n--- Running pandas-ta column order verification ---")

    test_df = df.copy()

    # 1. MACD
    macd_res = test_df.ta.macd(fast=12, slow=26, signal=9, append=False)
    macd_cols = list(macd_res.columns)
    print(f"Native MACD columns returned: {macd_cols}")
    if len(macd_cols) == 3:
        print("MACD Verification: PASSED (3 columns returned).")
        print("Expected positional mapping: ('macd', 'macd_histogram', 'macd_signal')")
    else:
        print(f"WARNING: MACD returned {len(macd_cols)} columns instead of 3. Please review pandas-ta version!")

    # 2. Bollinger Bands
    bb_res = test_df.ta.bbands(length=20, std=2, append=False)
    bb_cols = list(bb_res.columns)
    print(f"Native BBANDS columns returned: {bb_cols}")
    if len(bb_cols) == 5:
        print("BBANDS Verification: PASSED (5 columns returned).")
        print("Expected positional mapping: ('bb_lower', 'bb_middle', 'bb_upper', 'bb_bandwidth', 'bb_percent')")
    else:
        print(f"WARNING: BBANDS returned {len(bb_cols)} columns instead of 5. Please review pandas-ta version!")

    print("--- Verification Complete ---\n")


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Computes technical indicators natively using pandas-ta and maps them to schema columns."""
    # Ensure chronological order; pandas-ta requires a DatetimeIndex
    df = df.sort_values(by="trade_date").copy()
    df.set_index(pd.DatetimeIndex(df["trade_date"]), inplace=True)

    # col_names maps output columns to DB schema names at calculation time, avoiding any rename step
    df.ta.sma(length=20,  append=True, col_names=("sma_20",))
    df.ta.sma(length=50,  append=True, col_names=("sma_50",))
    df.ta.sma(length=200, append=True, col_names=("sma_200",))

    df.ta.ema(length=12, append=True, col_names=("ema_12",))
    df.ta.ema(length=26, append=True, col_names=("ema_26",))

    df.ta.rsi(length=14, append=True, col_names=("rsi_14",))

    # MACD native output order: MACD (line), MACDh (histogram), MACDs (signal)
    df.ta.macd(fast=12, slow=26, signal=9, append=True,
               col_names=("macd", "macd_histogram", "macd_signal"))

    # BBANDS native output order: Lower, Middle, Upper, Bandwidth, Percent
    df.ta.bbands(length=20, std=2, append=True,
                 col_names=("bb_lower", "bb_middle", "bb_upper", "bb_bandwidth", "bb_percent"))

    # Average volume (20-day SMA over the volume series)
    df.ta.sma(close=df["volume"], length=20, append=True, col_names=("avg_volume_20",))

    # --- Trending metrics ---

    # volume_spike_ratio: today's volume relative to the 20-day average.
    # Guard against division by zero and NULL avg_volume_20.
    df["volume_spike_ratio"] = np.where(
        (df["avg_volume_20"].notna()) & (df["avg_volume_20"] > 0),
        df["volume"] / df["avg_volume_20"],
        None
    )

    # price_change_5d_pct: momentum over the last 5 *trading* days.
    # shift(5) steps back 5 rows in the sorted DataFrame — correct for PSX's irregular
    # calendar (Friday half-sessions, public holidays) unlike a calendar-day offset.
    # Returns NULL for the first 5 rows where the prior close is unavailable.
    close_5d_ago = df["Close"].shift(5)
    df["price_change_5d_pct"] = np.where(
        close_5d_ago.notna() & (close_5d_ago != 0),
        (df["Close"] - close_5d_ago) / close_5d_ago * 100,
        None
    )

    # trending_score is computed cross-ticker AFTER all tickers are written;
    # leave it NULL here — _compute_trending_score() fills it in a second pass.
    df["trending_score"] = None

    # Cast remaining NaNs → None so Supabase writes NULL
    df = df.replace({np.nan: None})
    return df


def _compute_trending_score(trade_date: str):
    """
    Compute and write trending_score for all active tickers on the given trade_date.

    Ranking logic (lower score = MORE trending):
      - volume_rank: rank tickers by volume_spike_ratio DESCENDING → rank 1 = largest spike
      - price_rank:  rank tickers by price_change_5d_pct  DESCENDING → rank 1 = biggest gain
      - trending_score = volume_rank + price_rank

    Tickers with NULL in either metric receive the worst (highest) rank via na_option="bottom",
    so they naturally sink to the bottom of the trending list without crashing.
    """
    print(f"  Computing trending_score for {trade_date}...")

    resp = supabase.table("technical_indicators") \
        .select("ticker, volume_spike_ratio, price_change_5d_pct") \
        .eq("trade_date", trade_date) \
        .execute()

    if not resp.data:
        print(f"  No indicator rows found for {trade_date} — skipping trending_score.")
        return

    scores_df = pd.DataFrame(resp.data)

    # Both sub-ranks go descending: highest value → rank 1 (most trending)
    # pd.to_numeric(..., errors="coerce") is the correct pandas 3.x approach for handling
    # non-numeric/NULL values — astype(float, errors="ignore") is deprecated and unreliable.
    scores_df["volume_rank"] = pd.to_numeric(
        scores_df["volume_spike_ratio"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")

    scores_df["price_rank"] = pd.to_numeric(
        scores_df["price_change_5d_pct"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")
    scores_df["trending_score"] = scores_df["volume_rank"] + scores_df["price_rank"]

    # Write trending_score back to each ticker's row for this trade_date
    for _, row in scores_df.iterrows():
        try:
            supabase.table("technical_indicators").upsert(
                {
                    "ticker": row["ticker"],
                    "trade_date": trade_date,
                    "trending_score": float(row["trending_score"]),
                },
                on_conflict="ticker,trade_date"
            ).execute()
        except Exception as e:
            print(f"  Error writing trending_score for {row['ticker']}: {e}")

    print(f"  trending_score written for {len(scores_df)} tickers.")


def main():
    print(f"Starting indicators backfill at {datetime.utcnow().isoformat()} UTC")

    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()
    if not response.data:
        print("No active tickers found. Exiting.")
        return

    tickers = [row["ticker"] for row in response.data]
    print(f"Found {len(tickers)} active tickers. Commencing indicator backfill...")

    verification_done = False
    # Track every trade_date we write so we can run trending_score once per date at the end
    dates_written: set = set()

    for ticker in tickers:
        print(f"Processing {ticker}...")

        # Fetch the full 12-month price history already stored in price_history
        history_response = supabase.table("price_history") \
            .select("trade_date, open_price, high_price, low_price, close_price, volume") \
            .eq("ticker", ticker) \
            .order("trade_date", desc=False) \
            .execute()

        if not history_response.data:
            print(f"  No price history found for {ticker}.")
            continue

        df = pd.DataFrame(history_response.data)

        # Rename columns to standard OHLCV for pandas-ta (expects capitalised names)
        df.rename(columns={
            "open_price":  "Open",
            "high_price":  "High",
            "low_price":   "Low",
            "close_price": "Close",
            "volume":      "volume",
        }, inplace=True)

        numeric_cols = ["Open", "High", "Low", "Close", "volume"]
        df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")

        # One-time verification of pandas-ta column order on the first valid ticker
        if not verification_done and len(df) >= 30:
            verify_pandas_ta_column_order(df)
            verification_done = True

        try:
            df = process_dataframe(df)
        except Exception as e:
            print(f"  Failed to compute indicators for {ticker}: {e}")
            continue

        db_cols = [
            "trade_date",
            "sma_20", "sma_50", "sma_200",
            "ema_12", "ema_26",
            "rsi_14",
            "macd", "macd_signal", "macd_histogram",
            "bb_upper", "bb_middle", "bb_lower",
            "avg_volume_20",
            "volume_spike_ratio", "price_change_5d_pct",
            # trending_score is left NULL here; filled by _compute_trending_score below
        ]

        records_to_upsert = []
        for index, row in df.iterrows():
            record = {"ticker": ticker}
            for col in db_cols:
                val = row.get(col, None)
                record[col] = val if pd.notnull(val) else None
            records_to_upsert.append(record)
            if record["trade_date"]:
                dates_written.add(record["trade_date"])

        chunk_size = 100
        upserted_count = 0
        for i in range(0, len(records_to_upsert), chunk_size):
            chunk = records_to_upsert[i:i + chunk_size]
            try:
                supabase.table("technical_indicators").upsert(
                    chunk, on_conflict="ticker,trade_date"
                ).execute()
                upserted_count += len(chunk)
            except Exception as e:
                print(f"  Error upserting chunk for {ticker}: {e}")

        print(f"  Upserted {upserted_count} indicator records for {ticker}.")

    # Second pass: compute trending_score for every date we touched
    print(f"\nComputing trending_score for {len(dates_written)} date(s)...")
    for trade_date in sorted(dates_written):
        _compute_trending_score(trade_date)

    print("Indicator backfill completed.")


if __name__ == "__main__":
    main()
