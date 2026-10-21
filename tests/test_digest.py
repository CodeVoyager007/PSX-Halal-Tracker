"""Offline tests for digest selection, rendering and sending."""
from datetime import date

import smtplib

import httpx
import pytest

import send_digests
from digest_email import render_digest, notes_for

MARKET_DATE = "2026-09-22"


def snap(ticker, change, close=100.0, **kw):
    return {"ticker": ticker, "company_name": f"{ticker} Ltd", "trade_date": MARKET_DATE,
            "close_price": close, "change_1d_pct": change, "price_change_5d_pct": change,
            "rsi_14": 50, "volume_spike_ratio": 1.0, **kw}


def profile(uid, freq="daily"):
    return {"id": uid, "email": f"{uid}@example.com", "digest_frequency": freq, "unsubscribe_token": f"tok-{uid}"}


# --- selection --------------------------------------------------------------

def test_select_recipients_rules():
    profiles = [profile("daily"), profile("weekly", "weekly"), profile("sent"), profile("empty")]
    watch = [{"user_id": u, "ticker": "OGDC"} for u in ("daily", "weekly", "sent")]
    tuesday, friday = date(2026, 9, 22), date(2026, 9, 25)

    on_tuesday = send_digests.select_recipients(profiles, watch, {"sent"}, tuesday)
    assert [r["id"] for r in on_tuesday] == ["daily"]  # weekly waits, sent skipped, empty skipped

    on_friday = send_digests.select_recipients(profiles, watch, {"sent"}, friday)
    assert {r["id"]: r["weekly"] for r in on_friday} == {"daily": False, "weekly": True}


def test_build_email_skips_user_whose_tickers_have_no_data():
    r = {**profile("u"), "weekly": False, "tickers": ["GONE"]}
    assert send_digests.build_email(r, {}, MARKET_DATE, "from@x", "https://app") is None


def test_build_email_has_one_click_unsubscribe():
    r = {**profile("u"), "weekly": False, "tickers": ["OGDC"]}
    email = send_digests.build_email(r, {"OGDC": snap("OGDC", 1.5)}, MARKET_DATE, "from@x", "https://app")
    assert email["to"] == ["u@example.com"]
    assert email["headers"]["List-Unsubscribe"] == "<https://app/api/unsubscribe?token=tok-u>"
    assert "https://app/unsubscribe?token=tok-u" in email["html"]


# --- rendering --------------------------------------------------------------

def test_render_sorts_by_biggest_move_and_summarises_in_subject():
    rows = [snap("SMALL", 0.5), snap("DOWN", -4.0), snap("UP", 2.0), snap("NONE", None)]
    subject, html, text = render_digest(rows, MARKET_DATE, False, "https://app", "https://app/u")
    assert subject.endswith("DOWN -4.00%, UP +2.00%, SMALL +0.50%")
    assert text.index("DOWN") < text.index("UP") < text.index("SMALL") < text.index("NONE")


def test_render_escapes_company_names():
    _, html, _ = render_digest([snap("X", 1.0, company_name="<script>A&B</script>")],
                               MARKET_DATE, False, "https://app", "https://app/u")
    assert "<script>" not in html and "&lt;script&gt;A&amp;B" in html


def test_notes_are_factual():
    row = snap("X", 1.0, rsi_14=75, volume_spike_ratio=3.2, trade_date="2026-09-18")
    notes = notes_for(row, MARKET_DATE)
    assert notes == ["Not traded on Tue 22 Sep 2026; last traded Fri 18 Sep 2026",
                     "RSI 75 (above 70)", "Volume 3.2× its 20-day average"]
    text = " ".join(notes).lower()
    assert "buy" not in text and "sell" not in text


# --- sending ----------------------------------------------------------------

def test_send_batches_splits_and_records_failures(monkeypatch):
    monkeypatch.setattr(send_digests, "SECONDS_BETWEEN_BATCHES", 0)
    calls = []

    def handler(request):
        calls.append(request)
        # Fail the second batch only
        return httpx.Response(500 if len(calls) == 2 else 200, json={"data": []})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    emails = [(f"u{i}", {"to": [f"u{i}@x"]}) for i in range(150)]
    results = send_digests.send_batches(client, "key", emails)

    assert len(calls) == 2
    assert calls[0].headers["Authorization"] == "Bearer key"
    assert sum(e is None for e in results.values()) == 100
    assert results["u149"] is not None


# --- SMTP (Gmail) ---------------------------------------------------------------

def sample_email(to="u@example.com"):
    return {"from": "PSX Halal Tracker <me@gmail.com>", "to": [to], "subject": "Daily",
            "html": "<p>hi</p>", "text": "hi",
            "headers": {"List-Unsubscribe": "<https://app/api/unsubscribe?token=t>",
                        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}}


def test_to_mime_has_text_html_and_unsubscribe_headers():
    msg = send_digests.to_mime(sample_email())
    assert msg["To"] == "u@example.com" and msg["Subject"] == "Daily"
    assert msg["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert msg["Message-ID"].endswith("@gmail.com>")
    types = [part.get_content_type() for part in msg.iter_parts()]
    assert types == ["text/plain", "text/html"]


class FakeSMTP:
    instances = []

    def __init__(self, host, port, context=None, timeout=None):
        self.host, self.port, self.sent, self.logged_in = host, port, [], None
        FakeSMTP.instances.append(self)

    def login(self, user, password):
        if password == "wrong":
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
        self.logged_in = user

    def send_message(self, msg):
        if msg["To"] == "bounce@example.com":
            raise smtplib.SMTPRecipientsRefused({msg["To"]: (550, b"no such user")})
        self.sent.append(msg["To"])

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_send_smtp_reports_each_recipient(monkeypatch):
    monkeypatch.setattr(send_digests.smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(send_digests.time, "sleep", lambda s: None)
    results = send_digests.send_smtp("smtp.gmail.com", 465, "me@gmail.com", "app-pass",
                                     [("a", sample_email("a@example.com")), ("b", sample_email("bounce@example.com"))])
    assert results["a"] is None and "no such user" in results["b"]
    assert FakeSMTP.instances[-1].logged_in == "me@gmail.com"
    assert FakeSMTP.instances[-1].sent == ["a@example.com"]


def test_send_smtp_login_failure_fails_everyone(monkeypatch):
    monkeypatch.setattr(send_digests.smtplib, "SMTP_SSL", FakeSMTP)
    results = send_digests.send_smtp("smtp.gmail.com", 465, "me@gmail.com", "wrong",
                                     [("a", sample_email()), ("b", sample_email())])
    assert set(results) == {"a", "b"} and all("SMTP login failed" in e for e in results.values())
