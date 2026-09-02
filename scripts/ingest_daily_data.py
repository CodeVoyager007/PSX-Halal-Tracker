import os
import psxdata
from supabase import create_client, Client
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase client
# Ensure credentials are read from environment variables, never hardcoded.
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def main():
    print(f"Starting daily ingestion at {datetime.utcnow().isoformat()} UTC")
    
    # 1. Fetch active tickers from the halal_universe
    # This applies the Shariah compliance filter by only processing tickers marked active.
    response = supabase.table("halal_universe").select("ticker").eq("is_active", True).execute()
    
    if not response.data:
        print("No active tickers found in the halal_universe. Exiting.")
        return
        
    tickers = [row["ticker"] for row in response.data]
    print(f"Found {len(tickers)} active tickers in the universe.")
    
    today = datetime.now().strftime("%Y-%m-%d")
    
    # 2. Iterate and scrape data for each active ticker
    for ticker in tickers:
        print(f"Processing {ticker}...")
        try:
            # Fetch data using psxdata for the current day.
            # Using start and end as today to fetch only the latest available record.
            df = psxdata.stocks(ticker, start=today, end=today)
            
            if df is None or df.empty:
                print(f"  No data returned for {ticker} on {today}. It might be halted or not traded today.")
                continue
                
            # Process the dataframe. psxdata returns a pandas DataFrame.
            # The structure is usually Index (Date), Open, High, Low, Close, Volume.
            for index, row in df.iterrows():
                # Format trade date to match Postgres DATE format (YYYY-MM-DD)
                trade_date = index.strftime("%Y-%m-%d") if hasattr(index, 'strftime') else str(index)[:10]
                
                record = {
                    "ticker": ticker,
                    "trade_date": trade_date,
                    "open_price": float(row.get("Open", 0)),
                    "high_price": float(row.get("High", 0)),
                    "low_price": float(row.get("Low", 0)),
                    "close_price": float(row.get("Close", 0)),
                    "volume": int(row.get("Volume", 0))
                }
                
                # 3. Upsert data to Supabase
                # The upsert logic provides idempotency: if the script runs multiple times
                # on the same day, it will update the existing row instead of duplicating.
                upsert_response = supabase.table("price_history").upsert(record).execute()
                print(f"  Upserted {ticker} for {trade_date}")
                
        except Exception as e:
            print(f"  Error processing {ticker}: {e}")
            
    print("Daily ingestion completed.")

if __name__ == "__main__":
    main()
