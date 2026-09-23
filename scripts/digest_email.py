"""Renders one user's watchlist digest as an email (subject, HTML, plain text)."""
from datetime import date
from html import escape

DISCLAIMER = (
    "For information only, not investment advice. Shariah compliance follows the "
    "KMI All-Share index published by PSX. Prices from the PSX data portal."
)


def _num(val) -> float | None:
    return float(val) if val is not None else None


def _pct(val) -> str:
    v = _num(val)
    return "—" if v is None else f"{v:+.2f}%"


def _pretty_date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%a %d %b %Y")


def notes_for(row: dict, market_date: str) -> list[str]:
    """Factual observations for one stock. Deliberately no buy/sell language."""
    notes = []
    if row.get("trade_date") and row["trade_date"] < market_date:
        notes.append(f"Not traded on {_pretty_date(market_date)}; last traded {_pretty_date(row['trade_date'])}")
    rsi = _num(row.get("rsi_14"))
    if rsi is not None and rsi >= 70:
        notes.append(f"RSI {rsi:.0f} (above 70)")
    elif rsi is not None and rsi <= 30:
        notes.append(f"RSI {rsi:.0f} (below 30)")
    spike = _num(row.get("volume_spike_ratio"))
    if spike is not None and spike >= 2:
        notes.append(f"Volume {spike:.1f}× its 20-day average")
    return notes


def change_column(weekly: bool) -> str:
    return "price_change_5d_pct" if weekly else "change_1d_pct"


def sort_rows(rows: list[dict], col: str) -> list[dict]:
    """Biggest movers first; stocks without a change at the end."""
    return sorted(rows, key=lambda r: (_num(r.get(col)) is None, -abs(_num(r.get(col)) or 0), r["ticker"]))


def subject_for(rows: list[dict], market_date: str, weekly: bool) -> str:
    """rows must already be sorted by sort_rows."""
    label = "Weekly" if weekly else "Daily"
    col = change_column(weekly)
    movers = [r for r in rows if r.get(col) is not None][:3]
    summary = ", ".join(f"{r['ticker']} {_pct(r[col])}" for r in movers)
    base = f"{label} halal watchlist · {date.fromisoformat(market_date).strftime('%d %b')}"
    return f"{base}: {summary}" if summary else base


def render_digest(rows: list[dict], market_date: str, weekly: bool,
                  app_url: str, unsubscribe_url: str) -> tuple[str, str, str]:
    col = change_column(weekly)
    rows = sort_rows(rows, col)
    subject = subject_for(rows, market_date, weekly)
    change_col = "5-day" if weekly else "1-day"

    html_rows, text_rows = [], []
    for r in rows:
        change = r.get(col)
        change_val = _num(change)
        colour = "#1a7f37" if (change_val or 0) > 0 else "#cf222e" if (change_val or 0) < 0 else "#57606a"
        close = _num(r.get("close_price"))
        close_str = "—" if close is None else f"{close:,.2f}"
        notes = notes_for(r, market_date)
        name = escape(r.get("company_name") or "")

        html_rows.append(
            "<tr>"
            f'<td style="padding:10px 8px;border-bottom:1px solid #eaeef2;">'
            f'<strong>{escape(r["ticker"])}</strong><br><span style="color:#57606a;font-size:12px;">{name}</span>'
            + "".join(f'<br><span style="color:#9a6700;font-size:12px;">{escape(n)}</span>' for n in notes)
            + "</td>"
            f'<td style="padding:10px 8px;border-bottom:1px solid #eaeef2;text-align:right;">{close_str}</td>'
            f'<td style="padding:10px 8px;border-bottom:1px solid #eaeef2;text-align:right;color:{colour};">'
            f"{_pct(change)}</td>"
            "</tr>"
        )
        text_rows.append(
            f"{r['ticker']:<9} {close_str:>10}  {_pct(change):>8}"
            + "".join(f"\n          - {n}" for n in notes)
        )

    heading = f"{'Weekly' if weekly else 'Daily'} update for {_pretty_date(market_date)}"
    html = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f8fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <h1 style="font-size:20px;margin:0 0 4px;">{escape(heading)}</h1>
  <p style="margin:0 0 16px;color:#57606a;font-size:14px;">Your {len(rows)} watched Shariah-compliant PSX stocks, biggest movers first.</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #d0d7de;border-radius:6px;font-size:14px;">
    <thead><tr style="background:#f6f8fa;color:#57606a;font-size:12px;text-align:left;">
      <th style="padding:8px;">Company</th><th style="padding:8px;text-align:right;">Close (PKR)</th>
      <th style="padding:8px;text-align:right;">{change_col}</th>
    </tr></thead>
    <tbody>{''.join(html_rows)}</tbody>
  </table>
  <p style="margin:20px 0 0;font-size:14px;"><a href="{escape(app_url)}/dashboard" style="color:#0969da;">Open your dashboard</a> to see charts or change your watchlist.</p>
  <p style="margin:24px 0 0;color:#57606a;font-size:12px;line-height:1.5;">{escape(DISCLAIMER)}<br>
  <a href="{escape(unsubscribe_url)}" style="color:#57606a;">Unsubscribe from these emails</a></p>
</div></body></html>"""

    text = (
        f"{heading}\n\n"
        f"{'Ticker':<9} {'Close':>10}  {change_col:>8}\n"
        + "\n".join(text_rows)
        + f"\n\nDashboard: {app_url}/dashboard\n\n{DISCLAIMER}\nUnsubscribe: {unsubscribe_url}\n"
    )
    return subject, html, text
