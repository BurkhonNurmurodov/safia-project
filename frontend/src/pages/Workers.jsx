import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, CalendarDays, ChevronDown,
  ChevronsUpDown, ChevronUp, ClipboardList, Repeat, TrendingUp, Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { padChartParams } from "../utils/chartRange";
import api from "../utils/api";

// ── palette ────────────────────────────────────────────────────────────────────
// Gold is the brand color (verifix numbers); gray is the official/reference side.
const ROLE_COLORS = {
  Konditer:    "#C8973F",
  Fasovshik:   "#f97316",
  Zagatovitel: "#22c55e",
  Other:       "#6b7280",
};
const OFFICIAL_COLOR = "#6b7280";
const VERIFIX_COLOR  = "#C8973F";
// Verifix-edit request types
const REQ_COLORS = {
  exchange:   "#3b82f6",
  roleChange: "#a78bfa",
};
const ROLES = ["Konditer", "Fasovshik", "Zagatovitel", "Other"];

// ── small UI atoms (mirror Trudoyomkost/Production idioms) ─────────────────────
function SectionCard({ icon: Icon, title, right, children, className = "" }) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-3)" }}>
          {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />}
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function SortHead({ label, col, sort, onSort, align = "right", style }) {
  const active = sort.key === col;
  return (
    <th className={`px-2 py-2.5 cursor-pointer select-none ${align === "left" ? "text-left" : "text-right"}`}
      style={style} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {!active ? <ChevronsUpDown size={9} style={{ opacity: 0.4 }} />
          : sort.dir === "asc" ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </span>
    </th>
  );
}

const fmt1 = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function Workers() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  // ── data ─────────────────────────────────────────────────────────────────────
  const { data: headcount = [], isLoading } = useQuery({
    queryKey: ["headcount", params],
    queryFn: () => api.get("/api/workers/headcount", { params }).then((r) => r.data),
    enabled: ready,
  });

  // Trend chart never spans fewer than 7 days — short selections fetch a
  // window padded back to end-6d.
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

  // ── headcount logic ──────────────────────────────────────────────────────────
  const totalWorkers  = headcount.reduce((s, m) => s + m.total, 0);
  const avgDailyTotal = headcount.reduce((s, m) => s + (m.avg_daily_hc || 0), 0);
  const mismatchMgrs  = headcount.filter((m) => (m.mismatch_days || 0) > 0);
  const mismatchDays  = mismatchMgrs.reduce((s, m) => s + m.mismatch_days, 0);

  function onSort(key) {
    setSort((p) => (p.key === key
      ? (p.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" })
      : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  const displayHeadcount = useMemo(() => {
    if (!sort.key) return headcount;                     // backend order: shift, name
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = {
      name:     (m) => tl(m.name) || "",
      total:    (m) => m.total,
      avg:      (m) => m.avg_daily_hc || 0,
      official: (m) => m.official_hc ?? -1,
      diff:     (m) => m.official_hc_diff ?? -1,
    }[sort.key];
    return [...headcount].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }, [headcount, sort, tl]);

  // ── requests logic ───────────────────────────────────────────────────────────
  const reqKpi     = req?.kpi;
  const reqSups    = req?.by_supervisor || [];
  const reqTargets = req?.targets || [];
  const reqRoles   = req?.roles || [];
  const reqTrans   = req?.transitions || [];
  const hasReqData = (reqKpi?.total || 0) > 0;
  const postedRate = reqKpi?.total ? Math.round((reqKpi.posted / reqKpi.total) * 100) : 0;

  // ── shared chart pieces ──────────────────────────────────────────────────────
  const baseChart = {
    background: "transparent", toolbar: { show: false }, animations: { enabled: false },
    redrawOnParentResize: false, redrawOnWindowResize: false,
  };
  const axisLabels   = { style: { colors: labelColor, fontSize: "10px" } };
  const axisLabelsMd = { style: { colors: legendColor, fontSize: "11px" } };
  const legendCfg    = { labels: { colors: legendColor }, fontSize: "11px", position: "top" };
  const gridCfg      = { borderColor: gridColor, strokeDashArray: 3 };

  // Official vs Verifix avg daily HC per brigadir (comparable per-day numbers)
  const hcCompSeries = [
    { name: t("workers.officialHC"), data: headcount.map((m) => m.official_hc ?? 0) },
    { name: t("workers.verifixHC"),  data: headcount.map((m) => m.avg_daily_hc || 0) },
  ];
  const hcCompOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [OFFICIAL_COLOR, VERIFIX_COLOR],
    dataLabels: { enabled: false },
    xaxis: { categories: headcount.map((m) => tl(m.name)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: legendCfg,
    grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => {
        const m = headcount[dataPointIndex];
        const warn = m?.mismatch_days ? ` · ⚠ ${m.mismatch_days} ${t("workers.mismatchDays")}` : "";
        return `${fmt1(v)}${warn}`;
      }},
    },
    annotations: {
      points: headcount.filter((m) => (m.mismatch_days || 0) > 0).map((m) => ({
        x: Math.max(m.official_hc ?? 0, m.avg_daily_hc || 0),
        y: tl(m.name),
        marker: { size: 0 },
        label: {
          text: `⚠ ${m.mismatch_days}`,
          style: { color: "#f97316", background: "transparent", fontSize: "10px" },
        },
      })),
    },
    theme: chartTheme,
  };

  // Role breakdown per brigadir (unique workers in period)
  const stackedSeries = ROLES.map((role) => ({
    name: tl(role),
    data: headcount.map((m) => m.by_role[role] || 0),
  }));
  const stackedOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "70%", borderRadius: 3 } },
    colors: ROLES.map((r) => ROLE_COLORS[r]),
    dataLabels: { enabled: false },
    xaxis: { categories: headcount.map((m) => tl(m.name)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: legendCfg,
    grid: gridCfg,
    tooltip: { theme: tooltipTheme },
    theme: chartTheme,
  };

  // Attendance trend by role
  const trendSeries = trend
    ? ROLES.filter((r) => r !== "Other").map((r) => ({ name: tl(r), data: trend.series[r] || [] }))
    : [];
  const trendOptions = {
    chart: { ...baseChart, type: "line", zoom: { enabled: false } },
    stroke: { curve: "smooth", width: 2 },
    colors: [ROLE_COLORS.Konditer, ROLE_COLORS.Fasovshik, ROLE_COLORS.Zagatovitel],
    xaxis: {
      categories: trend?.dates || [],
      labels: { ...axisLabels, rotate: -45 },
      tickAmount: Math.min(trend?.dates?.length || 0, 10),
    },
    yaxis: { labels: axisLabels },
    legend: legendCfg,
    grid: gridCfg,
    tooltip: { theme: tooltipTheme },
    theme: chartTheme,
  };

  const chartH = Math.max(300, headcount.length * 28 + 60);

  // Requests by day: stacked columns of exchanges vs role changes
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
    legend: legendCfg,
    grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (val, { dataPointIndex }) =>
        `${val} · ${req?.by_day?.workers?.[dataPointIndex] ?? 0} ${t("workers.req.workers")}` },
      y: { formatter: (v) => `${v} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Requests per supervisor: stacked bars of request counts
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
    legend: legendCfg,
    grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { seriesIndex, dataPointIndex }) => {
        const s = reqSups[dataPointIndex];
        if (!s) return String(v);
        const w = seriesIndex === 0 ? s.exchange_workers : s.role_change_workers;
        return `${v} ${t("workers.req.docs")} · ${w} ${t("workers.req.workers")}`;
      }},
    },
    theme: chartTheme,
  };

  // Exchange targets: workers moved per receiving unit / task
  const reqTgtOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange],
    dataLabels: { enabled: false },
    xaxis: {
      categories: reqTargets.map((g) =>
        g.type === "task" ? `${tl(g.label)} · ${t("workers.req.task")}` : `→ ${tl(g.label)}`),
      labels: axisLabels,
    },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false },
    grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) =>
        `${v} ${t("workers.req.workers")} · ${reqTargets[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Role changes: workers per new role
  const reqRoleOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqRoles.map((r) => tl(r.role)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false },
    grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) =>
        `${v} ${t("workers.req.workers")} · ${reqRoles[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  const reqSupChartH  = Math.max(220, reqSups.length * 30 + 80);
  const reqTgtChartH  = Math.max(200, reqTargets.length * 28 + 60);
  const reqRoleChartH = Math.max(200, reqRoles.length * 28 + 60);

  const thCls = "px-2 py-2.5";

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title={t("workers.title")}>
      {/* Headcount KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("workers.totalWorkers")}
              value={totalWorkers}
              tooltip={t("workers.tip.totalWorkers")}
            />
            <KPICard
              label={t("workers.totalBrigadirs")}
              value={headcount.length}
              tooltip={t("workers.tip.totalBrigadirs")}
            />
            <KPICard
              label={t("workers.avgDailyHC")}
              value={fmt1(Math.round(avgDailyTotal * 10) / 10)}
              tooltip={t("workers.tip.avgDailyHC")}
            />
            <KPICard
              label={t("workers.hcMismatches")}
              value={mismatchMgrs.length}
              sub={mismatchDays ? `${mismatchDays} ${t("workers.mismatchDays")}` : undefined}
              danger={mismatchMgrs.length > 0}
              tooltip={t("workers.tip.hcMismatches")}
            />
          </>
        )}
      </div>

      {/* Official vs Verifix avg daily HC */}
      <SectionCard icon={Users} title={t("workers.officialVsVerifix")} className="mb-6"
        right={<span className="text-[10px]" style={{ color: "var(--text-4)" }}>{t("workers.diffWarn")}</span>}>
        <div className="p-4">
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : headcount.length ? (
            <ReactApexChart type="bar" series={hcCompSeries} options={hcCompOptions} height={chartH} />
          ) : (
            <EmptyState title={t("workers.noHeadcount")} message={t("workers.noHeadcountMsg")} />
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
        {/* Role breakdown */}
        <SectionCard icon={BarChart3} title={t("workers.byRolePerBrigadir")}>
          <div className="p-4">
            {isLoading ? (
              <SkeletonChart className="h-64" />
            ) : headcount.length ? (
              <ReactApexChart type="bar" series={stackedSeries} options={stackedOptions} height={chartH} />
            ) : (
              <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />
            )}
          </div>
        </SectionCard>

        {/* Role trend */}
        <SectionCard icon={TrendingUp} title={t("workers.attendanceTrend")}>
          <div className="p-4">
            {!trend ? (
              <SkeletonChart className="h-64" />
            ) : trend?.dates?.length ? (
              <ReactApexChart type="line" series={trendSeries} options={trendOptions} height={320} />
            ) : (
              <EmptyState title={t("workers.noTrend")} message={t("workers.noTrendMsg")} />
            )}
          </div>
        </SectionCard>
      </div>

      {/* Headcount summary table */}
      <SectionCard icon={ClipboardList} title={t("workers.summary")} className="mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[780px]">
            <thead>
              <tr className="border-b" style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "var(--bg-inner)" }}>
                <SortHead label={t("workers.name")} col="name" sort={sort} onSort={onSort} align="left" style={{ paddingLeft: 16 }} />
                <th className={`${thCls} text-center`}>{t("overview.shift")}</th>
                <th className={`${thCls} text-right`}>{t("workers.days")}</th>
                <SortHead label={t("workers.total")} col="total" sort={sort} onSort={onSort} />
                <SortHead label={t("workers.avgDailyHC")} col="avg" sort={sort} onSort={onSort} />
                <SortHead label={t("workers.official")} col="official" sort={sort} onSort={onSort} />
                <SortHead label={t("workers.delta")} col="diff" sort={sort} onSort={onSort} />
                {ROLES.map((r) => (
                  <th key={r} className={`${thCls} text-right`} style={{ color: ROLE_COLORS[r] }}>
                    {r === "Other" ? t("workers.roleOther") : tl(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayHeadcount.length === 0 && (
                <tr><td colSpan={11}>
                  <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />
                </td></tr>
              )}
              {displayHeadcount.map((m) => (
                <tr key={m.manager_id} className="border-b hover:bg-white/5" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-1)" }}>{tl(m.name)}</td>
                  <td className={`${thCls} text-center`} style={{ color: "var(--text-2)" }}>S{m.shift}</td>
                  <td className={`${thCls} text-right font-mono`} style={{ color: "var(--text-2)" }}>{m.days ?? 0}</td>
                  <td className={`${thCls} text-right font-mono`} style={{ color: "var(--text-1)" }}>{m.total}</td>
                  <td className={`${thCls} text-right font-mono`} style={{ color: "var(--text-1)" }}>{fmt1(m.avg_daily_hc)}</td>
                  <td className={`${thCls} text-right font-mono`} style={{ color: "var(--text-2)" }}>{fmt1(m.official_hc)}</td>
                  <td className={`${thCls} text-right font-mono`}
                    style={{ color: (m.mismatch_days || 0) > 0 ? "#f97316" : "var(--text-2)" }}>
                    <span className="inline-flex items-center gap-1">
                      {(m.mismatch_days || 0) > 0 && <AlertTriangle size={11} />}
                      {fmt1(m.official_hc_diff)}
                    </span>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className={`${thCls} text-right font-mono`} style={{ color: ROLE_COLORS[r] }}>
                      {m.by_role[r] || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Requests analysis (Verifix edit) ─────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--text-1)" }}>
        <ArrowLeftRight size={15} style={{ color: "var(--brand-text)" }} />
        {t("workers.req.title")}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {!req ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("workers.req.totalRequests")}
              value={reqKpi.total}
              tooltip={t("workers.req.tip.totalRequests")}
            />
            <KPICard
              label={t("workers.req.workersExchanged")}
              value={reqKpi.workers_moved}
              tooltip={t("workers.req.tip.workersExchanged")}
            />
            <KPICard
              label={t("workers.req.workersReassigned")}
              value={reqKpi.workers_reassigned}
              tooltip={t("workers.req.tip.workersReassigned")}
            />
            <KPICard
              label={t("workers.req.postedRate")}
              value={`${postedRate}%`}
              sub={reqKpi.pending ? `${reqKpi.pending} ${t("workers.req.pending").toLowerCase()}` : undefined}
              tooltip={t("workers.req.tip.postedRate")}
            />
          </>
        )}
      </div>

      {req && !hasReqData ? (
        <div className="rounded-xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
            {/* Requests by day */}
            <SectionCard icon={CalendarDays} title={t("workers.req.byDay")}>
              <div className="p-4">
                {!req ? (
                  <SkeletonChart className="h-64" />
                ) : (
                  <ReactApexChart type="bar" series={reqDaySeries} options={reqDayOptions} height={300} />
                )}
              </div>
            </SectionCard>

            {/* Requests by supervisor */}
            <SectionCard icon={Users} title={t("workers.req.bySupervisor")}>
              <div className="p-4">
                {!req ? (
                  <SkeletonChart className="h-64" />
                ) : (
                  <ReactApexChart type="bar" series={reqSupSeries} options={reqSupOptions} height={reqSupChartH} />
                )}
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
            {/* Exchange targets */}
            <SectionCard icon={ArrowLeftRight} title={t("workers.req.targets")}>
              <div className="p-4">
                {!req ? (
                  <SkeletonChart className="h-64" />
                ) : reqTargets.length ? (
                  <ReactApexChart
                    type="bar"
                    series={[{ name: t("workers.req.workersExchanged"), data: reqTargets.map((g) => g.workers) }]}
                    options={reqTgtOptions}
                    height={reqTgtChartH}
                  />
                ) : (
                  <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
                )}
              </div>
            </SectionCard>

            {/* Role changes by new role + transitions */}
            <SectionCard icon={Repeat} title={t("workers.req.roles")}>
              <div className="p-4">
                {!req ? (
                  <SkeletonChart className="h-64" />
                ) : reqRoles.length ? (
                  <>
                    <ReactApexChart
                      type="bar"
                      series={[{ name: t("workers.req.workersReassigned"), data: reqRoles.map((r) => r.workers) }]}
                      options={reqRoleOptions}
                      height={reqRoleChartH}
                    />
                    {reqTrans.length > 0 && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--text-3)" }}>
                          {t("workers.req.transitions")}
                        </div>
                        <div className="flex flex-col gap-1">
                          {reqTrans.map((tr, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="truncate" style={{ color: "var(--text-2)" }}>
                                {tl(tr.from)}
                                <span className="mx-1.5" style={{ color: REQ_COLORS.roleChange }}>→</span>
                                <span style={{ color: "var(--text-1)" }}>{tl(tr.to)}</span>
                              </span>
                              <span className="font-mono flex-shrink-0 pl-3" style={{ color: "var(--text-2)" }}>
                                {tr.workers} {t("workers.req.workers")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
                )}
              </div>
            </SectionCard>
          </div>

          {/* Supervisor summary table */}
          <SectionCard icon={ClipboardList} title={t("workers.req.supervisorSummary")} className="mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="border-b" style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "var(--bg-inner)" }}>
                    <th className="text-left px-4 py-2.5">{t("workers.name")}</th>
                    <th className={`${thCls} text-center`}>{t("overview.shift")}</th>
                    <th className={`${thCls} text-right`} style={{ color: REQ_COLORS.exchange }}>
                      {t("workers.req.exchanges")}
                    </th>
                    <th className={`${thCls} text-right`} style={{ color: REQ_COLORS.roleChange }}>
                      {t("workers.req.roleChanges")}
                    </th>
                    <th className={`${thCls} text-right`}>{t("workers.req.posted")}</th>
                    <th className={`${thCls} text-left`}>{t("workers.req.topTarget")}</th>
                    <th className="text-left px-4 py-2.5">{t("workers.req.topRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reqSups.length === 0 && (
                    <tr><td colSpan={7}>
                      <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
                    </td></tr>
                  )}
                  {reqSups.map((s) => (
                    <tr key={s.manager_id} className="border-b hover:bg-white/5" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-1)" }}>{tl(s.name)}</td>
                      <td className={`${thCls} text-center`} style={{ color: "var(--text-2)" }}>S{s.shift}</td>
                      <td className={`${thCls} text-right font-mono`} style={{ color: REQ_COLORS.exchange }}>
                        {s.exchanges} · {s.exchange_workers} {t("workers.req.workers")}
                      </td>
                      <td className={`${thCls} text-right font-mono`} style={{ color: REQ_COLORS.roleChange }}>
                        {s.role_changes} · {s.role_change_workers} {t("workers.req.workers")}
                      </td>
                      <td className={`${thCls} text-right font-mono`} style={{ color: "var(--text-1)" }}>
                        {s.posted}/{s.total}
                      </td>
                      <td className={thCls} style={{ color: "var(--text-2)" }}>{s.top_target ? tl(s.top_target) : "—"}</td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-2)" }}>{s.top_role ? tl(s.top_role) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </Layout>
  );
}
