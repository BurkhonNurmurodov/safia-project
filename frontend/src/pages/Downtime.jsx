import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker, { localISO } from "../components/ui/DateRangePicker";
import StyledSelect from "../components/ui/StyledSelect";
import DowntimeToggleChart from "../components/charts/DowntimeToggleChart";
import SeasonalityHeatmap from "../components/charts/SeasonalityHeatmap";
import KPICard from "../components/ui/KPICard";
import CategoryLegendModal from "../components/ui/CategoryLegendModal";
import UnitOjidaniyaModal from "../components/idle/UnitOjidaniyaModal";
import OjidaniyaMatrix from "../components/idle/OjidaniyaMatrix";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactory, useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtTime, fmtDuration } from "../utils/formatters";
import { useChartTheme } from "../hooks/useChartTheme";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import CategoryMatrix from "../components/idle/CategoryMatrix";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useAuth } from "../context/AuthContext";
import { padChartParams } from "../utils/chartRange";
import { Info, Layers, UserRound, Tag, FileSpreadsheet, Presentation, Table2 } from "lucide-react";
import { SectionHead } from "../components/ui/DataTable";
import { FilterPanel, PickFilter, OptsFilter } from "../components/ui/ColumnFilter";

// Downtime-category identity colors — the shared generic-first order, one hue
// per category index, shared by the merged bar chart, the doughnut and the chips.
import { catColor, CATS } from "../components/idle/categories";

// ── date helpers for the seasonality card's weekly axis ──────────────────────
// Local-calendar ISO stamps (never toISOString — that shifts UTC+5 back a day).
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
// Monday of the ISO week the date falls in — the weekly column key.
const weekStart = (s) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoLocal(d); };
const ddmm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
// The shift report speaks "DD.MM.YYYY"; the pickers and week keys speak ISO.
const isoOfDmy = (s) => { const [d, m, y] = (s || "").split("."); return `${y}-${m}-${d}`; };

// Category × column minutes → the heatmap's percent matrix. Rows are the
// categories that actually occur, biggest share first (as in the reference
// grid); each cell is that category's share of ITS OWN column, so a column
// always adds up to 100%.
const seasonMatrix = (labels, colTotals, catCol) => {
  const n = labels.length;
  const sum = (a) => (a || []).reduce((s, v) => s + (v || 0), 0);
  const cats = Object.keys(catCol)
    .filter((c) => sum(catCol[c]) > 0)
    .sort((a, b) => sum(catCol[b]) - sum(catCol[a]));
  const matrix = cats.map((c) => ({
    k: c,
    data: Array.from({ length: n }, (_, i) =>
      colTotals[i] ? Math.round(((catCol[c][i] || 0) / colTotals[i]) * 1000) / 10 : 0),
  }));
  return { labels, colTotals, matrix };
};

export default function Downtime() {
  const { params, unit, ready, dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { factory } = useFactory();
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const { chartTheme, gridColor, labelColor, tooltipTheme } = useChartTheme();
  // Page tabs: every shift-report category is a column PAIR — the wait stopped the
  // cell («тўхтаганда») or it did not («тўхтамаганда»). One fetch carries both
  // halves, so the tab only swaps which fields the whole page reads; filters, the
  // 50-min threshold and the doughnut selection are shared across both.
  // ── Page VIEW tabs (row 1) — two questions about one register ──────────
  // «Tahlil» is the page as it was. «Toifalar bo'yicha» is the category ×
  // date matrix, whose figure is the per-cell average and NOT the weighted
  // mean charted here (see components/idle/CategoryMatrix). Every filter and
  // both toggles below narrow BOTH views; only the period control differs,
  // because a matrix is selected a month at a time.
  const [view, setView] = usePersistentState("downtime_view", "analysis"); // "analysis" | "percat"
  const percat = view === "percat";
  // The matrix keeps its OWN period, so switching views never silently
  // rewrites the range the other one was read at.
  const [monthKey, setMonthKey] = usePersistentState(
    "downtime_month", localISO(new Date()).slice(0, 7));
  const [tab, setTab] = usePersistentState("downtime_tab", "stopped"); // "stopped" | "notStopped"
  const ns = tab === "notStopped";
  // Second axis, orthogonal to the halves above: WHICH categories count.
  // «загрузкада» (default) = only the categories the загрузка KPIs count, i.e.
  // the endpoint's kpi_only view; «hammasi» = every category the shift report
  // has, including the Ojidaniya-only ones (Cat H; Cat I joined the загрузка on
  // 2026-08-22). Server-side so the totals, flags and shares below stay
  // consistent with the picked scope.
  const [scope, setScope] = usePersistentState("downtime_scope", "zagruzka"); // "zagruzka" | "all"
  const kpiOnly = scope === "zagruzka";
  const totalKey   = ns ? "total_ns" : "total";
  const catKey     = ns ? "by_category_ns" : "by_category";
  const flaggedKey = ns ? "flagged_days_ns" : "flagged_days";
  const [chartView, setChartView] = usePersistentState("downtime_chart_view", "total"); // "total" | "category"
  const [selectedCats, setSelectedCats] = usePersistentState("downtime_selected_cats", []); // categories chosen via doughnut clicks → filter the left chart
  const [showCatGuide, setShowCatGuide] = useState(false); // doughnut info icon → category meanings modal
  // Which supervisor's bar was pressed — {managerId, managerName, cat}. `cat` is
  // set only when the press landed on a CATEGORY segment, so a reader who
  // pressed the yellow slice is answered about that category and not about the
  // whole unit. Deliberately NOT persisted: a modal that reopens itself on the
  // next visit is a state nobody asked for.
  const [detail, setDetail] = useState(null);
  // «Excel» on the toolbar — see onExport below.
  const [exporting, setExporting] = useState(false);

  // «Haftalik hisobot» — the PPTX deck. Admin only, and deliberately NOT
  // driven by the filters on screen: it is a fixed weekly report about one
  // plant, so the confirm writes its whole scope out before anything is built.
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const [deckAsk, setDeckAsk] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [deckErr, setDeckErr] = useState("");
  const { data: deckWin } = useQuery({
    queryKey: ["deck-window"],
    queryFn: () => api.get("/api/downtime/deck-window").then((r) => r.data),
    enabled: isAdmin,
    staleTime: 30 * 60 * 1000,
  });
  const toast = useToast();
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

  // The scope toggle rides in the query params, so each scope is its own cache
  // entry and flipping back is instant.
  // Every request on this page carries the active plant (see FactoryContext);
  // on «All factories» the key is absent and the calls are byte-identical to
  // what they were before factories existed.
  const fparams = useFactoryParams(params);
  // Plant switcher as a FilterPanel section (null on single-plant installs,
  // an inert chip for locked viewers).
  const factorySection = useFactorySection();
  const scopedParams = useMemo(
    () => (kpiOnly ? { ...fparams, kpi_only: 1 } : fparams),
    [fparams, kpiOnly]);
  const { data, isLoading } = useQuery({
    queryKey: ["downtime", scopedParams],
    queryFn: () => api.get("/api/downtime", { params: scopedParams }).then((r) => r.data),
    enabled: ready,
  });

  // Trend chart never spans fewer than 7 days: a short selection fetches a
  // window padded back to end-6d (same key = same request when no padding).
  const chartParams = useMemo(() => padChartParams(scopedParams), [scopedParams]);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["downtime", chartParams],
    queryFn: () => api.get("/api/downtime", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  // ── «Toifalar bo'yicha»: its own month, its own fetch ──────────────────
  // The month is clamped to today, so a month still running never opens
  // columns for days that have not happened — a reader would take an empty
  // future column for "nothing waited".
  const todayISO = useMemo(() => localISO(new Date()), []);
  const mFrom = `${monthKey}-01`;
  const mTo = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    const last = new Date(y, m, 0);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    return iso > todayISO ? todayISO : iso;
  }, [monthKey, todayISO]);
  // Same filter set as the page — plant, shift, brigadir — with the period
  // swapped for the month and the half/scope toggles riding along, so the
  // matrix can never total an event the page's own narrowings excluded.
  const matrixParams = useMemo(() => {
    const { date_from, date_to, ...rest } = fparams;
    return { ...rest, date_from: mFrom, date_to: mTo,
             stopped: ns ? 0 : 1, ...(kpiOnly ? { kpi_only: 1 } : {}) };
  }, [fparams, mFrom, mTo, ns, kpiOnly]);
  const { data: catMatrix, isLoading: catMatrixLoading } = useQuery({
    queryKey: ["downtime-matrix", matrixParams],
    queryFn: () => api.get("/api/downtime/matrix", { params: matrixParams }).then((r) => r.data),
    enabled: ready && percat,
  });

  // Full (period-independent) supervisor list for the inline picker — shares the
  // cache with the header Filters drawer so it's effectively free.
  const { data: allSupervisors = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
  });
  // Only the supervisors of the plant this tab is on — and if the currently
  // picked one isn't among them, the pick is dropped rather than left standing
  // over an empty page.
  const scopedSupervisors = useFactorySupervisors(
    allSupervisors, brigadirIds, setBrigadirIds);
  const supOptions = useMemo(
    () => [...scopedSupervisors]
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
      .map((b) => ({ value: String(b.manager_id), label: tl(b.name) })),
    [scopedSupervisors, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // The inline dropdown mirrors the global brigadir filter: a single pick maps to
  // one id, "All" clears it. A multi-select made in the drawer shows as "All".
  const supValue = brigadirIds.length === 1 ? String(brigadirIds[0]) : "All";

  // The active tab's numbers are normalised onto `total` / `flagged_days` and
  // re-sorted, so every consumer below (KPIs, bars, chart component) stays
  // tab-agnostic and the biggest brigadir still leads the bar chart on both tabs.
  const catNames    = data?.cat_names || [];
  // Narrowing the scope can drop a category the doughnut filter still holds
  // (picking Cat H, then switching to «загрузкада») — that would filter every
  // chart down to nothing. Prune the selection to the categories the loaded
  // scope actually has; never while the response is still in flight.
  const catKeyList = catNames.join("|");
  useEffect(() => {
    if (!catNames.length) return;
    setSelectedCats((prev) =>
      prev.every((c) => catNames.includes(c)) ? prev : prev.filter((c) => catNames.includes(c)));
  }, [catKeyList]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Toolbar multi-select mirror of that filter — same identity hue as the
  // doughnut slice, plus the category's meaning so the codes aren't a riddle.
  const catOptions = catNames.map((cat) => {
    const code = cat.replace(/^Cat\s*/i, "");
    const meaning = t(`downtime.cat.${code}.label`);
    const full = cat + (meaning && !meaning.startsWith("downtime.cat.") ? ` — ${meaning}` : "");
    return {
      value: cat,
      // Long meanings ellipsise inside the panel — `title` keeps the full text
      // reachable on hover.
      title: full,
      label: (
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 rounded-full"
            style={{ width: 8, height: 8, background: catColor(cat) }}
          />
          <span className="truncate">{full}</span>
        </span>
      ),
    };
  });

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
  // One hue per category, canonical and scope-independent (`catColor`): the
  // «загрузкада» toggle drops Cat H from this list, and a positional palette
  // would slide every category after it onto its neighbour's colour.
  const catHues = catNames.map(catColor);
  // Emphasise the selected slices by dimming the rest while a filter is active.
  const donutColors = filterActive
    ? catHues.map((c, i) => (selectedCats.includes(catNames[i]) ? c : `${c}33`))
    : catHues;
  // The centre counts whatever the doughnut is currently ABOUT. Desktop gets the
  // per-slice number from hover; a phone has no hover, so a selection that leaves
  // the fleet total sitting in the middle reads as "nothing happened" — the centre
  // must name the selection and total only it.
  const selectedTotal = catNames.reduce(
    (s, cat, i) => (selectedCats.includes(cat) ? s + catTotals[i] : s),
    0
  );
  const donutCenterLabel = filterActive
    ? (selectedCats.length === 1
        ? selectedCats[0]
        : `${selectedCats.length} ${t("filter.selected2")}`)
    : t("downtime.donutCenter");
  // Zero-minute categories keep their legend entry, but clicking one would only
  // strike through a slice that isn't drawn — make those labels inert. Legend
  // items are focusable buttons (tabindex + "press Enter to toggle" hint), so
  // pointer-events alone still leaves them keyboard-selectable.
  const inertZeroLegends = (ctx) => {
    ctx?.el?.querySelectorAll(".apexcharts-legend-series").forEach((el) => {
      if (catTotals[Number(el.getAttribute("rel")) - 1] > 0) return;
      el.style.pointerEvents = "none";
      el.setAttribute("tabindex", "-1");
      el.setAttribute("aria-disabled", "true");
      el.removeAttribute("role");
      el.removeAttribute("aria-pressed");
      el.removeAttribute("aria-label");
    });
  };
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
        mounted: inertZeroLegends,
        updated: inertZeroLegends,
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
            total: { show: true, label: donutCenterLabel, color: "var(--text-2, #6b7280)", fontSize: "11px", formatter: () => fmt(filterActive ? selectedTotal : totalDowntime) },
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
    ? (catColor(selectedCats[0]) || "#ef4444")
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

  // ── Seasonality: category × period share of the waiting minutes ────────────
  // Three resolutions on one grid. Monthly owns its own time axis, independent
  // of the page date range (which there only contributes the shift / supervisor
  // scope): the 12 calendar months of a chosen year, served pre-aggregated by
  // /api/downtime/seasonality so a whole year costs one small response instead
  // of ~11k daily rows. Daily and weekly bucket the page range itself — one
  // column per day / per ISO week — computed from the rows the page already
  // holds, so they cost nothing. The page tab decides which half
  // («тўхтаганда» / «тўхтамаганда») the shares are taken from.
  const [seasonMode, setSeasonMode] = usePersistentState("downtime_season_mode", "month"); // "day" | "week" | "month"
  const [seasonYear, setSeasonYear] = usePersistentState("downtime_season_year", null);

  // The seasonality grid keeps its own time axis but must obey the SAME plant
  // as everything above it — a year matrix from another factory under a factory
  // tab would be the worst kind of wrong: plausible.
  const seasonParams = useMemo(() => ({
    ...(shift ? { shift } : {}),
    ...(brigadirIds.length ? { manager_id: brigadirIds } : {}),
    ...(seasonYear ? { year: seasonYear } : {}),
    ...(kpiOnly ? { kpi_only: 1 } : {}),
    ...(factory == null ? {} : { factory }),
  }), [shift, brigadirIds, seasonYear, kpiOnly, factory]);
  const { data: seasonData, isLoading: seasonLoading } = useQuery({
    queryKey: ["downtime-season", seasonParams],
    queryFn: () => api.get("/api/downtime/seasonality", { params: seasonParams }).then((r) => r.data),
    enabled: ready && seasonMode === "month",
    staleTime: 300_000,
  });
  // Until the user picks, the year is the backend's own choice (this year when it
  // has reports, else the newest one that does) — shown, but never written back
  // into the params, so the first load stays a single request.
  const seasonYears = seasonData?.years || [];
  const seasonYearShown = seasonYear || (seasonData?.year != null ? String(seasonData.year) : "");

  const MONTHS = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === "en" ? "en" : "ru", { month: "short" });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2025, m, 1)).replace(".", ""));
  }, [lang]);

  const season = useMemo(() => {
    if (seasonMode === "month") {
      return seasonMatrix(
        MONTHS,
        (ns ? seasonData?.col_totals_ns : seasonData?.col_totals) || Array(12).fill(0),
        (ns ? seasonData?.by_category_ns : seasonData?.by_category) || {},
      );
    }
    // Daily / weekly: every day (resp. every Mon-start ISO week) in the page
    // range gets a column, including silent ones, so the axis reads as a
    // continuous timeline rather than a list of the days that reported.
    const step = seasonMode === "day" ? 1 : 7;
    const keys = [];
    const start = seasonMode === "day" ? dateFrom : weekStart(dateFrom);
    const end = seasonMode === "day" ? dateTo : weekStart(dateTo);
    for (let k = start; k <= end; k = addDays(k, step)) keys.push(k);
    const pos = new Map(keys.map((k, i) => [k, i]));
    const labels = keys.map((k) => (seasonMode === "day" ? ddmm(k) : `${ddmm(k)}–${ddmm(addDays(k, 6))}`));
    const bucket = (d) => (seasonMode === "day" ? d : weekStart(d));
    const colTotals = Array(labels.length).fill(0);
    const catCol = {};
    for (const r of data?.rows || []) {
      const c = pos.get(bucket(isoOfDmy(r.date)));
      if (c == null) continue;
      for (const [cat, val] of Object.entries(r[catKey] || {})) {
        const v = Number(val) || 0;
        (catCol[cat] || (catCol[cat] = Array(labels.length).fill(0)))[c] += v;
        colTotals[c] += v;
      }
    }
    return seasonMatrix(labels, colTotals, catCol);
  }, [seasonMode, seasonData, ns, catKey, data, dateFrom, dateTo, MONTHS]);

  // "Cat A — Xoladilnikdan mahsulot kutish" (plain code when untranslated).
  const catFull = (cat) => {
    const meaning = t(`downtime.cat.${cat.replace(/^Cat\s*/i, "")}.label`);
    return meaning && !meaning.startsWith("downtime.cat.") ? `${cat} — ${meaning}` : cat;
  };
  const seasonRows = season.matrix.map((s) => ({
    key: s.k,
    title: catFull(s.k),
    data: s.data,
    label: (
      <span className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: catColor(s.k) }} />
        <span className="truncate">{catFull(s.k)}</span>
      </span>
    ),
  }));

  // ── the bar you pressed, opened out ────────────────────────────────────────
  // The categories the DETAIL is about: a category segment names one, otherwise
  // whatever the page is filtered to. One list, read by the request, by the
  // per-date figure below and by the modal's own header — three spellings would
  // be three different answers to "what am I looking at".
  const detailCats = useMemo(
    () => (detail?.cat ? [detail.cat] : selectedCats),
    [detail, selectedCats],
  );
  // Every date the page has a row for this unit, newest first, each carrying the
  // figure the BAR counted for it. Taken from the page's own response rather
  // than recomputed: the unit's day is a headcount-weighted mean of its cells
  // (or, before the switch, a shift-report row), and a second derivation of it
  // is how the modal starts contradicting the chart it was opened out of.
  const detailDates = useMemo(() => {
    if (!detail) return [];
    return (data?.rows || [])
      .filter((r) => r.manager_id === detail.managerId)
      .map((r) => {
        const cat = r[catKey] || {};
        const narrowed = Object.fromEntries(
          Object.entries(cat).filter(([k]) => !detailCats.length || detailCats.includes(k)));
        return {
          iso: isoOfDmy(r.date),
          dmy: r.date,
          // With a category picked the bar shows those categories' minutes, so
          // the date must state the same thing the bar does.
          counted: detailCats.length
            ? Object.values(narrowed).reduce((a, b) => a + (Number(b) || 0), 0)
            : (r[totalKey] || 0),
          byCategory: narrowed,
        };
      })
      .sort((a, b) => b.iso.localeCompare(a.iso));
  }, [detail, data, catKey, totalKey, detailCats]);

  // ── «Brigadir × kun»: the workbook's «Kunlik» sheet, on the page ──────────
  // Columns are every calendar day of the period (`dates` carries the silent
  // ones too, which is what makes a blank cell mean «no report»); a cell is the
  // figure the BAR counted for that unit-day — with categories picked, the
  // picked categories' sum, otherwise the whole day — the same rule
  // `detailDates` above uses, so bars, matrix and modal state one thing.
  // Keyed by manager NAME because that is what the backend's `summary` merges
  // on: keying by id here would split a name two units answer to and the row
  // totals would stop matching the bar beside them.
  const matrix = useMemo(() => {
    const per = {};
    const fleetByDate = {};
    (data?.rows || []).forEach((r) => {
      const cat = r[catKey] || {};
      const v = selectedCats.length
        ? selectedCats.reduce((a, c) => a + (Number(cat[c]) || 0), 0)
        : (r[totalKey] || 0);
      const byDate = (per[r.manager_name] ||= {});
      byDate[r.date] = (byDate[r.date] || 0) + v;
      fleetByDate[r.date] = (fleetByDate[r.date] || 0) + v;
    });
    // The bar chart's order, not a second sort: the two cards sit one above the
    // other and must read top-to-bottom alike.
    const rows = summary.map((s) => {
      const byDate = per[s.manager_name] || {};
      return {
        key: s.manager_name,
        managerId: s.manager_id,
        name: tl(s.manager_name),
        shift: s.shift,
        byDate,
        // With a filter on, the row total is the sum of the cells ON SCREEN — a
        // stated total its own row does not add up to is worse than none.
        total: selectedCats.length
          ? Object.values(byDate).reduce((a, b) => a + b, 0)
          : s.total,
        flagged: (s.flagged_days || 0) > 0,
      };
    });
    return {
      rows,
      fleet: { byDate: fleetByDate, total: rows.reduce((a, r) => a + r.total, 0) },
    };
  }, [data, summary, catKey, totalKey, selectedCats, tl, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const detailScopeLine = [
    ns ? t("downtime.tabNotStopped") : t("downtime.tabStopped"),
    kpiOnly ? t("downtime.scopeZagruzka") : t("downtime.scopeAll"),
    detailCats.length ? detailCats.join(", ") : "",
  ].filter(Boolean).join(" · ");

  // ── «Excel»: the whole page as a report, under exactly the filters on screen ──
  // The server re-runs the page's own computation (`_downtime`, the same one
  // this page reads, and `_cell_detail`, the one the bar's modal reads) and
  // lays it out through services/ojidaniya_export.py — banner, scope strip,
  // KPI cards, the per-brigadir table with its bars, the category doughnut,
  // the brigadir × day matrix, the trend, the daily register, every event the
  // cells filed, and what each category means. What travels from here is the
  // SCOPE and the WORDS — the filter state, names in the viewer's alphabet, the
  // labels, each category's meaning and colour — never a number.
  // ── «Toifalar bo'yicha» → its own workbook ─────────────────────────────
  // The tab's own table, formatted. Scope + WORDS go up; every figure is
  // recomputed by `_downtime` + `ojidaniya_matrix.build`, the same pair the
  // tab reads, so the file and the screen state one month one way.
  const onExportMatrix = async () => {
    setExporting(true);
    try {
      const fmtD = (v) => (v ? v.split("-").reverse().join(".") : "");
      const monthTxt = `${t(`cal.m${Number(monthKey.split("-")[1]) - 1}`)} ${monthKey.split("-")[0]}`;
      const catMeta = {};
      CATS.forEach(({ name, code }) => {
        catMeta[name] = { label: t(`downtime.cat.${code}.label`), color: catColor(name) };
      });
      const names = {};
      allSupervisors.forEach((b) => { names[String(b.manager_id)] = tl(b.name); });
      const title = t("downtime.mx.xlTitle");
      const where = await exportXlsx("/api/downtime/matrix.xlsx", {
        body: {
          date_from: mFrom, date_to: mTo, shift, manager_id: brigadirIds, factory,
          stopped: !ns, kpi_only: kpiOnly, names, cat_meta: catMeta,
          title,
          subtitle: `${monthTxt} · ${fmtD(mFrom)} — ${fmtD(mTo)}`,
          filename: `${title} ${monthKey}.xlsx`,
          caption: `📊 ${title} · ${monthTxt}`,
          sheets: { matrix: t("downtime.mx.xlSheet") },
          meta: [
            { label: t("downtime.xl.period"), value: `${fmtD(mFrom)} — ${fmtD(mTo)}` },
            ...(factorySection ? [{
              label: t("downtime.xl.factory"),
              value: factorySection.active ? factorySection.display : t("factory.all"),
            }] : []),
            { label: t("filter.shift"), value: shift ? `S${shift}` : t("filter.all") },
            { label: t("downtime.xl.view"), value: ns ? t("downtime.tabNotStopped") : t("downtime.tabStopped") },
            { label: t("downtime.xl.scope"), value: kpiOnly ? t("downtime.scopeZagruzka") : t("downtime.scopeAll") },
            { label: t("downtime.xl.generated"), value: new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) },
          ],
          labels: {
            matrix: t("downtime.mx.title"),
            matrixSub: t("downtime.mx.explain"),
            catCol: t("downtime.mx.catCol"),
            total: t("downtime.mx.total"),
            grandRow: t("downtime.mx.total"),
            noData: "·",
            hidden: t("downtime.mx.hidden"),
          },
        },
        fallbackName: "ojidaniya-toifalar.xlsx",
      });
      toast.success(t(where === "download" ? "downtime.dt.downloaded" : "downtime.dt.sentToChat"));
    } catch (e) {
      const why = e?.response?.data?.detail;
      toast.error(typeof why === "string" && why
        ? `${t("downtime.dt.exportFailed")}: ${why}`
        : t("downtime.dt.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const fmtD = (s) => (s ? s.split("-").reverse().join(".") : "");
      const periodTxt = `${fmtD(dateFrom)} — ${fmtD(dateTo)}`;
      const supNames = brigadirIds.length
        ? brigadirIds.map((id) => supOptions.find((o) => o.value === String(id))?.label || `#${id}`).join(", ")
        : t("tasks.allSupervisors");
      const catMeta = {};
      CATS.forEach(({ name, code }) => {
        catMeta[name] = {
          label: t(`downtime.cat.${code}.label`),
          note: t(`downtime.cat.${code}.note`),
          color: catColor(name),
        };
      });
      const names = {};
      allSupervisors.forEach((b) => { names[String(b.manager_id)] = tl(b.name); });
      const title = t("downtime.xl.title");
      const where = await exportXlsx("/api/downtime/export.xlsx", {
        body: {
          date_from: dateFrom, date_to: dateTo, shift, manager_id: brigadirIds, factory,
          stopped: !ns, kpi_only: kpiOnly, cats: selectedCats,
          names, cat_meta: catMeta, cat_order: CATS.map((c) => c.name),
          title,
          subtitle: `${t("downtime.xl.subtitle")} · ${periodTxt}`,
          filename: `${title} ${fmtD(dateFrom)}-${fmtD(dateTo)}.xlsx`,
          caption: `📊 ${title} · ${periodTxt}`,
          sheets: {
            overview: t("downtime.xl.shOverview"), daily: t("downtime.xl.shDaily"),
            register: t("downtime.xl.shRegister"), events: t("downtime.xl.shEvents"),
            legend: t("downtime.xl.shLegend"),
          },
          // The scope the numbers were taken under, in the viewer's words — so a
          // forwarded file explains itself.
          meta: [
            { label: t("downtime.xl.period"), value: periodTxt },
            ...(factorySection ? [{
              label: t("downtime.xl.factory"),
              value: factorySection.active ? factorySection.display : t("factory.all"),
            }] : []),
            { label: t("filter.shift"), value: shift ? `S${shift}` : t("filter.all") },
            { label: t("tasks.colSupervisor"), value: supNames },
            { label: t("downtime.filterCat"), value: selectedCats.length ? selectedCats.join(", ") : t("downtime.allCats") },
            { label: t("downtime.xl.view"), value: ns ? t("downtime.tabNotStopped") : t("downtime.tabStopped") },
            { label: t("downtime.xl.scope"), value: kpiOnly ? t("downtime.scopeZagruzka") : t("downtime.scopeAll") },
            { label: t("downtime.xl.generated"), value: new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) },
          ],
          labels: {
            kpi: t("downtime.xl.kpi"),
            kpiTotal: t("downtime.totalDowntime"), kpiFlagged: t("downtime.flaggedDays"),
            kpiWorst: t("downtime.worstCategory"), kpiSups: t("downtime.xl.kpiSupervisors"),
            kpiDays: t("downtime.xl.kpiDays"), kpiAvg: t("downtime.xl.kpiAvg"),
            hintFlagged: t("downtime.xl.hintFlagged"), hintWorst: t("downtime.xl.hintWorst"),
            hintDays: t("downtime.xl.hintDays"), hintAvg: t("downtime.xl.hintAvg"), hintSups: t("downtime.xl.hintSups"),
            unitHour: t("general.unitHour"), unitMin: t("general.unitMin"),
            bySup: t("downtime.byBrigadir"), bySupSub: t("downtime.redSub"),
            supervisor: t("downtime.name"), shift: t("downtime.colShift"), totalMin: t("downtime.total"),
            hours: t("downtime.xl.hours"), days: t("downtime.days"), flaggedDays: t("downtime.xl.flaggedDays"),
            avgDay: t("downtime.xl.avgDay"), topCat: t("downtime.topCategory"), share: t("downtime.xl.share"),
            total: t("downtime.viewTotal"),
            catShare: t("downtime.catShare"), catShareSub: t("downtime.xl.catShareSub"),
            cat: t("downtime.filterCat"), catName: t("downtime.xl.catName"), catNote: t("downtime.xl.catNote"),
            minutes: t("idleCell.colMinutes"), counted: t("downtime.xl.counted"),
            yes: t("common.yes"), no: t("common.no"),
            matrix: t("downtime.xl.matrix"), matrixSub: t("downtime.xl.matrixSub"),
            fleetTotal: t("downtime.xl.fleetTotal"), trend: t("downtime.trend"), trendSub: t("downtime.trendSub"),
            threshold: t("downtime.threshold"), date: t("downtime.colDate"),
            register: t("downtime.detail"), rows: t("downtime.xl.rows"), flagged: t("downtime.flagged"),
            source: t("downtime.dt.colSource"), srcCells: t("downtime.dt.srcCells"), srcSheet: t("downtime.dt.srcSheet"),
            events: t("downtime.xl.events"), noEvents: t("downtime.xl.noEvents"),
            cell: t("downtime.dt.colCell"), leader: t("idleCell.leader"), start: t("idleCell.startTime"),
            end: t("idleCell.endTime"), status: t("idleCell.colStatus"),
            stoppedYes: t("idleCell.stopped"), stoppedNo: t("idleCell.notStopped"), note: t("idleCell.colNote"),
            legendTitle: t("downtime.catGuide"), legendSub: t("downtime.catGuideSub"),
          },
        },
        fallbackName: "ojidaniya.xlsx",
      });
      toast.success(t(where === "download" ? "downtime.dt.downloaded" : "downtime.dt.sentToChat"));
    } catch (e) {
      const why = e?.response?.data?.detail;
      toast.error(typeof why === "string" && why
        ? `${t("downtime.dt.exportFailed")}: ${why}`
        : t("downtime.dt.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  // ── «Haftalik hisobot»: the fixed weekly deck ───────────────────────────
  // Nothing on screen changes what this produces. The server owns the period
  // (services/report_week), the plant and the scope; the client sends nothing
  // but the press, so the confirm above it can state the whole thing and be
  // right. A Gemini failure does not fail the export — the deck arrives with
  // its commentary slots marked unavailable — so the only errors worth
  // wording here are the plant not resolving and the caller not being admin.
  const onDeck = async () => {
    setDeckBusy(true);
    setDeckErr("");
    try {
      const where = await exportXlsx("/api/downtime/export.pptx", {
        body: {},
        fallbackName: "haftalik-hisobot.pptx",
      });
      setDeckAsk(false);
      toast.success(t(where === "download" ? "downtime.deck.downloaded" : "downtime.deck.sentToChat"));
    } catch (e) {
      const why = e?.response?.data?.detail;
      setDeckErr(typeof why === "string" && why ? why : t("downtime.deck.failed"));
    } finally {
      setDeckBusy(false);
    }
  };

  const chartH = Math.max(300, summary.length * 28 + 60);

  // Selected-category chips (doughnut filter) — shared by the bar-chart and trend headers.
  const catChips = filterActive ? (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {selectedCats.map((cat) => {
        const c = catColor(cat) || "#888";
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
      {/* ROW 1 — page VIEW tabs. Above the filters because every filter below
          narrows BOTH views: this switches which question is being asked of
          one register, not which rows are in it. */}
      <div className="flex items-center mb-3">
        <SegmentedToggle
          asTabs
          value={view}
          onChange={setView}
          options={[
            ["analysis", t("downtime.viewAnalysis")],
            ["percat", t("downtime.viewPerCat")],
          ]}
        />
      </div>

      {/* ONE-ROW filter bar: period inline; plant / shift / supervisor / category
          live inside the shared FilterPanel and surface as chips when active. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* A matrix is read a month at a time, so this view selects a whole
            month — the SAME template in `month` mode, never a second control.
            It writes the tab's own month key, so the Analysis period is not
            rewritten behind the reader's back. */}
        {percat ? (
          <DateRangePicker
            month
            dateFrom={mFrom}
            dateTo={mTo}
            setDateFrom={(iso) => setMonthKey(String(iso).slice(0, 7))}
            setDateTo={() => {}}
            max={todayISO}
            triggerClassName="px-3 py-2 text-sm"
          />
        ) : (
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            compactLabel
            triggerClassName="px-3 py-2 text-sm"
          />
        )}
        <FilterPanel
          sections={[
            ...(factorySection ? [factorySection] : []),
            {
              key: "shift", icon: Layers, label: t("filter.shift"),
              active: shift != null,
              display: shift != null ? `S${shift}` : "",
              onClear: () => setShift(null),
              render: () => (
                <SegmentedToggle
                  fill
                  value={shift}
                  onChange={setShift}
                  options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
                />
              ),
            },
            {
              key: "supervisor", icon: UserRound, label: t("tasks.colSupervisor"),
              active: supValue !== "All",
              display: supValue !== "All" ? (supOptions.find((o) => o.value === supValue)?.label || "") : "",
              onClear: () => setBrigadirIds([]),
              render: ({ close } = {}) => (
                <PickFilter
                  searchable
                  close={close}
                  opts={[{ value: "All", label: t("tasks.allSupervisors") }, ...supOptions]}
                  value={supValue}
                  onChange={(v) => setBrigadirIds(v === "All" ? [] : [Number(v)])}
                />
              ),
            },
            {
              // Same selection the doughnut drives — tick several at once here.
              key: "cats", icon: Tag, label: t("downtime.filterCat"),
              active: selectedCats.length > 0,
              display: selectedCats.length === 1 ? selectedCats[0] : `${selectedCats.length} ${t("filter.selected2")}`,
              onClear: clearCats,
              render: () => (
                <OptsFilter
                  opts={catOptions.map((o) => o.value)}
                  sel={selectedCats}
                  onChange={setSelectedCats}
                  render={(v) => catOptions.find((o) => o.value === v)?.title || v}
                />
              ),
            },
          ]}
        />
        {/* The whole page as a report, under exactly the filters on screen —
            last on the row so it sits at the toolbar's right edge. A DIRECT
            child of the row on purpose: FilterPanel's fit check measures the
            row's children, and this button is one of them. Icon only on a
            phone, where the row has no room for a word. */}
        <Button
          size="lg"
          variant="secondary"
          className="ml-auto"
          loading={exporting}
          disabled={percat ? (catMatrixLoading || !(catMatrix?.cats || []).length)
                           : (isLoading || !summary.length)}
          icon={!exporting ? <FileSpreadsheet size={14} /> : null}
          onClick={percat ? onExportMatrix : onExport}
          title={t("downtime.dt.export")}
          aria-label={t("downtime.dt.export")}
        >
          <span className="hidden sm:inline">{t("downtime.dt.export")}</span>
        </Button>
        {/* The weekly deck. Admin only — it covers the whole plant, which this
            page deliberately withholds from a supervisor. It is NOT filtered
            by the toolbar beside it, so it never renders without its confirm:
            pressing «Excel» and pressing this one produce reports about
            different periods and different scopes, and only the dialog says so. */}
        {isAdmin && !percat && (
          <Button
            size="lg"
            variant="secondary"
            loading={deckBusy}
            icon={!deckBusy ? <Presentation size={14} /> : null}
            onClick={() => { setDeckErr(""); setDeckAsk(true); }}
            title={t("downtime.deck.btn")}
            aria-label={t("downtime.deck.btn")}
          >
            <span className="hidden lg:inline">{t("downtime.deck.btn")}</span>
          </Button>
        )}
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
        {/* Which categories count — the загрузка KPI set (default) or every
            category the shift report carries. */}
        <div className="overflow-x-auto">
          <SegmentedToggle
            value={scope}
            onChange={setScope}
            options={[
              { value: "zagruzka", label: t("downtime.scopeZagruzka"), title: t("downtime.scopeZagruzkaSub") },
              { value: "all", label: t("downtime.scopeAll"), title: t("downtime.scopeAllSub") },
            ]}
          />
        </div>
        <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
          {ns ? t("downtime.tabNotStoppedSub") : t("downtime.tabStoppedSub")}
          {" · "}
          {kpiOnly ? t("downtime.scopeZagruzkaSub") : t("downtime.scopeAllSub")}
        </span>
      </div>

      {/* ── «Toifalar bo'yicha»: the matrix, and NOTHING else ────────────────
          No KPI cards and no charts, deliberately. «Jami ojidaniya» on those
          cards is the UNION figure; this table's total is the sum of the
          category rows — per-category minutes overlap, so it is the larger of
          two different measures. One above the other, they read as a bug. */}
      {percat ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden mb-6">
          <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 flex-wrap">
              <SectionHead icon={Table2} title={t("downtime.mx.title")} />
              <span className="ml-auto flex items-baseline gap-2">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                  {t("downtime.mx.grandLabel")}
                </span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                  {catMatrixLoading ? "—" : `${(catMatrix?.grand ?? 0).toFixed(1)} ${t("general.min")}`}
                </span>
              </span>
            </div>
            {/* The figure is unusual, so the card states what a cell IS before
                anybody reads one. */}
            <p className="mt-2 text-[12px] max-w-[78ch]" style={{ color: "var(--text-3)" }}>
              {t("downtime.mx.explain")}
            </p>
          </div>
          <CategoryMatrix
            data={catMatrix}
            loading={catMatrixLoading}
            monthLabel={catMatrix?.supervisors
              ? t("downtime.mx.supCount").replace("{n}", String(catMatrix.supervisors))
              : ""}
          />
        </div>
      ) : (
      <>

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
              catColors={catHues}
              chartTheme={chartTheme}
              gridColor={gridColor}
              labelColor={labelColor}
              tooltipTheme={tooltipTheme}
              onPick={(row, catIdx) => {
                const s = summary[row];
                if (!s?.manager_id) return;
                setDetail({
                  managerId: s.manager_id,
                  managerName: s.manager_name,
                  cat: catIdx == null ? null : (catNames[catIdx] || null),
                });
              }}
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

      {/* «Brigadir × kun» — the register as a matrix, exactly as the workbook's
          «Kunlik» sheet lays it out. Sits between the bars it breaks down and
          the trend its fleet row is drawn from — the sheet's own order. */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
            {t("downtime.xl.matrix")}
          </div>
          {catChips}
        </div>
        {/* The legend the workbook prints under the same title — the words are
            shared on purpose, so the file and the screen name one table alike. */}
        <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
          {t("downtime.xl.matrixSub")}
        </div>
        {isLoading ? (
          <SkeletonChart className="h-64" />
        ) : matrix.rows.length ? (
          <OjidaniyaMatrix
            dates={data?.dates || []}
            rows={matrix.rows}
            fleet={matrix.fleet}
            /* A press on a CELL names the day it landed on, so the modal
               opens ON that date instead of the newest one; a press on the
               identity columns names none, i.e. the whole period. */
            onPick={(r, d) => setDetail({
              managerId: r.managerId, managerName: r.key, cat: null,
              date: d ? isoOfDmy(d) : null,
            })}
          />
        ) : (
          <EmptyState title={t("downtime.noData")} message={t("downtime.noDataMsg")} height="h-32" />
        )}
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

      {/* Seasonality — category × day / ISO week / month share of the waiting
          minutes, on the shared SeasonalityHeatmap grid. */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
            {t("downtime.season")}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {seasonMode === "month" && seasonYears.length > 0 && (
              <StyledSelect
                value={seasonYearShown}
                onChange={setSeasonYear}
                options={seasonYears.map((y) => ({ value: String(y), label: String(y) }))}
                triggerClassName="px-2.5 py-1.5 text-xs"
              />
            )}
            <SegmentedToggle
              size="sm"
              value={seasonMode}
              onChange={setSeasonMode}
              options={[
                ["day", t("downtime.seasonDay")],
                ["week", t("downtime.seasonWeek")],
                ["month", t("downtime.seasonMonth")],
              ]}
            />
          </div>
        </div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
          {seasonMode === "day" ? t("downtime.seasonSubDay")
            : seasonMode === "week" ? t("downtime.seasonSubWeek")
              : t("downtime.seasonSub")}
        </div>
        {(seasonMode === "month" ? seasonLoading : isLoading) ? (
          <SkeletonChart className="h-64" />
        ) : seasonRows.length ? (
          <SeasonalityHeatmap
            labels={season.labels}
            colTotals={season.colTotals}
            rows={seasonRows}
            firstColLabel={t("downtime.filterCat")}
            firstColWidth={190}
            // 12 VISIBLE data columns: a longer axis (a month of days) starts its
            // 13th column off-screen and scrolls, a shorter one pads with blanks,
            // so the card never resizes between modes.
            cols={12}
            colWidth={seasonMode === "week" ? 104 : seasonMode === "day" ? 74 : 96}
            scrollToEnd={seasonMode !== "month"}
          />
        ) : (
          <EmptyState title={t("downtime.noCatData")} message={t("downtime.noDataMsg")} height="h-32" />
        )}
      </div>
      </>
      )}

      {showCatGuide && (
        <CategoryLegendModal
          catNames={catNames}
          catColors={catHues}
          onClose={() => setShowCatGuide(false)}
        />
      )}

      {/* What one supervisor's bar is made of — date by date, cell by cell. */}
      {detail && (
        <UnitOjidaniyaModal
          /* Keyed on what was pressed: the modal decides which date it opens on
             at mount, so a second press must arrive as a new mount. */
          key={`${detail.managerId}|${detail.date || ""}|${detail.cat || ""}`}
          open
          onClose={() => setDetail(null)}
          managerId={detail.managerId}
          managerName={detail.managerName}
          dates={detailDates}
          stopped={!ns}
          kpiOnly={kpiOnly}
          cats={detailCats}
          factory={factory}
          dateFrom={dateFrom}
          dateTo={dateTo}
          fmt={fmt}
          scopeLine={detailScopeLine}
          openDate={detail.date || null}
        />
      )}
      {/* The weekly deck's confirm. It exists because this button ignores the
          toolbar it sits on: an admin who has narrowed the page to one
          brigadir and one day would otherwise press it and get a whole-plant
          file about a different week, with nothing having said so. The period
          comes from the server (GET /downtime/deck-window), never from a
          second copy of the rule in the browser. */}
      {deckAsk && (
        <ConfirmDialog
          open
          tone="warning"
          icon={<Presentation size={18} />}
          title={t("downtime.deck.title")}
          message={
            <div className="space-y-2 text-sm">
              <p style={{ color: "var(--text-2)" }}>{t("downtime.deck.intro")}</p>
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
              >
                {[
                  [t("downtime.deck.rowPeriod"), deckWin?.label || "…"],
                  [t("downtime.deck.rowFactory"), deckWin?.factory || "…"],
                  [t("downtime.deck.rowShift"), t("downtime.deck.bothShifts")],
                  // The deck reads the ЗАГРУЗКА scope (DECK_KPI_ONLY on the
                  // backend), so this row names that and not «all categories»:
                  // the confirm exists to write the scope out, and a scope
                  // stated wrongly is worse than one not stated at all.
                  [t("downtime.deck.rowCats"), t("downtime.scopeZagruzka")],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>{k}</span>
                    <span className="text-xs font-medium text-right" style={{ color: "var(--text-1)" }}>{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("downtime.deck.ignoresFilters")}</p>
              <p className="text-xs" style={{ color: "var(--text-4)" }}>{t("downtime.deck.aiNote")}</p>
            </div>
          }
          confirmLabel={t("downtime.deck.confirm")}
          loading={deckBusy}
          error={deckErr || null}
          onCancel={() => { if (!deckBusy) { setDeckAsk(false); setDeckErr(""); } }}
          onConfirm={onDeck}
        />
      )}
      {toast.node}
    </Layout>
  );
}
