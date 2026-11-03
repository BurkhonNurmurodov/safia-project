// «Brigadirlar KPI» — one ranking row opened in place (2026-11-03 redesign),
// the counterpart of the leaders' radar panel. On the left the four gates in
// HR's order: a counted one as a gauge on the same scale its tile's strip
// uses — the line to cross, the brigadir's figure, how far inside or outside
// it they are — with the month before beside it and the way to the working
// behind it (cells and leavers · quality records); a gate the platform does
// not count yet as its rule alone. On the right the result ring, the share
// HR pays on, and what the payout still waits for. Hovering a gate lights its
// quarter of the ring.
import { useState } from "react";
import { CheckCircle2, ChevronRight, CircleDashed, Clock3, MinusCircle, XCircle } from "lucide-react";
import Button from "../ui/Button";
import { fill } from "../../pages/brigadirsKpiText";
import { Delta } from "../kpi/KpiBits";
import { n0 } from "../kpi/kpiUtil";
import GateRing from "./GateRing";
import { GATES, GATE_INK, LOWER_PASSES, domainOf, figureOfGate, gateOf, marginOf, pct1, thresholdOf } from "./bkpiUtil";

const STATE_ICON = { pass: CheckCircle2, fail: XCircle, nodata: MinusCircle, pending: Clock3 };

// A figure on its gate's scale: the passing side tinted green, the other red,
// the line dashed, the brigadir a dot with the figure over it.
function Gauge({ k, v, state, rule }) {
  const [lo, hi] = domainOf(rule, k);
  const t = thresholdOf(rule, k);
  const at = (x) => ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * 100;
  const pt = at(t);
  const pv = at(v);
  const lower = LOWER_PASSES[k];
  const ink = GATE_INK[state] || GATE_INK.nodata;
  const labelShift = pv < 9 ? "0%" : pv > 91 ? "-100%" : "-50%";
  const clamped = v < lo ? "‹ " : v > hi ? " ›" : "";
  return (
    <div className="relative mt-1 mb-1" style={{ height: 48 }} aria-hidden>
      <span className="absolute text-xs font-bold tabular-nums whitespace-nowrap"
        style={{ left: `${pv}%`, top: 0, transform: `translateX(${labelShift})`, color: "var(--text-1)" }}>
        {v < lo ? clamped : ""}{pct1(v)}{v > hi ? clamped : ""}
      </span>
      <div className="absolute left-0 right-0 h-2 rounded-full overflow-hidden" style={{ top: 21, background: "var(--border)" }}>
        <span className="absolute inset-y-0" style={{ left: lower ? 0 : `${pt}%`, width: lower ? `${pt}%` : `${100 - pt}%`, background: GATE_INK.pass, opacity: 0.28 }} />
        <span className="absolute inset-y-0" style={{ left: lower ? `${pt}%` : 0, width: lower ? `${100 - pt}%` : `${pt}%`, background: GATE_INK.fail, opacity: 0.2 }} />
      </div>
      <span className="absolute w-0" style={{ left: `${pt}%`, top: 15, height: 20, borderLeft: "1.5px dashed var(--text-2)" }} />
      <span className="absolute rounded-full" style={{
        left: `${pv}%`, top: 25, width: 14, height: 14, transform: "translate(-50%, -50%)",
        background: ink, boxShadow: "0 0 0 2.5px var(--bg-inner)",
      }} />
      <span className="absolute text-[11px] tabular-nums" style={{ left: 0, top: 33, color: "var(--text-3)" }}>{Math.round(lo)}%</span>
      <span className="absolute text-[11px] font-semibold tabular-nums whitespace-nowrap"
        style={{ left: `${pt}%`, top: 33, transform: "translateX(-50%)", color: "var(--text-2)" }}>
        {lower ? `< ${Math.round(t)}%` : `> ${Math.round(t)}%`}
      </span>
      <span className="absolute text-[11px] tabular-nums" style={{ right: 0, top: 33, color: "var(--text-3)" }}>{Math.round(hi)}%</span>
    </div>
  );
}

// How far from the line, in words — inside it for a pass, outside for a fail,
// «exactly on it» for a figure at the threshold (both comparisons are strict).
function marginText(k, v, state, rule, T) {
  const t = thresholdOf(rule, k);
  const d = marginOf(v, t);
  if (d == null) return null;
  if (d === 0) return T.bdAtEdge;
  const key = `${k === "turnover" ? "tv" : "okk"}Margin${state === "pass" ? "Pass" : "Fail"}`;
  return fill(T[key], { d: d.toFixed(1) });
}

function GateBlock({ k, row, prevRow, data, live, T, on, setActive, onOpen }) {
  const state = gateOf(row, k, live);
  const rule = data?.rule || {};
  const Icon = STATE_ICON[state];
  const ink = state === "pending" ? "var(--text-4)" : GATE_INK[state];
  const v = figureOfGate(row, k);
  const word = { pass: T.gPass, fail: T.gFail, nodata: T.gNoData, pending: T.notYet }[state];
  const prevState = prevRow ? gateOf(prevRow, k, live) : null;
  const prevV = prevRow ? figureOfGate(prevRow, k) : null;

  let facts = null;
  if (k === "turnover" && row.turnover) {
    facts = fill(T.bdTvFacts, { c: n0(row.turnover.cells), w: n0(row.turnover.working), l: n0(row.turnover.left) });
  } else if (k === "okk" && row.okk?.total) {
    facts = fill(T.countsLine, { t: n0(row.okk.total), d: n0(row.okk.done), u: n0(row.okk.unresolved), r: n0(row.okk.repeat) });
  }
  let why = null;
  if (state === "nodata") {
    why = k === "turnover" ? (row.turnover ? T.noPeople : T.tvPast) : T.noRecords;
  } else if (state === "pending") {
    const r = rule[k];
    why = r ? fill(T.phRule, { rule: fill(k === "mentoring" ? T.phRuleMentoring : T.phRuleKru, { min: r.min }) }) : T.notYet;
  }
  const margin = v != null && (state === "pass" || state === "fail") ? marginText(k, v, state, rule, T) : null;

  return (
    <section onMouseEnter={() => setActive(k)} onMouseLeave={() => setActive(null)}
      onFocus={() => setActive(k)} onBlur={() => setActive(null)}
      className="rounded-xl px-3 py-2.5 transition-colors"
      style={{ background: on ? "var(--bg-card)" : "transparent", boxShadow: on ? "inset 0 0 0 1px var(--border-md)" : "none" }}>
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0" aria-hidden
          style={{ background: state === "pending" ? "var(--border)" : `${GATE_INK[state]}1f`, color: ink }}>
          {state === "pending" ? <CircleDashed size={15} /> : <Icon size={15} strokeWidth={2.25} />}
        </span>
        <h4 className="flex-1 min-w-0 text-sm font-medium leading-snug" style={{ color: state === "pending" ? "var(--text-3)" : "var(--text-1)" }}>
          {T.kpi[k]}
        </h4>
        <span className="text-xs font-semibold whitespace-nowrap" style={{ color: state === "pending" || state === "nodata" ? "var(--text-3)" : ink }}>{word}</span>
      </div>

      {v != null && (state === "pass" || state === "fail") && (
        <div className="pl-[38px]">
          <Gauge k={k} v={v} state={state} rule={rule} />
        </div>
      )}

      <div className="pl-[38px] space-y-0.5">
        {margin && <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{margin}</p>}
        {why && <p className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{why}</p>}
        {facts && <p className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{facts}</p>}
        {prevRow && state !== "pending" && (
          <p className="text-xs tabular-nums inline-flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-3)" }}>
            {fill(T.bdPrevLine, { v: prevV == null ? "—" : pct1(prevV), verdict: { pass: T.gPass, fail: T.gFail, nodata: T.gNoData }[prevState] || "—" })}
            {/* An arrow only where higher is better: «up» is painted green,
                and a turnover that fell must never wear a rising arrow. */}
            {prevV != null && v != null && !LOWER_PASSES[k] && (
              <Delta d={v - prevV} digits={1} title={T.bdVsPrev} />
            )}
          </p>
        )}
        {(k === "turnover" || k === "okk") && state !== "pending" && (
          <div className="pt-1 -ml-2">
            <Button size="sm" variant="ghost" onClick={() => onOpen(row, k)}>
              <span className="inline-flex items-center gap-1">
                {k === "turnover" ? T.bdCells : T.bdRecords}
                <ChevronRight size={13} aria-hidden />
              </span>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function BkpiPanel({ row, prevRow, data, live, T, onOpen }) {
  const [active, setActive] = useState(null);
  const passed = GATES.filter((k) => gateOf(row, k, live) === "pass").length;
  const prevPassed = prevRow ? GATES.filter((k) => gateOf(prevRow, k, live) === "pass").length : null;
  const ringLabel = fill(T.bdRingAria, {
    n: passed, of: row.of ?? 4,
    list: GATES.map((k) => `${T.kpi[k]}: ${{ pass: T.gPass, fail: T.gFail, nodata: T.gNoData, pending: T.notYet }[gateOf(row, k, live)]}`).join(", "),
  });
  return (
    <div className="grid gap-x-8 gap-y-4 px-2 py-4 sm:px-4 sm:py-5 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
      <div className="min-w-0 space-y-1 order-2 lg:order-1">
        <h3 className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>{T.bdCriteria}</h3>
        {GATES.map((k) => (
          <GateBlock key={k} k={k} row={row} prevRow={prevRow} data={data} live={live} T={T}
            on={active === k} setActive={setActive} onOpen={onOpen} />
        ))}
      </div>
      <aside className="order-1 lg:order-2 flex flex-col items-center text-center gap-3 lg:pt-6 px-3">
        <GateRing row={row} live={live} size={136} active={active} label={ringLabel} sub={`/ ${row.of ?? 4}`} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{fill(T.bdRingCap, { n: passed, of: row.of ?? 4, pct: row.pct ?? 0 })}</p>
          {prevPassed != null && (
            <p className="text-xs mt-1 inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
              {fill(T.bdPrevResult, { n: prevPassed, of: row.of ?? 4 })}
              <Delta d={passed - prevPassed} title={T.bdVsPrev} />
            </p>
          )}
        </div>
        <p className="text-xs leading-snug max-w-[240px]" style={{ color: "var(--text-3)" }}>{T.bdPayout}</p>
      </aside>
    </div>
  );
}
