// «Hisobotlar» (/reports) — the page's shared vocabulary: its words, and the
// ONE way a figure is printed.
//
// A cell is formatted in exactly one place (`fmtCell`) and the string it
// produces is what the document carries too (the page posts it back on the
// export), so the screen and the file can never spell one number two ways.
import { useMemo } from "react";
import { useLang } from "../../context/LangContext";
import { TXT, fill } from "../../pages/reportsText";
// A month is named ONE way on this platform — never a second spelling of it.
import { monthLabel, PAST_FROM, todayISO } from "../turnover/turnoverUtil";

export { fill, monthLabel, PAST_FROM, todayISO };

export function useRT() {
  const { lang } = useLang();
  return useMemo(() => TXT[lang] || TXT.uz, [lang]);
}

/** `null` / `undefined` is «no answer» and is printed «—» — never 0. That one
 *  rule is what keeps «nothing filed» apart from «nothing resolved». */
export const DASH = "—";

// Thousands separated the way `n0` (components/turnover/turnoverUtil.js)
// separates them — a PLAIN space, ru-RU grouping, the NBSP it produces
// replaced. One separator on the platform, never a second one here.
const nf = (n, d = 0) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return DASH;
  return v.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/\u00a0/g, " ");
};

/**
 * THE cell formatter. `fmt`:
 *   text  — as it is
 *   int   — a whole number
 *   num1  — one decimal
 *   pct   — a whole percent with its sign
 *   min   — minutes, whole
 *   money — so'm, whole
 */
export function fmtCell(v, fmt) {
  if (v === null || v === undefined || v === "") return DASH;
  switch (fmt) {
    case "text":  return String(v);
    case "pct":   return `${nf(v, Number.isInteger(Number(v)) ? 0 : 1)}%`;
    case "num1":  return nf(v, 1);
    case "min":   return nf(v, 0);
    case "money": return nf(v, 0);
    case "int":
    default:      return nf(v, 0);
  }
}

/** A delta chip's text — the change against the month before, with its sign.
 *  Percent figures move in POINTS, which is a different unit from the figure
 *  itself and is why it is spelled out rather than suffixed with «%». */
export function fmtDelta(d, fmt) {
  if (d === null || d === undefined) return null;
  const v = Number(d);
  if (!Number.isFinite(v) || v === 0) return null;
  const sign = v > 0 ? "+" : "−";
  const abs = Math.abs(v);
  if (fmt === "pct") return `${sign}${nf(abs, Number.isInteger(abs) ? 0 : 1)} p.p.`;
  return `${sign}${nf(abs, fmt === "num1" ? 1 : 0)}`;
}

/** Which way is GOOD for a figure — the only thing that decides a delta's
 *  colour. A figure not named here is neutral: a change in it is a fact, not a
 *  verdict, and colouring one would be the platform stating an opinion it has
 *  not been given. */
const LOWER_IS_BETTER = new Set([
  "idle.idleMin", "idle.idlePerDay", "cost.costSum",
  "production.shortMin", "personnel.turnRate",
]);
const HIGHER_IS_BETTER = new Set([
  "production.fulfil", "production.eff", "personnel.attRate",
  "quality.closure", "concerns.closure",
]);

export function deltaTone(rowKey, delta) {
  if (!delta) return null;
  const up = Number(delta) > 0;
  if (HIGHER_IS_BETTER.has(rowKey)) return up ? "good" : "bad";
  if (LOWER_IS_BETTER.has(rowKey)) return up ? "bad" : "good";
  return null;
}


/**
 * A row's label, in this order:
 *   1. the bundle's word for its key;
 *   2. the bundle's word for its LAST segment, QUALIFIED by its section — the
 *      summary and «Asosiy ko'rsatkichlar» tables mix sections and address a
 *      row as «<section>.<key>», and «closure» belongs to two of them, so an
 *      unqualified word would print «Bartaraf etilgan %» on two rows nobody
 *      could tell apart;
 *   3. an ojidaniya CATEGORY, named the way /downtime names it
 *      (`downtime.cat.<code>.label`, with «Cat » stripped — CostTab.jsx's own
 *      rule), so one cause is not called two things on two pages;
 *   4. whatever the server sent, else the key — visible, never blank.
 */
export function rowLabel(row, T, t) {
  const whole = T.row?.[row.key];
  if (whole) return whole;
  const part = T.row?.[String(row.key).split(".").pop()];
  if (part) {
    const sec = row.section && T.sec?.[row.section];
    return sec ? `${sec} · ${part}` : part;
  }
  const raw = row.label || row.key;
  if (t && /^Cat\s*\S+$/i.test(raw)) {
    const key = `downtime.cat.${String(raw).replace(/^Cat\s*/i, "")}.label`;
    const said = t(key);
    if (said && said !== key) return `${raw} — ${said}`;
  }
  return raw;
}

export function colLabel(c, T) {
  return T.col?.[c.key] || c.key;
}
