// «Brigadirlar KPI» — the board (2026-11-03 redesign, the operator: «redesign
// brigadir's KPI like Leader's KPI. Be creative»). The leaders' board read
// top to bottom — one muted line of what the month is, a hero, tiles on how
// the team is doing, then a ranking whose rows open in place — said in this
// KPI's own terms: four pass / fail GATES, not scores out of five.
//
//  · the honour wall: everybody through every counted gate, faces first;
//  · the result tile: four groups (all · some · none · no figure), each a
//    filter on the ranking, against the month before where it compares;
//  · one tile per counted gate: how many passed, and every brigadir a dot on
//    a fixed scale beside the line — near-misses are visible at a glance;
//  · the ranking: a gate cell per counted gate (verdict icon + figure) and
//    the result ring, four quarters clockwise from 12; a row opens onto its
//    gauges (BkpiPanel).
//
// Every figure is the board payload's own; the page only reads verdicts,
// counts rows and orders what it shows.
import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ListOrdered, MinusCircle, X, XCircle } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import useElementWidth from "../../hooks/useElementWidth";
import { fill } from "../../pages/brigadirsKpiText";
import { Count, Delta, Notes, RulesButton } from "../kpi/KpiBits";
import { dmHm, n0 } from "../kpi/kpiUtil";
import { BrigAvatar, GateTile, HonorWall, ResultTile } from "./BkpiHero";
import BkpiPanel from "./BkpiPanel";
import GateRing from "./GateRing";
import { GATES, GATE_INK, GROUP_INK, comparableMonths, figureOfGate, gateOf, groupOf, liveGates, notesOf, pct1 } from "./bkpiUtil";

const STATE_ICON = { pass: CheckCircle2, fail: XCircle, nodata: MinusCircle };

// One counted gate in a ranking row: the verdict as an icon in its colour (the
// word is in the label), the figure beside it.
function GateCell({ row, k, live, T }) {
  const s = gateOf(row, k, live);
  const Icon = STATE_ICON[s];
  const v = figureOfGate(row, k);
  const word = { pass: T.pass, fail: T.fail, nodata: T.gNoData }[s];
  return (
    <span className="inline-flex items-center gap-2" title={`${T.kpi[k]}: ${v == null ? "—" : pct1(v)} · ${word}`}>
      <Icon size={16} strokeWidth={2.25} style={{ color: GATE_INK[s] }} aria-hidden />
      <span className="text-sm tabular-nums font-semibold" style={{ color: v == null ? "var(--text-4)" : "var(--text-1)" }}>
        {v == null ? "—" : pct1(v)}
      </span>
      <span className="sr-only">{word}</span>
    </span>
  );
}

const ringLabel = (row, live, T) => fill(T.bdRingAria, {
  n: GATES.filter((k) => gateOf(row, k, live) === "pass").length, of: row.of ?? 4,
  list: GATES.map((k) => `${T.kpi[k]}: ${{ pass: T.pass, fail: T.fail, nodata: T.gNoData, pending: T.notYet }[gateOf(row, k, live)]}`).join(", "),
});

export default function BkpiBoard({ T, tl, data, rows, prev, sort, onSort, onOpen, onRules, photoVers }) {
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [group, setGroup] = useState(null);
  const [scrollRef, vw] = useElementWidth("client");
  const live = useMemo(() => liveGates(data), [data]);
  const all = useMemo(() => data?.rows || [], [data]);

  // The month before, only where it measured the same gates the same way.
  const hist = useMemo(() => (comparableMonths(prev, data) ? new Map(prev.rows.map((r) => [r.key, r])) : null), [prev, data]);
  const prevCounts = useMemo(() => {
    if (!hist) return null;
    const c = { all: 0, some: 0, none: 0, nodata: 0 };
    for (const r of prev.rows) c[groupOf(r, live)] += 1;
    return c;
  }, [hist, prev, live]);

  const shown = useMemo(() => (group ? rows.filter((x) => groupOf(x, live) === group) : rows), [rows, group, live]);
  const shownKeys = useMemo(() => (group || rows.length !== all.length ? new Set(shown.map((x) => x.key)) : null), [group, shown, rows, all]);

  const toggle = (key) => setOpenKeys((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // A face on the wall or a dot on a strip opens its row in the ranking and
  // brings it into view; a row the search or a group has hidden opens its
  // working instead.
  const pick = (x, part = "turnover") => {
    if (!shown.some((r) => r.key === x.key)) { onOpen(x, part); return; }
    setOpenKeys((s) => new Set(s).add(x.key));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const wide = window.matchMedia("(min-width: 640px)").matches;
      document.getElementById(`${wide ? "bkpi-row" : "bkpi-m"}-${x.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  };
  const showAll = () => {
    setGroup("all");
    requestAnimationFrame(() => document.getElementById("bkpi-ranking")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const meta = [
    data?.state === "open" && T.notOver,
    fill(T.liveNote, { n: live.length, max: live.length }),
    data?.quality_sync?.at && fill(T.qualityAt, { at: dmHm(data.quality_sync.at) }),
    data?.notes?.org?.at ? fill(T.orgAt, { at: dmHm(data.notes.org.at) }) : T.orgNone,
  ].filter(Boolean);
  const notes = notesOf(data, T);
  const name = (x) => (x.name ? tl(x.name) : "—");
  const panel = (x) => <BkpiPanel row={x} prevRow={hist?.get(x.key) || null} data={data} live={live} T={T} onOpen={onOpen} />;
  const cols = 3 + live.length + 1;
  const nothing = group ? T.bdGroupEmpty : rows.length ? T.nothing : T.noRows;

  const result = (x, size) => {
    const p = hist?.get(x.key);
    return (
      <span className="inline-flex items-center gap-2">
        <GateRing row={x} live={live} size={size} label={ringLabel(x, live, T)} center={false} />
        <span className="text-sm font-semibold tabular-nums" style={{ color: x.passed ? "var(--text-1)" : "var(--text-3)" }}>
          {fill(T.passedOf, { n: x.passed, of: x.of })}
        </span>
        {hist && (
          <span className="min-w-6">
            {p ? <Delta d={x.passed - p.passed} title={T.bdVsPrev} />
              : <span className="text-[11px]" style={{ color: "var(--text-3)" }} title={T.bdNewHint}>{T.bdNew}</span>}
          </span>
        )}
      </span>
    );
  };

  const groupChip = group && (
    <button type="button" onClick={() => setGroup(null)}
      className="inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      aria-label={fill(T.bdGroupClear, { g: T[`grp_${group}`] })}>
      <span className="w-2 h-2 rounded-full" style={{ background: GROUP_INK[group] }} aria-hidden />
      {T[`grp_${group}`]}
      <X size={13} aria-hidden />
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 mb-3 min-h-[36px]">
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          {meta.map((m, i) => <span key={i}>{i > 0 && <span aria-hidden> · </span>}{m}</span>)}
        </p>
        <RulesButton label={T.rulesBtn} onClick={onRules} />
      </div>

      {all.length > 0 && (
        <>
          <HonorWall rows={all} live={live} T={T} tl={tl} photoVers={photoVers} onPick={(x) => pick(x)} onShowAll={showAll} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 lg:[grid-template-columns:repeat(var(--bk-cols),minmax(0,1fr))]"
            style={{ "--bk-cols": 1 + live.length }}>
            <ResultTile rows={all} live={live} T={T} group={group} onGroup={setGroup} prevCounts={prevCounts} />
            {live.map((k) => (
              <GateTile key={k} k={k} data={data} rows={all} shown={shownKeys} open={openKeys} live={live} T={T} tl={tl}
                prevData={hist ? prev : null} onPick={pick} />
            ))}
          </div>
        </>
      )}

      <div id="bkpi-ranking" style={{ scrollMarginTop: 12 }}>
        <TableCard icon={ListOrdered} title={T.bdRanking}
          right={<span className="flex items-center gap-2">{groupChip}<Count>{group ? fill(T.bdShownOf, { n: n0(shown.length), of: n0(rows.length) }) : n0(rows.length)}</Count></span>}
          fixed minWidth={260 + 104 + live.length * 140 + (hist ? 150 : 124) + 48} scrollRef={scrollRef} mobileMaxHeight="none"
          footer={notes.length ? <Notes notes={notes} label={fill(T.notesN, { n: notes.length })} /> : null}
          mobile={shown.length ? shown.map((x) => {
            const isOpen = openKeys.has(x.key);
            return (
              <div key={x.key} id={`bkpi-m-${x.key}`} style={{ borderTop: "1px solid var(--border)", background: isOpen ? "var(--bg-inner)" : undefined, scrollMarginTop: 12 }}>
                <button type="button" onClick={() => toggle(x.key)} aria-expanded={isOpen}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 outline-none focus-visible:bg-[var(--bg-inner)]">
                  <BrigAvatar row={x} tl={tl} photoVers={photoVers} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{name(x)}</span>
                    <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                      {x.kind === "verifix" ? T.srcVerifix : x.shift ? fill(T.shiftN, { n: x.shift }) : "—"}
                    </span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {live.map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 text-xs">
                          <span style={{ color: "var(--text-3)" }}>{T.tabs[k]}</span>
                          <GateCell row={x} k={k} live={live} T={T} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="inline-flex items-center gap-1.5">
                      <GateRing row={x} live={live} size={30} label={ringLabel(x, live, T)} center={false} />
                      <span className="text-sm font-bold tabular-nums" style={{ color: x.passed ? "var(--text-1)" : "var(--text-3)" }}>{fill(T.passedOf, { n: x.passed, of: x.of })}</span>
                    </span>
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: "var(--text-3)" }} aria-hidden />
                  </span>
                </button>
                {isOpen && panel(x)}
              </div>
            );
          }) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{nothing}</p>}>
          <colgroup>
            <col />
            <col style={{ width: 104 }} />
            {live.map((k) => <col key={k} style={{ width: 140 }} />)}
            <col style={{ width: hist ? 150 : 124 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <Th label={T.colBrigadir} k="name" sort={sort} onSort={onSort} />
              <Th label={T.colShift} k="shift" sort={sort} onSort={onSort} align="center" />
              {live.map((k) => (
                <Th key={k} label={T.tabs[k]} k={k} sort={sort} onSort={onSort}
                  hint={`${T.kpi[k]} — ${fill(k === "turnover" ? T.tvRule : T.okkRule, { max: data?.rule?.turnover?.max, min: data?.rule?.okk?.min })}`} />
              ))}
              <Th label={T.colResult} k="passed" sort={sort} onSort={onSort} hint={T.hResult} />
              <th className="sticky top-0 z-10" style={{ background: "var(--bg-inner)" }} aria-label={T.bdDetails} />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{nothing}</td></tr>
            ) : shown.map((x) => {
              const isOpen = openKeys.has(x.key);
              return (
                <Fragment key={x.key}>
                  <tr id={`bkpi-row-${x.key}`} className="cursor-pointer" onClick={() => toggle(x.key)}
                    style={{ scrollMarginTop: 52, ...(isOpen ? { background: "var(--bg-inner)" } : null) }}>
                    <td className="px-3 py-2" title={name(x)}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <BrigAvatar row={x} tl={tl} photoVers={photoVers} size={28} />
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{name(x)}</span>
                        {x.kind === "verifix" && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md flex-shrink-0" title={T.srcVerifixHint}
                            style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                            {T.srcVerifix}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-sm" style={{ color: "var(--text-2)" }}>
                      {x.shift ? fill(T.shiftN, { n: x.shift }) : "—"}
                    </td>
                    {live.map((k) => (
                      <td key={k} className="px-3 py-2"><GateCell row={x} k={k} live={live} T={T} /></td>
                    ))}
                    <td className="px-3 py-2">{result(x, 26)}</td>
                    <td className="px-1.5 py-2 text-center">
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggle(x.key); }}
                        aria-expanded={isOpen} aria-controls={`bkpi-panel-${x.key}`} aria-label={fill(T.bdExpand, { name: name(x) })}
                        className="inline-grid place-items-center w-8 h-8 rounded-lg outline-none hover:bg-[var(--bg-accent)] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                        style={{ color: isOpen ? "var(--text-1)" : "var(--text-3)" }}>
                        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={`bkpi-panel-${x.key}`} style={{ background: "var(--bg-inner)", borderTopWidth: 0 }}>
                      <td colSpan={cols} className="p-0 whitespace-normal">
                        {/* Pinned to the part of the card on screen, so a table
                            wider than its card never scrolls the panel away. */}
                        <div className="sticky left-0" style={vw ? { width: vw } : undefined}>{panel(x)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </TableCard>
      </div>
    </>
  );
}
