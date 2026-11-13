// «Liderlar KPI» — the technologists'-audit tab («Audit», live from 2026-11-06):
// the month's average audit rating over the ranking's cells as the one summary
// (the source and its newest audit on the muted line), then the ranking (one
// row per owned cell, lowest average first) or every audit of the month behind
// the card's own view switch, and folded under the ranking whatever counted
// toward nobody. Every figure is the board payload's — the rows' `audit` and
// the `audit` half, which IS `tech_audit.month_payload`; nothing is computed
// here. A source the server cannot read is said in its own words, never «0».
import { useMemo, useState } from "react";
import { ClipboardCheck, DatabaseZap } from "lucide-react";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/leadersKpiText";
import { Count, EmptyRow, MobileRow, Notes, RulesButton, ScoreChip, Summary, ViewHead } from "./KpiBits";
import KpiRulesModal from "./KpiRulesModal";
import { auditScoreOf, dmy, fracTone, maxScore, n0, pct1, pts, sortRows, toneInk, useSort } from "./kpiUtil";

export default function AuditTab({ T, tl, tx, data, rows, needle, onExplain }) {
  const au = data?.audit || {};
  const src = au.source || {};
  const tot = au.totals;
  const max = maxScore(data?.rules, "audit");
  const [view, setView] = usePersistentState("lkpi.aView", "ranking");
  const [sortR, onSortR] = useSort("lkpi.sortA", { key: "pct", dir: "asc" });
  const [sortL, onSortL] = useSort("lkpi.sortAL", { key: "date", dir: "desc" });
  const [rulesOpen, setRulesOpen] = useState(false);

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];

  const ranking = useMemo(() => sortRows(
    rows.filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir))), sortR, (x, k) => ({
      code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
      audits: x.audit?.audits, pct: x.audit?.pct, min: x.audit?.min,
      score: x.audit?.score, points: x.audit?.points,
    })[k]), [rows, needle, sortR, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  const counted = (a) => ({
    owner: T.auCountedOwner, no_owner: T.auCountedNoOwner, no_cell: T.auCountedNoCell,
  })[a.counted] || a.counted;

  const audits = useMemo(() => sortRows(
    (au.audits || []).filter((a) => has(a.code, a.division, ...nameBoth(a.owner), a.foreman)), sortL, (a, k) => ({
      date: a.date, code: a.code, division: a.division, owner: a.owner ? tl(a.owner) : "",
      foreman: a.foreman, rating: a.rating, counted: counted(a),
    })[k]), [au.audits, needle, sortL]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src.ok) {
    const why = src.why || "missing";
    return (
      <EmptyState icon={DatabaseZap} tone={why === "error" ? "danger" : undefined}
        title={why === "no_read" ? T.auNoReadTitle : why === "error" ? T.auErrorTitle : T.auMissingTitle}
        message={why === "no_read" ? T.auNoReadMsg : why === "error" ? fill(T.auErrorMsg, { e: src.error || "?" }) : T.auMissingMsg}
        showUploadLink={false} />
    );
  }

  const notices = [];
  if (tot) {
    if (tot.no_audit_cells) notices.push(fill(T.auNNoAudit, { n: n0(tot.no_audit_cells) }));
    if (tot.no_owner) notices.push(fill(T.auNNoOwner, { n: n0(tot.no_owner) }));
    const unreg = au.unregistered || [];
    if (unreg.length) {
      const list = unreg.slice(0, 8).map((u) => `${u.division} (${u.count})`).join(", ")
        + (unreg.length > 8 ? ` +${unreg.length - 8}` : "");
      notices.push(fill(T.auNUnreg, { n: n0(tot.no_cell), list }));
    }
  }

  const summary = (
    <Summary value={tot?.pct == null ? "—" : pct1(tot.pct)}
      label={tot?.pct == null ? T.figAuditNone
        : `${T.sumAudit} · ${fill(T.sumAuditOf, { n: n0(tot.ranked_audits), c: n0(tot.scored_cells) })}`}
      meta={[data?.state === "open" && T.notOver, src.last ? fill(T.auSrc, { d: dmy(src.last) }) : T.auSrcNone]}
      actions={<RulesButton label={T.rulesBtn} onClick={() => setRulesOpen(true)} />} />
  );

  const head = (right) => (
    <ViewHead value={view} onChange={setView} ariaLabel={T.kpi.audit} right={right}
      options={[["ranking", T.auTabRanking], ["audits", T.auTabAudits]]} />
  );

  const pctCell = (x) => {
    const a = x.audit || {};
    if (a.pct == null) return <span style={{ color: "var(--text-4)" }}>{T.auNoAudit}</span>;
    return <span className="font-semibold" style={{ color: toneInk(fracTone(a.score, max)) }}>{pct1(a.pct)}</span>;
  };

  const rankingTable = (
    <TableCard head={head(<Count>{fill(T.countLine, { o: n0(new Set(rows.map((x) => x.owner_id).filter(Boolean)).size), c: n0(rows.length) })}</Count>)}
      footer={notices.length ? <Notes notes={notices} label={fill(T.notesN, { n: notices.length })} /> : null}
      mobile={ranking.length ? ranking.map((x) => (
        <MobileRow key={x.key} onClick={() => onExplain("audit", x)}
          title={<span className="tabular-nums">{x.code} · {x.owner ? tl(x.owner) : "—"}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={x.audit?.audits ? fill(T.auRows, { n: n0(x.audit.audits) }) : T.figAuditNone}
          right={<><span className="text-sm tabular-nums">{pctCell(x)}</span><ScoreChip score={x.audit?.score} size="sm" max={max} /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colCell} k="code" sort={sortR} onSort={onSortR} />
          <Th label={T.colOwner} k="owner" sort={sortR} onSort={onSortR} hint={T.hOwner} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortR} onSort={onSortR} />
          <Th label={T.auColAudits} k="audits" sort={sortR} onSort={onSortR} align="right" hint={T.auHAudits} />
          <Th label={T.auColPct} k="pct" sort={sortR} onSort={onSortR} align="right" hint={T.auHPct} />
          <Th label={T.auColMin} k="min" sort={sortR} onSort={onSortR} align="right" hint={T.auHMin} />
          <Th label={T.colScore} k="score" sort={sortR} onSort={onSortR} align="center" />
          <Th label={T.colPoints} k="points" sort={sortR} onSort={onSortR} align="right" />
        </tr>
      </thead>
      <tbody>
        {ranking.length === 0 ? <EmptyRow cols={8} text={T.nothing} /> : ranking.map((x) => {
          const a = x.audit || {};
          return (
            <tr key={x.key} className="cursor-pointer" onClick={() => onExplain("audit", x)}>
              <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
              <td className="px-3 py-2 whitespace-nowrap">
                <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                  style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); onExplain("audit", x); }}>
                  {x.owner ? tl(x.owner) : "—"}
                </button>
              </td>
              <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{n0(a.audits ?? 0)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{pctCell(x)}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{a.min == null ? "—" : pct1(a.min)}</td>
              <td className="px-3 py-1.5 text-center"><ScoreChip score={a.score} size="sm" max={max} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{a.points == null ? "0" : pts(a.points)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableCard>
  );

  const ratingInk = (v) => toneInk(fracTone(auditScoreOf(v, data?.rules?.audit), max));
  const auditsTable = (
    <TableCard head={head(<Count>{fill(T.auRows, { n: n0(audits.length) })}</Count>)}
      mobile={audits.length ? audits.map((a, i) => (
        <div key={`${a.date}-${a.division}-${i}`} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium min-w-0 truncate" style={{ color: "var(--text-1)" }}>{a.division}</span>
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: ratingInk(a.rating) }}>{pct1(a.rating)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{dmy(a.date)}</span>
            <span className="tabular-nums">{a.code || "—"}</span>
            <span>{a.owner ? tl(a.owner) : "—"}</span>
            <span style={{ color: a.counted === "owner" ? "var(--text-3)" : "var(--status-warn)" }}>{counted(a)}</span>
          </div>
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{(au.audits || []).length ? T.nothing : T.auNoneAudits}</p>}>
      <thead>
        <tr>
          <Th label={T.auColDate} k="date" sort={sortL} onSort={onSortL} align="center" />
          <Th label={T.colCell} k="code" sort={sortL} onSort={onSortL} />
          <Th label={T.auColDivision} k="division" sort={sortL} onSort={onSortL} hint={T.auHDivision} />
          <Th label={T.colOwner} k="owner" sort={sortL} onSort={onSortL} hint={T.hOwner} />
          <Th label={T.auColForeman} k="foreman" sort={sortL} onSort={onSortL} hint={T.auHForeman} />
          <Th label={T.auColRating} k="rating" sort={sortL} onSort={onSortL} align="right" />
          <Th label={T.auColCounted} k="counted" sort={sortL} onSort={onSortL} />
        </tr>
      </thead>
      <tbody>
        {audits.length === 0 ? <EmptyRow cols={7} text={(au.audits || []).length ? T.nothing : T.auNoneAudits} /> : audits.map((a, i) => (
          <tr key={`${a.date}-${a.division}-${i}`}>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(a.date)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{a.cell_id ? <CellLink id={a.cell_id}>{a.code}</CellLink> : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[16rem] truncate" title={a.division}>{a.division || "—"}</span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: a.owner ? "var(--text-2)" : "var(--text-3)" }}>{a.owner ? tl(a.owner) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[12rem] truncate" title={a.foreman || ""}>{a.foreman ? tx(a.foreman) : "—"}</span>
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: ratingInk(a.rating) }}>{pct1(a.rating)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: a.counted === "owner" ? "var(--text-2)" : "var(--status-warn)" }}>{counted(a)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  return (
    <>
      {summary}
      {view === "audits" ? auditsTable : rankingTable}
      {rulesOpen && <KpiRulesModal open only="audit" onClose={() => setRulesOpen(false)} data={data} T={T} />}
    </>
  );
}

