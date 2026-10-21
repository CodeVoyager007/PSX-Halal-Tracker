/**
 * Renders a watchlist digest email. Mirrors scripts/digest_email.py (used by the
 * scheduled job) so the instant "email me now" message looks the same; change
 * both together.
 */
import type { SnapshotRow } from "@/lib/types";

const DISCLAIMER =
  "For information only, not investment advice. Shariah compliance follows the KMI All-Share index " +
  "published by PSX. Closing prices from PSX's official daily file, cross-checked with an independent source.";

const C = {
  emerald: "#047857", emeraldDark: "#065f46", gold: "#e0b35c",
  gain: "#15803d", gainBg: "#e7f5ec", loss: "#c2410c", lossBg: "#fcede5",
  ink: "#0c1512", muted: "#6b756f", line: "#e3e6e1", page: "#f6f7f5",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pct = (v: unknown) => {
  const n = num(v);
  return n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};

const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).replace(/,/g, "");

/** Factual observations for one stock. Deliberately no buy/sell language. */
export function notesFor(row: SnapshotRow, marketDate: string): string[] {
  const notes: string[] = [];
  if (row.trade_date && row.trade_date < marketDate) {
    notes.push(`Not traded on ${prettyDate(marketDate)}; last traded ${prettyDate(row.trade_date)}`);
  }
  const rsi = num(row.rsi_14);
  if (rsi !== null && rsi >= 70) notes.push(`RSI ${rsi.toFixed(0)} (above 70)`);
  else if (rsi !== null && rsi <= 30) notes.push(`RSI ${rsi.toFixed(0)} (below 30)`);
  const spike = num(row.volume_spike_ratio);
  if (spike !== null && spike >= 2) notes.push(`Volume ${spike.toFixed(1)}× its 20-day average`);
  return notes;
}

function pill(v: unknown) {
  const n = num(v);
  if (n === null) return `<span style="color:${C.muted};">—</span>`;
  const [fg, bg, arrow] = n > 0 ? [C.gain, C.gainBg, "▲"] : n < 0 ? [C.loss, C.lossBg, "▼"] : [C.muted, C.page, "•"];
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${fg};font-weight:600;font-size:13px;white-space:nowrap;">${arrow} ${pct(n)}</span>`;
}

const stat = (label: string, value: string, colour: string) =>
  `<td style="padding:14px 8px;text-align:center;width:33%;"><div style="font-size:22px;font-weight:700;color:${colour};">${esc(value)}</div><div style="font-size:12px;color:${C.muted};margin-top:2px;">${esc(label)}</div></td>`;

export function renderDigest(
  rowsIn: SnapshotRow[],
  marketDate: string,
  appUrl: string,
  unsubscribeUrl: string,
  intro?: string,
): { subject: string; html: string; text: string } {
  const change = (r: SnapshotRow) => num(r.change_1d_pct);
  // Biggest movers first; stocks without a change at the end
  const rows = [...rowsIn].sort((a, b) => {
    const ca = change(a), cb = change(b);
    if ((ca === null) !== (cb === null)) return ca === null ? 1 : -1;
    return Math.abs(cb ?? 0) - Math.abs(ca ?? 0) || a.ticker.localeCompare(b.ticker);
  });

  const movers = rows.filter((r) => change(r) !== null).slice(0, 3);
  const dayLabel = new Date(`${marketDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const base = `Daily halal watchlist · ${dayLabel}`;
  const subject = movers.length ? `${base}: ${movers.map((r) => `${r.ticker} ${pct(r.change_1d_pct)}`).join(", ")}` : base;

  const up = rows.filter((r) => (change(r) ?? 0) > 0).length;
  const down = rows.filter((r) => (change(r) ?? 0) < 0).length;
  const top = movers[0];
  const topLabel = top ? `${top.ticker} ${pct(top.change_1d_pct)}` : "—";
  const app = esc(appUrl);
  const heading = `Daily update for ${prettyDate(marketDate)}`;
  const lead = intro ?? `Your ${rows.length} Shariah-compliant PSX companies, biggest movers first.`;

  const htmlRows = rows
    .map((r) => {
      const close = num(r.close_price);
      const closeStr = close === null ? "—" : close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const chips = notesFor(r, marketDate)
        .map((n) => `<div style="margin-top:6px;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#f7efdc;color:#8a6116;font-size:11px;">${esc(n)}</span></div>`)
        .join("");
      return `<tr><td style="padding:14px 16px;border-top:1px solid ${C.line};"><a href="${app}/stocks/${esc(r.ticker)}" style="color:${C.ink};text-decoration:none;"><strong style="font-size:15px;">${esc(r.ticker)}</strong></a><div style="color:${C.muted};font-size:12px;margin-top:2px;">${esc(r.company_name ?? "")}</div>${chips}</td><td style="padding:14px 8px;border-top:1px solid ${C.line};text-align:right;font-weight:600;color:${C.ink};white-space:nowrap;">${closeStr}</td><td style="padding:14px 16px;border-top:1px solid ${C.line};text-align:right;">${pill(r.change_1d_pct)}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="background:${C.emerald};background-image:linear-gradient(135deg,${C.emeraldDark},${C.emerald} 55%,#0f766e);border-radius:18px 18px 0 0;padding:26px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;"><img src="${app}/apple-icon" width="40" height="40" alt="" style="display:block;border-radius:10px;border:0;"></td><td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:15px;font-weight:700;">PSX Halal Tracker</td></tr></table>
<div style="margin-top:22px;color:${C.gold};font-size:13px;font-weight:600;letter-spacing:.3px;">ASSALAM-O-ALAIKUM</div>
<div style="margin-top:4px;color:#ffffff;font-size:24px;font-weight:700;line-height:1.25;">${esc(heading)}</div>
<div style="margin-top:6px;color:rgba(255,255,255,.85);font-size:14px;line-height:1.5;">${esc(lead)}</div>
</td></tr>
<tr><td style="background:#ffffff;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${C.line};"><tr>${stat("closed higher", `▲ ${up}`, C.gain)}${stat("closed lower", `▼ ${down}`, C.loss)}${stat("biggest move", topLabel, C.ink)}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr style="color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.5px;"><td style="padding:12px 16px 8px;">Company</td><td style="padding:12px 8px 8px;text-align:right;">Close (PKR)</td><td style="padding:12px 16px 8px;text-align:right;">1-day</td></tr>${htmlRows}</table>
</td></tr>
<tr><td align="center" style="background:#ffffff;border:1px solid ${C.line};border-top:0;border-radius:0 0 18px 18px;padding:24px 20px 28px;">
<a href="${app}/dashboard" style="display:inline-block;background:${C.emerald};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:12px;">Open my dashboard &rarr;</a>
<div style="margin-top:10px;color:${C.muted};font-size:12px;">See charts, or change your companies and email settings.</div>
</td></tr>
<tr><td style="padding:20px 12px;color:${C.muted};font-size:12px;line-height:1.6;text-align:center;">${esc(DISCLAIMER)}<br>
<a href="${esc(unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a> &middot; <a href="${app}/dashboard" style="color:${C.muted};">Email settings</a> &middot; <a href="${app}/privacy" style="color:${C.muted};">Privacy</a></td></tr>
</table></td></tr></table></body></html>`;

  const text =
    `${heading}\n${lead}\n\n${up} closed higher, ${down} closed lower. Biggest move: ${topLabel}\n\n` +
    rows.map((r) => `${r.ticker.padEnd(9)} ${String(num(r.close_price)?.toFixed(2) ?? "—").padStart(10)}  ${pct(r.change_1d_pct).padStart(8)}`).join("\n") +
    `\n\nDashboard: ${appUrl}/dashboard\n\n${DISCLAIMER}\nUnsubscribe: ${unsubscribeUrl}\n`;

  return { subject, html, text };
}
