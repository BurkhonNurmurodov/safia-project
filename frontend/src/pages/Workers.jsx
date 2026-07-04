import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";
import { AlertTriangle, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

// Distinct colors for each role
const ROLE_COLORS = {
  Konditer:    "#C8973F",
  Fasovshik:   "#f97316",
  Zagatovitel: "#22c55e",
  Other:       "#6b7280",
};

// Colors for the two Verifix-edit request types
const REQ_COLORS = {
  exchange:   "#3b82f6",
  roleChange: "#a78bfa",
};

export default function Workers() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [nameAsc, setNameAsc] = useState(true);

  const { data: headcount = [], isLoading } = useQuery({
    queryKey: ["headcount", params],
    queryFn: () => api.get("/api/workers/headcount", { params }).then((r) => r.data),
    enabled: ready,
  });

  const { data: trend } = useQuery({
    queryKey: ["worker-trend", params],
    queryFn: () => api.get("/api/workers/trend", { params }).then((r) => r.data),
    enabled: ready,
  });

  const { data: req } = useQuery({
    queryKey: ["worker-requests-analysis", params],
    queryFn: () => api.get("/api/workers/requests-analysis", { params }).then((r) => r.data),
    enabled: ready,
  });

  const totalWorkers = headcount.reduce((s, m) => s + m.total, 0);
  const mismatches   = headcount.filter((m) => m.official_hc_diff > 2).length;

  const displayHeadcount = nameAsc !== null
    ? [...headcount].sort((a, b) => nameAsc
        ? (tl(a.name) || "").localeCompare(tl(b.name) || "")
        : (tl(b.name) || "").localeCompare(tl(a.name) || ""))
    : headcount;

  // Official vs Verifix HC grouped bar
  const hcCompSeries = [
    { name: "Official HC", data: headcount.map((m) => m.official_hc ?? m.total) },
    { name: "Verifix HC",  data: headcount.map((m) => m.total) },
  ];
  const hcCompOptions = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", grouped: true } },
    colors: ["#6b7280", "#C8973F"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: headcount.map((m) => tl(m.name)),
      labels: { style: { colors: "#6b7280", fontSize: "10px" } },
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px", position: "top" },
    grid: { borderColor: "#1e2235" },
    tooltip: {
      theme: "dark",
      y: { formatter: (v, { seriesIndex, dataPointIndex }) => {
        const m = headcount[dataPointIndex];
        const diff = m ? Math.abs((m.official_hc ?? m.total) - m.total) : 0;
        return diff > 2 ? `${v} ⚠ (±${diff})` : String(v);
      }},
    },
    annotations: headcount.reduce((acc, m, i) => {
      const diff = Math.abs((m.official_hc ?? m.total) - m.total);
      if (diff > 2) acc.points = [...(acc.points || []), {
        x: Math.max(m.official_hc ?? m.total, m.total),
        y: tl(m.name),
        marker: { size: 0 },
        label: { text: `⚠ ±${diff}`, style: { color: "#f97316", background: "transparent", fontSize: "10px" } },
      }];
      return acc;
    }, {}),
    theme: { mode: "dark" },
  };

  // Stacked bar: role breakdown per manager
  const stackedSeries = ["Konditer", "Fasovshik", "Zagatovitel", "Other"].map((role) => ({
    name: role,
    data: headcount.map((m) => m.by_role[role] || 0),
  }));
  const stackedOptions = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, stacked: true, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    plotOptions: { bar: { horizontal: true, barHeight: "70%" } },
    colors: [ROLE_COLORS.Konditer, ROLE_COLORS.Fasovshik, ROLE_COLORS.Zagatovitel, ROLE_COLORS.Other],
    xaxis: {
      categories: headcount.map((m) => tl(m.name)),
      labels: { style: { colors: "#6b7280", fontSize: "10px" } },
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px", position: "top" },
    grid: { borderColor: "#1e2235" },
    tooltip: { theme: "dark" },
    theme: { mode: "dark" },
  };

  // Trend chart
  const trendSeries = trend
    ? ["Konditer", "Fasovshik", "Zagatovitel"].map((r) => ({
        name: r,
        data: trend.series[r] || [],
      }))
    : [];
  const trendOptions = {
    chart: { type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    stroke: { curve: "smooth", width: 2 },
    colors: [ROLE_COLORS.Konditer, ROLE_COLORS.Fasovshik, ROLE_COLORS.Zagatovitel],
    xaxis: {
      categories: trend?.dates || [],
      labels: { style: { colors: "#6b7280", fontSize: "10px" }, rotate: -45 },
      tickAmount: Math.min((trend?.dates?.length || 0), 10),
    },
    yaxis: { labels: { style: { colors: "#6b7280", fontSize: "10px" } } },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px" },
    grid: { borderColor: "#1e2235" },
    tooltip: { theme: "dark" },
    theme: { mode: "dark" },
  };

  const chartH = Math.max(300, headcount.length * 28 + 60);

  // ── Requests analysis (Verifix edit HrDocuments) ────────────────────────────
  const reqKpi     = req?.kpi;
  const reqSups    = req?.by_supervisor || [];
  const reqTargets = req?.targets || [];
  const reqRoles   = req?.roles || [];
  const reqTrans   = req?.transitions || [];
  const hasReqData = (reqKpi?.total || 0) > 0;
  const postedRate = reqKpi?.total ? Math.round((reqKpi.posted / reqKpi.total) * 100) : 0;

  const baseBarChart = {
    background: "transparent", toolbar: { show: false }, animations: { enabled: false },
    redrawOnParentResize: false, redrawOnWindowResize: false,
  };
  const axisLabel  = { style: { colors: "#6b7280", fontSize: "10px" } };
  const axisLabelY = { style: { colors: "#9ca3af", fontSize: "11px" } };

  // Daily stacked columns: exchanges vs role changes
  const reqDaySeries = [
    { name: t("workers.req.exchanges"),   data: req?.by_day?.exchanges || [] },
    { name: t("workers.req.roleChanges"), data: req?.by_day?.role_changes || [] },
  ];
  const reqDayOptions = {
    chart: { ...baseBarChart, type: "bar", stacked: true },
    plotOptions: { bar: { columnWidth: "55%" } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: req?.by_day?.dates || [], labels: { ...axisLabel, rotate: -45 } },
    yaxis: { labels: axisLabel },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px", position: "top" },
    grid: { borderColor: "#1e2235" },
    tooltip: {
      theme: "dark",
      x: { formatter: (val, { dataPointIndex }) =>
        `${val} · ${req?.by_day?.workers?.[dataPointIndex] ?? 0} ${t("workers.req.workers")}` },
      y: { formatter: (v) => `${v} ${t("workers.req.docs")}` },
    },
    theme: { mode: "dark" },
  };

  // Per-supervisor stacked horizontal bars (request counts)
  const reqSupSeries = [
    { name: t("workers.req.exchanges"),   data: reqSups.map((s) => s.exchanges) },
    { name: t("workers.req.roleChanges"), data: reqSups.map((s) => s.role_changes) },
  ];
  const reqSupOptions = {
    chart: { ...baseBarChart, type: "bar", stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqSups.map((s) => tl(s.name)), labels: axisLabel },
    yaxis: { labels: axisLabelY },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px", position: "top" },
    grid: { borderColor: "#1e2235" },
    tooltip: {
      theme: "dark",
      y: { formatter: (v, { seriesIndex, dataPointIndex }) => {
        const s = reqSups[dataPointIndex];
        if (!s) return String(v);
        const w = seriesIndex === 0 ? s.exchange_workers : s.role_change_workers;
        return `${v} ${t("workers.req.docs")} · ${w} ${t("workers.req.workers")}`;
      }},
    },
    theme: { mode: "dark" },
  };

  // Exchange targets: workers moved per receiving unit / task
  const reqTgtOptions = {
    chart: { ...baseBarChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
    colors: [REQ_COLORS.exchange],
    dataLabels: { enabled: false },
    xaxis: {
      categories: reqTargets.map((g) =>
        g.type === "task" ? `${tl(g.label)} · ${t("workers.req.task")}` : `→ ${tl(g.label)}`),
      labels: axisLabel,
    },
    yaxis: { labels: axisLabelY },
    legend: { show: false },
    grid: { borderColor: "#1e2235" },
    tooltip: {
      theme: "dark",
      y: { formatter: (v, { dataPointIndex }) =>
        `${v} ${t("workers.req.workers")} · ${reqTargets[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: { mode: "dark" },
  };

  // Role changes: workers per new role
  const reqRoleOptions = {
    chart: { ...baseBarChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
    colors: [REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqRoles.map((r) => tl(r.role)), labels: axisLabel },
    yaxis: { labels: axisLabelY },
    legend: { show: false },
    grid: { borderColor: "#1e2235" },
    tooltip: {
      theme: "dark",
      y: { formatter: (v, { dataPointIndex }) =>
        `${v} ${t("workers.req.workers")} · ${reqRoles[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: { mode: "dark" },
  };

  const reqSupChartH = Math.max(220, reqSups.length * 30 + 80);
  const reqTgtChartH = Math.max(200, reqTargets.length * 28 + 60);
  const reqRoleChartH = Math.max(200, reqRoles.length * 28 + 60);

  return (
    <Layout title={t("workers.title")}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
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
              label={t("workers.hcMismatches")}
              value={mismatches}
              danger={mismatches > 0}
              tooltip={t("workers.tip.hcMismatches")}
            />
          </>
        )}
      </div>

      {/* Official HC vs Verifix HC comparison */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
          {t("workers.officialVsVerifix")}
        </div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
          {t("workers.diffWarn")}
        </div>
        {isLoading ? (
          <SkeletonChart className="h-64" />
        ) : headcount.length ? (
          <ReactApexChart type="bar" series={hcCompSeries} options={hcCompOptions} height={chartH} />
        ) : (
          <EmptyState title={t("workers.noHeadcount")} message={t("workers.noHeadcountMsg")} />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
        {/* Role breakdown */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
            {t("workers.byRolePerBrigadir")}
          </div>
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : headcount.length ? (
            <ReactApexChart type="bar" series={stackedSeries} options={stackedOptions} height={chartH} />
          ) : (
            <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />
          )}
        </div>

        {/* Role trend */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
            {t("workers.attendanceTrend")}
          </div>
          {!trend ? (
            <SkeletonChart className="h-64" />
          ) : trend?.dates?.length ? (
            <ReactApexChart type="line" series={trendSeries} options={trendOptions} height={320} />
          ) : (
            <EmptyState title={t("workers.noTrend")} message={t("workers.noTrendMsg")} />
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
          {t("workers.summary")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
                <th className="text-left px-4 py-2.5 cursor-pointer select-none" onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}>
                  <span className="inline-flex items-center gap-1">
                    {t("workers.name")}
                    {nameAsc === null ? <ChevronsUpDown size={9} style={{opacity:.4}}/> : nameAsc ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                  </span>
                </th>
                <th className="text-center px-2 py-2.5">{t("overview.shift")}</th>
                <th className="text-right px-2 py-2.5">{t("workers.total")}</th>
                <th className="text-right px-2 py-2.5" style={{ color: ROLE_COLORS.Konditer }}>{tl("Konditer")}</th>
                <th className="text-right px-2 py-2.5" style={{ color: ROLE_COLORS.Fasovshik }}>{tl("Fasovshik")}</th>
                <th className="text-right px-2 py-2.5" style={{ color: ROLE_COLORS.Zagatovitel }}>{tl("Zagatovitel")}</th>
                <th className="text-right px-4 py-2.5">{t("workers.official")}</th>
              </tr>
            </thead>
            <tbody>
              {displayHeadcount.length === 0 && (
                <tr><td colSpan={7}><EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} /></td></tr>
              )}
              {displayHeadcount.map((m) => (
                <tr key={m.manager_id} className="border-b border-[var(--border)] hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-[var(--text-1)]">{tl(m.name)}</td>
                  <td className="px-2 py-2.5 text-center text-[var(--text-2)]">S{m.shift}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[var(--text-1)]">
                    <span className="flex items-center justify-end gap-1">
                      {m.official_hc_diff > 2 && <AlertTriangle size={11} className="text-orange-400" />}
                      {m.total}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono" style={{ color: ROLE_COLORS.Konditer }}>{m.by_role.Konditer || 0}</td>
                  <td className="px-2 py-2.5 text-right font-mono" style={{ color: ROLE_COLORS.Fasovshik }}>{m.by_role.Fasovshik || 0}</td>
                  <td className="px-2 py-2.5 text-right font-mono" style={{ color: ROLE_COLORS.Zagatovitel }}>{m.by_role.Zagatovitel || 0}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[var(--text-2)]">{m.by_role.Other || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Requests analysis (Verifix edit) ─────────────────────────────── */}
      <div className="text-sm font-semibold text-[var(--text-1)] uppercase tracking-wider mb-3">
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
              tooltip={t("workers.req.tip.postedRate")}
            />
          </>
        )}
      </div>

      {req && !hasReqData ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
          <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
            {/* Requests by day */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
                {t("workers.req.byDay")}
              </div>
              {!req ? (
                <SkeletonChart className="h-64" />
              ) : (
                <ReactApexChart type="bar" series={reqDaySeries} options={reqDayOptions} height={300} />
              )}
            </div>

            {/* Requests by supervisor */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
                {t("workers.req.bySupervisor")}
              </div>
              {!req ? (
                <SkeletonChart className="h-64" />
              ) : (
                <ReactApexChart type="bar" series={reqSupSeries} options={reqSupOptions} height={reqSupChartH} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
            {/* Exchange targets */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
                {t("workers.req.targets")}
              </div>
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
                <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} />
              )}
            </div>

            {/* Role changes by new role + transitions */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
                {t("workers.req.roles")}
              </div>
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
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <div className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
                        {t("workers.req.transitions")}
                      </div>
                      <div className="flex flex-col gap-1">
                        {reqTrans.map((tr, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-2)] truncate">
                              {tl(tr.from)}
                              <span className="mx-1.5" style={{ color: REQ_COLORS.roleChange }}>→</span>
                              <span className="text-[var(--text-1)]">{tl(tr.to)}</span>
                            </span>
                            <span className="font-mono text-[var(--text-2)] flex-shrink-0 pl-3">
                              {tr.workers} {t("workers.req.workers")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} />
              )}
            </div>
          </div>

          {/* Supervisor summary table */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
              {t("workers.req.supervisorSummary")}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
                    <th className="text-left px-4 py-2.5">{t("workers.name")}</th>
                    <th className="text-center px-2 py-2.5">{t("overview.shift")}</th>
                    <th className="text-right px-2 py-2.5" style={{ color: REQ_COLORS.exchange }}>
                      {t("workers.req.exchanges")}
                    </th>
                    <th className="text-right px-2 py-2.5" style={{ color: REQ_COLORS.roleChange }}>
                      {t("workers.req.roleChanges")}
                    </th>
                    <th className="text-right px-2 py-2.5">{t("workers.req.posted")}</th>
                    <th className="text-left px-2 py-2.5">{t("workers.req.topTarget")}</th>
                    <th className="text-left px-4 py-2.5">{t("workers.req.topRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reqSups.length === 0 && (
                    <tr><td colSpan={7}>
                      <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} />
                    </td></tr>
                  )}
                  {reqSups.map((s) => (
                    <tr key={s.manager_id} className="border-b border-[var(--border)] hover:bg-white/5">
                      <td className="px-4 py-2.5 font-medium text-[var(--text-1)]">{tl(s.name)}</td>
                      <td className="px-2 py-2.5 text-center text-[var(--text-2)]">S{s.shift}</td>
                      <td className="px-2 py-2.5 text-right font-mono" style={{ color: REQ_COLORS.exchange }}>
                        {s.exchanges} · {s.exchange_workers} {t("workers.req.workers")}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono" style={{ color: REQ_COLORS.roleChange }}>
                        {s.role_changes} · {s.role_change_workers} {t("workers.req.workers")}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[var(--text-1)]">
                        {s.posted}/{s.total}
                      </td>
                      <td className="px-2 py-2.5 text-[var(--text-2)]">{s.top_target ? tl(s.top_target) : "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--text-2)]">{s.top_role ? tl(s.top_role) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </Layout>
  );
}
