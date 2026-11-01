import { useEffect, useMemo, useState } from "react";
import {
  Layers, Tag, Hourglass, Activity, Timer, CalendarClock, ExternalLink, ListChecks, Clock3, Sigma,
} from "lucide-react";
import KPICard from "../ui/KPICard";
import TableCard, { Th } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import SearchInput from "../ui/SearchInput";
import { ChartCard, Chart, NoChart, RankedList, StackLegend, cardStyle } from "../ui/AnalysisBoard";
import { SectionHead } from "../ui/DataTable";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { TONE_HEX } from "../../utils/statusBands";
import { FOLD_COLOR } from "../../utils/chartPalette";
import { useTT, fill, labelHex, ddmm, ddmmyy, fmtN, fmtDays, openExt } from "./trelloUtil";

// One fixed hue per series, out of the categorical palette: blue for what came
// in, green for what went out (red/green as a pair would read as a verdict).
const C_CREATED = "#3b82f6";
const C_FINISHED = "#22c55e";
const C_ACTIVE = "#3b82f6";
const C_GOLD = "#C8973F";
const PAGE = 50;
const TOP_LABELS = 8;

function Swatch({ color }) {
  return <span aria-hidden className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: labelHex(color) }} />;
}

function LabelChips({ labels, max = 3 }) {
  if (!labels?.length) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const shown = labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1 min-w-0 overflow-hidden" title={labels.map((l) => l.name).join(", ")}>
      {shown.map((l, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] max-w-[120px] flex-shrink-0"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <Swatch color={l.color} />
          <span className="truncate">{l.name || "·"}</span>
        </span>
      ))}
      {more > 0 && <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>+{more}</span>}
    </span>
  );
}

function CardLink({ row, T }) {
  return (
    <a href={row.url} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, row.url)}
      className="inline-flex items-center gap-1.5 min-w-0 max-w-full hover:underline underline-offset-2"
      style={{ color: "var(--text-1)" }} title={`${row.name} — ${T.openInTrello}`}>
      <span className="truncate">{row.name}</span>
      <ExternalLink size={11} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
    </a>
  );
}

export default function TrelloBoardView({ data }) {
  const T = useTT();
  const { gridColor, labelColor, chartTheme, tooltipTheme } = useChartTheme();
  const [flowRef, flowW] = useElementWidth();
  const tot = data.totals || {};
  const flow = data.flow || { points: [] };
  const staleD = data.stale_days;

  // Charts mount two frames after the view, so Apex measures its final width once.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  // ── lists ─────────────────────────────────────────────────────────────────
  const listParts = useMemo(() => [
    { key: "active", label: T.kOpen, color: C_ACTIVE },
    { key: "stale", label: T.kStale, color: TONE_HEX.warn },
    { key: "done", label: T.kDone, color: TONE_HEX.ok },
  ], [T]);
  const listRows = useMemo(() => (data.lists || []).map((l) => ({
    key: l.id, label: l.name || "·", title: l.name, total: l.cards, avg: l.avg_age, isDone: l.done,
    done: l.done ? l.cards : 0,
    stale: l.done ? 0 : l.stale,
    active: l.done ? 0 : l.cards - l.stale,
  })), [data.lists]);
  const listMax = Math.max(1, ...listRows.map((r) => r.total));

  // ── labels / age bands: one measure each, the single-metric accent ───────
  const oneParts = useMemo(() => [
    { key: "gold", label: T.kOpen, color: C_GOLD },
    { key: "fold", label: T.kOpen, color: FOLD_COLOR },
  ], [T]);
  const labelRows = useMemo(() => {
    const named = (data.labels || []).filter((l) => l.id !== "none");
    const none = (data.labels || []).find((l) => l.id === "none");
    const row = (l) => ({ key: l.id, label: l.name || "·", title: l.name, total: l.cards, gold: l.cards, color: l.color });
    const out = named.slice(0, TOP_LABELS).map(row);
    const rest = named.slice(TOP_LABELS);
    if (rest.length) {
      const n = rest.reduce((a, l) => a + l.cards, 0);
      out.push({ key: "__rest", label: fill(T.others, { n: rest.length }), title: rest.map((l) => l.name).join(", "),
        total: n, fold: n, isFold: true });
    }
    if (none) out.push({ key: "none", label: T.noLabel, title: T.noLabel, total: none.cards, fold: none.cards, isFold: true });
    return out;
  }, [data.labels, T]);
  const labelMax = Math.max(1, ...labelRows.map((r) => r.total));
  const bands = useMemo(() => (data.age_bands || []).map((b) => ({
    ...b, key: String(b.from),
    label: b.to == null ? fill(T.bandLast, { a: b.from - 1 }) : fill(T.band, { a: b.from, b: b.to }),
  })), [data.age_bands, T]);
  const bandMax = Math.max(1, ...bands.map((b) => b.cards));

  // ── flow ──────────────────────────────────────────────────────────────────
  const pts = flow.points || [];
  const cats = pts.map((p) => ddmm(p.start));
  const tickAmount = ticksForWidth(flowW, cats.length, axisLabelPx(cats));
  const flowHas = pts.some((p) => p.created || p.finished);
  const flowOpts = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    plotOptions: { bar: { columnWidth: pts.length > 30 ? "80%" : "60%", borderRadius: 2 } },
    colors: [C_CREATED, C_FINISHED],
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    xaxis: {
      categories: cats, tickAmount,
      labels: { rotate: 0, rotateAlways: false, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}` } },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: {
      theme: tooltipTheme, shared: true, intersect: false,
      x: { formatter: (_, o) => {
        const p = pts[o?.dataPointIndex];
        if (!p) return "";
        return flow.grain === "week" ? fill(T.weekOf, { d: ddmmyy(p.start) }) : ddmmyy(p.start);
      } },
    },
  };
  const flowSeries = [
    { name: T.sCreated, data: pts.map((p) => p.created) },
    { name: T.sFinished, data: pts.map((p) => p.finished) },
  ];

  // ── oldest open cards ─────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [sort, setSort] = usePersistentState("trello_oldest_sort", { key: "age", dir: "desc" });
  const [page, setPage] = useState(1);
  const [band, setBand] = useState(null);       // an age band picked on its tile narrows the table
  useEffect(() => { setBand(null); }, [data.board?.id]);
  useEffect(() => { setPage(1); }, [q, sort, band, data.board?.id, data.oldest]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pick = bands.find((b) => b.key === band);
    const list = (data.oldest || []).filter((r) => (!needle || (r.name || "").toLowerCase().includes(needle))
      && (!pick || (r.age != null && r.age >= pick.from && (pick.to == null || r.age <= pick.to))));
    const key = sort?.key || "age";
    const dir = sort?.dir === "asc" ? 1 : -1;
    const val = (r) => (key === "name" ? (r.name || "").toLowerCase()
      : key === "list" ? (r.list || "").toLowerCase()
      : key === "due" ? (r.due || "9999")
      : r[key] ?? -1);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return x < y ? -dir : x > y ? dir : (b.age ?? 0) - (a.age ?? 0);
    });
  }, [data.oldest, q, sort, band, bands]);
  const onSort = (k) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: k === "name" || k === "list" || k === "due" ? "asc" : "desc" }));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const idleTone = (d) => (d != null && d >= staleD ? "var(--status-warn)" : "var(--text-2)");

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        <KPICard label={T.kOpen} tooltip={T.kOpenTip} icon={Layers} color={C_ACTIVE}
          value={fmtN(tot.open)} sub={fill(T.kOpenSub, { n: fmtN(tot.cards) })} />
        <KPICard label={T.kDone} tooltip={T.kDoneTip} icon={ListChecks} color={TONE_HEX.ok}
          value={fmtN(tot.done)} sub={tot.archived ? fill(T.kDoneSub, { a: fmtN(tot.archived) }) : null} />
        <KPICard label={T.kStale} tooltip={fill(T.kStaleTip, { d: staleD })} icon={Clock3}
          color={tot.stale ? TONE_HEX.warn : TONE_HEX.ok}
          value={fmtN(tot.stale)} sub={fill(T.kStaleSub, { d: staleD })} />
        <KPICard label={T.kAge} tooltip={T.kAgeTip} icon={Hourglass}
          value={tot.age_avg == null ? "—" : fill(T.days, { n: fmtDays(tot.age_avg) })}
          sub={tot.age_avg == null ? null : fill(T.kAgeSub, { m: fmtDays(tot.age_median), x: fmtN(tot.age_max) })} />
      </div>

      {/* ── the board as it stands ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard className="lg:col-span-2" icon={Layers} title={T.secLists} subtitle={T.secListsSub}
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{listRows.length}</span>}>
          <div className="p-4">
            <StackLegend parts={listParts} />
            {listRows.length ? (
              <RankedList rows={listRows} max={listMax} parts={listParts} unit=""
                badge={(r) => (r.isDone ? (
                  <span className="text-[10px] px-1.5 py-px rounded flex-shrink-0"
                    style={{ background: `${TONE_HEX.ok}1f`, color: "var(--status-ok)", border: `1px solid ${TONE_HEX.ok}55` }}>
                    {T.doneTag}
                  </span>
                ) : null)}
                extra={(r) => (r.avg != null && !r.isDone ? (
                  <span className="hidden sm:inline text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>
                    {fill(T.avgAge, { n: fmtDays(r.avg) })}
                  </span>
                ) : null)} />
            ) : <NoChart height={120} text={T.emptyBoard} />}
          </div>
        </ChartCard>

        <ChartCard icon={Tag} title={T.secLabels} subtitle={T.secLabelsSub}>
          <div className="p-4">
            {labelRows.length ? (
              <RankedList rows={labelRows} max={labelMax} parts={oneParts} unit=""
                badge={(r) => (r.isFold ? null : <Swatch color={r.color} />)} />
            ) : <NoChart height={80} text={T.emptyBoard} />}
          </div>
        </ChartCard>
      </div>

      {/* ── flow over time ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard className="lg:col-span-2" icon={Activity} title={T.secFlow}
          subtitle={fill(flow.grain === "week" ? T.flowWeek : T.flowDay, { from: ddmmyy(data.date_from), to: ddmmyy(data.date_to) })}>
          <div className="px-4 pt-3">
            <StackLegend parts={[
              { key: "c", label: `${T.sCreated} · ${fmtN(flow.created)}`, color: C_CREATED },
              { key: "f", label: `${T.sFinished} · ${fmtN(flow.finished)}`, color: C_FINISHED },
            ]} className="flex flex-wrap items-center gap-x-4 gap-y-1" />
          </div>
          <div ref={flowRef} className="px-2 pt-2 pb-1">
            {flowHas
              ? <Chart ready={ready} height={260} type="bar" options={flowOpts} series={flowSeries} />
              : <NoChart height={260} text={T.emptyFiltered} />}
          </div>
        </ChartCard>

        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <SectionHead icon={Timer} title={T.secLead} subtitle={T.secLeadSub} />
          <div className="p-4 flex-1 flex flex-col gap-4">
            {flow.lead_n ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[[T.leadMedian, flow.lead_median], [T.leadAvg, flow.lead_avg]].map(([lab, v]) => (
                    <div key={lab} className="rounded-xl p-3" style={{ background: "var(--bg-inner)" }}>
                      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{lab}</div>
                      <div className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: "var(--text-1)" }}>
                        {fmtDays(v)} <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>{T.daysUnit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>{fill(T.leadN, { n: fmtN(flow.lead_n) })}</p>
                {flow.approx > 0 && (
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.leadApprox, { n: fmtN(flow.approx) })}</p>
                )}
              </>
            ) : (
              <p className="text-sm my-auto" style={{ color: "var(--text-3)" }}>{T.leadNone}</p>
            )}
            <div className="mt-auto pt-3 flex items-start gap-2 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
              <Sigma size={13} className="mt-0.5 flex-shrink-0" />
              <span>{fill(T.flowTotals, { c: fmtN(flow.created), f: fmtN(flow.finished) })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── the cards open the longest: how old they are, then which ones ── */}
      <div className="space-y-3">
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <SectionHead icon={Hourglass} title={T.secAge} subtitle={T.secAgeSub} />
          <div className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 max-sm:[&>*:last-child]:col-span-2">
            {bands.map((b) => {
              const on = band === b.key;
              return (
                <button key={b.key} type="button" aria-pressed={on} disabled={!b.cards && !on}
                  onClick={() => setBand(on ? null : b.key)} title={on ? T.bandUnpick : T.bandPick}
                  className="text-left rounded-xl px-3 py-2.5 min-h-[44px] transition-colors disabled:opacity-50 hover:bg-[var(--bg-accent)]"
                  style={{ background: on ? "var(--brand-bg)" : "var(--bg-inner)", border: `1px solid ${on ? "var(--brand)" : "transparent"}` }}>
                  <div className="text-[11px]" style={{ color: on ? "var(--brand-text)" : "var(--text-3)" }}>{b.label}</div>
                  <div className="text-lg font-bold tabular-nums leading-tight mt-0.5" style={{ color: "var(--text-1)" }}>{fmtN(b.cards)}</div>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--bg-card)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(b.cards / bandMax) * 100}%`, background: C_GOLD }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <TableCard icon={CalendarClock} title={T.secOldest}
          subtitle={fill(T.secOldestSub, { n: fmtN(data.oldest_total) })}
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(rows.length)}</span>}
          toolbar={<SearchInput value={q} onChange={setQ} placeholder={T.search} className="w-full sm:w-72" />}
          fixed minWidth={920}
          footer={data.oldest_total > (data.oldest || []).length
            ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.cutNote, { n: fmtN((data.oldest || []).length) })}</span>
            : null}
          mobile={pageRows.length ? (
            <ul>
              {pageRows.map((r) => (
                <li key={r.id} className="px-4 py-3 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><CardLink row={r} T={T} /></div>
                    <span className="font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{fill(T.days, { n: fmtN(r.age) })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 min-w-0" style={{ color: "var(--text-3)" }}>
                    <span className="truncate">{r.list || "—"}</span>
                    <span className="flex-shrink-0">·</span>
                    <span className="flex-shrink-0 tabular-nums" style={{ color: idleTone(r.idle) }}>{T.cIdle}: {fill(T.days, { n: fmtN(r.idle) })}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noMatch}</div>}
        >
          <colgroup>
            <col style={{ width: "30%" }} /><col style={{ width: "12%" }} /><col style={{ width: "17%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "8%" }} /><col style={{ width: "6%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <Th label={T.cCard} k="name" sort={sort} onSort={onSort} />
              <Th label={T.cList} k="list" sort={sort} onSort={onSort} />
              <Th label={T.cLabels} />
              <Th label={T.cMembers} />
              <Th label={T.cCreated} k="created" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cAge} k="age" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cIdle} k="idle" sort={sort} onSort={onSort} align="right" hint={T.idleTip} />
              <Th label={T.cDue} k="due" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 max-w-0"><CardLink row={r} T={T} /></td>
                <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }} title={r.list}>{r.list || "—"}</td>
                <td className="px-3 py-2 max-w-0"><LabelChips labels={r.labels} /></td>
                <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }} title={r.members.join(", ")}>
                  {r.members.length ? r.members.join(", ") : <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{ddmmyy(r.created)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" title={fill(T.ageTip, { d: ddmmyy(r.created) })}>{fmtN(r.age)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: idleTone(r.idle) }}>{fmtN(r.idle)}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={r.overdue ? T.overdue : undefined}
                  style={{ color: r.overdue ? "var(--status-bad)" : "var(--text-2)" }}>
                  {r.due ? ddmm(r.due) : <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{T.noMatch}</td></tr>
            )}
          </tbody>
        </TableCard>
        <div className="mt-3">
          <Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={PAGE} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}
