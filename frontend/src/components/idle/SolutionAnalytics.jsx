import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Repeat2 } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
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

/** One cell per day, like a calendar strip. A day the cause happened is a full
 *  cell (the thing being counted), a quiet day a low faint one; grey before the
 *  solution, gold on the day it was written, coloured after. Hover = date. */
function DayCells({ daily, from, marker, ink, h = 18, label }) {
  const v = daily || [];
  if (v.length < 2) return null;
  const t0 = from ? Date.parse(from) : null;
  return (
    <div className="flex items-end gap-px w-full" style={{ height: h }} role="img" aria-label={label}>
      {v.map((x, i) => {
        const mark = marker != null && i === marker;
        const after = marker != null && i > marker;
        const d = t0 == null ? "" : new Date(t0 + i * 864e5).toISOString().slice(5, 10).split("-").reverse().join(".");
        return (
          <span key={i} title={x > 0 ? `${d} · ${Math.round(x)}` : d}
            className="flex-1 min-w-[2px] max-w-[12px] rounded-[2px]"
            style={{ height: mark || x > 0 ? "100%" : "28%", background: mark ? "var(--brand)" : after ? ink : "#94a3b8", opacity: mark || x > 0 ? 1 : 0.28 }} />
        );
      })}
    </div>
  );
}

/** The one figure a row is read by, in the verdict's own words. */
function bigText(c, T) {
  const j = c.j || {}, B = T.rBig;
  switch (j.verdict) {
    case "repeating": return fill(B.repeating, { n: j.after_n });
    case "new": return fill(B.repeating, { n: j.after_n });
    case "solved": return fill(B.solved, { q: j.quiet });
    case "early": return j.after_days >= 3 && j.after_n === 0 ? fill(B.early, { q: j.quiet, n: j.quiet_needed }) : fill(B.earlyDays, { d: j.after_days });
    case "reduced": return fill(B.reduced, { a: j.after_n, aw: j.after_wd });
    case "unanswered": return fill(B.unanswered, { n: j.after_n || 0 });
    default: return "—";
  }
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
  const unanswered = !sol;
  const fact = factText(c, T);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={fact}
        className="w-full text-left px-4 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 hover:bg-[var(--bg-inner)] transition-colors"
        style={{ boxShadow: `inset 3px 0 0 ${ink}` }}>
        <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <div className="min-w-0 flex-1 md:flex-none md:w-48">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
            <span style={{ color: catColor(c.category) }}>{c.category}</span>{" "}
            <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(catCode(c.category))}</span>
          </div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.minutes, { m: Math.round(c.minutes) })}</div>
        </div>
        <div className="order-last md:order-none basis-full md:basis-0 md:flex-1 min-w-0 pl-7 md:pl-0">
          <DayCells daily={j.daily} from={j.daily_from} marker={j.marker} ink={ink} label={fact} />
        </div>
        <div className="flex-shrink-0 text-right md:w-36">
          <div className="text-sm font-bold tabular-nums leading-tight" style={{ color: ink }}>{bigText(c, T)}</div>
          <div className="text-[11px] font-medium" style={{ color: j.relapse ? INK.repeating : "var(--text-3)" }}>
            {j.relapse ? T.rRelapseTag : T.rStatus[c.status]}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3" style={{ background: "var(--bg-inner)", borderTop: "1px solid var(--border)" }}>
          <div className="text-sm font-medium mb-2" style={{ color: ink }}>{fact}</div>
          <DayCells daily={j.daily} from={j.daily_from} marker={j.marker} ink={ink} h={44} label={fact} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            <span>{j.daily_from ? ddmm(j.daily_from) : ""}</span>
            {!unanswered && <span style={{ color: "var(--brand-text)" }}>{T.aMarkSol} · {ddmm(sol.date)}</span>}
            <span>{ddmm(j.daily_from ? new Date(Date.parse(j.daily_from) + ((j.daily || []).length - 1) * 864e5).toISOString().slice(0, 10) : "")}</span>
          </div>
          {sol ? (
            <div className="mt-3">
              <div className="text-sm" style={{ color: "var(--text-1)" }}>«{sol.text}»</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {ddmmyy(sol.date)}{sol.author_name ? ` · ${shortPerson(tl(sol.author_name) || sol.author_name)}` : ""}
                {` · ${T.st[sol.status] || sol.status}`}
                {sol.manager_name ? ` · ${shortPerson(tl(sol.manager_name) || sol.manager_name)}` : ""}
              </div>
            </div>
          ) : (
            <div className="text-xs mt-3" style={{ color: "var(--text-3)" }}>{T.rNoSolution}</div>
          )}
          {c.rethink && (
            <div className="mt-2 text-xs font-medium flex items-start gap-1.5" style={{ color: "var(--status-bad)" }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-px" /> {T.rAdvice}
            </div>
          )}
          {units.length > 0 && (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wider pt-3 pb-1" style={{ color: "var(--text-3)" }}>
                {unanswered ? T.rUnitsTitleUn : T.rUnitsTitle}
              </div>
              {units.map((u) => (
                <div key={u.manager_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{shortPerson(tl(u.manager_name) || u.manager_name)}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                      {u.cell ? `${T.aCellShort} ${u.cell}` : "—"}{u.last_seen ? ` · ${T.rLast.toLowerCase()} ${ddmm(u.last_seen)}` : ""}
                      {` · ${Math.round(u.minutes)} ${T.aMinShort}`}
                    </div>
                  </div>
                  {!u.covered && <span className="text-[11px] font-medium" style={{ color: INK.unanswered }}>{T.rUncovered}</span>}
                  <span className="text-sm font-bold tabular-nums w-16 text-right" style={{ color: u.days > 0 ? ink : "var(--text-3)" }}>{fill(T.rUnitDays, { n: u.days })}</span>
                </div>
              ))}
            </>
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

// the five groups a reader sorts causes into, worst first
const GROUPS = [
  ["repeating", ["repeating", "new"]],
  ["unanswered", ["unanswered"]],
  ["reduced", ["reduced"]],
  ["early", ["early", "nodata", "none"]],
  ["solved", ["solved"]],
];

export default function SolutionAnalytics({ T, data: realData, label }) {
  const data = tempDemo(realData); // TEMP-DEMO
  const [f, setF] = useState("all");
  const causes = data.causes || [];
  const n = (keys) => causes.filter((x) => keys.includes(x.status)).length;
  const rep = n(["repeating", "new"]);
  const shown = f === "all" ? causes : causes.filter((x) => GROUPS.find((g) => g[0] === f)?.[1].includes(x.status));
  const options = [["all", `${T.rAll} · ${causes.length}`],
    ...GROUPS.filter(([, ks]) => n(ks) > 0).map(([k, ks]) => [k, `${T.rKpi[k]} · ${n(ks)}`])];
  const safeF = options.some(([k]) => k === f) ? f : "all";
  return (
    <>
      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="text-base font-bold" style={{ color: rep ? INK.repeating : INK.solved }}>
          {causes.length === 0 ? T.empty : rep ? fill(T.rHeadline, { n: rep, t: causes.length }) : T.rHeadlineOk}
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden mt-3 gap-px" aria-hidden="true" style={{ background: "var(--border)" }}>
          {GROUPS.map(([k, ks]) => n(ks) > 0 && (
            <div key={k} style={{ width: `${(100 * n(ks)) / causes.length}%`, background: INK[k] }} title={`${T.rKpi[k]} · ${n(ks)}`} />
          ))}
        </div>
        <div className="mt-3"><SegmentedToggle value={safeF} onChange={setF} options={options} /></div>
      </div>

      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Repeat2} title={T.rSec} right={fill(T.aRows, { n: shown.length })} />
        {shown.length === 0 ? (
          <div className="px-4 py-6 text-xs" style={{ color: "var(--text-3)" }}>{T.empty}</div>
        ) : shown.map((x) => <CauseRow key={x.category} c={x} T={T} label={label} />)}
        <div className="px-4 py-2.5 text-[11px]"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)", color: "var(--text-2)" }}>
          {T.rLegend}
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {fill(T.rMethod, { b: data.before_days, x: data.quiet_x, lo: data.min_quiet, hi: data.max_quiet, d: data.reduced_drop, e: data.early_days })}
      </p>
    </>
  );
}
