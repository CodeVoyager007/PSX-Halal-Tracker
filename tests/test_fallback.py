"""Offline tests for the TradingView fallback and the daily run's source selection."""
import json
from datetime import date, datetime

import httpx
import pytest

import common
import tradingview as tv
from test_pipeline import FakeDB

SESSION = date(2026, 10, 21)


def bar(close, volume=1000, **kw):
    return {"open": close - 1, "high": close + 2, "low": close - 2, "close": close, "volume": volume, **kw}


def stored(ticker, trade_date, close, volume):
    return {"ticker": ticker, "trade_date": trade_date, "close_price": close, "volume": volume}


class FakeResponse:
    def __init__(self, status, payload):
        self.status_code, self._payload = status, payload
        self.text = json.dumps(payload)
        self.request = httpx.Request("POST", tv.SCAN_URL)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=self.request, response=self)


# --- parsing ------------------------------------------------------------------

def test_scan_maps_columns_by_position(monkeypatch):
    sent = {}

    def post(url, json, **kw):
        sent.update(json)
        return FakeResponse(200, {"totalCount": 2, "data": [
            {"s": "PSX:OGDC", "d": [210.5, 1_500_000]},
            {"s": "PSX:LUCK", "d": [900.0]},          # wrong length: ignored
            {"s": "NASDAQ:AAPL", "d": [1.0, 2]},      # other exchange: ignored
        ]})

    monkeypatch.setattr(tv.httpx, "post", post)
    rows = tv.scan(["OGDC", "LUCK"], ["close", "volume"])
    assert rows == {"OGDC": {"close": 210.5, "volume": 1_500_000}}
    assert sent["symbols"]["tickers"] == ["PSX:OGDC", "PSX:LUCK"]
    assert sent["columns"] == ["close", "volume"]


def test_scan_rejects_unexpected_payload(monkeypatch):
    monkeypatch.setattr(tv.httpx, "post", lambda *a, **k: FakeResponse(200, ["nope"]))
    with pytest.raises(ValueError):
        tv.scan(["OGDC"], ["close"])


def test_unknown_field_is_dropped_and_retried(monkeypatch):
    calls = []

    def post(url, json, **kw):
        calls.append(list(json["columns"]))
        if "beta_1_year" in json["columns"]:
            return FakeResponse(400, {"error": 'Unknown field "beta_1_year"', "data": None})
        return FakeResponse(200, {"data": [{"s": "PSX:OGDC", "d": [4.5] * len(json["columns"])}]})

    monkeypatch.setattr(tv.httpx, "post", post)
    rows, dropped = tv.scan_dropping_unknown(["OGDC"], ["price_earnings_ttm", "beta_1_year"])
    assert dropped == ["beta_1_year"]
    assert rows == {"OGDC": {"price_earnings_ttm": 4.5}}
    assert len(calls) == 2


def test_other_http_errors_are_not_swallowed(monkeypatch):
    monkeypatch.setattr(tv.httpx, "post", lambda *a, **k: FakeResponse(503, {"error": "down"}))
    with pytest.raises(httpx.HTTPStatusError):
        tv.scan_dropping_unknown(["OGDC"], ["close"])


# --- snapshot -> records --------------------------------------------------------

def test_snapshot_records_writes_new_bars_and_skips_the_rest():
    snapshot = {
        "NEW": bar(100.0),                         # moved since last stored: written
        "GAP": bar(50.0),                          # stored row is weeks old: written
        "FLAT": bar(20.0, volume=500),             # same as last stored: no trades today
        "DONE": bar(30.0),                         # already has today's row
        "JUNK": bar(10.0, low=15.0),               # low above close: invalid
        "ZERO": bar(0.0),                          # non-positive price: invalid
        "FIRST": bar(5.0),                         # nothing stored yet: written
    }
    last = {
        "NEW": stored("NEW", "2026-10-20", 98.0, 900),
        "GAP": stored("GAP", "2026-09-23", 48.0, 900),
        "FLAT": stored("FLAT", "2026-10-20", 20.0, 500),
        "DONE": stored("DONE", "2026-10-21", 30.0, 1000),
    }
    records, note = tv.snapshot_records(snapshot, SESSION, last)

    assert sorted(r["ticker"] for r in records) == ["FIRST", "GAP", "NEW"]
    assert all(r["trade_date"] == "2026-10-21" for r in records)
    new = next(r for r in records if r["ticker"] == "NEW")
    assert new == {"ticker": "NEW", "trade_date": "2026-10-21", "open_price": 99.0, "high_price": 102.0,
                   "low_price": 98.0, "close_price": 100.0, "volume": 1000}
    assert "2 invalid" in note
    json.dumps(records)


def test_snapshot_that_repeats_last_session_is_a_holiday():
    snapshot = {f"T{i}": bar(10.0 + i) for i in range(10)}
    last = {f"T{i}": stored(f"T{i}", "2026-10-20", 10.0 + i, 1000) for i in range(9)}
    records, note = tv.snapshot_records(snapshot, SESSION, last)
    assert records == []
    assert "holiday" in note


def test_fundamentals_records():
    snapshot = {
        "OGDC": {"market_cap_basic": 9.1e11, "price_earnings_ttm": 4.2, "average_volume_30d_calc": 1234.6},
        "EMPTY": {"market_cap_basic": None},
    }
    records = tv.fundamentals_records(snapshot, SESSION)
    assert len(records) == 1
    rec = records[0]
    assert rec["ticker"] == "OGDC" and rec["as_of"] == "2026-10-21"
    assert rec["market_cap"] == 9.1e11 and rec["pe_ratio"] == 4.2
    assert rec["avg_volume_30d"] == 1235 and rec["beta_1y"] is None
    assert set(rec) == {"ticker", "as_of", *tv.FUNDAMENTAL_FIELDS.values()}


# --- daily run: source selection ---------------------------------------------------

@pytest.fixture
def daily(monkeypatch):
    import ingest_daily_data as daily
    db = FakeDB({
        "halal_universe": [{"ticker": "A"}, {"ticker": "B"}],
        "price_history": [stored("A", "2026-10-20", 98.0, 900), stored("B", "2026-10-20", 48.0, 900)],
    })
    monkeypatch.setattr(daily, "supabase", db)
    monkeypatch.setattr(common, "supabase", db)
    monkeypatch.setattr(daily, "get_active_tickers", lambda: ["A", "B"])
    monkeypatch.setattr(daily, "get_latest_trade_date", lambda t: date(2026, 10, 20))
    monkeypatch.setattr(daily, "now_pkt", lambda: datetime(2026, 10, 21, 18, tzinfo=common.PKT))
    monkeypatch.setattr(daily, "newest_stored_date", lambda: date(2026, 10, 21))
    upserted = []
    monkeypatch.setattr(daily, "upsert_price_records", upserted.extend)
    monkeypatch.setattr(tv, "scan_dropping_unknown", lambda t, f: ({"A": {"price_earnings_ttm": 5.0}}, []))
    return daily, db, upserted


def test_daily_falls_back_to_tradingview_when_psx_blocks(daily, monkeypatch):
    daily, db, upserted = daily
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (None, list(t), True))
    monkeypatch.setattr(tv, "scan", lambda t, f: {"A": bar(100.0), "B": bar(50.0)})

    assert daily.main() == 0
    assert sorted(r["ticker"] for r in upserted) == ["A", "B"]
    assert all(r["trade_date"] == "2026-10-21" for r in upserted)
    (stats,) = [c for c in db.ops("upsert") if c.table == "company_stats"]
    assert stats.payload[0]["pe_ratio"] == 5.0


def test_daily_fails_when_both_sources_fail(daily, monkeypatch):
    daily, _, upserted = daily
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (None, list(t), True))

    def down(t, f):
        raise httpx.ConnectError("unreachable")

    monkeypatch.setattr(tv, "scan", down)
    assert daily.main() == 1
    assert upserted == []


def test_daily_uses_psx_alone_when_it_works(daily, monkeypatch):
    daily, _, _ = daily
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (date(2026, 10, 21), [], False))

    def must_not_run(t, f):
        raise AssertionError("TradingView prices fetched although PSX worked")

    monkeypatch.setattr(tv, "scan", must_not_run)
    assert daily.main() == 0


def test_daily_fundamentals_failure_only_warns(daily, monkeypatch, capsys):
    daily, _, _ = daily
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (date(2026, 10, 21), [], False))

    def down(t, f):
        raise httpx.ConnectError("unreachable")

    monkeypatch.setattr(tv, "scan_dropping_unknown", down)
    assert daily.main() == 0
    assert "::warning::Fundamentals refresh failed" in capsys.readouterr().out


def test_daily_flags_stale_data(daily, monkeypatch):
    daily, _, _ = daily
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (None, [], False))
    monkeypatch.setattr(daily, "newest_stored_date", lambda: date(2026, 9, 23))
    assert daily.main() == 1


def test_daily_never_stores_a_live_session_from_tradingview(daily, monkeypatch):
    daily, _, upserted = daily
    monkeypatch.setattr(daily, "now_pkt", lambda: datetime(2026, 10, 21, 11, tzinfo=common.PKT))
    monkeypatch.setattr(daily, "ingest_prices", lambda t, s: (None, list(t), True))

    def must_not_run(t, f):
        raise AssertionError("TradingView prices fetched during market hours")

    monkeypatch.setattr(tv, "scan", must_not_run)
    daily.main()
    assert upserted == []
