"""Daily price ingestion: official PSX files, cross-checked, with no manual steps.

1. For every trading day a ticker is missing (since its newest stored row, or a
   year for a ticker with no history), download PSX's market summary file for
   that day and take the ticker's bar from it.
2. If the latest session's file is not published yet, take that session's bars
   from TradingView instead (only once the session is closed).
3. Check every new bar against SCS Trade (TradingView as a fallback checker)
   and record which source confirmed it.
4. Refresh fundamentals from TradingView.
"""
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import market_data
import tradingview
from common import (
    supabase,
    fetch_all,
    get_active_tickers,
    get_latest_trade_date,
    last_session_date,
    now_pkt,
    upsert_price_records,
)

# Tickers with no stored history get a full year
BACKFILL_DAYS = 365
# Longer than any PSX closure (Eid holidays plus a weekend), so going beyond
# it means ingestion is broken rather than the market being shut.
STALE_AFTER_DAYS = 7
# How far back to look for each ticker's newest stored row when checking the
# TradingView snapshot against it. Covers long closures and short outages.
LAST_ROW_LOOKBACK_DAYS = 45
# From pre-open until the 5 PM cut-off, TradingView's daily bar is the live,
# unfinished session; it must not be stored or used as a closing price.
TRADINGVIEW_UNSAFE_HOURS_PKT = range(9, 17)
# Stop calling a source after this many failures in a row
MAX_CONSECUTIVE_FAILURES = 3


def warn(message: str):
    # Rendered as a yellow annotation on the GitHub Actions run summary
    print(f"::warning::{message}")


def weekdays(start: date, end: date) -> list[date]:
    days, d = [], start
    while d <= end:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


def tradingview_safe(now: datetime) -> bool:
    return not (now.weekday() < 5 and now.hour in TRADINGVIEW_UNSAFE_HOURS_PKT)


def latest_rows(since: date) -> dict[str, dict]:
    """Newest price_history row per ticker on or after `since`."""
    rows = fetch_all(lambda: supabase.table("price_history")
                     .select("ticker, trade_date, close_price, volume")
                     .gte("trade_date", since.isoformat())
                     .order("trade_date")
                     .order("ticker"))  # unique sort key, so pages cannot overlap or skip rows
    return {r["ticker"]: r for r in rows}  # ascending order: the last row per ticker wins


def provisional_dates(since: date) -> dict[str, date]:
    """Per ticker, the earliest day since `since` stored from TradingView rather than PSX's file."""
    rows = fetch_all(lambda: supabase.table("price_history")
                     .select("ticker, trade_date")
                     .eq("source", "tradingview")
                     .gte("trade_date", since.isoformat())
                     .order("trade_date")
                     .order("ticker"))
    earliest: dict[str, date] = {}
    for r in rows:
        earliest.setdefault(r["ticker"], date.fromisoformat(r["trade_date"]))
    return earliest


def newest_stored_date() -> date | None:
    resp = supabase.table("price_history").select("trade_date") \
        .order("trade_date", desc=True).limit(1).execute()
    return date.fromisoformat(resp.data[0]["trade_date"]) if resp.data else None


def record(ticker: str, day: date, bar: dict, source: str) -> dict:
    return {
        "ticker": ticker,
        "trade_date": day.isoformat(),
        "open_price": round(bar["open"], 2),
        "high_price": round(bar["high"], 2),
        "low_price": round(bar["low"], 2),
        "close_price": round(bar["close"], 2),
        "volume": bar["volume"],
        "source": source,
        "verified_with": None,
    }


def collect_from_psx_files(http, start_for: dict[str, date], session: date) -> tuple[list[dict], bool, bool]:
    """
    Bars from PSX's daily files for each ticker from start_for[ticker] to session.
    Returns (records, whether the session's file was missing, whether fetching failed).
    """
    first = min(start_for.values(), default=session)
    records, session_missing, failures = [], False, 0

    for day in weekdays(first, session):
        needed = [t for t, start in start_for.items() if start <= day]
        if not needed:
            continue
        try:
            bars = market_data.fetch_market_summary(http, day)
            failures = 0
        except Exception as e:
            failures += 1
            print(f"  {day}: could not download PSX's file ({e}).")
            if failures >= MAX_CONSECUTIVE_FAILURES:
                print("  PSX's files keep failing; stopping.")
                return records, True, True
            continue
        finally:
            time.sleep(market_data.PAUSE_SECONDS)

        if bars is None:
            if day == session:
                session_missing = True
                print(f"  {day}: PSX has not published this session's file yet.")
            else:
                print(f"  {day}: no PSX file (market holiday).")
            continue
        day_records = [record(t, day, bars[t], "psx") for t in needed if t in bars]
        records.extend(day_records)
        print(f"  {day}: {len(day_records)} of {len(needed)} needed tickers traded.")

    return records, session_missing, False


def collect_from_tradingview(tickers: list[str], session: date) -> list[dict]:
    """The latest session's bars from one TradingView snapshot. Raises on failure."""
    snapshot = tradingview.scan(tickers, tradingview.PRICE_FIELDS)
    print(f"  TradingView returned {len(snapshot)} of {len(tickers)} tickers.")
    if not snapshot:
        raise RuntimeError("TradingView returned no PSX symbols.")
    last = latest_rows(session - timedelta(days=LAST_ROW_LOOKBACK_DAYS))
    records, note = tradingview.snapshot_records(snapshot, session, last)
    print(f"  {note}")
    for r in records:
        r.update(source="tradingview", verified_with=None)
    return records


def verify(http, records: list[dict], session: date, now: datetime) -> dict[str, int]:
    """
    Set verified_with on each record whose close a second source confirms.
    SCS Trade checks every date; TradingView checks the latest session for
    tickers SCS could not. Returns counts by outcome.
    """
    by_ticker: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_ticker[r["ticker"]].append(r)

    mismatches: list[str] = []
    scs_failures = 0
    for ticker, recs in sorted(by_ticker.items()):
        if scs_failures >= MAX_CONSECUTIVE_FAILURES:
            print("  SCS Trade keeps failing; skipping it for the remaining tickers.")
            break
        dates = [date.fromisoformat(r["trade_date"]) for r in recs]
        try:
            other = market_data.fetch_scs_history(http, ticker, min(dates), max(dates))
            scs_failures = 0
        except Exception as e:
            scs_failures += 1
            print(f"  SCS Trade failed for {ticker}: {e}")
            continue
        finally:
            time.sleep(market_data.PAUSE_SECONDS)
        for r in recs:
            bar = other.get(r["trade_date"])
            if bar is None:
                continue
            if market_data.closes_agree(r["close_price"], bar["close"]):
                r["verified_with"] = "scstrade"
            else:
                mismatches.append(f"{ticker} {r['trade_date']}: {r['source']} {r['close_price']} vs SCS {bar['close']}")

    # TradingView's current bar is the latest session once it has closed
    unchecked_today = [r for r in records if r["verified_with"] is None and r["trade_date"] == session.isoformat()
                       and r["source"] != "tradingview"]
    if unchecked_today and tradingview_safe(now):
        try:
            snapshot = tradingview.scan(sorted({r["ticker"] for r in unchecked_today}), ["close"])
            for r in unchecked_today:
                tv_close = snapshot.get(r["ticker"], {}).get("close")
                if market_data.closes_agree(r["close_price"], tv_close):
                    r["verified_with"] = "tradingview"
        except Exception as e:
            print(f"  TradingView check failed: {e}")

    if mismatches:
        warn(f"{len(mismatches)} price(s) disagree with SCS Trade; stored from the primary source but "
             f"left unverified. First: {'; '.join(mismatches[:5])}")
    verified = sum(r["verified_with"] is not None for r in records)
    return {"verified": verified, "mismatched": len(mismatches),
            "unchecked": len(records) - verified - len(mismatches)}


def refresh_fundamentals(tickers: list[str], as_of: date) -> bool:
    """Upsert company_stats from TradingView. Optional data: failures only warn."""
    print("\nRefreshing company fundamentals from TradingView...")
    try:
        snapshot, dropped = tradingview.scan_dropping_unknown(tickers, tradingview.fundamental_tv_fields())
        if dropped:
            warn(f"TradingView no longer knows field(s) {', '.join(dropped)}; stored as NULL.")
        records = tradingview.fundamentals_records(snapshot, as_of)
        filled = {c: sum(r[c] is not None for r in records) for c in tradingview.FUNDAMENTAL_FIELDS}
        print("  Values per field: " + ", ".join(f"{c} {n}" for c, n in filled.items()))
        updated_at = datetime.now(timezone.utc).isoformat()
        for r in records:
            r["updated_at"] = updated_at  # the column default only applies on insert
        for i in range(0, len(records), 100):
            supabase.table("company_stats").upsert(records[i:i + 100], on_conflict="ticker").execute()
        print(f"  Upserted fundamentals for {len(records)} ticker(s).")
        return True
    except Exception as e:
        warn(f"Fundamentals refresh failed: {e}")
        return False


def ingest(start_for: dict[str, date], session: date, now: datetime) -> tuple[list[dict], int]:
    """Collect, verify and store bars for tickers from start_for. Returns (records stored, exit status)."""
    status = 0
    with market_data.client() as http:
        print("\nDownloading PSX's official daily files...")
        records, session_missing, psx_failed = collect_from_psx_files(http, start_for, session)
        if psx_failed:
            status = 1

        have_session = {r["ticker"] for r in records if r["trade_date"] == session.isoformat()}
        lacking = sorted(t for t, start in start_for.items() if start <= session and t not in have_session)
        if session_missing and lacking:
            if tradingview_safe(now):
                print(f"\nTaking the {session} session from TradingView until PSX publishes its file...")
                try:
                    records.extend(collect_from_tradingview(lacking, session))
                except Exception as e:
                    print(f"  ERROR: TradingView failed too: {e}")
                    status = 1
            else:
                print(f"\nNot using TradingView at {now:%H:%M} PKT: today's session is still live.")

        if records:
            print(f"\nVerifying {len(records)} bar(s) against a second source...")
            counts = verify(http, records, session, now)
            print(f"  {counts['verified']} verified, {counts['mismatched']} disagreed, "
                  f"{counts['unchecked']} could not be checked.")
            upsert_price_records(records)
            print(f"  Stored {len(records)} bar(s).")
    return records, status


def main() -> int:
    now = now_pkt()
    session = last_session_date(now)
    print(f"Starting daily ingestion at {now.isoformat()} (latest finalised session: {session})")

    # Only tickers marked active in halal_universe are processed (the Shariah filter)
    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found in the halal_universe.")
        return 1
    print(f"Found {len(tickers)} active tickers in the universe.")

    start_for = {}
    for ticker in tickers:
        latest = get_latest_trade_date(ticker)
        start_for[ticker] = latest + timedelta(days=1) if latest else session - timedelta(days=BACKFILL_DAYS)
    # Days taken from TradingView are provisional: fetch them again so PSX's
    # official figures replace them once its file is out
    for ticker, day in provisional_dates(session - timedelta(days=LAST_ROW_LOOKBACK_DAYS)).items():
        if ticker in start_for:
            start_for[ticker] = min(start_for[ticker], day)
    print(f"{sum(start <= session for start in start_for.values())} ticker(s) are missing at least one session.")

    _, status = ingest(start_for, session, now)

    refresh_fundamentals(tickers, session)

    # This run may legitimately add nothing (holiday), so judge freshness by what is stored
    newest_stored = newest_stored_date()
    if newest_stored is None or (now.date() - newest_stored).days > STALE_AFTER_DAYS:
        print(f"\nERROR: newest stored price is {newest_stored}; more than {STALE_AFTER_DAYS} days old.")
        status = 1

    print(f"Daily ingestion completed. Newest stored session: {newest_stored}.")
    return status


if __name__ == "__main__":
    sys.exit(main())
