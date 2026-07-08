import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Info } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import HeatmapChart, { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import ComparisonTable, { DEFAULT_DIFF_SEGMENTS } from "../components/charts/ComparisonTable";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import CommentModal from "../components/ui/CommentModal";
import ColorGuideModal from "../components/ui/ColorGuideModal";
import { segmentBands } from "../utils/segments";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonChart } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import api from "../utils/api";

const HEATMAP_MODES = ["planned", "actual"];

function HeatmapHeader({ heatmap, heatmapMode, setHeatmapMode, segments, fullscreen, onToggleFullscreen, t }) {
  const [showGuide, setShowGuide] = useState(false); // info icon → color meanings modal
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Title + info icon — full width on mobile so buttons wrap to row 2 */}
        <div className="flex items-center gap-1.5 w-full sm:flex-1 sm:w-auto min-w-0">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("zagruzka.fleetHeatmap")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {t("zagruzka.finalDays").replace("{n}", heatmap?.dates?.length ?? 0)}
            </div>
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
          <SegmentedToggle
            value={heatmapMode}
            onChange={setHeatmapMode}
            options={HEATMAP_MODES.map((m) => [m, t(`zagruzka.mode.${m}`)])}
          />
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-white/10"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
            title={fullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {showGuide && (
        <ColorGuideModal
          title={t("zagruzka.colorGuide")}
          subtitle={t("zagruzka.colorGuideSub")}
          sections={[
            {
              heading: t("zagruzka.guide.workloadSection"),
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

export default function Zagruzka() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  const [heatmapMode, setHeatmapMode] = useState("actual");
  const [heatmapFullscreen, setHeatmapFullscreen] = useState(false);
  const [compFullscreen, setCompFullscreen] = useState(false);
  const [comment, setComment] = useState(null);

  function handleCellClick(name, d, _v, cell) {
    setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, mode: heatmapMode });
  }

  // Close fullscreen on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setHeatmapFullscreen(false);
        setCompFullscreen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { data: heatmap, isLoading: hmLoading } = useQuery({
    queryKey: ["heatmap", params],
    queryFn: () => api.get("/api/heatmap", { params }).then((r) => r.data),
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
    queryKey: ["brigadirs", params],
    queryFn: () => api.get("/api/brigadirs", { params }).then((r) => r.data),
    enabled: ready,
  });

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
            onToggleFullscreen={() => setCompFullscreen(true)}
          />
        </div>
      ) : null}

      {/* ── Comparison Table fullscreen overlay ── */}
      {compFullscreen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)" }}
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
              fullscreen
              onToggleFullscreen={() => setCompFullscreen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Fleet Heatmap ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <HeatmapHeader
          heatmap={heatmap}
          heatmapMode={heatmapMode}
          setHeatmapMode={setHeatmapMode}
          segments={segments}
          fullscreen={false}
          onToggleFullscreen={() => setHeatmapFullscreen(true)}
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
      {heatmapFullscreen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)" }}
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
              onToggleFullscreen={() => setHeatmapFullscreen(false)}
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
        </div>
      )}

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
          onClose={() => setComment(null)}
          formulaOnly
        />
      )}
    </Layout>
  );
}
