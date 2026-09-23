import psxdata
import pandas as pd
from datetime import datetime
from common import supabase

# Manually maintained fallback list of KMI-30 constituents.
# Refreshed twice a year based on PSX / Al Meezan notices.
MANUAL_KMI_30 = [
    'AIRLINK', 'ATRL', 'CPHL', 'DGKC', 'EFERT', 'ENGROH', 'FCCL', 'FFC', 'FFL', 'GAL',
    'GHNI', 'HCAR', 'HUBC', 'LUCK', 'MARI', 'MEBL', 'MLCF', 'NML', 'NRL', 'OGDC',
    'PAEL', 'PPL', 'PRL', 'PSO', 'SAZEW', 'SEARL', 'SNGP', 'SSGC', 'SYS', 'TREET'
]

# A live list shorter than this is treated as a partial/garbled fetch, and no
# tickers are deactivated on the strength of it.
MIN_CONSTITUENTS = 25


def fetch_constituents() -> tuple[list[dict], bool]:
    """
    Return (records, is_live). Each record holds the ticker plus only the fields
    actually known, so an upsert never overwrites good data with placeholders.
    """
    try:
        print("Fetching KMI30 constituents via psxdata...")
        df = psxdata.indices("KMI30")
        if df is None or df.empty or "symbol" not in df.columns or "name" not in df.columns:
            raise ValueError("psxdata returned empty or is missing 'symbol'/'name' columns for KMI30.")

        records = []
        for row in df.to_dict("records"):
            record = {"ticker": row["symbol"], "company_name": row["name"]}
            # market_cap_m units: PKR millions, as returned by psxdata.
            if pd.notna(row.get("market_cap_m")):
                record["market_cap_m"] = float(row["market_cap_m"])
            records.append(record)
        print(f"Success! Auto-fetched {len(records)} KMI-30 constituents via psxdata.")
        return records, True
    except Exception as e:
        print(f"Auto-fetch failed or unsupported: {e}")
        print("Falling back to manually-maintained KMI-30 list.")
        # Names and market caps are unknown here; leave existing values untouched
        return [{"ticker": t} for t in MANUAL_KMI_30], False


def main():
    print("Updating Halal Universe (KMI-30)...")
    records, is_live = fetch_constituents()
    print(f"Total tickers to process: {len(records)}")

    today = datetime.now().strftime("%Y-%m-%d")

    existing_resp = supabase.table("halal_universe").select("ticker, is_active").execute()
    existing = {row["ticker"]: row for row in existing_resp.data}

    # 1. Upsert current constituents
    for record in records:
        ticker = record["ticker"]
        record.update({
            "is_kmi_30": True,
            "is_kmi_all_share": True,
            "is_active": True,
            "removed_date": None,
        })
        # Only stamp added_date when the ticker is new or re-entering the universe,
        # so re-runs do not erase when it originally joined.
        if ticker not in existing or not existing[ticker]["is_active"]:
            record["added_date"] = today

        try:
            supabase.table("halal_universe").upsert(record).execute()
            print(f"  Added/Updated {ticker} in halal_universe.")
        except Exception as e:
            print(f"  Failed to update {ticker}: {e}")

    # 2. Soft-delete tickers that have left the index
    current = {r["ticker"] for r in records}
    removed = sorted(t for t, row in existing.items() if row["is_active"] and t not in current)

    if removed:
        if not is_live:
            print(f"Not deactivating {', '.join(removed)}: the list came from the manual fallback, "
                  "which may be out of date. Update MANUAL_KMI_30 or re-run when psxdata is reachable.")
        elif len(records) < MIN_CONSTITUENTS:
            print(f"Not deactivating {', '.join(removed)}: live list has only {len(records)} tickers "
                  f"(expected at least {MIN_CONSTITUENTS}), which looks like a partial fetch.")
        else:
            try:
                supabase.table("halal_universe").update({
                    "is_active": False,
                    "is_kmi_30": False,
                    "removed_date": today,
                }).in_("ticker", removed).execute()
                print(f"  Deactivated {len(removed)} ticker(s) no longer in KMI-30: {', '.join(removed)}")
            except Exception as e:
                print(f"  Failed to deactivate removed tickers: {e}")

    print("Universe update complete.")


if __name__ == "__main__":
    main()
