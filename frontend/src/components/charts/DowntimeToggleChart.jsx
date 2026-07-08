"use no memo";
import { useMemo } from "react";
import ReactApexChart from "react-apexcharts";

const INDIGO = "#6366f1";

// Round a raw max up to a "nice" axis maximum (…, 1000, 1250, 1500, 2000 …), mirroring
// the tick values ApexCharts would auto-pick. We force this max so the label-fit test
// below can convert a bar's value into a pixel width deterministically.
function niceAxisMax(raw) {
  const target = Math.max(raw, 50) * 1.1;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const s of steps) if (s * pow >= target) return s * pow;
  return 10 * pow;
}

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
 * Labels: a total bar shows its value centred *inside* the bar, but a short bar can't hold
 * the text — it would spill past both ends. When the label is wider than the bar we drop the
 * inside label and instead paint it just past the bar's end (outside, to the right) via the
 * stacked-total label. Whether a bar is a single "total" bar is inferred from the live series
 * values at draw time, so this needs no extra prop and keeps the `options` identity stable
 * across the Total⇄Categories toggle (preserving the morph animation).
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

  // Deterministic value-axis max → lets us turn a bar's value into a pixel width. Each bar's
  // full length equals its total downtime, identical in both views, so this is toggle-stable.
  const axisMax = useMemo(
    () => niceAxisMax(Math.max(0, ...summary.map((s) => s.total || 0))),
    [summary],
  );

  const options = useMemo(
    () => {
      const fmtVal = (v) =>
        unit === "hrs" ? `${(v / 60).toFixed(1)}${hrsLabel}` : `${v.toFixed(0)}${minLabel}`;

      // Does the centred label fit inside a bar of value `val`? Use the real plot width when
      // ApexCharts exposes it; otherwise fall back to a typical width so short bars still get
      // pushed outside rather than being left to overflow.
      const fitsInside = (val, text, globals) => {
        const labelPx = String(text).length * 8 + 20; // ≈ 11px bold glyphs + breathing room
        const gridW = globals && globals.gridWidth;
        const plotW = gridW && gridW > 0 ? gridW : 900;
        return (val / axisMax) * plotW >= labelPx;
      };

      // A bar is a single "total" bar (vs. a stack of category segments) when none of the
      // category series (index ≥ 2) carry a value at this data point.
      const isTotalBar = (opts) => {
        const g = opts && opts.w && opts.w.globals;
        const di = opts && opts.dataPointIndex;
        if (!g || !Array.isArray(g.series) || di == null) return true;
        const catSum = g.series
          .slice(2)
          .reduce((a, arr) => a + (Number(arr && arr[di]) || 0), 0);
        return catSum === 0;
      };

      return {
        chart: {
          type: "bar",
          background: "transparent",
          stacked: true,
          toolbar: { show: false },
          animations: { enabled: true, easing: "easeinout", speed: 550, animateGradually: { enabled: false }, dynamicAnimation: { enabled: true, speed: 550 } },
          redrawOnParentResize: false,
          redrawOnWindowResize: false,
        },
        plotOptions: {
          bar: {
            horizontal: true,
            barHeight: "70%",
            dataLabels: {
              // Outside label for the short total bars: rendered at the bar's end, nudged
              // right so it clears the bar. Only emitted when the bar is a single total bar
              // AND its value can't hold the label inside.
              total: {
                enabled: true,
                offsetX: 6,
                style: { fontSize: "11px", fontWeight: 600, color: "#e5e7eb" },
                formatter: (val, opts) => {
                  if (!val || val <= 0 || !isTotalBar(opts)) return "";
                  const text = fmtVal(val);
                  return fitsInside(val, text, opts && opts.w && opts.w.globals) ? "" : text;
                },
              },
            },
          },
        },
        colors: ["#ef4444", INDIGO, ...catColors],
        dataLabels: {
          enabled: true,
          // Every segment (total bars AND category segments) follows the global min/hrs
          // filter, so labels read e.g. "30min" or "0.5soat" — never a bare, unitless number.
          // For the two total series (index 0/1) drop the inside label when the bar is too
          // short; the outside total label above shows it instead.
          formatter: (val, opts) => {
            if (!val || val <= 0) return "";
            const text = fmtVal(val);
            const si = opts && opts.seriesIndex;
            if ((si === 0 || si === 1) && !fitsInside(val, text, opts && opts.w && opts.w.globals)) return "";
            return text;
          },
          style: { fontSize: "11px", fontWeight: 600, colors: ["#fff"] },
          dropShadow: { enabled: false },
        },
        xaxis: {
          categories,
          min: 0,
          max: axisMax,
          labels: { style: { colors: "#6b7280", fontSize: "10px" } },
        },
        yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
        grid: { borderColor: "#1e2235", padding: { right: 28 } },
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
      };
    },
    [categories, axisMax, unit, minLabel, hrsLabel, thresholdText, catColors],
  );

  return <ReactApexChart type="bar" series={series} options={options} height={height} />;
}
