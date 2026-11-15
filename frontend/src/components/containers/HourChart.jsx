// «Konteynerlar» → the day's containers hour by hour as a picture (2026-11-15,
// the operator: «add more analytics with graphs»): one bar per production
// hour, stacked by container type, the hour now marked. The numbers are the
// hourly table's own (`/api/shift-report/containers-hourly`) — the chart adds
// none. Not drawn in TV mode: that board is scaled as a whole, and its table
// already shows the hours around now at reading distance.
import ReactApexChart from "react-apexcharts";
import { BarChart3 } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { hourLabel } from "../production/HourlyContainers";
import { useChartTheme } from "../../hooks/useChartTheme";
import { KEYS, fmt, TYPE_COLORS } from "./flowUtil";

const H = 250;

export default function HourChart({ hours, loading, nowHour = null, t }) {
  const th = useChartTheme();
  const rows = (hours ?? []).filter((x) => KEYS.some((k) => x.counts?.[k]));
  const keys = KEYS.filter((k) => rows.some((x) => x.counts?.[k]));
  const labels = rows.map((x) => `${hourLabel(x.h)}:00`);
  const peak = rows.reduce((best, x) => {
    const n = KEYS.reduce((s, k) => s + (x.counts?.[k] ?? 0), 0);
    return n > best.n ? { n, h: x.h } : best;
  }, { n: 0, h: null });
  const nowLabel = nowHour != null && rows.some((x) => x.h === nowHour) ? `${hourLabel(nowHour)}:00` : null;
  const options = {
    chart: {
      type: "bar", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, fontFamily: "inherit",
    },
    theme: th.chartTheme,
    colors: keys.map((k) => TYPE_COLORS[k]),
    plotOptions: { bar: { columnWidth: "64%", borderRadius: 3, borderRadiusApplication: "end", borderRadiusWhenStacked: "last" } },
    dataLabels: { enabled: false },
    grid: { borderColor: th.gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    legend: { labels: { colors: th.legendColor }, fontSize: "11px", position: "top", horizontalAlign: "left" },
    xaxis: {
      categories: labels,
      labels: { style: { colors: th.labelColor, fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: th.labelColor, fontSize: "11px" }, formatter: (v) => fmt(Math.round(v)) } },
    tooltip: { theme: th.tooltipTheme, shared: true, intersect: false },
    states: { active: { filter: { type: "none" } } },
    ...(nowLabel ? {
      annotations: {
        xaxis: [{
          x: nowLabel, borderColor: "#C8973F", strokeDashArray: 0,
          label: { text: t("containers.chartNow"), orientation: "horizontal", borderColor: "#C8973F",
            style: { background: "#C8973F", color: "#fff", fontSize: "10px" } },
        }],
      },
    } : {}),
  };
  const series = keys.map((k) => ({ name: t(`production.cont.${k}`), data: rows.map((x) => x.counts?.[k] ?? 0) }));
  return (
    <section className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={BarChart3} title={t("containers.chartTitle")} subtitle={t("containers.chartSub")}
        right={!loading && peak.h != null ? (
          <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
            {t("containers.chartPeak").replace("{h}", `${hourLabel(peak.h)}:00`).replace("{n}", fmt(peak.n))}
          </span>
        ) : null} />
      <div className="px-2 pb-2" style={{ minHeight: H + 8 }}>
        {loading ? <SkeletonBlock className="mx-2 rounded-xl" style={{ height: H - 16 }} />
          : !rows.length ? <p className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-3)" }}>{t("containers.chartNone")}</p>
          : <ReactApexChart type="bar" height={H} options={options} series={series} />}
      </div>
    </section>
  );
}
