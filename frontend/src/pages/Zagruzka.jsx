import { createPortal } from "react-dom";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Info, Layers, UserRound } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import HeatmapChart, { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import ComparisonTable, { DEFAULT_DIFF_SEGMENTS, DEFAULT_CALC_FACTORS } from "../components/charts/ComparisonTable";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import CommentModal from "../components/ui/CommentModal";
import ColorGuideModal from "../components/ui/ColorGuideModal";
import { segmentBands } from "../utils/segments";
import { fulfilUtil, effUtil } from "../utils/formulas";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const HEATMAP_MODES = ["planned", "actual"];

// The header of every heatmap card on this page. The fleet heatmap passes only
// the originals and renders exactly as before; the two single-metric heatmaps
// pass a title, subtitle, formula note and guide heading of their own, and
// `showMode={false}` — they read ONE number, so there is no Plan/Fact switch to
// offer, and a toggle that changed nothing would be a control that lies.
function HeatmapHeader({
  heatmap, heatmapMode, setHeatmapMode, segments, fullscreen, onToggleFullscreen, t,
  title = null, subtitle = null, note = null, showMode = true, guideHeading = null,
}) {
  const [showGuide, setShowGuide] = useState(false); // info icon → color meanings modal
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Title + info icon — full width on mobile so buttons wrap to row 2 */}
        <div className="flex items-center gap-1.5 w-full sm:flex-1 sm:w-auto min-w-0">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {title || t("zagruzka.fleetHeatmap")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {(subtitle || t("zagruzka.finalDays")).replace("{n}", heatmap?.dates?.length ?? 0)}
            </div>
            {note && (
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {note}
              </div>
            )}
          </div>
          {/* Info icon right after title */}
          <button
            onClick={() => setShowGuide(true)}
            aria-label={t("zagruzka.colorGuide")}
            title={t("zagruzka.colorGuide")}
            className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-white/10"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
          >
            <Info size={14} />
          </button>
        </div>

        {/* Mode switcher + fullscreen — 2nd row on mobile */}
        <div className="flex items-center gap-2">
          {showMode && (
            <SegmentedToggle
              value={heatmapMode}
              onChange={setHeatmapMode}
              options={HEATMAP_MODES.map((m) => [m, t(`zagruzka.mode.${m}`)])}
            />
          )}
          <button
            onClick={onToggleFullscreen}
            title={fullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
            className="flex-shrink-0 h-[32px] w-[32px] flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {showGuide && (
        <ColorGuideModal
          title={t("zagruzka.colorGuide")}
          subtitle={t("zagruzka.colorGuideSub")}
          sections={[
            {
              heading: guideHeading || t("zagruzka.guide.workloadSection"),
              segments: segments?.length ? segments : DEFAULT_SEGMENTS,
            },
          ]}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Legend — derived live from the admin-panel thresholds */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] mb-3" style={{ color: "var(--text-3)" }}>
        {segmentBands(segments?.length ? segments : DEFAULT_SEGMENTS).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: color }}
            />
            <span style={{ color: "var(--text-3)" }}>{label}</span>
          </span>
        ))}
        {fullscreen && (
          <span className="ml-auto text-[10px]" style={{ color: "var(--text-4)" }}>
            Press <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>Esc</kbd> to exit
          </span>
        )}
      </div>
    </>
  );
}

// ONE card for both single-metric heatmaps, so they are identical by
// construction: the inline card (header + grid) and its fullscreen overlay,
// portaled to <body> for the reason every overlay on this page is — the
// .page-enter transform would otherwise contain a `position: fixed`.
function MetricHeatmapCard({
  which, cellValue, title, note, heatmap, hmLoading, segments,
  managerIds, commentedCells, approvedCells, onCellClick, openFull, setOpenFull, t,
}) {
  const full = openFull === which;
  const header = (isFull) => (
    <HeatmapHeader
      heatmap={heatmap}
      segments={segments}
      fullscreen={isFull}
      onToggleFullscreen={() => setOpenFull(isFull ? null : which)}
      title={title}
      subtitle={t("zagruzka.periodDays")}
      note={note}
      guideHeading={title}
      showMode={false}
      t={t}
    />
  );
  const grid = (isFull) => (
    <HeatmapChart
      dates={heatmap.dates}
      managers={heatmap.managers}
      data={heatmap.data}
      cellValue={cellValue}
      managerIds={managerIds}
      segments={segments}
      commentedCells={commentedCells}
      approvedCells={approvedCells}
      onCellClick={onCellClick}
      fullscreen={isFull}
    />
  );
  return (
    <>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        {header(false)}
        {hmLoading ? (
          <SkeletonChart className="h-64" />
        ) : heatmap?.managers?.length ? (
          grid(false)
        ) : (
          <EmptyState title={t("zagruzka.noHeatmap")} message={t("zagruzka.noHeatmapMsg")} height="h-48" />
        )}
      </div>

      {full && heatmap?.managers?.length ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
        >
          <div
            className="flex-shrink-0 px-4 lg:px-6 py-3"
            style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
          >
            {header(true)}
          </div>
          <div className="flex-1 overflow-hidden" style={{ height: 0 }}>
            {grid(true)}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

export default function Zagruzka() {
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const [heatmapMode, setHeatmapMode] = usePersistentState("zagruzka_heatmap_mode", "actual");
  // Which overlay is open: null | "comp" | "simple" | "heatmap" | "fulfil" | "eff".
  // ONE value, so two overlays can never be open at once and Escape closes
  // whichever it is — a flag per overlay let the simplified table's slip past
  // the Escape handler, which only knew the two original ones.
  const [openFull, setOpenFull] = useState(null);
  const [comment, setComment] = useState(null);
  // Admin-only comparison-table factor toggles — lifted here so the inline and
  // fullscreen table instances share one state. Resets to all-ON per visit.
  const [calcFactors, setCalcFactors] = useState(DEFAULT_CALC_FACTORS);

  function handleCellClick(name, d, _v, cell) {
    setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, mode: heatmapMode });
  }

  // The two single-metric heatmaps open the (brigadir, date) comment THREAD
  // with their own formula above it (the operator's choice) — unlike the fleet
  // heatmap, which opens its formula alone. `basis` is what makes the «how it's
  // calculated» block explain THIS table's number and not the fleet's.
  const metricCellClick = (basis) => (name, d, _v, cell) => {
    setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, basis, formulaOnly: false });
  };

  // Close fullscreen on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpenFull(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Every request on this page carries the active plant (see FactoryContext);
  // on «All factories» the key is absent and the calls are byte-identical to
  // what they were before factories existed.
  const fparams = useFactoryParams(params);
  // Plant switcher as a FilterPanel section (null on single-plant installs,
  // an inert chip for locked viewers).
  const factorySection = useFactorySection();

  const { data: heatmap, isLoading: hmLoading } = useQuery({
    queryKey: ["heatmap", fparams],
    queryFn: () => api.get("/api/heatmap", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });

  const { data: thresholdData } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
    staleTime: 60_000,
  });
  const segments = thresholdData?.segments ?? [
    { from: 0,   color: "#ef4444" },
    { from: 85,  color: "#22c55e" },
    { from: 101, color: "#3b82f6" },
  ];

  const { data: compThresholdData } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const diffSegments = compThresholdData?.diff_segments ?? DEFAULT_DIFF_SEGMENTS;
  const pSegments    = compThresholdData?.p_segments    ?? [];

  const { data: brigadirs = [], isLoading: brigLoading } = useQuery({
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

  const managerIds = Object.fromEntries(brigadirs.map((b) => [b.name, b.manager_id]));

  // Fetch all comments for the visible date range to mark cells
  const { data: rangeComments = [] } = useQuery({
    queryKey: ["comments-range", params],
    queryFn: () => api.get("/api/comments", { params: { date_from: params.date_from, date_to: params.date_to } }).then(r => r.data),
    enabled: ready && !!params.date_from,
  });
  // Set of "managerId_isoDate" for O(1) lookup
  const commentedCells = new Set(rangeComments.map(c => `${c.manager_id}_${c.date}`));

  // Approved (manager, date) cells — gates what's shown on the heatmap/comparison.
  // null until loaded so nothing is muted prematurely.
  const { data: approvedData } = useQuery({
    queryKey: ["approved-cells", params.date_from, params.date_to],
    queryFn: () => api.get("/api/staff/approvals/cells", {
      params: { date_from: params.date_from, date_to: params.date_to },
    }).then(r => r.data),
    enabled: ready && !!params.date_from,
  });
  const approvedCells = approvedData
    ? new Set(approvedData.cells.map(c => `${c.manager_id}_${c.date}`))
    : null;

  const n = brigadirs.filter(b => b.net_util !== null).length || 1;
  const fleetFunnel = {
    baseline_util:    brigadirs.reduce((s, b) => s + (b.baseline_util    || 0), 0) / n,
    adjusted_util:    brigadirs.reduce((s, b) => s + (b.adjusted_util    || 0), 0) / n,
    after_idle_util:  brigadirs.reduce((s, b) => s + (b.after_idle_util  || 0), 0) / n,
    after_early_util: brigadirs.reduce((s, b) => s + (b.after_early_util || 0), 0) / n,
    net_util:         brigadirs.reduce((s, b) => s + (b.net_util         || 0), 0) / n,
  };

  return (
    <Layout title={t("zagruzka.subtitle")}>
      {/* ONE-ROW filter bar: the period (the control people actually touch every
          visit) stays inline; plant / shift / supervisor live inside the shared
          FilterPanel and surface as chips whenever they narrow the page. */}
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

      {/* ── Comparison Table ── */}
      {heatmap?.managers?.length ? (
        <div className="mb-6">
          <ComparisonTable
            dates={heatmap.dates}
            managers={heatmap.managers}
            data={heatmap.data}
            pSegments={pSegments}
            diffSegments={diffSegments}
            managerIds={managerIds}
            approvedCells={approvedCells}
            commentedCells={commentedCells}
            calcFactors={calcFactors}
            onCalcFactorsChange={setCalcFactors}
            columnSummary
            title={t("zagruzka.fullTable")}
            note={t("zagruzka.fullTableNote")}
            onToggleFullscreen={() => setOpenFull("comp")}
          />
        </div>
      ) : null}

      {/* ── Comparison Table — «Soddalashtirilgan hisob» ──
          The SAME grid, the SAME data, the SAME colour bands (so an admin
          editing the thresholds moves both at once) and the same P·A·D toggle,
          sort, summaries, pending markers and comment threads. One thing
          differs, and it is the whole reason the table exists: both halves are
          divided by the unit's people × a productive shift —
            P = «Ishlab chiqarish plani» ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
            A = «Trudoyomkost»           ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
          — with none of the full formula's four corrections, which is why it is
          passed no calcFactors and draws no ⚙. ── */}
      {heatmap?.managers?.length ? (
        <div className="mb-6">
          <ComparisonTable
            dates={heatmap.dates}
            managers={heatmap.managers}
            data={heatmap.data}
            pSegments={pSegments}
            diffSegments={diffSegments}
            managerIds={managerIds}
            approvedCells={approvedCells}
            commentedCells={commentedCells}
            basis="simple"
            columnSummary
            title={t("zagruzka.simpleTable")}
            note={t("zagruzka.simpleTableNote")}
            onToggleFullscreen={() => setOpenFull("simple")}
          />
        </div>
      ) : null}

      {/* ── Comparison Table fullscreen overlay — portaled to <body> so its
          `fixed inset-0` anchors to the viewport, not the .page-enter transform
          (see the DateRangePicker fix). ── */}
      {openFull === "comp" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
        >
          <div className="flex-1 overflow-auto p-4">
            <ComparisonTable
              dates={heatmap.dates}
              managers={heatmap.managers}
              data={heatmap.data}
              pSegments={pSegments}
              diffSegments={diffSegments}
              managerIds={managerIds}
              approvedCells={approvedCells}
              commentedCells={commentedCells}
              calcFactors={calcFactors}
              onCalcFactorsChange={setCalcFactors}
              columnSummary
              title={t("zagruzka.fullTable")}
              note={t("zagruzka.fullTableNote")}
              fullscreen
              onToggleFullscreen={() => setOpenFull(null)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Simplified table fullscreen — portaled for the same reason. */}
      {openFull === "simple" && heatmap?.managers?.length ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
        >
          <div className="flex-1 overflow-auto p-4">
            <ComparisonTable
              dates={heatmap.dates}
              managers={heatmap.managers}
              data={heatmap.data}
              pSegments={pSegments}
              diffSegments={diffSegments}
              managerIds={managerIds}
              approvedCells={approvedCells}
              commentedCells={commentedCells}
              basis="simple"
              columnSummary
              title={t("zagruzka.simpleTable")}
              note={t("zagruzka.simpleTableNote")}
              fullscreen
              onToggleFullscreen={() => setOpenFull(null)}
            />
          </div>
        </div>,
        document.body
      ) : null}

      {/* ── Fleet Heatmap ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <HeatmapHeader
          heatmap={heatmap}
          heatmapMode={heatmapMode}
          setHeatmapMode={setHeatmapMode}
          segments={segments}
          fullscreen={false}
          onToggleFullscreen={() => setOpenFull("heatmap")}
          t={t}
        />
        {hmLoading ? (
          <SkeletonChart className="h-64" />
        ) : heatmap?.managers?.length ? (
          <HeatmapChart dates={heatmap.dates} managers={heatmap.managers} data={heatmap.data} mode={heatmapMode} managerIds={managerIds} segments={segments} commentedCells={commentedCells} approvedCells={approvedCells} onCellClick={handleCellClick} />
        ) : (
          <EmptyState title={t("zagruzka.noHeatmap")} message={t("zagruzka.noHeatmapMsg")} height="h-48" />
        )}
      </div>

      {/* ── Fleet Heatmap fullscreen overlay ── */}
      {openFull === "heatmap" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
        >
          {/* Header */}
          <div
            className="flex-shrink-0 px-4 lg:px-6 py-3"
            style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
          >
            <HeatmapHeader
              heatmap={heatmap}
              heatmapMode={heatmapMode}
              setHeatmapMode={setHeatmapMode}
              segments={segments}
              fullscreen={true}
              onToggleFullscreen={() => setOpenFull(null)}
              t={t}
            />
          </div>

          {/* Scrollable table — no padding, fills remaining height */}
          <div className="flex-1 overflow-hidden" style={{ height: 0 }}>
            {heatmap?.managers?.length ? (
              <HeatmapChart
                dates={heatmap.dates}
                managers={heatmap.managers}
                data={heatmap.data}
                mode={heatmapMode}
                managerIds={managerIds}
                segments={segments}
                commentedCells={commentedCells}
                approvedCells={approvedCells}
                onCellClick={handleCellClick}
                fullscreen
              />
            ) : (
              <EmptyState title={t("zagruzka.noHeatmap")} message={t("zagruzka.noHeatmapMsg")} height="h-48" />
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Two single-metric heatmaps: copies of the fleet heatmap above ──
          Same grid, same admin colour bands (an edit on the admin panel moves
          all three at once), same pending markers, sort and AVG/MAX/MIN —
          each reading ONE number per unit-day through `cellValue`:
            Reja bajarilishi = TRUDOYOMKOST ÷ ISHLAB CHIQARISH PLANI
            Samaradorlik     = TRUDOYOMKOST ÷ (verifix min × 0.9
                               − XODIMLAR × (ojidaniya + early + 10))
          utils/formulas.js is the definition of both. ── */}
      <MetricHeatmapCard
        which="fulfil"
        cellValue={fulfilUtil}
        title={t("zagruzka.fulfilTable")}
        note={t("zagruzka.fulfilNote")}
        heatmap={heatmap} hmLoading={hmLoading} segments={segments}
        managerIds={managerIds} commentedCells={commentedCells} approvedCells={approvedCells}
        onCellClick={metricCellClick("fulfil")}
        openFull={openFull} setOpenFull={setOpenFull} t={t}
      />
      <MetricHeatmapCard
        which="eff"
        cellValue={effUtil}
        title={t("zagruzka.effTable")}
        note={t("zagruzka.effNote")}
        heatmap={heatmap} hmLoading={hmLoading} segments={segments}
        managerIds={managerIds} commentedCells={commentedCells} approvedCells={approvedCells}
        onCellClick={metricCellClick("eff")}
        openFull={openFull} setOpenFull={setOpenFull} t={t}
      />

      {/* Fleet Funnel */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
          {t("zagruzka.funnelTitle")}
        </div>
        <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
          {t("zagruzka.funnelSub")}
        </div>
        {brigLoading ? (
          <SkeletonChart className="h-48" />
        ) : brigadirs.length ? (
          <DifferenceBreakdown data={fleetFunnel} height={280} diffSegments={diffSegments} />
        ) : (
          <EmptyState title={t("zagruzka.noFunnelData")} message={t("zagruzka.noFunnelMsg")} height="h-48" />
        )}
      </div>

      {comment && (
        <CommentModal
          managerId={comment.managerId}
          managerName={comment.managerName}
          date={comment.date}
          rawCell={comment.rawCell}
          mode={comment.mode}
          basis={comment.basis}
          onClose={() => setComment(null)}
          formulaOnly={comment.formulaOnly ?? true}
          formulaCollapsible={comment.formulaOnly === false}
        />
      )}
    </Layout>
  );
}
