# PSX Halal Tracker

Follow Shariah-compliant Pakistan Stock Exchange (PSX) companies and get a daily or weekly email about the ones you pick.

Users sign in with an email link, build a watchlist from the ~300 companies in the KMI All-Share index, and receive a digest after each trading day with closing prices, biggest movers, unusual volume and RSI extremes.

## Architecture

| Part | Where | What it does |
|---|---|---|
| Data pipeline | `scripts/`, GitHub Actions | Scrapes PSX with `psxdata` (TradingView as fallback), stores prices and fundamentals, computes indicators, sends digests |
| Database & auth | Supabase (Postgres) | Market data, users, watchlists; Row Level Security keeps each user's data private |
| Web app | `web/` (Next.js), Vercel | Sign-in, watchlist picker, dashboard, stock charts, unsubscribe |
| Email | Resend | Digest delivery, and sign-in emails via Supabase custom SMTP |

Market data is fetched and computed **once** for every halal stock; each user's digest is just a filter over it, so cost barely changes with user count.

**Scheduled jobs**
- `daily_ingestion.yml` (weekdays, 5:17 PM PKT, with a backup run at 8:17 PM): ingest prices and fundamentals → compute indicators → send digests.
- `universe_refresh.yml` (Sundays): sync `halal_universe` with the KMI All-Share index. Companies that leave the index are soft-deleted (history kept, no longer offered or ingested); new ones are backfilled by the next daily run.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com/).
2. In the SQL Editor, run `db/schema.sql`. It is safe to re-run after changes.
3. **Authentication → URL Configuration:** set *Site URL* to your web app URL and add `https://<your-app>/auth/callback` (and `http://localhost:3000/auth/callback` for development) to *Redirect URLs*.
4. **Authentication → SMTP Settings:** enable custom SMTP using Resend (`smtp.resend.com`, port 465, user `resend`, password = your Resend API key). Supabase's built-in email is limited to a few messages per hour and is not meant for real users.

### 2. Resend (email)
1. Create an account at [resend.com](https://resend.com/) and verify a sending domain.
2. Create an API key.

The free tier covers roughly 100 emails per day; beyond that, digests need a paid plan.

### 3. GitHub Actions
In **Settings → Secrets and variables → Actions**, add:

| Type | Name | Value |
|---|---|---|
| Secret | `SUPABASE_URL` | Project URL |
| Secret | `SUPABASE_KEY` | **service_role** key (bypasses RLS; never use it in the web app) |
| Secret | `RESEND_API_KEY` | Resend API key (digests are skipped until set) |
| Variable | `DIGEST_FROM` | e.g. `PSX Halal Tracker <digest@yourdomain.com>` |
| Variable | `APP_URL` | Your web app URL, e.g. `https://psx-halal.vercel.app` |
| Secret | `PSX_PROXY_URL` | *Optional but recommended*, see [PSX blocks GitHub's servers](#psx-blocks-githubs-servers) |

### 4. Load the data (once)
Locally, with `.env` filled in from `.env.example`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
python scripts/update_universe.py          # ~313 KMI All-Share companies
python scripts/backfill_historical.py      # 12 months of prices (--days N to change)
python scripts/compute_indicators_backfill.py
```

Alternatively, run the *Weekly Universe Refresh* workflow manually, then *Daily Data Ingestion*, which backfills any company with no history.

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

## PSX blocks GitHub's servers

PSX's data portal (`dps.psx.com.pk`) refuses connections from many datacenter IP ranges, GitHub Actions runners included, while answering Pakistani home and office connections normally. So the scripts work on your own machine in Pakistan but not on GitHub. (From early October 2026, every scheduled run hit the 60-minute timeout because of this.)

The daily run handles it like this:

1. It tries PSX first. If 5 tickers in a row fail, PSX is refusing the connection, so the run stops trying within seconds instead of grinding through ~300 doomed requests.
2. It then falls back to **TradingView's** public screener, which returns the latest session's bar for every ticker in one request. The run passes, with a warning on the run page.
3. It refreshes fundamentals (market cap, P/E, EPS, dividend yield, beta) from TradingView either way.

The fallback cannot fill **gaps**, because it only has the latest bar. Missed days are filled by the next run that can reach PSX: it re-fetches from a week before each ticker's last stored day. To get full history on GitHub as well, pick one:

- **Proxy (recommended):** set the `PSX_PROXY_URL` secret to an HTTP proxy on a Pakistani connection, e.g. `http://user:pass@host:3128` (Squid or tinyproxy on a small Pakistani VPS, or a residential-proxy provider with Pakistani exit IPs). Only PSX traffic goes through it. This also fixes the weekly universe refresh, which has no fallback because only PSX publishes KMI membership.
- **Occasional local catch-up:** from a Pakistani connection, run
  ```bash
  python scripts/ingest_daily_data.py        # fills every missed day (from a week before each ticker's last stored day)
  python scripts/compute_indicators_backfill.py   # only after a gap longer than ~6 weeks
  python scripts/update_universe.py          # when KMI constituents change (January/July)
  ```
  The daily indicator step recomputes each ticker's last 30 sessions, so after a shorter gap the next scheduled run fixes the indicators by itself.

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

- `ingest_daily_data.py` re-fetches each ticker from a week before its latest stored date, so a missed or delayed run fills its own gap. A ticker with no history gets a 12-month backfill. If PSX refuses the runner, it stores the latest session's bar from TradingView instead (see above).
- The latest session is worked out in PKT, so a run GitHub delays past midnight still labels the bar with the right day. A TradingView snapshot that just repeats the last stored session is treated as a market holiday and stores nothing.
- Today's row is only stored after 5 PM PKT; before that PSX data is still intraday. Rows `psxdata` flags as anomalous are skipped.
- `compute_indicators_daily.py` computes indicators for each ticker's latest date and ranks `trending_score` across active tickers.
- `send_digests.py` emails every subscribed user with a non-empty watchlist (weekly subscribers on Fridays). `digest_log` records one row per user per market date, so re-runs never send duplicates and market holidays send nothing.
- `compute_indicators_daily.py` rewrites each ticker's last 30 sessions, so days filled in late get indicators too.
- Any failure, or a newest stored price more than 7 days old, fails the run, so GitHub emails the repository owner. Using the TradingView fallback only adds a warning; the run still passes.
- Output is unbuffered (`PYTHONUNBUFFERED`), so the Actions log shows each ticker as it is processed.

## Keeping the free tier alive

- **Supabase** pauses free projects after about a week of inactivity. The weekday pipeline and user activity keep it awake; if it does pause, restore it from the dashboard. The paid plan removes pausing.
- **GitHub** disables scheduled workflows after 60 days without repository activity. The daily workflow re-enables itself on each scheduled run.

## Before charging users

- **Data licensing:** redistributing PSX market data commercially generally requires an agreement with PSX. The TradingView fallback is an unofficial endpoint covered by TradingView's terms; for a paid product, license a feed.
- **Regulation:** the app presents information only (no buy/sell recommendations). Review SECP's Research Analyst Regulations before adding signals or advice.
- **Payments:** Stripe does not support Pakistan-registered businesses; use a local gateway such as Safepay, PayFast or JazzCash.
