import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { AlertTriangle, Briefcase, CalendarDays, ClipboardList, Grid3x3, Radio, Users } from "lucide-react";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import Button from "../../components/ui/Button";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th } from "../../components/ui/DataTable";
import { Meter, SplitBar, SplitLegend, FigureList } from "../../components/ui/Meter";
import { RankedList, StackBar } from "../../components/ui/AnalysisBoard";
import HeatmapChart from "../../components/charts/HeatmapChart";
import { SkeletonBlock, SkeletonChart, SKELETON_NAME_WIDTHS } from "../../components/ui/Skeleton";
import { WorkersPage, ChartCard, ScopeSwitch, TileSkeletons } from "../../components/workers/WorkersPage";
import VerifixKindsCard from "../../components/workers/VerifixKindsCard";
import { chartBase } from "../../components/workers/chartBase";
import { useFilters } from "../../context/FilterContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import useElementWidth from "../../hooks/useElementWidth";
import { useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { padChartParams, ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { bucketTrend, bucketTick, bucketTitle } from "../../utils/trendBuckets";
import { surnameInitial } from "../../utils/personName";
import { fmtLongDate } from "../Staff";
import api from "../../utils/api";
import { FOLD_COLOR } from "../../utils/chartPalette";
import { ATT_SEGMENTS, ATT_FAMILY, attTone, TONE_HEX } from "../../utils/statusBands";

// «Davomat» — the first of «Odam soni»'s three pages (/workers/attendance; the
// three were one page's tabs until 2026-11-03, see components/workers/
// WorkersPage.jsx): of the people on each brigadir's list, how many came.
//
// The page is read in the order the question is asked (the redesign of
// 2026-11-13, docs/workers-and-attendance.md «Davomat is read top to bottom»):
//   1. is attendance all right?   the four headline tiles
//   2. when did it slip?          attendance by day, and by role beside it
//   3. where exactly?             the brigadir × day heatmap
//   4. the numbers behind it      one row per brigadir
//   5. Verifix's own monthly hours
// One population switch («Jami / Zagruzka») moves ALL of it and lives in the
// toolbar; nothing on the page carries a second copy.

const ROLES = ["Konditer", "Fasovshik", "Zagatovitel", "Other"]; // the zagruzka-counted roles

// Three parts of one list, the same three wherever a list is drawn (the
// headline bar, a table row, a role). Came is the good half; a no-show is the
// amber the shortfall column already wears; leave is the slate of «neither»:
// it is excused, and the rate counts it as attended.
const CAME_COLOR = "#22c55e";
const ABSENT_COLOR = "#f59e0b";
const LEAVE_COLOR = FOLD_COLOR;
const LINE_COLOR = "#C8973F";          // the one metric on the day chart (single-metric accent)
const TOP_ROLES = 7;                   // the roles card names this many, the tail is one row
const CHIP_ROLES = 4;                  // …and the day readout this many
// INK for a band on the card — the `--status-*` tokens hold AA on both themes,
// which the raw 500 shades (fine as a FILL) do not: yellow on white is 1.9:1.
const TONE_INK = { ok: "var(--status-ok)", warn: "var(--status-warn)", bad: "var(--status-bad)" };

// A count of PEOPLE prints whole — over a period it is an average per day, and
// «139.8 workers» reads as a fraction of a person rather than a headcount.
const fmtN = (v) => (v == null ? "—" : (Math.round(v) || 0).toLocaleString("ru-RU"));
const round1 = (v) => Math.round(v * 10) / 10;
const parseDate = (s) => { const [d, m, y] = s.split("."); return new Date(+y, +m - 1, +d); };
const isoOf = (s) => s.split(".").reverse().join("-");
// The band of a whole percent — `attTone` judges the fraction it is handed.
const toneOf = (p) => (p == null ? null : attTone(p / 100));
const inkOf = (p) => TONE_INK[toneOf(p)] || "var(--text-2)";

// The bucket under the pointer, spelled out UNDER the chart — never over it,
// where a tooltip covers the very days being compared. Idle, it holds the
// latest day: the shift-day still being worked is the one most often wanted.
// Its own state, behind a handle, so a hover re-renders these two lines and
// not the page (which would hand ApexCharts new options on every mouse move).
// ONE fixed template — same slots, same order, every number width-pinned — so
// the card never changes size under the pointer.
const DayReadout = forwardRef(function DayReadout({ points, title, tag, stats, roles }, ref) {
  const [idx, setIdx] = useState(null);
  useImperativeHandle(ref, () => ({ show: setIdx }), []);
  const p = points[idx ?? points.length - 1] || points[points.length - 1];
  if (!p) return null;
  // A number starts right after its label; the pinned width trails it (with
  // its note, when it has one), so the next label never shifts under the pointer.
  const pin = (text, color, w, note) => (
    <span className="inline-block text-left" style={{ minWidth: w }}>
      <b className="tabular-nums font-semibold" style={{ color: color || "var(--text-1)" }}>{text}</b>
      {note && <> {note}</>}
    </span>
  );
  const live = tag(p);
  return (
    <div className="border-t mt-1 pt-3 px-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }} aria-live="off">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-semibold" style={{ color: "var(--text-1)" }}>{title(p)}</span>
        {live && <span className="font-medium" style={{ color: "var(--brand-text)" }}>{live}</span>}
        <span className="ml-auto inline-flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {stats(p).map((s) => (
            <span key={s.key} className="whitespace-nowrap">
              {s.label} {pin(s.value, s.color, s.w, s.note)}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 min-h-[18px]">
        {roles(p).map((r) => (
          <span key={r.key} className="whitespace-nowrap">{r.label} {pin(r.value, "var(--text-2)", "2.4em")}</span>
        ))}
      </div>
    </div>
  );
});

export default function WorkersAttendance() {
  const { params, ready } = useFilters();
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  // WHICH people the whole page is about — every role, or the zagruzka-counted
  // ones. One state, shared with «Tarkib».
  const [scope, setScope] = usePersistentState("workers_scope", "all");            // "all" | "zagruzka"
  // WHICH number the table's ROLE columns print: on the list, turned up, or the
  // difference. The table's own option — every other surface shows the list
  // and those who came TOGETHER, so nothing else needs the switch.
  const [measure, setMeasure] = usePersistentState("workers_measure", "roster");   // "roster" | "came" | "diff"
  const [sort, setSort] = usePersistentState("workers_sort", { key: null, dir: "asc" });
  const readout = useRef(null);                          // the day chart's readout under it
  const tableRef = useRef(null);
  const [chartRef, chartW] = useElementWidth();
  const zag = scope === "zagruzka";
  const pct = ATT_FAMILY.ok;                            // green from here — the line a rate is judged by

  const roleLabel = (r) => (r === "Other" ? t("workers.roleOther") : tx(r));

  // ── data ─────────────────────────────────────────────────────────────────────
  // Every request on this page carries the active plant (see FactoryContext);
  // on «All factories» the key is absent and the calls are byte-identical to
  // what they were before factories existed.
  const fparams = useFactoryParams(params);
  // `isPending`, not `isLoading`: the query waits for the filters to be ready,
  // and a query that has not started yet has no rows either — «no data» must
  // not flash before the first answer.
  const { data: headcount = [], isPending, isError, refetch } = useQuery({
    queryKey: ["headcount", fparams],
    queryFn: () => api.get("/api/workers/headcount", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  // The day chart never shows fewer than 7 days, so a short period reads the
  // same rows over the padded window. From 7 days up the params are the SAME
  // object, the key is the same and this is the request above, not a second.
  const chartParams = useMemo(() => padChartParams(fparams), [fparams]);
  const { data: wide } = useQuery({
    queryKey: ["headcount", chartParams],
    queryFn: () => api.get("/api/workers/headcount", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });
  // Who came by ROLE, day by day — the readout's second line.
  const { data: trend } = useQuery({
    queryKey: ["worker-trend", chartParams],
    queryFn: () => api.get("/api/workers/trend", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  const isLoading = isPending && !isError;

  // ── today, read live ───────────────────────────────────────────────────────
  // Each unit's CURRENT shift-day is on the page before its brigadir closes it,
  // read off the live Verifix read (backend `_live_rows`); its `daily` entry
  // carries `live` + `read_at`. date → { at: the oldest read behind it, n: how
  // many units it is live for } — every surface showing one says «so far».
  const liveDays = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => (m.daily || []).forEach((d) => {
      if (!d.live) return;
      const prev = acc[d.date] || { at: null, n: 0 };
      acc[d.date] = {
        n: prev.n + 1,
        at: !prev.at || (d.read_at && d.read_at < prev.at) ? (d.read_at || prev.at) : prev.at,
      };
    }));
    return acc;
  }, [headcount]);
  const liveText = (time) => t("workers.live.cell").replace("{time}", time || "—");
  // The column header speaks for the whole date, and on a date shared by both
  // shifts only some units are still open — so it says how many.
  const liveMarks = useMemo(
    () => Object.fromEntries(Object.entries(liveDays).map(([d, v]) => [d,
      t("workers.live.col").replace("{n}", v.n).replace("{time}", v.at || "—")])),
    [liveDays, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveDates = Object.keys(liveDays).sort((a, b) => parseDate(a) - parseDate(b));

  // ── one brigadir, for the population on screen ─────────────────────────────
  // «Jami» reads the backend's own per-day averages. «Zagruzka» is the same
  // arithmetic over the `z_*` halves of each day (the zagruzka-counted titles;
  // a payload from before the split falls back to the whole list), so the
  // tiles, the day chart, the heatmap and the table are about ONE population.
  // Leave is ATTENDED: «О» is отпуск, booked by the company and standing on
  // the list for weeks — the rate is (came + on leave) ÷ on the list, summed
  // over the period and then divided, never an average of daily rates.
  const figs = useMemo(() => headcount.map((m) => {
    const gap = m.official_hc != null ? round1(m.official_hc - (m.avg_daily_hc || 0)) : null;
    if (!zag) {
      return {
        ...m, gap, onList: m.avg_roster || 0, came: m.avg_came || 0, absent: m.avg_absent || 0,
        leave: m.avg_leave || 0, rSum: m.roster_sum || 0, aSum: (m.came_sum || 0) + (m.leave_sum || 0),
        rate: m.att_rate ?? null,
      };
    }
    const days = m.daily || [];
    const n = days.length || 1;
    let r = 0, c = 0, l = 0;
    days.forEach((d) => {
      r += d.z_roster ?? d.roster ?? 0; c += d.z_came ?? d.came ?? 0; l += d.z_on_leave ?? d.on_leave ?? 0;
    });
    return {
      ...m, gap, onList: round1(r / n), came: round1(c / n), absent: round1((r - c) / n), leave: round1(l / n),
      rSum: r, aSum: c + l, rate: r ? Math.round(((c + l) / r) * 100) : null,
    };
  }), [headcount, zag]);

  // ── the plant, for the headline tiles ──────────────────────────────────────
  const T = useMemo(() => {
    const sum = (k) => figs.reduce((s, f) => s + (f[k] || 0), 0);
    const rSum = sum("rSum"), aSum = sum("aSum");
    return {
      onList: sum("onList"), came: sum("came"), absent: sum("absent"), leave: sum("leave"),
      rSum, aSum, rate: rSum ? Math.round((aSum / rSum) * 100) : null,
    };
  }, [figs]);
  const uniqueWorkers = headcount.reduce((s, m) => s + (m.total || 0), 0);
  const rated = figs.filter((f) => f.rate != null);
  const below = rated.filter((f) => f.rate < pct).sort((a, b) => a.rate - b.rate);
  // Штат gap — a different comparison (reported vs present, not list vs came),
  // always over the zagruzka-counted roles, whatever the switch says.
  const withOfficial = figs.filter((m) => m.official_hc != null);
  const shortfall = Math.max(0, withOfficial.reduce((s, m) => s + (m.official_hc - (m.avg_daily_hc || 0)), 0));
  const shortUnits = figs.filter((m) => (m.gap ?? 0) > 2).sort((a, b) => b.gap - a.gap);
  const mismatchN = headcount.filter((m) => (m.mismatch_days || 0) > 0).length;

  // ── sorting ────────────────────────────────────────────────────────────────
  function onSort(key) {
    setSort((p) => (p.key === key
      ? (p.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" })
      : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  // A tile that counts brigadirs puts them first in the table and takes the
  // reader there — from «how many» to «who» in one press.
  function showInTable(key, dir) {
    setSort({ key, dir });
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    tableRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }
  // What a ROLE column prints. «Farq» is derived here — the backend emits both
  // role maps over the same keys, and roster ⊇ came keeps it non-negative.
  const roleVal = (m, r) =>
    measure === "roster" ? (m.avg_roster_by_role?.[r] ?? 0)
    : measure === "came" ? (m.avg_came_by_role?.[r] ?? 0)
    : round1((m.avg_roster_by_role?.[r] ?? 0) - (m.avg_came_by_role?.[r] ?? 0));
  const sortedRows = useMemo(() => {
    if (!sort.key) return figs;
    const dir = sort.dir === "asc" ? 1 : -1;
    // Any key that is not one of the fixed columns is a ROLE column, and those
    // sort by whichever measure their cells are currently showing.
    const val = {
      name: (m) => tl(m.name) || "", onList: (m) => m.onList, came: (m) => m.came, absent: (m) => m.absent,
      rate: (m) => m.rate ?? -1, official: (m) => m.official_hc ?? -1, gap: (m) => m.gap ?? -999,
    }[sort.key] || ((m) => roleVal(m, sort.key));
    return [...figs].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }, [figs, sort, tl, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── roles ──────────────────────────────────────────────────────────────────
  // The role CATALOG and its order are read off the ROSTER numbers (roster ⊇
  // came, so it is the complete list: a role nobody turned up for keeps its
  // slot). «Zagruzka» is the four counted roles, «Jami» adds every other title.
  const roleTotals = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => {
      Object.entries(m.avg_roster_by_role || {}).forEach(([r, n]) => { (acc[r] ||= { roster: 0, came: 0 }).roster += n; });
      Object.entries(m.avg_came_by_role || {}).forEach(([r, n]) => { (acc[r] ||= { roster: 0, came: 0 }).came += n; });
    });
    return acc;
  }, [headcount]);
  const extraRoles = useMemo(
    () => Object.keys(roleTotals).filter((r) => !ROLES.includes(r)).sort((a, b) => roleTotals[b].roster - roleTotals[a].roster),
    [roleTotals]);
  const activeRoles = zag ? ROLES : [...ROLES, ...extraRoles];
  // By size, once — the roles card, the day readout and nothing else re-sorts.
  const roleOrder = activeRoles.filter((r) => (roleTotals[r]?.roster || 0) > 0)
    .sort((a, b) => roleTotals[b].roster - roleTotals[a].roster);
  const roleKey = roleOrder.join("|");
  const roleRows = useMemo(() => {
    const row = (key, label, roster, came) => {
      const total = Math.round(roster), c = Math.min(total, Math.round(came));
      return { key, label, title: label, total, came: c, away: total - c };
    };
    const rows = roleOrder.map((r) => row(r, roleLabel(r), roleTotals[r].roster, roleTotals[r].came));
    if (rows.length <= TOP_ROLES + 1) return rows;
    const tail = roleOrder.slice(TOP_ROLES);
    return [
      ...rows.slice(0, TOP_ROLES),
      { ...row("__rest", t("workers.rolesRest"),
          tail.reduce((s, r) => s + roleTotals[r].roster, 0), tail.reduce((s, r) => s + roleTotals[r].came, 0)),
        title: tail.map(roleLabel).join(" · ") },
    ];
  }, [roleKey, roleTotals, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const roleListTotal = roleRows.reduce((s, r) => s + r.total, 0);
  const roleMax = Math.max(1, ...roleRows.map((r) => r.total));
  const listParts = [
    { key: "came", label: t("workers.came"), color: CAME_COLOR },
    { key: "leave", label: t("workers.onLeave"), color: LEAVE_COLOR },
    { key: "away", label: t("workers.absent"), color: ABSENT_COLOR },
  ];

  // ── attendance by day ──────────────────────────────────────────────────────
  // The plant's own rate per day, off the very cells the heatmap paints — so a
  // point, the column under it and the headline figure are one arithmetic. A
  // long period is folded into weeks or months (utils/trendBuckets): the rate
  // of a bucket is its sums divided, its counts are per-day averages.
  const chart = useMemo(() => {
    const byDate = new Map();
    (wide || []).forEach((m) => (m.daily || []).forEach((d) => {
      const a = byDate.get(d.date) || { date: d.date, iso: isoOf(d.date), roster: 0, came: 0, leave: 0, live: null };
      a.roster += zag ? d.z_roster ?? d.roster ?? 0 : d.roster || 0;
      a.came   += zag ? d.z_came ?? d.came ?? 0 : d.came || 0;
      a.leave  += zag ? d.z_on_leave ?? d.on_leave ?? 0 : d.on_leave || 0;
      if (d.live) a.live = !a.live || (d.read_at && d.read_at < a.live) ? (d.read_at || a.live || "") : a.live;
      byDate.set(d.date, a);
    }));
    const days = [...byDate.values()].sort((a, b) => (a.iso < b.iso ? -1 : 1));
    const tIdx = Object.fromEntries((trend?.dates || []).map((d, i) => [d, i]));
    const { grain, points } = bucketTrend(days.map((d) => ({ day: d.iso, open: 0, opened: 0, closed: 0 })));
    let k = 0;
    const pts = points.map((p) => {
      const b = { day: p.day, from: p.from, to: p.to, n: 0, roster: 0, came: 0, leave: 0, live: null, ti: [] };
      while (k < days.length && days[k].iso <= p.to) {
        const d = days[k++];
        b.n += 1; b.roster += d.roster; b.came += d.came; b.leave += d.leave;
        if (d.live != null) b.live = d.live;
        if (tIdx[d.date] != null) b.ti.push(tIdx[d.date]);
      }
      b.rate = b.roster ? ((b.came + b.leave) / b.roster) * 100 : null;
      return b;
    });
    return { grain, pts };
  }, [wide, trend, zag]);
  const { baseChart, axisLabels, gridCfg } = chartBase({ labelColor, legendColor, gridColor });
  const cats = chart.pts.map((p) => bucketTick(p.day, chart.grain));
  const rates = chart.pts.map((p) => (p.rate == null ? null : round1(p.rate)));
  const known = rates.filter((v) => v != null);
  // A LINE may zoom (a bar may not): the axis opens a step under the lowest
  // day, never above the line the days are judged by, and steps by 10.
  const yMin = known.length ? Math.max(0, Math.min(pct - 10, Math.floor((Math.min(...known) - 3) / 10) * 10)) : 0;
  const ySpan = 100 - yMin;
  const yStep = ySpan <= 70 ? 10 : ySpan % 20 === 0 ? 20 : ySpan % 30 === 0 ? 30 : 10;
  // The line is named by the axis whenever a tick falls on it; only where the
  // steps skip it does it carry a label of its own.
  const lineOnTick = (pct - yMin) % yStep === 0;
  // The days still being worked close the axis: their stretch is dashed.
  let liveTail = 0;
  if (chart.grain === "day") for (let i = chart.pts.length - 1; i >= 0 && chart.pts[i].live != null; i--) liveTail += 1;
  const dots = known.length <= 45;
  const dayOptions = {
    chart: {
      ...baseChart, type: "line", zoom: { enabled: false }, parentHeightOffset: 0,
      events: { mouseLeave: () => readout.current?.show(null) },
    },
    stroke: { curve: "straight", width: 2.5 },
    colors: [LINE_COLOR],
    markers: {
      size: dots ? 4 : 0, strokeWidth: 0, hover: { sizeOffset: 2 },
      // Each day wears the band it fell in — the heatmap's verdict, on the line.
      discrete: dots ? rates.map((v, i) => (v == null ? null : {
        seriesIndex: 0, dataPointIndex: i, size: 4, strokeColor: "transparent",
        fillColor: TONE_HEX[toneOf(Math.round(v))],
      })).filter(Boolean) : [],
    },
    ...(liveTail && chart.pts.length > liveTail ? { forecastDataPoints: { count: liveTail, dashArray: 5 } } : {}),
    dataLabels: { enabled: false },
    xaxis: {
      categories: cats,
      // Thinned to the card's measured width, never to a fixed count.
      tickAmount: ticksForWidth(chartW, cats.length, axisLabelPx(cats)),
      labels: { ...axisLabels, rotate: 0, rotateAlways: false, hideOverlappingLabels: true },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: {
      min: yMin, max: 100, tickAmount: ySpan / yStep,
      labels: { ...axisLabels, formatter: (v) => `${Math.round(v)}%` },
    },
    annotations: {
      yaxis: [{
        y: pct, borderColor: TONE_HEX.ok, strokeDashArray: 4,
        ...(lineOnTick ? {} : { label: {
          text: `${pct}%`, position: "left", textAnchor: "start", offsetX: 4, borderWidth: 0,
          style: { color: TONE_HEX.ok, background: "transparent", fontSize: "10px" },
        } }),
      }],
    },
    grid: { ...gridCfg, padding: { left: 6, right: 12 } },
    legend: { show: false }, theme: chartTheme,
    // Apex's own box is hidden (.att-trend); the callback is only the source
    // of the hovered index, written to the readout under the chart.
    tooltip: {
      theme: tooltipTheme,
      custom: ({ dataPointIndex }) => { readout.current?.show(dataPointIndex); return ""; },
    },
  };
  // The readout's roles: the largest few by name, the rest as one figure —
  // who CAME, per day (a bucket of days: the average of its days).
  const chipRoles = roleOrder.length > CHIP_ROLES + 1 ? roleOrder.slice(0, CHIP_ROLES) : roleOrder;
  const restRoles = roleOrder.slice(chipRoles.length);
  const cameOf = (p, roleKeys) => (p.ti.length && trend?.series
    ? Math.round(p.ti.reduce((s, i) => s + roleKeys.reduce((n, r) => n + ((trend.series[r] || [])[i] || 0), 0), 0) / p.ti.length)
    : null);
  const readoutProps = {
    title: (p) => bucketTitle(p, chart.grain, (iso) => fmtLongDate(new Date(`${iso}T00:00:00`), t, lang), t)
      + (chart.grain === "day" ? "" : ` · ${t("workers.perDay")}`),
    tag: (p) => (chart.grain === "day" && p.live != null ? t("workers.live.soFar").replace("{time}", p.live || "—") : null),
    stats: (p) => {
      const n = p.n || 1;
      const absent = (p.roster - p.came) / n, leave = p.leave / n;
      return [
        { key: "rate", label: t("workers.kpi.attRate"), value: p.rate == null ? "—" : `${Math.round(p.rate)}%`, color: inkOf(p.rate == null ? null : Math.round(p.rate)), w: "2.6em" },
        { key: "list", label: t("workers.onList"), value: fmtN(p.roster / n), w: "2.9em" },
        { key: "came", label: t("workers.came"), value: fmtN(p.came / n), w: "2.9em" },
        { key: "absent", label: t("workers.absent"), value: fmtN(absent), w: "8em",
          note: `(${fmtN(leave)} ${t("workers.onLeaveShort")})` },
      ];
    },
    roles: (p) => [
      ...chipRoles.map((r) => ({ key: r, label: roleLabel(r), value: fmtN(cameOf(p, [r])) })),
      ...(restRoles.length ? [{ key: "__rest", label: t("workers.rolesRest"), value: fmtN(cameOf(p, restRoles)) }] : []),
    ],
  };

  // ── the heatmap ────────────────────────────────────────────────────────────
  // Reuses the fleet HeatmapChart (supervisor rows × day cols). Each cell is
  // that day's (came + on leave) ÷ on-the-list — the rate column's own metric —
  // and the counts behind it ride along for the hover text. HeatmapChart reads
  // `net_util` as a 0–1 fraction; days with no list stay null → «—».
  const heatDates = useMemo(() => {
    const set = new Set();
    headcount.forEach((m) => (m.daily || []).forEach((d) => set.add(d.date)));
    return [...set].sort((a, b) => parseDate(a) - parseDate(b));
  }, [headcount]);
  const heatManagers = useMemo(() => headcount.map((m) => m.name), [headcount]);
  const heatData = useMemo(() => {
    const out = {};
    headcount.forEach((m) => {
      const byDate = Object.fromEntries((m.daily || []).map((d) => [d.date, d]));
      const row = {};
      heatDates.forEach((dt) => {
        const d = byDate[dt];
        const roster   = d && (zag ? d.z_roster   ?? d.roster   : d.roster);
        const came     = d && (zag ? d.z_came     ?? d.came     : d.came);
        const absent   = d && (zag ? d.z_absent   ?? d.absent   : d.absent);
        const on_leave = d && (zag ? d.z_on_leave ?? d.on_leave : d.on_leave);
        row[dt] = roster
          ? { net_util: (came + (on_leave || 0)) / roster, roster, came, absent, on_leave,
              live: !!d.live, read_at: d.read_at || null }
          : { net_util: null };
      });
      out[m.name] = row;
    });
    return out;
  }, [headcount, heatDates, zag]);
  // Hover breakdown for a heatmap cell — the percentage says how bad, these say
  // how many, which is the number a supervisor is actually asked about.
  const heatTitle = (cell) => {
    if (!cell || cell.roster == null) return undefined;
    const parts = [
      `${t("workers.onList")}: ${cell.roster}`,
      `${t("workers.came")}: ${cell.came}`,
      `${t("workers.absent")}: ${cell.absent}`,
    ];
    if (cell.on_leave > 0) parts.push(`${t("workers.onLeave")}: ${cell.on_leave}`);
    return parts.join(" · ") + (cell.live ? `\n${liveText(cell.read_at)}` : "");
  };
  // …and the same breakdown on TAP, because `title` is a hover affordance and
  // this platform is read on a phone.
  const [dayCell, setDayCell] = useState(null);   // { name, date, cell }
  // A brigadir's whole row, on a phone — where the table is a list of cards
  // and the role columns have nowhere to stand.
  const [unitRow, setUnitRow] = useState(null);

  // ── the table's pieces ─────────────────────────────────────────────────────
  const listMax = Math.max(1, ...figs.map((f) => Math.round(f.onList)));
  // One list as a bar: its length is the list against the largest one on the
  // page, its split who came, who is on leave and who did not come.
  const listBar = (f) => {
    const total = Math.round(f.onList), came = Math.min(total, Math.round(f.came));
    const leave = Math.min(total - came, Math.round(f.leave));
    return { total, came, leave, away: total - came - leave };
  };
  const totalRow = {
    onList: T.onList, came: T.came, absent: T.absent, leave: T.leave, rate: T.rate,
    official: withOfficial.reduce((s, m) => s + (m.official_hc || 0), 0),
  };
  const numCell = "px-3 py-2 text-right tabular-nums";
  const sumCell = `${numCell} sticky bottom-0 font-semibold`;
  const sumStyle = { background: "var(--bg-inner)", color: "var(--text-1)" };
  const lower = (s) => String(s).toLocaleLowerCase();
  const failed = isError && headcount.length === 0;
  const empty = !isLoading && !failed && headcount.length === 0;
  const colCount = 9 + activeRoles.length;

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <WorkersPage titleKey="nav.workersAttendance"
      right={<ScopeSwitch scope={scope} setScope={setScope} t={t} />}>
      {failed ? (
        // A failure is not «no closed days»: it says so, and offers the way back.
        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState tone="danger" height="h-56" title={t("workers.loadError")} message={t("workers.loadErrorMsg")} showUploadLink={false}
            action={<Button variant="secondary" onClick={() => refetch()}>{t("common.retry")}</Button>} />
        </div>
      ) : empty ? (
        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState height="h-56" title={t("workers.empty.title")} message={t("workers.empty.msg")} showUploadLink={false} />
        </div>
      ) : (
        <>
          {/* 1 · Is attendance all right? Read left to right: the rate against
              its line, what the list is made of, who is under the line, who
              is short of the reported headcount. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-6">
            {isLoading ? <TileSkeletons /> : (
              <>
                <KPICard size="lg" label={t("workers.kpi.attRate")} tooltip={t("workers.tip.attRate")}
                  value={T.rate == null ? "—" : `${T.rate}%`} valueColor={inkOf(T.rate)}
                  sub={(
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="tabular-nums whitespace-nowrap">{fmtN(T.aSum)} / {fmtN(T.rSum)}</span>
                      {/* The shift-day still being worked is counted in, read
                          live — said once, under the figure it moves. */}
                      {liveDates.length > 0 && (
                        <span className="inline-flex items-start gap-1 min-w-0"
                          title={t("workers.live.note").replace("{days}", liveDates
                            .map((d) => `${d.slice(0, 5)} (${liveDays[d].at || "—"})`).join(", "))}>
                          <Radio size={11} className="flex-shrink-0 mt-[3px]" style={{ color: "var(--brand)" }} aria-hidden />
                          {t("workers.live.short").replace("{days}", liveDates.map((d) => d.slice(0, 5)).join(", "))}
                        </span>
                      )}
                    </span>
                  )}>
                  <Meter value={T.rate} target={pct} targetLabel={`${pct}%`} color={TONE_HEX[toneOf(T.rate)] || FOLD_COLOR}
                    label={`${t("workers.kpi.attRate")}: ${T.rate ?? "—"}%, ${pct}%`} />
                </KPICard>

                <KPICard label={t("workers.kpi.onList")} tooltip={t("workers.tip.onList")} value={fmtN(T.onList)}
                  sub={zag
                    ? `${figs.length} ${t("workers.kpi.supervisors")}`
                    : `${figs.length} ${t("workers.kpi.supervisors")} · ${fmtN(uniqueWorkers)} ${t("workers.kpi.uniqueShort")}`}>
                  <SplitBar parts={[
                    { key: "came", label: t("workers.came"), value: Math.round(T.came), color: CAME_COLOR },
                    { key: "leave", label: t("workers.onLeave"), value: Math.round(T.leave), color: LEAVE_COLOR },
                    { key: "away", label: t("workers.absent"), value: Math.max(0, Math.round(T.absent) - Math.round(T.leave)), color: ABSENT_COLOR },
                  ]} />
                  <SplitLegend className="mt-2" parts={[
                    { key: "came", label: t("workers.came"), text: fmtN(T.came), color: CAME_COLOR },
                    { key: "absent", label: t("workers.absent"), text: fmtN(T.absent), color: ABSENT_COLOR,
                      sub: Math.round(T.leave) >= 1 ? `(${fmtN(T.leave)} ${t("workers.onLeaveShort")})` : null },
                  ]} />
                </KPICard>

                <KPICard label={t("workers.kpi.below").replace("{p}", pct)} tooltip={t("workers.tip.below").replace("{p}", pct)}
                  value={String(below.length)} unit={`/ ${rated.length} ${t("workers.kpi.supervisors")}`}
                  valueColor={!below.length ? TONE_INK.ok : below.some((f) => toneOf(f.rate) === "bad") ? TONE_INK.bad : TONE_INK.warn}
                  onValueClick={below.length ? () => showInTable("rate", "asc") : undefined}
                  sub={below.length > 3 ? t("workers.kpi.more").replace("{n}", below.length - 3) : undefined}>
                  <FigureList empty={t("workers.kpi.belowNone").replace("{p}", pct)}
                    rows={below.slice(0, 3).map((f) => ({
                      key: f.manager_id, label: surnameInitial(tl(f.name)), title: tl(f.name),
                      value: `${f.rate}%`, color: inkOf(f.rate),
                    }))} />
                </KPICard>

                <KPICard label={t("workers.kpi.shortfall")} tooltip={t("workers.tip.shortfall")}
                  value={fmtN(shortfall)} unit={t("workers.tmUnit")}
                  valueColor={shortUnits.length ? TONE_INK.warn : undefined}
                  onValueClick={shortUnits.length ? () => showInTable("gap", "desc") : undefined}
                  sub={mismatchN ? `${mismatchN} ${t("workers.mismatchWarn")}` : undefined}>
                  <FigureList empty={t("workers.kpi.shortNone")}
                    rows={shortUnits.slice(0, 3).map((f) => ({
                      key: f.manager_id, label: surnameInitial(tl(f.name)), title: tl(f.name),
                      value: `−${fmtN(f.gap)}`,
                    }))} />
                </KPICard>
              </>
            )}
          </div>

          {/* 2 · When did it slip — and which roles are missing. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-4 lg:mb-6">
            <ChartCard className="lg:col-span-2" icon={CalendarDays} title={t("workers.daily.title")}
              subtitle={chart.grain === "week" ? t("workers.daily.subWeek") : chart.grain === "month" ? t("workers.daily.subMonth") : undefined}
              info={`${t("workers.daily.info").replace("{p}", pct)} ${t("workers.info.original")}`}
              bodyClassName="px-2 pt-2 pb-3">
              {!wide ? <SkeletonChart className="h-[360px] m-2" />
                : known.length ? (
                  <>
                    <div ref={chartRef} className="att-trend">
                      <ReactApexChart key={`${scope}-${chart.grain}-${cats.length}`} type="line" height={300}
                        series={[{ name: t("workers.kpi.attRate"), data: rates }]} options={dayOptions} />
                    </div>
                    <DayReadout ref={readout} points={chart.pts} {...readoutProps} />
                  </>
                )
                : <EmptyState height="h-[360px]" title={t("workers.empty.title")} message={t("workers.empty.msg")} showUploadLink={false} />}
            </ChartCard>

            <ChartCard icon={Briefcase} title={t("workers.byRole")}
              info={`${t("workers.info.byRole")} ${t("workers.info.original")}`}>
              {isLoading ? <SkeletonChart className="h-[330px]" />
                : roleRows.length ? (
                  <div className="flex-1 flex flex-col">
                    <RankedList
                      rows={roleRows} max={roleMax} unit={t("workers.tmUnit")}
                      parts={listParts.filter((p) => p.key !== "leave")}
                      extra={(r) => (
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                          {roleListTotal ? `${Math.round((r.total / roleListTotal) * 100)}%` : ""}
                        </span>
                      )}
                      value={(r) => (
                        <span className="text-xs tabular-nums whitespace-nowrap min-w-[5.5em] text-right" style={{ color: "var(--text-3)" }}>
                          <b className="font-bold" style={{ color: "var(--text-1)" }}>{fmtN(r.came)}</b> / {fmtN(r.total)}
                        </span>
                      )}
                    />
                    <div className="mt-auto pt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-[2px]" style={{ background: CAME_COLOR }} />{t("workers.came")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-[2px]" style={{ background: ABSENT_COLOR }} />{t("workers.absent")}
                      </span>
                      <span className="ml-auto">{t("workers.perDay")}</span>
                    </div>
                  </div>
                )
                : <EmptyState height="h-[330px]" title={t("workers.empty.title")} message={t("workers.empty.msg")} showUploadLink={false} />}
            </ChartCard>
          </div>

          {/* 3 · Where exactly — brigadir × day, the fleet heatmap's own grid. */}
          <ChartCard icon={Grid3x3} title={t("workers.heatmap")} info={`${t("workers.info.heatmap")} ${t("workers.info.original")}`} className="mb-4 lg:mb-6">
            {isLoading ? <SkeletonChart className="h-72" />
              : heatManagers.length && heatDates.length
                ? <HeatmapChart dates={heatDates} managers={heatManagers} data={heatData}
                    mode="actual" segments={ATT_SEGMENTS} cellTitle={heatTitle} dateMarks={liveMarks}
                    onCellClick={(name, date, v, cell) => cell?.roster && setDayCell({ name, date, cell })} />
                : <EmptyState title={t("workers.empty.title")} message={t("workers.empty.msg")} showUploadLink={false} />}
          </ChartCard>

          {/* 4 · The numbers behind it — one row per brigadir. The list as a
              bar stands where the treemap did: its length is the brigade
              against the largest one, its split who came. */}
          <div ref={tableRef} className="scroll-mt-4 mb-4 lg:mb-6">
            <TableCard icon={ClipboardList} title={t("workers.summary")} mobileMaxHeight="none"
              right={(
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* The switch drives the ROLE columns only. Ro'yxatda / Keldi /
                      Kelmadi stay side by side whatever is selected — comparing
                      them is the whole job of those three columns. */}
                  <span className="text-[11px] max-sm:hidden" style={{ color: "var(--text-3)" }}>{t("workers.roleCols")}</span>
                  <SegmentedToggle className="max-sm:hidden"
                    size="sm" value={measure} onChange={setMeasure}
                    options={[["roster", t("workers.msRoster")], ["came", t("workers.msCame")], ["diff", t("workers.msDiff")]]} />
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{isLoading ? "" : figs.length}</span>
                </div>
              )}
              mobile={(
                <div>
                  {isLoading && SKELETON_NAME_WIDTHS.map((w, i) => (
                    <div key={i} className="px-4 py-3" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <SkeletonBlock className={`h-4 ${w} mb-2.5`} />
                      <SkeletonBlock className="h-2.5 w-full mb-2.5" />
                      <SkeletonBlock className="h-3 w-2/3" />
                    </div>
                  ))}
                  {sortedRows.map((m, i) => (
                    <button key={m.manager_id} type="button" onClick={() => setUnitRow(m)}
                      className="block w-full text-left px-4 py-3 active:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:bg-[var(--bg-inner)]"
                      style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(m.name)}</span>
                        <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: inkOf(m.rate) }}>
                          {m.rate == null ? "—" : `${m.rate}%`}
                        </span>
                      </div>
                      <div className="mt-2"><StackBar row={listBar(m)} max={listMax} parts={listParts} unit={t("workers.tmUnit")} /></div>
                      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                        <span className="whitespace-nowrap">S{m.shift} · {fmtN(m.onList)} {lower(t("workers.onList"))}</span>
                        <span className="truncate">
                          {fmtN(m.came)} {lower(t("workers.came"))} · {fmtN(m.absent)} {lower(t("workers.absent"))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}>
              <thead>
                <tr>
                  <Th label={t("workers.name")} k="name" sort={sort} onSort={onSort} />
                  <Th label={t("overview.shift")} align="center" />
                  <Th label={t("workers.days")} align="right" hint={t("workers.tip.daysCol")} />
                  <Th label={t("workers.onList")} k="onList" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.onList")} />
                  <Th label={t("workers.came")} k="came" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.came")} />
                  <Th label={t("workers.absent")} k="absent" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.absent")} />
                  <Th label={t("workers.attRate")} k="rate" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.attRate")} />
                  <Th label={t("workers.official")} k="official" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.officialCol")} />
                  <Th label={t("workers.shortfall")} k="gap" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.shortfall")} />
                  {/* Role columns follow the page's population: «Zagruzka» keeps
                      the four counted roles, «Jami» appends every other title. */}
                  {activeRoles.map((r) => (
                    <Th key={r} k={r} sort={sort} onSort={onSort} align="right" label={roleLabel(r)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && SKELETON_NAME_WIDTHS.map((w, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><SkeletonBlock className={`h-3.5 ${w}`} /></td>
                    {Array.from({ length: colCount - 1 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3.5 w-8 ml-auto" /></td>
                    ))}
                  </tr>
                ))}
                {sortedRows.map((m) => (
                  <tr key={m.manager_id}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(m.name)}</td>
                    <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>S{m.shift}</td>
                    <td className={numCell} style={{ color: "var(--text-3)" }}>{m.days ?? 0}</td>
                    <td className={numCell} style={{ color: "var(--text-1)", fontWeight: 600 }}>
                      <span className="inline-flex items-center justify-end gap-2.5">
                        <span className="w-24 flex-shrink-0"><StackBar row={listBar(m)} max={listMax} parts={listParts} unit={t("workers.tmUnit")} /></span>
                        <span className="min-w-[2.2em]">{fmtN(m.onList)}</span>
                      </span>
                    </td>
                    <td className={numCell} style={{ color: "var(--text-2)" }}>{fmtN(m.came)}</td>
                    {/* The leave share sits beside the number because "8
                        missing" and "8 missing, 6 of them on leave" are
                        different problems. */}
                    <td className={numCell} style={{ color: "var(--text-2)" }}>
                      {fmtN(m.absent)}
                      {Math.round(m.leave || 0) > 0 && (
                        <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                          ({fmtN(m.leave)} {t("workers.onLeaveShort")})
                        </span>
                      )}
                    </td>
                    <td className={numCell} style={{ color: inkOf(m.rate), fontWeight: 700 }}>
                      {m.rate == null ? "—" : `${m.rate}%`}
                    </td>
                    <td className={numCell} style={{ color: "var(--text-2)" }}>{fmtN(m.official_hc)}</td>
                    <td className={numCell} style={{ color: (m.gap ?? 0) > 2 ? TONE_INK.warn : "var(--text-2)" }}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {(m.gap ?? 0) > 2 && <AlertTriangle size={11} aria-hidden />}
                        {m.gap == null ? "—" : (Math.round(m.gap) > 0 ? `−${fmtN(m.gap)}` : "0")}
                      </span>
                    </td>
                    {activeRoles.map((r) => {
                      const v = Math.round(roleVal(m, r));
                      return <td key={r} className={numCell} style={{ color: v ? "var(--text-2)" : "var(--text-4)" }}>{v}</td>;
                    })}
                  </tr>
                ))}
                {/* The plant — pinned under the rows, whatever they are sorted by. */}
                {!isLoading && figs.length > 1 && (
                  <tr>
                    <td className="px-3 py-2 sticky bottom-0 font-semibold" style={sumStyle}>{t("workers.total")}</td>
                    <td className="px-3 py-2 sticky bottom-0" style={sumStyle} />
                    <td className="px-3 py-2 sticky bottom-0" style={sumStyle} />
                    <td className={sumCell} style={sumStyle}>{fmtN(totalRow.onList)}</td>
                    <td className={sumCell} style={sumStyle}>{fmtN(totalRow.came)}</td>
                    <td className={sumCell} style={sumStyle}>
                      {fmtN(totalRow.absent)}
                      {Math.round(totalRow.leave) > 0 && (
                        <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--text-3)" }}>
                          ({fmtN(totalRow.leave)} {t("workers.onLeaveShort")})
                        </span>
                      )}
                    </td>
                    <td className={sumCell} style={{ ...sumStyle, color: inkOf(totalRow.rate) }}>
                      {totalRow.rate == null ? "—" : `${totalRow.rate}%`}
                    </td>
                    <td className={sumCell} style={sumStyle}>{withOfficial.length ? fmtN(totalRow.official) : "—"}</td>
                    <td className={sumCell} style={sumStyle}>{withOfficial.length ? (Math.round(shortfall) > 0 ? `−${fmtN(shortfall)}` : "0") : "—"}</td>
                    {activeRoles.map((r) => (
                      <td key={r} className={sumCell} style={sumStyle}>
                        {fmtN(figs.reduce((s, m) => s + roleVal(m, r), 0))}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </TableCard>
          </div>
        </>
      )}

      {/* One day of one brigadir, spelled out — the tap target behind every
          heatmap cell. Four numbers, no chrome: the cell already said the
          percentage, this says what it is made of. */}
      <Modal open={!!dayCell} onClose={() => setDayCell(null)} maxWidth="max-w-xs"
        icon={<Users size={16} />}
        title={dayCell ? tl(dayCell.name) : ""}
        subtitle={dayCell
          ? fmtLongDate(parseDate(dayCell.date), t, lang)
            // Which population these four numbers are about. The toolbar
            // switch is not visible from inside the modal, so a narrowed
            // grid must say so here or the counts read as the whole list.
            + (zag ? ` · ${t("workers.tmZagruzka")}` : "")
            // A day still being worked: the four numbers are «so far».
            + (dayCell.cell.live ? ` · ${liveText(dayCell.cell.read_at)}` : "")
          : ""}>
        {dayCell && (() => {
          const c = dayCell.cell;
          const p = Math.round(((c.came + (c.on_leave || 0)) / c.roster) * 100);
          return (
            <ListFigures t={t} rate={p} fraction={c.on_leave > 0 ? `${c.came} + ${c.on_leave} / ${c.roster}` : `${c.came} / ${c.roster}`}
              onList={c.roster} came={c.came} absent={c.absent} leave={c.on_leave} />
          );
        })()}
      </Modal>

      {/* One brigadir's row, spelled out — a phone's way to the role columns. */}
      <Modal open={!!unitRow} onClose={() => setUnitRow(null)} maxWidth="max-w-sm"
        icon={<Users size={16} />}
        title={unitRow ? tl(unitRow.name) : ""}
        subtitle={unitRow
          ? `S${unitRow.shift} · ${unitRow.days ?? 0} ${lower(t("workers.days"))}${zag ? ` · ${t("workers.tmZagruzka")}` : ""} · ${t("workers.perDay")}`
          : ""}>
        {unitRow && (
          <>
            <ListFigures t={t} rate={unitRow.rate} fraction={`${fmtN(unitRow.aSum)} / ${fmtN(unitRow.rSum)}`}
              onList={fmtN(unitRow.onList)} came={fmtN(unitRow.came)} absent={fmtN(unitRow.absent)} leave={Math.round(unitRow.leave)}
              extra={[
                [t("workers.official"), fmtN(unitRow.official_hc), "var(--text-1)"],
                [t("workers.shortfall"), unitRow.gap == null ? "—" : (Math.round(unitRow.gap) > 0 ? `−${fmtN(unitRow.gap)}` : "0"),
                  (unitRow.gap ?? 0) > 2 ? TONE_INK.warn : "var(--text-1)"],
              ]} />
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
                <span>{t("workers.byRole")}</span>
                <span className="normal-case tracking-normal font-normal">{t("workers.came")} / {lower(t("workers.onList"))}</span>
              </div>
              {activeRoles.filter((r) => (unitRow.avg_roster_by_role?.[r] ?? 0) > 0).map((r) => (
                <div key={r} className="flex items-baseline justify-between gap-3 py-1 text-xs">
                  <span className="truncate" style={{ color: "var(--text-2)" }}>{roleLabel(r)}</span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>
                    <b className="font-semibold" style={{ color: "var(--text-1)" }}>{fmtN(unitRow.avg_came_by_role?.[r] ?? 0)}</b>
                    {" / "}{fmtN(unitRow.avg_roster_by_role?.[r] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* 5 · Verifix's own monthly time kinds (Явка, Отсутствие, …) — whole
          months, so they sit after everything the period reads day by day. */}
      <VerifixKindsCard fparams={fparams} ready={ready} scope={scope} t={t} className="mb-8 xl:max-w-[880px]" />
    </WorkersPage>
  );
}

// A list's figures in a dialog — the rate, the fraction it came from, then the
// counts. Leave counts as attended, so «84 came, 16 absent» does not add up to
// the rate on its own: the fraction line says which counts it was over.
function ListFigures({ t, rate, fraction, onList, came, absent, leave, extra = [] }) {
  const line = (label, value, color, note) => (
    <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>
        {value}
        {note && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-3)" }}>{note}</span>}
      </span>
    </div>
  );
  return (
    <>
      <div className="text-center pb-2">
        <div className="text-3xl font-bold tabular-nums" style={{ color: inkOf(rate) }}>{rate == null ? "—" : `${rate}%`}</div>
        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("workers.kpi.attRate")}</div>
        <div className="text-[11px] tabular-nums mt-0.5" style={{ color: "var(--text-3)" }}>{fraction}</div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        {line(t("workers.onList"), onList, "var(--text-1)")}
        {line(t("workers.came"), came, "var(--text-1)")}
        {line(t("workers.absent"), absent, "var(--text-1)", leave > 0 ? `${leave} ${t("workers.onLeaveShort")}` : null)}
        {extra.map(([label, value, color]) => line(label, value, color))}
      </div>
    </>
  );
}
