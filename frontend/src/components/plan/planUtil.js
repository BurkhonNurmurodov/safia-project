// «Reja bajarilishi» (/plan) — the page's pure helpers over the payload of
// GET /api/plan-fulfillment/analysis (backend services/plan_fulfillment.py).
//
// Nothing here measures anything: the server hands every entity its plan and
// fact minutes, and per-day entries shaped
//   units / cells:  [plan_min, fact_min] | "nf" | "np" | null
//   products:       whole percent        | "nf" | "np" | null
// ("nf" = its unit had a plan and no fact yet that day — never a 0%;
//  "np" = fact with no plan). This file only reads them against the completion
// bands in force (utils/statusBands.js, admin-editable) — which is why «days
// short» is counted here and not on the server: one reading of the bands for
// the colours and the counts beside them.
import { activeBands, vypTone, TONE_HEX } from "../../utils/statusBands";

export const ratio = (actual, plan) => (plan > 0 ? actual / plan : null);

// Whole percent, the precision the bands judge by (statusBands.pctTone).
export const pctOf = (r) => (r == null || Number.isNaN(r) ? null : Math.round(r * 100));
export const fmtPct = (r) => (r == null ? "—" : `${pctOf(r)}%`);

// Minutes → hours. Whole hours once there are ten of them; one decimal below,
// where a whole hour would round a real difference away.
export function fmtHours(min) {
  if (min == null || Number.isNaN(min)) return "—";
  const h = min / 60;
  if (Math.abs(h) >= 10) return Math.round(h).toLocaleString("ru-RU");
  return (Math.round(h * 10) / 10).toLocaleString("ru-RU");
}

// A quantity. A cell's SHARE of an evenly split line is a fraction, so a
// fraction keeps one decimal — never shown as a whole number it is not.
export function fmtQty(q) {
  if (q == null || Number.isNaN(q)) return "—";
  const r = Math.round(q * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString("ru-RU") : r.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// A change in percentage points: always one decimal (a column mixing «+1» and
// «+0,4» cannot be read down), a real minus sign, and a plus on a rise.
export function fmtDelta(pp) {
  if (pp == null || Number.isNaN(pp)) return "—";
  const v = Math.abs(pp).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return pp > 0 ? `+${v}` : pp < 0 ? `−${v}` : v;
}

export const toneOf = (r) => vypTone(r);
export const toneHex = (tone) => (tone ? TONE_HEX[tone] : "var(--text-4)");

// «12.09» from «2026-09-12».
export const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
// Monday = 0 … Sunday = 6, from an ISO date (no timezone involved).
export const weekdayOf = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;

// One unit / cell row read against the bands: how many days it had a plan and
// a fact, how many of those fell below the green edge, how many were waiting
// for their fact.
export function dayStats(daily) {
  const ok = activeBands().compl.ok;
  let counted = 0, short = 0, nf = 0, zero = 0;
  for (const d of daily || []) {
    if (Array.isArray(d)) {
      if (d[0] <= 0) continue;
      counted += 1;
      if (Math.round((100 * d[1]) / d[0]) < ok) short += 1;
      if (d[1] <= 0) zero += 1;
    } else if (d === "nf") nf += 1;
  }
  return { counted, short, nf, zero };
}

// The same for a product's whole-percent days.
export function prodDayStats(daily) {
  const ok = activeBands().compl.ok;
  let planned = 0, short = 0, zero = 0, nf = 0;
  for (const d of daily || []) {
    if (typeof d === "number") {
      planned += 1;
      if (d < ok) short += 1;
      if (d === 0) zero += 1;
    } else if (d === "nf") nf += 1;
  }
  return { planned, short, zero, nf };
}

// A per-day entry as the fulfilment ratio (null where there is none).
export function dayRatio(d) {
  if (Array.isArray(d)) return d[0] > 0 ? d[1] / d[0] : null;
  if (typeof d === "number") return d / 100;
  return null;
}

// The shared tooltip box — theme-aware through the CSS variables, so it reads
// on both themes; the chart hosting it must carry `apx-bare-tip`.
export function tipBox(title, rows) {
  const body = rows.filter(Boolean).map(([label, value, color]) => `
    <div style="display:flex;align-items:center;gap:8px;padding:1px 0">
      ${color ? `<span style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0"></span>` : ""}
      <span style="color:var(--text-3)">${label}</span>
      <b style="margin-left:auto;padding-left:12px;color:var(--text-1);font-variant-numeric:tabular-nums">${value}</b>
    </div>`).join("");
  return `<div style="padding:8px 10px;background:var(--bg-card);border:1px solid var(--border-md);border-radius:10px;font-size:11px;min-width:190px;box-shadow:0 8px 24px rgba(0,0,0,.18)">
    <div style="color:var(--text-1);font-weight:600;margin-bottom:4px">${title}</div>${body}</div>`;
}

// Escape text going into a tooltip's HTML (product names come from the catalog).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// «{n}» placeholders.
export const fill = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
