import argparse
import sys
from datetime import timedelta
from common import get_active_tickers, last_session_date, now_pkt
from ingest_daily_data import ingest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Re-load price_history for all active tickers from PSX's official daily files.")
    # 365 calendar days gives ~250 trading days — enough for sma_200 to produce
    # real values on the tail end of the window.
    parser.add_argument("--days", type=int, default=365, help="calendar days of history (default 365)")
    args = parser.parse_args()

    now = now_pkt()
    session = last_session_date(now)
    start = session - timedelta(days=args.days)
    print(f"Starting historical backfill at {now.isoformat()} ({start} to {session})")

    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found in the halal_universe.")
        return 1

    print(f"Found {len(tickers)} active tickers. Commencing backfill...")
    _, status = ingest({t: start for t in tickers}, session, now)
    print("Historical backfill completed." if status == 0 else "\nERROR: historical backfill had failures.")
    return status


if __name__ == "__main__":
    sys.exit(main())
