import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, ChevronsUpDown, ChevronUp, ChevronDown, Layers, UserRound, Users } from "lucide-react";
import { SectionHead } from "../components/ui/DataTable";
import FormulaModal from "../components/ui/FormulaModal";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import StatusBadge from "../components/ui/StatusBadge";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import SearchInput from "../components/ui/SearchInput";
import DateRangePicker from "../components/ui/DateRangePicker";
import BarRankingChart from "../components/charts/BarChart";
import FleetLineChart, { FleetManagerPicker } from "../components/charts/FleetLineChart";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import AttendanceModal from "../components/ui/AttendanceModal";
import EmptyState from "../components/ui/EmptyState";
import Tooltip from "../components/ui/Tooltip";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { brigadirFilterSections, brigadirActiveCount } from "../components/ui/brigadirFilters";
import { SkeletonCard, SkeletonTable, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtPct, fmtTime } from "../utils/formatters";
import { diffStatus } from "../utils/segments";
import { utilNumbers, utilInputs, differenceNumbers, differenceInputs, differencePctNumbers, hcEquivNumbers, hcEquivInputs, avgWorkloadNumbers, rangeDays } from "../utils/formulas";
import { padChartParams } from "../utils/chartRange";
import { loadTone, TONE_HEX, activeBands } from "../utils/statusBands";
import useStatusBands from "../hooks/useStatusBands";
import useIsMobile from "../hooks/useIsMobile";
import { surnameInitial } from "../utils/personName";
import api from "../utils/api";

const INIT_FILTERS = {
  name: "", shifts: [], statuses: [],
  planned_min: "", planned_max: "",
  final_min: "", final_max: "",
  diff_min: "", diff_max: "",
  hc_min: "", hc_max: "",
  idle_min: "", idle_max: "",
};

function isFilterActive(f) {
  return !!(f.name || f.shifts.length || f.statuses.length ||
    f.planned_min || f.planned_max || f.final_min || f.final_max ||
    f.diff_min || f.diff_max || f.hc_min || f.hc_max || f.idle_min || f.idle_max);
}

// Difference-column unit switch — independent from the global min/hrs unit.
// Each option re-expresses the same Verifix-vs-production gap:
//   min/hrs → labor-time gap, % → share of Verifix reported time, hc → headcount gap.
const DIFF_UNITS = [["min", "min"], ["hrs", "hrs"], ["pct", "%"], ["hc", "HC"]];

// Final-workload paint: the platform's load bands (utils/statusBands — the
// admin-editable ≥90 green / 80–89 yellow / below red, judged on the whole
// percent printed), plus ONE case of this page's own: ≥105% is OVER CAPACITY
// and reads amber (the operator's call, 2026-10-03). The table, the ranking and
// the KPI card all read this one rule, so a figure wears one colour on the page.
const OVER_PCT = 105;
const OVER_HEX = "#f97316";
function workloadTone(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 100) >= OVER_PCT ? "over" : loadTone(v);
}
// Ink for text (theme-aware: 700 shades on light) and hex for a bar fill.
const toneInk = (tone) => (tone ? `var(--status-${tone})` : "var(--text-4)");
const toneHex = (tone) => (tone === "over" ? OVER_HEX : tone ? TONE_HEX[tone] : "#6b7280");
// A figure over capacity carries a ▲ as well as its colour: on light paper the
// amber ink sits close to the red, and colour must never be the only cue.
const fmtWorkload = (v) => (workloadTone(v) === "over" ? `▲ ${fmtPct(v)}` : fmtPct(v));

// Numeric value of the Difference cell in the chosen unit, or null when the
// inputs needed for that unit aren't present.
function diffValue(b, u) {
  if (u === "hc") {
    // HC = the hours gap expressed as full person-shifts (8 working hours = 1 HC).
    if (b.diff_hrs == null) return null;
    return b.diff_hrs / 8;
  }
  if (u === "pct") {
    if (b.verifix_labor == null || b.prod_actual == null || !b.verifix_labor) return null;
    return (b.verifix_labor - b.prod_actual) / b.verifix_labor * 100;
  }
  if (b.diff_hrs == null) return null;
  return u === "hrs" ? b.diff_hrs : b.diff_hrs * 60;
}

// Signed, unit-suffixed display string for the Difference cell.
// hcLabel is the localized name for the headcount unit (e.g. "Odam soni" in uz).
function fmtDiff(b, u, hcLabel = "HC") {
  const v = diffValue(b, u);
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  if (u === "hc")  return `${sign}${v.toFixed(1)}`;
  if (u === "pct") return `${sign}${v.toFixed(1)}%`;
  if (u === "hrs") return `${sign}${v.toFixed(1)} hrs`;
  return `${sign}${v.toFixed(0)} min`;
}

// Numeric/string accessors for each sortable column. Nulls sort to the bottom
// in ascending order (top in descending).
const SORT_ACCESSORS = {
  name:          b => (b.name || "").toLowerCase(),
  shift:         b => b.shift ?? -Infinity,
  baseline_util: b => b.baseline_util ?? -Infinity,
  net_util:      b => b.net_util ?? -Infinity,
  diff_hrs:      b => b.diff_hrs ?? -Infinity,
  official_hc:   b => b.official_hc ?? -Infinity,
  equip_downtime:b => b.equip_downtime ?? -Infinity,
  status:        b => b.status || "",
};

// Sortable column header: clickable label cycles asc → desc → off, with a
// per-column filter popover beside it.
function HeadCell({ label, tip, sortKey, sort, onSort, align = "right", className = "" }) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`py-2.5 ${className}`}>
      <span className={`inline-flex items-center gap-1 ${justify}`}>
        <button
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-0.5 select-none transition-colors hover:text-[var(--text-1)] ${align === "right" ? "text-right justify-end" : align === "center" ? "text-center" : "text-left"}`}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
        >
          {label}
          {/* On a phone the (i) is dropped (the KPI card above explains the
              figure) and the chevron shows only on the sorted column. */}
          {tip && <span className="max-sm:hidden inline-flex"><Tooltip text={tip} /></span>}
          <Icon size={9} className={isActive ? "" : "max-sm:hidden"} style={{ opacity: isActive ? 1 : 0.4 }} />
        </button>
      </span>
    </th>
  );
}

export default function Overview() {
  const { params, unit, ready, dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const hcLabel = t("overview.diffUnitHc"); // localized name for the HC (headcount) diff unit
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useStatusBands();
  // Stored blob merged over INIT_FILTERS so older saved shapes can't lose keys
  const [rawFilters, setFilters] = usePersistentState("overview_table_filters", INIT_FILTERS);
  const filters = useMemo(() => ({ ...INIT_FILTERS, ...rawFilters }), [rawFilters]);
  const [sort, setSort] = usePersistentState("overview_sort", { key: null, dir: "asc" }); // key=null → original order
  const [modal, setModal] = useState(null); // { managerId, dateFrom, dateTo, name }
  const [rankMode, setRankMode] = usePersistentState("overview_rank_mode", "actual"); // "planned" | "actual" | "diff"
  const [lineMode, setLineMode] = usePersistentState("overview_line_mode", "actual"); // "planned" | "actual" | "diff"
  // Fleet-trend picker state (lifted here so the card-header picker drives the
  // chart). Stored as an array (localStorage can't hold a Set), exposed as a Set.
  const [fleetSelArr, setFleetSelArr] = usePersistentState("overview_fleet_sel", []);
  const fleetSel = useMemo(() => new Set(fleetSelArr), [fleetSelArr]);
  const setFleetSel = (next) =>
    setFleetSelArr((prev) => Array.from(typeof next === "function" ? next(new Set(prev)) : next));
  const [fleetAvg, setFleetAvg] = usePersistentState("overview_fleet_avg", true);
  const toggleFleetManager = (name) => setFleetSel((prev) => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const [formulaModal, setFormulaModal] = useState(null);
  // Difference-column unit (min/hrs/%/HC). Independent from the global unit and
  // remembered per browser via localStorage (same `zf_` convention as FilterContext).
  const [diffUnit, setDiffUnitState] = useState(() => localStorage.getItem("zf_diff_unit") || "min");
  const setDiffUnit = (u) => {
    setDiffUnitState(u);
    if (u && u !== "min") localStorage.setItem("zf_diff_unit", u);
    else localStorage.removeItem("zf_diff_unit");
  };

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }));
  const activeFilter = isFilterActive(filters);
  // Click a header: cycle asc → desc → off
  const onSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: "asc" }
      : s.dir === "asc" ? { key, dir: "desc" }
      : { key: null, dir: "asc" });

  // Every request on this page carries the active plant (see FactoryContext);
  // on «All factories» the key is absent and the calls are byte-identical to
  // what they were before factories existed.
  const fparams = useFactoryParams(params);
  // Plant switcher as a FilterPanel section (null on single-plant installs,
  // an inert chip for locked viewers).
  const factorySection = useFactorySection();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", fparams],
    queryFn: () => api.get("/api/summary", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });

  const { data: brigadirs = [], isLoading } = useQuery({
    queryKey: ["brigadirs", fparams],
    queryFn: () => api.get("/api/brigadirs", { params: fparams }).then((r) => r.data),
    enabled: ready,
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

  // Fleet-trend window: never chart fewer than MIN_CHART_DAYS days — a short
  // selection is padded back (n..n+4 charts as n-2..n+4). KPIs/table above
  // keep the exact selected range. include_pending: uploaded-but-unclosed
  // days plot as (unconfirmed) points instead of leaving holes in the line.
  const chartParams = useMemo(() => ({ ...padChartParams(fparams), include_pending: 1 }), [fparams]);
  const { data: heatmap, isLoading: hmLoading } = useQuery({
    queryKey: ["heatmap", chartParams],
    queryFn: () => api.get("/api/heatmap", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  const { data: heatmapThresholds } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: compThresholds } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });

  // Status is derived from D = P − A (План − Итог), colored live by the admin
  // comparison thresholds — this overrides the backend's net_util-based status.
  const diffSegments = compThresholds?.diff_segments;
  const rows = useMemo(
    () => brigadirs.map(b => {
      const ds = diffStatus(b.baseline_util, b.net_util, diffSegments);
      return { ...b, status: ds.status, statusColor: ds.color };
    }),
    [brigadirs, diffSegments]);

  // Distinct option lists for the dropdown filters (from all rows, ignoring filters).
  const distinctShifts = useMemo(
    () => [...new Set(rows.map(b => b.shift).filter(s => s != null))].sort((a, b) => a - b),
    [rows]);
  const distinctStatuses = useMemo(
    () => [...new Set(rows.map(b => b.status).filter(Boolean))],
    [rows]);

  // Range filters compare against the values as displayed: % for utilization,
  // and the active unit (min/hrs) for Diff and Idle Time.
  const inRange = (val, min, max) => {
    if (min !== "" && (val == null || val < +min)) return false;
    if (max !== "" && (val == null || val > +max)) return false;
    return true;
  };

  const filtered = rows.filter((b) => {
    const f = filters;
    if (f.name) {
      const q = f.name.toLowerCase();
      // Match both the raw DB name and the displayed (transliterated/overridden)
      // name, so typing what you see on screen works even when names are stored
      // in Cyrillic but rendered in Latin.
      const match = (b.name || "").toLowerCase().includes(q)
                 || (tl(b.name) || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (f.shifts.length && !f.shifts.includes(b.shift)) return false;
    if (f.statuses.length && !f.statuses.includes(b.status)) return false;
    if (!inRange(b.baseline_util != null ? b.baseline_util * 100 : null, f.planned_min, f.planned_max)) return false;
    if (!inRange(b.net_util != null ? b.net_util * 100 : null, f.final_min, f.final_max)) return false;
    if (!inRange(diffValue(b, diffUnit), f.diff_min, f.diff_max)) return false;
    if (!inRange(b.official_hc, f.hc_min, f.hc_max)) return false;
    if (!inRange(b.equip_downtime != null ? (unit === "hrs" ? b.equip_downtime / 60 : b.equip_downtime) : null, f.idle_min, f.idle_max)) return false;
    return true;
  });

  function getRankVal(b) {
    if (rankMode === "planned") return b.baseline_util != null ? Math.round(b.baseline_util * 100) : 0;
    if (rankMode === "diff")    return (b.baseline_util != null && b.net_util != null)
                                       ? Math.round((b.baseline_util - b.net_util) * 100) : 0;
    return b.net_util != null ? Math.round(b.net_util * 100) : 0;
  }

  function diffColor(d) {
    if (d < -20) return "#3b82f6";
    if (d <= 0)  return "#22c55e";
    if (d <= 5)  return "#eab308";
    return "#ef4444";
  }

  // A brigadir with no figure for the mode is not ranked (never ranked as 0%,
  // which reads as the worst) — they are named under the chart instead.
  const hasRankVal = (b) => rankMode === "planned" ? b.baseline_util != null
    : rankMode === "diff" ? (b.baseline_util != null && b.net_util != null)
    : b.net_util != null;
  const unranked = filtered.filter((b) => !hasRankVal(b));
  // Sort ascending: lowest value at top across all modes
  const ranked = filtered.filter(hasRankVal).sort((a, b) => getRankVal(a) - getRankVal(b));
  const chartNames = ranked.map((b) => tl(b.name));
  const chartVals  = ranked.map((b) => getRankVal(b));
  const chartColors = rankMode === "diff"
    ? chartVals.map(diffColor)
    : chartVals.map((v) => toneHex(workloadTone(v / 100)));

  const RANK_LABELS = { planned: t("overview.rankPlanned"), actual: t("overview.rankActual"), diff: t("overview.rankDiff") };

  const displayedBrigadirs = sort.key
    ? [...filtered].sort((a, b) => {
        // The Diff column sorts by its currently-displayed unit (min/hrs/%/HC).
        // The Brigadir name sorts on the transliterated string actually shown,
        // so Latin mode follows the Latin alphabet (and Cyrillic the Cyrillic).
        const acc = sort.key === "diff_hrs"
          ? (x) => diffValue(x, diffUnit) ?? -Infinity
          : sort.key === "name"
          ? (x) => tl(x.name || "").toLowerCase()
          : SORT_ACCESSORS[sort.key];
        const av = acc(a), bv = acc(b);
        const r = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        return sort.dir === "asc" ? r : -r;
      })
    : filtered;
  const xMin = rankMode === "diff"
    ? (chartVals.length ? Math.min(...chartVals, -5) : -5)
    : 0;
  // For diff mode scale tightly to data; for others use a 110 floor
  const xMax = rankMode === "diff"
    ? (chartVals.length ? Math.max(...chartVals, 10) : 10)
    : undefined; // BarChart defaults to Math.max(values, 110)

  const n = brigadirs.filter(b => b.net_util !== null).length || 1;
  const fleetFunnel = {
    baseline_util:    brigadirs.reduce((s, b) => s + (b.baseline_util    || 0), 0) / n,
    adjusted_util:    brigadirs.reduce((s, b) => s + (b.adjusted_util    || 0), 0) / n,
    after_idle_util:  brigadirs.reduce((s, b) => s + (b.after_idle_util  || 0), 0) / n,
    after_early_util: brigadirs.reduce((s, b) => s + (b.after_early_util || 0), 0) / n,
    net_util:         brigadirs.reduce((s, b) => s + (b.net_util         || 0), 0) / n,
  };

  // Fleet idle time KPI: prefer the server's period total; fall back to summing
  // the per-supervisor downtime we already have so the card isn't empty pre-deploy.
  // Whole minutes (or hours to one decimal) with a grouped thousands separator:
  // a 7-day total to a tenth of a minute claims a precision nobody has.
  const fmtIdle = (v) => {
    if (v == null) return "—";
    const nf = (x, d) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
    return unit === "hrs"
      ? `${nf(v / 60, 1)} ${t("general.unitHour")}`
      : `${nf(Math.round(v), 0)} ${t("general.unitMin")}`;
  };
  const totalIdle = summary?.total_idle != null
    ? summary.total_idle
    : (brigadirs.length ? brigadirs.reduce((s, b) => s + (b.equip_downtime || 0), 0) : null);

  // Overview rows are averages over the selected range — formulas are only
  // approximate (≈) when more than one day is shown.
  const nDays     = rangeDays(params?.date_from, params?.date_to);
  const approx    = nDays > 1;
  const avgSuffix = approx ? ` — ${t("formula.avgOverDays").replace("{n}", nDays)}` : "";
  const avgNote   = approx ? `\n\n${t("formula.periodAvg")}` : "";

  // "How it's calculated" popup for a Difference cell, tailored to the active unit.
  function diffModal(b) {
    const title = `${t("overview.fm.diffTitle")}${avgSuffix}`;
    const value = fmtDiff(b, diffUnit, hcLabel);
    if (diffUnit === "hc") {
      return {
        title, value,
        formula: `${hcEquivNumbers(b, approx, hcLabel) || `${hcLabel} = Difference (hrs) ÷ 8`}\n${t("fm.hcEquivNote")}${avgNote}`,
        inputs: hcEquivInputs(b, t),
      };
    }
    if (diffUnit === "pct") {
      return {
        title, value,
        formula: `${differencePctNumbers(b, approx) || "Diff % = (Verifix Time − Labor hours) ÷ Verifix Time × 100"}\n${t("fm.diffPctNote")}${avgNote}`,
        inputs: differenceInputs(b, t),
      };
    }
    return {
      title, value,
      formula: `${differenceNumbers(b, approx) || "Diff = Verifix Time − Labor hours"}\n${t("fm.diffNote")}${avgNote}`,
      inputs: differenceInputs(b, t),
    };
  }

  // Difference-column unit switch (min/hrs/%/HC), shown in the table toolbar.
  // Independent from the global unit; hidden below md where the Diff column is too.
  const diffUnitToggle = (
    <div className="hidden md:flex items-center gap-2 flex-shrink-0">
      <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("overview.diff")}:</span>
      <SegmentedToggle
        value={diffUnit}
        onChange={setDiffUnit}
        options={DIFF_UNITS.map(([m, label]) => [m, m === "hc" ? hcLabel : label])}
      />
    </div>
  );

  return (
    <Layout title={t("overview.title")}>
      {/* ONE-ROW filter bar: period inline, plant / shift / supervisor inside the
          shared FilterPanel — active narrowings surface as chips. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          compactLabel
          triggerClassName="px-3 py-2 text-sm"
        />
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
          ]}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("overview.totalIdle")}
              value={fmtIdle(totalIdle)}
              tooltip={t("overview.tip.totalIdle")}
              onValueClick={() => setFormulaModal({
                title: t("overview.fm.idleTitle"),
                value: fmtIdle(totalIdle),
                formula: t("fm.idleSumFormula"),
                inputs: [{ label: t("overview.fm.idleTitle"), val: fmtIdle(totalIdle), source: t("overview.fm.srcEquip") }],
              })}
            />
            <KPICard
              label={t("overview.avgFinalWorkload")}
              value={fmtPct(summary?.avg_final_workload)}
              color={summary?.avg_final_workload != null ? toneInk(workloadTone(summary.avg_final_workload)) : undefined}
              tooltip={t("overview.tip.avgFinalWorkload")}
              onValueClick={() => setFormulaModal({
                title: t("overview.fm.avgWorkload"),
                value: fmtPct(summary?.avg_final_workload),
                formula: avgWorkloadNumbers(summary?.avg_final_workload, summary?.total_brigadirs)
                  || "avg_final_workload = Σ(net_util) ÷ N supervisors",
                inputs: [
                  { label: t("overview.fm.nSups"), val: String(summary?.total_brigadirs ?? "—") },
                  { label: t("overview.fm.resultAvg"), val: fmtPct(summary?.avg_final_workload) },
                ],
              })}
            />
            <KPICard
              label={t("overview.over100")}
              value={summary?.count_over_100 ?? "—"}
              tooltip={t("overview.tip.over100")}
              onValueClick={() => setFormulaModal({
                title: t("overview.fm.over100"),
                value: String(summary?.count_over_100 ?? "—"),
                formula: t("fm.over100Formula"),
                inputs: [
                  { label: t("overview.fm.supsOver100"), val: String(summary?.count_over_100 ?? "—") },
                  { label: t("overview.fm.totalSups"), val: String(summary?.total_brigadirs ?? "—") },
                ],
              })}
            />
            <KPICard
              label={t("overview.under90")}
              value={summary?.count_under_90 ?? "—"}
              color={summary?.count_under_90 > 0 ? "var(--status-bad)" : undefined}
              tooltip={t("overview.tip.under90")}
              onValueClick={() => setFormulaModal({
                title: t("overview.fm.under90"),
                value: String(summary?.count_under_90 ?? "—"),
                formula: t("fm.under90Formula"),
                inputs: [
                  { label: t("overview.fm.supsUnder90"), val: String(summary?.count_under_90 ?? "—") },
                  { label: t("overview.fm.totalSups"), val: String(summary?.total_brigadirs ?? "—") },
                ],
              })}
            />
          </>
        )}
      </div>

      {/* ── Fleet trend line chart ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        {/* One aligned header row: title/subtitle left, all controls grouped right
            (supervisor picker + P/A/P−A) — no floating filter pill below. */}
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("overview.fleetTrend")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {/* With nobody picked the chart draws the fleet AVERAGE alone, and
                  the subtitle says so instead of promising a line per brigadir. */}
              {t((fleetSel.size === 0 ? {
                planned: "overview.fleetTrendAvgPlanned", actual: "overview.fleetTrendAvgActual", diff: "overview.fleetTrendAvgDiff",
              } : {
                planned: "overview.fleetTrendPlanned", actual: "overview.fleetTrendActual", diff: "overview.fleetTrendDiff",
              })[lineMode])}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end max-sm:w-full max-sm:flex-col max-sm:items-stretch">
            {heatmap?.managers?.length > 0 && (
              // Phone: the picker opens its row from the left, like the toggle under it.
              <div className="max-sm:[&>div]:justify-start">
              <FleetManagerPicker
                managers={heatmap.managers}
                selected={fleetSel}
                onToggleManager={toggleFleetManager}
                showAvg={fleetAvg}
                onToggleAvg={() => setFleetAvg((v) => !v)}
                onClearAll={() => setFleetSel(new Set())}
              />
              </div>
            )}
            <SegmentedToggle
              className="flex-shrink-0"
              fill={isMobile}
              value={lineMode}
              onChange={setLineMode}
              // A phone has no hover to expand «P / A»: it spells them out.
              options={isMobile
                ? [["planned", t("profile.diff.planned")], ["actual", t("profile.diff.final")], ["diff", t("overview.diff")]]
                : [["planned", "P"], ["actual", "A"], ["diff", "P−A"]]}
            />
          </div>
        </div>
        {hmLoading ? (
          <SkeletonChart className="h-64" />
        ) : heatmap?.managers?.length ? (
          <FleetLineChart
            dates={heatmap.dates}
            managers={heatmap.managers}
            data={heatmap.data}
            mode={lineMode}
            height={300}
            selected={fleetSel}
            showAvg={fleetAvg}
            heatmapSegments={heatmapThresholds?.segments}
            diffSegments={compThresholds?.diff_segments}
          />
        ) : (
          <EmptyState title={t("overview.noTrend")} message={t("overview.noTrendMsg")} height="h-48" />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <SectionHead
            icon={Users}
            title={t("overview.tableTitle")}
            right={!isLoading && (
              <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-3)" }}>
                {filtered.length !== rows.length ? `${filtered.length} / ${rows.length}` : rows.length}
              </span>
            )}
          />
          {/* Toolbar contract: search grows on the left, filters in the middle,
              the unit toggle pinned right — one aligned row, no dead gap. */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
            <SearchInput
              value={filters.name}
              onChange={(v) => setF("name", v)}
              placeholder={t("overview.brigadir")}
              className="flex-1 min-w-[120px] sm:min-w-[150px]"
            />
            <FilterPanel
              sections={brigadirFilterSections({ filters, setF, distinctShifts, distinctStatuses, t, includeName: false })}
              activeCount={brigadirActiveCount(filters) - (filters.name ? 1 : 0)}
              anyActive={activeFilter}
              onClearAll={() => setFilters(INIT_FILTERS)}
            />
            {/* Difference-column unit switch (independent from the global unit). */}
            {diffUnitToggle}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
                  <th className="text-left px-4 max-sm:px-3 py-2.5">#</th>
                  <HeadCell label={t("overview.brigadir")} sortKey="name" sort={sort} onSort={onSort}
                    align="left" className="text-left px-2" />
                  <HeadCell label={t("overview.shift")} sortKey="shift" sort={sort} onSort={onSort}
                    align="center" className="text-center px-2 hidden sm:table-cell" />
                  <HeadCell label={t("overview.planned")} tip={t("overview.tip.planned")} sortKey="baseline_util" sort={sort} onSort={onSort}
                    align="right" className="text-right px-2 hidden md:table-cell" />
                  <HeadCell label={t("overview.finalWorkload")} tip={t("overview.tip.finalWorkload")} sortKey="net_util" sort={sort} onSort={onSort}
                    align="right" className="text-right px-2" />
                  <HeadCell label={t("overview.diff")} tip={t("overview.tip.diff")} sortKey="diff_hrs" sort={sort} onSort={onSort}
                    align="right" className="text-right px-2 hidden md:table-cell" />
                  <HeadCell label={t("overview.headcount")} tip={t("overview.tip.headcount")} sortKey="official_hc" sort={sort} onSort={onSort}
                    align="right" className="text-right px-2 hidden md:table-cell" />
                  <HeadCell label={t("overview.idleTime")} sortKey="equip_downtime" sort={sort} onSort={onSort}
                    align="right" className="text-right px-2 hidden md:table-cell" />
                  <HeadCell label={t("overview.status")} sortKey="status" sort={sort} onSort={onSort}
                    align="center" className="text-center px-2 hidden sm:table-cell" />
                  <th className="text-center px-4 max-sm:px-1 py-2.5">
                    {/* Phone: the column's own eye icon heads it (the word is too
                        wide for a 320px row); the word stays for screen readers. */}
                    <span className="max-sm:sr-only">{t("overview.workers")}</span>
                    <Eye size={13} aria-hidden="true" className="sm:hidden inline-block" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10}><SkeletonTable rows={6} cols={8} /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState title={t("empty.noBrigadirData")} message={t("empty.noAttendance")} /></td></tr>
                ) : displayedBrigadirs.map((b, i) => (
                  <tr
                    key={b.manager_id}
                    className="border-b border-[var(--border)] hover:bg-[var(--bg-inner)] active:bg-[var(--bg-inner)] cursor-pointer"
                    onClick={() => navigate(`/brigadir/${b.manager_id}`)}
                  >
                    <td className="px-4 max-sm:px-3 py-2.5 text-[var(--text-3)]">{i + 1}</td>
                    {/* Phone: «Surname I.» on one line, the full name on long-press. */}
                    <td className="px-2 py-2.5 font-medium text-[var(--text-1)] max-sm:whitespace-nowrap" title={isMobile ? tl(b.name) : undefined}>
                      {isMobile ? surnameInitial(tl(b.name)) : tl(b.name)}
                    </td>
                    <td className="px-2 py-2.5 text-center text-[var(--text-2)] hidden sm:table-cell">S{b.shift}</td>
                    <td className="px-2 py-2.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <button
                        className="text-[var(--text-2)] font-mono hover:underline underline-offset-2"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => setFormulaModal({
                          title: `${t("overview.fm.plannedUtil")}${avgSuffix}`,
                          value: fmtPct(b.baseline_util),
                          formula: `${utilNumbers("baseline_util", b, approx) || "baseline_util = prod_plan ÷ (480 × official_hc)"}\n${t("fm.planOnlyNote")}${avgNote}`,
                          inputs: utilInputs("baseline_util", b, t),
                        })}
                      >
                        {fmtPct(b.baseline_util)}
                      </button>
                    </td>
                    {/* No figure → a muted «—», never a status colour. On a phone the
                        figure is plain text: the row is the one tap target (→ profile),
                        and a text-sized formula button inside it is a mis-tap waiting. */}
                    {b.net_util == null ? (
                      <td className="px-2 py-2.5 text-right font-mono" style={{ color: "var(--text-3)" }}>—</td>
                    ) : isMobile ? (
                      <td className="px-2 py-2.5 text-right font-mono font-bold whitespace-nowrap" style={{ color: toneInk(workloadTone(b.net_util)) }}>
                        {fmtWorkload(b.net_util)}
                      </td>
                    ) : (
                      <td className="px-2 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          className="font-mono font-bold hover:underline underline-offset-2"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: toneInk(workloadTone(b.net_util)) }}
                          onClick={() => setFormulaModal({
                            title: `${t("overview.fm.finalActual")}${avgSuffix}`,
                            value: fmtPct(b.net_util),
                            formula: `${utilNumbers("net_util", b, approx) || "net_util = prod_actual ÷ (effective_hc × adjusted_available_min)"}\n${t("fm.netAdjustments")}${avgNote}`,
                            inputs: utilInputs("net_util", b, t),
                          })}
                        >
                          {fmtWorkload(b.net_util)}
                        </button>
                      </td>
                    )}
                    <td className="px-2 py-2.5 text-right font-mono whitespace-nowrap hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <button
                        className={`hover:underline underline-offset-2 ${diffValue(b, diffUnit) == null ? "text-[var(--text-3)]" : diffValue(b, diffUnit) > 0 ? "text-orange-400" : "text-green-400"}`}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => setFormulaModal(diffModal(b))}
                      >
                        {fmtDiff(b, diffUnit, hcLabel)}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <span className="flex items-center justify-end gap-1">
                        {b.hc_mismatch && <AlertTriangle size={11} className="text-orange-400" />}
                        <button
                          className={`hover:underline underline-offset-2 font-mono ${b.hc_mismatch ? "text-orange-400" : "text-[var(--text-2)]"}`}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                          onClick={() => setFormulaModal({
                            title: t("overview.fm.headcountTitle"),
                            value: String(b.official_hc ?? "—"),
                            formula: t("fm.headcountFormula"),
                            inputs: [
                              { label: t("overview.fm.reportedHC"), val: String(b.official_hc ?? "—"), source: t("overview.fm.srcVerifix") },
                              ...(b.hc_mismatch ? [{ label: t("overview.fm.hcMismatch"), val: "diff > 2 persons" }] : []),
                            ],
                          })}
                        >
                          {b.official_hc}
                        </button>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <button
                        className={`hover:underline underline-offset-2 ${b.equip_downtime > 50 ? "text-red-400" : "text-[var(--text-4)]"}`}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => b.equip_downtime > 0 && setFormulaModal({
                          title: t("overview.fm.idleTitle"),
                          value: b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—",
                          formula: t("fm.idleTotalFormula"),
                          inputs: [
                            { label: t("overview.fm.downtime"), val: b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—", source: t("overview.fm.srcEquip") },
                          ],
                        })}
                      >
                        {b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—"}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                      <StatusBadge status={b.status} color={b.statusColor} short />
                    </td>
                    {/* View workers button */}
                    <td
                      className="px-4 max-sm:px-1 py-2.5 max-sm:py-0 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ managerId: b.manager_id, dateFrom, dateTo, name: b.name });
                      }}
                    >
                      <button
                        aria-label={`${t("overview.workers")} — ${tl(b.name)}`}
                        className="p-1.5 max-sm:w-11 max-sm:h-11 inline-grid place-items-center rounded-lg transition-colors text-[var(--text-3)] hover:bg-[var(--brand-hover)] hover:text-[var(--brand-text)] active:bg-[var(--brand-hover)] active:text-[var(--brand-text)]"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* What the «Yakuniy yuk» colours mean — the bands in force (admin-
              editable), under the list so it never moves a row. */}
          {!isLoading && filtered.length > 0 && (() => {
            const { ok, warn } = activeBands().load;
            const items = [
              ["over", `▲ ≥${OVER_PCT}% · ${t("overview.legendOver")}`],
              ["ok", `≥${ok}%`],
              ["warn", `${warn}–${ok - 1}%`],
              ["bad", `<${warn}%`],
              [null, `— ${t("filter.noData")}`],
            ];
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-t border-[var(--border)] text-[11px]" style={{ color: "var(--text-3)" }}>
                <span>{t("overview.finalWorkload")}:</span>
                {items.map(([tone, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {tone && <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: toneHex(tone) }} />}
                    <span style={{ color: tone ? toneInk(tone) : "var(--text-3)" }}>{label}</span>
                  </span>
                ))}
                {/* Phone only, on a line of its own: the eye column has no word
                    over it there, and it is not one of the colour bands. */}
                <span className="sm:hidden basis-full inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Eye size={12} aria-hidden="true" /> {t("overview.legendWorkers")}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Right column: ranking + funnel */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
          {/* Ranking chart — not on a phone: there it repeats the table above
              row for row (the /shift-daily ruling). */}
          <div className="max-sm:hidden bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                {t("overview.ranking").split("—")[0].trim()} — {RANK_LABELS[rankMode]}
              </div>
              {/* Mode toggle */}
              <SegmentedToggle
                className="flex-shrink-0"
                value={rankMode}
                onChange={setRankMode}
                options={[["planned", "P"], ["actual", "A"], ["diff", "P−A"]]}
              />
            </div>
            {isLoading ? (
              <SkeletonChart className="h-64" />
            ) : ranked.length > 0 ? (
              <BarRankingChart
                names={chartNames}
                values={chartVals}
                colors={chartColors}
                xMin={xMin}
                xMax={xMax}
                seriesName={RANK_LABELS[rankMode]}
                height={Math.max(260, ranked.length * 32 + 60)}
              />
            ) : (
              <EmptyState title={t("empty.noRanking")} message={t("empty.uploadToRank")} />
            )}
            {!isLoading && unranked.length > 0 && (
              <div className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                {t("filter.noData")}: {unranked.map((b) => tl(b.name)).join(", ")}
              </div>
            )}
          </div>

          {/* Funnel chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
              {t("overview.funnelTitle")}
            </div>
            <div className="text-[10px] max-sm:text-[11px] mb-3 text-[var(--text-4)] max-sm:text-[var(--text-3)]">
              {t("overview.funnelSub")}
            </div>
            {isLoading ? (
              <SkeletonChart className="h-48" />
            ) : brigadirs.length > 0 ? (
              <DifferenceBreakdown data={fleetFunnel} height={isMobile ? 0 : 240} diffSegments={compThresholds?.diff_segments} />
            ) : (
              <EmptyState title={t("overview.noFunnel")} message={t("overview.noFunnelMsg")} height="h-36" />
            )}
          </div>
        </div>
      </div>

      {modal && (
        <AttendanceModal
          managerId={modal.managerId}
          dateFrom={modal.dateFrom}
          dateTo={modal.dateTo}
          managerName={modal.name}
          onClose={() => setModal(null)}
        />
      )}

      {formulaModal && (
        <FormulaModal
          title={formulaModal.title}
          value={formulaModal.value}
          formula={formulaModal.formula}
          inputs={formulaModal.inputs}
          onClose={() => setFormulaModal(null)}
        />
      )}
    </Layout>
  );
}
