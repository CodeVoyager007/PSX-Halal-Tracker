import sys
from datetime import timedelta
from common import get_active_tickers, get_latest_trade_date, ingest_prices, now_pkt

# Tickers with no stored history get a full backfill window
BACKFILL_DAYS = 365
# Re-fetch the last week on every run so a missed or delayed run self-heals and
# late corrections from PSX overwrite earlier values. Upserts make this idempotent.
OVERLAP_DAYS = 7
# Longer than any PSX closure (Eid holidays plus a weekend), so going beyond
# it means ingestion is broken rather than the market being shut.
STALE_AFTER_DAYS = 7


def main() -> int:
    now = now_pkt()
    print(f"Starting daily ingestion at {now.isoformat()}")

    # Only tickers marked active in halal_universe are processed (the Shariah filter)
    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found in the halal_universe.")
        return 1

    print(f"Found {len(tickers)} active tickers in the universe.")

    previously_stored = []

    def start_for(ticker: str):
        latest = get_latest_trade_date(ticker)
        if latest is None:
            return now.date() - timedelta(days=BACKFILL_DAYS)
        previously_stored.append(latest)
        return latest - timedelta(days=OVERLAP_DAYS)

    newest, failed = ingest_prices(tickers, start_for)

    status = 0
    if failed:
        print(f"\nERROR: {len(failed)} ticker(s) failed: {', '.join(failed)}")
        status = 1

    # This run may legitimately add nothing (holiday), so also count what was already stored
    candidates = previously_stored + ([newest] if newest else [])
    newest_stored = max(candidates) if candidates else None
    if newest_stored is None or (now.date() - newest_stored).days > STALE_AFTER_DAYS:
        print(f"\nERROR: newest stored price is {newest_stored}; more than {STALE_AFTER_DAYS} days old.")
        status = 1

    print(f"Daily ingestion completed. Newest row this run: {newest}; newest stored: {newest_stored}.")
    return status


if __name__ == "__main__":
    sys.exit(main())
