"""Report which market-data sources answer from the current machine.

PSX refuses many datacenter IPs, and which paths it refuses has changed over
time, so the pipeline's sources need re-checking from the place it runs
(GitHub Actions). Prints one line per probe: status, size and a short preview.
Run: python scripts/check_sources.py  (or the "Check Data Sources" workflow)
"""
import sys
from datetime import date, timedelta

import httpx

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")


def last_weekday() -> date:
    d = date.today() - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def probes() -> list[tuple[str, str, str, dict]]:
    """(label, method, url, request kwargs)"""
    day = last_weekday()
    month_ago = day - timedelta(days=30)
    return [
        ("PSX root", "GET", "https://dps.psx.com.pk/", {}),
        ("PSX historical (psxdata)", "POST", "https://dps.psx.com.pk/historical", {"data": {"symbol": "OGDC"}}),
        ("PSX EOD timeseries", "GET", "https://dps.psx.com.pk/timeseries/eod/OGDC", {}),
        ("PSX company page", "GET", "https://dps.psx.com.pk/company/OGDC", {}),
        ("PSX KMI All-Share index", "GET", "https://dps.psx.com.pk/indices/KMIALLSHR", {}),
        ("PSX symbols list", "GET", "https://dps.psx.com.pk/symbols", {}),
        ("PSX market summary file", "GET", f"https://dps.psx.com.pk/download/mkt_summary/{day}.Z", {}),
        ("PSX closing rates PDF", "GET", f"https://dps.psx.com.pk/download/closing_rates/{day}.pdf", {}),
        ("PSX main site", "GET", "https://www.psx.com.pk/", {}),
        ("SCS Trade historical", "POST",
         "https://www.scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx/chart",
         {"json": {"par": "OGDC", "date1": month_ago.strftime("%m/%d/%Y"), "date2": day.strftime("%m/%d/%Y"),
                   "rows": 5, "page": 1, "sidx": "trading_Date", "sord": "desc"}}),
        ("Sarmaaya", "GET", "https://sarmaaya.pk/psx/company/OGDC", {}),
        ("TradingView screener", "POST", "https://scanner.tradingview.com/pakistan/scan",
         {"json": {"symbols": {"tickers": ["PSX:OGDC"]}, "columns": ["close", "volume"], "range": [0, 1]}}),
        ("Yahoo Finance OGDC.KA", "GET", "https://query1.finance.yahoo.com/v8/finance/chart/OGDC.KA?range=5d&interval=1d", {}),
        ("Stooq", "GET", "https://stooq.com/q/d/l/?s=ogdc.pk&i=d", {}),
    ]


def main() -> int:
    headers = {"User-Agent": UA, "Accept": "*/*", "Referer": "https://dps.psx.com.pk/"}
    with httpx.Client(headers=headers, timeout=20, follow_redirects=True) as client:
        for label, method, url, kwargs in probes():
            try:
                r = client.request(method, url, **kwargs)
                body = r.content
                preview = body[:160].decode("utf-8", "replace").replace("\n", " ").replace("\r", " ")
                print(f"{r.status_code:>3}  {len(body):>9,} B  {r.headers.get('content-type', '-')[:30]:<30}  "
                      f"{label}\n       {url}\n       {preview!r}")
            except Exception as e:
                print(f"ERR  {label}: {type(e).__name__}: {e}\n       {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
