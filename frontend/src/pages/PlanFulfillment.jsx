import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import StatusBadge from "../components/ui/StatusBadge";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtPct, fmtTime } from "../utils/formatters";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import api from "../utils/api";

export default function PlanFulfillment() {
  const { params, unit, ready } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [nameAsc, setNameAsc] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["plan", params],
    queryFn: () => api.get("/api/plan-fulfillment", { params }).then((r) => r.data),
    enabled: ready,
  });

  // Trend chart never spans fewer than 7 days: a short selection fetches a
  // window padded back to end-6d (same key = same request when no padding).
  const chartParams = useMemo(() => padChartParams(params), [params]);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["plan", chartParams],
    queryFn: () => api.get("/api/plan-fulfillment", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  const summary = data?.summary || [];
  const fleet   = data?.fleet_avg_fulfillment;

  const displaySummary = nameAsc !== null
    ? [...summary].sort((a, b) => nameAsc
        ? (tl(a.name) || "").localeCompare(tl(b.name) || "")
        : (tl(b.name) || "").localeCompare(tl(a.name) || ""))
    : summary;

  // Bar: fulfillment % per brigadir
  const barOptions = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    plotOptions: { bar: { horizontal: true, distributed: true, barHeight: "70%" } },
    colors: summary.map((s) =>
      s.fulfillment >= 1.0 ? "#22c55e" : s.fulfillment >= 0.90 ? "#eab308" : "#ef4444"
    ),
    dataLabels: {
      enabled: true,
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
      style: { fontSize: "11px", fontWeight: 600, colors: ["#fff"] },
    },
    xaxis: {
      categories: summary.map((s) => tl(s.name)),
      labels: {
        style: { colors: "#6b7280", fontSize: "10px" },
        formatter: (v) => `${(v * 100).toFixed(0)}%`,
      },
      max: Math.max(...summary.map((s) => s.fulfillment || 0), 1.1),
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
    grid: { borderColor: "#1e2235" },
    annotations: {
      xaxis: [{ x: 1.0, borderColor: "#22c55e", strokeDashArray: 4,
        label: { text: "100%", style: { color: "#22c55e", background: "transparent", fontSize: "10px" } } }],
    },
    tooltip: { theme: "dark", y: { formatter: (v) => `${(v * 100).toFixed(1)}%` } },
    legend: { show: false },
    theme: { mode: "dark" },
  };

  // Trend: fleet fulfillment % over time (padded ≥7-day window)
  const dateMap = {};
  (chartData?.rows || []).forEach((r) => {
    if (!dateMap[r.date]) dateMap[r.date] = { plan: 0, actual: 0 };
    dateMap[r.date].plan   += r.prod_plan   || 0;
    dateMap[r.date].actual += r.prod_actual || 0;
  });
  const trendDates = Object.keys(dateMap).sort();
  const trendSeries = [{
    name: t("plan.fleetAvg"),
    data: trendDates.map((d) => {
      const { plan, actual } = dateMap[d];
      return plan > 0 ? Math.round((actual / plan) * 100) : 0;
    }),
  }];
  const trendOptions = {
    chart: { type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false },
    stroke: { curve: "smooth", width: 2 },
    colors: ["#C8973F"],
    xaxis: {
      categories: trendDates,
      labels: { style: { colors: "#6b7280", fontSize: "10px" }, rotate: -45 },
      tickAmount: Math.min(trendDates.length, 10),
    },
    yaxis: {
      labels: {
        style: { colors: "#6b7280", fontSize: "10px" },
        formatter: (v) => `${Math.round(v)}%`,
      },
      min: 0,
    },
    annotations: {
      yaxis: [{
        y: 100,
        borderColor: "#22c55e",
        strokeDashArray: 4,
        label: { text: "100%", style: { color: "#22c55e", background: "transparent", fontSize: "10px" } },
      }],
    },
    legend: { labels: { colors: "#9ca3af" }, fontSize: "11px" },
    grid: { borderColor: "#1e2235" },
    tooltip: { theme: "dark", y: { formatter: (v) => `${v}%` } },
    theme: { mode: "dark" },
  };

  return (
    <Layout title={t("plan.title")}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("plan.fleetAvg")}
              value={fmtPct(fleet)}
              accent
              tooltip={t("plan.tip.fleetAvg")}
            />
            <KPICard
              label={t("plan.above100")}
              value={data?.count_above_100 ?? "—"}
              tooltip={t("plan.tip.above100")}
            />
            <KPICard
              label={t("plan.below85")}
              value={data?.count_below_85 ?? "—"}
              danger={data?.count_below_85 > 0}
              tooltip={t("plan.tip.below85")}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
            {t("plan.byBrigadir")}
          </div>
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : summary.length ? (
            <ReactApexChart
              type="bar"
              series={[{ name: t("plan.colFulfillment"), data: summary.map((s) => s.fulfillment) }]}
              options={barOptions}
              height={Math.max(300, summary.length * 28 + 60)}
            />
          ) : (
            <EmptyState title={t("plan.noPlan")} message={t("plan.noPlanMsg")} />
          )}
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
            {t("plan.trend")}
          </div>
          <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
            {t("plan.trendSub")}
          </div>
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : trendDates.length > 0 ? (
            <ReactApexChart type="line" series={trendSeries} options={trendOptions} height={320} />
          ) : (
            <EmptyState title={t("plan.noTrend2")} message={t("plan.noTrendMsg")} />
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
          {t("plan.summaryByBrigadir")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
                <th className="text-left px-4 py-2.5 cursor-pointer select-none" onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}>
                  <span className="inline-flex items-center gap-1">
                    {t("filter.brigadir")}
                    {nameAsc === null ? <ChevronsUpDown size={9} style={{opacity:.4}}/> : nameAsc ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                  </span>
                </th>
                <th className="text-center px-2 py-2.5">{t("plan.colShift")}</th>
                <th className="text-right px-2 py-2.5">{t("plan.colPlanTotal")}</th>
                <th className="text-right px-2 py-2.5">{t("plan.colActualTotal")}</th>
                <th className="text-right px-4 py-2.5">{t("plan.colFulfillment")}</th>
              </tr>
            </thead>
            <tbody>
              {displaySummary.length === 0 && (
                <tr><td colSpan={5}><EmptyState title={t("plan.noTableData")} message={t("plan.noTableMsg")} /></td></tr>
              )}
              {displaySummary.map((s) => (
                <tr key={s.manager_id} className="border-b border-[var(--border)] hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-[var(--text-1)]">{tl(s.name)}</td>
                  <td className="px-2 py-2.5 text-center text-[var(--text-2)]">S{s.shift}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[var(--text-2)]">{fmtTime(s.plan_total, unit)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[var(--text-2)]">{fmtTime(s.actual_total, unit)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-mono font-bold ${s.fulfillment >= 1.0 ? "text-green-400" : s.fulfillment >= 0.90 ? "text-yellow-300" : "text-red-400"}`}>
                      {fmtPct(s.fulfillment)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
