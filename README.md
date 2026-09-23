# PSX Halal Tracker

A zero-cost, Shariah-compliant stock tracking assistant for the Pakistan Stock Exchange (PSX).
This is Phase 1, which focuses on automated, serverless data ingestion.

## Architecture
- **Language**: Python 3.14
- **Data Source**: `psxdata` package (scraping PSX public portal)
- **Database**: Supabase (PostgreSQL)
- **Automation**: GitHub Actions (Daily Cron Schedule)

## Setup Instructions

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com/) and create a new project.
   - Run the SQL script located in `db/schema.sql` in the Supabase SQL Editor. It is safe to re-run after schema changes.
   - The schema enables Row Level Security with no policies, so the public anon key cannot read or write anything. The scripts use the service_role key, which bypasses RLS.

2. **Local Development Setup**:
   - Clone this repository.
   - Create a virtual environment and install dependencies: `pip install -r requirements.txt -r requirements-dev.txt`
   - Copy `.env.example` to `.env` and fill in your Supabase URL and **service_role** key.
   - Run the offline tests: `pytest`

3. **Initialize the Halal Universe**:
   - For Phase 1, the `halal_universe` table holds the KMI-30 constituents.
   - Run `python scripts/update_universe.py`. It fetches the live KMI-30 list from PSX, falling back to the manual list in the script if PSX is unreachable.
   - Re-run it after each KMI-30 reconstitution: tickers that left the index are marked inactive (only when the live list was fetched).

4. **Historical Backfill**:
   - Run `python scripts/backfill_historical.py` to pull 12 months of OHLCV data for every active ticker (`--days N` to change the window).
   - Then run `python scripts/compute_indicators_backfill.py` to compute technical indicators and trending scores for that history.

5. **Deploy to GitHub Actions**:
   - Push your code to GitHub.
   - Go to repository Settings -> Secrets and variables -> Actions.
   - Add two repository secrets: `SUPABASE_URL` and `SUPABASE_KEY` (service_role).
   - The workflow `.github/workflows/daily_ingestion.yml` runs every weekday at 5:00 PM PKT.

## How the daily run works

- `ingest_daily_data.py` re-fetches each ticker from a week before its latest stored date, so a missed or delayed run fills its own gap. A ticker with no history gets a 12-month backfill.
- Today's row is only stored after 5:00 PM PKT; before that PSX data is still intraday.
- Rows that `psxdata` flags as anomalous are skipped.
- `compute_indicators_daily.py` then computes indicators for each ticker's latest date and ranks `trending_score` across active tickers.
- Any failure, or a newest stored price more than 7 days old, fails the workflow run, so GitHub emails you instead of the pipeline going silently stale.

## Keeping the free tier alive

- **Supabase** pauses free projects after about a week of inactivity. The weekday pipeline keeps it active; if a project is paused, restore it from the Supabase dashboard.
- **GitHub** disables scheduled workflows after 60 days without repository activity. The workflow's last step re-enables itself on each scheduled run to prevent this. If it ever stops, re-enable it from the Actions tab.
