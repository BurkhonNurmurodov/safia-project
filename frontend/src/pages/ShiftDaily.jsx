import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layers } from "lucide-react";
import Layout from "../components/layout/Layout";
import DayStepper from "../components/ui/DayStepper";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import KpiDeltaCard from "../components/ui/KpiDeltaCard";
import LoadBarChart from "../components/charts/LoadBarChart";
import { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import { DEFAULT_DIFF_SEGMENTS } from "../components/charts/ComparisonTable";
import BarRankingChart from "../components/charts/BarChart";
import BrigadirTable from "../components/ui/BrigadirTable";
import ShiftReportTable from "../components/overview/ShiftReportTable";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonCard, SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useAuth } from "../context/AuthContext";
import { useFactoryParams } from "../context/FactoryContext";
import { usePersistentState } from "../hooks/usePersistentState";
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
  const { unit, setUnit, shift: shiftPick, setShift } = useFilters();
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Remembered across navigations; an explicit ?date= in the URL (e.g.
  // returning from a drill-down) beats the stored value.
  const [date, setDate] = usePersistentState("shift_daily_date", () => isoDaysAgo(1));
  useEffect(() => {
    const urlDate = searchParams.get("date");
    if (urlDate) setDate(urlDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [loadDiff, setLoadDiff] = usePersistentState("shift_daily_load_diff", false);
  const [rankMode, setRankMode] = usePersistentState("shift_daily_rank_mode", "actual"); // "planned" | "actual" | "diff"

  const winFrom = addDaysISO(date, -(WINDOW_DAYS - 1));

  // Scope: plant → shift, picked in the FilterPanel like every other page. The
  // plant is the shared FactoryContext value and the shift the shared
  // FilterContext one, so a pick carries across Overview, Zagruzka and
  // Ojidaniya. A SHIFT-MANAGER works one shift and the board below is locked to
  // it server-side, so the whole page reads that shift for them and states it
  // as an inert chip — S1/S2 there would put another shift's cards over an
  // empty board. Their shift is read off their own units, which
  // /api/staff/supervisors already scopes to it.
  const isShiftManager = auth?.role === "shift-manager";
  const { data: supervisors = [], isFetched: supsFetched } = useQuery({
    queryKey: ["staff-supervisors"],
    queryFn: () => api.get("/api/staff/supervisors").then(r => r.data),
    staleTime: 120_000,
    enabled: isShiftManager,
  });
  const ownShift = isShiftManager ? (supervisors[0]?.shift ?? null) : null;
  const shift = isShiftManager ? ownShift : shiftPick;
  // A shift-manager whose shift is unknown reads nothing rather than both
  // shifts: /api/brigadirs and /api/heatmap do not pin a shift themselves.
  const scopePending = isShiftManager && !supsFetched;
  const scopeKnown = !isShiftManager || ownShift != null;

  const dayBase = useMemo(
    () => ({ date_from: date, date_to: date, ...(shift ? { shift } : {}) }), [date, shift]);
  const winBase = useMemo(
    () => ({ date_from: winFrom, date_to: date, ...(shift ? { shift } : {}) }), [winFrom, date, shift]);
  const dayParams = useFactoryParams(dayBase);
  const winParams = useFactoryParams(winBase);

  const { data: brigadirs = [], isLoading: brigLoading } = useQuery({
    queryKey: ["shift-daily-brigadirs", dayParams],
    queryFn: () => api.get("/api/brigadirs", { params: dayParams }).then(r => r.data),
    enabled: scopeKnown,
  });

  const { data: heatmap, isLoading: heatLoading } = useQuery({
    queryKey: ["shift-daily-heatmap", winParams],
    queryFn: () => api.get("/api/heatmap", { params: winParams }).then(r => r.data),
    enabled: scopeKnown,
  });
  // While the scope is still resolving the page is loading, not empty.
  const isLoading = brigLoading || scopePending;
  const hmLoading = heatLoading || scopePending;

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

  // Plant switcher (null on a single-plant install, an inert chip for a
  // locked viewer), then the shift.
  const factorySection = useFactorySection();
  const shiftSection = isShiftManager
    ? (ownShift != null && {
        key: "shift", icon: Layers, static: true,
        label: t("filter.shift"), display: `S${ownShift}`,
      })
    : {
        key: "shift", icon: Layers, label: t("filter.shift"),
        active: shiftPick != null,
        display: shiftPick != null ? `S${shiftPick}` : "",
        onClear: () => setShift(null),
        render: () => (
          <SegmentedToggle
            fill
            value={shiftPick}
            onChange={setShift}
            options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
          />
        ),
      };

  const unitToggle = (
    <SegmentedToggle
      value={unit}
      onChange={setUnit}
      options={[["min", t("general.min")], ["hrs", t("general.hrs")]]}
    />
  );

  return (
    <Layout title={t("shiftDaily.title")}>
      {/* ONE-ROW filter bar: the day inline, plant / shift inside the shared
          FilterPanel (active narrowings surface as chips), the unit at the
          right edge. The panel stays a DIRECT child of this row — its fit
          check measures the row's children. */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <DayStepper value={date} onChange={setDate} />
        <FilterPanel sections={[factorySection, shiftSection].filter(Boolean)} />
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

      {/* «Smena hisoboti» — the shift's status board, under the KPI cards: one
          row per brigadir with today's load, yesterday's completion, quality
          closure and open concerns. It moved here from Overview (the
          operator's directive, 2026-09-16), which is where a shift manager's
          day is read.

          **The day stepper above does NOT reach it**, exactly as Overview's
          period picker did not: every figure on it comes from the page that
          owns it, over that page's own fixed window, and each column prints
          the window and the date it is showing. Wiring it to the stepper would
          mean recomputing four figures here, which is the one thing this board
          may never do. The plant and the shift in the filter bar DO reach it:
          they are scope, not period.

          It fetches LAST: one of its requests can run the «Zagruzka fayli»
          engine twice per configured unit, and fired with the page's own
          queries it takes the seconds the cards and the charts need to paint. */}
      <ShiftReportTable shift={shift} pageReady={!isLoading && !hmLoading} />

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
          <SegmentedToggle
            className="flex-shrink-0"
            value={loadDiff}
            onChange={setLoadDiff}
            options={[[false, "P / A"], [true, "P−A"]]}
          />
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
              <SegmentedToggle
                className="flex-shrink-0"
                value={rankMode}
                onChange={setRankMode}
                options={[["planned", "P"], ["actual", "A"], ["diff", "P−A"]]}
              />
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
