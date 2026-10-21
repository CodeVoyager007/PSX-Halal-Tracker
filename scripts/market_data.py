"""Market data sources that answer from GitHub Actions, and cross-checking them.

Primary: PSX's official daily market summary file. One download per trading
day holds every listed symbol's open, high, low, close and volume, so missed
days and new listings can always be filled by date. PSX refuses datacenter IPs
on its per-symbol endpoints (/historical, /symbols: HTTP 403) but serves these
files, which is why the pipeline no longer uses psxdata for prices.

Verification: SCS Trade's historical prices, an independent site whose figures
matched PSX's file to the last digit when checked (OGDC, 2026-10-20). A stored
price is "verified" when the second source's close agrees within tolerance.
"""
import io
import time
import zipfile
from datetime import date, datetime, timedelta, timezone

import httpx

PSX_FILE_URL = "https://dps.psx.com.pk/download/mkt_summary/{day}.Z"
SCS_URL = "https://www.scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx/chart"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "*/*",
}
TIMEOUT_SECONDS = 30
RETRY_DELAYS_SECONDS = (3, 10)
PAUSE_SECONDS = 0.3  # between requests to the same site

# Closes from two sources agree when within this fraction (PSX publishes two
# decimals; independent feeds occasionally round differently)
CLOSE_TOLERANCE = 0.005

PKT = timezone(timedelta(hours=5))


def client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=TIMEOUT_SECONDS, follow_redirects=True)


def _with_retry(fn):
    for delay in (*RETRY_DELAYS_SECONDS, None):
        try:
            return fn()
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            if delay is None or (isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500):
                raise
            time.sleep(delay)


# --- PSX daily market summary -------------------------------------------------

def parse_market_summary(text: str, day: date) -> dict[str, dict]:
    """
    Parse closing11.lis: DATE|SYMBOL|SECTOR|NAME|OPEN|HIGH|LOW|CLOSE|VOLUME|LDCP|...
    e.g. 20OCT2026|LUCK|0804|Lucky Cement|400.34|403.9|396.6|398.05|304340|400.34|||
    Returns {symbol: bar}. Futures contracts (AGHA-OCT) and rows for another
    date are skipped; names are not used (PSX appends markers such as "XD").
    """
    expected = day.strftime("%d%b%Y").upper()
    bars = {}
    for line in text.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 10 or parts[0].upper() != expected or "-" in parts[1] or not parts[1]:
            continue
        try:
            o, h, l, c = (float(parts[i]) for i in (4, 5, 6, 7))
            volume = int(float(parts[8]))
            ldcp = float(parts[9]) if parts[9] else None
        except ValueError:
            continue
        bars[parts[1]] = {"open": o, "high": h, "low": l, "close": c, "volume": volume,
                          "ldcp": ldcp, "sector_code": parts[2]}
    return bars


def fetch_market_summary(http: httpx.Client, day: date) -> dict[str, dict] | None:
    """Every symbol's bar for `day`, or None when PSX has no file (holiday or not yet published)."""
    def get():
        r = http.get(PSX_FILE_URL.format(day=day.isoformat()))
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.content

    content = _with_retry(get)
    if not content or not content.startswith(b"PK"):  # a zip archive despite the .Z name
        return None
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        text = "".join(z.read(name).decode("latin-1") for name in z.namelist())
    return parse_market_summary(text, day) or None


# --- SCS Trade (verification) ---------------------------------------------------

def _scs_date(raw: str) -> date:
    # "/Date(1792436400000)/": milliseconds since the epoch at midnight PKT
    ms = int(raw.strip("/").removeprefix("Date(").removesuffix(")"))
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(PKT).date()


def parse_scs(payload: dict) -> dict[str, dict]:
    """{iso date: bar} from an SCS Trade historical-prices response."""
    out = {}
    for row in payload.get("d") or []:
        try:
            out[_scs_date(row["trading_Date"]).isoformat()] = {
                "open": float(row["trading_open"]), "high": float(row["trading_high"]),
                "low": float(row["trading_low"]), "close": float(row["trading_close"]),
                "volume": int(row["trading_vol"]),
            }
        except (KeyError, TypeError, ValueError):
            continue
    return out


def fetch_scs_history(http: httpx.Client, ticker: str, start: date, end: date) -> dict[str, dict]:
    """SCS Trade's daily bars for ticker between start and end inclusive."""
    body = {"par": ticker, "date1": start.strftime("%m/%d/%Y"), "date2": end.strftime("%m/%d/%Y"),
            "rows": (end - start).days + 10, "page": 1, "sidx": "trading_Date", "sord": "desc"}

    def post():
        r = http.post(SCS_URL, json=body)
        r.raise_for_status()
        return r.json()

    return parse_scs(_with_retry(post))


def closes_agree(a: float | None, b: float | None) -> bool:
    if a is None or b is None or a <= 0 or b <= 0:
        return False
    # 1e-9 absorbs float noise: 1.01 - 1.00 is 0.010000000000000009
    return abs(a - b) <= max(0.01, CLOSE_TOLERANCE * max(a, b)) + 1e-9
