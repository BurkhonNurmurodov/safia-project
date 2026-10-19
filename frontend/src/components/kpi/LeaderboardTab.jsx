// «Liderlar KPI» — the leaderboard: one row per OWNED cell, its owner named,
// best total first. The five KPI columns carry the score chip (the figure
// behind it in the cell's tooltip and in the row's dialog); the total is the
// Σ score × weight out of 5. Every number comes from the board payload.
import CellLink from "../ui/CellLink";
import ProfileAvatar from "../ui/ProfileAvatar";
import TableCard, { Th } from "../ui/DataTable";
import { fill } from "../../pages/leadersKpiText";
import { MobileRow, RulesButton, ScoreChip, Summary, TotalCell, EmptyRow } from "./KpiBits";
import { KPI_KEYS, LIVE, MAX_POINTS, figureOf, maxPts, n0, scoreOf, w100 } from "./kpiUtil";

// Gold · silver · bronze for the podium — the /leaders page's own medal inks.
const MEDAL = { 1: "#E0A82E", 2: "#C3CBD6", 3: "#C0703A" };

export default function LeaderboardTab({ T, tl, data, rows, sort, onSort, onOpen, onRules }) {
  const tot = data?.totals;
  const rules = data?.rules || {};
  const kpis = data?.kpis || [];
  // The KPIs the platform has no source for yet count 0, so the best total a
  // cell can reach today is 5 minus their maximum points — read off the rules
  // the server sent, never typed into the line; gone once every KPI is live.
  const missing = kpis.filter((k) => !k.live);
  const maxNow = MAX_POINTS - missing.reduce((s, k) => s + (Number(k.max_points) || 0), 0);
  const maxLine = missing.length
    ? fill(T.sumMaxNow, { kpis: missing.map((k) => T.kpi[k.key] || k.key).join(", "), max: maxNow.toFixed(1) })
    : null;
  const open = data?.state === "open";

  const summary = (
    <Summary
      value={<>{tot?.avg_total == null ? "—" : Number(tot.avg_total).toFixed(2)}<span className="text-base font-semibold" style={{ color: "var(--text-3)" }}> / {MAX_POINTS}</span></>}
      label={`${T.sumAvg} · ${fill(T.sumCells, { n: n0(tot?.cells ?? 0) })}`}
      meta={[open && T.notOver, maxLine]}
      actions={<RulesButton label={T.rulesBtn} onClick={onRules} />} />
  );

  // A phone row names the KPIs the platform computes, in the tab's own words —
  // never an abbreviation, and never the column that can only read «—».
  const phoneFoot = (x) => KPI_KEYS.filter((k) => LIVE.has(k)).map((k) => `${T.tabs[k]} ${scoreOf(x, k) ?? "—"}`).join(" · ");
  const rankInk = (r) => MEDAL[r] || "var(--text-3)";

  return (
    <>
      {summary}
      <TableCard
        mobile={rows.length ? rows.map((x) => (
          <MobileRow key={x.key} onClick={() => onOpen(x)}
            title={<span className="tabular-nums"><span style={{ color: rankInk(x.rank) }}>{x.rank}.</span> {x.code} · {x.owner ? tl(x.owner) : "—"}</span>}
            sub={x.brigadir ? tl(x.brigadir) : ""}
            foot={phoneFoot(x)}
            right={<TotalCell total={x.total} />} />
        )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
        <thead>
          <tr>
            <Th label={T.colRank} k="rank" sort={sort} onSort={onSort} align="center" cls="w-14" />
            <Th label={T.colCell} k="code" sort={sort} onSort={onSort} />
            <Th label={T.colOwner} k="owner" sort={sort} onSort={onSort} hint={T.hOwner} />
            <Th label={T.colBrigadir} k="brigadir" sort={sort} onSort={onSort} />
            {KPI_KEYS.map((k) => (
              <Th key={k} label={T.tabs[k]} k={k} sort={sort} onSort={LIVE.has(k) ? onSort : undefined} align="center"
                hint={fill(T.hKpi, { kpi: T.kpi[k], w: w100(rules[k]), max: maxPts(rules[k]).toFixed(2) })} />
            ))}
            <Th label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" hint={T.hTotal} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={10} text={T.nothing} /> : rows.map((x) => (
            <tr key={x.key} className="cursor-pointer" onClick={() => onOpen(x)}>
              <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: rankInk(x.rank) }}>{x.rank}</td>
              <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <ProfileAvatar name={tl(x.owner || "")} colorKey={x.owner || ""} profileKey={x.owner_key} photoVer={x.photo_ver} size={24} />
                  <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                    style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); onOpen(x); }}>
                    {x.owner ? tl(x.owner) : "—"}
                  </button>
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
              {KPI_KEYS.map((k) => (
                <td key={k} className="px-3 py-1.5 text-center" title={LIVE.has(k) ? figureOf(x, k, T) : T.notLive}>
                  {LIVE.has(k) ? <ScoreChip score={scoreOf(x, k)} size="sm" />
                    : <span className="text-xs" style={{ color: "var(--text-4)" }}>{T.noScore}</span>}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right"><TotalCell total={x.total} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
