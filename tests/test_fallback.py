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
        "OGDC": {"market_cap_basic": 9.1e11, "price_earnings_ttm": 4.2, "average_volume_30d_calc": 1234.6,
                 # first preference empty: the next populated variant is used
                 "dividends_yield_current": None, "dividends_yield": 7.5, "dividend_yield_recent": None},
        "EMPTY": {"market_cap_basic": None},
    }
    records = tv.fundamentals_records(snapshot, SESSION)
    assert len(records) == 1
    rec = records[0]
    assert rec["ticker"] == "OGDC" and rec["as_of"] == "2026-10-21"
    assert rec["market_cap"] == 9.1e11 and rec["pe_ratio"] == 4.2
    assert rec["avg_volume_30d"] == 1235 and rec["beta_1y"] is None
    assert rec["dividend_yield_pct"] == 7.5
    assert set(rec) == {"ticker", "as_of", *tv.FUNDAMENTAL_FIELDS}


def test_fundamental_fields_are_requested_once():
    fields = tv.fundamental_tv_fields()
    assert len(fields) == len(set(fields))
    assert {"dividends_yield_current", "dividends_yield", "dividend_yield_recent"} <= set(fields)


# --- daily run: sources, fallback and verification --------------------------------

LUCK_BAR = {"open": 400.34, "high": 403.9, "low": 396.6, "close": 398.05, "volume": 304340,
            "ldcp": 400.34, "sector_code": "0804"}


@pytest.fixture
def daily(monkeypatch):
    import ingest_daily_data as daily
    import market_data as md
    db = FakeDB({"price_history": [stored("A", "2026-10-19", 98.0, 900), stored("B", "2026-10-19", 48.0, 900)]})
    monkeypatch.setattr(daily, "supabase", db)
    monkeypatch.setattr(common, "supabase", db)
    monkeypatch.setattr(daily.time, "sleep", lambda s: None)
    monkeypatch.setattr(md.time, "sleep", lambda s: None)
    monkeypatch.setattr(daily, "get_active_tickers", lambda: ["A", "B"])
    monkeypatch.setattr(daily, "get_latest_trade_date", lambda t: date(2026, 10, 19))
    monkeypatch.setattr(daily, "now_pkt", lambda: datetime(2026, 10, 21, 18, tzinfo=common.PKT))
    monkeypatch.setattr(daily, "newest_stored_date", lambda: date(2026, 10, 21))
    monkeypatch.setattr(daily, "provisional_dates", lambda since: {})
    stored_rows = []
    monkeypatch.setattr(daily, "upsert_price_records", stored_rows.extend)
    monkeypatch.setattr(tv, "scan_dropping_unknown", lambda t, f: ({"A": {"price_earnings_ttm": 5.0}}, []))
    monkeypatch.setattr(tv, "scan", lambda t, f: {})  # tests stay offline; override per test
    # Default: PSX has files for both missing days; SCS agrees with everything
    files = {date(2026, 10, 20): {"A": bar(100.0), "B": bar(50.0)},
             date(2026, 10, 21): {"A": bar(101.0), "B": bar(51.0)}}
    monkeypatch.setattr(md, "fetch_market_summary", lambda http, day: files.get(day))
    scs = {}
    monkeypatch.setattr(md, "fetch_scs_history", lambda http, t, start, end: scs.get(t, {}))
    return daily, db, stored_rows, files, scs


def scs_bars(rows):
    return {d: {"close": c, "volume": 1000} for d, c in rows}


def test_daily_catches_up_every_missing_day_from_psx_files(daily):
    daily, db, stored_rows, files, scs = daily
    scs["A"] = scs_bars([("2026-10-20", 100.0), ("2026-10-21", 101.0)])
    scs["B"] = scs_bars([("2026-10-20", 50.0), ("2026-10-21", 51.3)])  # disagrees on 21st

    assert daily.main() == 0
    got = {(r["ticker"], r["trade_date"]): r for r in stored_rows}
    assert set(got) == {("A", "2026-10-20"), ("A", "2026-10-21"), ("B", "2026-10-20"), ("B", "2026-10-21")}
    assert all(r["source"] == "psx" for r in stored_rows)
    assert got[("A", "2026-10-21")]["verified_with"] == "scstrade"
    assert got[("B", "2026-10-20")]["verified_with"] == "scstrade"
    assert got[("B", "2026-10-21")]["verified_with"] is None  # mismatch: kept, flagged
    (stats,) = [c for c in db.ops("upsert") if c.table == "company_stats"]
    assert stats.payload[0]["pe_ratio"] == 5.0


def test_daily_skips_holidays_without_failing(daily):
    daily, _, stored_rows, files, _ = daily
    del files[date(2026, 10, 20)]  # no file: market shut
    assert daily.main() == 0
    assert {r["trade_date"] for r in stored_rows} == {"2026-10-21"}


def test_daily_takes_unpublished_session_from_tradingview(daily, monkeypatch):
    daily, _, stored_rows, files, _ = daily
    del files[date(2026, 10, 21)]  # PSX has not published today's file yet
    monkeypatch.setattr(tv, "scan", lambda t, f: {"A": bar(101.0), "B": bar(51.0)})

    assert daily.main() == 0
    sources = {(r["ticker"], r["trade_date"]): r["source"] for r in stored_rows}
    assert sources[("A", "2026-10-20")] == "psx"
    assert sources[("A", "2026-10-21")] == "tradingview"


def test_daily_never_stores_a_live_session_from_tradingview(daily, monkeypatch):
    daily, _, stored_rows, files, _ = daily
    monkeypatch.setattr(daily, "now_pkt", lambda: datetime(2026, 10, 21, 11, tzinfo=common.PKT))
    files[date(2026, 10, 20)] = None  # yesterday's file missing too: only TradingView could help

    def must_not_run(t, f):
        raise AssertionError("TradingView used during market hours")

    monkeypatch.setattr(tv, "scan", must_not_run)
    daily.main()
    assert stored_rows == []


def test_tradingview_checks_what_scs_could_not(daily, monkeypatch):
    daily, _, stored_rows, _, scs = daily
    monkeypatch.setattr(tv, "scan", lambda t, f: {"A": {"close": 101.0}, "B": {"close": 60.0}})
    assert daily.main() == 0
    today = {r["ticker"]: r["verified_with"] for r in stored_rows if r["trade_date"] == "2026-10-21"}
    assert today == {"A": "tradingview", "B": None}


def test_daily_stops_after_repeated_psx_failures(daily, monkeypatch):
    daily, _, stored_rows, _, _ = daily
    import market_data as md
    calls = []

    def down(http, day):
        calls.append(day)
        raise httpx.ConnectError("unreachable")

    monkeypatch.setattr(md, "fetch_market_summary", down)
    monkeypatch.setattr(daily, "get_latest_trade_date", lambda t: date(2026, 9, 1))
    monkeypatch.setattr(tv, "scan", lambda t, f: {"A": bar(101.0), "B": bar(51.0)})
    assert daily.main() == 1
    assert len(calls) == daily.MAX_CONSECUTIVE_FAILURES
    # The latest session still comes from TradingView
    assert {r["trade_date"] for r in stored_rows} == {"2026-10-21"}


def test_new_ticker_gets_a_year_of_history(daily, monkeypatch):
    daily, _, stored_rows, files, _ = daily
    monkeypatch.setattr(daily, "get_active_tickers", lambda: ["NEW"])
    monkeypatch.setattr(daily, "get_latest_trade_date", lambda t: None)
    days = []
    import market_data as md
    monkeypatch.setattr(md, "fetch_market_summary", lambda http, day: days.append(day) or {"NEW": bar(10.0)})
    assert daily.main() == 0
    assert min(days) >= date(2025, 10, 21) and max(days) == date(2026, 10, 21)
    assert len(stored_rows) == len(days) > 250


def test_daily_flags_stale_data(daily, monkeypatch):
    daily, _, _, files, _ = daily
    files.clear()
    monkeypatch.setattr(tv, "scan", lambda t, f: {})
    monkeypatch.setattr(daily, "newest_stored_date", lambda: date(2026, 9, 23))
    assert daily.main() == 1


def test_provisional_tradingview_days_are_replaced_by_psx(daily, monkeypatch):
    daily, _, stored_rows, files, _ = daily
    # Everything is stored through the 21st, but the 21st came from TradingView
    monkeypatch.setattr(daily, "get_latest_trade_date", lambda t: date(2026, 10, 21))
    monkeypatch.setattr(daily, "provisional_dates", lambda since: {"A": date(2026, 10, 21)})
    assert daily.main() == 0
    assert [(r["ticker"], r["trade_date"], r["source"]) for r in stored_rows] == [("A", "2026-10-21", "psx")]


def test_prices_are_stored_before_verification(daily, monkeypatch):
    daily, _, stored_rows, _, _ = daily
    import market_data as md

    def scs_crash(http, t, start, end):
        assert stored_rows, "prices must already be stored when verification starts"
        raise RuntimeError("SCS down")

    monkeypatch.setattr(md, "fetch_scs_history", scs_crash)
    assert daily.main() == 0
    assert {(r["ticker"], r["trade_date"]) for r in stored_rows} == {
        ("A", "2026-10-20"), ("A", "2026-10-21"), ("B", "2026-10-20"), ("B", "2026-10-21")}
