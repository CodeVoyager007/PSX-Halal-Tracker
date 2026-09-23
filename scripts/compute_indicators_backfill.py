import sys
from datetime import datetime, timezone
from common import (
    supabase,
    fetch_all,
    get_active_tickers,
    price_rows_to_frame,
    process_dataframe,
    to_indicator_record,
    compute_trending_score,
)


def main() -> int:
    print(f"Starting indicators backfill at {datetime.now(timezone.utc).isoformat()}")

    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found.")
        return 1

    print(f"Found {len(tickers)} active tickers. Commencing indicator backfill...")

    # Track every trade_date we write so we can run trending_score once per date at the end
    dates_written: set = set()
    failed: list[str] = []

    for ticker in tickers:
        print(f"Processing {ticker}...")

        # Fetch the full stored price history, paging past Supabase's 1,000-row cap
        history = fetch_all(lambda: supabase.table("price_history")
                            .select("trade_date, open_price, high_price, low_price, close_price, volume")
                            .eq("ticker", ticker)
                            .order("trade_date", desc=False))

        if not history:
            print(f"  No price history found for {ticker}.")
            continue

        df = price_rows_to_frame(history)

        try:
            df = process_dataframe(df)
        except Exception as e:
            print(f"  Failed to compute indicators for {ticker}: {e}")
            failed.append(ticker)
            continue

        records_to_upsert = [to_indicator_record(ticker, row) for _, row in df.iterrows()]

        chunk_size = 100
        upserted_count = 0
        for i in range(0, len(records_to_upsert), chunk_size):
            chunk = records_to_upsert[i:i + chunk_size]
            try:
                supabase.table("technical_indicators").upsert(
                    chunk, on_conflict="ticker,trade_date"
                ).execute()
                upserted_count += len(chunk)
                dates_written.update(r["trade_date"] for r in chunk)
            except Exception as e:
                print(f"  Error upserting chunk for {ticker}: {e}")
                failed.append(ticker)

        print(f"  Upserted {upserted_count} indicator records for {ticker}.")

    # Second pass: compute trending_score for every date we touched
    print(f"\nComputing trending_score for {len(dates_written)} date(s)...")
    for trade_date in sorted(dates_written):
        try:
            compute_trending_score(trade_date, tickers)
        except Exception as e:
            print(f"  Error writing trending_score for {trade_date}: {e}")
            failed.append(f"trending_score {trade_date}")

    if failed:
        print(f"\nERROR: {len(failed)} failure(s): {', '.join(sorted(set(failed)))}")
        return 1

    print("Indicator backfill completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
