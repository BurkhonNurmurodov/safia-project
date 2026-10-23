// «Liderlar KPI» — the small pieces the page, its tabs and its dialogs share:
// the KPI keys in the page's order (HR's five, then plan fulfilment), which of them the platform computes,
// number and date formats (turnover's own — one spelling across the leaders'
// KPI surfaces), the score's colour, sorting, and the scales drawn from the
// rules the server sent (never a second copy of a rule).
import { usePersistentState } from "../../hooks/usePersistentState";
import api from "../../utils/api";
import { fill } from "../../pages/leadersKpiText";
import { n0 } from "../turnover/turnoverUtil";

export { n0, pts, pct1, dmy, dmHm, monthLabel, todayISO, scoreTone, toneInk, PAST_FROM, START_MONTH } from "../turnover/turnoverUtil";

export const KPI_KEYS = ["concerns", "turnover", "foreign", "compliance", "audit", "plan"];
export const LIVE = new Set(["concerns", "turnover", "foreign", "compliance", "plan"]);
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
  "counted", "compliant", "tenure", "since", "verdict", "plan", "actual", "short"]);

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
  if (key === "plan") {
    // «at least N%» → score, the whole percent as printed.
    const bands = [...(rule.bands || [])].sort((a, b) => b.min - a.min);
    const low = bands.length ? `< ${bands[bands.length - 1].min}%` : "";
    return [...bands.map((b) => [`≥ ${b.min}%`, b.score]), [low, rule.worst ?? 1]];
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
  if (key === "plan") {
    const p = row.plan;
    if (!p || p.pct0 == null) return T.figPlanNone;
    return fill(T.figPlan, { a: n0(p.actual), p: n0(p.plan), pct: p.pct0 });
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

// A percent on the plan-fulfilment scale — the client twin of
// `leaders_kpi.plan_score` (at least N% → score), used only to colour a day in
// the cell's day strip; keep the two in step.
export const planScoreOf = (pct, rule) => {
  if (pct == null) return null;
  const bands = [...(rule?.bands || [])].sort((a, b) => b.min - a.min);
  for (const b of bands) if (pct >= b.min) return b.score;
  return rule?.worst ?? 1;
};

export const scoreOf = (row, key) => (row?.[key]?.score ?? null);
export const pointsOf = (row, key) => (row?.[key]?.points ?? null);

// «19.10» — a day of the month the picker above already names in full.
export const dm = (iso) => (iso ? `${String(iso).slice(8, 10)}.${String(iso).slice(5, 7)}` : "");

// ── the board («Reyting») — its podium, zones, radar and the month before ────

// Gold · silver · bronze — the /leaders podium's own inks on the dark theme,
// pulled darker on the light one (silver on white is otherwise a ghost).
const MEDAL_DARK = { 1: "#E0A82E", 2: "#C3CBD6", 3: "#C0703A" };
const MEDAL_LIGHT = { 1: "#C8902A", 2: "#8C97A8", 3: "#B4642E" };
export const medalOf = (rank, theme) => (theme === "light" ? MEDAL_LIGHT : MEDAL_DARK)[rank] || null;

export const hexA = (hex, a) => {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// The KPIs the board scores — the server's `kpis[].live`, in the page's order.
export const liveKeys = (data) => (data?.kpis?.length
  ? KPI_KEYS.filter((k) => data.kpis.some((x) => x.key === k && x.live))
  : KPI_KEYS.filter((k) => LIVE.has(k)));

// A KPI's highest score — its rule's own (the audit's scale ends at 3).
export const maxScore = (rules, key) => Number(rules?.[key]?.max_score) || 5;

// A score as a share of its scale, judged by the score tones every chip on
// these pages wears (4–5 of 5 green, 3 amber, 1–2 red), so a zone is never a
// threshold of its own — only the existing bands, counted.
export const fracTone = (score, max = 5) => {
  if (score == null) return null;
  const f = score / (max || 5);
  return f >= 0.8 ? "ok" : f > 0.4 ? "warn" : "bad";
};
export const avgTone = (v, max = 5) => (v == null ? null : fracTone(v, max));

// «green» — every live KPI scored in the green band; «attention» — at least
// one in the red band; null — anything between (or a KPI with no score yet).
export function zoneOf(row, keys, rules) {
  const tones = keys.map((k) => fracTone(scoreOf(row, k), maxScore(rules, k)));
  if (tones.includes("bad")) return "attention";
  if (tones.length && tones.every((t) => t === "ok")) return "green";
  return null;
}

// «YYYY-MM» → the month before it.
export const prevMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

// Two boards compare only when they measured the same things: the same live
// KPIs, each scored in both months or in neither. Otherwise a KPI one month
// lacks (a past month whose turnover nobody computed, a KPI that went live in
// between) would read as everybody rising or falling at once.
export function comparable(prev, cur) {
  if (!prev?.rows?.length || !cur?.rows?.length) return false;
  const live = (d) => (d.kpis || []).filter((k) => k.live).map((k) => k.key).join(",");
  if (live(prev) !== live(cur)) return false;
  return (cur.kpis || []).filter((k) => k.live).every((k) =>
    (prev.totals?.by_kpi?.[k.key]?.scored > 0) === (cur.totals?.by_kpi?.[k.key]?.scored > 0));
}

// One board row's radar axes: every KPI in the page's order — its score, the
// team's average, the month before where it compares, and whether it is live.
export function boardAxes(row, data, prevRow, keys, T) {
  const live = new Set(keys);
  return KPI_KEYS.map((k) => {
    const value = scoreOf(row, k);
    const before = prevRow ? scoreOf(prevRow, k) : null;
    return {
      key: k, label: T.tabs[k], full: T.kpi[k], live: live.has(k), value,
      max: maxScore(data?.rules, k),
      team: data?.totals?.by_kpi?.[k]?.avg_score ?? null,
      prev: before,
      delta: value != null && before != null ? value - before : null,
    };
  });
}
