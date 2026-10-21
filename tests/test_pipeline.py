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
    def gte(self, k, v): self.filters[k] = ("gte", v); return self
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
    index = pd.RangeIndex(100)
    with pytest.raises(RuntimeError):
        common._select_by_prefix(pd.DataFrame(columns=["X_1"]), common.MACD_COLUMNS, index, min_rows=35)


def test_short_history_gets_null_indicators_instead_of_failing():
    # A new listing with 20 sessions: too short for MACD (needs 35 rows)
    rows = synthetic_prices(20)
    df = common.process_dataframe(common.price_rows_to_frame(rows))
    records = [common.to_indicator_record("NEW", r) for _, r in df.iterrows()]
    assert all(r["macd"] is None and r["macd_signal"] is None for r in records)
    assert records[-1]["sma_20"] is not None


def test_very_short_history_gets_null_averages():
    # 10 sessions: shorter than even the 20-day windows
    df = common.process_dataframe(common.price_rows_to_frame(synthetic_prices(10)))
    last = common.to_indicator_record("NEW", df.iloc[-1])
    assert last["sma_20"] is None and last["avg_volume_20"] is None and last["volume_spike_ratio"] is None
    assert last["price_change_5d_pct"] is not None
    json.dumps(last)


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


# --- sessions -----------------------------------------------------------------

@pytest.mark.parametrize("now, expected", [
    (datetime(2026, 10, 21, 18, tzinfo=common.PKT), date(2026, 10, 21)),  # Wed after close
    (datetime(2026, 10, 21, 14, tzinfo=common.PKT), date(2026, 10, 20)),  # Wed intraday
    (datetime(2026, 10, 20, 1, tzinfo=common.PKT), date(2026, 10, 19)),   # delayed run past midnight
    (datetime(2026, 10, 19, 9, tzinfo=common.PKT), date(2026, 10, 16)),   # Mon morning -> Fri
    (datetime(2026, 10, 25, 12, tzinfo=common.PKT), date(2026, 10, 23)),  # Sunday -> Fri
])
def test_last_session_date(now, expected):
    assert common.last_session_date(now) == expected


def test_extended_indicators():
    rows = synthetic_prices(300)
    df = common.process_dataframe(common.price_rows_to_frame(rows))
    last = common.to_indicator_record("TEST", df.iloc[-1])

    closes = pd.Series([r["close_price"] for r in rows])
    assert last["return_1m_pct"] == pytest.approx((closes.iloc[-1] / closes.iloc[-22] - 1) * 100)
    assert last["return_1y_pct"] == pytest.approx((closes.iloc[-1] / closes.iloc[-253] - 1) * 100)
    assert last["low_52w"] <= last["high_52w"]
    assert last["pct_from_52w_high"] <= 0
    assert last["atr_14"] > 0
    json.dumps(last)

    short = common.process_dataframe(common.price_rows_to_frame(synthetic_prices(30)))
    rec = common.to_indicator_record("NEW", short.iloc[-1])
    assert rec["return_3m_pct"] is None and rec["return_1y_pct"] is None
    assert rec["return_1m_pct"] is not None and rec["high_52w"] is not None


# --- universe ---------------------------------------------------------------

def run_universe(monkeypatch, existing, fetch):
    import update_universe as uu
    db = FakeDB({"halal_universe": existing})
    monkeypatch.setattr(uu, "supabase", db)
    monkeypatch.setattr(uu, "fetch_constituents", fetch)
    return db, uu.main()


def constituents(n):
    return lambda existing: [{"ticker": f"T{i}", "company_name": f"Co {i}", "is_kmi_30": i < 30} for i in range(n)]


def test_universe_preserves_added_date_and_deactivates_leavers(monkeypatch):
    db, status = run_universe(monkeypatch, [
        {"ticker": "T0", "is_active": True},
        {"ticker": "T1", "is_active": False},
        {"ticker": "OLD", "is_active": True},
    ], constituents(313))

    assert status == 0
    upserts = {c.payload["ticker"]: c.payload for c in db.ops("upsert")}
    assert "added_date" not in upserts["T0"]  # existing: untouched
    assert "added_date" in upserts["T1"]      # re-entering
    assert "added_date" in upserts["T5"]      # new
    assert upserts["T5"]["is_kmi_30"] and not upserts["T40"]["is_kmi_30"]
    (update,) = db.ops("update")
    assert update.filters["ticker"] == ("in", ["OLD"])
    assert update.payload["is_active"] is False


def test_universe_short_list_deactivates_nothing(monkeypatch):
    db, status = run_universe(monkeypatch, [{"ticker": "OLD", "is_active": True}], constituents(40))
    assert status == 0
    assert not db.ops("update")


@pytest.mark.parametrize("listed, expected", [
    ("LUCKXD", "LUCK"),   # ex-dividend marker
    ("DSLNC", "DSL"),     # non-compliant marker
    ("BPLXB", "BPL"),     # ex-bonus marker
    ("OGDC", "OGDC"),     # plain symbol
    ("ABCNC", "ABCNC"),   # a real symbol ending in NC stays whole
    ("ZZZXD", "ZZZXD"),   # unknown either way: left as listed
])
def test_base_symbol(listed, expected):
    import update_universe as uu
    known = {"LUCK", "DSL", "BPL", "OGDC", "ABCNC", "ABC"}
    assert uu.base_symbol(listed, known) == expected


def test_fetch_constituents_strips_status_suffixes(monkeypatch):
    import update_universe as uu
    indices = {
        "KMIALLSHR": pd.DataFrame({"symbol": ["LUCKXD", "OGDC", "ACPL", "AASMNC"],
                                   "name": ["Lucky Cement", "OGDCL", "Attock Cement", "Al-Abid Silk"],
                                   "market_cap_m": [1.0, 2.0, 3.0, 4.0]}),
        "KMI30": pd.DataFrame({"symbol": ["LUCKXD"]}),
    }
    monkeypatch.setattr(uu.psxdata, "indices", lambda name, cache: indices[name])
    # PSX's daily files: symbol -> sector code. AASM did not trade in the window.
    monkeypatch.setattr(uu, "listed_symbols", lambda: {"LUCK": "0804", "OGDC": "0820", "ACPL": "0804"})
    existing = {
        "LUCK": {"is_active": False, "sector": "Cement"},
        "OGDC": {"is_active": True, "sector": "Oil & Gas Exploration Companies"},
        "AASM": {"is_active": True, "sector": "Textile Composite"},
    }

    records = {r["ticker"]: r for r in uu.fetch_constituents(existing)}
    assert set(records) == {"LUCK", "OGDC", "ACPL", "AASM"}  # AASM known because already tracked
    assert records["LUCK"]["is_kmi_30"] and records["LUCK"]["sector"] == "Cement"
    assert records["ACPL"]["sector"] == "Cement"  # new ticker named after its sector code
    assert not records["OGDC"]["is_kmi_30"]


def test_universe_fetch_failure_changes_nothing(monkeypatch):
    def boom(existing):
        raise ConnectionError("PSX down")
    db, status = run_universe(monkeypatch, [{"ticker": "OLD", "is_active": True}], boom)
    assert status == 1
    assert not db.ops("upsert") and not db.ops("update")
