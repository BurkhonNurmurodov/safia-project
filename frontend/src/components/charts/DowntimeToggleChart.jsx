"use no memo";
import { useMemo } from "react";
import ReactApexChart from "react-apexcharts";

const INDIGO = "#6366f1";

/**
 * Merged "Total ⇄ Categories" horizontal bar chart for the Downtime page.
 *
 * The series shape is fixed — [over-threshold, under-threshold, ...categories] — and only
 * the *values* change when the parent toggles the view. Combined with a stable `options`
 * reference, that makes react-apexcharts take its animated `updateSeries()` path, so the
 * solid total bar visibly morphs into the coloured category segments (and back) instead of
 * the chart being torn down and redrawn.
 *
 * To keep the plot area byte-identical between views (so every bar stays at the exact same
 * position/size as it morphs) the legend is always off and the 50-min threshold line is
 * always on — neither depends on the active view.
 *
 * This component opts out of the React Compiler (`"use no memo"`) on purpose: the option
 * memo is keyed on `lang` rather than the `t()` / `tl()` closures (which the LangContext
 * recreates every render), which the compiler's preserve-manual-memoization rule forbids.
 */
export default function DowntimeToggleChart({
  series,
  height,
  summary,
  lang,
  tl,
  unit,
  minLabel,
  hrsLabel,
  thresholdText,
  catColors,
}) {
  // tl() only varies with `lang` / name overrides, so key on lang (not the closure).
  const categories = useMemo(
    () => summary.map((s) => tl(s.manager_name)),
    [summary, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const options = useMemo(
    () => ({
      chart: {
        type: "bar",
        background: "transparent",
        stacked: true,
        toolbar: { show: false },
        animations: { enabled: true, easing: "easeinout", speed: 550, animateGradually: { enabled: false }, dynamicAnimation: { enabled: true, speed: 550 } },
        redrawOnParentResize: false,
        redrawOnWindowResize: false,
      },
      plotOptions: { bar: { horizontal: true, barHeight: "70%" } },
      colors: ["#ef4444", INDIGO, ...catColors],
      dataLabels: {
        enabled: true,
        // Every segment (total bars AND category segments) follows the global min/hrs
        // filter, so labels read e.g. "30min" or "0.5soat" — never a bare, unitless number.
        formatter: (val) => {
          if (!val || val <= 0) return "";
          return unit === "hrs" ? `${(val / 60).toFixed(1)}${hrsLabel}` : `${val.toFixed(0)}${minLabel}`;
        },
        style: { fontSize: "11px", fontWeight: 600, colors: ["#fff"] },
        dropShadow: { enabled: false },
      },
      xaxis: {
        categories,
        labels: { style: { colors: "#6b7280", fontSize: "10px" } },
      },
      yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
      grid: { borderColor: "#1e2235" },
      legend: { show: false },
      annotations: {
        xaxis: [{ x: 50, borderColor: "#ef4444", strokeDashArray: 4,
          label: { text: thresholdText, style: { color: "#fff", background: "#ef4444", fontSize: "10px", padding: { top: 2, bottom: 2, left: 4, right: 4 } } } }],
      },
      tooltip: {
        theme: "dark",
        shared: false,
        intersect: true,
        y: { formatter: (v) => (unit === "hrs" ? `${(v / 60).toFixed(1)}${hrsLabel}` : `${Math.round(v)}${minLabel}`) },
      },
      theme: { mode: "dark" },
    }),
    [categories, unit, minLabel, hrsLabel, thresholdText, catColors],
  );

  return <ReactApexChart type="bar" series={series} options={options} height={height} />;
}
