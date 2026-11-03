// «Brigadirlar KPI» — the board's vocabulary (2026-11-03 redesign, the
// operator: «redesign brigadir's KPI like Leader's KPI»). HR's brigadir KPI is
// four pass / fail GATES at 25% each, not scores out of 5, so the board speaks
// gates: each criterion is passed · failed · no figure · not counted yet, a
// brigadir's result is the gates passed out of four, and the team is grouped
// by how many of the COUNTED gates each brigadir got through. Nothing here
// computes a figure the server did not send — it only reads verdicts, counts
// rows and lays a fixed scale under a threshold.
import { GREEN, RED } from "../../utils/statusBands";
import { fill } from "../../pages/brigadirsKpiText";
import { n0 } from "../kpi/kpiUtil";

// The four gates in HR's order — the ring's quarters run clockwise from 12.
export const GATES = ["turnover", "okk", "mentoring", "kru"];
export const SLATE = "#94a3b8";      // «no figure» — the platform's «not started» grey

// The gates the server computes (`kpis[].live`), in HR's order.
export const liveGates = (data) => GATES.filter((k) => (data?.kpis || []).some((x) => x.key === k && x.live));

// One gate's state for one brigadir: «pass» · «fail» · «nodata» (counted, but
// no figure this month — nobody working, no quality record, the month's
// turnover not computed) · «pending» (the platform has no source for it yet).
export function gateOf(row, key, live) {
  if (!live.includes(key)) return "pending";
  const x = row?.[key];
  if (!x || x.pass == null) return "nodata";
  return x.pass ? "pass" : "fail";
}

export const GATE_INK = { pass: GREEN, fail: RED, nodata: SLATE };

// The four result groups the board filters by: every counted gate passed ·
// some · none (and at least one failed) · no figure on any counted gate.
export const GROUPS = ["all", "some", "none", "nodata"];
export const GROUP_INK = { all: GREEN, some: "#eab308", none: RED, nodata: SLATE };

export function groupOf(row, live) {
  const states = live.map((k) => gateOf(row, k, live));
  const passed = states.filter((s) => s === "pass").length;
  if (live.length && passed === live.length) return "all";
  if (passed > 0) return "some";
  return states.includes("fail") ? "none" : "nodata";
}

// The figure a gate is judged on and the threshold beside it.
export const figureOfGate = (row, key) => (key === "turnover" ? row?.turnover?.value : key === "okk" ? row?.okk?.pct : null) ?? null;

// Which side of the line passes: turnover passes BELOW its maximum, OKK ABOVE
// its minimum — both strict, as HR's file compares.
export const LOWER_PASSES = { turnover: true, okk: false };

export function thresholdOf(rule, key) {
  if (key === "turnover") return Number(rule?.turnover?.max ?? 60);
  if (key === "okk") return Number(rule?.okk?.min ?? 90);
  return Number(rule?.[key]?.min ?? NaN);
}

// The scale a strip and a gauge are drawn on — taken from the RULE, never from
// the month's values, so a dot sits in the same place every month. Turnover
// runs 0 → twice its maximum (at least 100%); OKK runs from 20 points under
// its minimum (in tens, at most 50) to 100. A value past either end is pinned
// to it and says so.
export function domainOf(rule, key) {
  const t = thresholdOf(rule, key);
  if (key === "turnover") return [0, Math.max(100, Math.ceil((t * 2) / 10) * 10)];
  return [Math.max(0, Math.min(50, Math.floor((t - 20) / 10) * 10)), 100];
}

// How far a figure sits from its line, in points, one decimal — the distance
// the panel names («12.4 punkt zaxira»). Plain subtraction of two numbers the
// server sent; null without a figure.
export const marginOf = (v, t) => (v == null || !Number.isFinite(t) ? null : Number(Math.abs(v - t).toFixed(1)));

export const pct1 = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);

// Two months compare only when they measured the same gates the same way: the
// same counted gates, and the month's turnover computed in both or in neither.
export function comparableMonths(prev, cur) {
  if (!prev?.rows?.length || !cur?.rows?.length) return false;
  if (!["open", "ended"].includes(prev.state)) return false;
  const live = (d) => liveGates(d).join(",");
  if (live(prev) !== live(cur)) return false;
  return Array.isArray(prev.turnover?.cells) === Array.isArray(cur.turnover?.cells);
}

// The notes every tab folds under its table — the same facts, said once each.
export function notesOf(data, T) {
  const n = data?.notes || {};
  const out = [];
  if (n.org && !n.org.ok) out.push(T.nNoOrg);
  if (n.via_verifix) out.push(fill(T.nViaVerifix, { n: n0(n.via_verifix) }));
  if (n.uncredited?.length) {
    const u = n.uncredited;
    out.push(fill(T.nUncredited, {
      codes: u.slice(0, 12).map((c) => c.code).join(", ") + (u.length > 12 ? ` +${u.length - 12}` : ""),
      w: n0(u.reduce((s, c) => s + c.working, 0)), l: n0(u.reduce((s, c) => s + c.left, 0)),
    }));
  }
  if (n.nobody?.length) {
    out.push(fill(T.nNobody, { names: n.nobody.slice(0, 10).map((x) => `${x.name} (${x.count})`).join(", ") + (n.nobody.length > 10 ? ` +${n.nobody.length - 10}` : "") }));
  }
  if (n.no_brigadir) out.push(fill(T.nNoBrigadir, { n: n0(n.no_brigadir) }));
  if ((data?.rows || []).some((x) => x.kind === "verifix")) out.push(T.nVerifixRows);
  return out;
}
