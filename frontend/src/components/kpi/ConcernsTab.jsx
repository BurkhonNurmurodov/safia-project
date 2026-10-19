// «Liderlar KPI» — the concerns tab: the month's filings in four figures and
// the rule, then the ranking (one row per owned cell, worst % first) or the
// register behind a toggle. A row opens the cell's dialog.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award } from "lucide-react";
import CellLink from "../ui/CellLink";
import SegmentedToggle from "../ui/SegmentedToggle";
import TableCard, { Th } from "../ui/DataTable";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/leadersKpiText";
import { Figure, MobileRow, ScoreChip, StripCard, EmptyRow } from "./KpiBits";
import { ConcernDetailModal, ConcernsRegister } from "./ConcernsPieces";
import { bandLines, n0, pts, scoreTone, sortRows, toneInk, useSort, w100 } from "./kpiUtil";

export default function ConcernsTab({ T, t, tl, data, rows, needle, listParams, onOpenCell, mayConcerns }) {
  const navigate = useNavigate();
  const [view, setView] = usePersistentState("lkpi.cView", "ranking");
  const [sort, onSort] = useSort("lkpi.sortC", { key: "pct0", dir: "asc" });
  const [detail, setDetail] = useState(null);
  const c = data?.concerns || {};
  const rule = data?.rules?.concerns;

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const list = sortRows(rows.filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir))), sort, (x, k) => ({
    code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
    filed: x.concerns.total, done: x.concerns.done, uplifted: x.concerns.uplifted, open: x.concerns.open,
    pct0: x.concerns.pct0, score: x.concerns.score, points: x.concerns.points,
  })[k]);

  const strip = (
    <StripCard className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="flex items-start gap-6 flex-wrap">
        <Figure label={T.cFiled} value={n0(c.total ?? 0)} />
        <Figure label={T.cDone} value={n0(c.done ?? 0)} tone="var(--status-ok)" />
        <Figure label={T.cUplifted} value={n0(c.uplifted ?? 0)} />
        <Figure label={T.cOpen} value={n0(c.open ?? 0)} tone={c.open ? "var(--status-bad)" : undefined} />
      </div>
      <div className="min-w-0 flex-1 basis-[20rem] text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
        <p style={{ color: "var(--text-2)" }}>{T.cRule}</p>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 tabular-nums">
          {bandLines("concerns", rule).map(([label, score], i) => (
            <span key={i} className="whitespace-nowrap">{label ? `${label} → ` : "→ "}<span className="font-semibold" style={{ color: toneInk(scoreTone(score)) }}>{score}</span></span>
          ))}
          <span className="whitespace-nowrap">· KPI = {T.colScore.toLowerCase()} × {w100(rule)}%</span>
        </p>
      </div>
    </StripCard>
  );

  const pctCell = (x) => {
    const k = x.concerns;
    if (!k.total) return <span style={{ color: "var(--text-4)" }}>{T.cNoConcern}</span>;
    if (!k.rated) return <span style={{ color: "var(--text-3)" }}>{T.cNoPct}</span>;
    return <span className="font-semibold" style={{ color: toneInk(scoreTone(k.score)) }}>{k.pct0}%</span>;
  };

  const ranking = (
    <TableCard icon={Award} title={T.cRanking}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.countLine, { o: n0(new Set(rows.map((x) => x.owner_id)).size), c: n0(rows.length) })}</span>}
      footer={data?.state === "open" ? <span className="text-xs" style={{ color: "var(--status-warn)" }}>{T.provisional}</span> : null}
      mobile={list.length ? list.map((x, i) => (
        <MobileRow key={x.key} onClick={() => onOpenCell(x)}
          title={<span className="tabular-nums">{i + 1}. {x.code} · {x.owner ? tl(x.owner) : "—"}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={x.concerns.total ? `${fill(T.cOf, { done: n0(x.concerns.done), rated: n0(x.concerns.rated) })}${x.concerns.uplifted ? ` · ${T.cUplifted.toLowerCase()} ${n0(x.concerns.uplifted)}` : ""}` : T.figConcernsNone}
          right={<><span className="text-sm tabular-nums">{pctCell(x)}</span><ScoreChip score={x.concerns.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colN} align="center" cls="w-10" />
          <Th label={T.colCell} k="code" sort={sort} onSort={onSort} />
          <Th label={T.colOwner} k="owner" sort={sort} onSort={onSort} hint={T.hOwner} />
          <Th label={T.colBrigadir} k="brigadir" sort={sort} onSort={onSort} />
          <Th label={T.cColFiled} k="filed" sort={sort} onSort={onSort} align="right" />
          <Th label={T.cColDone} k="done" sort={sort} onSort={onSort} align="right" />
          <Th label={T.cColUplifted} k="uplifted" sort={sort} onSort={onSort} align="right" hint={T.cUpHint} />
          <Th label={T.cColOpen} k="open" sort={sort} onSort={onSort} align="right" />
          <Th label={T.cColPct} k="pct0" sort={sort} onSort={onSort} align="right" hint={T.cRule} />
          <Th label={T.colScore} k="score" sort={sort} onSort={onSort} align="center" />
          <Th label={T.colPoints} k="points" sort={sort} onSort={onSort} align="right" />
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? <EmptyRow cols={11} text={T.nothing} /> : list.map((x, i) => (
          <tr key={x.key} className="cursor-pointer" onClick={() => onOpenCell(x)}>
            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{i + 1}</td>
            <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); onOpenCell(x); }}>
                {x.owner ? tl(x.owner) : "—"}
              </button>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.concerns.total)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.concerns.done)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{n0(x.concerns.uplifted)}</td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: x.concerns.open ? "var(--status-bad)" : "var(--text-2)" }}>{n0(x.concerns.open)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{pctCell(x)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={x.concerns.score} size="sm" /></td>
            <td className="px-3 py-2 text-right tabular-nums">{x.concerns.points == null ? "0" : pts(x.concerns.points)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  return (
    <>
      {strip}
      <div className="mb-3">
        <SegmentedToggle size="sm" value={view} onChange={setView} ariaLabel={T.tabs.concerns}
          options={[["ranking", T.cRanking], ["register", T.cRegister]]} />
      </div>
      {view === "register" ? <ConcernsRegister T={T} tl={tl} listParams={listParams} onOpen={setDetail} /> : ranking}
      {detail && (
        <ConcernDetailModal T={T} t={t} tl={tl} detail={detail} zIndex={70} onClose={() => setDetail(null)}
          mayConcerns={mayConcerns} onOpenPage={(d) => navigate(`/concerns?open=${d.id}`)} />
      )}
    </>
  );
}
