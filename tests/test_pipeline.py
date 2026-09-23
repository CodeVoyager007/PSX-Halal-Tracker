"""Offline tests: no network, no database. psxdata and Supabase are faked."""
import json
from datetime import date, datetime

import numpy as np
import pandas as pd
import pytest

import common


def synthetic_prices(n=260, start="2025-06-02"):
    rng = np.random.default_rng(0)
    dates = pd.bdate_range(start, periods=n)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return [
        {
            "trade_date": d.strftime("%Y-%m-%d"),
            "open_price": c - 0.5, "high_price": c + 1, "low_price": c - 1,
            "close_price": c, "volume": int(v),
        }
        for d, c, v in zip(dates, close, rng.integers(100_000, 1_000_000, n))
    ]


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload = db, table, {}, "select", None
        self.window = None

    def select(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def eq(self, k, v): self.filters[k] = ("eq", v); return self
    def in_(self, k, v): self.filters[k] = ("in", list(v)); return self
    def upsert(self, p, **k): self.op, self.payload = "upsert", p; return self
    def update(self, p): self.op, self.payload = "update", p; return self
    def range(self, start, end): self.window = (start, end); return self

    def execute(self):
        self.db.calls.append(self)
        rows = self.db.data.get(self.table, []) if self.op == "select" else []
        if "ticker" in self.filters and self.filters["ticker"][0] == "in":
            rows = [r for r in rows if r["ticker"] in self.filters["ticker"][1]]
        if self.window:
            rows = rows[self.window[0]:self.window[1] + 1]
        return type("Resp", (), {"data": rows})()


class FakeDB:
    def __init__(self, data=None):
        self.data, self.calls = data or {}, []

    def table(self, name):
        return FakeQuery(self, name)

    def ops(self, op):
        return [c for c in self.calls if c.op == op]


# --- indicators -------------------------------------------------------------

def test_indicator_records_are_json_and_typed_for_schema():
    df = common.process_dataframe(common.price_rows_to_frame(synthetic_prices()))
    records = [common.to_indicator_record("TEST", r) for _, r in df.iterrows()]
    json.dumps(records)

    last = records[-1]
    assert set(last) == {"ticker", *common.INDICATOR_COLUMNS}
    assert isinstance(last["avg_volume_20"], int)  # BIGINT column
    assert last["sma_200"] is not None
    assert last["bb_lower"] < last["bb_middle"] < last["bb_upper"]
    assert records[0]["sma_20"] is None  # warm-up rows are NULL, not NaN


def test_macd_and_bbands_mapped_by_name():
    df = common.process_dataframe(common.price_rows_to_frame(synthetic_prices()))
    macd = pd.to_numeric(df["macd"])
    signal = pd.to_numeric(df["macd_signal"])
    hist = pd.to_numeric(df["macd_histogram"])
    assert np.allclose((macd - signal).dropna(), hist.dropna())


def test_missing_pandas_ta_column_fails_loudly():
    with pytest.raises(RuntimeError):
        common._select_by_prefix(pd.DataFrame(columns=["X_1"]), common.MACD_COLUMNS)


def test_volume_spike_uses_prior_average():
    rows = synthetic_prices(40)
    for r in rows:
        r["volume"] = 1000
    rows[-1]["volume"] = 5000
    df = common.process_dataframe(common.price_rows_to_frame(rows))
    assert float(df["volume_spike_ratio"].iloc[-1]) == pytest.approx(5.0)


def test_trending_score_ranks_active_tickers_in_one_batch(monkeypatch):
    db = FakeDB({"technical_indicators": [
        {"ticker": "A", "volume_spike_ratio": 2.0, "price_change_5d_pct": 5.0},
        {"ticker": "B", "volume_spike_ratio": 1.0, "price_change_5d_pct": None},
        {"ticker": "GONE", "volume_spike_ratio": 9.0, "price_change_5d_pct": 9.0},
    ]})
    monkeypatch.setattr(common, "supabase", db)
    common.compute_trending_score("2026-01-05", ["A", "B"])

    (upsert,) = db.ops("upsert")
    scores = {r["ticker"]: r["trending_score"] for r in upsert.payload}
    assert scores == {"A": 2.0, "B": 4.0}


def test_fetch_all_pages_past_cap(monkeypatch):
    db = FakeDB({"price_history": [{"n": i} for i in range(2500)]})
    monkeypatch.setattr(common, "supabase", db)
    rows = common.fetch_all(lambda: common.supabase.table("price_history").select("*"))
    assert len(rows) == 2500


# --- price ingestion --------------------------------------------------------

def fake_psx_frame():
    # Mirrors psxdata.stocks(): RangeIndex, `date` column, lowercase OHLCV,
    # newest first, is_anomaly flag, nullable Int64 volume.
    return pd.DataFrame({
        "date": pd.to_datetime(["2026-01-07", "2026-01-06", "2026-01-05"]),
        "open": [10.0, 11.0, 12.0], "high": [11.0, 12.0, 13.0],
        "low": [9.0, 10.0, np.nan], "close": [10.5, 11.5, 12.5],
        "volume": pd.array([100, 200, 300], dtype="Int64"),
        "is_anomaly": [False, True, False],
    })


@pytest.mark.parametrize("hour, expected_dates", [
    (12, ["2026-01-05"]),                # intraday: today's row dropped
    (18, ["2026-01-05", "2026-01-07"]),  # after close: today's row kept
])
def test_fetch_price_records(monkeypatch, hour, expected_dates):
    monkeypatch.setattr(common.psxdata, "stocks", lambda *a, **k: fake_psx_frame())
    monkeypatch.setattr(common, "now_pkt", lambda: datetime(2026, 1, 7, hour, tzinfo=common.PKT))

    records, skipped = common.fetch_price_records("TEST", date(2026, 1, 1))

    assert [r["trade_date"] for r in records] == expected_dates  # chronological
    assert skipped == 1
    assert records[0]["low_price"] is None  # NaN stored as NULL, never 0
    assert records[0]["volume"] == 300 and isinstance(records[0]["volume"], int)
    json.dumps(records)


def test_ingest_prices_reports_failures_without_stopping(monkeypatch):
    upserts = []
    monkeypatch.setattr(common, "upsert_price_records", upserts.append)

    def fake_fetch(ticker, start):
        if ticker == "BAD":
            raise ConnectionError("PSX down")
        return [{"ticker": ticker, "trade_date": "2026-01-05"}], 0

    monkeypatch.setattr(common, "fetch_price_records", fake_fetch)
    newest, failed = common.ingest_prices(["BAD", "OK"], lambda t: date(2026, 1, 1))

    assert newest == date(2026, 1, 5)
    assert failed == ["BAD"]
    assert len(upserts) == 1


# --- universe ---------------------------------------------------------------

def run_universe(monkeypatch, existing, records, is_live):
    import update_universe as uu
    db = FakeDB({"halal_universe": existing})
    monkeypatch.setattr(uu, "supabase", db)
    monkeypatch.setattr(uu, "fetch_constituents", lambda: ([dict(r) for r in records], is_live))
    assert uu.main() == 0
    return db


def test_universe_live_preserves_added_date_and_deactivates_leavers(monkeypatch):
    kmi = [{"ticker": f"T{i}", "company_name": f"Co {i}"} for i in range(30)]
    db = run_universe(monkeypatch, [
        {"ticker": "T0", "is_active": True},
        {"ticker": "T1", "is_active": False},
        {"ticker": "OLD", "is_active": True},
    ], kmi, True)

    upserts = {c.payload["ticker"]: c.payload for c in db.ops("upsert")}
    assert "added_date" not in upserts["T0"]  # existing: untouched
    assert "added_date" in upserts["T1"]      # re-entering
    assert "added_date" in upserts["T5"]      # new
    (update,) = db.ops("update")
    assert update.filters["ticker"] == ("in", ["OLD"])
    assert update.payload["is_active"] is False


def test_universe_fallback_writes_no_placeholders_and_deactivates_nothing(monkeypatch):
    db = run_universe(monkeypatch, [{"ticker": "OLD", "is_active": True}], [{"ticker": "T0"}], False)
    (upsert,) = db.ops("upsert")
    assert "company_name" not in upsert.payload
    assert not db.ops("update")
