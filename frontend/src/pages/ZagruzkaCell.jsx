/**
 * Per-CELL загрузка — a TEST twin of /zagruzka.
 *
 * Same layout and the same components as the fleet page, but the rows are the
 * CELLS of one hard-locked supervisor instead of the supervisors themselves,
 * and the inputs come from the per-cell tables (pp_* production, cell_attendance,
 * cell_ojidaniya) rather than the sheet imports. The backend returns the payload
 * in /api/heatmap's exact shape, so ComparisonTable / HeatmapChart consume it
 * unchanged — only `managerIds` is empty, because a cell is not a manager and
 * the per-(manager, date) comment thread has nothing to key to.
 *
 * Admin-only (page key `zagruzka-cell`, no roles by default). Read-only: it
 * writes nothing and feeds no other page.
 */
import { createPortal } from "react-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Maximize2, Minimize2, Info, FlaskConical, Table2, Scale, ShieldAlert, UserRound,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams } from "../context/FactoryContext";
import StyledSelect from "../components/ui/StyledSelect";
import HeatmapChart, { DEFAULT_SEGMENTS } from "../components/charts/HeatmapChart";
import ComparisonTable, { DEFAULT_DIFF_SEGMENTS, DEFAULT_CALC_FACTORS } from "../components/charts/ComparisonTable";
import DifferenceBreakdown from "../components/ui/DifferenceBreakdown";
import CommentModal from "../components/ui/CommentModal";
import ColorGuideModal from "../components/ui/ColorGuideModal";
import TableCard, { Th } from "../components/ui/DataTable";
import { segmentBands } from "../utils/segments";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonChart } from "../components/ui/Skeleton";
import CellLink from "../components/ui/CellLink";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useTranslit } from "../utils/transliterate";
import { cellLabel } from "../utils/cellName";
import { shortPerson } from "../utils/personName";
import api from "../utils/api";

const HEATMAP_MODES = ["planned", "actual"];

// Row-label column width. Wider than the grids' 172px default because a row
// here reads «7213 · Maksumov Sanjar» — the code plus the LEADER answerable for
// it — not a supervisor's name alone. Still truncated with a tooltip past this,
// but code + name fit without eating the date columns.
const LABEL_W = 260;

const num = (v, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d);
const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

/**
 * The one line under an ojidaniya figure that says HOW it was counted.
 *
 * A cell's waiting time is the UNION of its stopped ranges, so this number is
 * routinely smaller than the minutes that were filed — and a figure that
 * silently shrank reads as a bug. So the correction is stated: what the old
 * sum double-counted, what the Ojidaniya-only rule leaves out (which is exactly
 * the gap against the «To'xtaganda» total on /idle-cell), and, for a day filed
 * before the interval model existed, that it is still the old sum.
 *
 * Rendered as TEXT, never a `title` — Telegram's WebView has no hover, so a
 * rule that lives in a tooltip does not exist on the primary device.
 */
function idleNote(inp, t) {
  const m = inp?.downtime_meta;
  if (!m) return null;
  if (m.source === "legacy") return t("zcell.idleLegacy");
  const parts = [];
  if (m.overlap_min > 0)
    parts.push(t("zcell.idleOverlap").replace("{n}", Math.round(m.overlap_min)));
  if (m.excluded_min > 0)
    parts.push(t("zcell.idleExcluded").replace("{n}", Math.round(m.excluded_min)));
  return parts.length ? parts.join(" · ") : null;
}

/** Heatmap card header — mirrors the fleet page's, minus the per-manager bits. */
function HeatmapHeader({ payload, heatmapMode, setHeatmapMode, segments, fullscreen, onToggleFullscreen, t }) {
  const [showGuide, setShowGuide] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 w-full sm:flex-1 sm:w-auto min-w-0">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("zcell.heatmapTitle")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {t("zcell.heatmapDays").replace("{n}", payload?.dates?.length ?? 0)}
            </div>
          </div>
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

        <div className="flex items-center gap-2">
          <SegmentedToggle
            value={heatmapMode}
            onChange={setHeatmapMode}
            options={HEATMAP_MODES.map((m) => [m, t(`zagruzka.mode.${m}`)])}
          />
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
          sections={[{
            heading: t("zagruzka.guide.workloadSection"),
            segments: segments?.length ? segments : DEFAULT_SEGMENTS,
          }]}
          onClose={() => setShowGuide(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] mb-3" style={{ color: "var(--text-3)" }}>
        {segmentBands(segments?.length ? segments : DEFAULT_SEGMENTS).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span style={{ color: "var(--text-3)" }}>{label}</span>
          </span>
        ))}
      </div>
    </>
  );
}

/** One diagnostics line — hidden entirely when the list is empty. */
function DiagRow({ label, items, tone = "warn" }) {
  if (!items?.length) return null;
  const color = tone === "warn" ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] py-1">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span style={{ color: "var(--text-3)" }}>{label}:</span>
      <span className="font-medium" style={{ color: "var(--text-2)" }}>{items.join(", ")}</span>
    </div>
  );
}

export default function ZagruzkaCell() {
  const { ready, dateFrom, dateTo, setDateFrom, setDateTo } = useFilters();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const [heatmapMode, setHeatmapMode] = usePersistentState("zagruzka_cell_heatmap_mode", "actual");
  const [heatmapFullscreen, setHeatmapFullscreen] = useState(false);
  const [compFullscreen, setCompFullscreen] = useState(false);
  const [comment, setComment] = useState(null);
  const [calcFactors, setCalcFactors] = useState(DEFAULT_CALC_FACTORS);
  const [inputDate, setInputDate] = usePersistentState("zagruzka_cell_input_date", null); // day shown in the inputs table
  // Which unit the page is showing. The page served ONE hard-locked supervisor
  // until 2026-09-07; it serves every unit now, one at a time — the roll-up
  // row, the fleet reconciliation and every diagnostic are statements about a
  // single unit. Remembered like every other page filter; a saved pick the
  // viewer may no longer see is not an error, the server falls back to the
  // first unit in their scope and the effect below re-syncs the control to it.
  const [mgrId, setMgrId] = usePersistentState("zagruzka_cell_manager", null);
  // Plant switcher as a FilterPanel section (null on single-plant installs,
  // an inert chip for a viewer locked to one plant).
  const factorySection = useFactorySection();

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

  const params = useFactoryParams(useMemo(
    () => ({ date_from: dateFrom, date_to: dateTo,
             ...(mgrId != null ? { manager_id: mgrId } : {}) }),
    [dateFrom, dateTo, mgrId]));
  const { data: payload, isLoading } = useQuery({
    queryKey: ["zagruzka-cell", params],
    queryFn: () => api.get("/api/zagruzka-cell", { params }).then((r) => r.data),
    enabled: ready && !!dateFrom,
  });
  const units = payload?.units ?? [];
  // The server decides which unit this viewer actually gets — a stale saved
  // pick, or one outside their plant, falls back to the first they may see.
  // Follow it, so the control never names a unit other than the one on screen.
  const servedId = payload?.manager?.id ?? null;
  useEffect(() => {
    if (servedId != null && servedId !== mgrId) setMgrId(servedId);
  }, [servedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thresholds are shared with the fleet page on purpose — the two grids must be
  // read against the same colour bands or comparing them is meaningless.
  const { data: thresholdData } = useQuery({
    queryKey: ["heatmap-thresholds"],
    queryFn: () => api.get("/api/heatmap-thresholds").then((r) => r.data),
    staleTime: 60_000,
  });
  const segments = thresholdData?.segments ?? DEFAULT_SEGMENTS;

  const { data: compThresholdData } = useQuery({
    queryKey: ["comparison-thresholds"],
    queryFn: () => api.get("/api/comparison-thresholds").then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });
  const diffSegments = compThresholdData?.diff_segments ?? DEFAULT_DIFF_SEGMENTS;
  const pSegments = compThresholdData?.p_segments ?? [];

  const dates = payload?.dates ?? [];
  const cells = payload?.managers ?? [];
  const diag = payload?.diagnostics ?? {};

  // Default the inputs table to the most recent day that actually has numbers,
  // so opening the page lands on something rather than an empty last date.
  useEffect(() => {
    if (!dates.length) return;
    if (inputDate && dates.includes(inputDate)) return;
    const withData = [...dates].reverse().find((d) =>
      cells.some((c) => payload?.data?.[c]?.[d]?.net_util != null));
    setInputDate(withData ?? dates[dates.length - 1]);
  }, [payload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Funnel: average each stage across every (cell, day) that produced one. The
  // per-stage values live in `inputs`; net/baseline come off the grid itself.
  const funnel = useMemo(() => {
    const acc = { baseline_util: [], adjusted_util: [], after_idle_util: [], after_early_util: [], net_util: [] };
    for (const c of cells) {
      for (const d of dates) {
        const cell = payload?.data?.[c]?.[d];
        const inp = payload?.inputs?.[c]?.[d];
        if (!cell || cell.net_util == null) continue;
        if (cell.baseline_util != null) acc.baseline_util.push(cell.baseline_util);
        if (inp?.adjusted_util != null) acc.adjusted_util.push(inp.adjusted_util);
        if (inp?.after_idle_util != null) acc.after_idle_util.push(inp.after_idle_util);
        if (inp?.after_early_util != null) acc.after_early_util.push(inp.after_early_util);
        acc.net_util.push(cell.net_util);
      }
    }
    const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, avg(v)]));
  }, [payload, cells, dates]);

  const hasAnyValue = useMemo(
    () => cells.some((c) => dates.some((d) => payload?.data?.[c]?.[d]?.net_util != null)),
    [payload, cells, dates]);

  const cellMeta = useMemo(
    () => Object.fromEntries((payload?.cells ?? []).map((c) => [c.label, c])),
    [payload]);

  // How a cell is SPELLED on the grids. A row key is the verifix code and stays
  // the verifix code — `data`, `inputs`, the sort and the selection all run on
  // it — but four digits say nothing to a reader who does not already know the
  // shopfloor, so the second fact beside it is the LEADER, never the workshop
  // («A cell is its CODE»). `cellLabel` owns the join and the "code alone when
  // there is no leader" rule; `tl` spells the name in the viewer's alphabet
  // BEFORE the join, so an admin name override still matches the raw value.
  //
  // The name is SHORTENED by `shortPerson`, the platform's one rule for that
  // and the same shape `UnitOjidaniyaModal` already uses for this exact pair:
  // a four-part Uzbek name («Turdimurodov Nodirjon Latibjon O'g'li» — 93 of the
  // 108 cells carry one) runs past the label column, and an ellipsis mid-name
  // names nobody while «T. Nodirjon» tells two leaders apart. `full` asks for
  // the untruncated spelling, which the grids put in the row's tooltip.
  const labelFor = useCallback(
    (key, full = false) => {
      const leader = tl(cellMeta[key]?.leader);
      return cellLabel(key, (full || !leader) ? leader : shortPerson(leader));
    },
    [cellMeta, tl]);

  const dateOptions = useMemo(
    () => dates.map((d) => ({ value: d, label: d })), [dates]);

  // The brigadir's own figures for the day the inputs table is showing. A day
  // the roll-up collapsed carries only the two nulls, so the row is dropped
  // rather than printed as a line of dashes pretending to be a unit total.
  const unit = payload?.totals?.[inputDate];
  const hasUnit = !!unit && unit.official_hc != null;

  // The unit's own load as a ROW on the two grids, beside the cells it is
  // made of. Since v4.82.0 it runs /zagruzka's logic — the WHOLE unit's
  // трудоёмкость against the TYPED people, over the unit's own attendance —
  // so it is neither the sum of the rows above it (that is `cells_sum`, in the
  // reconciliation card) nor the AVG row under it, which averages the
  // percentages on screen. Dropped entirely when no day produced a number, so
  // the grids never gain a row of dashes.
  const unitRow = useMemo(() => {
    const totals = payload?.totals;
    if (!totals || !dates.some((d) => totals[d]?.net_util != null)) return null;
    return {
      label: payload?.manager?.name || t("zcell.unitRow"),
      note: t("zcell.unitRowNote"),
      hint: t("zcell.unitRowHint"),
      data: totals,
    };
  }, [payload, dates, t]);

  function handleCellClick(name, d, _v, cell) {
    // No managerId: a cell has no comment thread, so this opens formula-only.
    // The header names the row the way the row is named on the grid it was
    // opened from — code plus leader, already spelled by `tl`.
    setComment({ managerName: labelFor(name, true), date: d, rawCell: cell, mode: heatmapMode });
  }

  const managerName = payload?.manager?.name ? tl(payload.manager.name) : "—";
  const supOptions = useMemo(
    () => [...units]
      .map((u) => ({ value: String(u.manager_id), label: tl(u.name) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [units, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout title={t("zcell.subtitle")}>
      {/* ── Test banner — this page must never be mistaken for a live number ── */}
      <div
        className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-[11px]"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}
      >
        <FlaskConical size={14} className="flex-shrink-0 mt-px" style={{ color: "#eab308" }} />
        <div>
          <div style={{ color: "var(--text-2)" }}>{t("zcell.testNote")}</div>
        </div>
      </div>

      {/* ── ONE-ROW bar: period, then the scope controls inside FilterPanel ── */}
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
              // Always ACTIVE: the page shows exactly one unit, so there is no
              // «All» to fall back to and nothing to clear — the chip states
              // which unit is on screen rather than offering to unset it.
              key: "supervisor", icon: UserRound, label: t("tasks.colSupervisor"),
              active: true,
              display: managerName,
              render: ({ close } = {}) => (
                <PickFilter
                  searchable
                  close={close}
                  opts={supOptions}
                  value={servedId != null ? String(servedId) : ""}
                  onChange={(v) => setMgrId(Number(v))}
                />
              ),
            },
          ]}
        />
      </div>

      {isLoading ? (
        <SkeletonChart className="h-64" />
      ) : !cells.length ? (
        <EmptyState title={t("zcell.noCells")} message={t("zcell.noCellsMsg")} height="h-48" />
      ) : !hasAnyValue ? (
        <EmptyState title={t("zcell.noData")} message={t("zcell.noDataMsg")} height="h-48" />
      ) : (
        <>
          {/* ── Comparison table: rows = cells, columns = dates ── */}
          <div className="mb-6">
            <ComparisonTable
              dates={dates}
              managers={cells}
              data={payload.data}
              pSegments={pSegments}
              diffSegments={diffSegments}
              managerIds={{}}
              approvedCells={null}
              commentedCells={new Set()}
              calcFactors={calcFactors}
              onCalcFactorsChange={setCalcFactors}
              allowComments={false}
              columnSummary
              pinnedRow={unitRow}
              rowLabel={t("zcell.colCell")}
              labelWidth={LABEL_W}
              labelFor={labelFor}
              onToggleFullscreen={() => setCompFullscreen(true)}
            />
            {/* Says, in VISIBLE text, how the brigadir's row differs from the
                AVG row directly under it. Telegram's WebView has no hover, so
                the `hint` tooltip on the label does not exist on the phone —
                the same reason the ojidaniya note under the inputs table is
                printed rather than attached to a `title`. */}
            {unitRow && (
              <div className="text-[11px] mt-2 px-1" style={{ color: "var(--text-3)" }}>
                {t("zcell.unitRowHint")}
              </div>
            )}
          </div>

          {/* Portaled to <body>: .page-enter's transform would otherwise become
              the containing block for this fixed overlay. */}
          {compFullscreen && createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col"
              style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
            >
              <div className="flex-1 overflow-auto p-4">
                <ComparisonTable
                  dates={dates}
                  managers={cells}
                  data={payload.data}
                  pSegments={pSegments}
                  diffSegments={diffSegments}
                  managerIds={{}}
                  approvedCells={null}
                  commentedCells={new Set()}
                  calcFactors={calcFactors}
                  onCalcFactorsChange={setCalcFactors}
                  allowComments={false}
                  columnSummary
                  pinnedRow={unitRow}
                  rowLabel={t("zcell.colCell")}
                  labelWidth={LABEL_W}
                  labelFor={labelFor}
                  fullscreen
                  onToggleFullscreen={() => setCompFullscreen(false)}
                />
              </div>
            </div>,
            document.body
          )}

          {/* ── Heatmap ── */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
            <HeatmapHeader
              payload={payload}
              heatmapMode={heatmapMode}
              setHeatmapMode={setHeatmapMode}
              segments={segments}
              fullscreen={false}
              onToggleFullscreen={() => setHeatmapFullscreen(true)}
              t={t}
            />
            <HeatmapChart
              dates={dates}
              managers={cells}
              data={payload.data}
              mode={heatmapMode}
              managerIds={{}}
              segments={segments}
              commentedCells={new Set()}
              approvedCells={null}
              pinnedRow={unitRow}
              rowLabel={t("zcell.colCell")}
              labelWidth={LABEL_W}
              labelFor={labelFor}
              onCellClick={handleCellClick}
            />
          </div>

          {heatmapFullscreen && createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col"
              style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "var(--tg-safe-bottom, 0px)" }}
            >
              <div
                className="flex-shrink-0 px-4 lg:px-6 py-3"
                style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
              >
                <HeatmapHeader
                  payload={payload}
                  heatmapMode={heatmapMode}
                  setHeatmapMode={setHeatmapMode}
                  segments={segments}
                  fullscreen
                  onToggleFullscreen={() => setHeatmapFullscreen(false)}
                  t={t}
                />
              </div>
              <div className="flex-1 overflow-hidden" style={{ height: 0 }}>
                <HeatmapChart
                  dates={dates}
                  managers={cells}
                  data={payload.data}
                  mode={heatmapMode}
                  managerIds={{}}
                  segments={segments}
                  commentedCells={new Set()}
                  approvedCells={null}
                  pinnedRow={unitRow}
                  rowLabel={t("zcell.colCell")}
                  labelWidth={LABEL_W}
                  labelFor={labelFor}
                  onCellClick={handleCellClick}
                  fullscreen
                />
              </div>
            </div>,
            document.body
          )}

          {/* ── Funnel ── */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-1">
              {t("zcell.funnelTitle")}
            </div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-4)" }}>
              {t("zcell.funnelSub")}
            </div>
            <DifferenceBreakdown data={funnel} height={280} diffSegments={diffSegments} />
          </div>

          {/* ── Reconciliation against the fleet page ── */}
          <div className="mb-6">
            <TableCard
              icon={Scale}
              title={t("zcell.reconcileTitle")}
              subtitle={t("zcell.reconcileSub")}
              maxHeight="none"
              minWidth={520}
            >
              <thead>
                <tr>
                  <Th label="" cls="w-[180px]" />
                  {dates.map((d) => <Th key={d} label={d.slice(0, 5)} align="center" />)}
                </tr>
              </thead>
              <tbody>
                {/* The cells' own aggregate against the unit's figure. Since
                    v4.82.0 the unit row IS the fleet's figure (payload.totals
                    runs /zagruzka's logic), so charting `totals` here would be
                    the fleet against itself — a delta of 0 that proves nothing.
                    What is worth reading is whether the rows on screen add up
                    to the unit: a gap means a work centre with no cell, a cell
                    with no SAP code, people nobody typed, or attendance with no
                    «Код подразделения». */}
                {[
                  { key: "cells", label: t("zcell.totalsRow"), get: (d) => payload.cells_sum?.[d]?.net_util },
                  { key: "fleet", label: t("zcell.fleetRow"), get: (d) => payload.fleet?.[d]?.net_util },
                ].map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text-2)" }}>{row.label}</td>
                    {dates.map((d) => (
                      <td key={d} className="px-3 py-2 text-center" style={{ color: "var(--text-1)" }}>
                        {pct(row.get(d))}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text-3)" }}>{t("zcell.deltaRow")}</td>
                  {dates.map((d) => {
                    const a = payload.cells_sum?.[d]?.net_util;
                    const b = payload.fleet?.[d]?.net_util;
                    if (a == null || b == null) {
                      return <td key={d} className="px-3 py-2 text-center" style={{ color: "var(--text-4)" }}>—</td>;
                    }
                    const delta = Math.round((a - b) * 100);
                    return (
                      <td key={d} className="px-3 py-2 text-center font-semibold"
                          style={{ color: Math.abs(delta) <= 5 ? "#22c55e" : Math.abs(delta) <= 15 ? "#eab308" : "#ef4444" }}>
                        {delta > 0 ? "+" : ""}{delta}%
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </TableCard>
          </div>

          {/* ── Inputs behind the numbers, for one day ── */}
          <div className="mb-6">
            <TableCard
              icon={Table2}
              title={t("zcell.inputsTitle")}
              subtitle={t("zcell.inputsSub")}
              maxHeight="none"
              minWidth={880}
              right={
                <div className="w-40">
                  <StyledSelect
                    value={inputDate ?? ""}
                    onChange={setInputDate}
                    options={dateOptions}
                    triggerClassName="px-2.5 py-1.5 text-xs"
                  />
                </div>
              }
            >
              <thead>
                <tr>
                  <Th label={t("zcell.colCell")} cls="w-[26%]" />
                  <Th label={t("zcell.colWc")} align="center" />
                  <Th label={t("zcell.colTrudPlan")} align="right" />
                  <Th label={t("zcell.colTrudActual")} align="right" />
                  <Th label={t("production.oSoni")} align="right" />
                  <Th label={t("zcell.colHours")} align="right" />
                  <Th label={t("zcell.colPeople")} align="right" />
                  <Th label={t("zcell.colIdle")} align="right" />
                  <Th label={t("zcell.colEarly")} align="right" />
                  <Th label={t("zcell.colNet")} align="right" />
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => {
                  const inp = payload.inputs?.[c]?.[inputDate];
                  const meta = cellMeta[c];
                  const net = payload.data?.[c]?.[inputDate]?.net_util;
                  const idle = idleNote(inp, t);
                  return (
                    <tr key={c}>
                      {/* The code is the cell's name and the LEADER is the
                          second fact beside it — the same spelling the grids
                          above use. Only the CODE is the link: the leader is a
                          person, not a route. */}
                      <td className="px-3 py-2 truncate" style={{ color: "var(--text-1)" }} title={labelFor(c, true)}>
                        {meta
                          ? <CellLink id={meta.cell_id}>{meta.verifix_code}</CellLink>
                          : c}
                        {meta?.leader && (
                          <span className="ml-1" style={{ color: "var(--text-3)" }}>
                            · {shortPerson(tl(meta.leader))}
                          </span>
                        )}
                      </td>
                      {/* The work centre, and — where several cells name it —
                          how much of it this row carries. Трудоёмкость and
                          «Bugungi fakt» are recorded per WORK CENTRE, so those
                          cells hold 1/N of it and their figures are shares, not
                          measurements. Saying so on the code itself is the only
                          place the reader meets the work centre. */}
                      <td className="px-3 py-2 text-center" style={{ color: meta?.joined ? "var(--text-2)" : "#ef4444" }}>
                        {meta?.sap_code || "—"}
                        {inp?.wc_cells > 1 && (
                          <span className="ml-1 text-[9px] px-1 rounded"
                                title={t("zcell.wcShareHint").replaceAll("{n}", inp.wc_cells)}
                                style={{ color: "#eab308", background: "rgba(234,179,8,0.12)" }}>
                            1/{inp.wc_cells}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.trud_plan)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.trud_actual)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>
                        {num(inp?.o_soni)}
                        {inp?.o_soni_pinned && (
                          <span className="ml-1 text-[9px]" style={{ color: "var(--brand-text)" }}>
                            {t("zcell.pinned")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.verifix_labor)}</td>
                      {/* A worker SPLIT across two cells counts as a fraction of a
                          person in each, so this is a float now — printed raw it
                          would read «0.6000000000000001». */}
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.verifix_hc, 1)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: inp?.downtime ? "#eab308" : "var(--text-3)" }}>
                        {num(inp?.downtime)}
                        {idle && (
                          <div className="text-[9px] leading-tight" style={{ color: "var(--text-3)" }}>
                            {idle}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.avg_early_arrival, 1)}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-1)" }}>{pct(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {/* ── The brigadir's own row ──────────────────────────────────
                   The unit figure the cells above roll up into. Its ojidaniya
                   is the headcount-weighted mean of theirs, printed WITH its
                   derivation (Σ(N×T) ÷ ΣN): a mean whose arithmetic cannot be
                   checked against the rows directly beside it is a number the
                   reader has to take on trust. N is the «Odam» column of each
                   row, T its «Kutish». */}
              {hasUnit && (
                <tfoot>
                  <tr className="border-t" style={{ background: "var(--bg-inner)", borderColor: "var(--border-md)" }}>
                    <td className="px-3 py-2 font-semibold truncate" style={{ color: "var(--text-1)" }}>
                      {t("zcell.unitRow")}
                    </td>
                    <td className="px-3 py-2 text-center" style={{ color: "var(--text-4)" }}>—</td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.prod_plan)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.prod_actual)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.official_hc)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.verifix_labor)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.verifix_hc, 1)}</td>
                    <td className="px-3 py-2 text-right font-semibold"
                        style={{ color: unit.equip_downtime ? "#eab308" : "var(--text-3)" }}>
                      {num(unit.equip_downtime, 1)}
                      {/* The «Σ ÷ N» derivation that used to sit here is gone
                          with v4.82.0. This figure is `idle_source.unit_downtime`
                          — the platform's own unit ojidaniya, weighed over every
                          cell that had people — while the cells listed above are
                          only the ones that produced a figure. Printing the
                          cells' Σ and N under a number they do not divide into
                          is a derivation that does not hold, which is worse than
                          no derivation at all. */}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(unit.avg_early_arrival, 1)}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-1)" }}>{pct(unit.net_util)}</td>
                  </tr>
                </tfoot>
              )}
            </TableCard>
            {/* Says what the weighted mean IS, once, under the table that shows
                both of its inputs — not in a tooltip the phone cannot open. */}
            <div className="text-[11px] mt-2 px-1" style={{ color: "var(--text-3)" }}>
              {t("zcell.unitIdleNote")}
            </div>
          </div>
        </>
      )}

      {/* ── Data-coverage diagnostics — always shown, even with no numbers, so a
           broken SAP join is visible instead of reading as "a quiet week". ── */}
      {!isLoading && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={14} style={{ color: "var(--brand-text)" }} />
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("zcell.diagTitle")}
            </div>
          </div>
          {/* Attendance coverage — always shown, and first. Every blank day on
              the grid is a day whose attendance was never uploaded, which is
              otherwise indistinguishable from "the cells were idle". */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] py-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: diag.days_with_attendance?.length ? "#22c55e" : "#ef4444" }} />
            <span style={{ color: "var(--text-3)" }}>
              {t("zcell.diagAttDays")
                .replace("{n}", diag.days_with_attendance?.length ?? 0)
                .replace("{m}", diag.days_in_range ?? 0)}:
            </span>
            <span className="font-medium" style={{ color: "var(--text-2)" }}>
              {diag.days_with_attendance?.length
                ? diag.days_with_attendance.join(", ")
                : "—"}
            </span>
          </div>
          {/* Which upload fed those days. The daily factory-wide sheet and the
              older per-cell import are loaded by different people at different
              times, so "which one covered this day" is the first question when
              a day is missing — the grid alone can't answer it. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] py-1 mb-1 pl-4">
            <span style={{ color: "var(--text-3)" }}>{t("zcell.diagAttSource")}:</span>
            <span className="font-medium" style={{ color: "var(--text-2)" }}>
              {t("zcell.diagAttSourceSheet")
                .replace("{n}", diag.attendance_sources?.sheet?.length ?? 0)}
              {(diag.attendance_sources?.cell_upload?.length ?? 0) > 0 && (
                <> · {t("zcell.diagAttSourceCell")
                  .replace("{n}", diag.attendance_sources.cell_upload.length)}</>
              )}
            </span>
          </div>
          {/* Which ojidaniya model answered which day. A day still counted by
              the retired minutes-only rows carries the over-count that model
              could not see, and nothing else on the page tells it apart from a
              day the union corrected. */}
          {(() => {
            const iv = diag.ojidaniya_sources?.intervals?.length ?? 0;
            const lg = diag.ojidaniya_sources?.legacy?.length ?? 0;
            return (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] py-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: iv ? "#22c55e" : lg ? "#eab308" : "var(--text-4)" }} />
                <span style={{ color: "var(--text-3)" }}>{t("zcell.diagIdleSource")}:</span>
                <span className="font-medium" style={{ color: "var(--text-2)" }}>
                  {t("zcell.diagIdleIntervals").replace("{n}", iv)}
                  {lg > 0 && <> · {t("zcell.diagIdleLegacy").replace("{n}", lg)}</>}
                </span>
              </div>
            );
          })()}
          {/* The size of the correction, and the size of what the загрузка rule
              leaves out — the two numbers that explain why this page and
              /idle-cell can print different minutes for the same cell-day. */}
          {(diag.ojidaniya_overlap_min > 0 || diag.ojidaniya_excluded_min > 0) && (
            <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-[11px] py-1 pl-4"
                 style={{ color: "var(--text-3)" }}>
              {diag.ojidaniya_overlap_min > 0 && (
                <span>{t("zcell.diagIdleOverlap").replace("{n}", Math.round(diag.ojidaniya_overlap_min))}</span>
              )}
              {diag.ojidaniya_overlap_min > 0 && diag.ojidaniya_excluded_min > 0 && <span>·</span>}
              {diag.ojidaniya_excluded_min > 0 && (
                <span>{t("zcell.diagIdleExcluded").replace("{n}", Math.round(diag.ojidaniya_excluded_min))}</span>
              )}
            </div>
          )}
          {diag.collapsed_effective_hc > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] py-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#eab308" }} />
              <span style={{ color: "var(--text-3)" }}>{t("zcell.diagCollapsed")}:</span>
              <span className="font-medium" style={{ color: "var(--text-2)" }}>
                {diag.collapsed_effective_hc}
              </span>
            </div>
          )}
          {(() => {
            const rows = [
              [t("zcell.diagNoSap"), diag.cells_without_sap],
              [t("zcell.diagNoWc"), diag.cells_without_work_center],
              [t("zcell.diagOrphanWc"), diag.work_centers_without_cell],
              // Work centres split between several cells — those rows carry a
              // share of a work-centre-level number, so the reader is told
              // which ones rather than left to spot the 1/N chip.
              [t("zcell.diagSharedWc"),
               (diag.shared_work_centers ?? []).map((g) => `${g.work_center} → ${g.cells.join(" · ")}`)],
              [t("zcell.diagNoLabor"), diag.products_missing_labor_time],
              [t("zcell.diagExcluded"),
               (diag.excluded_job_titles ?? []).map((e) => `${e.title} (${e.rows} ${t("zcell.rowsWord")})`)],
            ];
            const any = rows.some(([, items]) => items?.length);
            if (!any) {
              return <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("zcell.diagClean")}</div>;
            }
            return rows.map(([label, items]) => <DiagRow key={label} label={label} items={items} />);
          })()}
        </div>
      )}

      {comment && (
        <CommentModal
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
