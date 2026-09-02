import os
import psxdata
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime

load_dotenv()                            
# Initialize Supabase client
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Manually maintained fallback list of KMI-30 constituents.
# Refreshed twice a year based on PSX / Al Meezan notices.
MANUAL_KMI_30 = [
    'AIRLINK', 'ATRL', 'CPHL', 'DGKC', 'EFERT', 'ENGROH', 'FCCL', 'FFC', 'FFL', 'GAL',
    'GHNI', 'HCAR', 'HUBC', 'LUCK', 'MARI', 'MEBL', 'MLCF', 'NML', 'NRL', 'OGDC', 
    'PAEL', 'PPL', 'PRL', 'PSO', 'SAZEW', 'SEARL', 'SNGP', 'SSGC', 'SYS', 'TREET'
]

def main():
    print("Updating Halal Universe (KMI-30 Initial Seed)...")
    tickers = []
    
    # 1. Attempt to auto-populate using psxdata
    try:
        print("Checking if psxdata supports auto-fetching KMI30 constituents...")
        df = psxdata.indices("KMI30")
        if df is not None and not df.empty and "symbol" in df.columns and "name" in df.columns:
            # Extract ticker, company name, and market cap from the live DataFrame.
            # market_cap_m units: PKR millions, as returned by psxdata.
            cap_col = df["market_cap_m"] if "market_cap_m" in df.columns else [None] * len(df)
            tickers = list(zip(df["symbol"], df["name"], cap_col))
            print(f"Success! Auto-fetched {len(tickers)} KMI-30 constituents via psxdata.")
        else:
            raise ValueError("psxdata returned empty or is missing 'symbol'/'name' columns for KMI30.")
    except Exception as e:
        print(f"Auto-fetch failed or unsupported: {e}")
        print("Falling back to manually-maintained KMI-30 list.")
        # Fallback: market_cap_m is unknown without a live psxdata call, so default to None
        tickers = [(t, f"{t} Corporation", None) for t in MANUAL_KMI_30]
        
    print(f"Total tickers to process: {len(tickers)}")
    
    # 2. Sync with Supabase halal_universe table
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Optional: fetch existing to see if we need to mark any as inactive
    # (For Phase 1 initial setup, we just upsert the active ones)
    for ticker, company_name, market_cap_m in tickers:
        record = {
            "ticker": ticker,
            "company_name": company_name,
            "market_cap_m": float(market_cap_m) if market_cap_m is not None else None,
            "is_kmi_30": True,
            "is_kmi_all_share": True,
            "is_active": True,
            "added_date": today
        }
        
        # Upsert the ticker
        try:
            supabase.table("halal_universe").upsert(record).execute()
            print(f"  Added/Updated {ticker} in halal_universe.")
        except Exception as e:
            print(f"  Failed to update {ticker}: {e}")

    print("Universe update complete.")

if __name__ == "__main__":
    main()
