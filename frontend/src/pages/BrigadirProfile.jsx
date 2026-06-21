import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronUp, AlertTriangle, Calendar } from "lucide-react";
import Layout from "../components/layout/Layout";
import TripleSpeedometer from "../components/charts/TripleSpeedometer";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import TrendChart from "../components/charts/TrendChart";
import AttendanceModal from "../components/ui/AttendanceModal";
import StyledSelect from "../components/ui/StyledSelect";
import StatusBadge from "../components/ui/StatusBadge";
import Tooltip from "../components/ui/Tooltip";
import FormulaModal from "../components/ui/FormulaModal";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtPct, fmtTime } from "../utils/formatters";
import { utilNumbers, utilInputs, verifixNumbers, verifixInputs, differenceNumbers, differenceInputs, hcDiffNumbers, hcDiffInputs } from "../utils/formulas";
import api from "../utils/api";
import { diffStatus } from "../utils/segments";

// Keyed by the D = P − A status (P = План, A = Итог): blue Monitor → green Good
// → yellow On Track → red Needs Attention.
const DIAGNOSTIC = {
  "Monitor":         "Final output far above plan — verify reporting or unusually high throughput.",
  "Good":            "Final output above plan and within the healthy range.",
  "On Track":        "Final output slightly below plan but within the normal range.",
  "Needs Attention": "Final output well below plan — investigate root cause.",
  "No Data":         "Insufficient data for this period.",
};

const WORKLOAD_BAR_DEFS = [
  { key: "baseline_util",    tKey: "profile.kpi.planned",   color: "#6b7280" },
  { key: "adjusted_util",    tKey: "profile.kpi.adjusted",  color: "#C8973F" },
  { key: "after_idle_util",  tKey: "profile.kpi.afterIdle", color: "#E8A0B0" },
  { key: "after_early_util", tKey: "profile.kpi.afterEarly",color: "#f59e0b" },
  { key: "net_util",         tKey: "profile.kpi.final",     color: null, bold: true },
];

const STAT_TIPS = {
  "Prod. Plan":     "Total planned production time for the brigadir's team in the selected period (minutes or hours).",
  "Trudoyomkost":   "Actual production output — the real work completed by the team (Trudoyomkost = labor intensity in Russian).",
  "Verifix Time":   "Reported working hours from Verifix × 60 × 0.85 efficiency coefficient. Represents effective labor minutes.",
  "Difference":     "Verifix Time minus Trudoyomkost. Positive = Verifix reported more time than production used (possible over-reporting).",
  "Reported HC":    "Official headcount as recorded in the Verifix attendance file.",
  "Verifix HC":     "Effective headcount derived from Verifix labor hours. Δ = difference vs official headcount. ⚠ if difference > 2 persons.",
  "Idle Time":      "Total equipment downtime recorded for this supervisor's team in the selected period.",
};

function utilColor(val) {
  if (val === null || val === undefined) return "#C8973F";
  const pct = val * 100;
  if (pct >= 105) return "#f59e0b";
  if (pct >= 95)  return "#22c55e";
  if (pct >= 90)  return "#eab308";
  if (pct >= 85)  return "#f97316";
  return "#ef4444";
}

const WORKLOAD_FORMULAS = {
  baseline_util: {
    titleKey: "fm.wfBaselineTitle",
    formula: "baseline_util = prod_actual ÷ (official_hc × shift_duration_min)",
    noteKey: "fm.wfBaselineNote",
  },
  adjusted_util: {
    titleKey: "fm.wfAdjustedTitle",
    formula: "adjusted_util = prod_actual ÷ ((official_hc − labor_surplus) × shift_duration_min)",
    noteKey: "fm.wfAdjustedNote",
  },
  after_idle_util: {
    titleKey: "fm.wfIdleTitle",
    formula: "after_idle_util = prod_actual ÷ (effective_hc × (shift_min − equip_downtime))",
    noteKey: "fm.wfIdleNote",
  },
  after_early_util: {
    titleKey: "fm.wfEarlyTitle",
    formula: "after_early_util = prod_actual ÷ (effective_hc × (shift_min − idle − early − kaizen))",
    noteKey: "fm.wfEarlyNote",
  },
  net_util: {
    titleKey: "fm.wfNetTitle",
    formula: "net_util = prod_actual ÷ (effective_hc × adjusted_available_min)",
    noteKey: "fm.wfNetNote",
  },
};

function WorkloadBar({ label, value, color, bold, maxVal, isFirst, onValueClick }) {
  const pct      = value  != null ? Math.round(value  * 100) : 0;
  const maxPct   = maxVal != null ? Math.round(maxVal * 100) : (pct || 100);
  const barCol   = bold ? utilColor(value) : color;
  const fillW    = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  const markerAt = maxPct > 100 ? (100 / maxPct) * 100 : null;

  // First bar gets extra top space so the "100%" label can sit above the track
  const labelH   = isFirst && markerAt !== null ? 14 : 0;
  const trackTop = labelH + 5; // vertical offset of track within wrapper

  return (
    <div className="flex items-center gap-3">
      <div
        className={`text-xs w-28 sm:w-40 flex-shrink-0 ${bold ? "font-bold" : ""}`}
        style={{ color: bold ? barCol : "var(--text-2)" }}
      >
        {label}
      </div>

      {/* Track wrapper */}
      <div className="flex-1 relative" style={{ height: trackTop + 10 }}>
        {/* "100%" label — first bar only */}
        {isFirst && markerAt !== null && (
          <div
            style={{
              position: "absolute",
              left: `${markerAt}%`,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: 9,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: "var(--text-3)",
              fontWeight: 600,
            }}
          >
            100%
          </div>
        )}

        {/* Background track */}
        <div
          className="absolute w-full"
          style={{ top: trackTop, height: 10, borderRadius: 99, background: "var(--bg-inner)" }}
        />
        {/* Filled bar */}
        <div
          className="absolute transition-all"
          style={{ top: trackTop, height: 10, borderRadius: 99, width: `${fillW}%`, backgroundColor: barCol }}
        />
        {/* Vertical 100% marker */}
        {markerAt !== null && (
          <div
            style={{
              position: "absolute",
              left: `${markerAt}%`,
              top: labelH,
              transform: "translateX(-50%)",
              width: 2,
              height: 20,
              borderRadius: 2,
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.18)",
              zIndex: 5,
            }}
          />
        )}
      </div>

      {onValueClick ? (
        <button
          onClick={onValueClick}
          className={`text-xs font-mono w-12 text-right hover:underline underline-offset-2 ${bold ? "font-bold" : ""}`}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: bold ? barCol : "var(--text-2)" }}
        >
          {fmtPct(value)}
        </button>
      ) : (
        <div
          className={`text-xs font-mono w-12 text-right ${bold ? "font-bold" : ""}`}
          style={{ color: bold ? barCol : "var(--text-2)" }}
        >
          {fmtPct(value)}
        </div>
      )}
    </div>
  );
}

export default function BrigadirProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { params, unit, dateFrom, dateTo } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [showAdj, setShowAdj]     = useState(false);
  const [trendTab, setTrendTab]   = useState("workload");
  const [attendanceDate, setAttendanceDate] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formulaModal, setFormulaModal] = useState(null); // { title, value, formula, inputs }

  const { data, isLoading } = useQuery({
    queryKey: ["brigadir", id, params],
    queryFn: () => api.get(`/api/brigadir/${id}`, { params }).then((r) => r.data),
  });

  const { data: allAttendanceDates = [] } = useQuery({
    queryKey: ["attendance-dates", id],
    queryFn: () => api.get("/api/attendance/dates", { params: { manager_id: id } }).then((r) => r.data),
    enabled: !!id,
  });

  const { data: heatmapThresholds } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const { data: compThresholds } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Layout title={t("profile.title")} showFilters>
        <div className="space-y-4 animate-pulse">
          <SkeletonBlock className="h-5 w-24 mb-5" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <div className="lg:col-span-2 space-y-4">
              <SkeletonBlock className="h-64 rounded-xl" />
              <SkeletonBlock className="h-48 rounded-xl" />
            </div>
            <div className="space-y-4">
              <SkeletonBlock className="h-64 rounded-xl" />
              <SkeletonBlock className="h-32 rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  if (!data) return <Layout title={t("profile.title")}><div className="text-[var(--text-2)] text-sm">{t("profile.notFound")}</div></Layout>;

  const { name, shift, latest, daily } = data;
  // Status from D = P − A (План − Итог), colored live by the admin thresholds.
  const ds = diffStatus(latest?.baseline_util, latest?.net_util, compThresholds?.diff_segments);
  const sortedDates = daily.map((d) => d.date);

  const latestDate = allAttendanceDates[0] || null;
  const activeAttendanceDate = attendanceDate || latestDate;

  function fmtFilterDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  const periodLabel = (() => {
    if (!dateFrom && !dateTo) return null;
    const from = fmtFilterDate(dateFrom);
    const to   = fmtFilterDate(dateTo);
    // Single day (start === end, or only one bound set) → show the date once
    if (!from || !to || from === to) return from || to;
    return `${from} — ${to}`;
  })();

  function fmtDateLabel(ddmmyyyy) {
    if (!ddmmyyyy) return "";
    const [dd, mm, yyyy] = ddmmyyyy.split(".");
    return new Date(`${yyyy}-${mm}-${dd}`).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric"
    });
  }

  const trendSeries = {
    workload: [
      { name: "Trudoyomkost (Plan)", data: daily.map((d) => d.prod_plan),     color: "#6b7280", dashed: true },
      { name: "Verifix Time",        data: daily.map((d) => d.verifix_labor),  color: "#C8973F" },
    ],
    headcount: [
      { name: "Official HC", data: daily.map((d) => d.official_hc), color: "#C8973F", dashed: true },
      { name: "Verifix HC",  data: daily.map((d) => d.verifix_hc),  color: "#22c55e" },
    ],
    idle: [
      { name: "Equipment Downtime", data: daily.map((d) => d.equip_downtime), color: "#ef4444" },
    ],
  };

  const diffValue = latest?.difference_hrs !== null && latest?.difference_hrs !== undefined
    ? `${latest.difference_hrs > 0 ? "+" : ""}${unit === "hrs" ? latest.difference_hrs.toFixed(1) + " hrs" : (latest.difference_hrs * 60).toFixed(0) + " min"}`
    : "—";

  const hcDiff = latest?.verifix_hc != null && latest?.official_hc != null
    ? latest.verifix_hc - latest.official_hc
    : null;

  const tertiaryStats = [
    {
      label: t("profile.prodPlan"),
      value: fmtTime(latest?.prod_plan, unit),
      formula: {
        title: t("fm.prodPlanTitle"),
        value: fmtTime(latest?.prod_plan, unit),
        formula: `prod_plan = official_hc × shift_duration_min\n${t("fm.prodPlanNote")}`,
        inputs: [
          { label: t("overview.fm.reportedHC"), val: String(latest?.official_hc ?? "—"), source: t("fm.srcVerifixAtt") },
          { label: t("fm.shiftDuration"), val: "shift_duration_min", source: t("fm.srcSchedule") },
          { label: t("fm.prodPlanResult"), val: fmtTime(latest?.prod_plan, unit) },
        ],
      },
    },
    {
      label: t("profile.idleTime"),
      value: (latest?.equip_downtime ?? 0) > 0 ? fmtTime(latest.equip_downtime, unit) : "—",
      danger: (latest?.equip_downtime ?? 0) > 0,
      formula: {
        title: t("fm.equipIdleTitle"),
        value: (latest?.equip_downtime ?? 0) > 0 ? fmtTime(latest.equip_downtime, unit) : "—",
        formula: t("fm.equipIdleFormula"),
        inputs: [
          { label: t("fm.downtimeMin"), val: `${latest?.equip_downtime ?? 0} min`, source: t("fm.srcEquipMon") },
        ],
      },
    },
  ];

  return (
    <Layout title={tl(name)} showFilters>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--text-2)] hover:text-[var(--text-1)] text-sm mb-5 transition-colors">
        <ArrowLeft size={15} /> {t("profile.back")}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            <div className="mb-1">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--text-1)] break-words">{tl(name)}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 mb-3">
                <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                  Shift {shift}
                </span>
                {periodLabel && (
                  <span className="text-xs px-2 py-0.5 rounded flex-shrink-0 flex items-center gap-1"
                    style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                    <Calendar size={12} /> {periodLabel}
                  </span>
                )}
                {latest && <StatusBadge status={ds.status} color={ds.color} />}
                {latest?.hc_mismatch && (
                  <span className="flex items-center gap-1 text-[11px] text-orange-400 flex-shrink-0">
                    <AlertTriangle size={12} /> {t("profile.hcMismatch")}
                  </span>
                )}
              </div>
            </div>

            {/* Triple speedometer */}
            <div className="mb-4" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <TripleSpeedometer
                baselineUtil={latest?.baseline_util}
                netUtil={latest?.net_util}
                heatmapSegments={heatmapThresholds?.segments}
                diffSegments={compThresholds?.diff_segments}
              />
            </div>

            {/* Primary KPI stats — Trudoyomkost & Verifix Time */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
              {/* Trudoyomkost */}
              <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-0.5 font-semibold" style={{ color: "var(--brand-text)" }}>
                  {t("profile.trudoyomkost")}
                  {STAT_TIPS["Trudoyomkost"] && <Tooltip text={STAT_TIPS["Trudoyomkost"]} />}
                </div>
                <button
                  className="text-xl font-bold font-mono hover:underline underline-offset-2 text-left"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                  onClick={() => setFormulaModal({
                    title: t("fm.trudoTitle"),
                    value: fmtTime(latest?.prod_actual, unit),
                    formula: t("fm.trudoFormula"),
                    inputs: [
                      { label: t("fm.rawValueMin"), val: `${latest?.prod_actual ?? "—"} min`, source: t("fm.srcProdSystem") },
                    ],
                  })}
                >
                  {fmtTime(latest?.prod_actual, unit)}
                </button>
                {latest?.prod_actual != null && latest?.prod_plan != null && latest.prod_plan > 0 && (() => {
                  const pct = (latest.prod_actual / latest.prod_plan) * 100;
                  const color = pct >= 100 ? "#22c55e" : pct >= 90 ? "#f59e0b" : "#ef4444";
                  const pctStr = `${pct.toFixed(1)}%`;
                  return (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("profile.planFulfill")}</span>
                      <button className="text-xs font-mono font-bold hover:underline underline-offset-2"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color }}
                        onClick={() => setFormulaModal({ title: t("profile.planFulfill"), value: pctStr, formula: `${pctStr} = (${fmtTime(latest.prod_actual, unit)} ÷ ${fmtTime(latest.prod_plan, unit)}) × 100`, inputs: [{ label: t("overview.fm.trudoyomkost"), val: fmtTime(latest.prod_actual, unit) }, { label: t("fm.prodPlanShort"), val: fmtTime(latest.prod_plan, unit) }, { label: t("profile.planFulfill"), val: pctStr }] })}>
                        {pctStr}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Verifix Time + Difference */}
              <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-0.5 font-semibold" style={{ color: "var(--brand-text)" }}>
                  {t("profile.verifixTime")}
                  {STAT_TIPS["Verifix Time"] && <Tooltip text={STAT_TIPS["Verifix Time"]} />}
                </div>
                <button
                  className="text-xl font-bold font-mono hover:underline underline-offset-2 text-left"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                  onClick={() => setFormulaModal({
                    title: t("profile.verifixTime"),
                    value: fmtTime(latest?.verifix_labor, unit),
                    formula: verifixNumbers(latest) || "verifix_labor = reported_hours × 60 × 0.85",
                    inputs: verifixInputs(latest, t),
                  })}
                >
                  {fmtTime(latest?.verifix_labor, unit)}
                </button>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>
                    {t("profile.diff")}
                  </span>
                  <button
                    className="text-xs font-mono font-bold hover:underline underline-offset-2"
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: latest?.difference_hrs > 0 ? "#f97316" : latest?.difference_hrs < 0 ? "#22c55e" : "var(--text-3)",
                    }}
                    onClick={() => setFormulaModal({
                      title: t("fm.diffVerifixTrudo"),
                      value: diffValue,
                      formula: `${differenceNumbers(latest) || "Difference = Verifix Time − Trudoyomkost"}\n${t("fm.diffPositiveShort")}`,
                      inputs: differenceInputs(latest, t),
                    })}
                  >
                    {diffValue}
                  </button>
                  {STAT_TIPS["Difference"] && <Tooltip text={STAT_TIPS["Difference"]} />}
                </div>
              </div>
            </div>

            {/* Row 2 — Reported HC + Verifix HC */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
              {/* Reported HC */}
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                  {t("profile.reportedHC")}
                  {STAT_TIPS["Reported HC"] && <Tooltip text={STAT_TIPS["Reported HC"]} />}
                </div>
                <button
                  className="text-sm font-bold font-mono hover:underline underline-offset-2 text-left"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                  onClick={() => setFormulaModal({
                    title: t("fm.reportedHcTitle"),
                    value: String(latest?.official_hc ?? "—"),
                    formula: t("fm.reportedHcFormula"),
                    inputs: [
                      { label: t("fm.officialHc"), val: String(latest?.official_hc ?? "—"), source: t("fm.srcVerifixAttFile") },
                    ],
                  })}
                >
                  {latest?.official_hc ?? "—"}
                </button>
              </div>

              {/* Verifix HC + diff */}
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                  {t("profile.verifixHC")}
                  {STAT_TIPS["Verifix HC"] && <Tooltip text={STAT_TIPS["Verifix HC"]} />}
                </div>
                <div className="flex items-baseline gap-2">
                  <button
                    className="text-sm font-bold font-mono hover:underline underline-offset-2 text-left"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                    onClick={() => setFormulaModal({
                      title: t("fm.verifixHcTitle"),
                      value: String(latest?.verifix_hc ?? "—"),
                      formula: `verifix_hc = total_verifix_hours ÷ shift_duration_hours\n${t("fm.verifixHcNote")}`,
                      inputs: [
                        { label: t("fm.verifixHcDerived"), val: String(latest?.verifix_hc ?? "—"), source: t("fm.srcVerifixLaborShift") },
                        { label: t("fm.reportedHcOfficial"), val: String(latest?.official_hc ?? "—"), source: t("fm.srcVerifixAttFile") },
                      ],
                    })}
                  >
                    {latest?.verifix_hc ?? "—"}
                  </button>
                  {hcDiff !== null && (
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("profile.diff")}:</span>
                      <button
                        className="text-xs font-mono font-bold hover:underline underline-offset-2"
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          color: Math.abs(hcDiff) > 2 ? "#f97316" : "#22c55e",
                        }}
                        onClick={() => setFormulaModal({
                          title: t("fm.hcDiffTitle"),
                          value: `${hcDiff > 0 ? "+" : ""}${hcDiff}`,
                          formula: `${hcDiffNumbers(latest) || "HC Diff = Verifix HC − Reported HC"}\n${t("fm.hcDiffWarn")}`,
                          inputs: hcDiffInputs(latest, t),
                        })}
                      >
                        {hcDiff > 0 ? "+" : ""}{hcDiff}
                      </button>
                      {latest?.hc_mismatch && <AlertTriangle size={11} className="text-orange-400" />}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3 — Prod. Plan + Idle Time */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5">
              {tertiaryStats.map(({ label, value, danger, formula }) => (
                <div key={label} className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                    {label}
                    {STAT_TIPS[label] && <Tooltip text={STAT_TIPS[label]} />}
                  </div>
                  <button
                    className="text-sm font-bold font-mono hover:underline underline-offset-2 text-left"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: danger ? "#ef4444" : "var(--text-1)" }}
                    onClick={() => formula && setFormulaModal(formula)}
                  >
                    {value}
                  </button>
                </div>
              ))}
            </div>

            {/* Workload bars */}
            <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">{t("profile.workloadBreakdown")}</div>
            <div className="space-y-2.5">
              {(() => {
                const maxUtil = Math.max(
                  1.0,
                  ...WORKLOAD_BAR_DEFS.map(({ key }) => latest?.[key] ?? 0)
                );
                return WORKLOAD_BAR_DEFS.map(({ key, tKey, color, bold }, idx) => {
                  const wf = WORKLOAD_FORMULAS[key];
                  return (
                    <WorkloadBar
                      key={key}
                      label={t(tKey)}
                      value={latest?.[key]}
                      color={color}
                      bold={bold}
                      maxVal={maxUtil}
                      isFirst={idx === 0}
                      onValueClick={wf ? () => setFormulaModal({
                        title: t(wf.titleKey),
                        value: fmtPct(latest?.[key]),
                        formula: `${utilNumbers(key, latest) || wf.formula}\n\n${t(wf.noteKey)}`,
                        inputs: utilInputs(key, latest, t),
                      }) : undefined}
                    />
                  );
                });
              })()}
            </div>

            {/* Show adjustments */}
            <button
              onClick={() => setShowAdj(!showAdj)}
              className="flex items-center gap-1 text-[11px] mt-3 transition-colors"
              style={{ color: "var(--brand-text)" }}
            >
              {showAdj ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAdj ? t("profile.hideAdj") : t("profile.showAdj")}
            </button>
            {showAdj && latest && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                {[
                  [t("profile.avgEarlyArrival"),  `${latest.avg_early_arrival?.toFixed(1) ?? 0} min/person`],
                  [t("profile.equipDowntime"),     fmtTime(latest.equip_downtime, unit)],
                  [t("profile.kaizenBuffer"),      "10 min"],
                  [t("profile.laborSurplus"),      latest.labor_surplus !== null ? `${latest.labor_surplus?.toFixed(2)} persons` : "—"],
                  [t("profile.officialHC"),        latest.official_hc],
                  [t("profile.effectiveHC"),       latest.effective_hc?.toFixed(2) ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between bg-[var(--bg-inner)] rounded px-3 py-1.5">
                    <span className="text-[var(--text-3)]">{k}</span>
                    <span className="font-mono text-[var(--text-2)]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Diagnostic */}
            {latest && (
              <div className="mt-4 rounded-lg p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--brand-text)" }}>{t("profile.diagnosticSummary")}</div>
                <div className="text-xs text-[var(--text-2)]">{DIAGNOSTIC[latest.status]}</div>
              </div>
            )}
          </div>

          {/* Historical trend */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                {t("profile.historicalTrend").replace("{n}", daily.length)}
              </div>
              <div className="flex rounded-lg overflow-hidden border border-[var(--border-md)] text-xs divide-x divide-[var(--border-md)]">
                {[["workload", t("profile.trendWorkload")], ["headcount", t("profile.trendHeadcount")], ["idle", t("profile.trendIdle")]].map(([k,l]) => (
                  <button key={k} onClick={() => setTrendTab(k)}
                    className={`px-3 py-1.5 whitespace-nowrap ${trendTab === k ? "text-white font-semibold" : "bg-[var(--bg-inner)] text-[var(--text-2)]"}`}
                    style={trendTab === k ? { background: "var(--brand)" } : {}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <TrendChart dates={sortedDates} series={trendSeries[trendTab]} unit={unit} height={220} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Funnel */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
              {t("profile.adjFunnel")}
            </div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
              {t("profile.adjFunnelSub")}
            </div>
            <DifferenceBreakdown data={latest} height={260} diffSegments={compThresholds?.diff_segments} />
          </div>

          {/* Attendance drill-down */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
              {t("attendance.title")}
            </div>
            <StyledSelect
              value={attendanceDate || ""}
              onChange={(val) => { setAttendanceDate(val); setShowModal(true); }}
              options={allAttendanceDates.map((d) => ({ value: d, label: fmtDateLabel(d) }))}
              placeholder={t("common.selectDate")}
              className="w-full text-sm"
            />
            {allAttendanceDates.length === 0 && (
              <div className="text-[11px] mt-2" style={{ color: "var(--text-4)" }}>
                No attendance dates available.
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && attendanceDate && (
        <AttendanceModal
          managerId={Number(id)}
          date={attendanceDate.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1")}
          managerName={name}
          onClose={() => { setShowModal(false); setAttendanceDate(null); }}
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
