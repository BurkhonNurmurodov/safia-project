import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, CalendarDays, CheckCircle2,
  ClipboardList, Grid3x3, PieChart, Repeat, TrendingUp,
  UserCheck, UserMinus, Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import Tooltip from "../components/ui/Tooltip";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { padChartParams } from "../utils/chartRange";
import api from "../utils/api";

// ── palette ──────────────────────────────────────────────────────────────────
// Role identity hues (kept stable across the app); the rest of the page borrows
// the admin-panel palette so KPIs and charts read colourful, not monochrome.
const ROLE_COLORS = {
  Konditer:    "#C8973F",
  Fasovshik:   "#f97316",
  Zagatovitel: "#22c55e",
  Other:       "#94a3b8",
};
const ROLES = ["Konditer", "Fasovshik", "Zagatovitel", "Other"];
const OFFICIAL_COLOR = "#94a3b8";
const PRESENT_COLOR  = "#22c55e";
const REQ_COLORS = { exchange: "#3b82f6", roleChange: "#a78bfa" };

// Sequential ramps for the two heatmaps (green = attendance, violet = changes).
const ATT_RANGES = [
  { from: -1, to: 0,   color: "#e2e8f0" },
  { from: 1,  to: 6,   color: "#bbf7d0" },
  { from: 7,  to: 12,  color: "#4ade80" },
  { from: 13, to: 20,  color: "#22c55e" },
  { from: 21, to: 999, color: "#15803d" },
];
const TRANS_RANGES = [
  { from: 0,  to: 0,   color: "#e2e8f0" },
  { from: 1,  to: 2,   color: "#ddd6fe" },
  { from: 3,  to: 5,   color: "#c4b5fd" },
  { from: 6,  to: 10,  color: "#a78bfa" },
  { from: 11, to: 999, color: "#7c3aed" },
];

const fmt1 = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));
const parseDate = (s) => { const [d, m, y] = s.split("."); return new Date(+y, +m - 1, +d); };
// Traffic-light hue for an attendance percentage.
const rateColor = (p) => (p == null ? "var(--text-2)" : p >= 90 ? "#22c55e" : p >= 75 ? "#eab308" : "#ef4444");

// Chart card that composes the canonical SectionHead (+ optional info icon).
function ChartCard({ icon, title, info, right, children, className = "" }) {
  const head = info ? (
    <span className="inline-flex items-center gap-1">{title}<Tooltip text={info} /></span>
  ) : title;
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={head} right={right} />
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function Workers() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const [view, setView] = useState("attendance");   // "attendance" | "movements"
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const roleLabel = (r) => (r === "Other" ? t("workers.roleOther") : tl(r));

  // ── data ─────────────────────────────────────────────────────────────────────
  const { data: headcount = [], isLoading } = useQuery({
    queryKey: ["headcount", params],
    queryFn: () => api.get("/api/workers/headcount", { params }).then((r) => r.data),
    enabled: ready,
  });
  const chartParams = useMemo(() => padChartParams(params), [params]);
  const { data: trend } = useQuery({
    queryKey: ["worker-trend", chartParams],
    queryFn: () => api.get("/api/workers/trend", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });
  const { data: req } = useQuery({
    queryKey: ["worker-requests-analysis", params],
    queryFn: () => api.get("/api/workers/requests-analysis", { params }).then((r) => r.data),
    enabled: ready,
  });

  // ── headcount aggregates ───────────────────────────────────────────────────────
  const totalWorkers  = headcount.reduce((s, m) => s + m.total, 0);
  const avgPresent    = headcount.reduce((s, m) => s + (m.avg_daily_hc || 0), 0);
  const attRate       = totalWorkers ? Math.round((avgPresent / totalWorkers) * 100) : null;
  const withOfficial  = headcount.filter((m) => m.official_hc != null);
  const officialSum   = withOfficial.reduce((s, m) => s + (m.official_hc || 0), 0);
  const presentOfOff  = withOfficial.reduce((s, m) => s + (m.avg_daily_hc || 0), 0);
  const shortfall     = Math.max(0, Math.round((officialSum - presentOfOff) * 10) / 10);
  const mismatchMgrs  = headcount.filter((m) => (m.mismatch_days || 0) > 0);

  // per-supervisor derived rate + shortfall
  const rows = useMemo(() => headcount.map((m) => {
    const rate = m.total ? Math.round(((m.avg_daily_hc || 0) / m.total) * 100) : null;
    const gap  = m.official_hc != null ? Math.round((m.official_hc - (m.avg_daily_hc || 0)) * 10) / 10 : null;
    return { ...m, rate, gap };
  }), [headcount]);

  function onSort(key) {
    setSort((p) => (p.key === key
      ? (p.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" })
      : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = {
      name: (m) => tl(m.name) || "", total: (m) => m.total, avg: (m) => m.avg_daily_hc || 0,
      rate: (m) => m.rate ?? -1, official: (m) => m.official_hc ?? -1, gap: (m) => m.gap ?? -999,
      ...Object.fromEntries(ROLES.map((r) => [r, (m) => m.by_role[r] || 0])),
    }[sort.key];
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }, [rows, sort, tl]);

  // ── requests aggregates ────────────────────────────────────────────────────────
  const reqKpi     = req?.kpi;
  const reqSups    = req?.by_supervisor || [];
  const reqTargets = req?.targets || [];
  const reqRoles   = req?.roles || [];
  const reqTrans   = req?.transitions || [];
  const hasReqData = (reqKpi?.total || 0) > 0;
  const postedRate = reqKpi?.total ? Math.round((reqKpi.posted / reqKpi.total) * 100) : 0;

  // ── shared chart pieces ────────────────────────────────────────────────────────
  const baseChart = {
    background: "transparent", toolbar: { show: false }, animations: { enabled: false },
    redrawOnParentResize: false, redrawOnWindowResize: false, fontFamily: "inherit",
  };
  const axisLabels   = { style: { colors: labelColor, fontSize: "10px" } };
  const axisLabelsMd = { style: { colors: legendColor, fontSize: "11px" } };
  const legendCfg    = { labels: { colors: legendColor }, fontSize: "11px", position: "top" };
  const gridCfg      = { borderColor: gridColor, strokeDashArray: 3 };
  const chartH       = Math.max(300, headcount.length * 28 + 60);

  // Workforce composition donut — each role's share of the whole workforce.
  const roleTotals = ROLES.map((r) => headcount.reduce((s, m) => s + (m.by_role[r] || 0), 0));
  const donutOptions = {
    chart: { ...baseChart, type: "donut" },
    labels: ROLES.map(roleLabel),
    colors: ROLES.map((r) => ROLE_COLORS[r]),
    legend: { ...legendCfg, position: "bottom" },
    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%`, style: { fontSize: "11px" } },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: "64%", labels: {
      show: true,
      value: { color: legendColor },
      total: { show: true, label: t("workers.total"), color: legendColor, formatter: () => String(totalWorkers) },
    } } } },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${t("workers.present").toLowerCase()}` } },
    theme: chartTheme,
  };

  // Roster vs present — grouped horizontal bars per brigadir (the attendance gap).
  const rvpSeries = [
    { name: t("workers.roster"),  data: headcount.map((m) => m.total) },
    { name: t("workers.present"), data: headcount.map((m) => m.avg_daily_hc || 0) },
  ];
  const rvpOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "78%", borderRadius: 2 } },
    colors: [OFFICIAL_COLOR, PRESENT_COLOR],
    dataLabels: { enabled: false },
    xaxis: { categories: headcount.map((m) => tl(m.name)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: legendCfg,
    grid: gridCfg,
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => fmt1(v) } },
    theme: chartTheme,
  };

  // Attendance trend by role (stacked area, min-7-day window).
  // Drop roles that are all-zero across the window: a zero top-of-stack series
  // still paints its translucent gradient down to the baseline, tinting the whole
  // chart its colour ("green shadow everywhere" when Zagatovitel has no attendance).
  const trendRoles = trend
    ? ROLES.filter((r) => r !== "Other" && (trend.series[r] || []).some((v) => v > 0))
    : [];
  const trendSeries = trendRoles.map((r) => ({ name: roleLabel(r), data: trend.series[r] || [] }));
  const trendOptions = {
    chart: { ...baseChart, type: "area", stacked: true, zoom: { enabled: false } },
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0.05 } },
    colors: [ROLE_COLORS.Konditer, ROLE_COLORS.Fasovshik, ROLE_COLORS.Zagatovitel],
    xaxis: {
      categories: trend?.dates || [], labels: { ...axisLabels, rotate: -45 },
      tickAmount: Math.min(trend?.dates?.length || 0, 10),
    },
    yaxis: { labels: axisLabels },
    legend: legendCfg, grid: gridCfg, tooltip: { theme: tooltipTheme }, theme: chartTheme,
  };

  // Attendance heatmap — supervisor (rows) × day (cols), cell = workers present.
  const heatDates = useMemo(() => {
    const set = new Set();
    headcount.forEach((m) => (m.daily || []).forEach((d) => set.add(d.date)));
    return [...set].sort((a, b) => parseDate(a) - parseDate(b));
  }, [headcount]);
  const heatSeries = headcount.map((m) => {
    const map = Object.fromEntries((m.daily || []).map((d) => [d.date, d.hc]));
    return { name: tl(m.name), data: heatDates.map((dt) => ({ x: dt.slice(0, 5), y: dt in map ? map[dt] : -1 })) };
  });
  const heatOptions = {
    chart: { ...baseChart, type: "heatmap" },
    dataLabels: { enabled: false },
    plotOptions: { heatmap: { radius: 3, enableShades: false, colorScale: { ranges: ATT_RANGES } } },
    xaxis: { type: "category", labels: { ...axisLabels, rotate: -45 } },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false },
    stroke: { width: 2, colors: [gridColor] },
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v) => (v < 0 ? t("workers.hm.none") : `${v} ${t("workers.present").toLowerCase()}`) },
    },
    theme: chartTheme,
  };
  const heatH = Math.max(260, headcount.length * 30 + 80);

  // Movements by day (stacked columns).
  const reqDaySeries = [
    { name: t("workers.req.exchanges"),   data: req?.by_day?.exchanges || [] },
    { name: t("workers.req.roleChanges"), data: req?.by_day?.role_changes || [] },
  ];
  const reqDayOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: req?.by_day?.dates || [], labels: { ...axisLabels, rotate: -45 } },
    yaxis: { labels: axisLabels },
    legend: legendCfg, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (val, { dataPointIndex }) => `${val} · ${req?.by_day?.workers?.[dataPointIndex] ?? 0} ${t("workers.req.workers")}` },
      y: { formatter: (v) => `${v} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Movements per supervisor (stacked horizontal bars).
  const reqSupSeries = [
    { name: t("workers.req.exchanges"),   data: reqSups.map((s) => s.exchanges) },
    { name: t("workers.req.roleChanges"), data: reqSups.map((s) => s.role_changes) },
  ];
  const reqSupOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqSups.map((s) => tl(s.name)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: legendCfg, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { seriesIndex, dataPointIndex }) => {
        const s = reqSups[dataPointIndex];
        if (!s) return String(v);
        const w = seriesIndex === 0 ? s.exchange_workers : s.role_change_workers;
        return `${v} ${t("workers.req.docs")} · ${w} ${t("workers.req.workers")}`;
      } },
    },
    theme: chartTheme,
  };

  // Exchange targets (where moved workers go).
  const reqTgtOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3, distributed: true } },
    colors: ["#3b82f6", "#06b6d4", "#14b8a6", "#0ea5e9", "#6366f1", "#8b5cf6"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: reqTargets.map((g) => (g.type === "task" ? `${tl(g.label)} · ${t("workers.req.task")}` : `→ ${tl(g.label)}`)),
      labels: axisLabels,
    },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false }, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => `${v} ${t("workers.req.workers")} · ${reqTargets[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // New-role distribution.
  const reqRoleOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3, distributed: true } },
    colors: ["#a78bfa", "#ec4899", "#f472b6", "#c084fc", "#8b5cf6", "#d946ef"],
    dataLabels: { enabled: false },
    xaxis: { categories: reqRoles.map((r) => tl(r.role)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false }, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => `${v} ${t("workers.req.workers")} · ${reqRoles[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Role-transition matrix heatmap — old role (rows) × new role (cols).
  const fromRoles = [...new Set(reqTrans.map((r) => r.from))];
  const toRoles   = [...new Set(reqTrans.map((r) => r.to))];
  const transMap  = Object.fromEntries(reqTrans.map((r) => [`${r.from}|${r.to}`, r.workers]));
  const transSeries = fromRoles.map((fr) => ({
    name: tl(fr),
    data: toRoles.map((tr) => ({ x: tl(tr), y: transMap[`${fr}|${tr}`] || 0 })),
  }));
  const transOptions = {
    chart: { ...baseChart, type: "heatmap" },
    dataLabels: { enabled: true, style: { fontSize: "10px", colors: ["#1e293b"] } },
    plotOptions: { heatmap: { radius: 3, enableShades: false, colorScale: { ranges: TRANS_RANGES } } },
    xaxis: { type: "category", labels: axisLabels, position: "top" },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false },
    stroke: { width: 2, colors: [gridColor] },
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v) => `${v} ${t("workers.req.workers")}` },
    },
    theme: chartTheme,
  };

  const reqSupChartH  = Math.max(220, reqSups.length * 30 + 80);
  const reqTgtChartH  = Math.max(200, reqTargets.length * 28 + 60);
  const reqRoleChartH = Math.max(200, reqRoles.length * 28 + 60);
  const transH        = Math.max(240, fromRoles.length * 46 + 90);

  const numCell = "px-3 py-2 text-right tabular-nums";

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <Layout title={t("workers.title")}>
      {/* View tabs */}
      <div className="flex justify-center sm:justify-start mb-5">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[
            { value: "attendance", label: <span className="inline-flex items-center gap-1.5"><Users size={14} />{t("workers.tab.attendance")}</span> },
            { value: "movements",  label: <span className="inline-flex items-center gap-1.5"><ArrowLeftRight size={14} />{t("workers.tab.movements")}</span> },
          ]}
        />
      </div>

      {view === "attendance" ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
              <>
                <KPICard icon={Users} color="#3b82f6" label={t("workers.kpi.workforce")}
                  value={totalWorkers} sub={`${headcount.length} ${t("workers.kpi.supervisors")}`}
                  tooltip={t("workers.tip.workforce")} />
                <KPICard icon={UserCheck} color="#22c55e" label={t("workers.kpi.avgPresent")}
                  value={fmt1(Math.round(avgPresent * 10) / 10)} tooltip={t("workers.tip.avgPresent")} />
                <KPICard icon={TrendingUp} color="#14b8a6" label={t("workers.kpi.attRate")}
                  value={attRate == null ? "—" : `${attRate}%`} tooltip={t("workers.tip.attRate")} />
                <KPICard icon={UserMinus} color="#f59e0b" label={t("workers.kpi.shortfall")}
                  value={fmt1(shortfall)}
                  sub={mismatchMgrs.length ? `${mismatchMgrs.length} ${t("workers.mismatchWarn")}` : undefined}
                  tooltip={t("workers.tip.shortfall")} />
              </>
            )}
          </div>

          {/* Composition donut + attendance trend (compact pair) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
            <ChartCard icon={PieChart} title={t("workers.composition")} info={t("workers.info.composition")}>
              {isLoading ? <SkeletonChart className="h-72" />
                : roleTotals.some((n) => n > 0) ? <ReactApexChart type="donut" series={roleTotals} options={donutOptions} height={330} />
                : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />}
            </ChartCard>

            <ChartCard icon={TrendingUp} title={t("workers.attendanceTrend")} info={t("workers.info.trend")}>
              {!trend ? <SkeletonChart className="h-72" />
                : trend?.dates?.length ? <ReactApexChart type="area" series={trendSeries} options={trendOptions} height={330} />
                : <EmptyState title={t("workers.noTrend")} message={t("workers.noTrendMsg")} />}
            </ChartCard>
          </div>

          {/* Roster vs present — the attendance gap per brigadir (full width) */}
          <ChartCard icon={BarChart3} title={t("workers.rosterVsPresent")} info={t("workers.info.rosterVsPresent")} className="mb-6">
            {isLoading ? <SkeletonChart className="h-72" />
              : headcount.length ? <ReactApexChart type="bar" series={rvpSeries} options={rvpOptions} height={chartH} />
              : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />}
          </ChartCard>

          {/* Attendance heatmap (full width) */}
          <ChartCard icon={Grid3x3} title={t("workers.heatmap")} info={t("workers.info.heatmap")} className="mb-6">
            {isLoading ? <SkeletonChart className="h-72" />
              : heatSeries.length && heatDates.length
                ? <ReactApexChart type="heatmap" series={heatSeries} options={heatOptions} height={heatH} />
                : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />}
          </ChartCard>

          {/* Per-supervisor table — answers "under their name vs actively coming, by role" */}
          <TableCard icon={ClipboardList} title={t("workers.summary")} className="mb-8"
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{headcount.length}</span>}>
            <thead>
              <tr>
                <Th label={t("workers.name")} k="name" sort={sort} onSort={onSort} />
                <Th label={t("overview.shift")} align="center" />
                <Th label={t("workers.days")} align="right" hint={t("workers.tip.daysCol")} />
                <Th label={t("workers.roster")} k="total" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.roster")} />
                <Th label={t("workers.present")} k="avg" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.avgPresent")} />
                <Th label={t("workers.attRate")} k="rate" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.attRate")} />
                <Th label={t("workers.official")} k="official" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.officialCol")} />
                <Th label={t("workers.shortfall")} k="gap" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.shortfall")} />
                {ROLES.map((r) => (
                  <Th key={r} k={r} sort={sort} onSort={onSort} align="right"
                    label={<span style={{ color: ROLE_COLORS[r] }}>{roleLabel(r)}</span>} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr><td colSpan={12}>
                  <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />
                </td></tr>
              )}
              {sortedRows.map((m) => (
                <tr key={m.manager_id}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(m.name)}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>S{m.shift}</td>
                  <td className={numCell} style={{ color: "var(--text-3)" }}>{m.days ?? 0}</td>
                  <td className={numCell} style={{ color: "var(--text-1)", fontWeight: 600 }}>{m.total}</td>
                  <td className={numCell} style={{ color: PRESENT_COLOR }}>{fmt1(m.avg_daily_hc)}</td>
                  <td className={numCell} style={{ color: rateColor(m.rate), fontWeight: 600 }}>
                    {m.rate == null ? "—" : `${m.rate}%`}
                  </td>
                  <td className={numCell} style={{ color: "var(--text-2)" }}>{fmt1(m.official_hc)}</td>
                  <td className={numCell} style={{ color: (m.gap ?? 0) > 2 ? "#f59e0b" : "var(--text-2)" }}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      {(m.gap ?? 0) > 2 && <AlertTriangle size={11} />}
                      {m.gap == null ? "—" : (m.gap > 0 ? `−${fmt1(m.gap)}` : "0")}
                    </span>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className={numCell} style={{ color: ROLE_COLORS[r] }}>{m.by_role[r] || 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      ) : (
        <>
          {/* Movements KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
            {!req ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
              <>
                <KPICard icon={ClipboardList} color="#8b5cf6" label={t("workers.req.totalRequests")}
                  value={reqKpi.total} tooltip={t("workers.req.tip.totalRequests")} />
                <KPICard icon={ArrowLeftRight} color="#3b82f6" label={t("workers.req.workersExchanged")}
                  value={reqKpi.workers_moved} sub={`${reqKpi.exchanges} ${t("workers.req.exchanges").toLowerCase()}`}
                  tooltip={t("workers.req.tip.workersExchanged")} />
                <KPICard icon={Repeat} color="#ec4899" label={t("workers.req.workersReassigned")}
                  value={reqKpi.workers_reassigned} sub={`${reqKpi.role_changes} ${t("workers.req.roleChanges").toLowerCase()}`}
                  tooltip={t("workers.req.tip.workersReassigned")} />
                <KPICard icon={CheckCircle2} color="#22c55e" label={t("workers.req.postedRate")}
                  value={`${postedRate}%`}
                  sub={reqKpi.pending ? `${reqKpi.pending} ${t("workers.req.pending").toLowerCase()}` : undefined}
                  tooltip={t("workers.req.tip.postedRate")} />
              </>
            )}
          </div>

          {req && !hasReqData ? (
            <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
                <ChartCard icon={CalendarDays} title={t("workers.req.byDay")} info={t("workers.info.byDay")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : <ReactApexChart type="bar" series={reqDaySeries} options={reqDayOptions} height={320} />}
                </ChartCard>
                <ChartCard icon={Users} title={t("workers.req.bySupervisor")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : <ReactApexChart type="bar" series={reqSupSeries} options={reqSupOptions} height={reqSupChartH} />}
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
                <ChartCard icon={ArrowLeftRight} title={t("workers.req.targets")} info={t("workers.info.targets")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : reqTargets.length ? <ReactApexChart type="bar"
                        series={[{ name: t("workers.req.workersExchanged"), data: reqTargets.map((g) => g.workers) }]}
                        options={reqTgtOptions} height={reqTgtChartH} />
                    : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
                </ChartCard>
                <ChartCard icon={Repeat} title={t("workers.req.roles")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : reqRoles.length ? <ReactApexChart type="bar"
                        series={[{ name: t("workers.req.workersReassigned"), data: reqRoles.map((r) => r.workers) }]}
                        options={reqRoleOptions} height={reqRoleChartH} />
                    : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
                </ChartCard>
              </div>

              {/* Role-transition matrix */}
              <ChartCard icon={Grid3x3} title={t("workers.req.transitionMatrix")} info={t("workers.info.transitions")} className="mb-6">
                {!req ? <SkeletonChart className="h-64" />
                  : transSeries.length ? <ReactApexChart type="heatmap" series={transSeries} options={transOptions} height={transH} />
                  : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
              </ChartCard>

              {/* Supervisor summary table */}
              <TableCard icon={ClipboardList} title={t("workers.req.supervisorSummary")} className="mb-6"
                right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{reqSups.length}</span>}>
                <thead>
                  <tr>
                    <Th label={t("workers.name")} />
                    <Th label={t("overview.shift")} align="center" />
                    <Th align="right" label={<span style={{ color: REQ_COLORS.exchange }}>{t("workers.req.exchanges")}</span>} />
                    <Th align="right" label={<span style={{ color: REQ_COLORS.roleChange }}>{t("workers.req.roleChanges")}</span>} />
                    <Th label={t("workers.req.posted")} align="right" />
                    <Th label={t("workers.req.topTarget")} />
                    <Th label={t("workers.req.topRole")} />
                  </tr>
                </thead>
                <tbody>
                  {reqSups.length === 0 && (
                    <tr><td colSpan={7}>
                      <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
                    </td></tr>
                  )}
                  {reqSups.map((s) => (
                    <tr key={s.manager_id}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(s.name)}</td>
                      <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>S{s.shift}</td>
                      <td className={numCell} style={{ color: REQ_COLORS.exchange }}>
                        {s.exchanges} · {s.exchange_workers} {t("workers.req.workers")}
                      </td>
                      <td className={numCell} style={{ color: REQ_COLORS.roleChange }}>
                        {s.role_changes} · {s.role_change_workers} {t("workers.req.workers")}
                      </td>
                      <td className={numCell} style={{ color: "var(--text-1)" }}>{s.posted}/{s.total}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{s.top_target ? tl(s.top_target) : "—"}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{s.top_role ? tl(s.top_role) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
