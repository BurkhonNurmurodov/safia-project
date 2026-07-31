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
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Maximize2, Minimize2, Info, FlaskConical, Table2, Scale, ShieldAlert,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
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
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import cellName from "../utils/cellName";
import api from "../utils/api";

const HEATMAP_MODES = ["planned", "actual"];

const num = (v, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d);
const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
const isoOf = (ddmmyyyy) => {
  const [d, m, y] = ddmmyyyy.split(".");
  return `${y}-${m}-${d}`;
};

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
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const [heatmapMode, setHeatmapMode] = useState("actual");
  const [heatmapFullscreen, setHeatmapFullscreen] = useState(false);
  const [compFullscreen, setCompFullscreen] = useState(false);
  const [comment, setComment] = useState(null);
  const [calcFactors, setCalcFactors] = useState(DEFAULT_CALC_FACTORS);
  const [inputDate, setInputDate] = useState(null); // day shown in the inputs table

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

  const params = { date_from: dateFrom, date_to: dateTo };
  const { data: payload, isLoading } = useQuery({
    queryKey: ["zagruzka-cell", dateFrom, dateTo],
    queryFn: () => api.get("/api/zagruzka-cell", { params }).then((r) => r.data),
    enabled: ready && !!dateFrom,
  });

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

  const dateOptions = useMemo(
    () => dates.map((d) => ({ value: d, label: d })), [dates]);

  function handleCellClick(name, d, _v, cell) {
    // No managerId: a cell has no comment thread, so this opens formula-only.
    setComment({ managerName: name, date: d, rawCell: cell, mode: heatmapMode });
  }

  const managerName = payload?.manager?.name ? tl(payload.manager.name) : "—";

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
          {diag.lock_warning && (
            <div className="mt-1" style={{ color: "#eab308" }}>{diag.lock_warning}</div>
          )}
        </div>
      </div>

      {/* ── Period + the locked supervisor (static text, not a picker) ── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <div className="sm:w-72">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>
            {t("tasks.period")}
          </label>
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:w-72 min-w-0">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>
            {t("zcell.lockedTo")}
          </label>
          <div
            className="w-full px-3 py-2 text-sm rounded-xl truncate"
            title={t("zcell.lockedHint")}
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)", height: 38 }}
          >
            {managerName}
          </div>
        </div>
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
              onToggleFullscreen={() => setCompFullscreen(true)}
            />
          </div>

          {/* Portaled to <body>: .page-enter's transform would otherwise become
              the containing block for this fixed overlay. */}
          {compFullscreen && createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col"
              style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)" }}
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
              onCellClick={handleCellClick}
            />
          </div>

          {heatmapFullscreen && createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col"
              style={{ background: "var(--bg-base)", paddingTop: "var(--tg-safe-top, 0px)" }}
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
                {[
                  { key: "cells", label: t("zcell.totalsRow"), get: (d) => payload.totals?.[d]?.net_util },
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
                    const a = payload.totals?.[d]?.net_util;
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
                  <Th label={t("zcell.colShtatka")} align="right" />
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
                  return (
                    <tr key={c}>
                      <td className="px-3 py-2 truncate" style={{ color: "var(--text-1)" }} title={c}>
                        {meta ? `${meta.verifix_code} · ${tl(meta.name_ru || "")}` : c}
                      </td>
                      <td className="px-3 py-2 text-center" style={{ color: meta?.joined ? "var(--text-2)" : "#ef4444" }}>
                        {meta?.sap_code || "—"}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.trud_plan)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.trud_actual)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>
                        {num(inp?.shtatka)}
                        {inp?.shtatka_pinned && (
                          <span className="ml-1 text-[9px]" style={{ color: "var(--brand-text)" }}>
                            {t("zcell.pinned")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.verifix_labor)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{inp?.verifix_hc ?? "—"}</td>
                      <td className="px-3 py-2 text-right" style={{ color: inp?.downtime ? "#eab308" : "var(--text-3)" }}>
                        {num(inp?.downtime)}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--text-2)" }}>{num(inp?.avg_early_arrival, 1)}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-1)" }}>{pct(net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
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
          {(() => {
            const rows = [
              [t("zcell.diagNoSap"), diag.cells_without_sap],
              [t("zcell.diagNoWc"), diag.cells_without_work_center],
              [t("zcell.diagOrphanWc"), diag.work_centers_without_cell],
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
