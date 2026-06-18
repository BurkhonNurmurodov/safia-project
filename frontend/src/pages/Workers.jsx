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
    </Layout>
  );
}
