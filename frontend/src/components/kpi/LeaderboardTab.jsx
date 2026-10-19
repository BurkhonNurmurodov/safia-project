// «Liderlar KPI» — the leaderboard: one row per OWNED cell, its owner named,
// best total first (2026-10-19 redesign, the operator: «more rich … definitely
// use that web chart»). Top to bottom: one muted line of what the month is
// (and the rules behind «Qanday hisoblanadi?»), the podium of the three best
// cells, four equal tiles on how the team is doing, then the ranking — each KPI
// a score meter, the total a bar — whose rows open in place onto the cell's
// radar against the team and its strengths and growth areas.
//
// The month before is compared only where it measured the same things
// (`comparable`): a place moved, a score moved, the team's average moved.
// Every number comes from the board payload; nothing here computes a score.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import CellLink from "../ui/CellLink";
import ProfileAvatar from "../ui/ProfileAvatar";
import TableCard, { Th } from "../ui/DataTable";
import { useTheme } from "../../context/ThemeContext";
import useElementWidth from "../../hooks/useElementWidth";
import { fill } from "../../pages/leadersKpiText";
import { BoardPodium, BoardTiles } from "./BoardHero";
import BoardPanel from "./BoardPanel";
import { Delta, RankBadge, RulesButton, ScorePips, TotalBar } from "./KpiBits";
import { MAX_POINTS, comparable, figureOf, liveKeys, maxPts, maxScore, medalOf, scoreOf, w100, zoneOf } from "./kpiUtil";

// The place since the month before: «=» held, a new cell «yangi».
function Move({ d, T }) {
  if (d === undefined) return null;
  if (d === null) return <span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{T.bdNew}</span>;
  return <Delta d={d} title={T.bdVsPrev} />;
}

// The ranking FITS its card (2026-10-19 — sized by its longest names it ran
// past the card's right edge, cutting «Jami» and an opened row's radar off).
// Every column but the two names is exactly as wide as its header label in
// the reader's language (measured, so no language is cut) or its content.
// The owner — the row's subject — comes first, its longest name whole where
// the card allows; the brigadir column takes what is left, and shows only
// while the owner still keeps OWNER_FULL (or its whole name) — never with one
// brigadir in scope, where every row would repeat it; otherwise the brigadir
// is named on the owner's hover. Short of even OWNER_MIN, «Jami» drops its
// bar for its figure, and below that the table scrolls sideways with an
// opened row's panel pinned to the part of the card on screen.
const PAD = 24;          // a cell's px-3, both sides
const EDGE = 2;          // its border, and a pixel to spare
const CONTENT = { rank: 28, rankMoves: 62, code: 34, kpi: 73, total: 110, figure: 36 };   // badge · badge + move · four digits · pips · bar + figure · figure
const CHEVRON = 44;
const AVATAR = 38;       // the photo and its gap before the name
const OWNER_MIN = 200;   // ~17 letters of a name
const OWNER_FULL = 280;  // a three-word name, whole
const BRIG_MIN = 160;

// The widest of `texts` drawn in `font` — the longest owner / brigadir name.
let ruler;
function widest(texts, font) {
  ruler ||= document.createElement("canvas").getContext("2d");
  if (!ruler) return 0;
  ruler.font = font;
  let m = 0;
  for (const t of texts) if (t) m = Math.max(m, ruler.measureText(t).width);
  return Math.ceil(m);
}

// The column plan for `vw`, the scroller's visible width: each fixed column's
// width, the brigadir's (0 = not shown), whether «Jami» goes bar-less, and the
// table's floor (below it the table scrolls).
function fitColumns({ vw, labels, owner, brig, keys, moves, multiBrig }) {
  const w = (k, content) => Math.max(labels?.[k] || 0, content) + PAD + EDGE;
  const plan = (compact) => {
    const fixed = {
      rank: w("rank", moves ? CONTENT.rankMoves : CONTENT.rank), code: w("code", CONTENT.code),
      total: w("total", compact ? CONTENT.figure : CONTENT.total), chev: CHEVRON,
    };
    for (const k of keys) fixed[k] = w(k, CONTENT.kpi);
    const sum = Object.values(fixed).reduce((s, v) => s + v, 0);
    return { fixed, sum, room: vw - sum };
  };
  let p = plan(false);
  // The owner first, up to its whole longest name; the brigadir gets what is
  // left (at least its floor, at most its own longest name) — shown at all
  // only while the owner still keeps OWNER_FULL or its whole name.
  const ownerWant = AVATAR + PAD + EDGE + owner;
  const ownerKeep = Math.min(OWNER_FULL, Math.max(OWNER_MIN, ownerWant));
  const brigWant = PAD + EDGE + brig;
  const brigFloor = Math.min(BRIG_MIN, brigWant);
  const brigW = multiBrig && p.room - ownerKeep >= brigFloor ? Math.max(brigFloor, Math.min(brigWant, p.room - Math.max(ownerWant, OWNER_MIN))) : 0;
  const compact = !brigW && p.room < OWNER_MIN;
  if (compact) p = plan(true);
  return { ...p.fixed, brig: brigW, compact, min: p.sum + OWNER_MIN + brigW };
}

export default function LeaderboardTab({ T, tl, data, rows, prev, sort, onSort, onOpen, onExplain, onRules }) {
  const { theme } = useTheme();
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [zone, setZone] = useState(null);
  const rules = useMemo(() => data?.rules || {}, [data]);
  const kpis = data?.kpis || [];
  const keys = useMemo(() => liveKeys(data), [data]);
  const all = useMemo(() => data?.rows || [], [data]);

  // The month before, where it compares; a cell it did not have is «new».
  const hist = useMemo(() => (comparable(prev, data) ? new Map(prev.rows.map((r) => [r.key, r])) : null), [prev, data]);
  const moves = useMemo(() => (hist ? new Map(all.map((x) => {
    const p = hist.get(x.key);
    return [x.key, p ? p.rank - x.rank : null];
  })) : null), [hist, all]);

  const zones = useMemo(() => {
    const z = { green: 0, attention: 0 };
    for (const x of all) {
      const k = zoneOf(x, keys, rules);
      if (k) z[k] += 1;
    }
    return z;
  }, [all, keys, rules]);
  const shown = zone ? rows.filter((x) => zoneOf(x, keys, rules) === zone) : rows;

  // Column widths, fitted to the part of the card on screen (the rule above
  // PAD). `measured` is each header label as it renders plus the longest
  // names, read before paint and again once the web font has arrived (text
  // measured in the fallback font is narrower).
  const [scrollRef, vw] = useElementWidth("client");
  const headRef = useRef(null);
  const [measured, setMeasured] = useState(null);
  const [fontsAt, setFontsAt] = useState(0);
  const multiBrig = useMemo(() => new Set(all.map((x) => x.brigadir || "")).size > 1, [all]);
  const fit = useMemo(() => fitColumns({
    vw, labels: measured?.labels, owner: measured?.owner || 0, brig: measured?.brig || 0, keys, moves, multiBrig,
  }), [vw, measured, keys, moves, multiBrig]);
  const showBrig = fit.brig > 0;
  const colKeys = useMemo(() => ["rank", "code", "owner", ...(showBrig ? ["brigadir"] : []), ...keys, "total", "chev"], [showBrig, keys]);
  useEffect(() => {
    let live = true;
    document.fonts?.ready?.then(() => { if (live) setFontsAt(Date.now()); });
    return () => { live = false; };
  }, []);
  useLayoutEffect(() => {
    const head = headRef.current;
    const ths = head?.firstElementChild?.children;
    if (!ths || !vw) return;
    const labels = {};
    colKeys.forEach((k, i) => {
      const label = ths[i]?.firstElementChild;
      if (label) labels[k] = Math.ceil(label.getBoundingClientRect().width);
    });
    const fam = getComputedStyle(head).fontFamily;
    const owner = widest(all.map((x) => (x.owner ? tl(x.owner) : "")), `500 14px ${fam}`);
    const brig = widest(all.map((x) => (x.brigadir ? tl(x.brigadir) : "")), `400 14px ${fam}`);
    setMeasured((m) => (m && m.owner === owner && m.brig === brig && Object.keys(labels).every((k) => m.labels[k] === labels[k])
      ? m : { owner, brig, labels: { ...m?.labels, ...labels } }));
  }, [colKeys, vw, T, fontsAt, all, tl]);

  // The KPIs the platform has no source for yet count 0, so the best total a
  // cell can reach today is 5 minus their maximum points — read off the rules
  // the server sent, never typed into the line; gone once every KPI is live.
  const missing = kpis.filter((k) => !k.live);
  const maxNow = MAX_POINTS - missing.reduce((s, k) => s + (Number(k.max_points) || 0), 0);
  const maxLine = missing.length
    ? fill(T.sumMaxNow, { kpis: missing.map((k) => T.kpi[k.key] || k.key).join(", "), max: maxNow.toFixed(1) })
    : null;
  const meta = [data?.state === "open" && T.notOver, maxLine].filter(Boolean);

  const toggle = (key) => setOpenKeys((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // A podium card opens its row in the ranking and brings it into view; a
  // row the search or a zone has hidden opens its dialog instead.
  const pick = (x) => {
    if (!shown.some((r) => r.key === x.key)) { onOpen(x); return; }
    setOpenKeys((s) => new Set(s).add(x.key));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const wide = window.matchMedia("(min-width: 640px)").matches;
      document.getElementById(`${wide ? "lkpi-row" : "lkpi-m"}-${x.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  };

  const owner = (x) => (x.owner ? tl(x.owner) : "—");
  const panel = (x) => (
    <BoardPanel row={x} data={data} prevRow={hist?.get(x.key) || null} keys={keys} T={T} tl={tl}
      onExplain={onExplain} onPoints={onOpen} />
  );
  const cols = colKeys.length;
  const nothing = zone ? T.bdZoneEmpty : T.nothing;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 mb-3 min-h-[36px]">
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          {meta.map((m, i) => <span key={i}>{i > 0 && <span aria-hidden> · </span>}{m}</span>)}
        </p>
        <RulesButton label={T.rulesBtn} onClick={onRules} />
      </div>

      {/* A month with no owned cell in scope has nothing to stand on a podium
          or to count in a tile — the ranking's own empty row says so once. */}
      {all.length > 0 && (
        <>
          <BoardPodium rows={all} keys={keys} rules={rules} T={T} tl={tl} moves={moves} onPick={pick} />
          <BoardTiles data={data} keys={keys} T={T} prev={hist ? prev : null} zones={zones} zone={zone} onZone={setZone} />
        </>
      )}

      <TableCard fixed minWidth={fit.min} scrollRef={scrollRef} mobileMaxHeight="none"
        mobile={shown.length ? shown.map((x) => {
          const isOpen = openKeys.has(x.key);
          return (
            <div key={x.key} id={`lkpi-m-${x.key}`} style={{ borderTop: "1px solid var(--border)", background: isOpen ? "var(--bg-inner)" : undefined }}>
              <button type="button" onClick={() => toggle(x.key)} aria-expanded={isOpen}
                className="w-full text-left px-4 py-3 flex items-start gap-3 outline-none focus-visible:bg-[var(--bg-inner)]">
                <span className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <RankBadge rank={x.rank} medal={medalOf(x.rank, theme)} />
                  <Move d={moves ? moves.get(x.key) : undefined} T={T} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <ProfileAvatar name={owner(x)} colorKey={x.owner || ""} profileKey={x.owner_key} photoVer={x.photo_ver} size={22} />
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{owner(x)}</span>
                  </span>
                  <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                    {[x.code, x.brigadir ? tl(x.brigadir) : null].filter(Boolean).join(" · ")}
                  </span>
                  <span className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
                    {keys.map((k) => (
                      <span key={k} className="min-w-0">
                        <span className="block text-[10.5px] leading-none truncate mb-1" style={{ color: "var(--text-3)" }}>{T.tabs[k]}</span>
                        <span className="flex">
                          <ScorePips score={scoreOf(x, k)} max={maxScore(rules, k)} size="sm" label={`${T.kpi[k]}: ${scoreOf(x, k) ?? "—"}`} />
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
                  <span className="text-base font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{Number(x.total).toFixed(2)}</span>
                  <span className="block h-1 w-12 rounded-full overflow-hidden" style={{ background: "var(--border-md)" }} aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(1, x.total / MAX_POINTS) * 100}%`, background: "var(--brand)" }} />
                  </span>
                  <ChevronDown size={16} className={`mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: "var(--text-3)" }} aria-hidden />
                </span>
              </button>
              {isOpen && panel(x)}
            </div>
          );
        }) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{nothing}</p>}>
        <colgroup>
          <col style={{ width: fit.rank }} />
          <col style={{ width: fit.code }} />
          <col />
          {showBrig && <col style={{ width: fit.brig }} />}
          {keys.map((k) => <col key={k} style={{ width: fit[k] }} />)}
          <col style={{ width: fit.total }} />
          <col style={{ width: fit.chev }} />
        </colgroup>
        <thead ref={headRef}>
          <tr>
            <Th label={T.colRank} k="rank" sort={sort} onSort={onSort} align="center" />
            <Th label={T.colCell} k="code" sort={sort} onSort={onSort} />
            <Th label={T.colOwner} k="owner" sort={sort} onSort={onSort} hint={T.hOwner} />
            {showBrig && <Th label={T.colBrigadir} k="brigadir" sort={sort} onSort={onSort} />}
            {keys.map((k) => (
              <Th key={k} label={T.tabs[k]} k={k} sort={sort} onSort={onSort} align="center"
                hint={fill(T.hKpi, { kpi: T.kpi[k], w: w100(rules[k]), max: maxPts(rules[k]).toFixed(2) })} />
            ))}
            <Th label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" hint={T.hTotal} />
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
                <tr id={`lkpi-row-${x.key}`} className="cursor-pointer" onClick={() => toggle(x.key)}
                  style={{ scrollMarginTop: 52, ...(isOpen ? { background: "var(--bg-inner)" } : null) }}>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center justify-center gap-1.5">
                      <RankBadge rank={x.rank} medal={medalOf(x.rank, theme)} />
                      {moves && <span className="w-7 text-left"><Move d={moves.get(x.key)} T={T} /></span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sm tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
                  <td className="px-3 py-2.5" title={showBrig || !x.brigadir ? owner(x) : `${owner(x)} · ${T.colBrigadir}: ${tl(x.brigadir)}`}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ProfileAvatar name={owner(x)} colorKey={x.owner || ""} profileKey={x.owner_key} photoVer={x.photo_ver} size={28} />
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{owner(x)}</span>
                    </span>
                  </td>
                  {showBrig && (
                    <td className="px-3 py-2.5 text-sm truncate" style={{ color: "var(--text-2)" }} title={x.brigadir ? tl(x.brigadir) : undefined}>
                      {x.brigadir ? tl(x.brigadir) : "—"}
                    </td>
                  )}
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-2.5 text-center" title={figureOf(x, k, T)}>
                      <ScorePips score={scoreOf(x, k)} max={maxScore(rules, k)} label={`${T.kpi[k]}: ${figureOf(x, k, T)}`} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5"><TotalBar total={x.total} width={fit.compact ? 0 : undefined} /></td>
                  <td className="px-1.5 py-2.5 text-center">
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggle(x.key); }}
                      aria-expanded={isOpen} aria-controls={`lkpi-panel-${x.key}`} aria-label={fill(T.bdExpand, { cell: x.code })}
                      className="inline-grid place-items-center w-8 h-8 rounded-lg outline-none hover:bg-[var(--bg-accent)] focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                      style={{ color: isOpen ? "var(--text-1)" : "var(--text-3)" }}>
                      <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr id={`lkpi-panel-${x.key}`} style={{ background: "var(--bg-inner)", borderTopWidth: 0 }}>
                    <td colSpan={cols} className="p-0 whitespace-normal">
                      {/* Pinned to the part of the card on screen: on a table
                          wider than its card the panel would otherwise scroll
                          away with the columns, its right half out of reach. */}
                      <div className="sticky left-0" style={vw ? { width: vw } : undefined}>{panel(x)}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
