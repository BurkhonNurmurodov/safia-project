// «Liderlar KPI» — the plan-fulfilment tab («Plan», 2026-10-23): the month's
// fulfilment over the rows as the one summary, then the ranking (one row per
// owned cell, worst % first); a row opens the cell's working (PlanExplain).
// The figures are the board's own — `leaders_kpi._plan_by_cell`, the
// «Plan Bajarish» page's computation — nothing is computed here. Not one of
// HR's five: while its weight is 0 the summary says it adds nothing to the total.
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import { fill } from "../../pages/leadersKpiText";
import { Count, EmptyRow, MobileRow, Notes, RulesButton, ScoreChip, Summary } from "./KpiBits";
import KpiRulesModal from "./KpiRulesModal";
import { n0, pts, scoreTone, sortRows, toneInk, useSort } from "./kpiUtil";

export default function PlanTab({ T, tl, data, rows, needle, onExplain }) {
  const [sort, onSort] = useSort("lkpi.sortP", { key: "pct0", dir: "asc" });
  const [rulesOpen, setRulesOpen] = useState(false);
  const p = data?.plan || {};
  const rule = data?.rules?.plan;
  const w0 = !(Number(rule?.weight) > 0);

  if (p.before_floor) {
    return <EmptyState icon={CalendarClock} title={T.plBeforeTitle} message={T.plBeforeMsg} showUploadLink={false} />;
  }

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const list = sortRows(rows.filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir))), sort, (x, k) => ({
    code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
    plan: x.plan?.plan, actual: x.plan?.actual, short: x.plan?.short, pct0: x.plan?.pct0,
    days: x.plan?.days, score: x.plan?.score, points: x.plan?.points,
  })[k]);

  const label = p.pct0 == null ? T.figPlanNone
    : [T.sumPlan, fill(T.sumPlanOf, { a: n0(p.actual), p: n0(p.plan) }),
      p.short ? fill(T.sumPlanShort, { n: n0(p.short) }) : null].filter(Boolean).join(" · ");
  const summary = (
    <Summary value={p.pct0 == null ? "—" : `${p.pct0}%`} label={label}
      meta={[data?.state === "open" && T.notOver, w0 && T.plW0, T.plSrc]}
      actions={<RulesButton label={T.rulesBtn} onClick={() => setRulesOpen(true)} />} />
  );

  const notes = [
    p.clamped && T.plNClamped,
    p.no_plan_cells ? fill(T.plNNoPlan, { n: n0(p.no_plan_cells) }) : null,
    p.no_fact_days ? fill(T.plNNoFact, { n: n0(p.no_fact_days) }) : null,
  ].filter(Boolean);

  const pctCell = (x) => {
    const k = x.plan || {};
    if (k.pct0 == null) return <span style={{ color: "var(--text-4)" }}>{T.plNoPlan}</span>;
    return <span className="font-semibold" style={{ color: toneInk(scoreTone(k.score)) }}>{k.pct0}%</span>;
  };

  const head = (
    <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap px-4 py-2.5"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.plTitle}</h2>
      <Count>{fill(T.countLine, { o: n0(new Set(rows.map((x) => x.owner_id)).size), c: n0(rows.length) })}</Count>
    </div>
  );

  return (
    <>
      {summary}
      <TableCard head={head}
        footer={notes.length ? <Notes notes={notes} label={fill(T.notesN, { n: notes.length })} /> : null}
        mobile={list.length ? list.map((x) => (
          <MobileRow key={x.key} onClick={() => onExplain("plan", x)}
            title={<span className="tabular-nums">{x.code} · {x.owner ? tl(x.owner) : "—"}</span>}
            sub={x.brigadir ? tl(x.brigadir) : ""}
            foot={x.plan?.pct0 == null ? T.figPlanNone : fill(T.sumPlanOf, { a: n0(x.plan.actual), p: n0(x.plan.plan) })}
            right={<><span className="text-sm tabular-nums">{pctCell(x)}</span><ScoreChip score={x.plan?.score} size="sm" /></>} />
        )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
        <thead>
          <tr>
            <Th label={T.colCell} k="code" sort={sort} onSort={onSort} />
            <Th label={T.colOwner} k="owner" sort={sort} onSort={onSort} hint={T.hOwner} />
            <Th label={T.colBrigadir} k="brigadir" sort={sort} onSort={onSort} />
            <Th label={T.plColPlan} k="plan" sort={sort} onSort={onSort} align="right" hint={T.plHPlan} />
            <Th label={T.plColFact} k="actual" sort={sort} onSort={onSort} align="right" hint={T.plHFact} />
            <Th label={T.plColShort} k="short" sort={sort} onSort={onSort} align="right" hint={T.plHShort} />
            <Th label={T.plColPct} k="pct0" sort={sort} onSort={onSort} align="right" hint={T.plHPct} />
            <Th label={T.plColDays} k="days" sort={sort} onSort={onSort} align="right" hint={T.plHDays} />
            <Th label={T.colScore} k="score" sort={sort} onSort={onSort} align="center" />
            <Th label={T.colPoints} k="points" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? <EmptyRow cols={10} text={T.nothing} /> : list.map((x) => {
            const k = x.plan || {};
            return (
              <tr key={x.key} className="cursor-pointer" onClick={() => onExplain("plan", x)}>
                <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                    style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); onExplain("plan", x); }}>
                    {x.owner ? tl(x.owner) : "—"}
                  </button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{k.pct0 == null ? "—" : n0(k.plan)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{k.pct0 == null ? "—" : n0(k.actual)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: k.short ? "var(--status-bad)" : "var(--text-2)" }}>
                  {k.pct0 == null ? "—" : n0(k.short)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{pctCell(x)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{n0(k.days ?? 0)}</td>
                <td className="px-3 py-1.5 text-center"><ScoreChip score={k.score} size="sm" /></td>
                <td className="px-3 py-2 text-right tabular-nums">{k.points == null ? "0" : pts(k.points)}</td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      {rulesOpen && <KpiRulesModal open only="plan" onClose={() => setRulesOpen(false)} data={data} T={T} />}
    </>
  );
}
