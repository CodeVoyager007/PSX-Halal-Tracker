"""
Emails each subscribed user a digest of their watchlist for the latest market date.

Runs after the daily indicators step. Safe to re-run: digest_log records one row
per user per market date, so nobody is emailed twice for the same data, and a
market holiday (no new date) sends nothing.

Environment:
  RESEND_API_KEY  Resend API key. If unset the step is skipped, so the data
                  pipeline works before email is configured.
  DIGEST_FROM     Sender, e.g. "PSX Halal Tracker <digest@yourdomain.com>"
  APP_URL         Public web app URL used for dashboard and unsubscribe links
"""
import argparse
import os
import sys
import time
from collections import defaultdict
from datetime import date
from pathlib import Path

import httpx

from common import supabase, fetch_all, now_pkt
from digest_email import render_digest

RESEND_BATCH_URL = "https://api.resend.com/emails/batch"
BATCH_SIZE = 100            # Resend's maximum emails per batch request
SECONDS_BETWEEN_BATCHES = 1  # stays under Resend's per-second request limit
WEEKLY_SEND_WEEKDAY = 4      # Friday, after the week's last session
# Never send data older than this; it means ingestion is broken
MAX_DATA_AGE_DAYS = 7


def select_recipients(profiles, watchlists, already_sent, today: date) -> list[dict]:
    """Subscribed users due a digest today who have a watchlist and were not yet sent this date."""
    tickers_by_user = defaultdict(list)
    for row in watchlists:
        tickers_by_user[row["user_id"]].append(row["ticker"])

    recipients = []
    for p in profiles:
        weekly = p["digest_frequency"] == "weekly"
        if weekly and today.weekday() != WEEKLY_SEND_WEEKDAY:
            continue
        if p["id"] in already_sent or not tickers_by_user.get(p["id"]):
            continue
        recipients.append({**p, "weekly": weekly, "tickers": sorted(tickers_by_user[p["id"]])})
    return recipients


def build_email(recipient: dict, snapshot_by_ticker: dict, market_date: str,
                sender: str, app_url: str) -> dict | None:
    rows = [snapshot_by_ticker[t] for t in recipient["tickers"] if t in snapshot_by_ticker]
    if not rows:
        return None
    unsubscribe_url = f"{app_url}/unsubscribe?token={recipient['unsubscribe_token']}"
    subject, html, text = render_digest(rows, market_date, recipient["weekly"], app_url, unsubscribe_url)
    return {
        "from": sender,
        "to": [recipient["email"]],
        "subject": subject,
        "html": html,
        "text": text,
        # One-click unsubscribe (RFC 8058), required by Gmail and Yahoo for bulk senders
        "headers": {
            "List-Unsubscribe": f"<{app_url}/api/unsubscribe?token={recipient['unsubscribe_token']}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def send_batches(client: httpx.Client, api_key: str, emails: list[tuple[str, dict]]) -> dict[str, str | None]:
    """Send (user_id, email) pairs. Returns user_id -> None on success or an error message."""
    results: dict[str, str | None] = {}
    for i in range(0, len(emails), BATCH_SIZE):
        if i:
            time.sleep(SECONDS_BETWEEN_BATCHES)
        batch = emails[i:i + BATCH_SIZE]
        try:
            resp = client.post(
                RESEND_BATCH_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=[email for _, email in batch],
                timeout=30,
            )
            resp.raise_for_status()
            error = None
        except Exception as e:
            error = str(e)[:500]
            print(f"  Batch {i // BATCH_SIZE + 1} failed: {error}")
        for user_id, _ in batch:
            results[user_id] = error
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Send watchlist digest emails.")
    parser.add_argument("--dry-run", metavar="DIR",
                        help="write each email as an .html file into DIR instead of sending or logging")
    args = parser.parse_args()

    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("DIGEST_FROM", "PSX Halal Tracker <onboarding@resend.dev>")
    app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")

    if not args.dry_run and not api_key:
        print("RESEND_API_KEY is not set; skipping digests.")
        return 0

    now = now_pkt()
    print(f"Preparing digests at {now.isoformat()}")

    snapshot = fetch_all(lambda: supabase.table("latest_snapshot").select("*").order("ticker"))
    dates = [r["trade_date"] for r in snapshot if r.get("trade_date")]
    if not dates:
        print("ERROR: latest_snapshot has no price data.")
        return 1
    market_date = max(dates)
    if (now.date() - date.fromisoformat(market_date)).days > MAX_DATA_AGE_DAYS:
        print(f"ERROR: newest market data is from {market_date}; not sending stale digests.")
        return 1

    profiles = fetch_all(lambda: supabase.table("profiles")
                         .select("id, email, digest_frequency, unsubscribe_token")
                         .eq("digest_enabled", True).order("id"))
    watchlists = fetch_all(lambda: supabase.table("watchlists")
                           .select("user_id, ticker").order("user_id").order("ticker"))
    already_sent = {r["user_id"] for r in fetch_all(lambda: supabase.table("digest_log")
                    .select("user_id").eq("digest_date", market_date).eq("status", "sent").order("user_id"))}

    recipients = select_recipients(profiles, watchlists, already_sent, now.date())
    snapshot_by_ticker = {r["ticker"]: r for r in snapshot}
    emails = [(r["id"], e) for r in recipients
              if (e := build_email(r, snapshot_by_ticker, market_date, sender, app_url))]
    print(f"Market date {market_date}: {len(emails)} digest(s) to send "
          f"({len(profiles)} subscribed, {len(already_sent)} already sent).")

    if args.dry_run:
        out = Path(args.dry_run)
        out.mkdir(parents=True, exist_ok=True)
        for user_id, email in emails:
            (out / f"{user_id}.html").write_text(email["html"], encoding="utf-8")
            print(f"  {email['to'][0]}: {email['subject']}")
        print(f"Dry run: wrote {len(emails)} file(s) to {out}.")
        return 0

    if not emails:
        return 0

    with httpx.Client() as client:
        results = send_batches(client, api_key, emails)

    log_rows = [
        {"user_id": user_id, "digest_date": market_date,
         "status": "failed" if error else "sent", "error": error}
        for user_id, error in results.items()
    ]
    for i in range(0, len(log_rows), BATCH_SIZE):
        supabase.table("digest_log").upsert(log_rows[i:i + BATCH_SIZE], on_conflict="user_id,digest_date").execute()

    failed = sum(1 for e in results.values() if e)
    print(f"Sent {len(results) - failed} digest(s); {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
