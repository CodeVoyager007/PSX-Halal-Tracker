"""Shared Supabase client and indicator logic for the pipeline scripts.

Both indicator scripts import from here so the daily and backfill paths
cannot drift apart.
"""
import os
import numpy as np
import pandas as pd
import pandas_ta_classic as ta  # noqa: F401 — registers the DataFrame.ta accessor
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


def get_active_tickers() -> list[str]:
    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()
    return [row["ticker"] for row in response.data]


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


def _select_by_prefix(result: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
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
    df = df.join(_select_by_prefix(macd, MACD_COLUMNS)).join(_select_by_prefix(bbands, BBANDS_COLUMNS))

    # Average volume (20-day SMA over the volume series)
    df.ta.sma(close=df["volume"], length=20, append=True, col_names=("avg_volume_20",))

    # --- Trending metrics ---

    # volume_spike_ratio: today's volume relative to the 20-day average.
    # NULL if avg_volume_20 is NULL or zero (guards against division by zero).
    df["volume_spike_ratio"] = np.where(
        (df["avg_volume_20"].notna()) & (df["avg_volume_20"] > 0),
        df["volume"] / df["avg_volume_20"],
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
    try:
        supabase.table("technical_indicators").upsert(records, on_conflict="ticker,trade_date").execute()
        print(f"  trending_score written for {len(records)} tickers on {trade_date}.")
    except Exception as e:
        print(f"  Error writing trending_score for {trade_date}: {e}")
