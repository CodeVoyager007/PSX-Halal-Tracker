import sys
from datetime import date, datetime, timedelta, timezone
import tradingview
from common import (
    supabase,
    PSX_PROXY_URL,
    fetch_all,
    get_active_tickers,
    get_latest_trade_date,
    ingest_prices,
    last_session_date,
    now_pkt,
    upsert_price_records,
)

# Tickers with no stored history get a full backfill window
BACKFILL_DAYS = 365
# Re-fetch the last week on every run so a missed or delayed run self-heals and
# late corrections from PSX overwrite earlier values. Upserts make this idempotent.
OVERLAP_DAYS = 7
# Longer than any PSX closure (Eid holidays plus a weekend), so going beyond
# it means ingestion is broken rather than the market being shut.
STALE_AFTER_DAYS = 7
# How far back to look for each ticker's newest stored row when checking the
# TradingView snapshot against it. Covers long closures and short outages.
LAST_ROW_LOOKBACK_DAYS = 45
# From pre-open until the 5 PM cut-off, TradingView's daily bar is the live,
# unfinished session; it must not be stored as the previous day's close.
TRADINGVIEW_UNSAFE_HOURS_PKT = range(9, 17)


def warn(message: str):
    # Rendered as a yellow annotation on the GitHub Actions run summary
    print(f"::warning::{message}")


def latest_rows(since: date) -> dict[str, dict]:
    """Newest price_history row per ticker on or after `since`."""
    rows = fetch_all(lambda: supabase.table("price_history")
                     .select("ticker, trade_date, close_price, volume")
                     .gte("trade_date", since.isoformat())
                     .order("trade_date")
                     .order("ticker"))  # unique sort key, so pages cannot overlap or skip rows
    return {r["ticker"]: r for r in rows}  # ascending order: the last row per ticker wins


def newest_stored_date() -> date | None:
    resp = supabase.table("price_history").select("trade_date") \
        .order("trade_date", desc=True).limit(1).execute()
    return date.fromisoformat(resp.data[0]["trade_date"]) if resp.data else None


def ingest_from_tradingview(tickers: list[str], session: date, now: datetime) -> date | None:
    """Store `session`'s bar for every ticker from one TradingView snapshot. Raises on failure."""
    if now.weekday() < 5 and now.hour in TRADINGVIEW_UNSAFE_HOURS_PKT:
        print(f"\nNot using TradingView at {now:%H:%M} PKT: today's session is still live.")
        return None
    print(f"\nFalling back to TradingView for the {session} session...")
    snapshot = tradingview.scan(tickers, tradingview.PRICE_FIELDS)
    print(f"  TradingView returned {len(snapshot)} of {len(tickers)} tickers.")
    if not snapshot:
        raise RuntimeError("TradingView returned no PSX symbols.")

    last = latest_rows(session - timedelta(days=LAST_ROW_LOOKBACK_DAYS))
    records, note = tradingview.snapshot_records(snapshot, session, last)
    print(f"  {note}")
    if records:
        upsert_price_records(records)
        print(f"  Upserted {len(records)} row(s) for {session}.")
        return session
    return None


def refresh_fundamentals(tickers: list[str], as_of: date) -> bool:
    """Upsert company_stats from TradingView. Optional data: failures only warn."""
    print("\nRefreshing company fundamentals from TradingView...")
    try:
        snapshot, dropped = tradingview.scan_dropping_unknown(
            tickers, tradingview.fundamental_tv_fields())
        if dropped:
            warn(f"TradingView no longer knows field(s) {', '.join(dropped)}; stored as NULL.")
        records = tradingview.fundamentals_records(snapshot, as_of)
        filled = {c: sum(r[c] is not None for r in records) for c in tradingview.FUNDAMENTAL_FIELDS}
        print("  Values per field: " + ", ".join(f"{c} {n}" for c, n in filled.items()))
        updated_at = datetime.now(timezone.utc).isoformat()
        for record in records:
            record["updated_at"] = updated_at  # the column default only applies on insert
        for i in range(0, len(records), 100):
            supabase.table("company_stats").upsert(records[i:i + 100], on_conflict="ticker").execute()
        print(f"  Upserted fundamentals for {len(records)} ticker(s).")
        return True
    except Exception as e:
        warn(f"Fundamentals refresh failed: {e}")
        return False


def main() -> int:
    now = now_pkt()
    session = last_session_date(now)
    print(f"Starting daily ingestion at {now.isoformat()} (latest finalised session: {session})")
    if PSX_PROXY_URL:
        print("PSX requests go through PSX_PROXY_URL.")

    # Only tickers marked active in halal_universe are processed (the Shariah filter)
    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found in the halal_universe.")
        return 1

    print(f"Found {len(tickers)} active tickers in the universe.")

    def start_for(ticker: str):
        latest = get_latest_trade_date(ticker)
        if latest is None:
            return now.date() - timedelta(days=BACKFILL_DAYS)
        return latest - timedelta(days=OVERLAP_DAYS)

    # 1. PSX: full history per ticker, so gaps from missed runs fill themselves
    newest, failed, psx_blocked = ingest_prices(tickers, start_for)

    status = 0
    if psx_blocked:
        warn("PSX (dps.psx.com.pk) refused this runner, so only today's bar can be stored and "
             "missed days are not back-filled. Set the PSX_PROXY_URL secret, or run "
             "scripts/ingest_daily_data.py from a Pakistani connection, to fill gaps.")
        # 2. TradingView: the latest session's bar for every ticker in one request
        try:
            stored = ingest_from_tradingview(tickers, session, now)
            newest = max(filter(None, [newest, stored]), default=None)
        except Exception as e:
            print(f"\nERROR: TradingView fallback failed too: {e}")
            status = 1
    elif failed:
        print(f"\nERROR: {len(failed)} ticker(s) failed: {', '.join(failed)}")
        status = 1

    # 3. Fundamentals (market cap, P/E, EPS, dividend yield, 52-week range, beta)
    refresh_fundamentals(tickers, session)

    # This run may legitimately add nothing (holiday), so judge freshness by what is stored
    newest_stored = newest_stored_date()
    if newest_stored is None or (now.date() - newest_stored).days > STALE_AFTER_DAYS:
        print(f"\nERROR: newest stored price is {newest_stored}; more than {STALE_AFTER_DAYS} days old.")
        status = 1

    print(f"Daily ingestion completed. Newest row this run: {newest}; newest stored: {newest_stored}.")
    return status


if __name__ == "__main__":
    sys.exit(main())
