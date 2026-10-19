// «Liderlar KPI» — the small pieces the page, its tabs and its dialogs share:
// the five KPI keys in the page's order, which of them the platform computes,
// number and date formats (turnover's own — one spelling across the leaders'
// KPI surfaces), the score's colour, sorting, and the scales drawn from the
// rules the server sent (never a second copy of a rule).
import { usePersistentState } from "../../hooks/usePersistentState";
import api from "../../utils/api";
import { fill } from "../../pages/leadersKpiText";

export { n0, pts, pct1, dmy, dmHm, monthLabel, todayISO, scoreTone, toneInk, PAST_FROM } from "../turnover/turnoverUtil";

export const KPI_KEYS = ["concerns", "turnover", "foreign", "compliance", "audit"];
export const LIVE = new Set(["concerns", "turnover", "foreign", "compliance"]);
export const MAX_POINTS = 5;

const pad = (n) => String(n).padStart(2, "0");

// The month the page opens on — the one running («so far»), the operator's call.
export const curMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const w100 = (rule) => Math.round((rule?.weight ?? 0) * 100);
export const maxPts = (rule) => Number(((rule?.weight ?? 0) * (rule?.max_score ?? 5)).toFixed(2));

export const errText = async (e) => {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); return j?.detail?.message || j?.detail || e.message; } catch { return e.message; }
  }
  return d?.detail_raw?.message || d?.detail?.message || (typeof d?.detail === "string" ? d.detail : null) || e?.message || "?";
};

const NUM_KEYS = new Set(["rank", "total", "pct", "score", "points", "working", "left", "rate", "days", "hired", "leftOn",
  "count", "all", "filed", "done", "uplifted", "open", "pct0", "concerns", "turnover", "foreign", "compliance", "audit", "date",
  "counted", "compliant", "tenure", "since", "verdict"]);

export function sortRows(rows, sort, get) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a, sort.key);
    const vb = get(b, sort.key);
    const na = va == null || va === "";
    const nb = vb == null || vb === "";
    if (na || nb) return na === nb ? 0 : na ? 1 : -1;   // blanks last, either way
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "ru") * dir;
  });
}

export function useSort(key, initial) {
  const [sort, setSort] = usePersistentState(key, initial);
  const onSort = (k) => setSort((s) => (s?.key === k
    ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: NUM_KEYS.has(k) ? "desc" : "asc" }));
  return [sort || initial, onSort];
}

// The scale of a KPI as rows of [label, score] — for the rules dialog, the
// placeholder tabs and the concerns strip. Each shape is its rule's own.
export function bandLines(key, rule) {
  if (!rule) return [];
  if (key === "concerns") {
    const bands = [...(rule.bands || [])].sort((a, b) => b.over - a.over);
    return [...bands.map((b) => [`> ${b.over}%`, b.score]), ["", rule.worst ?? 1]];
  }
  if (key === "turnover") {
    const bands = [...(rule.bands || [])].sort((a, b) => a.max - b.max);
    const out = [];
    let prev = null;
    for (const b of bands) {
      out.push([prev == null ? `≤ ${b.max}%` : `${(prev + 0.1).toFixed(1).replace(/\.0$/, "")}–${b.max}%`, b.score]);
      prev = b.max;
    }
    out.push([`> ${prev ?? 0}%`, rule.worst ?? 1]);
    return out;
  }
  if (key === "compliance") {
    // HR's IFS: exactly 100 % → full; strictly above a band's edge → its score; else the worst.
    const bands = [...(rule.bands || [])].sort((a, b) => b.above - a.above);
    return [["= 100%", rule.full ?? 5], ...bands.map((b) => [`> ${b.above}%`, b.score]), ["", rule.worst ?? 1]];
  }
  if (key === "foreign") {
    const bands = [...(rule.bands || [])].sort((a, b) => a.max - b.max);
    const out = [];
    let prev = null;
    for (const b of bands) {
      const from = prev == null ? 0 : prev + 1;
      out.push([from === b.max ? String(b.max) : `${from}–${b.max}`, b.score]);
      prev = b.max;
    }
    out.push([`${(prev ?? -1) + 1}+`, rule.worst ?? 1]);
    return out;
  }
  return (rule.bands || []).map(([label, score]) => [label, score]);
}

// A cell's figure on one KPI, in words — what the board's dialog and the
// phone rows print beside the score.
export function figureOf(row, key, T) {
  if (key === "concerns") {
    const c = row.concerns || {};
    if (!c.total) return T.figConcernsNone;
    if (!c.rated) return fill(T.figConcernsNoPct, { n: c.total });
    return fill(T.figConcerns, { done: c.done, rated: c.rated, pct: c.pct0 ?? "—" });
  }
  if (key === "turnover") {
    const tv = row.turnover;
    if (!tv) return T.figTurnoverNone;
    if (tv.rate == null) return T.figTurnoverNoPeople;
    return fill(T.figTurnover, { left: tv.left, working: tv.working, rate: `${Number(tv.rate).toFixed(1)}%` });
  }
  if (key === "foreign") {
    const f = row.foreign;
    if (!f) return T.notLive;
    return f.count ? fill(T.figForeign, { n: f.count }) : T.figForeignNone;
  }
  if (key === "compliance") {
    const c = row.compliance;
    if (!c) return T.notLive;
    if (!c.counted) return T.figComplianceNone;
    return fill(T.figCompliance, { ok: c.compliant, n: c.counted, pct: c.rate == null ? "—" : `${Number(c.rate).toFixed(1)}%` });
  }
  return T.cmNotLive;
}

// The order the compliance tab lists verdicts in — failures first, the
// server's own (`category_compliance._VERDICT_ORDER`).
export const VERDICT_RANK = { below: 0, no_category: 1, old_grade: 2, above: 3, ok: 4, no_ladder: 5, no_hire: 6 };

// The judged people of these cells (by code key) for the month — asked in
// chunks of 40 keys, the most one call answers; the explain dialog asks for one.
export async function fetchPeople(ym, keys) {
  const chunks = [];
  for (let i = 0; i < keys.length; i += 40) chunks.push(keys.slice(i, i + 40));
  const parts = await Promise.all(chunks.map((c) =>
    api.get("/api/category-compliance/people", { params: { month: ym, keys: c.join(",") } }).then((r) => r.data?.people || {})));
  return Object.assign({}, ...parts);
}

export const scoreOf = (row, key) => (row?.[key]?.score ?? null);
export const pointsOf = (row, key) => (row?.[key]?.points ?? null);
