"""Shared Supabase client and indicator logic for the pipeline scripts.

Both indicator scripts import from here so the daily and backfill paths
cannot drift apart.
"""
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Callable
import numpy as np
import pandas as pd
import pandas_ta_classic as ta  # noqa: F401 — registers the DataFrame.ta accessor
import psxdata
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# technical_indicators columns written per ticker. trending_score is excluded:
# it is cross-ticker and filled afterwards by compute_trending_score().
INDICATOR_COLUMNS = [
    "trade_date",
    "sma_20", "sma_50", "sma_200",
    "ema_12", "ema_26",
    "rsi_14",
    "macd", "macd_signal", "macd_histogram",
    "bb_upper", "bb_middle", "bb_lower",
    "avg_volume_20",
    "volume_spike_ratio", "price_change_5d_pct",
]

# pandas-ta output columns mapped to schema columns by name prefix, never by
# position — a library change in output order must fail loudly, not silently
# write the MACD signal into the histogram column.
MACD_COLUMNS = {"MACD_": "macd", "MACDh_": "macd_histogram", "MACDs_": "macd_signal"}
BBANDS_COLUMNS = {"BBL_": "bb_lower", "BBM_": "bb_middle", "BBU_": "bb_upper"}


PKT = timezone(timedelta(hours=5))

# PSX closes 3:30 PM Mon–Thu and 4:30 PM Fri; before 5 PM PKT today's row from
# psxdata is still intraday (partial volume, moving close) and must not be stored.
TODAY_FINAL_HOUR_PKT = 17

# Supabase caps each response at 1,000 rows by default
PAGE_SIZE = 1000
UPSERT_CHUNK_SIZE = 100

# PSX's portal resets connections when hit with ~300 back-to-back requests.
# Pace requests and retry transient failures with backoff.
PSX_REQUEST_PAUSE_SECONDS = 0.5
PSX_RETRY_DELAYS_SECONDS = (5, 20)


def now_pkt() -> datetime:
    return datetime.now(PKT)


def fetch_all(build_query: Callable) -> list[dict]:
    """Page through a select query. build_query must return a fresh query builder each call."""
    rows, start = [], 0
    while True:
        page = build_query().range(start, start + PAGE_SIZE - 1).execute().data
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def get_active_tickers() -> list[str]:
    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()
    return [row["ticker"] for row in response.data]


def get_latest_trade_date(ticker: str) -> date | None:
    resp = supabase.table("price_history").select("trade_date") \
        .eq("ticker", ticker).order("trade_date", desc=True).limit(1).execute()
    return date.fromisoformat(resp.data[0]["trade_date"]) if resp.data else None


def _float(val):
    # NaN is truthy, so `val or None` would not catch it. Storing NULL (not 0) keeps
    # fake prices out of the indicator calculations downstream.
    return float(val) if pd.notna(val) else None


def _int(val):
    return int(val) if pd.notna(val) else None


def fetch_price_records(ticker: str, start: date) -> tuple[list[dict], int]:
    """
    Fetch finalised OHLCV rows on or after start as price_history records.
    Returns (records, anomalous rows skipped).
    """
    # cache=False: psxdata's on-disk historical cache never expires locally
    df = psxdata.stocks(ticker, start=start, cache=False)
    if df is None or df.empty:
        return [], 0

    # psxdata returns `date` as a column (RangeIndex), lowercase OHLCV, and an is_anomaly flag
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])

    now = now_pkt()
    if now.hour < TODAY_FINAL_HOUR_PKT:
        df = df[df["date"].dt.date < now.date()]

    anomalous = df["is_anomaly"].fillna(False).astype(bool) if "is_anomaly" in df.columns \
        else pd.Series(False, index=df.index)
    df = df[~anomalous]

    records = [
        {
            "ticker": ticker,
            "trade_date": row["date"].strftime("%Y-%m-%d"),
            "open_price":  _float(row.get("open")),
            "high_price":  _float(row.get("high")),
            "low_price":   _float(row.get("low")),
            "close_price": _float(row.get("close")),
            "volume":      _int(row.get("volume")),
        }
        for row in df.sort_values("date").to_dict("records")
    ]
    return records, int(anomalous.sum())


def fetch_with_retry(ticker: str, start: date) -> tuple[list[dict], int]:
    """fetch_price_records, retrying connection resets and timeouts with backoff."""
    for attempt, delay in enumerate((*PSX_RETRY_DELAYS_SECONDS, None), start=1):
        try:
            return fetch_price_records(ticker, start)
        except Exception as e:
            if delay is None:
                raise
            print(f"  Attempt {attempt} failed ({e}); retrying in {delay}s.")
            time.sleep(delay)


def upsert_price_records(records: list[dict]):
    # on_conflict targets the UNIQUE (ticker, trade_date) constraint, not the id
    # primary key, so re-runs update existing rows instead of failing on duplicates.
    for i in range(0, len(records), UPSERT_CHUNK_SIZE):
        supabase.table("price_history").upsert(
            records[i:i + UPSERT_CHUNK_SIZE], on_conflict="ticker,trade_date"
        ).execute()


def ingest_prices(tickers: list[str], start_for: Callable[[str], date]) -> tuple[date | None, list[str]]:
    """
    Fetch and upsert prices for each ticker from start_for(ticker) onwards.
    Returns (newest trade_date stored, tickers that errored).
    """
    newest: date | None = None
    failed: list[str] = []

    for i, ticker in enumerate(tickers):
        if i:
            time.sleep(PSX_REQUEST_PAUSE_SECONDS)
        try:
            start = start_for(ticker)
            print(f"Processing {ticker} (from {start})...")
            records, skipped = fetch_with_retry(ticker, start)
            if skipped:
                print(f"  Skipped {skipped} anomalous row(s).")
            if not records:
                print("  No new finalised rows.")
                continue
            upsert_price_records(records)
            last = date.fromisoformat(records[-1]["trade_date"])
            newest = last if newest is None else max(newest, last)
            print(f"  Upserted {len(records)} row(s) through {last}.")
        except Exception as e:
            print(f"  Error processing {ticker}: {e}")
            failed.append(ticker)

    return newest, failed


def price_rows_to_frame(rows: list[dict]) -> pd.DataFrame:
    """Convert price_history rows into the capitalised OHLCV frame pandas-ta expects."""
    df = pd.DataFrame(rows).rename(columns={
        "open_price":  "Open",
        "high_price":  "High",
        "low_price":   "Low",
        "close_price": "Close",
    })
    numeric_cols = ["Open", "High", "Low", "Close", "volume"]
    df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
    return df


def _select_by_prefix(result: pd.DataFrame | None, mapping: dict[str, str],
                      index: pd.Index, min_rows: int) -> pd.DataFrame:
    """
    Map pandas-ta output columns to schema names. With too little history for
    the indicator, pandas-ta returns nothing usable; that yields NULL columns.
    With enough history, a missing column is a library change and raises.
    """
    has_output = result is not None and any(
        c.startswith(prefix) for c in result.columns for prefix in mapping
    )
    if not has_output and len(index) < min_rows:
        return pd.DataFrame({target: np.nan for target in mapping.values()}, index=index)
    renamed = {}
    for prefix, target in mapping.items():
        matches = [c for c in result.columns if c.startswith(prefix)]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one pandas-ta column starting with {prefix!r}, got {list(result.columns)}"
            )
        renamed[matches[0]] = target
    return result[list(renamed)].rename(columns=renamed)


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Computes technical indicators natively using pandas-ta and maps them to schema columns."""
    # Ensure chronological order; pandas-ta requires a DatetimeIndex
    df = df.sort_values(by="trade_date").copy()
    df.set_index(pd.DatetimeIndex(df["trade_date"]), inplace=True)

    # Single-output indicators: col_names safely names the one column at calculation time
    df.ta.sma(length=20,  append=True, col_names=("sma_20",))
    df.ta.sma(length=50,  append=True, col_names=("sma_50",))
    df.ta.sma(length=200, append=True, col_names=("sma_200",))

    df.ta.ema(length=12, append=True, col_names=("ema_12",))
    df.ta.ema(length=26, append=True, col_names=("ema_26",))

    df.ta.rsi(length=14, append=True, col_names=("rsi_14",))

    # Multi-output indicators: map by column name (see MACD_COLUMNS / BBANDS_COLUMNS)
    macd = df.ta.macd(fast=12, slow=26, signal=9, append=False)
    bbands = df.ta.bbands(length=20, std=2, append=False)
    df = df.join(_select_by_prefix(macd, MACD_COLUMNS, df.index, min_rows=26 + 9))
    df = df.join(_select_by_prefix(bbands, BBANDS_COLUMNS, df.index, min_rows=20))

    # Average volume (20-day SMA over the volume series)
    df.ta.sma(close=df["volume"], length=20, append=True, col_names=("avg_volume_20",))

    # pandas-ta appends nothing when history is shorter than the window (new
    # listings), so make sure every column exists and is NULL in that case
    for col in ("sma_20", "sma_50", "sma_200", "ema_12", "ema_26", "rsi_14", "avg_volume_20"):
        if col not in df.columns:
            df[col] = np.nan

    # --- Trending metrics ---

    # volume_spike_ratio: today's volume relative to the PRIOR 20 days' average.
    # Using the previous row's avg_volume_20 keeps today's own volume out of the
    # baseline, which would otherwise dampen the very spike being measured.
    # NULL if the baseline is NULL or zero (guards against division by zero).
    prior_avg_volume = df["avg_volume_20"].shift(1)
    df["volume_spike_ratio"] = np.where(
        prior_avg_volume.notna() & (prior_avg_volume > 0),
        df["volume"] / prior_avg_volume,
        None
    )

    # price_change_5d_pct: momentum over the last 5 *trading* days.
    # shift(5) steps back 5 rows in the sorted DataFrame — correct for PSX's irregular
    # calendar (Friday half-sessions, holidays) unlike a fixed calendar-day offset.
    # NULL for the first 5 rows where no prior close exists.
    close_5d_ago = df["Close"].shift(5)
    df["price_change_5d_pct"] = np.where(
        close_5d_ago.notna() & (close_5d_ago != 0),
        (df["Close"] - close_5d_ago) / close_5d_ago * 100,
        None
    )

    # Cast remaining NaNs → None so Supabase writes NULL
    df = df.replace({np.nan: None})
    return df


def to_indicator_record(ticker: str, row: pd.Series) -> dict:
    """Build a technical_indicators row from one processed DataFrame row."""
    record = {"ticker": ticker}
    for col in INDICATOR_COLUMNS:
        val = row.get(col, None)
        record[col] = val if pd.notna(val) else None

    # avg_volume_20 is BIGINT; Postgres rejects a fractional value like 12345.6,
    # which would fail the whole upsert batch.
    if record["avg_volume_20"] is not None:
        record["avg_volume_20"] = int(round(record["avg_volume_20"]))
    return record


def compute_trending_score(trade_date: str, active_tickers: list[str]):
    """
    Compute and write trending_score for all active tickers on the given trade_date.

    Ranking logic (lower score = MORE trending):
      - volume_rank: rank tickers by volume_spike_ratio DESCENDING → rank 1 = largest spike
      - price_rank:  rank tickers by price_change_5d_pct  DESCENDING → rank 1 = biggest gain
      - trending_score = volume_rank + price_rank

    Example: a ticker ranked #1 on both metrics gets trending_score = 2 (most trending).
    Tickers with NULL in either metric receive the worst rank via na_option="bottom".
    Inactive tickers are excluded so they cannot push active ones down the ranking.
    """
    resp = supabase.table("technical_indicators") \
        .select("ticker, volume_spike_ratio, price_change_5d_pct") \
        .eq("trade_date", trade_date) \
        .in_("ticker", active_tickers) \
        .execute()

    if not resp.data:
        print(f"  No indicator rows found for {trade_date} — skipping trending_score.")
        return

    scores_df = pd.DataFrame(resp.data)

    # Both sub-ranks go descending: highest value → rank 1 (most trending)
    scores_df["volume_rank"] = pd.to_numeric(
        scores_df["volume_spike_ratio"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")

    scores_df["price_rank"] = pd.to_numeric(
        scores_df["price_change_5d_pct"], errors="coerce"
    ).rank(ascending=False, method="min", na_option="bottom")

    scores_df["trending_score"] = scores_df["volume_rank"] + scores_df["price_rank"]

    # One batched upsert per date. Only the three columns in the payload are
    # updated on conflict, so the per-ticker indicators are left untouched.
    records = [
        {"ticker": row["ticker"], "trade_date": trade_date, "trending_score": float(row["trending_score"])}
        for _, row in scores_df.iterrows()
    ]
    supabase.table("technical_indicators").upsert(records, on_conflict="ticker,trade_date").execute()
    print(f"  trending_score written for {len(records)} tickers on {trade_date}.")
