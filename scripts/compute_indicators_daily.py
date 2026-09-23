import sys
from datetime import datetime, timezone
from common import (
    supabase,
    PKT,
    get_active_tickers,
    price_rows_to_frame,
    process_dataframe,
    to_indicator_record,
    compute_trending_score,
)

# Trailing rows fetched per ticker: enough for sma_200 plus warm-up. EMA/RSI/MACD
# values from 205 rows match the full-history backfill to well below the
# 2-decimal precision stored in the schema.
LOOKBACK_ROWS = 205


def main() -> int:
    print(f"Starting daily indicator computation at {datetime.now(timezone.utc).isoformat()}")

    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found.")
        return 1

    print(f"Found {len(tickers)} active tickers.")

    latest_date_by_ticker: dict[str, str] = {}
    failed: list[str] = []

    for ticker in tickers:
        print(f"Processing {ticker}...")

        # Fetch the trailing rows DESC so .limit() keeps the most recent ones
        history_response = supabase.table("price_history") \
            .select("trade_date, open_price, high_price, low_price, close_price, volume") \
            .eq("ticker", ticker) \
            .order("trade_date", desc=True) \
            .limit(LOOKBACK_ROWS) \
            .execute()

        if not history_response.data:
            print(f"  No price history found for {ticker}.")
            continue

        df = price_rows_to_frame(history_response.data)

        try:
            df = process_dataframe(df)
        except Exception as e:
            print(f"  Failed to compute indicators for {ticker}: {e}")
            failed.append(ticker)
            continue

        # process_dataframe sorts chronologically, so the final row is the latest trade_date
        record = to_indicator_record(ticker, df.iloc[-1])

        try:
            supabase.table("technical_indicators").upsert(
                record, on_conflict="ticker,trade_date"
            ).execute()
            latest_date_by_ticker[ticker] = record["trade_date"]
            print(f"  Upserted daily indicators for {ticker} (Date: {record['trade_date']}).")
        except Exception as e:
            print(f"  Error upserting daily record for {ticker}: {e}")
            failed.append(ticker)

    if not latest_date_by_ticker:
        print("No indicator rows were written.")
        return 1

    # Surface stale data instead of silently re-scoring an old date
    newest = max(latest_date_by_ticker.values())
    lagging = sorted(t for t, d in latest_date_by_ticker.items() if d < newest)
    if lagging:
        print(f"\nWARNING: {len(lagging)} ticker(s) have no price row for {newest}: {', '.join(lagging)}")

    today_pkt = datetime.now(PKT).strftime("%Y-%m-%d")
    if newest < today_pkt:
        print(f"WARNING: newest price_history date is {newest}, not today ({today_pkt}). "
              "Daily ingestion may have failed, or today is a market holiday.")

    # Rank every date written this run, not just the first ticker's date
    for trade_date in sorted(set(latest_date_by_ticker.values())):
        print(f"\nComputing trending_score for {trade_date}...")
        try:
            compute_trending_score(trade_date, tickers)
        except Exception as e:
            print(f"  Error writing trending_score for {trade_date}: {e}")
            failed.append(f"trending_score {trade_date}")

    if failed:
        print(f"\nERROR: {len(failed)} failure(s): {', '.join(failed)}")
        return 1

    print("Daily indicator computation completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
