import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import DayStepper from "../components/ui/DayStepper";
import KpiDeltaCard from "../components/ui/KpiDeltaCard";
import LoadBarChart from "../components/charts/LoadBarChart";
import { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import { DEFAULT_DIFF_SEGMENTS } from "../components/charts/ComparisonTable";
import BarRankingChart from "../components/charts/BarChart";
import BrigadirTable from "../components/ui/BrigadirTable";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtPct, fmtTime } from "../utils/formatters";
import api from "../utils/api";

// ── date helpers ──────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); }
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }
const toDMY = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

// Signed display for a card delta, formatted in the card's own unit.
function signed(n, fmt) {
  if (n === 0) return null;
  const s = n > 0 ? "+" : "−";
  return `${s}${fmt(Math.abs(n))}`;
}

const WINDOW_DAYS = 7; // trend sparkline span, ending on the selected date

export default function ShiftDaily() {
  const { unit, setUnit } = useFilters();
  const { t } = useLang();
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Initial date can be restored from the URL (e.g. returning from a drill-down).
  const [date, setDate] = useState(() => searchParams.get("date") || isoDaysAgo(1));
  const [loadDiff, setLoadDiff] = useState(false);
  const [rankMode, setRankMode] = useState("actual"); // "planned" | "actual" | "diff"

  const winFrom = addDaysISO(date, -(WINDOW_DAYS - 1));

  // Supervisors are already scoped to the shift-manager's own shift server-side;
  // their shift number drives the dashboard's shift filter.
  const { data: supervisors = [] } = useQuery({
    queryKey: ["staff-supervisors"],
    queryFn: () => api.get("/api/staff/supervisors").then(r => r.data),
    staleTime: 120_000,
  });
  const shift = supervisors[0]?.shift ?? null;

  const { data: brigadirs = [], isLoading } = useQuery({
    queryKey: ["shift-daily-brigadirs", shift, date],
    queryFn: () => api.get("/api/brigadirs", { params: { date_from: date, date_to: date, shift } }).then(r => r.data),
    enabled: !!shift,
  });

  const { data: heatmap, isLoading: hmLoading } = useQuery({
    queryKey: ["shift-daily-heatmap", shift, winFrom, date],
    queryFn: () => api.get("/api/heatmap", { params: { date_from: winFrom, date_to: date, shift } }).then(r => r.data),
    enabled: !!shift,
  });

  // Live colour thresholds from admin config — shared (same query keys) with the
  // Zagruzka page. P bars use the fleet-heatmap segments; A bars use the
  // comparison-table diff segments (coloured by D = P − A).
  const { data: thresholdData } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then(r => r.data),
    staleTime: 60_000,
  });
  const plannedSegments = thresholdData?.segments?.length ? thresholdData.segments : DEFAULT_SEGMENTS;

  const { data: compThresholdData } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then(r => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const diffSegments = compThresholdData?.diff_segments?.length ? compThresholdData.diff_segments : DEFAULT_DIFF_SEGMENTS;

  // ── Day-over-day aggregates from the heatmap window ─────────────────────────
  const dayAgg = (dStr) => {
    let idle = 0, sum = 0, cnt = 0, over = 0, under = 0;
    const data = heatmap?.data || {};
    for (const name of (heatmap?.managers || [])) {
      const c = data[name]?.[dStr];
      if (!c) continue;
      idle += c.equip_downtime || 0;
      if (c.net_util != null) {
        sum += c.net_util; cnt++;
        if (c.net_util >= 1.0) over++;
        if (c.net_util < 0.90) under++;
      }
    }
    return { idle, avg: cnt ? sum / cnt : null, over, under, cnt };
  };

  const cards = useMemo(() => {
    const dates = heatmap?.dates || [];
    const cur = dayAgg(toDMY(date));
    const prev = dayAgg(toDMY(addDaysISO(date, -1)));
    const trend = (k, scale = 1) => dates.map(d => {
      const v = dayAgg(d)[k];
      return v == null ? null : v * scale;
    });
    return { cur, prev, trend };
  }, [heatmap, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const { cur, prev, trend } = cards;
  const avgDeltaPp = (cur.avg != null && prev.avg != null) ? (cur.avg - prev.avg) * 100 : 0;

  // ── Planned vs Actual load (selected day) ───────────────────────────────────
  const barNames = brigadirs.map(b => tl(b.name));
  const planned  = brigadirs.map(b => Math.round((b.baseline_util ?? 0) * 100));
  const actual   = brigadirs.map(b => Math.round((b.net_util ?? 0) * 100));

  // Ranking — P / A / P−A, mirroring the Overview page.
  const getRankVal = (b) => {
    if (rankMode === "planned") return b.baseline_util != null ? Math.round(b.baseline_util * 100) : 0;
    if (rankMode === "diff")    return (b.baseline_util != null && b.net_util != null)
                                       ? Math.round((b.baseline_util - b.net_util) * 100) : 0;
    return b.net_util != null ? Math.round(b.net_util * 100) : 0;
  };
  const diffColor = (d) => {
    if (d < -20) return "#3b82f6";
    if (d <= 0)  return "#22c55e";
    if (d <= 5)  return "#eab308";
    return "#ef4444";
  };
  const ranked    = [...brigadirs].sort((a, b) => getRankVal(a) - getRankVal(b));
  const rankNames = ranked.map(b => tl(b.name));
  const rankVals  = ranked.map(b => getRankVal(b));
  const rankColors = rankMode === "diff" ? rankVals.map(diffColor) : undefined;
  const rankXMin = rankMode === "diff" ? (rankVals.length ? Math.min(...rankVals, -5) : -5) : 0;
  const rankXMax = rankMode === "diff" ? (rankVals.length ? Math.max(...rankVals, 10) : 10) : undefined;
  const RANK_LABELS = { planned: t("overview.rankPlanned"), actual: t("overview.rankActual"), diff: t("overview.rankDiff") };

  const hasData = brigadirs.length > 0;

  const unitToggle = (
    <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: "1px solid var(--border-md)" }}>
      {["min", "hrs"].map(u => (
        <button
          key={u}
          onClick={() => setUnit(u)}
          className="px-3 py-1.5 font-medium"
          style={unit === u ? { background: "var(--brand)", color: "#fff" } : { background: "var(--bg-inner)", color: "var(--text-3)" }}
        >
          {u === "min" ? t("general.min") : t("general.hrs")}
        </button>
      ))}
    </div>
  );

  return (
    <Layout title={t("shiftDaily.title")} showFilters={false}>
      {/* Controls: date + unit */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <DayPicker value={date} onChange={setDate} />
        <div className="ml-auto">{unitToggle}</div>
      </div>

      {/* KPI cards — selected day vs the day before, with trend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {hmLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiDeltaCard
              label={t("overview.totalIdle")}
              tooltip={t("overview.tip.totalIdle")}
              value={fmtTime(cur.idle, unit)}
              prevValue={fmtTime(prev.idle, unit)}
              prevLabel={t("shiftDaily.prevDay")}
              delta={cur.idle - prev.idle}
              deltaText={signed(cur.idle - prev.idle, (v) => fmtTime(v, unit))}
              higherIsBetter={false}
              trend={trend("idle")}
            />
            <KpiDeltaCard
              label={t("overview.avgFinalWorkload")}
              tooltip={t("overview.tip.avgFinalWorkload")}
              value={fmtPct(cur.avg)}
              prevValue={fmtPct(prev.avg)}
              prevLabel={t("shiftDaily.prevDay")}
              delta={avgDeltaPp}
              deltaText={signed(avgDeltaPp, (v) => `${v.toFixed(1)}%`)}
              higherIsBetter
              accent
              trend={trend("avg", 100)}
            />
            <KpiDeltaCard
              label={t("overview.over100")}
              tooltip={t("overview.tip.over100")}
              value={String(cur.over)}
              prevValue={String(prev.over)}
              prevLabel={t("shiftDaily.prevDay")}
              delta={cur.over - prev.over}
              deltaText={signed(cur.over - prev.over, (v) => String(v))}
              higherIsBetter
              trend={trend("over")}
            />
            <KpiDeltaCard
              label={t("overview.under90")}
              tooltip={t("overview.tip.under90")}
              value={String(cur.under)}
              prevValue={String(prev.under)}
              prevLabel={t("shiftDaily.prevDay")}
              delta={cur.under - prev.under}
              deltaText={signed(cur.under - prev.under, (v) => String(v))}
              higherIsBetter={false}
              danger
              trend={trend("under")}
            />
          </>
        )}
      </div>

      {/* Planned vs Actual load — merges to a single difference bar on toggle */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("shiftDaily.loadTitle")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {loadDiff ? t("shiftDaily.loadSubDiff") : t("shiftDaily.loadSubGroup")}
            </div>
          </div>
          {/* P/A ↔ P−A switch */}
          <div className="flex rounded-lg overflow-hidden text-[10px] flex-shrink-0" style={{ border: "1px solid var(--border-md)" }}>
            {[[false, "P / A"], [true, "P−A"]].map(([m, label]) => (
              <button
                key={label}
                onClick={() => setLoadDiff(m)}
                className="px-2.5 py-1 font-medium"
                style={loadDiff === m ? { background: "var(--brand)", color: "#fff" } : { background: "var(--bg-inner)", color: "var(--text-3)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <SkeletonChart className="h-64" />
        ) : hasData ? (
          <LoadBarChart
            names={barNames}
            planned={planned}
            actual={actual}
            diffMode={loadDiff}
            height={320}
            plannedLabel={t("shiftDaily.planned")}
            actualLabel={t("shiftDaily.actual")}
            plannedSegments={plannedSegments}
            diffSegments={diffSegments}
          />
        ) : (
          <EmptyState title={t("shiftDaily.noData")} message={t("shiftDaily.noDataSub")} height="h-48" />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Table — click a supervisor → their daily page, read-only */}
        {isLoading || hasData ? (
          <BrigadirTable
            brigadirs={brigadirs}
            unit={unit}
            isLoading={isLoading}
            dateFrom={date}
            dateTo={date}
            diffSegments={diffSegments}
            onRowClick={(b) => navigate(`/daily?manager_id=${b.manager_id}&date=${date}`)}
          />
        ) : (
          <div className="flex-1 min-w-0">
            <EmptyState title={t("shiftDaily.noData")} message={t("shiftDaily.noDataSub")} />
          </div>
        )}

        {/* Ranking — Final Actual */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
                {t("overview.ranking").split("—")[0].trim()} — {RANK_LABELS[rankMode]}
              </div>
              {/* P / A / P−A toggle */}
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
            ) : hasData ? (
              <BarRankingChart
                names={rankNames}
                values={rankVals}
                colors={rankColors}
                xMin={rankXMin}
                xMax={rankXMax}
                seriesName={RANK_LABELS[rankMode]}
                height={Math.max(260, brigadirs.length * 32 + 60)}
              />
            ) : (
              <EmptyState title={t("empty.noRanking")} message={t("empty.uploadToRank")} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
