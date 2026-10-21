"""Renders one user's watchlist digest as an email (subject, HTML, plain text)."""
from datetime import date
from html import escape

DISCLAIMER = (
    "For information only, not investment advice. Shariah compliance follows the "
    "KMI All-Share index published by PSX. Closing prices from PSX's official daily "
    "file, cross-checked with an independent source."
)

# Brand palette, matching the website. Email clients need literal colours.
EMERALD, EMERALD_DARK, GOLD = "#047857", "#065f46", "#e0b35c"
GAIN, GAIN_BG, LOSS, LOSS_BG = "#15803d", "#e7f5ec", "#c2410c", "#fcede5"
INK, MUTED, LINE, PAGE = "#0c1512", "#6b756f", "#e3e6e1", "#f6f7f5"


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


def _pill(value) -> str:
    """Coloured change pill; the arrow and sign carry direction, not colour alone."""
    v = _num(value)
    if v is None:
        return f'<span style="color:{MUTED};">—</span>'
    fg, bg, arrow = (GAIN, GAIN_BG, "▲") if v > 0 else (LOSS, LOSS_BG, "▼") if v < 0 else (MUTED, PAGE, "•")
    return (f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:{bg};'
            f'color:{fg};font-weight:600;font-size:13px;white-space:nowrap;">{arrow} {_pct(v)}</span>')


def _stat(label: str, value: str, colour: str) -> str:
    return (f'<td style="padding:14px 8px;text-align:center;width:33%;">'
            f'<div style="font-size:22px;font-weight:700;color:{colour};">{escape(value)}</div>'
            f'<div style="font-size:12px;color:{MUTED};margin-top:2px;">{escape(label)}</div></td>')


def render_digest(rows: list[dict], market_date: str, weekly: bool,
                  app_url: str, unsubscribe_url: str, intro: str | None = None) -> tuple[str, str, str]:
    """Return (subject, html, text). intro replaces the default line under the heading."""
    col = change_column(weekly)
    rows = sort_rows(rows, col)
    subject = subject_for(rows, market_date, weekly)
    change_col = "5-day" if weekly else "1-day"
    app = escape(app_url)

    changes = [_num(r.get(col)) for r in rows]
    up = sum(1 for c in changes if c is not None and c > 0)
    down = sum(1 for c in changes if c is not None and c < 0)
    top = next((r for r in rows if _num(r.get(col)) is not None), None)
    top_label = f"{top['ticker']} {_pct(top[col])}" if top else "—"

    html_rows, text_rows = [], []
    for r in rows:
        change = r.get(col)
        close = _num(r.get("close_price"))
        close_str = "—" if close is None else f"{close:,.2f}"
        notes = notes_for(r, market_date)
        name = escape(r.get("company_name") or "")
        chips = "".join(
            f'<div style="margin-top:6px;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;'
            f'background:#f7efdc;color:#8a6116;font-size:11px;">{escape(n)}</span></div>'
            for n in notes
        )
        html_rows.append(
            "<tr>"
            f'<td style="padding:14px 16px;border-top:1px solid {LINE};">'
            f'<a href="{app}/stocks/{escape(r["ticker"])}" style="color:{INK};text-decoration:none;">'
            f'<strong style="font-size:15px;">{escape(r["ticker"])}</strong></a>'
            f'<div style="color:{MUTED};font-size:12px;margin-top:2px;">{name}</div>{chips}</td>'
            f'<td style="padding:14px 8px;border-top:1px solid {LINE};text-align:right;font-weight:600;'
            f'color:{INK};white-space:nowrap;">{close_str}</td>'
            f'<td style="padding:14px 16px;border-top:1px solid {LINE};text-align:right;">{_pill(change)}</td>'
            "</tr>"
        )
        text_rows.append(
            f"{r['ticker']:<9} {close_str:>10}  {_pct(change):>8}"
            + "".join(f"\n          - {n}" for n in notes)
        )

    heading = f"{'Weekly' if weekly else 'Daily'} update for {_pretty_date(market_date)}"
    lead = intro or f"Your {len(rows)} Shariah-compliant PSX companies, biggest movers first."
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{PAGE};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};">
<div style="display:none;max-height:0;overflow:hidden;">{escape(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <tr><td style="background:{EMERALD};background-image:linear-gradient(135deg,{EMERALD_DARK},{EMERALD} 55%,#0f766e);border-radius:18px 18px 0 0;padding:26px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;"><img src="{app}/apple-icon" width="40" height="40" alt="" style="display:block;border-radius:10px;border:0;"></td>
      <td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:15px;font-weight:700;">PSX Halal Tracker</td>
    </tr></table>
    <div style="margin-top:22px;color:{GOLD};font-size:13px;font-weight:600;letter-spacing:.3px;">ASSALAM-O-ALAIKUM</div>
    <div style="margin-top:4px;color:#ffffff;font-size:24px;font-weight:700;line-height:1.25;">{escape(heading)}</div>
    <div style="margin-top:6px;color:rgba(255,255,255,.85);font-size:14px;line-height:1.5;">{escape(lead)}</div>
  </td></tr>

  <tr><td style="background:#ffffff;border-left:1px solid {LINE};border-right:1px solid {LINE};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid {LINE};"><tr>
      {_stat("closed higher", f"▲ {up}", GAIN)}{_stat("closed lower", f"▼ {down}", LOSS)}{_stat("biggest move", top_label, INK)}
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <tr style="color:{MUTED};font-size:11px;text-transform:uppercase;letter-spacing:.5px;">
        <td style="padding:12px 16px 8px;">Company</td><td style="padding:12px 8px 8px;text-align:right;">Close (PKR)</td>
        <td style="padding:12px 16px 8px;text-align:right;">{change_col}</td></tr>
      {''.join(html_rows)}
    </table>
  </td></tr>

  <tr><td align="center" style="background:#ffffff;border:1px solid {LINE};border-top:0;border-radius:0 0 18px 18px;padding:24px 20px 28px;">
    <a href="{app}/dashboard" style="display:inline-block;background:{EMERALD};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:12px;">Open my dashboard &rarr;</a>
    <div style="margin-top:10px;color:{MUTED};font-size:12px;">See charts, or change your companies and email settings.</div>
  </td></tr>

  <tr><td style="padding:20px 12px;color:{MUTED};font-size:12px;line-height:1.6;text-align:center;">
    {escape(DISCLAIMER)}<br>
    <a href="{escape(unsubscribe_url)}" style="color:{MUTED};">Unsubscribe</a> &middot;
    <a href="{app}/dashboard" style="color:{MUTED};">Email settings</a> &middot;
    <a href="{app}/privacy" style="color:{MUTED};">Privacy</a>
  </td></tr>

</table></td></tr></table>
</body></html>"""

    text = (
        f"{heading}\n{lead}\n\n"
        f"{up} closed higher, {down} closed lower. Biggest move: {top_label}\n\n"
        f"{'Ticker':<9} {'Close':>10}  {change_col:>8}\n"
        + "\n".join(text_rows)
        + f"\n\nDashboard: {app_url}/dashboard\n\n{DISCLAIMER}\nUnsubscribe: {unsubscribe_url}\n"
    )
    return subject, html, text
