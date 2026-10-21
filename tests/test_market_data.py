"""Offline tests for PSX's daily file and SCS Trade parsing, using real sample lines."""
import io
import zipfile
from datetime import date

import httpx
import pytest

import market_data as md

DAY = date(2026, 10, 20)

# Verbatim lines from PSX's 2026-10-20 file (closing11.lis)
SAMPLE = "\n".join([
    "20OCT2026|AABS|0826|Al-Abbas Sugar|680.0|721|680|701.71|314|703.5|||",
    "20OCT2026|AGHA|0808|Agha Steel Ind.|6.73|6.73|6.43|6.45|776331|6.65|||",
    "20OCT2026|AGHA-OCT|40|Agha Steel Ind.|6.61|6.61|6.48|6.51|136000|6.69|||",
    "20OCT2026|LUCK|0804|Lucky Cement|400.34|403.9|396.6|398.05|304340|400.34|||",
    "20OCT2026|OGDC|0820|Oil & Gas DevXD|299.4|302.45|298.1|300.01|1247337|299.47|||",
    "19OCT2026|STALE|0804|Wrong Day|1|1|1|1|1|1|||",
    "garbage line",
])


def test_parse_market_summary():
    bars = md.parse_market_summary(SAMPLE, DAY)
    assert set(bars) == {"AABS", "AGHA", "LUCK", "OGDC"}  # futures and other dates skipped
    assert bars["OGDC"] == {"open": 299.4, "high": 302.45, "low": 298.1, "close": 300.01,
                            "volume": 1247337, "ldcp": 299.47, "sector_code": "0820"}


class FakeHTTP:
    def __init__(self, responses):
        self.responses, self.calls = responses, []

    def get(self, url):
        self.calls.append(url)
        return self.responses.pop(0)

    def post(self, url, json):
        self.calls.append((url, json))
        return self.responses.pop(0)


def response(status, content=b"", json_body=None):
    req = httpx.Request("GET", "https://example")
    if json_body is not None:
        return httpx.Response(status, json=json_body, request=req)
    return httpx.Response(status, content=content, request=req)


def zipped(text):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("closing11.lis", text)
    return buf.getvalue()


def test_fetch_market_summary_unzips(monkeypatch):
    http = FakeHTTP([response(200, zipped(SAMPLE))])
    bars = md.fetch_market_summary(http, DAY)
    assert bars["LUCK"]["close"] == 398.05
    assert http.calls == ["https://dps.psx.com.pk/download/mkt_summary/2026-10-20.Z"]


@pytest.mark.parametrize("resp", [
    response(404, b"not found"),
    response(200, b"<!DOCTYPE html><html>no file</html>"),  # error page instead of a zip
])
def test_missing_market_summary_is_none(resp):
    assert md.fetch_market_summary(FakeHTTP([resp]), DAY) is None


def test_market_summary_retries_server_errors(monkeypatch):
    monkeypatch.setattr(md.time, "sleep", lambda s: None)
    http = FakeHTTP([response(503), response(200, zipped(SAMPLE))])
    assert "LUCK" in md.fetch_market_summary(http, DAY)


def test_parse_scs_uses_pkt_dates():
    # Verbatim shape from SCS Trade; 1792436400000 ms = midnight 2026-10-20 PKT
    payload = {"d": [
        {"trading_Date": "/Date(1792436400000)/", "trading_open": 299.40, "trading_high": 302.45,
         "trading_low": 298.10, "trading_close": 300.01, "trading_vol": 1247337, "trading_change": 0.54},
        {"trading_Date": "/Date(1792350000000)/", "trading_open": 299.10, "trading_high": 301.20,
         "trading_low": 298.00, "trading_close": 299.47, "trading_vol": 957687, "trading_change": 0.37},
        {"trading_Date": "bad"},
    ]}
    bars = md.parse_scs(payload)
    assert set(bars) == {"2026-10-20", "2026-10-19"}
    assert bars["2026-10-20"]["close"] == 300.01 and bars["2026-10-20"]["volume"] == 1247337


def test_fetch_scs_history_request(monkeypatch):
    http = FakeHTTP([response(200, json_body={"d": []})])
    md.fetch_scs_history(http, "OGDC", date(2026, 9, 24), DAY)
    url, body = http.calls[0]
    assert url == md.SCS_URL
    assert body["par"] == "OGDC" and body["date1"] == "09/24/2026" and body["date2"] == "10/20/2026"
    assert body["rows"] >= 26


@pytest.mark.parametrize("a, b, agree", [
    (300.01, 300.01, True),
    (300.01, 301.0, True),     # within 0.5%
    (300.01, 303.0, False),
    (1.00, 1.01, True),        # one-paisa rounding on a cheap share
    (300.0, None, False),
    (0, 0, False),
])
def test_closes_agree(a, b, agree):
    assert md.closes_agree(a, b) is agree
