import sys
import psxdata
import pandas as pd
from common import supabase, now_pkt

# The halal universe is the KMI All-Share index (every Shariah-compliant PSX
# stock); KMI-30 membership is kept as a flag for filtering.
ALL_SHARE_INDEX = "KMIALLSHR"
KMI_30_INDEX = "KMI30"

# A live list shorter than this is treated as a partial/garbled fetch, and no
# tickers are deactivated on the strength of it.
MIN_CONSTITUENTS = 250

# PSX's index listing appends a status marker to some symbols, e.g. LUCKXD for
# Lucky Cement while it trades ex-dividend, or DSLNC for a company flagged
# non-compliant. Stored as-is they never match any price data, and the real
# ticker looks like it left the index (on 2026-09-23 this deactivated LUCK,
# MARI, FCCL and SAZEW). XD ex-dividend, XB ex-bonus, XR ex-rights, XA ex-all,
# NC non-compliant.
STATUS_SUFFIXES = ("XD", "XB", "XR", "XA", "NC")


def base_symbol(symbol: str, known: set[str]) -> str:
    """
    The tradable symbol behind an index listing entry. A suffix is stripped only
    when PSX's symbol list lacks the listed symbol but has the shorter one, so a
    real ticker that happens to end in these letters is left alone.
    """
    if symbol in known:
        return symbol
    for suffix in STATUS_SUFFIXES:
        base = symbol.removesuffix(suffix)
        if base != symbol and base in known:
            return base
    return symbol


def fetch_constituents() -> list[dict]:
    """
    Return one record per KMI All-Share constituent with name, sector, market cap
    and KMI-30 flag. Raises if PSX data is unavailable: the universe only
    changes a few times a year, so skipping a run is safer than guessing.
    """
    all_share = psxdata.indices(ALL_SHARE_INDEX, cache=False)
    kmi_30 = psxdata.indices(KMI_30_INDEX, cache=False)
    for name, df in [(ALL_SHARE_INDEX, all_share), (KMI_30_INDEX, kmi_30)]:
        if df is None or df.empty or "symbol" not in df.columns:
            raise ValueError(f"psxdata returned no constituents for {name}.")

    sectors = psxdata.symbols(cache=False).set_index("symbol")["sector_name"].to_dict()
    known = set(sectors)
    kmi_30_symbols = {base_symbol(s, known) for s in kmi_30["symbol"]}

    records = []
    for row in all_share.to_dict("records"):
        ticker = base_symbol(row["symbol"], known)
        if ticker != row["symbol"]:
            print(f"  {row['symbol']} is listed with a status suffix; storing it as {ticker}.")
        record = {"ticker": ticker, "is_kmi_30": ticker in kmi_30_symbols}
        if pd.notna(row.get("name")):
            record["company_name"] = row["name"]
        # market_cap_m units: PKR millions, as returned by psxdata.
        if pd.notna(row.get("market_cap_m")):
            record["market_cap_m"] = float(row["market_cap_m"])
        if sectors.get(ticker):
            record["sector"] = sectors[ticker].title()
        records.append(record)
    return records


def main() -> int:
    print(f"Updating Halal Universe ({ALL_SHARE_INDEX}) at {now_pkt().isoformat()}")
    try:
        records = fetch_constituents()
    except Exception as e:
        print(f"ERROR: could not fetch constituents, universe left unchanged: {e}")
        print("PSX refuses many datacenter IPs, GitHub's runners included. Set the PSX_PROXY_URL "
              "secret, or run this script from a Pakistani connection.")
        return 1

    kmi_30_count = sum(r["is_kmi_30"] for r in records)
    print(f"Fetched {len(records)} constituents ({kmi_30_count} in KMI-30).")

    today = now_pkt().strftime("%Y-%m-%d")

    existing_resp = supabase.table("halal_universe").select("ticker, is_active").execute()
    existing = {row["ticker"]: row for row in existing_resp.data}
    failed: list[str] = []

    # 1. Upsert current constituents
    for record in records:
        ticker = record["ticker"]
        record.update({"is_kmi_all_share": True, "is_active": True, "removed_date": None})
        # Only stamp added_date when the ticker is new or re-entering the universe,
        # so re-runs do not erase when it originally joined.
        if ticker not in existing or not existing[ticker]["is_active"]:
            record["added_date"] = today
            print(f"  Adding {ticker}.")

        try:
            supabase.table("halal_universe").upsert(record).execute()
        except Exception as e:
            print(f"  Failed to update {ticker}: {e}")
            failed.append(ticker)

    # 2. Soft-delete tickers that have left the index. Their history is kept;
    # they stop being ingested and disappear from watchlist choices.
    current = {r["ticker"] for r in records}
    removed = sorted(t for t, row in existing.items() if row["is_active"] and t not in current)

    if removed:
        if len(records) < MIN_CONSTITUENTS:
            print(f"Not deactivating {', '.join(removed)}: live list has only {len(records)} tickers "
                  f"(expected at least {MIN_CONSTITUENTS}), which looks like a partial fetch.")
        else:
            try:
                supabase.table("halal_universe").update({
                    "is_active": False,
                    "is_kmi_30": False,
                    "is_kmi_all_share": False,
                    "removed_date": today,
                }).in_("ticker", removed).execute()
                print(f"  Deactivated {len(removed)} ticker(s) no longer Shariah-compliant: {', '.join(removed)}")
            except Exception as e:
                print(f"  Failed to deactivate removed tickers: {e}")
                failed.append("deactivation")

    if failed:
        print(f"ERROR: {len(failed)} failure(s): {', '.join(failed)}")
        return 1

    print("Universe update complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
