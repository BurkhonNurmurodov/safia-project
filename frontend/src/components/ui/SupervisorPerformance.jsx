import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Send, Trash2 } from "lucide-react";
import TripleSpeedometer from "../charts/TripleSpeedometer";
import DifferenceBreakdown from "./DifferenceBreakdown";
import SegmentedToggle from "./SegmentedToggle";
import TrendChart from "../charts/TrendChart";
import StatusBadge from "./StatusBadge";
import { diffStatus } from "../../utils/segments";
import Tooltip from "./Tooltip";
import FormulaModal from "./FormulaModal";
import { SkeletonBlock, SkeletonChart } from "./Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useAuth } from "../../context/AuthContext";
import { fmtPct, fmtTime } from "../../utils/formatters";
import { utilNumbers, utilInputs, verifixNumbers, verifixInputs, differenceNumbers, differenceInputs } from "../../utils/formulas";
import api from "../../utils/api";
import { padChartFrom } from "../../utils/chartRange";

function CommentsBox({ managerId, date }) {
  const qc = useQueryClient();
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [text, setText] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["daily-comments", managerId, date],
    queryFn: () => api.get("/api/comments", { params: { manager_id: managerId, date } }).then(r => r.data),
    enabled: !!managerId && !!date,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["daily-comments", managerId, date] });
    qc.invalidateQueries({ queryKey: ["comments-range"] });
  };
  const addMut = useMutation({
    mutationFn: () => api.post("/api/comments", { manager_id: managerId, date, text: text.trim() }),
    onSuccess: () => { setText(""); invalidate(); },
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/comments/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          rows={2} placeholder={t("daily.addNote")}
          className="flex-1 rounded-lg px-3 py-2 text-sm resize-none"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
        />
        <button
          onClick={() => text.trim() && addMut.mutate()}
          disabled={!text.trim() || addMut.isPending}
          className="flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium"
          style={{ background: "var(--brand)", color: "#fff", opacity: text.trim() ? 1 : 0.5 }}
        >
          <Send size={13} /> {t("daily.post")}
        </button>
      </div>
      {comments.length === 0 ? (
        <div className="text-xs" style={{ color: "var(--text-4)" }}>{t("daily.noComments")}</div>
      ) : (
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg px-3 py-2 text-sm flex items-start gap-2"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="flex-1 min-w-0">
                <div style={{ color: "var(--text-1)" }}>{c.text}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-4)" }}>
                  {tl(c.author_name) || "—"} · {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                </div>
              </div>
              {c.author_telegram_id === Number(auth?.telegram_id) && (
                <button onClick={() => delMut.mutate(c.id)} style={{ color: "var(--text-4)" }} title={t("daily.delete")}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// KPI-stage identity hues follow the shared generic-first category order
// (baseline stays neutral grey as the reference; net is status-colored live).
const WORKLOAD_BAR_DEFS = [
  { key: "baseline_util",    tKey: "profile.kpi.planned",   color: "#6b7280" },
  { key: "adjusted_util",    tKey: "profile.kpi.adjusted",  color: "#ef4444" },
  { key: "after_idle_util",  tKey: "profile.kpi.afterIdle", color: "#22c55e" },
  { key: "after_early_util", tKey: "profile.kpi.afterEarly",color: "#3b82f6" },
  { key: "net_util",         tKey: "profile.kpi.final",     color: null, bold: true },
];

const WORKLOAD_FORMULAS = {
  baseline_util:    { titleKey: "fm.wfBaselineTitle", formula: "baseline_util = prod_actual ÷ (official_hc × shift_duration_min)",                       noteKey: "fm.wfBaselineNote" },
  adjusted_util:    { titleKey: "fm.wfAdjustedTitle", formula: "adjusted_util = prod_actual ÷ ((official_hc − labor_surplus) × shift_duration_min)",     noteKey: "fm.wfAdjustedNote" },
  after_idle_util:  { titleKey: "fm.wfIdleTitle",     formula: "after_idle_util = prod_actual ÷ (effective_hc × (shift_min − equip_downtime))",          noteKey: "fm.wfIdleNote" },
  after_early_util: { titleKey: "fm.wfEarlyTitle",    formula: "after_early_util = prod_actual ÷ (effective_hc × (shift_min − idle − early − kaizen))",  noteKey: "fm.wfEarlyNote" },
  net_util:         { titleKey: "fm.wfNetTitle",      formula: "net_util = prod_actual ÷ (effective_hc × adjusted_available_min)",                       noteKey: "fm.wfNetNote" },
};

const STAT_TIPS = {
  "Trudoyomkost": "Actual production output — the real work completed by the team.",
  "Verifix Time": "Reported working hours from Verifix × 60 × 0.85 efficiency coefficient.",
  "Difference":   "Verifix Time minus Trudoyomkost. Positive = Verifix reported more time than production used.",
  "Reported HC":  "Official headcount as recorded in the Verifix attendance file.",
  "Verifix HC":   "Effective headcount derived from Verifix labor hours. ⚠ if difference > 2 persons.",
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

function WorkloadBar({ label, value, color, bold, maxVal, isFirst, onValueClick }) {
  const pct    = value  != null ? Math.round(value  * 100) : 0;
  const maxPct = maxVal != null ? Math.round(maxVal * 100) : (pct || 100);
  const barCol = bold ? utilColor(value) : color;
  const fillW  = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  const markerAt = maxPct > 100 ? (100 / maxPct) * 100 : null;
  const labelH   = isFirst && markerAt !== null ? 14 : 0;
  const trackTop = labelH + 5;

  return (
    <div className="flex items-center gap-3">
      <div className={`text-xs w-28 sm:w-40 flex-shrink-0 ${bold ? "font-bold" : ""}`}
        style={{ color: bold ? barCol : "var(--text-2)" }}>
        {label}
      </div>
      <div className="flex-1 relative" style={{ height: trackTop + 10 }}>
        {isFirst && markerAt !== null && (
          <div style={{ position: "absolute", left: `${markerAt}%`, top: 0, transform: "translateX(-50%)", fontSize: 9, lineHeight: 1, whiteSpace: "nowrap", color: "var(--text-3)", fontWeight: 600 }}>
            100%
          </div>
        )}
        <div className="absolute w-full" style={{ top: trackTop, height: 10, borderRadius: 99, background: "var(--bg-inner)" }} />
        <div className="absolute transition-all" style={{ top: trackTop, height: 10, borderRadius: 99, width: `${fillW}%`, backgroundColor: barCol }} />
        {markerAt !== null && (
          <div style={{ position: "absolute", left: `${markerAt}%`, top: labelH, transform: "translateX(-50%)", width: 2, height: 20, borderRadius: 2, background: "rgba(255,255,255,0.92)", boxShadow: "0 0 0 1px rgba(0,0,0,0.18)", zIndex: 5 }} />
        )}
      </div>
      {onValueClick ? (
        <button onClick={onValueClick} className={`text-xs font-mono w-12 text-right hover:underline underline-offset-2 ${bold ? "font-bold" : ""}`}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: bold ? barCol : "var(--text-2)" }}>
          {fmtPct(value)}
        </button>
      ) : (
        <div className={`text-xs font-mono w-12 text-right ${bold ? "font-bold" : ""}`} style={{ color: bold ? barCol : "var(--text-2)" }}>
          {fmtPct(value)}
        </div>
      )}
    </div>
  );
}

export default function SupervisorPerformance({ managerId, date, unit = "min" }) {
  const { t } = useLang();
  const [showAdj, setShowAdj]   = useState(false);
  const [trendTab, setTrendTab] = useState("workload");
  const [formulaModal, setFormulaModal] = useState(null);

  // Fetch a 7-day window ending on the selected day: `latest` (KPIs) is the
  // range's last day, so the cards still show the picked date while the trend
  // chart gets the minimum 7-day span.
  const params = { date_from: padChartFrom(date, date), date_to: date };

  const { data, isLoading } = useQuery({
    queryKey: ["brigadir-daily", managerId, date],
    queryFn: () => api.get(`/api/brigadir/${managerId}`, { params }).then(r => r.data),
    enabled: !!managerId && !!date,
  });

  const { data: heatmapThresholds } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then(r => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const { data: compThresholds } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then(r => r.data),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <SkeletonBlock className="h-48 rounded-xl" />
        <SkeletonBlock className="h-32 rounded-xl" />
        <SkeletonChart className="h-48" />
      </div>
    );
  }
  if (!data) return <div className="py-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("profile.notFound")}</div>;

  const { name, shift, latest, daily } = data;
  const sortedDates = daily.map(d => d.date);

  const diffValue = latest?.difference_hrs !== null && latest?.difference_hrs !== undefined
    ? `${latest.difference_hrs > 0 ? "+" : ""}${unit === "hrs" ? latest.difference_hrs.toFixed(1) + " hrs" : (latest.difference_hrs * 60).toFixed(0) + " min"}`
    : "—";

  const hcDiff = latest?.verifix_hc != null && latest?.official_hc != null
    ? latest.verifix_hc - latest.official_hc
    : null;

  // Status from D = P − A (План − Итог), colored live by the admin thresholds.
  const ds = diffStatus(latest?.baseline_util, latest?.net_util, compThresholds?.diff_segments);

  const trendSeries = {
    workload: [
      { name: "Trudoyomkost (Plan)", data: daily.map(d => d.prod_plan),    color: "#6b7280", dashed: true },
      { name: "Verifix Time",        data: daily.map(d => d.verifix_labor), color: "#C8973F" },
    ],
    headcount: [
      { name: "Official HC", data: daily.map(d => d.official_hc), color: "#C8973F", dashed: true },
      { name: "Verifix HC",  data: daily.map(d => d.verifix_hc),  color: "#22c55e" },
    ],
    idle: [
      { name: "Equipment Downtime", data: daily.map(d => d.equip_downtime), color: "#ef4444" },
    ],
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header card: speedometers + KPIs + workload bars */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {latest && <StatusBadge status={ds.status} color={ds.color} />}
              {latest?.hc_mismatch && (
                <span className="flex items-center gap-1 text-[11px] text-orange-400">
                  <AlertTriangle size={12} /> {t("profile.hcMismatch")}
                </span>
              )}
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

            {/* Trudoyomkost & Verifix Time */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
              <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-0.5 font-semibold" style={{ color: "var(--brand-text)" }}>
                  {t("profile.trudoyomkost")} {STAT_TIPS["Trudoyomkost"] && <Tooltip text={STAT_TIPS["Trudoyomkost"]} />}
                </div>
                <button className="text-xl font-bold font-mono hover:underline underline-offset-2 text-left"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                  onClick={() => setFormulaModal({ title: t("overview.fm.trudoyomkost"), value: fmtTime(latest?.prod_actual, unit), formula: t("fm.trudoFormulaShort"), inputs: [{ label: t("fm.rawValueMin"), val: `${latest?.prod_actual ?? "—"} min`, source: t("fm.srcProdSystem") }] })}>
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

              <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-0.5 font-semibold" style={{ color: "var(--brand-text)" }}>
                  {t("profile.verifixTime")} {STAT_TIPS["Verifix Time"] && <Tooltip text={STAT_TIPS["Verifix Time"]} />}
                </div>
                <button className="text-xl font-bold font-mono hover:underline underline-offset-2 text-left"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-1)" }}
                  onClick={() => setFormulaModal({ title: t("profile.verifixTime"), value: fmtTime(latest?.verifix_labor, unit), formula: verifixNumbers(latest) || "verifix_labor = reported_hours × 60 × 0.85", inputs: verifixInputs(latest, t) })}>
                  {fmtTime(latest?.verifix_labor, unit)}
                </button>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("profile.diff")}</span>
                  <button className="text-xs font-mono font-bold hover:underline underline-offset-2"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: latest?.difference_hrs > 0 ? "#f97316" : latest?.difference_hrs < 0 ? "#22c55e" : "var(--text-3)" }}
                    onClick={() => setFormulaModal({ title: t("profile.diff"), value: diffValue, formula: differenceNumbers(latest) || "Difference = Verifix Time − Trudoyomkost", inputs: differenceInputs(latest, t) })}>
                    {diffValue}
                  </button>
                  {STAT_TIPS["Difference"] && <Tooltip text={STAT_TIPS["Difference"]} />}
                </div>
              </div>
            </div>

            {/* Reported HC + Verifix HC */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                  {t("profile.reportedHC")} {STAT_TIPS["Reported HC"] && <Tooltip text={STAT_TIPS["Reported HC"]} />}
                </div>
                <div className="text-sm font-bold font-mono" style={{ color: "var(--text-1)" }}>{latest?.official_hc ?? "—"}</div>
              </div>
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                  {t("profile.verifixHC")} {STAT_TIPS["Verifix HC"] && <Tooltip text={STAT_TIPS["Verifix HC"]} />}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold font-mono" style={{ color: "var(--text-1)" }}>{latest?.verifix_hc ?? "—"}</span>
                  {hcDiff !== null && (
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] uppercase font-semibold" style={{ color: "var(--text-4)" }}>{t("profile.diff")}:</span>
                      <span className="text-xs font-mono font-bold" style={{ color: Math.abs(hcDiff) > 2 ? "#f97316" : "#22c55e" }}>
                        {hcDiff > 0 ? "+" : ""}{hcDiff}
                      </span>
                      {latest?.hc_mismatch && <AlertTriangle size={11} className="text-orange-400" />}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Prod Plan + Idle Time */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5">
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>{t("profile.prodPlan")}</div>
                <div className="text-sm font-bold font-mono" style={{ color: "var(--text-1)" }}>{fmtTime(latest?.prod_plan, unit)}</div>
              </div>
              <div className="rounded-lg p-2.5 sm:p-3" style={{ background: "var(--bg-inner)" }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>{t("profile.idleTime")}</div>
                <div className="text-sm font-bold font-mono" style={{ color: (latest?.equip_downtime ?? 0) > 0 ? "#ef4444" : "var(--text-1)" }}>
                  {(latest?.equip_downtime ?? 0) > 0 ? fmtTime(latest.equip_downtime, unit) : "—"}
                </div>
              </div>
            </div>

            {/* Workload bars */}
            <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider mb-3">{t("profile.workloadBreakdown")}</div>
            <div className="space-y-2.5">
              {(() => {
                const maxUtil = Math.max(1.0, ...WORKLOAD_BAR_DEFS.map(({ key }) => latest?.[key] ?? 0));
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
                      onValueClick={wf ? () => setFormulaModal({ title: t(wf.titleKey), value: fmtPct(latest?.[key]), formula: `${utilNumbers(key, latest) || wf.formula}\n\n${t(wf.noteKey)}`, inputs: utilInputs(key, latest, t) }) : undefined}
                    />
                  );
                });
              })()}
            </div>

            {/* Show adjustments toggle */}
            <button onClick={() => setShowAdj(!showAdj)} className="flex items-center gap-1 text-[11px] mt-3 transition-colors" style={{ color: "var(--brand-text)" }}>
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
                    <span style={{ color: "var(--text-3)" }}>{k}</span>
                    <span className="font-mono" style={{ color: "var(--text-2)" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historical trend */}
          {daily.length > 1 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                  {t("profile.historicalTrend").replace("{n}", daily.length)}
                </div>
                <SegmentedToggle
                  value={trendTab}
                  onChange={setTrendTab}
                  options={[["workload", t("profile.trendWorkload")], ["headcount", t("profile.trendHeadcount")], ["idle", t("profile.trendIdle")]]}
                />
              </div>
              <TrendChart dates={sortedDates} series={trendSeries[trendTab]} unit={unit} height={220} />
            </div>
          )}
        </div>

        {/* Right column — Funnel + Comments */}
        <div className="space-y-5">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
              {t("profile.adjFunnel")}
            </div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
              {t("profile.adjFunnelSub")}
            </div>
            <DifferenceBreakdown data={latest} height={260} diffSegments={compThresholds?.diff_segments} />
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">
              {t("daily.commentsTitle")}
            </div>
            <CommentsBox managerId={managerId} date={date} />
          </div>
        </div>
      </div>

      {formulaModal && (
        <FormulaModal
          title={formulaModal.title}
          value={formulaModal.value}
          formula={formulaModal.formula}
          inputs={formulaModal.inputs}
          onClose={() => setFormulaModal(null)}
        />
      )}
    </>
  );
}
