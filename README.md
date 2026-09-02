# PSX Halal Tracker

A zero-cost, Shariah-compliant stock tracking assistant for the Pakistan Stock Exchange (PSX).
This is Phase 1, which focuses on automated, serverless data ingestion.

## Architecture
- **Language**: Python 3
- **Data Source**: `psxdata` package (scraping PSX public portal)
- **Database**: Supabase (PostgreSQL)
- **Automation**: GitHub Actions (Daily Cron Schedule)

## Setup Instructions

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com/) and create a new project.
   - Run the SQL script located in `db/schema.sql` in the Supabase SQL Editor to create the required tables.

2. **Local Development Setup**:
   - Clone this repository.
   - Create a virtual environment and install dependencies: `pip install -r requirements.txt`
   - Copy `.env.example` to `.env` and fill in your Supabase URL and Service Role Key.

3. **Initialize the Halal Universe**:
   - For Phase 1, we seed the `halal_universe` table with KMI-30 constituents. 
   - Run `python scripts/update_universe.py` to populate the universe table.

4. **Historical Backfill**:
   - Run `python scripts/backfill_historical.py` to pull 6 months of historical OHLCV data for all tickers in the halal universe.

5. **Deploy to GitHub Actions**:
   - Push your code to GitHub.
   - Go to repository Settings -> Secrets and variables -> Actions.
   - Add two repository secrets: `SUPABASE_URL` and `SUPABASE_KEY`.
   - The workflow `.github/workflows/daily_ingestion.yml` will now automatically run daily at 5:00 PM PKT to ingest new data.
