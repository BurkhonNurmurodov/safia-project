import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import StyledSelect from "../components/ui/StyledSelect";
import DowntimeToggleChart from "../components/charts/DowntimeToggleChart";
import KPICard from "../components/ui/KPICard";
import CategoryLegendModal from "../components/ui/CategoryLegendModal";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtTime, fmtDuration } from "../utils/formatters";
import { useChartTheme } from "../hooks/useChartTheme";
import api from "../utils/api";
import { padChartParams } from "../utils/chartRange";
import { Info } from "lucide-react";

const INDIGO = "#6366f1";
// Cat D3 now uses indigo (was golden #C8973F) — shared by the merged bar chart and the doughnut
const CAT_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4", INDIGO, "#a78bfa","#ec4899","#14b8a6"];

export default function Downtime() {
  const { params, unit, ready, dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const { chartTheme, gridColor, labelColor, tooltipTheme } = useChartTheme();
  // Page tabs: every shift-report category is a column PAIR — the wait stopped the
  // cell («тўхтаганда») or it did not («тўхтамаганда»). One fetch carries both
  // halves, so the tab only swaps which fields the whole page reads; filters, the
  // 50-min threshold and the doughnut selection are shared across both.
  const [tab, setTab] = useState("stopped"); // "stopped" | "notStopped"
  const ns = tab === "notStopped";
  const totalKey   = ns ? "total_ns" : "total";
  const catKey     = ns ? "by_category_ns" : "by_category";
  const flaggedKey = ns ? "flagged_days_ns" : "flagged_days";
  const [chartView, setChartView] = useState("total"); // "total" | "category"
  const [selectedCats, setSelectedCats] = useState([]); // categories chosen via doughnut clicks → filter the left chart
  const [showCatGuide, setShowCatGuide] = useState(false); // doughnut info icon → category meanings modal
  const minLabel = t("general.min");
  const hrsLabel = t("general.hrs");
  // Waiting times here are routinely single-digit minutes, where fractional
  // hours collapse: at one decimal every 0.1 is a 6-minute bucket, so 3 min and
  // 8 min both render "0.1 soat" and two very different slices read identical.
  // The hrs unit therefore renders a compound span ("8 daq", "1 soat 35 daq").
  // Minutes mode is unchanged — it never had the collision.
  const durLabels = { day: t("general.unitDay"), hour: t("general.unitHour"), min: t("general.unitMin") };
  const fmtHrs = (v) => fmtDuration(v, durLabels);
  const fmt = (v, d = 1) => (unit === "hrs" ? fmtHrs(v) : fmtTime(v, unit, d, minLabel, hrsLabel));

  const { data, isLoading } = useQuery({
    queryKey: ["downtime", params],
    queryFn: () => api.get("/api/downtime", { params }).then((r) => r.data),
    enabled: ready,
  });

  // Trend chart never spans fewer than 7 days: a short selection fetches a
  // window padded back to end-6d (same key = same request when no padding).
  const chartParams = useMemo(() => padChartParams(params), [params]);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["downtime", chartParams],
    queryFn: () => api.get("/api/downtime", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  // Full (period-independent) supervisor list for the inline picker — shares the
  // cache with the header Filters drawer so it's effectively free.
  const { data: allSupervisors = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
  });
  const supOptions = useMemo(
    () => [...allSupervisors]
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
      .map((b) => ({ value: String(b.manager_id), label: tl(b.name) })),
    [allSupervisors, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // The inline dropdown mirrors the global brigadir filter: a single pick maps to
  // one id, "All" clears it. A multi-select made in the drawer shows as "All".
  const supValue = brigadirIds.length === 1 ? String(brigadirIds[0]) : "All";

  // The active tab's numbers are normalised onto `total` / `flagged_days` and
  // re-sorted, so every consumer below (KPIs, bars, chart component) stays
  // tab-agnostic and the biggest brigadir still leads the bar chart on both tabs.
  const catNames    = data?.cat_names || [];
  const summary = useMemo(
    () => (data?.summary || [])
      .map((s) => ({ ...s, total: s[totalKey] || 0, flagged_days: s[flaggedKey] || 0 }))
      .sort((a, b) => b.total - a.total),
    [data, totalKey, flaggedKey],
  );
  const flaggedCount  = summary.filter((s) => s.flagged_days > 0).length;
  const totalDowntime = summary.reduce((s, m) => s + m.total, 0);
  const mostAffectedCat = (() => {
    if (!data?.rows?.length || !catNames.length) return "—";
    const totals = {};
    catNames.forEach((c) => { totals[c] = 0; });
    data.rows.forEach((r) => {
      catNames.forEach((c) => { totals[c] = (totals[c] || 0) + (r[catKey]?.[c] || 0); });
    });
    // An all-zero half (e.g. before the first sync fills «тўхтамаганда») has no
    // "most affected" category — don't crown Cat A on a tie of zeros.
    const [topCat, topVal] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || [];
    return topVal > 0 ? topCat : "—";
  })();
  // Worst-category KPI tooltip: the generic explanation + what THIS category means.
  const worstCatTip = (() => {
    if (mostAffectedCat === "—") return t("downtime.tip.worst");
    const code = mostAffectedCat.replace(/^Cat\s*/i, "");
    return `${t("downtime.tip.worst")}\n\n${mostAffectedCat} — ${t(`downtime.cat.${code}.label`)}\n${t(`downtime.cat.${code}.note`)}`;
  })();

  // ── Merged bar chart: one persistent stacked instance that MORPHS between states ──
  // The "Total" view is modelled as two zero-or-value series (above / below the 50-min
  // threshold) so each total bar keeps its threshold colour (red / indigo) while living
  // in the same stacked chart as the category segments. The series array keeps a fixed
  // shape ([over, under, ...categories]); only the *values* change, so ApexCharts tweens
  // smoothly between every state (total ⇄ categories ⇄ filtered-to-selected-categories).
  const catSeries = catNames.map((cat) => ({
    name: cat,
    data: summary.map((s) => {
      const rows = data?.rows?.filter((r) => r.manager_name === s.manager_name) || [];
      return rows.reduce((acc, r) => acc + (r[catKey]?.[cat] || 0), 0);
    }),
  }));
  const zeros = summary.map(() => 0);
  const totalLabel = t("downtime.viewTotal");

  // Doughnut-driven category filter (additive). While active, the left chart shows ONLY
  // the selected categories per brigadir and the Total/Categories toggle is hidden.
  const filterActive = selectedCats.length > 0;
  const toggleCat = (cat) =>
    setSelectedCats((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  const clearCats = () => setSelectedCats([]);

  const mergedSeries = filterActive
    ? [
        { name: totalLabel, data: zeros },
        { name: totalLabel, data: zeros },
        ...catSeries.map((s) => ({ name: s.name, data: selectedCats.includes(s.name) ? s.data : zeros })),
      ]
    : chartView === "total"
      ? [
          { name: totalLabel, data: summary.map((s) => (s.total > 50 ? s.total : 0)) },
          { name: totalLabel, data: summary.map((s) => (s.total > 50 ? 0 : s.total)) },
          ...catNames.map((cat) => ({ name: cat, data: zeros })),
        ]
      : [
          { name: totalLabel, data: zeros },
          { name: totalLabel, data: zeros },
          ...catSeries,
        ];

  // Doughnut: fleet-wide downtime share per category (click a slice → filter left chart)
  const catTotals = catNames.map((cat) =>
    Math.round((data?.rows || []).reduce((s, r) => s + (r[catKey]?.[cat] || 0), 0))
  );
  // Emphasise the selected slices by dimming the rest while a filter is active.
  const donutColors = filterActive
    ? CAT_COLORS.map((c, i) => (selectedCats.includes(catNames[i]) ? c : `${c}33`))
    : CAT_COLORS;
  const donutOptions = {
    chart: {
      type: "donut",
      background: "transparent",
      animations: { enabled: false },
      events: {
        dataPointSelection: (_e, _ctx, cfg) => {
          const cat = catNames[cfg.dataPointIndex];
          if (cat) toggleCat(cat);
        },
      },
    },
    labels: catNames,
    colors: donutColors,
    stroke: { width: 0 },
    legend: { position: "bottom", labels: { colors: "#9ca3af" }, fontSize: "11px", itemMargin: { horizontal: 6, vertical: 2 } },
    dataLabels: {
      enabled: true,
      formatter: (val) => val >= 4 ? `${val.toFixed(0)}%` : "",
      style: { fontSize: "10px", fontWeight: 600 },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: "66%",
          labels: {
            show: true,
            name: { color: "var(--text-2, #6b7280)", fontSize: "11px" },
            value: { color: "var(--text-1, #1f2937)", fontSize: "16px", fontWeight: 700, formatter: (val) => fmt(Number(val)) },
            total: { show: true, label: t("downtime.donutCenter"), color: "var(--text-2, #6b7280)", fontSize: "11px", formatter: () => fmt(totalDowntime) },
          },
        },
      },
    },
    states: { active: { filter: { type: "none" } } },
    tooltip: { theme: "dark", y: { formatter: (v) => fmt(v) } },
    theme: { mode: "dark" },
  };

  // Trend: fleet total downtime per day (padded ≥7-day window).
  // Dates arrive as "DD.MM.YYYY" strings, so a plain string sort mis-orders months
  // (01.07 before 27.06). Sort on a "YYYY-MM-DD" key to get true chronological order.
  const dmyKey = (s) => {
    const [d, m, y] = (s || "").split(".");
    return `${y || ""}-${m || ""}-${d || ""}`;
  };
  // The doughnut category filter drives this chart too: while active, each day
  // sums only the selected categories; otherwise the fleet total as usual.
  const trendMap = {};
  (chartData?.rows || []).forEach((r) => {
    if (!trendMap[r.date]) trendMap[r.date] = 0;
    trendMap[r.date] += filterActive
      ? selectedCats.reduce((s, c) => s + (r[catKey]?.[c] || 0), 0)
      : (r[totalKey] || 0);
  });
  const trendDates  = Object.keys(trendMap).sort((a, b) => dmyKey(a).localeCompare(dmyKey(b)));
  const trendValues = trendDates.map((d) => Math.round(trendMap[d]));
  const trendSeries = [{ name: filterActive ? selectedCats.join(" + ") : t("downtime.totalDowntime"), data: trendValues }];
  // Single selected category paints the line in its doughnut colour.
  const trendColor = selectedCats.length === 1
    ? (CAT_COLORS[catNames.indexOf(selectedCats[0])] || "#ef4444")
    : "#ef4444";
  // Headroom above the tallest point, snapped to a clean 50-min step so labels never clip.
  const trendMax = Math.ceil((Math.max(50, ...(trendValues.length ? trendValues : [0])) * 1.15) / 50) * 50;
  // Per-point label bubbles overlap into an unreadable smear on long ranges —
  // only draw them when every point has room (≤ 2 weeks); tooltips cover the rest.
  const showTrendLabels = trendDates.length <= 14;
  const trendOptions = {
    chart: {
      type: "area", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false, parentHeightOffset: 0,
      dropShadow: { enabled: true, top: 8, left: 0, blur: 8, color: trendColor, opacity: 0.18 },
    },
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 100] } },
    colors: [trendColor],
    markers: {
      size: showTrendLabels ? 4 : 0,
      colors: [trendColor],
      strokeColors: gridColor,
      strokeWidth: 2,
      hover: { size: 6 },
      // long ranges hide per-point dots; keep a single endpoint dot on the latest day
      discrete: !showTrendLabels && trendValues.length > 0
        ? [{ seriesIndex: 0, dataPointIndex: trendValues.length - 1, size: 5, fillColor: trendColor, strokeColor: "#fff", strokeWidth: 2 }]
        : [],
    },
    dataLabels: {
      enabled: showTrendLabels,
      formatter: (v) => unit === "hrs" ? fmtHrs(v) : `${Math.round(v)}${minLabel}`,
      style: { fontSize: "10px", fontWeight: 700 },
      background: { enabled: true, foreColor: "#fff", borderRadius: 4, padding: 4, borderWidth: 0, dropShadow: { enabled: false } },
      offsetY: -6,
    },
    xaxis: {
      categories: trendDates,
      axisBorder: { show: false },
      axisTicks: { color: gridColor },
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: -45, hideOverlappingLabels: true },
      tickAmount: Math.min(trendDates.length, 12),
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: labelColor, fontSize: "10px" },
        formatter: (v) => unit === "hrs" ? fmtHrs(v) : `${Math.round(v)}${minLabel}`,
      },
      min: 0,
      max: trendMax,
      forceNiceScale: true,
    },
    annotations: {
      yaxis: [{
        y: 50,
        borderColor: "#ef4444",
        strokeDashArray: 4,
        // offsetY drops the label below the dashed line: most days sit above the
        // 50-min threshold, so above-line placement covers the newest points.
        label: { text: t("downtime.threshold"), borderColor: "#ef4444", offsetY: 18, style: { color: "#fff", background: "#ef4444", fontSize: "10px", padding: { top: 2, bottom: 2, left: 4, right: 4 } } },
      }],
    },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { top: 8, right: 14, bottom: 0, left: 6 } },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => fmt(v) } },
    theme: chartTheme,
  };

  const chartH = Math.max(300, summary.length * 28 + 60);

  // Selected-category chips (doughnut filter) — shared by the bar-chart and trend headers.
  const catChips = filterActive ? (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {selectedCats.map((cat) => {
        const c = CAT_COLORS[catNames.indexOf(cat)] || "#888";
        return (
          <span
            key={cat}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
            {cat}
            <button
              onClick={() => toggleCat(cat)}
              className="ml-0.5 opacity-70 hover:opacity-100"
              style={{ fontSize: 12, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        onClick={clearCats}
        className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors"
        style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}
      >
        {t("filter.clear")}
      </button>
    </div>
  ) : null;

  // toggle segmented control
  const toggle = (
    <SegmentedToggle
      className="shrink-0"
      value={chartView}
      onChange={setChartView}
      options={[["total", t("downtime.viewTotal")], ["category", t("downtime.viewCategory")]]}
    />
  );

  return (
    <Layout title={t("downtime.title")}>
      {/* Inline period + shift + supervisor selectors — always visible, wired to
          the global filters so they stay in sync with the header Filters drawer. */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="sm:w-72">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.period")}</label>
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("filter.shift")}</label>
          <SegmentedToggle
            value={shift}
            onChange={setShift}
            options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
          />
        </div>
        <div className="sm:w-64 min-w-0">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.colSupervisor")}</label>
          <StyledSelect
            value={supValue}
            onChange={(v) => setBrigadirIds(v === "All" ? [] : [Number(v)])}
            options={[{ value: "All", label: t("tasks.allSupervisors") }, ...supOptions]}
            searchable
            searchPlaceholder={t("filter.searchBrigadirs")}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Page view tabs — «тўхтаганда» / «тўхтамаганда» halves of the same report.
          Sits under the filters (which apply to both) and above everything it drives. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
        <div className="overflow-x-auto">
          <SegmentedToggle
            value={tab}
            onChange={setTab}
            options={[["stopped", t("downtime.tabStopped")], ["notStopped", t("downtime.tabNotStopped")]]}
          />
        </div>
        <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
          {ns ? t("downtime.tabNotStoppedSub") : t("downtime.tabStoppedSub")}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("downtime.totalDowntime")}
              value={fmt(totalDowntime)}
              tooltip={t("downtime.tip.total")}
            />
            <KPICard
              label={t("downtime.flaggedDays")}
              value={flaggedCount}
              danger={flaggedCount > 0}
              tooltip={t("downtime.tip.flagged")}
            />
            <KPICard
              label={t("downtime.worstCategory")}
              value={mostAffectedCat}
              tooltip={worstCatTip}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
        {/* Merged bar chart with Total / Categories toggle */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
              {!filterActive && chartView === "category" ? t("downtime.breakdown") : t("downtime.byBrigadir")}
            </div>
            {filterActive ? catChips : toggle}
          </div>
          <div className="text-[10px] mb-3 min-h-[14px]" style={{ color: "var(--text-4)" }}>
            {!filterActive && chartView === "total" ? t("downtime.redSub") : ""}
          </div>
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : summary.length ? (
            <DowntimeToggleChart
              key="downtime-merged"
              series={mergedSeries}
              height={chartH}
              summary={summary}
              lang={lang}
              tl={tl}
              unit={unit}
              minLabel={minLabel}
              hrsLabel={hrsLabel}
              unitDayLabel={durLabels.day}
              unitHourLabel={durLabels.hour}
              unitMinLabel={durLabels.min}
              thresholdText={t("downtime.threshold")}
              catColors={CAT_COLORS}
              chartTheme={chartTheme}
              gridColor={gridColor}
              labelColor={labelColor}
              tooltipTheme={tooltipTheme}
            />
          ) : (
            <EmptyState title={t("downtime.noData")} message={t("downtime.noDataMsg")} />
          )}
        </div>

        {/* Doughnut: fleet category share (click slices → filter the left chart) */}
        <div className="lg:col-span-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
              {t("downtime.catShare")}
            </div>
            <button
              onClick={() => setShowCatGuide(true)}
              aria-label={t("downtime.catGuide")}
              title={t("downtime.catGuide")}
              className="flex-shrink-0 p-1 rounded-full transition-colors hover:bg-white/10"
              style={{ color: "var(--text-2)", border: "1px solid var(--border-md)" }}
            >
              <Info size={16} />
            </button>
          </div>
          <div className="text-[10px] mb-3 min-h-[14px]" style={{ color: "var(--text-4)" }}>
            {t("downtime.catShareSub")}
          </div>
          {isLoading ? (
            <SkeletonChart className="h-64" />
          ) : catTotals.some((v) => v > 0) ? (
            <ReactApexChart type="donut" series={catTotals} options={donutOptions} height={360} />
          ) : (
            <EmptyState title={t("downtime.noCatData")} message={t("downtime.noDataMsg")} />
          )}
        </div>
      </div>

      {/* Downtime trend over time */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
            {t("downtime.trend")}
          </div>
          {catChips}
        </div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
          {t("downtime.trendSub")}
        </div>
        {isLoading || chartLoading ? (
          <SkeletonChart className="h-80" />
        ) : trendDates.length > 0 ? (
          <ReactApexChart type="area" series={trendSeries} options={trendOptions} height={340} />
        ) : (
          <EmptyState title={t("downtime.noTrendData")} message={t("downtime.noDataMsg")} height="h-32" />
        )}
      </div>

      {showCatGuide && (
        <CategoryLegendModal
          catNames={catNames}
          catColors={CAT_COLORS}
          onClose={() => setShowCatGuide(false)}
        />
      )}
    </Layout>
  );
}
