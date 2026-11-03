import { useEffect, useMemo, useState } from "react";
import {
  Flame, Timer, Gauge, Thermometer, CalendarDays, ListOrdered, Hourglass, Zap, DoorOpen, Bell, Layers, CalendarRange,
} from "lucide-react";
import KPICard from "../ui/KPICard";
import TableCard, { Th } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import SearchInput from "../ui/SearchInput";
import Tooltip from "../ui/Tooltip";
import { ChartCard, Chart, NoChart, RankedList } from "../ui/AnalysisBoard";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { TONE_HEX } from "../../utils/statusBands";
import { CATEGORY_COLORS, FOLD_COLOR } from "../../utils/chartPalette";
import { useOT, fill, ddmm, ddmmyy, hhmm, fmtN, fmtH, MODE_COLOR, MODE_ORDER } from "./ovensUtil";

// The three period tabs over ONE payload (GET /api/ovens/analysis): every
// figure is a sum of the per-oven-day rows the server built; nothing is
// measured here. Rows of an oven-day with no log are kept («logged: false»)
// and counted nowhere — a day the collector never sent is not a quiet day.

const PAGE = 50;
const C_GOLD = "#C8973F";

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);
  return ready;
}

function totals(days) {
  const t = { logged: 0, bakes: 0, bakeH: 0, bakeModeH: 0, standby: 0, off: 0, heat: 0, door: 0, doorOn: 0,
    doorMin: 0, doorOnMin: 0, alarms: 0, kwh: 0, kwhDays: 0, days: 0 };
  for (const r of days) {
    if (!r.logged) continue;
    t.days += 1;
    t.logged += r.logged_h;
    t.bakes += r.bakes;
    t.bakeH += r.bake_h;
    t.bakeModeH += (r.mode_h.bake_manual || 0) + (r.mode_h.bake_recipe || 0);
    t.standby += r.mode_h.standby || 0;
    t.off += r.mode_h.off || 0;
    t.heat += r.heat_h || 0;
    t.door += r.door_open;
    t.doorOn += r.door_open_on;
    t.doorMin += r.door_min;
    t.doorOnMin += r.door_on_min;
    t.alarms += r.alarms;
    if (r.kwh != null) { t.kwh += r.kwh; t.kwhDays += 1; }
  }
  return t;
}

/** The period's KPIs; `which` picks the four a tab leads with. */
export function PeriodKpis({ data, which }) {
  const T = useOT();
  const t = useMemo(() => totals(data.days), [data.days]);
  const busy = t.logged ? Math.round((100 * t.bakeModeH) / t.logged) : null;
  const cards = {
    bakes: <KPICard key="b" label={T.kBakes} icon={Flame} color={MODE_COLOR.bake_manual}
      value={fmtN(t.bakes)} sub={t.days ? fill(T.kBakesSub, { n: fmtN(t.bakes / t.days, 1) }) : null} />,
    bakeTime: <KPICard key="bt" label={T.kBakeTime} icon={Timer}
      value={`${fmtH(t.bakeH)} ${T.hr.replace("{n}", "").trim()}`}
      sub={t.bakes ? fill(T.kBakeTimeSub, { n: fmtN((60 * t.bakeH) / t.bakes, 1) }) : null} />,
    busy: <KPICard key="u" label={T.kBusy} tooltip={T.kBusyTip} icon={Gauge}
      value={busy == null ? "—" : `${busy}%`} sub={T.kBusySub} />,
    standby: <KPICard key="s" label={T.kStandby} tooltip={T.kStandbyTip} icon={Hourglass} color={MODE_COLOR.standby}
      value={`${fmtH(t.standby)} ${T.hr.replace("{n}", "").trim()}`} sub={T.kStandbySub} />,
    heat: <KPICard key="h" label={T.kHeat} icon={Flame}
      value={`${fmtH(t.heat)} ${T.hr.replace("{n}", "").trim()}`}
      sub={t.logged ? fill(T.kHeatSub, { p: Math.round((100 * t.heat) / t.logged) }) : null} />,
    kwh: <KPICard key="k" label={T.kKwh} icon={Zap}
      value={t.kwhDays ? `${fmtN(t.kwh, 1)} ${T.cKwh}` : "—"} sub={t.kwhDays ? null : T.kKwhNone} />,
    door: <KPICard key="d" label={T.kDoor} icon={DoorOpen}
      value={fmtN(t.doorOn)} sub={fill(T.kDoorSub, { n: fmtN(t.doorOnMin) })} />,
    alarms: <KPICard key="a" label={T.kAlarms} icon={Bell}
      color={t.alarms ? TONE_HEX.bad : undefined} value={fmtN(t.alarms)} sub={T.kAlarmsSub} />,
  };
  return <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">{which.map((k) => cards[k])}</div>;
}

const ovenColor = (ovens, id) => CATEGORY_COLORS[(ovens.findIndex((o) => o.id === id) + 2) % CATEGORY_COLORS.length];

// ── «Pishirishlar» ────────────────────────────────────────────────────────────

export function BakesView({ data, onOpenDay }) {
  const T = useOT();
  const ready = useReady();
  const { gridColor, labelColor, chartTheme, tooltipTheme } = useChartTheme();
  const [chartRef, chartW] = useElementWidth();
  const ovens = data.ovens;
  const many = ovens.length > 1;
  const nameOf = useMemo(() => new Map(ovens.map((o) => [o.id, o.name])), [ovens]);
  const dates = useMemo(() => [...new Set(data.days.map((r) => r.date))].sort(), [data.days]);
  const cats = dates.map(ddmm);

  const series = ovens.map((o) => ({
    name: o.name,
    data: dates.map((d) => data.days.find((r) => r.oven_id === o.id && r.date === d)?.bakes ?? 0),
  }));
  const has = series.some((s) => s.data.some(Boolean));
  const opts = {
    chart: { type: "bar", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    colors: many ? ovens.map((o) => ovenColor(ovens, o.id)) : [MODE_COLOR.bake_manual],
    plotOptions: { bar: { columnWidth: dates.length > 30 ? "80%" : "55%", borderRadius: 2 } },
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    xaxis: {
      categories: cats, tickAmount: ticksForWidth(chartW, cats.length, axisLabelPx(cats)),
      labels: { rotate: 0, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}` } },
    legend: { show: many, position: "top", horizontalAlign: "left", labels: { colors: labelColor } },
    dataLabels: { enabled: false },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false,
      x: { formatter: (_, o) => ddmmyy(dates[o?.dataPointIndex]) } },
  };

  // set temperatures, counted over the period
  const tempRows = useMemo(() => {
    const m = new Map();
    for (const b of data.bakes) if (b.set_c != null) m.set(b.set_c, (m.get(b.set_c) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([t, n]) => ({ key: String(t), label: `${fmtN(t)}°`, total: n, gold: n }));
  }, [data.bakes]);
  const tempMax = Math.max(1, ...tempRows.map((r) => r.total));

  // the bakes themselves
  const [q, setQ] = useState("");
  const [sort, setSort] = usePersistentState("ovens_bakes_sort", { key: "start", dir: "desc" });
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, sort, data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.bakes.filter((b) => !needle || (b.recipe || "").toLowerCase().includes(needle)
      || String(b.set_c ?? "").includes(needle) || (nameOf.get(b.oven_id) || "").toLowerCase().includes(needle));
    const k = sort?.key || "start";
    const dir = sort?.dir === "asc" ? 1 : -1;
    const val = (b) => (k === "oven" ? nameOf.get(b.oven_id) || "" : b[k] ?? (k === "start" ? "" : -1));
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  }, [data.bakes, q, sort, nameOf]);
  const onSort = (k) => setSort((s) => (s?.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const cols = many ? 9 : 8;
  const kind = (b) => (b.manual ? T.manual : b.recipe || T.recipe);
  const over = (b) => (b.minutes != null && b.planned_min ? b.minutes - b.planned_min : null);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PeriodKpis data={data} which={["bakes", "bakeTime", "busy", "alarms"]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard className="lg:col-span-2" icon={CalendarDays} title={T.secPerDay}
          subtitle={`${ddmmyy(data.from)} – ${ddmmyy(data.to)}`}>
          <div ref={chartRef} className="px-2 pt-2 pb-1">
            {has ? <Chart ready={ready} height={260} type="bar" options={opts} series={series} />
              : <NoChart height={260} text={T.noLogs} />}
          </div>
        </ChartCard>
        <ChartCard icon={Thermometer} title={T.secTemps} subtitle={T.secTempsSub}>
          <div className="p-4">
            {tempRows.length
              ? <RankedList rows={tempRows} max={tempMax} parts={[{ key: "gold", label: T.kBakes, color: C_GOLD }]} unit="" />
              : <NoChart height={120} text={T.noLogs} />}
          </div>
        </ChartCard>
      </div>

      <div>
        <TableCard icon={ListOrdered} title={T.secBakes}
          subtitle={fill(T.secBakesSub, { n: fmtN(data.bakes_total) })}
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(rows.length)}</span>}
          toolbar={<SearchInput value={q} onChange={setQ} placeholder={T.search} className="w-full sm:w-72" />}
          fixed minWidth={many ? 960 : 860}
          footer={data.bakes_total > data.bakes.length
            ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.cutNote, { n: fmtN(data.bakes.length) })}</span> : null}
          mobile={pageRows.length ? (
            <ul>
              {pageRows.map((b, i) => (
                <li key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <button type="button" onClick={() => onOpenDay(b.oven_id, b.start.slice(0, 10))}
                    className="w-full text-left px-4 py-3 text-xs active:bg-[var(--bg-inner)]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                        {ddmm(b.start)} {hhmm(b.start)}–{b.stop ? hhmm(b.stop) : T.running}
                      </span>
                      <span className="ml-auto font-bold tabular-nums" style={{ color: "var(--text-1)" }}>
                        {b.set_c != null ? `${fmtN(b.set_c)}°` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 min-w-0" style={{ color: "var(--text-3)" }}>
                      {many && <span className="truncate">{nameOf.get(b.oven_id)}</span>}
                      <span className="flex-shrink-0">{kind(b)}</span>
                      <span className="flex-shrink-0 tabular-nums">{b.minutes != null ? `${fmtN(b.minutes, 1)} ${T.min.replace("{n}", "").trim()}` : ""}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noMatch}</div>}
        >
          <thead>
            <tr>
              {many && <Th label={T.cOven} k="oven" sort={sort} onSort={onSort} />}
              <Th label={T.cStart} k="start" sort={sort} onSort={onSort} />
              <Th label={T.cEnd} />
              <Th label={T.cDur} k="minutes" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cPlanned} k="planned_min" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cSetC} k="set_c" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cKind} />
              <Th label={T.cDoorIn} k="door_opened" sort={sort} onSort={onSort} align="right" />
              <Th label={T.cEnded} />
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((b, i) => {
              const o = over(b);
              return (
                <tr key={i} className="cursor-pointer" onClick={() => onOpenDay(b.oven_id, b.start.slice(0, 10))} title={T.openDay}>
                  {many && <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }}>{nameOf.get(b.oven_id)}</td>}
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{ddmm(b.start)} {hhmm(b.start)}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                    {b.stop ? hhmm(b.stop) : <span style={{ color: "var(--brand-text)" }}>{T.running}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" title={o > 1 ? fill(T.longerThanPlan, { n: fmtN(o, 1) }) : undefined}
                    style={{ color: o > 1 ? "var(--status-warn)" : "var(--text-1)" }}>{b.minutes != null ? fmtN(b.minutes, 1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{b.planned_min != null ? fmtN(b.planned_min, 1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.set_c != null ? `${fmtN(b.set_c)}°` : "—"}</td>
                  <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }} title={kind(b)}>{kind(b)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: b.door_opened ? "var(--text-1)" : "var(--text-4)" }}>{b.door_opened || "—"}</td>
                  <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-3)" }}>{b.ended_by ? T.endedBy[b.ended_by] || b.ended_by : ""}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={cols} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{T.noMatch}</td></tr>
            )}
          </tbody>
        </TableCard>
        <div className="mt-3">
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(rows.length / PAGE))} total={rows.length} pageSize={PAGE} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

// ── «Bandlik» ─────────────────────────────────────────────────────────────────

function DayBar({ r, T }) {
  if (!r.logged) {
    return <div className="h-5 rounded-md" style={{ background: "var(--bg-inner)" }} title={T.mode.none} />;
  }
  const segs = MODE_ORDER.map((m) => [m, r.mode_h[m] || 0]).filter(([, h]) => h > 0);
  return (
    <div className="h-5 rounded-md overflow-hidden flex" style={{ background: "var(--bg-inner)" }}
      title={segs.map(([m, h]) => `${T.mode[m]} ${fmtH(h)}`).join(" · ")}>
      {segs.map(([m, h]) => (
        <div key={m} style={{ width: `${(100 * h) / 24}%`, background: MODE_COLOR[m] }} />
      ))}
    </div>
  );
}

export function UseView({ data, onOpenDay }) {
  const T = useOT();
  const many = data.ovens.length > 1;
  const nameOf = new Map(data.ovens.map((o) => [o.id, o.name]));
  const rows = [...data.days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.oven_id - b.oven_id));
  const shown = MODE_ORDER.filter((m) => data.days.some((r) => r.logged && r.mode_h[m]));
  return (
    <div className="space-y-4 lg:space-y-6">
      <PeriodKpis data={data} which={["busy", "standby", "heat", "kwh"]} />
      <ChartCard icon={Layers} title={T.secModes} subtitle={T.secModesSub}
        right={<Tooltip text={T.useTip} />}>
        <div className="px-4 pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-2)" }}>
          {[...shown, "none"].map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: MODE_COLOR[m] || "var(--bg-inner)", border: m === "none" ? "1px solid var(--border)" : 0 }} />
              {T.mode[m]}
            </span>
          ))}
        </div>
        <div className="p-4 space-y-1.5">
          <div className="grid grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[minmax(0,12rem)_1fr] gap-3 text-[10px] tabular-nums" style={{ color: "var(--text-4)" }}>
            <span />
            <div className="flex justify-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
          </div>
          {rows.map((r) => (
            <button key={`${r.oven_id}-${r.date}`} type="button" disabled={!r.logged}
              onClick={() => onOpenDay(r.oven_id, r.date)} title={r.logged ? T.openDay : T.mode.none}
              className="w-full grid grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[minmax(0,12rem)_1fr] gap-3 items-center text-left rounded-md hover:bg-[var(--bg-inner)] disabled:hover:bg-transparent px-1 -mx-1 py-0.5">
              <span className="text-xs truncate tabular-nums" style={{ color: "var(--text-2)" }}>
                {ddmm(r.date)}{many ? ` · ${nameOf.get(r.oven_id)}` : ""}
              </span>
              <DayBar r={r} T={T} />
            </button>
          ))}
        </div>
      </ChartCard>

      <TableCard icon={CalendarRange} title={T.secUseTable} subtitle={T.secUseTableSub}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(rows.length)}</span>}
        fixed minWidth={many ? 900 : 760}>
        <thead>
          <tr>
            <Th label={T.cDate} />
            {many && <Th label={T.cOven} />}
            <Th label={T.cLogged} align="right" />
            <Th label={T.cBake} align="right" />
            <Th label={T.cStandby} align="right" />
            <Th label={T.cOff} align="right" />
            <Th label={T.cHeat} align="right" />
            <Th label={T.cShare} align="right" />
            <Th label={T.kBakes} align="right" />
            <Th label={T.cKwh} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bake = r.logged ? (r.mode_h.bake_manual || 0) + (r.mode_h.bake_recipe || 0) : null;
            return (
              <tr key={`${r.oven_id}-${r.date}`} className={r.logged ? "cursor-pointer" : ""}
                onClick={r.logged ? () => onOpenDay(r.oven_id, r.date) : undefined}>
                <td className="px-3 py-2 tabular-nums">{ddmmyy(r.date)}</td>
                {many && <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }}>{nameOf.get(r.oven_id)}</td>}
                {r.logged ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{fmtH(r.logged_h)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtH(bake)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtH(r.mode_h.standby || 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{fmtH(r.mode_h.off || 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtH(r.heat_h)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.logged_h ? `${Math.round((100 * bake) / r.logged_h)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtN(r.bakes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{r.kwh != null ? fmtN(r.kwh, 1) : "—"}</td>
                  </>
                ) : (
                  <td colSpan={8} className="px-3 py-2" style={{ color: "var(--text-4)" }}>{T.mode.none}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </div>
  );
}

// ── «Signallar va eshik» ──────────────────────────────────────────────────────

export function AlarmsView({ data, onOpenDay }) {
  const T = useOT();
  const ready = useReady();
  const { gridColor, labelColor, chartTheme, tooltipTheme } = useChartTheme();
  const [chartRef, chartW] = useElementWidth();
  const many = data.ovens.length > 1;
  const nameOf = new Map(data.ovens.map((o) => [o.id, o.name]));
  const dates = [...new Set(data.days.map((r) => r.date))].sort();
  const cats = dates.map(ddmm);
  const sum = (d, k) => data.days.filter((r) => r.date === d && r.logged).reduce((a, r) => a + (r[k] || 0), 0);
  const series = [
    { name: T.sDoorOpenOn, data: dates.map((d) => sum(d, "door_open_on")) },
    { name: T.sDoorOpenOff, data: dates.map((d) => sum(d, "door_open") - sum(d, "door_open_on")) },
  ];
  const has = series.some((s) => s.data.some(Boolean));
  const opts = {
    chart: { type: "bar", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    colors: ["#ec4899", FOLD_COLOR],
    plotOptions: { bar: { columnWidth: dates.length > 30 ? "80%" : "55%", borderRadius: 2 } },
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    xaxis: {
      categories: cats, tickAmount: ticksForWidth(chartW, cats.length, axisLabelPx(cats)),
      labels: { rotate: 0, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}` } },
    legend: { show: true, position: "top", horizontalAlign: "left", labels: { colors: labelColor } },
    dataLabels: { enabled: false },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false,
      x: { formatter: (_, o) => {
        const d = dates[o?.dataPointIndex];
        return d ? `${ddmmyy(d)} · ${fmtN(sum(d, "door_on_min"))} / ${fmtN(sum(d, "door_min"))} ${T.min.replace("{n}", "").trim()}` : "";
      } } },
  };
  const t = totals(data.days);
  const alarms = data.alarms;

  return (
    <div className="space-y-4 lg:space-y-6">
      <PeriodKpis data={data} which={["alarms", "door", "bakes", "busy"]} />
      <ChartCard icon={DoorOpen} title={T.secDoor} subtitle={T.secDoorSub}
        right={t.bakes ? <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.doorPerBake, { n: fmtN(t.doorOn / t.bakes, 1) })}</span> : null}>
        <div ref={chartRef} className="px-2 pt-2 pb-1">
          {has ? <Chart ready={ready} height={240} type="bar" options={opts} series={series} />
            : <NoChart height={240} text={T.noLogs} />}
        </div>
      </ChartCard>

      <TableCard icon={Bell} title={T.secAlarms} subtitle={fill(T.secAlarmsSub, { n: fmtN(alarms.length) })}
        fixed minWidth={many ? 720 : 600}
        mobile={alarms.length ? (
          <ul>
            {alarms.map((a, i) => (
              <li key={i} className="px-4 py-3 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold" style={{ color: "var(--status-bad)" }}>{a.names.map((n) => T.alarmName[n] || n).join(", ")}</span>
                  <span className="ml-auto tabular-nums" style={{ color: "var(--text-3)" }}>{ddmm(a.t)} {hhmm(a.t)}</span>
                </div>
                <div className="mt-1" style={{ color: "var(--text-3)" }}>{T.kind[a.kind]}{many ? ` · ${nameOf.get(a.oven_id)}` : ""}</div>
              </li>
            ))}
          </ul>
        ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noAlarms}</div>}>
        <thead>
          <tr>
            <Th label={T.cTime} />
            {many && <Th label={T.cOven} />}
            <Th label={T.cKind} />
            <Th label={T.cAlarm} />
            <Th label={T.cCode} align="right" />
          </tr>
        </thead>
        <tbody>
          {alarms.length ? alarms.map((a, i) => (
            <tr key={i} className="cursor-pointer" onClick={() => onOpenDay(a.oven_id, a.t.slice(0, 10))}>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">{ddmmyy(a.t)} {hhmm(a.t)}</td>
              {many && <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }}>{nameOf.get(a.oven_id)}</td>}
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{T.kind[a.kind]}</td>
              <td className="px-3 py-2 max-w-0 truncate font-semibold" style={{ color: "var(--status-bad)" }}>
                {a.names.map((n) => T.alarmName[n] || n).join(", ")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>0x{a.code.toString(16)}</td>
            </tr>
          )) : (
            <tr><td colSpan={many ? 5 : 4} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{T.noAlarms}</td></tr>
          )}
        </tbody>
      </TableCard>

      <TableCard icon={DoorOpen} title={T.secDoor} subtitle={T.secDoorSub} fixed minWidth={many ? 700 : 560}>
        <thead>
          <tr>
            <Th label={T.cDate} />
            {many && <Th label={T.cOven} />}
            <Th label={T.cOpens} align="right" />
            <Th label={T.cOpenOnMin} align="right" />
            <Th label={T.cOpenMin} align="right" />
            <Th label={T.kBakes} align="right" />
          </tr>
        </thead>
        <tbody>
          {[...data.days].filter((r) => r.logged).sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
            <tr key={`${r.oven_id}-${r.date}`} className="cursor-pointer" onClick={() => onOpenDay(r.oven_id, r.date)}>
              <td className="px-3 py-2 tabular-nums">{ddmmyy(r.date)}</td>
              {many && <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }}>{nameOf.get(r.oven_id)}</td>}
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtN(r.door_open)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtN(r.door_on_min, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(r.door_min, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(r.bakes)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
