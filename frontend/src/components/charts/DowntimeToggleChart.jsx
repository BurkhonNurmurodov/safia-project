"use no memo";
import { useEffect, useMemo, useRef } from "react";
import ReactApexChart from "react-apexcharts";
import { fmtDuration } from "../../utils/formatters";

const INDIGO = "#6366f1";

// ApexCharts takes its "fast update" path whenever only the series *values* change — which
// is exactly what the Total⇄Categories toggle does. That path rips out the bar groups and
// re-appends the redrawn ones at the END of `.apexcharts-inner`, i.e. AFTER the annotation
// group that mount() had put last. SVG has no z-index (paint order = document order), so on
// the first toggle the 50-min threshold line and its label sink behind the bars. Re-raise
// the annotation groups after every update to restore the mount-time paint order.
function raiseAnnotations(chartCtx) {
  const inner = chartCtx?.el?.querySelector(".apexcharts-inner");
  if (!inner) return;
  // Same order mount() adds them in, so their relative stacking is preserved.
  [".apexcharts-yaxis-annotations", ".apexcharts-xaxis-annotations", ".apexcharts-point-annotations"]
    .forEach((sel) => {
      const g = inner.querySelector(sel);
      if (g && g.parentNode === inner) inner.appendChild(g);
    });
}

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
 * Labels: every segment — a solid total bar or a category slice — prints its value centred
 * inside itself only when the text actually fits; a segment too narrow stays silent instead
 * of spilling over its neighbours. A silent total bar paints its value just past the bar's
 * end (outside, to the right) via the stacked-total label. A category stack anchors its SUM
 * there instead — always, except when that would merely repeat a lone segment's inside label
 * or the stack runs too close to the plot edge — and unlabelled slivers stay readable via
 * the per-segment tooltip. Whether a bar is a single "total" bar is inferred from the live
 * series values at draw time, so this needs no extra prop and keeps the `options` identity
 * stable across the Total⇄Categories toggle (preserving the morph animation).
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
  // Compound-span unit words ("kun" / "soat" / "daq"). Passed as three plain
  // strings rather than a formatter or an options object so they stay stable
  // dependencies of the options useMemo below — an inline function or literal
  // would change identity every render and rebuild the chart each time.
  unitDayLabel,
  unitHourLabel,
  unitMinLabel,
  catColors,
  chartTheme,
  gridColor,
  labelColor,
  tooltipTheme,
  outsideLabelColor,
  // Pressing a bar opens that supervisor's detail. Held in a REF and read at
  // event time, never listed as a dependency of the options memo: the parent
  // recreates this closure on every render, and an options object that changes
  // identity tears the chart down and rebuilds it — which is exactly the morph
  // animation the fixed series shape above exists to preserve.
  onPick,
}) {
  const pickRef = useRef(onPick);
  // Written in an effect, not during render: the handler is only ever read from
  // an ApexCharts event, which fires long after the commit.
  useEffect(() => { pickRef.current = onPick; });
  // Theme-aware fallbacks (dark) so the chart still renders if a caller omits them.
  const themeMode = (chartTheme && chartTheme.mode) || "dark";
  const grid = gridColor || "#1e2235";
  const axisLabel = labelColor || "#9ca3af";
  const tipTheme = tooltipTheme || "dark";
  // Outside labels sit on the card background (not on a coloured bar), so they must flip
  // with the theme — a near-white value was invisible on the light surface.
  const outsideLabel = outsideLabelColor || (themeMode === "dark" ? "#e5e7eb" : "#374151");
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
      // Hours as a compound span, not a decimal: at one decimal every 0.1 h is a
      // 6-minute bucket, so 3 min and 8 min both render "0.1 soat". Falls back to
      // the decimal when a caller omits the unit words.
      const hrsText = (v) =>
        unitHourLabel
          ? fmtDuration(v, { day: unitDayLabel, hour: unitHourLabel, min: unitMinLabel })
          : `${(v / 60).toFixed(1)}${hrsLabel}`;
      const fmtVal = (v) =>
        unit === "hrs" ? hrsText(v) : `${v.toFixed(0)}${minLabel}`;

      // Does the centred label fit inside a bar of value `val`? Use the real plot width when
      // ApexCharts exposes it; otherwise fall back to a typical width so short bars still get
      // pushed outside rather than being left to overflow.
      const fitsInside = (val, text, globals) => {
        const labelPx = String(text).length * 8 + 20; // ≈ 11px bold glyphs + breathing room
        const gridW = globals && globals.gridWidth;
        const plotW = gridW && gridW > 0 ? gridW : 900;
        return (val / axisMax) * plotW >= labelPx;
      };

      // Same test for the space PAST the bar's end: is there room for an outside label
      // before the plot edge? niceAxisMax keeps ≥10% headroom, so on desktop this is
      // effectively always true — on a phone the longest stacks drop their end label
      // rather than let it clip against the edge.
      const fitsOutside = (val, text, globals) => {
        const labelPx = String(text).length * 8 + 20;
        const gridW = globals && globals.gridWidth;
        const plotW = gridW && gridW > 0 ? gridW : 900;
        return ((axisMax - val) / axisMax) * plotW >= labelPx;
      };

      // Non-zero category-series (index ≥ 2) values at this data point. Empty ⇒ the bar
      // is a single "total" bar rather than a stack of category segments.
      const catValsAt = (opts) => {
        const g = opts && opts.w && opts.w.globals;
        const di = opts && opts.dataPointIndex;
        if (!g || !Array.isArray(g.series) || di == null) return [];
        return g.series
          .slice(2)
          .map((arr) => Number(arr && arr[di]) || 0)
          .filter((v) => v > 0);
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
          // Keeps the threshold line above the bars after a Total⇄Categories toggle.
          events: {
            updated: raiseAnnotations,
            // seriesIndex 0/1 are the over/under-threshold halves of a single
            // total bar — the whole unit. Anything from 2 up is a CATEGORY
            // segment, and pressing one carries that category into the detail,
            // so a reader who pressed the yellow slice is not answered with the
            // whole day.
            dataPointSelection: (_e, _ctx, cfg) => {
              const { seriesIndex: si, dataPointIndex: di, w } = cfg;
              // A category is carried only when the segment pressed actually
              // HAS minutes: in the Total view every category series is a row
              // of zeros drawn at zero width, and a stray hit on one would open
              // the detail narrowed to a category that bar never counted.
              const val = Number(w?.globals?.series?.[si]?.[di]) || 0;
              pickRef.current?.(di, si >= 2 && val > 0 ? si - 2 : null);
            },
            dataPointMouseEnter: (e) => { if (e?.target) e.target.style.cursor = "pointer"; },
          },
        },
        plotOptions: {
          bar: {
            horizontal: true,
            barHeight: "70%",
            dataLabels: {
              // Outside label rendered at the bar's end, nudged right so it clears the bar.
              // A solid total bar gets it only as a fallback when the bar is too short to
              // hold its label inside. A category stack anchors its SUM here — skipped only
              // when the "stack" is one lone segment already labelled inside (the sum would
              // print the same number twice in a row) or there's no room left before the
              // plot edge.
              total: {
                enabled: true,
                offsetX: 6,
                style: { fontSize: "11px", fontWeight: 600, color: outsideLabel },
                formatter: (val, opts) => {
                  if (!val || val <= 0) return "";
                  const text = fmtVal(val);
                  const globals = opts && opts.w && opts.w.globals;
                  const cats = catValsAt(opts);
                  if (cats.length === 0) return fitsInside(val, text, globals) ? "" : text;
                  if (cats.length === 1 && fitsInside(val, text, globals)) return "";
                  return fitsOutside(val, text, globals) ? text : "";
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
          // ANY segment too narrow for its text stays silent instead of bleeding into its
          // neighbours: a total bar falls back to the outside total label, a category
          // sliver to the stack-end sum and the per-segment tooltip.
          formatter: (val, opts) => {
            if (!val || val <= 0) return "";
            const text = fmtVal(val);
            return fitsInside(val, text, opts && opts.w && opts.w.globals) ? text : "";
          },
          style: { fontSize: "11px", fontWeight: 600, colors: ["#fff"] },
          dropShadow: { enabled: false },
        },
        xaxis: {
          categories,
          min: 0,
          max: axisMax,
          labels: { style: { colors: axisLabel, fontSize: "10px" } },
        },
        yaxis: { labels: { style: { colors: axisLabel, fontSize: "11px" } } },
        grid: { borderColor: grid, padding: { right: 28 } },
        legend: { show: false },
        // A press is a NAVIGATION here, not a selection: without this Apex dims
        // every other bar and leaves the pressed one latched, so the chart comes
        // back from a closed modal looking filtered by something the page has no
        // control for.
        states: { active: { filter: { type: "none" } } },
        annotations: {
          xaxis: [{ x: 50, borderColor: "#C8973F", strokeDashArray: 4 }],
        },
        tooltip: {
          theme: tipTheme,
          shared: false,
          intersect: true,
          y: { formatter: (v) => (unit === "hrs" ? hrsText(v) : `${Math.round(v)}${minLabel}`) },
        },
        theme: { mode: themeMode },
      };
    },
    [categories, axisMax, unit, minLabel, hrsLabel, unitDayLabel, unitHourLabel, unitMinLabel,
     catColors, themeMode, grid, axisLabel, tipTheme, outsideLabel],
  );

  return <ReactApexChart type="bar" series={series} options={options} height={height} />;
}
