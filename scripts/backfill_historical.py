import os
import psxdata
import pandas as pd
from supabase import create_client, Client
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def main():
    print(f"Starting historical backfill at {datetime.utcnow().isoformat()} UTC")

    # 1. Fetch active tickers from the halal_universe
    # Only backfill for currently active Shariah-compliant tickers.
    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()

    if not response.data:
        print("No active tickers found in the halal_universe. Exiting.")
        return

    tickers = [row["ticker"] for row in response.data]
    print(f"Found {len(tickers)} active tickers. Commencing backfill...")

    # Define the backfill window: last 365 days (12 months).
    # 365 calendar days gives ~252 trading days — enough for sma_200 to produce
    # real values on the tail end of the window.
    cutoff_date = datetime.now().date() - timedelta(days=365)
    print(f"Backfill cutoff: {cutoff_date} (keeping rows on or after this date)")

    for ticker in tickers:
        print(f"Backfilling {ticker}...")
        try:
            # psxdata.stocks() with no date arguments returns full history.
            # NOTE: passing start= / end= is broken upstream — it always returns an
            # empty DataFrame regardless of the date range supplied. We fetch the full
            # history and filter locally instead.
            df = psxdata.stocks(ticker)

            if df is None or df.empty:
                print(f"  No data returned for {ticker}.")
                continue

            # psxdata returns lowercase column names: date, open, high, low, close, volume, is_anomaly
            # The date column is typically the index or a plain column; normalise either way.
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"])
                df = df.set_index("date")
            elif not isinstance(df.index, pd.DatetimeIndex):
                df.index = pd.to_datetime(df.index)

            # Filter locally to the last 365 calendar days
            df = df[df.index.date >= cutoff_date]

            if df.empty:
                print(f"  No data within the last 365 days for {ticker}.")
                continue

            records_to_upsert = []
            skipped_anomaly = 0

            for index, row in df.iterrows():
                # Skip rows flagged as anomalous by psxdata (OHLC constraint violations,
                # ordering issues, etc.). Log count but don't write bad data silently.
                if row.get("is_anomaly", False):
                    skipped_anomaly += 1
                    continue

                trade_date = index.strftime("%Y-%m-%d")

                # Use pd.notna() for each field — NaN is truthy in Python so
                # `val or 0` does NOT catch NaN. Storing None (not 0) for missing
                # values lets Postgres write NULL, avoiding fake prices that would
                # silently corrupt technical indicator calculations downstream.
                def _float(val):
                    return float(val) if pd.notna(val) else None

                def _int(val):
                    return int(val) if pd.notna(val) else None

                records_to_upsert.append({
                    "ticker": ticker,
                    "trade_date": trade_date,
                    "open_price":  _float(row.get("open")),
                    "high_price":  _float(row.get("high")),
                    "low_price":   _float(row.get("low")),
                    "close_price": _float(row.get("close")),
                    "volume":      _int(row.get("volume")),
                })

            if skipped_anomaly:
                print(f"  Skipped {skipped_anomaly} anomalous row(s) for {ticker}.")

            if not records_to_upsert:
                print(f"  No valid records to upsert for {ticker} after anomaly filtering.")
                continue

            # Upsert in chunks of 100 for Supabase free-tier compatibility.
            # ON CONFLICT (ticker, trade_date) DO UPDATE guarantees idempotency —
            # running this script twice will update rather than duplicate rows.
            chunk_size = 100
            for i in range(0, len(records_to_upsert), chunk_size):
                chunk = records_to_upsert[i:i + chunk_size]
                # on_conflict must target the UNIQUE constraint columns, not the
                # primary key (id), so repeated runs update existing rows rather
                # than inserting duplicates.
                supabase.table("price_history").upsert(chunk, on_conflict="ticker,trade_date").execute()

            print(f"  Upserted {len(records_to_upsert)} records for {ticker}.")

        except Exception as e:
            print(f"  Error backfilling {ticker}: {e}")

    print("Historical backfill completed.")

if __name__ == "__main__":
    main()
