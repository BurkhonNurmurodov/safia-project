import { createPortal } from "react-dom";
import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Info, Layers, UserRound, SlidersHorizontal } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import HeatmapChart, { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import ComparisonTable, { DEFAULT_CALC_FACTORS } from "../components/charts/ComparisonTable";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import CommentModal from "../components/ui/CommentModal";
import ColorGuideModal from "../components/ui/ColorGuideModal";
import TableBandsModal, { useZagruzkaBands } from "../components/zagruzka/TableBandsModal";
import { useToast } from "../components/ui/Toast";
import { segmentBands } from "../utils/segments";
import { fulfilUtil, effUtil } from "../utils/formulas";
import EmptyState from "../components/ui/EmptyState";
import { listChartDays } from "../utils/chartRange";
import { useFilters } from "../context/FilterContext";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const HEATMAP_MODES = ["planned", "actual"];

// Stand-ins while the payload is in flight — module constants, so the memoised
// grids are not handed a new empty array/object on every render.
const NO_ROWS = [];
const NO_DATA = {};

// The comparison tables, in page order, keyed by their `basis` — which is also
// their band-table key and their fullscreen key — with the words each prints.
const COMPARISON = {
  full:   { title: "zagruzka.fullTable",   note: "zagruzka.fullTableNote" },
  full90: { title: "zagruzka.full90Table", note: "zagruzka.full90TableNote" },
  simple: { title: "zagruzka.simpleTable", note: "zagruzka.simpleTableNote" },
};

// The header of every heatmap card on this page. The fleet heatmap passes only
// the originals and renders exactly as before; the two single-metric heatmaps
// pass a title, subtitle, formula note and guide heading of their own, and
// `showMode={false}` — they read ONE number, so there is no Plan/Fact switch to
// offer, and a toggle that changed nothing would be a control that lies.
// `onEditBands` opens the card's own colour-band editor; the page passes it to
// admins only.
function HeatmapHeader({
  heatmap, heatmapMode, setHeatmapMode, segments, fullscreen, onToggleFullscreen, t,
  title = null, subtitle = null, note = null, showMode = true, guideHeading = null,
  onEditBands = null,
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
          {onEditBands && (
            <button
              onClick={onEditBands}
              aria-label={t("zagruzka.bands.open")}
              title={t("zagruzka.bands.open")}
              className="flex-shrink-0 h-[32px] w-[32px] flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
            >
              <SlidersHorizontal size={16} />
            </button>
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
          subtitle={t("zagruzka.colorGuideSub").replace("{page}", t("nav.zagruzka"))}
          sections={[
            {
              heading: guideHeading || t("zagruzka.guide.workloadSection"),
              segments: segments?.length ? segments : DEFAULT_SEGMENTS,
            },
          ]}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Legend — derived live from this card's own bands */}
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
const MetricHeatmapCard = memo(function MetricHeatmapCard({
  which, cellValue, title, note, heatmap, hmLoading, segments,
  managerIds, commentedCells, approvedCells, onCellClick, full, setOpenFull, t,
  skDates, skRows, onEditBands = null,
}) {
  const header = (isFull) => (
    <HeatmapHeader
      heatmap={heatmap ?? { dates: skDates }}
      segments={segments}
      fullscreen={isFull}
      onToggleFullscreen={() => setOpenFull(isFull ? null : which)}
      title={title}
      subtitle={t("zagruzka.periodDays")}
      note={note}
      guideHeading={title}
      showMode={false}
      onEditBands={onEditBands}
      t={t}
    />
  );
  const body = (isFull) => (hmLoading ? (
    <HeatmapChart
      loading loadingRows={skRows}
      dates={skDates} managers={[]} data={{}}
      segments={segments}
      fullscreen={isFull}
    />
  ) : heatmap?.managers?.length ? grid(isFull) : (
    <EmptyState title={t("zagruzka.noHeatmap")} message={t("zagruzka.noHeatmapMsg")} height="h-48" />
  ));
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
        {body(false)}
      </div>

      {full ? createPortal(
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
            {body(true)}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
});

export default function Zagruzka() {
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, brigadirIds, setBrigadirIds, shift, setShift } = useFilters();
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const [heatmapMode, setHeatmapMode] = usePersistentState("zagruzka_heatmap_mode", "actual");
  // Which overlay is open: null | "full" | "full90" | "simple" | "heatmap" |
  // "fulfil" | "eff". ONE value, so two overlays can never be open at once and
  // Escape closes whichever it is — a flag per overlay let the simplified
  // table's slip past the Escape handler, which only knew the two original ones.
  const [openFull, setOpenFull] = useState(null);
  // Whose colour bands are being edited: null | "full" | "full90" | "simple" |
  // "load" | "fulfil" | "eff" — one editor at a time, admins only.
  const [bandsFor, setBandsFor] = useState(null);
  const bandsOpen = useRef(false);
  bandsOpen.current = bandsFor != null;
  const toast = useToast();
  const [comment, setComment] = useState(null);
  // Admin-only comparison-table factor toggles — lifted here so the inline and
  // fullscreen table instances share one state. Resets to all-ON per visit.
  const [calcFactors, setCalcFactors] = useState(DEFAULT_CALC_FACTORS);

  // Escape closes the band editor first (it sits above any overlay, and the
  // overlay under it must not vanish while it is open), else fullscreen.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (bandsOpen.current) setBandsFor(null);
      else setOpenFull(null);
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

  // `isPending`, not `isLoading`: before the filters are `ready` the query is
  // disabled, isLoading reads false and the page flashed «no data» first.
  // `units=1` also returns the per-unit rows /api/brigadirs serves (the funnel,
  // the name → id map), built from the SAME computation: asking /api/brigadirs
  // as well ran the whole загрузка a second time for the same period.
  const { data: heatmap, isPending: hmLoading } = useQuery({
    queryKey: ["heatmap", fparams, "units"],
    queryFn: () => api.get("/api/heatmap", { params: { ...fparams, units: 1 } }).then((r) => r.data),
    enabled: ready,
  });

  // Every table on this page paints with its OWN bands (components/zagruzka/
  // TableBandsModal.jsx) — six tables, six sets, one request.
  const { bands, keys: bandKeys, shared: bandShared } = useZagruzkaBands();
  const segments = bands.load.segments;
  const diffSegments = bands.full.diff_segments;   // the funnel keeps the full table's D bands

  // A backend older than this bundle answers without `units` — the seconds of
  // a deploy between the new files landing and the restart. Read them the old
  // way then, rather than draw an empty funnel.
  const legacyUnits = ready && !!heatmap && !Array.isArray(heatmap.units);
  const { data: oldUnits, isPending: oldUnitsLoading } = useQuery({
    queryKey: ["brigadirs", fparams],
    queryFn: () => api.get("/api/brigadirs", { params: fparams }).then((r) => r.data),
    enabled: legacyUnits,
  });
  const brigadirs = useMemo(() => heatmap?.units ?? oldUnits ?? NO_ROWS, [heatmap, oldUnits]);
  const brigLoading = hmLoading || (legacyUnits && oldUnitsLoading);

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

  // Everything the six grids are handed is held stable from here down: they
  // are memoised, and a new object or function on every render would redraw
  // all of them on any state change on the page (a popup opening, a toggle).
  const managerIds = useMemo(
    () => Object.fromEntries(brigadirs.map((b) => [b.name, b.manager_id])), [brigadirs]);

  const handleCellClick = useCallback((name, d, _v, cell) => {
    setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, mode: heatmapMode });
  }, [managerIds, heatmapMode]);

  // The two single-metric heatmaps open the (brigadir, date) comment THREAD
  // with their own formula above it (the operator's choice) — unlike the fleet
  // heatmap, which opens its formula alone. `basis` is what makes the «how it's
  // calculated» block explain THIS table's number and not the fleet's.
  const metricCellClick = useMemo(() => {
    const open = (basis) => (name, d, _v, cell) => {
      setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, basis, formulaOnly: false });
    };
    return { fulfil: open("fulfil"), eff: open("eff") };
  }, [managerIds]);

  // One stable opener per overlay, and one closer.
  const fullToggle = useMemo(() => ({
    open: Object.fromEntries([...Object.keys(COMPARISON), "heatmap"].map((k) => [k, () => setOpenFull(k)])),
    close: () => setOpenFull(null),
  }), []);

  // ── The loading frame ──
  // Every grid on this page keeps its real shape while /api/heatmap is in
  // flight. The COLUMNS are known exactly — the endpoint returns every day of
  // the picked period — so the gold headers print the real dates. The ROWS are
  // an estimate: the picked brigadirs, one for a viewer locked to their own
  // unit, else the plant's units on the picked shift (the heatmap drops only
  // the ones with no data at all in the period).
  const { auth } = useAuth();
  // The band editors are the admin's; nobody else is offered the button, and
  // the write behind it (`PUT /admin/settings`) refuses anybody else anyway.
  const isAdmin = auth?.role === "admin";
  const bandEditors = useMemo(() => (isAdmin
    ? Object.fromEntries(["full", "full90", "simple", "load", "fulfil", "eff"]
        .map((k) => [k, () => setBandsFor(k)]))
    : NO_DATA), [isAdmin]);
  const editBands = (table) => bandEditors[table] ?? null;
  const skDates = useMemo(
    () => listChartDays(dateFrom, dateTo).map((iso) => iso.split("-").reverse().join(".")),
    [dateFrom, dateTo]);
  const skRows = brigadirIds.length
    ? brigadirIds.length
    : ["supervisor", "leader"].includes(auth?.role)
      ? 1
      : Math.min(scopedSupervisors.filter((s) => shift == null || s.shift === shift).length, 40) || 8;

  // Fetch all comments for the visible date range to mark cells
  const { data: rangeComments } = useQuery({
    queryKey: ["comments-range", params],
    queryFn: () => api.get("/api/comments", { params: { date_from: params.date_from, date_to: params.date_to } }).then(r => r.data),
    enabled: ready && !!params.date_from,
  });
  // Set of "managerId_isoDate" for O(1) lookup
  const commentedCells = useMemo(
    () => new Set((rangeComments ?? NO_ROWS).map(c => `${c.manager_id}_${c.date}`)),
    [rangeComments]);

  // Approved (manager, date) cells — gates what's shown on the heatmap/comparison.
  // null until loaded so nothing is muted prematurely.
  const { data: approvedData } = useQuery({
    queryKey: ["approved-cells", params.date_from, params.date_to],
    queryFn: () => api.get("/api/staff/approvals/cells", {
      params: { date_from: params.date_from, date_to: params.date_to },
    }).then(r => r.data),
    enabled: ready && !!params.date_from,
  });
  const approvedCells = useMemo(
    () => (approvedData ? new Set(approvedData.cells.map(c => `${c.manager_id}_${c.date}`)) : null),
    [approvedData]);

  const fleetFunnel = useMemo(() => {
    const n = brigadirs.filter(b => b.net_util !== null).length || 1;
    return {
      baseline_util:    brigadirs.reduce((s, b) => s + (b.baseline_util    || 0), 0) / n,
      adjusted_util:    brigadirs.reduce((s, b) => s + (b.adjusted_util    || 0), 0) / n,
      after_idle_util:  brigadirs.reduce((s, b) => s + (b.after_idle_util  || 0), 0) / n,
      after_early_util: brigadirs.reduce((s, b) => s + (b.after_early_util || 0), 0) / n,
      net_util:         brigadirs.reduce((s, b) => s + (b.net_util         || 0), 0) / n,
    };
  }, [brigadirs]);

  // One comparison table, inline or fullscreen. The tables differ only in the
  // arithmetic they read (`basis`), the bands they paint with and their words,
  // so one set of props serves all three and they cannot drift apart. The
  // fullscreen copy is only mounted once the data is in, so it never loads.
  const comparisonTable = (which, isFull) => (
    <ComparisonTable
      loading={!isFull && hmLoading}
      loadingRows={skRows}
      dates={heatmap?.dates ?? skDates}
      managers={heatmap?.managers ?? NO_ROWS}
      data={heatmap?.data ?? NO_DATA}
      pSegments={bands[which].p_segments}
      diffSegments={bands[which].diff_segments}
      managerIds={managerIds}
      approvedCells={approvedCells}
      commentedCells={commentedCells}
      basis={which}
      {...(which === "full" ? { calcFactors, onCalcFactorsChange: setCalcFactors } : {})}
      onEditBands={editBands(which)}
      columnSummary
      title={t(COMPARISON[which].title)}
      note={t(COMPARISON[which].note)}
      fullscreen={isFull}
      onToggleFullscreen={isFull ? fullToggle.close : fullToggle.open[which]}
    />
  );

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

      {/* ── The three comparison tables ──
          ONE grid read three ways — `basis` IS the table key — each with
          colour bands of its OWN, set from its own button, and the same P·A·D
          toggle, sort, summaries, pending markers and comment threads:
            full   «To'liq hisob» — the platform's official загрузка, and the
                   only one carrying the ⚙ factors (admin what-ifs on it)
            full90 «To'liq hisob · Verifix × 0.9» — the same formula with the
                   Verifix hours credited at 0.9 instead of 0.85. Its P IS the
                   full table's (no Verifix term); only A moves, downward
            simple «Smena boshi va Smena oxiri Zagruzka» — both halves over the
                   unit's people × a productive shift:
                     P = «Ishlab chiqarish plani» ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
                     A = «Trudoyomkost»           ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
                   with none of the full formula's four corrections
          The two twins are passed no calcFactors and draw no ⚙. ── */}
      {hmLoading || heatmap?.managers?.length
        ? Object.keys(COMPARISON).map((which) => (
            <div key={which} className="mb-6">{comparisonTable(which, false)}</div>
          ))
        : null}

      {/* ── Comparison table fullscreen overlay — portaled to <body> so its
          `fixed inset-0` anchors to the viewport, not the .page-enter transform
          (see the DateRangePicker fix). ── */}
      {COMPARISON[openFull] && heatmap?.managers?.length ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
        >
          <div className="flex-1 overflow-auto p-4">
            {comparisonTable(openFull, true)}
          </div>
        </div>,
        document.body
      ) : null}

      {/* ── Fleet Heatmap ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <HeatmapHeader
          heatmap={heatmap ?? { dates: skDates }}
          heatmapMode={heatmapMode}
          setHeatmapMode={setHeatmapMode}
          segments={segments}
          fullscreen={false}
          onToggleFullscreen={() => setOpenFull("heatmap")}
          onEditBands={editBands("load")}
          t={t}
        />
        {hmLoading ? (
          <HeatmapChart loading loadingRows={skRows} dates={skDates} managers={[]} data={{}} segments={segments} />
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
              heatmap={heatmap ?? { dates: skDates }}
              heatmapMode={heatmapMode}
              setHeatmapMode={setHeatmapMode}
              segments={segments}
              fullscreen={true}
              onToggleFullscreen={() => setOpenFull(null)}
              onEditBands={editBands("load")}
              t={t}
            />
          </div>

          {/* Scrollable table — no padding, fills remaining height */}
          <div className="flex-1 overflow-hidden" style={{ height: 0 }}>
            {hmLoading ? (
              <HeatmapChart loading loadingRows={skRows} dates={skDates} managers={[]} data={{}} segments={segments} fullscreen />
            ) : heatmap?.managers?.length ? (
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
          Same grid, same pending markers, sort and AVG/MAX/MIN, each with
          colour bands of its OWN — and each reading ONE number per unit-day
          through `cellValue`:
            Reja bajarilishi = TRUDOYOMKOST ÷ ISHLAB CHIQARISH PLANI
            Samaradorlik     = TRUDOYOMKOST ÷ (verifix min × 0.9
                               − XODIMLAR × (ojidaniya + early + 10))
          utils/formulas.js is the definition of both. ── */}
      <MetricHeatmapCard
        which="fulfil"
        cellValue={fulfilUtil}
        title={t("zagruzka.fulfilTable")}
        note={t("zagruzka.fulfilNote")}
        heatmap={heatmap} hmLoading={hmLoading} segments={bands.fulfil.segments}
        onEditBands={editBands("fulfil")}
        managerIds={managerIds} commentedCells={commentedCells} approvedCells={approvedCells}
        onCellClick={metricCellClick.fulfil}
        full={openFull === "fulfil"} setOpenFull={setOpenFull} t={t}
        skDates={skDates} skRows={skRows}
      />
      <MetricHeatmapCard
        which="eff"
        cellValue={effUtil}
        title={t("zagruzka.effTable")}
        note={t("zagruzka.effNote")}
        heatmap={heatmap} hmLoading={hmLoading} segments={bands.eff.segments}
        onEditBands={editBands("eff")}
        managerIds={managerIds} commentedCells={commentedCells} approvedCells={approvedCells}
        onCellClick={metricCellClick.eff}
        full={openFull === "eff"} setOpenFull={setOpenFull} t={t}
        skDates={skDates} skRows={skRows}
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
          <DifferenceBreakdown loading height={280} />
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
          // Above the fullscreen overlays (z-[200]) whenever one is open, or a
          // tap inside fullscreen opens a thread nobody can see.
          zIndex={openFull ? 210 : undefined}
        />
      )}

      {/* One editor for whichever table's button was pressed — above the
          fullscreen overlays (z-[200]) whenever one is open, or the tap would
          open it behind the table it came from. */}
      {bandsFor && (
        <TableBandsModal
          key={bandsFor}
          table={bandsFor}
          bands={bands}
          keys={bandKeys}
          shared={bandShared}
          data={heatmap?.data}
          onClose={() => setBandsFor(null)}
          onSaved={() => { setBandsFor(null); toast.success(t("admin.saved")); }}
          zIndex={openFull ? 210 : undefined}
        />
      )}
      {toast.node}
    </Layout>
  );
}
