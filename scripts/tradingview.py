"""Fallback market data from TradingView's public screener endpoint.

PSX's portal refuses many datacenter IPs (GitHub Actions included). TradingView
answers them and returns every requested PSX symbol in a single request, so the
daily run can still store the day's bar when PSX is unreachable.

Limits, compared with PSX:
- Only the current daily bar: it cannot fill gaps from missed days.
- The bar carries no date. The caller labels it with the last finalised
  session and checks it against what is already stored (see snapshot_records).
- Unofficial and unlicensed, like scraping PSX itself (see README).
"""
import re
from datetime import date

import httpx

SCAN_URL = "https://scanner.tradingview.com/pakistan/scan"
REQUEST_TIMEOUT_SECONDS = 30
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PSX-Halal-Tracker/1.0)",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
}

# Price fields come in their own request: if TradingView ever drops or renames a
# fundamentals field, prices must keep flowing.
PRICE_FIELDS = ["open", "high", "low", "close", "volume"]

# TradingView field -> company_stats column
FUNDAMENTAL_FIELDS = {
    "market_cap_basic": "market_cap",
    "price_earnings_ttm": "pe_ratio",
    "earnings_per_share_basic_ttm": "eps_ttm",
    "dividend_yield_recent": "dividend_yield_pct",
    "price_52_week_high": "high_52w",
    "price_52_week_low": "low_52w",
    "beta_1_year": "beta_1y",
    "average_volume_30d_calc": "avg_volume_30d",
}

# If most tickers' "today" bar is identical to the last stored bar, TradingView
# is still serving the previous session: the market was shut (holiday).
HOLIDAY_REPEAT_SHARE = 0.8


def scan(tickers: list[str], fields: list[str]) -> dict[str, dict]:
    """Return {ticker: {field: value}} for the tickers TradingView knows."""
    body = {
        "symbols": {"tickers": [f"PSX:{t}" for t in tickers], "query": {"types": []}},
        "columns": fields,
        "range": [0, len(tickers)],
    }
    resp = httpx.post(SCAN_URL, json=body, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict) or "data" not in payload:
        raise ValueError(f"Unexpected TradingView response: {str(payload)[:200]}")

    rows = {}
    for item in payload["data"] or []:
        symbol, values = item.get("s", ""), item.get("d") or []
        if not symbol.startswith("PSX:") or len(values) != len(fields):
            continue
        rows[symbol.removeprefix("PSX:")] = dict(zip(fields, values))
    return rows


def scan_dropping_unknown(tickers: list[str], fields: list[str]) -> tuple[dict[str, dict], list[str]]:
    """
    scan(), but when TradingView rejects a field it does not know (HTTP 400
    naming the field), drop that field and retry. Returns (rows, dropped fields).
    """
    fields, dropped = list(fields), []
    while fields:
        try:
            return scan(tickers, fields), dropped
        except httpx.HTTPStatusError as e:
            message = _error_message(e.response)
            unknown = next((f for f in fields if re.search(rf"(?<![\w|]){re.escape(f)}(?![\w|])", message)), None)
            if e.response.status_code != 400 or unknown is None:
                raise
            fields.remove(unknown)
            dropped.append(unknown)
    return {}, dropped


def _error_message(response) -> str:
    # Errors arrive as JSON ({"error": "Unknown field \"x\""}); fall back to the raw body
    try:
        payload = response.json()
        if isinstance(payload, dict) and payload.get("error"):
            return str(payload["error"])
    except ValueError:
        pass
    return response.text


def _number(val) -> float | None:
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN -> None


def _valid_bar(bar: dict) -> bool:
    o, h, l, c = (_number(bar.get(k)) for k in ("open", "high", "low", "close"))
    if None in (o, h, l, c) or min(o, h, l, c) <= 0:
        return False
    # Allow rounding noise, reject garbage
    return l <= min(o, c) * 1.0001 and h >= max(o, c) * 0.9999


def snapshot_records(snapshot: dict[str, dict], session: date,
                     last_stored: dict[str, dict]) -> tuple[list[dict], str]:
    """
    Turn a TradingView price snapshot into price_history records for `session`.

    last_stored maps ticker -> its newest price_history row (trade_date,
    close_price, volume). A ticker is skipped when it already has a row for
    `session` or later, when its bar fails validation, or when the bar repeats
    the last stored one (no trades today, or the market was shut).

    Returns (records, note). records is empty when the snapshot looks like a
    holiday; note explains what happened.
    """
    candidates, repeats, invalid = [], 0, 0
    session_iso = session.isoformat()

    for ticker, bar in snapshot.items():
        if not _valid_bar(bar):
            invalid += 1
            continue
        prev = last_stored.get(ticker)
        if prev and prev["trade_date"] >= session_iso:
            continue
        close, volume = _number(bar["close"]), _number(bar.get("volume"))
        if prev and _number(prev.get("close_price")) == round(close, 2) \
                and _number(prev.get("volume")) == volume:
            repeats += 1
            continue
        candidates.append({
            "ticker": ticker,
            "trade_date": session_iso,
            "open_price": round(_number(bar["open"]), 2),
            "high_price": round(_number(bar["high"]), 2),
            "low_price": round(_number(bar["low"]), 2),
            "close_price": round(close, 2),
            "volume": int(volume) if volume is not None else None,
        })

    compared = len(candidates) + repeats
    if compared and repeats / compared >= HOLIDAY_REPEAT_SHARE:
        return [], (f"{repeats} of {compared} bars repeat the last stored session; "
                    f"treating {session_iso} as a market holiday.")
    return candidates, (f"{len(candidates)} new bar(s) for {session_iso}; "
                        f"{repeats} unchanged, {invalid} invalid.")


def fundamentals_records(snapshot: dict[str, dict], as_of: date) -> list[dict]:
    """company_stats rows from a fundamentals snapshot; fields TradingView lacks stay NULL."""
    records = []
    for ticker, values in snapshot.items():
        record = {"ticker": ticker, "as_of": as_of.isoformat()}
        for field, column in FUNDAMENTAL_FIELDS.items():
            record[column] = _number(values.get(field))
        if record["avg_volume_30d"] is not None:
            record["avg_volume_30d"] = int(round(record["avg_volume_30d"]))
        if any(record[c] is not None for c in FUNDAMENTAL_FIELDS.values()):
            records.append(record)
    return records
