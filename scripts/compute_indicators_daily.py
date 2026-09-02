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

4
def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Computes technical indicators natively using pandas-ta and maps them to schema columns."""
    df = df.sort_values(by="trade_date").copy()
    df.set_index(pd.DatetimeIndex(df["trade_date"]), inplace=True)

    # col_names maps output columns to DB schema names at calculation time
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
    # NULL if avg_volume_20 is NULL or zero (guards against division by zero).
    df["volume_spike_ratio"] = np.where(
        (df["avg_volume_20"].notna()) & (df["avg_volume_20"] > 0),
        df["volume"] / df["avg_volume_20"],
        None
    )

    # price_change_5d_pct: momentum over the last 5 *trading* days.
    # shift(5) steps back 5 rows in the sorted DataFrame — correct for PSX's irregular
    # calendar (Friday half-sessions, holidays) unlike a fixed calendar-day offset.
    # NULL for the first 5 rows where no prior close exists.
    close_5d_ago = df["Close"].shift(5)
    df["price_change_5d_pct"] = np.where(
        close_5d_ago.notna() & (close_5d_ago != 0),
        (df["Close"] - close_5d_ago) / close_5d_ago * 100,
        None
    )

    # trending_score is filled by _compute_trending_score() in a cross-ticker second pass
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

    Example: a ticker ranked #1 on both metrics gets trending_score = 2 (most trending).
    Tickers with NULL in either metric receive the worst rank via na_option="bottom".
    """
    resp = supabase.table("technical_indicators") \
        .select("ticker, volume_spike_ratio, price_change_5d_pct") \
        .eq("trade_date", trade_date) \
        .execute()

    if not resp.data:
        print(f"  No indicator rows found for {trade_date} — skipping trending_score.")
        return

    scores_df = pd.DataFrame(resp.data)

    # Both sub-ranks go descending: highest value → rank 1 (most trending)
    scores_df["volume_rank"] = pd.to_numeric(
        scores_df["volume_spike_ratio"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")

    scores_df["price_rank"] = pd.to_numeric(
        scores_df["price_change_5d_pct"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")

    scores_df["trending_score"] = scores_df["volume_rank"] + scores_df["price_rank"]

    # Upsert trending_score back for each ticker on this date
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

    print(f"  trending_score written for {len(scores_df)} tickers on {trade_date}.")


def main():
    print(f"Starting daily indicator computation at {datetime.utcnow().isoformat()} UTC")

    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()
    if not response.data:
        print("No active tickers found. Exiting.")
        return

    tickers = [row["ticker"] for row in response.data]
    print(f"Found {len(tickers)} active tickers.")

    today_trade_date = None  # captured from the first successful ticker

    for ticker in tickers:
        print(f"Processing {ticker}...")

        # Fetch the trailing 205 trading days (DESC then flip) so we can slice the most recent 205
        # while still having enough history to compute sma_200 and 5-day momentum.
        history_response = supabase.table("price_history") \
            .select("trade_date, open_price, high_price, low_price, close_price, volume") \
            .eq("ticker", ticker) \
            .order("trade_date", desc=True) \
            .limit(205) \
            .execute()

        if not history_response.data:
            print(f"  No price history found for {ticker}.")
            continue

        df = pd.DataFrame(history_response.data)

        # Queried DESC to limit to the 205 most-recent rows; flip to chronological for TA
        df = df.sort_values(by="trade_date", ascending=True)

        df.rename(columns={
            "open_price":  "Open",
            "high_price":  "High",
            "low_price":   "Low",
            "close_price": "Close",
            "volume":      "volume",
        }, inplace=True)

        numeric_cols = ["Open", "High", "Low", "Close", "volume"]
        df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")

        try:
            df = process_dataframe(df)
        except Exception as e:
            print(f"  Failed to compute indicators for {ticker}: {e}")
            continue

        # Isolate the final row (today's data)
        latest_row = df.iloc[-1]

        db_cols = [
            "trade_date",
            "sma_20", "sma_50", "sma_200",
            "ema_12", "ema_26",
            "rsi_14",
            "macd", "macd_signal", "macd_histogram",
            "bb_upper", "bb_middle", "bb_lower",
            "avg_volume_20",
            "volume_spike_ratio", "price_change_5d_pct",
            # trending_score filled by _compute_trending_score below
        ]

        record = {"ticker": ticker}
        for col in db_cols:
            val = latest_row.get(col, None)
            record[col] = val if pd.notnull(val) else None

        if today_trade_date is None and record.get("trade_date"):
            today_trade_date = record["trade_date"]

        try:
            supabase.table("technical_indicators").upsert(
                record, on_conflict="ticker,trade_date"
            ).execute()
            print(f"  Upserted daily indicators for {ticker} (Date: {record['trade_date']}).")
        except Exception as e:
            print(f"  Error upserting daily record for {ticker}: {e}")

    # After all per-ticker rows are written, compute trending_score in one cross-ticker pass
    if today_trade_date:
        print(f"\nComputing trending_score for {today_trade_date}...")
        _compute_trending_score(today_trade_date)

    print("Daily indicator computation completed.")


if __name__ == "__main__":
    main()
