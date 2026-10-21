import sys
from datetime import datetime, timezone
from common import (
    supabase,
    PKT,
    fetch_all,
    get_active_tickers,
    price_rows_to_frame,
    process_dataframe,
    to_indicator_record,
    compute_trending_score,
)

# Rows (re)written per ticker each run: the newest session plus enough before it
# that days filled in late (a catch-up run after an outage, PSX corrections in
# the overlap window) get indicators without a manual backfill.
RECOMPUTE_ROWS = 30

# Trailing rows fetched per ticker: the 1-year return looks back 252 sessions,
# and EMA/RSI/MACD from this many rows match the full-history backfill to well
# below the 2-decimal precision stored in the schema.
LOOKBACK_ROWS = 252 + RECOMPUTE_ROWS


def earliest_date(table: str, ticker: str) -> str | None:
    resp = supabase.table(table).select("trade_date").eq("ticker", ticker) \
        .order("trade_date").limit(1).execute()
    return resp.data[0]["trade_date"] if resp.data else None


def main() -> int:
    print(f"Starting daily indicator computation at {datetime.now(timezone.utc).isoformat()}")

    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found.")
        return 1

    print(f"Found {len(tickers)} active tickers.")

    latest_date_by_ticker: dict[str, str] = {}
    dates_written: set[str] = set()
    failed: list[str] = []

    for ticker in tickers:
        print(f"Processing {ticker}...")

        # A ticker whose prices start before its indicators (a new listing that
        # was just back-filled) gets indicators for its whole history
        first_price = earliest_date("price_history", ticker)
        if first_price is None:
            print(f"  No price history found for {ticker}.")
            continue
        first_indicator = earliest_date("technical_indicators", ticker)
        full = first_indicator is None or first_price < first_indicator

        columns = "trade_date, open_price, high_price, low_price, close_price, volume"
        if full:
            history = fetch_all(lambda: supabase.table("price_history").select(columns)
                                .eq("ticker", ticker).order("trade_date"))
        else:
            # Fetch the trailing rows DESC so .limit() keeps the most recent ones
            history = supabase.table("price_history").select(columns).eq("ticker", ticker) \
                .order("trade_date", desc=True).limit(LOOKBACK_ROWS).execute().data

        df = price_rows_to_frame(history)

        try:
            df = process_dataframe(df)
        except Exception as e:
            print(f"  Failed to compute indicators for {ticker}: {e}")
            failed.append(ticker)
            continue

        # process_dataframe sorts chronologically, so the final rows are the latest dates
        rows = df if full else df.tail(RECOMPUTE_ROWS)
        records = [to_indicator_record(ticker, row) for _, row in rows.iterrows()]

        try:
            for i in range(0, len(records), 100):
                supabase.table("technical_indicators").upsert(
                    records[i:i + 100], on_conflict="ticker,trade_date"
                ).execute()
            latest_date_by_ticker[ticker] = records[-1]["trade_date"]
            dates_written.update(r["trade_date"] for r in records)
            print(f"  Upserted indicators for {ticker} through {records[-1]['trade_date']}.")
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

    # Rank every date written this run: rewritten rows lose nothing, as the
    # upsert above never includes trending_score, but late-filled days need one
    for trade_date in sorted(dates_written):
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
