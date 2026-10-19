// «Liderlar KPI» — the leaderboard: one row per OWNED cell, its owner named,
// best total first. The five KPI columns carry the score chip (the figure
// behind it in the cell's tooltip and in the row's dialog); the total is the
// Σ score × weight out of 5. Every number comes from the board payload.
import { HelpCircle, Trophy } from "lucide-react";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import ProfileAvatar from "../ui/ProfileAvatar";
import TableCard, { Th } from "../ui/DataTable";
import { fill } from "../../pages/leadersKpiText";
import { Figure, MobileRow, ScoreChip, StateChip, StripCard, TotalCell, EmptyRow } from "./KpiBits";
import { KPI_KEYS, LIVE, MAX_POINTS, dmy, figureOf, maxPts, n0, scoreOf, w100 } from "./kpiUtil";

// Gold · silver · bronze for the podium — the /leaders page's own medal inks.
const MEDAL = { 1: "#E0A82E", 2: "#C3CBD6", 3: "#C0703A" };

export default function LeaderboardTab({ T, tl, data, rows, sort, onSort, onOpen, onRules }) {
  const tot = data?.totals;
  const rules = data?.rules || {};
  const kpis = data?.kpis || [];
  const live = kpis.filter((k) => k.live).length;
  // The KPIs the platform has no source for yet count 0, so the best total a
  // cell can reach today is 5 minus their maximum points — read off the rules
  // the server sent, never typed into the note; gone once every KPI is live.
  const missing = kpis.filter((k) => !k.live);
  const maxNow = MAX_POINTS - missing.reduce((s, k) => s + (Number(k.max_points) || 0), 0);
  const formulaNote = missing.length
    ? fill(T.formulaNote, { m: missing.length, max: maxNow.toFixed(1).replace(".", T.dec), pct: Math.round((maxNow / MAX_POINTS) * 100) })
    : "";
  const stateLine = data?.state === "open"
    ? fill(T.lineOpen, { from: dmy(data.period?.from), asOf: dmy(data.as_of) })
    : fill(T.lineEnded, { from: dmy(data?.period?.from), to: dmy(data?.period?.to) });
  const count = fill(T.countLine, { o: n0(tot?.owners ?? 0), c: n0(tot?.cells ?? 0) });

  const strip = (
    <StripCard className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="flex items-start gap-2.5 min-w-0 flex-1 basis-[20rem]">
        <StateChip state={data?.state} T={T} />
        <div className="min-w-0">
          <p className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>{stateLine}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            {T.formula} · {fill(T.liveNote, { n: live, m: KPI_KEYS.length - live })}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-6 flex-wrap">
        <Figure label={T.cellsLabel} value={n0(tot?.cells ?? 0)} sub={fill(T.countLine, { o: n0(tot?.owners ?? 0), c: n0(tot?.cells ?? 0) }).split("·")[0].trim()} />
        <Figure label={T.avgLabel} value={tot?.avg_total == null ? "—" : `${Number(tot.avg_total).toFixed(2)} / ${MAX_POINTS}`} />
        <Figure label={T.bestLabel} value={tot?.best == null ? "—" : `${Number(tot.best).toFixed(2)} / ${MAX_POINTS}`} />
        <Button size="md" variant="ghost" icon={<HelpCircle size={14} />} onClick={onRules} className="self-center">{T.rulesBtn}</Button>
      </div>
    </StripCard>
  );

  const footer = (
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
      {formulaNote && <span>{formulaNote}</span>}
      {data?.state === "open" && <span className="w-full" style={{ color: "var(--status-warn)" }}>{T.provisional}</span>}
    </div>
  );

  // A phone row names the KPIs the platform computes, in the tab's own words —
  // never an abbreviation, and never the two columns that can only read «—».
  const phoneFoot = (x) => KPI_KEYS.filter((k) => LIVE.has(k)).map((k) => `${T.tabs[k]} ${scoreOf(x, k) ?? "—"}`).join(" · ");
  const rankInk = (r) => MEDAL[r] || "var(--text-3)";

  return (
    <>
      {strip}
      <TableCard icon={Trophy} title={T.boardTitle}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{count}</span>}
        footer={footer}
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
            <Th label={T.colPct} k="pct" sort={sort} onSort={onSort} align="right" hint={T.hPct} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={11} text={T.nothing} /> : rows.map((x) => (
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
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{x.pct}%</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}
