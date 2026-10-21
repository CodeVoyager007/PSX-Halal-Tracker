# PSX Halal Tracker

Follow Shariah-compliant Pakistan Stock Exchange (PSX) companies and get a daily or weekly email about the ones you pick.

Users sign in with an email link, build a watchlist from the ~300 companies in the KMI All-Share index, and receive a digest after each trading day with closing prices, biggest movers, unusual volume and RSI extremes.

## Architecture

| Part | Where | What it does |
|---|---|---|
| Data pipeline | `scripts/`, GitHub Actions | Loads PSX's official daily files, verifies them against SCS Trade, stores prices and fundamentals, computes indicators, sends digests |
| Database & auth | Supabase (Postgres) | Market data, users, watchlists; Row Level Security keeps each user's data private |
| Web app | `web/` (Next.js), Vercel | Sign-in, watchlist picker, dashboard, stock charts, unsubscribe |
| Email | Gmail SMTP (free, no domain) or Resend | Digest delivery, and sign-in emails via Supabase custom SMTP |

Market data is fetched and computed **once** for every halal stock; each user's digest is just a filter over it, so cost barely changes with user count.

**Scheduled jobs**
- `daily_ingestion.yml` (weekdays, 5:17 PM PKT, with a backup run at 8:17 PM): ingest prices and fundamentals → compute indicators → send digests.
- `universe_refresh.yml` (Sundays): sync `halal_universe` with the KMI All-Share index. Companies that leave the index are soft-deleted (history kept, no longer offered or ingested); new ones are backfilled by the next daily run.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com/).
2. In the SQL Editor, run `db/schema.sql`. It is safe to re-run after changes.
3. **Authentication → URL Configuration:** set *Site URL* to your web app URL and add `https://<your-app>/auth/callback` (and `http://localhost:3000/auth/callback` for development) to *Redirect URLs*.
4. **Authentication → Emails → SMTP Settings:** turn on custom SMTP with your Gmail (see step 2): host `smtp.gmail.com`, port `465`, username = your Gmail address, password = the App Password, sender email = the same Gmail address, sender name `PSX Halal Tracker`. Supabase's built-in email allows only a few messages per hour, so sign-up stalls without this.

### 2. Email (Gmail, free, no domain needed)
1. On the Gmail account that will send the emails, turn on **2-Step Verification** (myaccount.google.com → Security).
2. Create an **App Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (name it "PSX Halal Tracker"). Google shows a 16-character password once; copy it.

Gmail sends up to about 500 emails a day from a personal account, which covers sign-in links plus a few hundred daily digests. Beyond that, move to a provider with a sending domain (Resend, Brevo); the digest script also accepts `RESEND_API_KEY`, or any SMTP server via `SMTP_HOST`/`SMTP_PORT`.

### 3. GitHub Actions
In **Settings → Secrets and variables → Actions**, add:

| Type | Name | Value |
|---|---|---|
| Secret | `SUPABASE_URL` | Project URL |
| Secret | `SUPABASE_KEY` | **service_role** key (bypasses RLS; never use it in the web app) |
| Secret | `SMTP_USER` | The Gmail address that sends the digests |
| Secret | `SMTP_PASSWORD` | Its 16-character App Password (digests are skipped until set) |
| Variable | `DIGEST_FROM` | Optional, e.g. `PSX Halal Tracker <you@gmail.com>` (defaults to the Gmail address) |
| Variable | `APP_URL` | Your web app URL, e.g. `https://psx-halal.vercel.app` |

### 4. Load the data (once)
Locally, with `.env` filled in from `.env.example`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
python scripts/update_universe.py          # ~313 KMI All-Share companies
python scripts/backfill_historical.py      # 12 months of prices (--days N to change)
python scripts/compute_indicators_backfill.py
```

Or skip the local step entirely: run the *Weekly Universe Refresh* workflow, then *Daily Data Ingestion*, which back-fills a year of history for any company that has none.

### 5. Web app (Vercel)
1. Import the repository in [Vercel](https://vercel.com/) and set the **Root Directory** to `web`.
2. Add environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the public anon/publishable key).
3. Deploy, then use the deployed URL for Supabase's Site URL and the `APP_URL` variable above.

## Development

```bash
# Pipeline tests (offline)
pytest

# Database schema and RLS tests (Postgres in WebAssembly, no server needed)
cd db/test && npm ci && npm test

# Web app
cd web && cp .env.example .env.local   # fill in URL and anon key
npm install && npm run dev

# Preview digest emails without sending anything
python scripts/send_digests.py --dry-run out/
```

CI (`ci.yml`) runs all three test suites and a production build of the web app on every push.

## Where prices come from

Everything runs on GitHub Actions; nothing is entered by hand.

| Role | Source | Notes |
|---|---|---|
| Prices (primary) | PSX's official daily market summary file, `dps.psx.com.pk/download/mkt_summary/<date>.Z` | One download per trading day holds every symbol's OHLCV, so any missed day, and a year of history for a new constituent, is filled by date |
| Verification | SCS Trade historical prices | Independent site; each new price is stored as verified when its close agrees within 0.5% |
| Latest session before PSX publishes its file | TradingView screener | Only after the 5 PM PKT cut-off, never for a live session |
| Fundamentals | TradingView screener | Market cap, P/E, EPS, dividend yield, beta, 52-week range |
| KMI All-Share membership | PSX's index page | Weekly |

PSX refuses GitHub's IP addresses on its per-symbol endpoints (`/historical`, `/symbols` return HTTP 403), which is what stopped the pipeline in October 2026; the daily files and index pages are still served. `python scripts/check_sources.py`, or the manual **Check Data Sources** workflow, re-checks every source from the runner.

Each stored price records its `source` (`psx` or `tradingview`) and `verified_with` (`scstrade`, `tradingview`, or empty when no second source confirmed it). A price that disagrees with SCS Trade is still stored from PSX, which is authoritative, but stays unverified and is listed in a warning on the run. The stock page shows the same: "PSX, confirmed by SCS Trade".

## What is stored per company

| Daily, from prices | Daily, from TradingView (`company_stats`) |
|---|---|
| OHLCV, 1-day and 5-day change | Market cap (PKR) |
| SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bollinger Bands | P/E and EPS (trailing 12 months) |
| 20-day average volume, volume spike ratio, trending score | Dividend yield |
| ATR 14 (average daily range) | 52-week high/low as reported |
| 52-week high/low, distance from the 52-week high | Beta (1 year), 30-day average volume |
| 1-month, 3-month and 1-year returns | |

All of it is exposed per ticker in the `latest_snapshot` view, which the web app's stock page reads.

## How the daily run works

- `ingest_daily_data.py` works out, per ticker, every trading day after its newest stored price (a year back for a ticker with none) and downloads PSX's file for each of those days. A missed run, a delayed run or a new constituent all fill themselves. Days without a file are market holidays.
- The latest session is worked out in PKT, so a run GitHub delays past midnight still files the bar under the right day. Before 5 PM PKT today's session is still trading and is never stored.
- If PSX has not yet published the latest session's file, that session comes from TradingView, marked provisional; later runs fetch that day again and replace it with PSX's official figures once the file is out.
- Every new price is checked against SCS Trade, and the latest session also against TradingView where SCS had nothing.
- `compute_indicators_daily.py` rewrites each ticker's last 30 sessions, and the whole history of a ticker that was just back-filled.
- `send_digests.py` emails every subscribed user with a non-empty watchlist (weekly subscribers on Fridays). `digest_log` records one row per user per market date, so re-runs never send duplicates and market holidays send nothing.
- Any failure, or a newest stored price more than 7 days old, fails the run, so GitHub emails the repository owner. Output is unbuffered, so the Actions log shows progress live.

## Keeping the free tier alive

- **Supabase** pauses free projects after about a week of inactivity. The weekday pipeline and user activity keep it awake; if it does pause, restore it from the dashboard. The paid plan removes pausing.
- **GitHub** disables scheduled workflows after 60 days without repository activity. The daily workflow re-enables itself on each scheduled run.

## Before charging users

- **Data licensing:** redistributing PSX market data commercially generally requires an agreement with PSX. SCS Trade and TradingView are unofficial endpoints covered by their own terms; for a paid product, license a feed.
- **Regulation:** the app presents information only (no buy/sell recommendations). Review SECP's Research Analyst Regulations before adding signals or advice.
- **Payments:** Stripe does not support Pakistan-registered businesses; use a local gateway such as Safepay, PayFast or JazzCash.
