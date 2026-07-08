import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import FormulaModal from "../components/ui/FormulaModal";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import StatusBadge from "../components/ui/StatusBadge";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import BarRankingChart from "../components/charts/BarChart";
import FleetLineChart from "../components/charts/FleetLineChart";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import AttendanceModal from "../components/ui/AttendanceModal";
import EmptyState from "../components/ui/EmptyState";
import Tooltip from "../components/ui/Tooltip";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { brigadirFilterSections, brigadirActiveCount } from "../components/ui/brigadirFilters";
import { SkeletonCard, SkeletonTable, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtPct, fmtTime } from "../utils/formatters";
import { diffStatus } from "../utils/segments";
import { utilNumbers, utilInputs, differenceNumbers, differenceInputs, differencePctNumbers, hcEquivNumbers, hcEquivInputs, avgWorkloadNumbers, rangeDays } from "../utils/formulas";
import { padChartParams } from "../utils/chartRange";
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
          className="inline-flex items-center gap-0.5 select-none transition-colors hover:text-[var(--text-1)]"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
        >
          {label}
          {tip && <Tooltip text={tip} />}
          <Icon size={9} style={{ opacity: isActive ? 1 : 0.4 }} />
        </button>
      </span>
    </th>
  );
}

export default function Overview() {
  const { params, unit, ready, dateFrom, dateTo } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const hcLabel = t("overview.diffUnitHc"); // localized name for the HC (headcount) diff unit
  const navigate = useNavigate();
  const [filters, setFilters] = useState(INIT_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: "asc" }); // key=null → original order
  const [modal, setModal] = useState(null); // { managerId, dateFrom, dateTo, name }
  const [rankMode, setRankMode] = useState("actual"); // "planned" | "actual" | "diff"
  const [lineMode, setLineMode] = useState("actual"); // "planned" | "actual" | "diff"
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

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", params],
    queryFn: () => api.get("/api/summary", { params }).then((r) => r.data),
    enabled: ready,
  });

  const { data: brigadirs = [], isLoading } = useQuery({
    queryKey: ["brigadirs", params],
    queryFn: () => api.get("/api/brigadirs", { params }).then((r) => r.data),
    enabled: ready,
  });

  // Fleet-trend window: never chart fewer than MIN_CHART_DAYS days — a short
  // selection is padded back (n..n+4 charts as n-2..n+4). KPIs/table above
  // keep the exact selected range. include_pending: uploaded-but-unclosed
  // days plot as (unconfirmed) points instead of leaving holes in the line.
  const chartParams = useMemo(() => ({ ...padChartParams(params), include_pending: 1 }), [params]);
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

  // Sort ascending: lowest value at top across all modes
  const ranked = [...filtered].sort((a, b) => getRankVal(a) - getRankVal(b));
  const chartNames = ranked.map((b) => tl(b.name));
  const chartVals  = ranked.map((b) => getRankVal(b));
  const chartColors = rankMode === "diff"
    ? chartVals.map(diffColor)
    : undefined; // undefined → BarChart uses default utilColor

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
        formula: `${differencePctNumbers(b, approx) || "Diff % = (Verifix Time − Trudoyomkost) ÷ Verifix Time × 100"}\n${t("fm.diffPctNote")}${avgNote}`,
        inputs: differenceInputs(b, t),
      };
    }
    return {
      title, value,
      formula: `${differenceNumbers(b, approx) || "Diff = Verifix Time − Trudoyomkost"}\n${t("fm.diffNote")}${avgNote}`,
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
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KPICard
              label={t("overview.totalIdle")}
              value={totalIdle != null ? fmtTime(totalIdle, unit) : "—"}
              tooltip={t("overview.tip.totalIdle")}
              onValueClick={() => setFormulaModal({
                title: t("overview.fm.idleTitle"),
                value: totalIdle != null ? fmtTime(totalIdle, unit) : "—",
                formula: t("fm.idleSumFormula"),
                inputs: [{ label: t("overview.fm.idleTitle"), val: totalIdle != null ? fmtTime(totalIdle, unit) : "—", source: t("overview.fm.srcEquip") }],
              })}
            />
            <KPICard
              label={t("overview.avgFinalWorkload")}
              value={fmtPct(summary?.avg_final_workload)}
              accent
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
              danger
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("overview.fleetTrend")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {lineMode === "planned" ? t("overview.fleetTrendPlanned")
               : lineMode === "actual" ? t("overview.fleetTrendActual")
               : t("overview.fleetTrendDiff")}
            </div>
          </div>
          {/* P / A / P-A toggle */}
          <SegmentedToggle
            className="flex-shrink-0"
            value={lineMode}
            onChange={setLineMode}
            options={[["planned", "P"], ["actual", "A"], ["diff", "P−A"]]}
          />
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
            heatmapSegments={heatmapThresholds?.segments}
            diffSegments={compThresholds?.diff_segments}
          />
        ) : (
          <EmptyState title={t("overview.noTrend")} message={t("overview.noTrendMsg")} height="h-48" />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
            {/* Difference-column unit switch (independent from the global unit). */}
            {diffUnitToggle}
            <div className="flex-1" />
            {/* All column filters consolidated into one dropdown / mobile sheet. */}
            <FilterPanel
              sections={brigadirFilterSections({ filters, setF, distinctShifts, distinctStatuses, t })}
              activeCount={brigadirActiveCount(filters)}
              anyActive={activeFilter}
              onClearAll={() => setFilters(INIT_FILTERS)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
                  <th className="text-left px-4 py-2.5">#</th>
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
                  <th className="text-center px-4 py-2.5">{t("overview.workers")}</th>
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
                    className="border-b border-[var(--border)] hover:bg-white/5 cursor-pointer"
                    onClick={() => navigate(`/brigadir/${b.manager_id}`)}
                  >
                    <td className="px-4 py-2.5 text-[var(--text-3)]">{i + 1}</td>
                    <td className="px-2 py-2.5 font-medium text-[var(--text-1)]">{tl(b.name)}</td>
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
                    <td className="px-2 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        className={`font-mono font-bold hover:underline underline-offset-2 ${b.net_util >= 1.05 ? "text-amber-400" : b.net_util >= 0.95 ? "text-green-400" : b.net_util >= 0.90 ? "text-yellow-300" : b.net_util >= 0.85 ? "text-orange-400" : "text-red-400"}`}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => setFormulaModal({
                          title: `${t("overview.fm.finalActual")}${avgSuffix}`,
                          value: fmtPct(b.net_util),
                          formula: `${utilNumbers("net_util", b, approx) || "net_util = prod_actual ÷ (effective_hc × adjusted_available_min)"}\n${t("fm.netAdjustments")}${avgNote}`,
                          inputs: utilInputs("net_util", b, t),
                        })}
                      >
                        {fmtPct(b.net_util)}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono hidden md:table-cell" onClick={e => e.stopPropagation()}>
                      <button
                        className={`hover:underline underline-offset-2 ${diffValue(b, diffUnit) > 0 ? "text-orange-400" : "text-green-400"}`}
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
                      className="px-4 py-2.5 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ managerId: b.manager_id, dateFrom, dateTo, name: b.name });
                      }}
                    >
                      <button
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--text-3)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-hover)"; e.currentTarget.style.color = "var(--brand-text)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: ranking + funnel */}
        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
          {/* Ranking chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                {t("overview.ranking").split("—")[0].trim()} — {RANK_LABELS[rankMode]}
              </div>
              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden text-[10px] flex-shrink-0"
                style={{ border: "1px solid var(--border-md)" }}>
                {[["planned", "P"], ["actual", "A"], ["diff", "P−A"]].map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setRankMode(m)}
                    className="px-2 py-1 font-medium"
                    style={rankMode === m
                      ? { background: "var(--brand)", color: "#fff" }
                      : { background: "var(--bg-inner)", color: "var(--text-3)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {isLoading ? (
              <SkeletonChart className="h-64" />
            ) : filtered.length > 0 ? (
              <BarRankingChart
                names={chartNames}
                values={chartVals}
                colors={chartColors}
                xMin={xMin}
                xMax={xMax}
                seriesName={RANK_LABELS[rankMode]}
                height={Math.max(260, filtered.length * 32 + 60)}
              />
            ) : (
              <EmptyState title={t("empty.noRanking")} message={t("empty.uploadToRank")} />
            )}
          </div>

          {/* Funnel chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
              {t("overview.funnelTitle")}
            </div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
              {t("overview.funnelSub")}
            </div>
            {isLoading ? (
              <SkeletonChart className="h-48" />
            ) : brigadirs.length > 0 ? (
              <DifferenceBreakdown data={fleetFunnel} height={240} diffSegments={compThresholds?.diff_segments} />
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
