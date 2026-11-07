import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, Repeat2, TrendingDown, ClipboardCheck } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";
import { catColor } from "./categories";
import { fill } from "../../pages/idleSolutionsText";

/**
 * «Tahlil» tab of «Kutish yechimlari» (GET /api/idle-solutions/analytics,
 * routers/idle_solutions.py): is each waiting cause SOLVED or REPEATING after
 * its written solution? The evidence is an OCCURRENCE — a working day on which
 * the cause shows up at all; minutes are the secondary figure. Verdict colours
 * are the status palette; a cause's identity is its category hue.
 */
const INK = {
  repeating: "var(--status-bad)", new: "var(--status-bad)", unanswered: "var(--status-warn)",
  early: "#94a3b8", nodata: "#94a3b8", reduced: "var(--status-warn)", solved: "var(--status-ok)", none: "#94a3b8",
};
const catCode = (n) => String(n || "").replace(/^Cat\s*/i, "");
const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");

function Chip({ ink, children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ color: ink, background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)` }}>{children}</span>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <Icon size={13} className="flex-shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: tone || "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{sub || " "}</div>
    </div>
  );
}

/** One bar per day, the solution day marked. Occurrence mode: every day it
 *  happened is a full bar (the thing being counted); minutes mode: height is
 *  that day's waiting minutes (the detail view). */
function OccStrip({ daily, marker, ink, height = 22, byMinutes = false, label }) {
  const v = daily || [];
  if (v.length < 2) return null;
  const W = 600, H = height, P = 1;
  const bw = (W - P * 2) / v.length;
  const max = Math.max(1, ...v);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {v.map((x, i) => {
        const h = x > 0 ? (byMinutes ? Math.max(5, (x / max) * (H - 3)) : H - 2) : 2;
        const after = marker != null && i > marker;
        return <rect key={i} x={P + i * bw + 0.4} y={H - h} width={Math.max(1, bw - 1)} height={h} rx={1}
          fill={marker != null && i === marker ? "var(--brand)" : after ? ink : "#94a3b8"}
          opacity={x > 0 ? 0.95 : 0.3} />;
      })}
      {marker != null && (
        <line x1={P + marker * bw + bw / 2} x2={P + marker * bw + bw / 2} y1={0} y2={H} stroke="var(--brand)"
          strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/** The one sentence a cause's row opens with — what its verdict rests on. */
function factText(c, T) {
  const j = c.j || {}, F = T.rF;
  let s;
  switch (j.verdict) {
    case "repeating":
      s = fill(F.repeating, { n: j.after_n, d: ddmm(j.last_seen) });
      if (j.relapse) s += " · " + F.relapse;
      break;
    case "new": s = fill(F.new, { n: j.after_n }); break;
    case "solved": s = fill(F.solved, { q: j.quiet, n: j.quiet_needed }); break;
    case "early": s = j.after_n === 0 && j.after_days >= 3 ? fill(F.early, { q: j.quiet, n: j.quiet_needed }) : fill(F.earlyDays, { d: j.after_days }); break;
    case "reduced": s = fill(F.reduced, { b: j.before_n, bw: j.before_wd, a: j.after_n, aw: j.after_wd }); break;
    case "none": s = F.none; break;
    case "nodata": s = F.nodata; break;
    default: s = fill(F.unanswered, { n: j.after_n || 0 });
  }
  if (c.orphans_n > 0 && j.verdict !== "unanswered") s += " · " + fill(F.orphans, { n: c.orphans_n });
  return s;
}

function CauseRow({ c, T, label }) {
  const { tl } = useTranslit();
  const [open, setOpen] = useState(false);
  const j = c.j || {};
  const ink = INK[c.status] || "#94a3b8";
  const sol = c.solution;
  const units = c.units || [];
  const unanswered = c.status === "unanswered" && !sol;
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full text-left px-4 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 hover:bg-[var(--bg-inner)] transition-colors">
        <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <div className="w-44 min-w-0 flex-1 md:flex-none">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
            <span style={{ color: catColor(c.category) }}>{c.category}</span>{" "}
            <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(catCode(c.category))}</span>
          </div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.minutes, { m: Math.round(c.minutes) })}</div>
        </div>
        <div className="order-last md:order-none basis-full md:basis-0 md:flex-1 min-w-0 pl-7 md:pl-0">
          <div className="text-xs font-medium truncate" style={{ color: "var(--text-2)" }} title={factText(c, T)}>{factText(c, T)}</div>
          <div className="mt-1"><OccStrip daily={j.daily} marker={j.marker} ink={ink} label={factText(c, T)} /></div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <Chip ink={ink}>{T.rStatus[c.status]}</Chip>
          {j.relapse && <span className="text-[11px] font-medium" style={{ color: "var(--status-bad)" }}>{T.rRelapseTag}</span>}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3" style={{ background: "var(--bg-inner)", borderTop: "1px solid var(--border)" }}>
          {sol ? (
            <div className="mb-3">
              <div className="text-sm" style={{ color: "var(--text-1)" }}>«{sol.text}»</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {ddmmyy(sol.date)}{sol.author_name ? ` · ${shortPerson(tl(sol.author_name) || sol.author_name)}` : ""}
                {` · ${T.st[sol.status] || sol.status}`}
                {sol.manager_name ? ` · ${shortPerson(tl(sol.manager_name) || sol.manager_name)}` : ""}
              </div>
            </div>
          ) : (
            <div className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{T.rNoSolution}</div>
          )}

          {!unanswered && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                [T.rBefore, fill(T.rDaysOf, { a: j.before_n, b: j.before_wd }), null],
                [T.rAfter, fill(T.rDaysOf, { a: j.after_n, b: j.after_wd }), j.after_n > 0 ? INK.repeating : INK.solved],
                [T.rQuiet, fill(T.rQuietOf, { q: j.quiet, n: j.quiet_needed }), null],
                [T.rLast, j.last_seen ? ddmmyy(j.last_seen) : "—", null],
              ].map(([k, v, tone]) => (
                <div key={k} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{k}</div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: tone || "var(--text-1)" }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          <OccStrip daily={j.daily} marker={j.marker} ink={ink} height={64} byMinutes label={factText(c, T)} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            <span>{j.daily_from ? ddmm(j.daily_from) : ""}</span>
            {!unanswered && <span style={{ color: "var(--brand-text)" }}>{T.aMarkSol}</span>}
            {!unanswered && j.min_before != null && (
              <span>{fill(T.rMinutes, { b: Math.round(j.min_before), a: Math.round(j.min_after) })}</span>
            )}
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider pt-3 pb-1" style={{ color: "var(--text-3)" }}>
            {unanswered ? T.rUnitsTitleUn : T.rUnitsTitle}
          </div>
          {units.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.aWhoNone}</div>
          ) : units.map((u) => (
            <div key={u.manager_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="w-44 min-w-0 flex-1 sm:flex-none">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{shortPerson(tl(u.manager_name) || u.manager_name)}</div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                  {u.cell ? `${T.aCellShort} ${u.cell} · ${fill(T.rUnitDays, { n: u.cell_days })}` : "—"}
                </div>
              </div>
              <div className="flex-1 min-w-0 text-xs tabular-nums" style={{ color: u.days > 0 && !unanswered ? INK.repeating : "var(--text-2)" }}>
                <span className="font-bold">{fill(T.rUnitDays, { n: u.days })}</span>
                {u.last_seen ? ` · ${T.rLast.toLowerCase()} ${ddmm(u.last_seen)}` : ""}
                <span style={{ color: "var(--text-3)" }}> · {Math.round(u.minutes)} {T.aMinShort}</span>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                {!u.covered && <span className="text-[11px] font-medium" style={{ color: INK.unanswered }}>{T.rUncovered}</span>}
                {u.verdict && <Chip ink={INK[u.verdict] || "#94a3b8"}>{T.rStatus[u.verdict]}</Chip>}
              </div>
            </div>
          ))}
          {c.rethink && (
            <div className="mt-3 text-xs font-medium flex items-start gap-1.5" style={{ color: "var(--status-bad)" }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-px" /> {T.rAdvice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// TEMP-DEMO (remove when the operator says so): invented causes covering every
// verdict, so the new logic can be previewed. Anchored to today, not the filter.
function tempDemo(d) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const iso = (off) => { const x = new Date(today); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
  const BEFORE = 28;
  const build = ({ category, back, before, after, text, status, who, units, minutes }) => {
    const len = BEFORE + 1 + back;
    const daily = Array.from({ length: len }, (_, i) => (i < BEFORE ? before(i) : i === BEFORE ? 0 : after(i - BEFORE)));
    const ob = daily.slice(0, BEFORE).filter((x) => x > 0).length;
    const oaIdx = daily.map((x, i) => (i > BEFORE && x > 0 ? i - BEFORE : null)).filter((x) => x != null);
    const need = ob ? Math.min(28, Math.max(7, Math.ceil((3 * BEFORE) / ob))) : 7;
    const lastK = oaIdx.length ? oaIdx[oaIdx.length - 1] : null;
    const quiet = lastK == null ? back : back - lastK;
    const rb = ob / BEFORE, ra = back ? oaIdx.length / back : 0;
    let verdict = back < 3 ? "early" : !ob ? (oaIdx.length ? "new" : "none") : !oaIdx.length ? (quiet >= need ? "solved" : "early")
      : back >= 7 && ra <= rb * 0.5 ? "reduced" : "repeating";
    const relapse = !!ob && oaIdx.length > 0 && oaIdx[0] - 1 >= need;
    const from = -(BEFORE + back);
    const j = {
      verdict, date: iso(-back), before_n: ob, before_wd: BEFORE, after_n: oaIdx.length, after_wd: back, after_days: back,
      quiet_needed: need, quiet, last_seen: lastK == null ? null : iso(-(back - lastK)), relapse,
      min_before: daily.slice(0, BEFORE).reduce((x, y) => x + y, 0), min_after: daily.slice(BEFORE + 1).reduce((x, y) => x + y, 0),
      daily, daily_from: iso(from), marker: BEFORE,
    };
    const sol = { id: 900 + back, text, status, author_name: who, date: iso(-back), manager_id: null, manager_name: null };
    return { category, minutes, status: verdict, j, solution: sol, solutions_n: 1, orphans_n: 0, units,
      rethink: ["doing", "done"].includes(status) && ["repeating", "new"].includes(verdict) };
  };
  const unit = (id, name, cell, days, cellDays, min, last, covered = true) => ({
    manager_id: id, manager_name: name, minutes: min, days, last_seen: last ? iso(-last) : null, cell, cell_days: cellDays,
    verdict: null, covered, since: null,
  });
  const noise = (i, k) => 14 + ((i * 7 + k * 5) % 17);
  const causes = [
    build({ category: "Cat D3", back: 20, text: "Otdel bilan kelishuv grafigi tuzildi", status: "doing", who: "A. Aripova", minutes: 640,
      before: (i) => (i % 2 === 0 ? noise(i, 1) : 0), after: (k) => ([2, 5, 7, 12, 15, 18].includes(k) ? noise(k, 2) : 0),
      units: [unit(801, "R. Kamola", "8613", 5, 4, 310, 2), unit(802, "K. Nargiza", "8623", 3, 3, 190, 5), unit(803, "I. Sayyora", "7424", 1, 1, 60, 11)] }),
    build({ category: "Cat E", back: 30, text: "Yetkazib beruvchi bilan yangi jadval", status: "done", who: "B. Karimov", minutes: 410,
      before: (i) => (i % 3 === 0 ? noise(i, 3) : 0), after: (k) => ([27, 29].includes(k) ? noise(k, 4) : 0),
      units: [unit(804, "S. Dilnoza", "7101", 2, 2, 150, 1)] }),
    build({ category: "Cat I", back: 21, text: "Smena topshirish ro'yxati kiritildi", status: "done", who: "I. Sayyora", minutes: 280,
      before: (i) => (i % 2 === 0 ? noise(i, 5) : 0), after: (k) => (k % 6 === 0 ? noise(k, 6) : 0),
      units: [unit(805, "I. Sayyora", "7424", 3, 3, 90, 3)] }),
    build({ category: "Cat K", back: 10, text: "Ehtiyot qismlar zaxirasi to'ldirildi", status: "done", who: "N. Aziz", minutes: 120,
      before: (i) => ([3, 12, 21].includes(i) ? noise(i, 7) : 0), after: () => 0, units: [] }),
    build({ category: "Cat B", back: 24, text: "Oborudovaniya navbatchi texnik biriktirildi", status: "done", who: "R. Kamola", minutes: 520,
      before: (i) => (i % 2 === 1 ? noise(i, 8) : 0), after: () => 0, units: [] }),
  ];
  const fd = Array.from({ length: 30 }, (_, i) => ([1, 4, 6, 9, 13, 14, 20, 24, 27].includes(i) ? noise(i, 9) : 0));
  causes.push({
    category: "Cat F", minutes: 360, status: "unanswered", solution: null, solutions_n: 0, orphans_n: 0, rethink: false,
    j: { verdict: "unanswered", after_n: 9, after_wd: 30, last_seen: iso(-2), quiet: null, relapse: false, daily: fd, daily_from: iso(-29), marker: null },
    units: [unit(806, "K. Nargiza", "8623", 6, 4, 220, 2, false), unit(807, "R. Kamola", "8613", 3, 2, 140, 6, false)],
  });
  const order = ["repeating", "new", "unanswered", "early", "nodata", "reduced", "solved", "none"];
  causes.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const counts = {};
  causes.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
  return { ...d, causes, counts, rethink_n: causes.filter((x) => x.rethink).length };
}

export default function SolutionAnalytics({ T, data: realData, label }) {
  const data = tempDemo(realData); // TEMP-DEMO
  const c = data.counts || {};
  const causes = data.causes || [];
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi icon={Repeat2} label={T.rKpi.repeating} value={(c.repeating || 0) + (c.new || 0)}
          sub={T.rKpiSub.repeating} tone={(c.repeating || 0) + (c.new || 0) ? INK.repeating : undefined} />
        <Kpi icon={TrendingDown} label={T.rKpi.reduced} value={c.reduced || 0} sub={T.rKpiSub.reduced} tone={c.reduced ? INK.reduced : undefined} />
        <Kpi icon={CheckCircle2} label={T.rKpi.solved} value={c.solved || 0} sub={T.rKpiSub.solved} tone={c.solved ? INK.solved : undefined} />
        <Kpi icon={Clock} label={T.rKpi.early} value={(c.early || 0) + (c.nodata || 0)} sub={T.rKpiSub.early} />
        <Kpi icon={ClipboardCheck} label={T.rKpi.unanswered} value={c.unanswered || 0} sub={T.rKpiSub.unanswered} tone={c.unanswered ? INK.unanswered : undefined} />
      </div>

      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Repeat2} title={T.rSec} right={fill(T.aRows, { n: causes.length })} />
        {causes.length === 0 ? (
          <div className="px-4 py-6 text-xs" style={{ color: "var(--text-3)" }}>{T.empty}</div>
        ) : causes.map((x) => <CauseRow key={x.category} c={x} T={T} label={label} />)}
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)", color: "var(--text-2)" }}>
          <span>{T.rLegend}</span>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {fill(T.rMethod, { b: data.before_days, x: data.quiet_x, lo: data.min_quiet, hi: data.max_quiet, d: data.reduced_drop, e: data.early_days })}
      </p>
    </>
  );
}
