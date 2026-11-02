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
 *   money — MILLIONS of so'm, two decimals (TopSim's «MEUR»; the operator,
 *           2026-11-02: «Unit is MUZS not UZS») — the unit column says «mln»
 *
 * `bare` drops the «%» — for a periods table, whose unit column already says
 * it (TopSim's own reading: the unit beside the name, the cells numbers only).
 */
export function fmtCell(v, fmt, bare = false) {
  if (v === null || v === undefined || v === "") return DASH;
  switch (fmt) {
    case "text":  return String(v);
    case "pct":   return `${nf(v, Number.isInteger(Number(v)) ? 0 : 1)}${bare ? "" : "%"}`;
    case "num1":  return nf(v, 1);
    case "min":   return nf(v, 0);
    case "money": return nf(Number(v) / 1e6, 2);
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
  if (fmt === "money") return `${sign}${nf(abs / 1e6, 2)}`;
  return `${sign}${nf(abs, fmt === "num1" ? 1 : 0)}`;
}

/** A row's change cell as text — the screen and the downloaded file print
 *  this one string. A TOTAL over a month still running has its change withheld
 *  (`no_delta`, «·»); a change of exactly nothing is said as 0; no answer is
 *  «—». */
export function deltaText(row) {
  if (row?.no_delta === "partial") return "·";
  if (row?.delta != null && Number(row.delta) === 0) return row.fmt === "pct" ? "0 p.p." : "0";
  return fmtDelta(row?.delta, row?.fmt) || DASH;
}

/** Which way is GOOD for a figure — the only thing that decides a delta's
 *  colour. A figure not named here is neutral: a change in it is a fact, not a
 *  verdict, and colouring one would be the platform stating an opinion it has
 *  not been given. */
const LOWER_IS_BETTER = new Set([
  "idle.idleMin", "idle.idlePct", "idle.idlePerDay", "cost.costSum",
  "production.shortMin", "personnel.turnRate", "quality.complaints",
  "personnel.vkAbsence", "personnel.vkEarlyLeave", "personnel.vkLate",
]);
const HIGHER_IS_BETTER = new Set([
  "production.fulfil", "production.eff", "personnel.attRate",
  "quality.closure", "concerns.closure", "ontime.pct",
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

/**
 * A periods row's UNIT of measurement — the column TopSim prints beside every
 * figure («MEUR», «%»). Named by the figure's own key (its last segment, so the
 * mixed summary tables read the same word), else by how it is printed; a
 * figure whose unit is not known prints nothing rather than a guess.
 *
 * Counts that sum a DAY per person (the attendance roster) are person-days,
 * not people — saying «kishi» there would misread 30 days of 100 people as
 * three thousand of them.
 */
const UOM_BY_KEY = {
  fulfil: "pct", eff: "pct", loadStart: "pct", loadEnd: "pct", attRate: "pct", turnRate: "pct", idlePct: "pct", closure: "pct",
  planMin: "hour", actualMin: "hour", shortMin: "hour", idleMin: "min", idlePerDay: "min",
  pricedMin: "min", unpricedMin: "min",
  idlePersonMin: "personMin", workedMin: "personMin",
  costSum: "money", costPerDay: "money",
  countedDays: "day", noFact: "day", noPlan: "day", attDays: "day",
  overtimeDirect: "hour", overtimeIndirect: "hour", vkPresence: "hour", vkAbsence: "hour", vkFree: "hour",
  vkDayOff: "hour", vkEarlyLeave: "hour", vkLate: "hour",
  unitDays: "day", flaggedDays: "day",
  listed: "personDay", came: "personDay", onLeave: "personDay",
  working: "person", left: "person", hc: "person",
  actionable: "count", resolved: "count", openLeft: "count", filed: "count",
  counted: "count", uplifted: "count", units: "count", cells: "count",
};
const UOM_BY_FMT = { pct: "pct", min: "min", money: "money", int: "count" };

export function uomOf(row, T) {
  const kind = UOM_BY_KEY[String(row.key).split(".").pop()] || UOM_BY_FMT[row.fmt];
  return (kind && T.uom?.[kind]) || "";
}
