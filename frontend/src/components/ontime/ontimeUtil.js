// «O'z vaqtida yetkazish» (/ontime) — the page's pure helpers over the payload
// of GET /api/ontime/analysis (backend services/ontime.py). Nothing here
// measures anything: the server hands every row its ordered and on-time
// quantities (and the groups the sheet's own averages); this file reads them
// against the on-time band in force (utils/statusBands.js, admin-editable).
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { TXT } from "../../pages/ontimeText";
import { activeBands, ontimeTone, TONE_HEX } from "../../utils/statusBands";

export { fill } from "../../pages/ontimeText";
export { fmtQty, fmtDelta, ddmm, weekdayOf, tipBox, esc } from "../plan/planUtil";

/** The page's words in the reader's language. */
export function useOT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

// The sheet writes most groups in capitals («МЯСНАЯ ВЫПЕЧКА»), which reads as
// shouting and transliterates to «MYaSNAYa VYPEChKA». A name with no lower-case
// letter is shown in sentence case; a Latin word in it («NEW») stays as typed.
export function calmName(s) {
  const v = String(s ?? "").trim();
  if (!v || v !== v.toUpperCase() || v === v.toLowerCase()) return v;
  const out = v.split(/(\s+)/).map((w) => (/[\u0400-\u04ff]/.test(w) ? w.toLowerCase() : w)).join("");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** A group's name as the page prints it: sentence case, then the platform's
 *  transliteration for the reader's language. */
export function useGroupName() {
  const { tx } = useTranslit();
  return (s) => tx(calmName(s));
}

export const ratio = (on, ordered) => (ordered > 0 ? on / ordered : null);
export const pctOf = (r) => (r == null || Number.isNaN(r) ? null : Math.round(r * 100));
export const fmtPct = (r) => (r == null ? "—" : `${pctOf(r)}%`);
export const toneOf = (r) => ontimeTone(r);
export const toneHex = (tone) => (tone ? TONE_HEX[tone] : "var(--text-4)");
export const okEdge = () => activeBands().ontime.ok;

// A wave entry [ordered, on time] as its share.
export const waveRatio = (v) => (Array.isArray(v) ? ratio(v[1], v[0]) : null);

// Seconds after midnight → «21:00». 86 399 reads «23:59», 75 601 «21:00».
export function hhmm(sec) {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// A wave's window as the sheet writes it; wave 3 reads the NEXT day after
// midnight, which the page says.
export function windowText(w, win, T) {
  if (!win) return "";
  const s = String(w) === "3" ? hhmm(Math.max(0, win[0])) : hhmm(win[0]);
  const txt = `${s}–${hhmm(win[1])}`;
  return String(w) === "3" ? `${txt} (${T.nextDay})` : txt;
}

// The window most groups give a wave, or null when they disagree — for the
// waves card, which names one window per wave only when there is one.
export function commonWindow(windows, w) {
  const seen = new Map();
  for (const g of windows || []) {
    const v = g.waves?.[String(w)];
    if (!v) continue;
    const k = `${v[0]}-${v[1]}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  if (seen.size !== 1) return null;
  const [k] = seen.keys();
  return k.split("-").map(Number);
}

// Whole-percent days below the green edge, out of the days with orders.
export function dayStats(daily) {
  const ok = okEdge();
  let counted = 0, short = 0, zero = 0;
  for (const d of daily || []) {
    if (typeof d !== "number") continue;
    counted += 1;
    if (d < ok) short += 1;
    if (d === 0) zero += 1;
  }
  return { counted, short, zero };
}
