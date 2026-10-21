import argparse
import sys
from datetime import timedelta
from common import get_active_tickers, ingest_prices, now_pkt


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill price_history for all active tickers.")
    # 365 calendar days gives ~250 trading days — enough for sma_200 to produce
    # real values on the tail end of the window.
    parser.add_argument("--days", type=int, default=365, help="calendar days of history (default 365)")
    args = parser.parse_args()

    now = now_pkt()
    start = now.date() - timedelta(days=args.days)
    print(f"Starting historical backfill at {now.isoformat()} (from {start})")

    tickers = get_active_tickers()
    if not tickers:
        print("No active tickers found in the halal_universe.")
        return 1

    print(f"Found {len(tickers)} active tickers. Commencing backfill...")
    _, failed, psx_blocked = ingest_prices(tickers, lambda _ticker: start)

    if psx_blocked:
        print("\nERROR: PSX is refusing this connection. Run the backfill from a Pakistani "
              "connection, or set PSX_PROXY_URL.")
    if failed:
        print(f"\nERROR: {len(failed)} ticker(s) failed: {', '.join(failed)}")
        return 1

    print("Historical backfill completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
