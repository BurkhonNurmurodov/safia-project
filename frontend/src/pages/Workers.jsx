import { Fragment, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, CalendarDays, CheckCircle2,
  ClipboardList, Grid3x3, LayoutGrid, PieChart, Repeat, TrendingUp,
  UserCheck, UserMinus, Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import Tooltip from "../components/ui/Tooltip";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import HeatmapChart from "../components/charts/HeatmapChart";
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
const ROLES = ["Konditer", "Fasovshik", "Zagatovitel", "Other"]; // zagruzka-counted roles
// Extra (non-zagruzka) roles — every other real job title — get identity hues
// from this full-spectrum palette, chosen to stay distinct from the four
// zagruzka role colours above. Used only by the role-share donut + trend.
const ROLE_EXTRA_COLORS = [
  "#2563eb", "#8b5cf6", "#ec4899", "#0d9488", "#0ea5e9",
  "#d946ef", "#6366f1", "#eab308", "#15803d", "#b45309",
  "#06b6d4", "#6d28d9",
];
const OFFICIAL_COLOR = "#94a3b8";
const PRESENT_COLOR  = "#22c55e";
// roleChange is a deepened brand-gold chart step: blue+violet collapses under
// red-green colorblindness (violet reads as blue), and lavender sat below 3:1
// contrast on the light surface. Blue+gold clears both.
const REQ_COLORS = { exchange: "#3b82f6", roleChange: "#b58434" };

// Per-supervisor identity hues for the treemap — a full-spectrum categorical
// palette (every block is coloured, so hues read as identity, not status).
// Ordered so consecutive brigadirs land on contrasting hues, and large enough
// that colours stay unique for the realistic brigadir count (cycles past 18).
const SUP_COLORS = [
  "#2563eb", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#8b5cf6", // violet
  "#eab308", // yellow
  "#ec4899", // pink
  "#0d9488", // teal
  "#ef4444", // red
  "#0ea5e9", // sky
  "#65a30d", // lime
  "#d946ef", // fuchsia
  "#C8973F", // gold
  "#6366f1", // indigo
  "#b45309", // brown
  "#06b6d4", // cyan
  "#6d28d9", // deep violet
  "#64748b", // slate
  "#15803d", // dark green
];

// The attendance heatmap reuses the fleet HeatmapChart, so it takes the same
// banded {from,color} segments — but a single-hue sequential green ramp (shades
// of green) instead of the fleet's traffic-light scale. Bands are keyed to the
// attendance % (0–100); HeatmapChart auto-contrasts the label text per band.
const ATT_SEGMENTS = [
  { from: 0,  color: "#dcfce7" }, // < 40%  → lightest green
  { from: 40, color: "#bbf7d0" }, // 40–49%
  { from: 50, color: "#86efac" }, // 50–59%
  { from: 60, color: "#4ade80" }, // 60–69%
  { from: 70, color: "#22c55e" }, // 70–79%
  { from: 80, color: "#16a34a" }, // 80–89%
  { from: 90, color: "#15803d" }, // ≥ 90%  → darkest green
];
// Role-transition matrix bins — single violet hue on log-ish breaks so the top
// flow is unmistakably darkest (a flat 11+ band rendered 35 and 543 identical).
// fg is the in-cell label color; zero cells recede to bg-inner and skip the fill.
const TRANS_BINS = [
  { from: 1,   to: 9,        bg: "#ede9fe", fg: "#5b21b6" },
  { from: 10,  to: 49,       bg: "#c4b5fd", fg: "#4c1d95" },
  { from: 50,  to: 99,       bg: "#a78bfa", fg: "#2e1065" },
  { from: 100, to: 199,      bg: "#7c3aed", fg: "#ffffff" },
  { from: 200, to: Infinity, bg: "#4c1d95", fg: "#ede9fe" },
];
const transBin = (v) => TRANS_BINS.find((b) => v >= b.from && v <= b.to);

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
  const [tgtTab, setTgtTab] = useState("supervisor"); // exchange-targets chart: "supervisor" | "task"
  const [treeMode, setTreeMode] = useState("all");    // treemap metric: "all" | "zagruzka"
  const [roleMode, setRoleMode] = useState("all");    // role charts: "all" roles | "zagruzka" subset
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const trendTip = useRef(null);                       // attendance-trend below-chart tooltip panel
  const trendDefault = useRef("");                      // latest-day HTML for the idle/leave state

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
  // Solid hairline grid — dashed gridlines read as thresholds/projections.
  const gridCfg      = { borderColor: gridColor, strokeDashArray: 0 };
  const chartH       = Math.max(300, headcount.length * 28 + 60);

  // Dynamic role set for the role-share donut + attendance trend. `by_role` now
  // carries every present job title; the toggle switches between all roles and
  // the zagruzka subset (removing/adding the non-zagruzka roles). Extra roles are
  // count-sorted so their identity hue stays stable across mode switches.
  const roleTotalsMap = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => Object.entries(m.by_role || {}).forEach(([r, n]) => { acc[r] = (acc[r] || 0) + n; }));
    return acc;
  }, [headcount]);
  const extraRoles = useMemo(
    () => Object.keys(roleTotalsMap).filter((r) => !ROLES.includes(r)).sort((a, b) => roleTotalsMap[b] - roleTotalsMap[a]),
    [roleTotalsMap],
  );
  const roleColor = (r) => ROLE_COLORS[r] ?? ROLE_EXTRA_COLORS[Math.max(0, extraRoles.indexOf(r)) % ROLE_EXTRA_COLORS.length];
  const activeRoles = roleMode === "all" ? [...ROLES, ...extraRoles] : ROLES;

  // Workforce composition donut — each role's share of the whole workforce.
  const donutRoles = activeRoles.filter((r) => (roleTotalsMap[r] || 0) > 0);
  const roleTotals = donutRoles.map((r) => roleTotalsMap[r] || 0);
  const donutTotal = roleTotals.reduce((s, n) => s + n, 0);
  const donutOptions = {
    chart: { ...baseChart, type: "donut" },
    labels: donutRoles.map(roleLabel),
    colors: donutRoles.map(roleColor),
    legend: { ...legendCfg, position: "bottom" },
    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%`, style: { fontSize: "11px" } },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: "64%", labels: {
      show: true,
      value: { color: legendColor },
      total: { show: true, label: t("workers.total"), color: legendColor, formatter: () => String(donutTotal) },
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

  // Workforce treemap — one block per brigadir in their own identity hue; the
  // toggle picks the metric (all workers on the roster vs zagruzka-counted).
  // Hue is keyed to the brigadir's position in the stable backend order so it
  // survives mode switches; data is value-sorted for a tidier layout.
  // `total_all` needs the updated backend — fall back to `total` until then.
  const treePoints = headcount
    .map((m, i) => ({
      x: tl(m.name),
      y: treeMode === "all" ? (m.total_all ?? m.total) : m.total,
      color: SUP_COLORS[i % SUP_COLORS.length],
    }))
    .filter((d) => d.y > 0)
    .sort((a, b) => b.y - a.y);
  const treemapSeries = [{ data: treePoints.map(({ x, y }) => ({ x, y })) }];
  const treemapOptions = {
    chart: { ...baseChart, type: "treemap" },
    colors: treePoints.map((d) => d.color),
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "13px", fontWeight: 600, colors: ["#fff"] },
      formatter: (text, op) => [text, String(op.value)],
    },
    plotOptions: { treemap: { distributed: true, enableShades: false } },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${t("workers.tmUnit")}` } },
    theme: chartTheme,
  };

  // Attendance trend by role (stacked area, min-7-day window).
  // Drop roles that are all-zero across the window: a zero top-of-stack series
  // still paints its translucent gradient down to the baseline, tinting the whole
  // chart its colour ("green shadow everywhere" when Zagatovitel has no attendance).
  const trendRoles = trend
    ? activeRoles.filter((r) => (trend.series[r] || []).some((v) => v > 0))
    : [];
  const trendSeries = trendRoles.map((r) => ({ name: roleLabel(r), data: trend.series[r] || [] }));
  // Stable chip order for the breakdown strip — sorted ONCE by window total (desc),
  // never per-day, so chips keep their positions as you hover across days.
  const trendRoleOrder = [...trendRoles].sort((a, b) => {
    const sum = (r) => (trend.series[r] || []).reduce((n, v) => n + (v || 0), 0);
    return sum(b) - sum(a);
  });
  // The trend tooltip renders BELOW the chart (see .att-trend CSS) so it never
  // covers the plot. This builds the day's breakdown as a full-width horizontal
  // strip — date, colored role chips (zero-value roles dropped, sorted desc),
  // then the day total — for a given x-index. Colors come from CSS vars so it
  // adapts to theme. Reused by the hover callback and the idle/leave default.
  const trendTipHtml = (idx) => {
    if (idx == null || !trend?.dates?.length) return "";
    const date = trend.dates[idx] ?? "";
    const items = trendRoles
      .map((r) => ({ name: roleLabel(r), color: roleColor(r), val: (trend.series[r] || [])[idx] ?? 0 }))
      .filter((it) => it.val > 0)
      .sort((a, b) => b.val - a.val);
    const total = items.reduce((n, it) => n + it.val, 0);
    const chips = items.map((it) => `
      <span style="display:inline-flex;align-items:center;gap:5px">
        <span style="width:9px;height:9px;border-radius:2px;background:${it.color};flex:none"></span>
        <span style="color:var(--text-3)">${it.name}</span>
        <b style="color:var(--text-1)">${it.val}</b></span>`).join("");
    return `<span style="color:var(--brand);font-weight:600">${date}</span>${chips}
      <span style="margin-left:auto;color:var(--text-3)">${t("workers.total")}&nbsp;<b style="color:var(--text-1)">${total}</b></span>`;
  };
  const trendDefaultIdx = (trend?.dates?.length || 0) - 1;  // idle panel = latest day
  const trendDefaultHtml = trendTipHtml(trendDefaultIdx >= 0 ? trendDefaultIdx : null);
  trendDefault.current = trendDefaultHtml;                  // keep the leave-handler current
  const trendOptions = {
    chart: {
      ...baseChart, type: "area", stacked: true, zoom: { enabled: false },
      // On mouse-out restore the panel to the latest day so it's never blank.
      events: { mouseLeave: () => { if (trendTip.current) trendTip.current.innerHTML = trendDefault.current; } },
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0.05 } },
    colors: trendRoles.map(roleColor),
    xaxis: {
      categories: trend?.dates || [], labels: { ...axisLabels, rotate: -45 },
      tickAmount: Math.min(trend?.dates?.length || 0, 10),
    },
    yaxis: { labels: axisLabels },
    legend: legendCfg, grid: gridCfg, theme: chartTheme,
    // Apex's own tooltip box is hidden via .att-trend CSS; this callback is used
    // only as the hover-index source — it writes the breakdown into the panel
    // under the chart and returns nothing visible.
    tooltip: {
      theme: tooltipTheme,
      custom: ({ dataPointIndex }) => {
        if (trendTip.current) trendTip.current.innerHTML = trendTipHtml(dataPointIndex);
        return "";
      },
    },
  };

  // Attendance heatmap — reuses the fleet HeatmapChart (supervisor rows × day
  // cols). Each cell is the per-day attendance rate present/roster (same metric
  // as the `rate` column). HeatmapChart reads `net_util` as a 0–1 fraction and
  // renders it as a %; missing days stay null → shown as "—".
  const heatDates = useMemo(() => {
    const set = new Set();
    headcount.forEach((m) => (m.daily || []).forEach((d) => set.add(d.date)));
    return [...set].sort((a, b) => parseDate(a) - parseDate(b));
  }, [headcount]);
  const heatManagers = useMemo(() => headcount.map((m) => m.name), [headcount]);
  const heatData = useMemo(() => {
    const out = {};
    headcount.forEach((m) => {
      const byDate = Object.fromEntries((m.daily || []).map((d) => [d.date, d.hc]));
      const row = {};
      heatDates.forEach((dt) => {
        const hc = dt in byDate ? byDate[dt] : null;
        row[dt] = { net_util: hc != null && m.total ? hc / m.total : null };
      });
      out[m.name] = row;
    });
    return out;
  }, [headcount, heatDates]);

  // Movements by day (stacked columns).
  const reqDaySeries = [
    { name: t("workers.req.exchanges"),   data: req?.by_day?.exchanges || [] },
    { name: t("workers.req.roleChanges"), data: req?.by_day?.role_changes || [] },
  ];
  const reqDayOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    // Horizontal dd.MM ticks — the year on every label is noise, rotated text
    // reads slower; the tooltip keeps the full date.
    xaxis: {
      categories: req?.by_day?.dates || [],
      labels: {
        ...axisLabels, rotate: 0, hideOverlappingLabels: true,
        formatter: (v) => (typeof v === "string" ? v.replace(/\.\d{4}$/, "") : v),
      },
    },
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

  // Exchange targets (where moved workers go) — split into receiving-supervisor
  // (→) and task destinations, switched via the header toggle.
  const reqTargetsView = reqTargets.filter((g) =>
    tgtTab === "task" ? g.type === "task" : g.type !== "task"
  );
  // Single series color (the exchange measure) — per-bar rainbow coloring
  // encoded nothing and made the ranking read as unrelated categories.
  const reqTgtOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange],
    dataLabels: { enabled: false },
    xaxis: {
      categories: reqTargetsView.map((g) => (tgtTab === "task" ? tl(g.label) : `→ ${tl(g.label)}`)),
      labels: axisLabels,
    },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false }, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => `${v} ${t("workers.req.workers")} · ${reqTargetsView[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // New-role distribution.
  const reqRoleOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.roleChange],
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

  // Role-transition matrix — old role (rows) × new role (cols), rendered as a
  // plain CSS grid instead of an Apex heatmap (Apex can't do receding zeros,
  // wrapped row labels, axis captions or an uncolored totals column). Rows and
  // columns sort by volume so the biggest flows read first.
  const transMap = Object.fromEntries(reqTrans.map((r) => [`${r.from}|${r.to}`, r.workers]));
  const transColTotals = {};
  reqTrans.forEach((r) => { transColTotals[r.to] = (transColTotals[r.to] || 0) + r.workers; });
  const toRoles = [...new Set(reqTrans.map((r) => r.to))].sort((a, b) => transColTotals[b] - transColTotals[a]);
  const transRows = [...new Set(reqTrans.map((r) => r.from))]
    .map((from) => {
      const cells = toRoles.map((to) => transMap[`${from}|${to}`] || 0);
      return { from, cells, total: cells.reduce((s, v) => s + v, 0) };
    })
    .sort((a, b) => b.total - a.total);
  const transRoleLabel = (name) => (!name || name === "-" || name === "—" ? t("workers.req.unspecified") : tl(name));

  // Same per-row height for the two side-by-side supervisor lists so the
  // paired cards come out near-equal.
  const reqSupChartH  = Math.max(220, reqSups.length * 30 + 80);
  const reqTgtChartH  = Math.max(220, reqTargetsView.length * 30 + 80);
  const reqRoleChartH = Math.max(200, reqRoles.length * 28 + 60);

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

          {/* Role-share donut + attendance trend (compact pair). The shared
              toggle adds/removes the non-zagruzka roles on both charts. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
            <ChartCard icon={PieChart} title={t("workers.roleShare")} info={t("workers.info.composition")}
              right={<SegmentedToggle size="sm" value={roleMode} onChange={setRoleMode}
                options={[["all", t("workers.tmAll")], ["zagruzka", t("workers.tmZagruzka")]]} />}>
              {isLoading ? <SkeletonChart className="h-72" />
                : roleTotals.some((n) => n > 0) ? <ReactApexChart key={roleMode} type="donut" series={roleTotals} options={donutOptions} height={330} />
                : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />}
            </ChartCard>

            <ChartCard icon={TrendingUp} title={t("workers.attendanceTrend")} info={t("workers.info.trend")}
              right={<SegmentedToggle size="sm" value={roleMode} onChange={setRoleMode}
                options={[["all", t("workers.tmAll")], ["zagruzka", t("workers.tmZagruzka")]]} />}>
              {!trend ? <SkeletonChart className="h-72" />
                : trend?.dates?.length ? (
                  <>
                    <div className="att-trend">
                      <ReactApexChart key={roleMode} type="area" series={trendSeries} options={trendOptions} height={330} />
                    </div>
                    {/* Hover breakdown lives here — under the chart, never over it. */}
                    <div key={roleMode} ref={trendTip}
                      className="att-trend-panel flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 mt-1 text-xs"
                      style={{ borderColor: "var(--border)" }}
                      dangerouslySetInnerHTML={{ __html: trendDefaultHtml }} />
                  </>
                )
                : <EmptyState title={t("workers.noTrend")} message={t("workers.noTrendMsg")} />}
            </ChartCard>
          </div>

          {/* Workforce treemap — full width, big & readable (one block per brigadir) */}
          <ChartCard icon={LayoutGrid} title={t("workers.composition")} info={t("workers.info.treemap")} className="mb-6"
            right={<SegmentedToggle size="sm" value={treeMode} onChange={setTreeMode}
              options={[["all", t("workers.tmAll")], ["zagruzka", t("workers.tmZagruzka")]]} />}>
            {isLoading ? <SkeletonChart className="h-96" />
              : treePoints.length ? <ReactApexChart key={treeMode} type="treemap" series={treemapSeries} options={treemapOptions} height={560} />
              : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />}
          </ChartCard>

          {/* Roster vs present — the attendance gap per brigadir (full width) */}
          <ChartCard icon={BarChart3} title={t("workers.rosterVsPresent")} info={t("workers.info.rosterVsPresent")} className="mb-6">
            {isLoading ? <SkeletonChart className="h-72" />
              : headcount.length ? <ReactApexChart type="bar" series={rvpSeries} options={rvpOptions} height={chartH} />
              : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />}
          </ChartCard>

          {/* Attendance heatmap (full width) — same component as the fleet heatmap */}
          <ChartCard icon={Grid3x3} title={t("workers.heatmap")} info={t("workers.info.heatmap")} className="mb-6">
            {isLoading ? <SkeletonChart className="h-72" />
              : heatManagers.length && heatDates.length
                ? <HeatmapChart dates={heatDates} managers={heatManagers} data={heatData} mode="actual" segments={ATT_SEGMENTS} />
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
                <KPICard icon={ArrowLeftRight} color={REQ_COLORS.exchange} label={t("workers.req.workersExchanged")}
                  value={reqKpi.workers_moved} sub={`${reqKpi.exchanges} ${t("workers.req.exchanges").toLowerCase()}`}
                  tooltip={t("workers.req.tip.workersExchanged")} />
                <KPICard icon={Repeat} color={REQ_COLORS.roleChange} label={t("workers.req.workersReassigned")}
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
              {/* Daily trend on its own full-width row — the 29-day axis needs the width */}
              <ChartCard icon={CalendarDays} title={t("workers.req.byDay")} info={t("workers.info.byDay")} className="mb-6">
                {!req ? <SkeletonChart className="h-72" />
                  : <ReactApexChart type="bar" series={reqDaySeries} options={reqDayOptions} height={320} />}
              </ChartCard>

              {/* The two supervisor-ranked lists pair up — same row count, equal heights */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 items-start">
                <ChartCard icon={Users} title={t("workers.req.bySupervisor")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : <ReactApexChart type="bar" series={reqSupSeries} options={reqSupOptions} height={reqSupChartH} />}
                </ChartCard>
                <ChartCard icon={ArrowLeftRight} title={t("workers.req.targets")} info={t("workers.info.targets")}
                  right={<SegmentedToggle size="sm" value={tgtTab} onChange={setTgtTab}
                    options={[["supervisor", t("workers.req.tgtSupervisors")], ["task", t("workers.req.tgtTasks")]]} />}>
                  {!req ? <SkeletonChart className="h-72" />
                    : reqTargetsView.length ? <ReactApexChart type="bar"
                        series={[{ name: t("workers.req.workersExchanged"), data: reqTargetsView.map((g) => g.workers) }]}
                        options={reqTgtOptions} height={reqTgtChartH} />
                    : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
                </ChartCard>
              </div>

              {/* Compact new-roles chart beside the transition matrix it summarizes */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 items-start">
                <ChartCard icon={Repeat} title={t("workers.req.roles")}>
                  {!req ? <SkeletonChart className="h-72" />
                    : reqRoles.length ? <ReactApexChart type="bar"
                        series={[{ name: t("workers.req.workersReassigned"), data: reqRoles.map((r) => r.workers) }]}
                        options={reqRoleOptions} height={reqRoleChartH} />
                    : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
                </ChartCard>

                {/* Role-transition matrix — binned single-hue grid, biggest flows first */}
                <ChartCard icon={Grid3x3} title={t("workers.req.transitionMatrix")} info={t("workers.info.transitions")} className="lg:col-span-2">
                  {!req ? <SkeletonChart className="h-64" />
                    : transRows.length ? (
                      <>
                        <div className="overflow-x-auto">
                          <div className="grid gap-[2px] min-w-[460px] max-w-[660px]"
                            style={{ gridTemplateColumns: `minmax(130px,190px) repeat(${toRoles.length}, minmax(64px,1fr)) 56px` }}>
                            <div />
                            <div className="text-center text-[11px] pb-0.5" style={{ color: "var(--text-4)", gridColumn: `2 / span ${toRoles.length}` }}>
                              {t("workers.req.toRole")} →
                            </div>
                            <div />
                            <div className="flex items-end justify-end text-right pr-2.5 pb-1 text-[11px] leading-tight" style={{ color: "var(--text-4)" }}>
                              {t("workers.req.fromRole")} ↓
                            </div>
                            {toRoles.map((to) => (
                              <div key={to} className="self-end text-center text-xs font-medium pb-1" style={{ color: "var(--text-2)" }}>{tl(to)}</div>
                            ))}
                            <div className="self-end text-right text-[11px] pr-1.5 pb-1" style={{ color: "var(--text-4)" }}>{t("workers.total")}</div>
                            {transRows.map((row) => (
                              <Fragment key={row.from}>
                                <div className="flex items-center justify-end text-right pr-2.5 text-xs leading-tight" style={{ color: "var(--text-2)" }}>
                                  {transRoleLabel(row.from)}
                                </div>
                                {row.cells.map((v, i) => {
                                  const b = transBin(v);
                                  return (
                                    <div key={toRoles[i]} title={`${transRoleLabel(row.from)} → ${tl(toRoles[i])}: ${v}`}
                                      className="h-[34px] rounded flex items-center justify-center text-[13px] font-medium tabular-nums"
                                      style={b ? { background: b.bg, color: b.fg } : { background: "var(--bg-inner)", color: "var(--text-4)" }}>
                                      {b ? v : "·"}
                                    </div>
                                  );
                                })}
                                <div className="flex items-center justify-end pr-1.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{row.total}</div>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }} />0
                          </span>
                          {TRANS_BINS.map((b) => (
                            <span key={b.from} className="inline-flex items-center gap-1.5">
                              <span className="w-[11px] h-[11px] rounded-[2px]" style={{ background: b.bg }} />
                              {b.to === Infinity ? `${b.from}+` : `${b.from}–${b.to}`}
                            </span>
                          ))}
                        </div>
                      </>
                    )
                    : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
                </ChartCard>
              </div>

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
