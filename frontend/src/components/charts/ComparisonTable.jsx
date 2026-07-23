import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, Info, Calculator } from "lucide-react";
import { useChartTheme } from "../../hooks/useChartTheme";
import useIsMobile from "../../hooks/useIsMobile";
import { orderedSegments } from "../../utils/segments";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import FormulaModal from "../ui/FormulaModal";
import CommentModal from "../ui/CommentModal";
import PendingInfoModal from "../ui/PendingInfoModal";
import ColorGuideModal from "../ui/ColorGuideModal";
import SegmentedToggle from "../ui/SegmentedToggle";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { pValueNumbers, pValueInputs, KAIZEN_BUFFER, VERIFIX_EFFICIENCY } from "../../utils/formulas";

// ─── Constants ────────────────────────────────────────────────────────────────

const LABEL_W      = 172;
const CELL_W       = 36;
const BASIS_DAYS   = 14;  // calibrated width: fits exactly 14 days, no scroll
const GROUP_BORDER = "2px solid var(--border-md)";  // match fleet heatmap's section separators
const HDR_BG       = "var(--brand)";
const EASE         = "cubic-bezier(.4,0,.2,1)";
const DUR          = "380ms";

// P column thresholds
export const DEFAULT_P_SEGMENTS = [
  { from: 0,  color: "#ef4444" },
  { from: 80, color: "#eab308" },
  { from: 85, color: "#22c55e" },
];

// D column thresholds: D = P − A
export const DEFAULT_DIFF_SEGMENTS = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from: 1,     color: "#eab308" },
  { from: 6,     color: "#ef4444" },
];

// Admin-only calculation factors: the deductions inside the A (fact) value.
// All ON = the backend's official net_util. downtime/early/kaizen are minute
// deductions from avail_min; perenalatka is the 15% changeover allowance
// (VERIFIX_EFFICIENCY 0.85) applied to Verifix hours inside effective_hc.
export const DEFAULT_CALC_FACTORS = { downtime: true, early: true, kaizen: true, perenalatka: true };

const CALC_FACTOR_DEFS = [
  { key: "downtime",    label: "zagruzka.calcFactorIdle",   sub: "zagruzka.calcFactorIdleSub" },
  { key: "early",       label: "zagruzka.calcFactorEarly",  sub: "zagruzka.calcFactorEarlySub" },
  { key: "kaizen",      label: "zagruzka.calcFactorKaizen", sub: "zagruzka.calcFactorKaizenSub" },
  { key: "perenalatka", label: "zagruzka.calcFactorSetup",  sub: "zagruzka.calcFactorSetupSub" },
];

// A (fact) utilization honoring the factor toggles. With every factor ON this
// returns the backend's net_util verbatim; with any OFF it re-derives the same
// formula (kpi_calculator.py) from the cell's raw components, dropping the
// excluded deductions: prod_actual ÷ (effective_hc × (avail_min − …)).
function actualUtil(cell, f) {
  if (!cell) return null;
  if (!f || (f.downtime && f.early && f.kaizen && f.perenalatka)) return cell.net_util ?? null;
  const pa  = cell.prod_actual;
  let ehc = cell.effective_hc;
  const base = cell.avail_min != null
    ? cell.avail_min
    : cell.prod_plan ? 480 * (cell.prod_actual / cell.prod_plan) : null;
  if (pa == null || ehc == null || base == null) return cell.net_util ?? null;
  if (!f.perenalatka && cell.official_hc != null && base > 0) {
    // Undo the 15% changeover allowance: rebuild verifix_labor from the labor
    // surplus (surplus = (vl − pa) ÷ base), credit the reported hours at 100%
    // instead of ×0.85, and re-derive effective_hc from the new surplus.
    const surplus = ehc - cell.official_hc;
    const verifixLabor = surplus * base + pa;
    ehc = cell.official_hc + (verifixLabor / VERIFIX_EFFICIENCY - pa) / base;
  }
  const den = ehc * (base
    - (f.downtime ? (cell.equip_downtime || 0) : 0)
    - (f.early    ? (cell.avg_early_arrival || 0) : 0)
    - (f.kaizen   ? KAIZEN_BUFFER : 0));
  return den > 0 ? pa / den : null;
}

// Legend bands derived from the admin-panel thresholds, so the labels follow
// whatever the admin saves. Wording per language comes from template keys.
function diffLegendBands(segs, t) {
  const ordered = orderedSegments(segs);
  const fmt = n => String(n).replace("-", "−");
  return ordered.map((seg, i) => {
    const next = ordered[i + 1];
    const label = i === 0 && next
      ? t("comparison.legendBelow").replace("{v}", fmt(next.from))
      : !next
        ? t("comparison.legendAbove").replace("{v}", fmt(seg.from - 1))
        : t("comparison.legendRange").replace("{a}", fmt(seg.from)).replace("{b}", fmt(next.from - 1));
    return { color: seg.color, label };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52 ? "#111827" : "#ffffff";
}

function getColor(v, segs) {
  if (v == null) return { bg: "transparent", fg: "var(--text-4)", noData: true };
  let result = segs[0];
  for (const seg of segs) {
    if (v >= seg.from) result = seg;
    else break;
  }
  return { bg: result.color, fg: contrastText(result.color) };
}

function shortDate(d) { return d.slice(0, 5); }
function isoOf(ddmmyyyy) { const [d, m, y] = ddmmyyyy.split("."); return `${y}-${m}-${d}`; }

function rowAvg(vals) {
  const valid = vals.filter(v => v !== null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}
// Find the index of the date with min/max D; tie-break by min/max P
function findExtremeIdx(dVals, pVals, mode) {
  const candidates = dVals
    .map((v, i) => ({ d: v, p: pVals[i], i }))
    .filter(({ d }) => d !== null);
  if (!candidates.length) return null;
  return candidates.reduce((best, curr) => {
    const better = mode === "min"
      ? curr.d < best.d || (curr.d === best.d && curr.p !== null && best.p !== null && curr.p < best.p)
      : curr.d > best.d || (curr.d === best.d && curr.p !== null && best.p !== null && curr.p > best.p);
    return better ? curr : best;
  }).i;
}

const SUMMARY_CYCLE = { avg: "min", min: "max", max: "avg" };

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComparisonTable({
  dates = [], managers = [], data = {},
  pSegments    = [],
  diffSegments = [],
  managerIds   = {},
  approvedCells = null,
  commentedCells = new Set(),
  fullscreen = false,
  onToggleFullscreen,
  // Admin-only factor toggles — lifted to the page so the inline and
  // fullscreen instances stay in sync. Button hidden when the handler is absent.
  calcFactors = DEFAULT_CALC_FACTORS,
  onCalcFactorsChange = null,
}) {
  const { labelColor } = useChartTheme();
  const isMobile = useIsMobile(); // phones: hide the pinned AVG/MIN/MAX summary pair
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl } = useTranslit();
  const [mode, setMode]           = useState("compare"); // "compare" | "diff"
  const [summaryMode, setSummaryMode] = useState("avg"); // "avg" | "min" | "max"
  const [formulaModal, setFormulaModal] = useState(null);
  const [comment, setComment]     = useState(null);
  const [pendingInfo, setPendingInfo] = useState(null); // { name, date, reason }
  const [showGuide, setShowGuide] = useState(false); // info icon → color meanings modal
  const [showCalc, setShowCalc]   = useState(false); // calculator icon → factors modal

  const isAdmin = auth?.role === "admin";
  const factors = calcFactors || DEFAULT_CALC_FACTORS;
  const calcModified = !(factors.downtime && factors.early && factors.kaizen);
  const excludedNames = CALC_FACTOR_DEFS
    .filter(f => !factors[f.key]).map(f => t(f.label)).join(", ");
  const [nameAsc, setNameAsc]     = useState(true);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [selection, setSelection] = useState(null); // { type:"manager"|"date", value } | null

  const noSel = !selection;

  function toggleSel(type, value) {
    setSelection(prev =>
      prev?.type === type && prev?.value === value ? null : { type, value }
    );
  }
  function clearSel() { setSelection(null); }

  function cellGrayed(name, d) {
    if (!selection) return false;
    if (selection.type === "manager") return selection.value !== name;
    if (selection.type === "date")    return selection.value !== d;
    return false;
  }

  const displayManagers = nameAsc !== null
    ? [...managers].sort((a, b) => nameAsc
        ? (a || "").localeCompare(b || "")
        : (b || "").localeCompare(a || ""))
    : managers;

  const psegs = pSegments.length    ? pSegments    : DEFAULT_P_SEGMENTS;
  const dsegs = diffSegments.length ? diffSegments : DEFAULT_DIFF_SEGMENTS;
  const isDiff = mode === "diff";

  // A (manager, date) is gated until its day is approved. When approvedCells is
  // null the gate is OFF (e.g. still loading) → show all.
  const gateOn = approvedCells instanceof Set;
  const isoOf = (ddmmyyyy) => { const [d, m, y] = ddmmyyyy.split("."); return `${y}-${m}-${d}`; };
  const isApproved = (name, d) =>
    !gateOn || approvedCells.has(`${managerIds[name]}_${isoOf(d)}`);

  // Measure the scroll container so date-columns stretch to fill exactly
  // BASIS_DAYS (+ the summary) across the available width. Column width depends
  // only on container size + BASIS_DAYS, never on how many days are selected.
  const scrollRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pad up to BASIS_DAYS with blank columns so the table width stays constant
  // for ≤14 days; >14 days overflows and scrolls horizontally. Each date is a
  // pair (P + A) of two equal sub-columns; the summary is one more pair.
  const padCount   = Math.max(0, BASIS_DAYS - dates.length);
  const effDays    = Math.max(BASIS_DAYS, dates.length);
  const sumPairs   = isMobile ? 0 : 1;  // summary pair is dropped on phones
  const pairW      = containerW > 0
    ? Math.max(CELL_W * 2, 2 * Math.floor((containerW - LABEL_W) / (2 * (BASIS_DAYS + sumPairs))))
    : CELL_W * 2;
  const colW       = pairW / 2;   // width of one P or A sub-column (integer)
  const tableWidth = LABEL_W + (effDays + sumPairs) * pairW;
  const pads       = Array.from({ length: padCount });

  // Summary column pinned to the right; data scrolls underneath it.
  const stickySum = {
    position: "sticky", right: 0,
    boxShadow: "-6px 0 8px -6px rgba(0,0,0,0.25)",
  };

  // ── Shared header style ──────────────────────────────────────────────────────
  const thBase = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".07em",
    textTransform: "uppercase", color: "#fff",
    paddingBottom: 6, paddingTop: 4, whiteSpace: "nowrap",
    background: HDR_BG,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">

      {/* Title row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Title + info icon — full width on mobile so buttons wrap to row 2 */}
        <div className="flex items-center gap-1.5 w-full sm:flex-1 sm:w-auto min-w-0">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {t("zagruzka.comparisonTable")}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {isDiff
                ? t("zagruzka.diffSubtitle")
                : t("zagruzka.compareSubtitle")}
            </div>
            {calcModified && (
              <div className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--brand)" }}>
                {t("zagruzka.calcActive").replace("{list}", excludedNames)}
              </div>
            )}
          </div>
          {/* Info icon right after title */}
          <button
            onClick={() => setShowGuide(true)}
            aria-label={t("zagruzka.colorGuide")}
            title={t("zagruzka.colorGuide")}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
          >
            <Info size={14} />
          </button>
        </div>

        {/* Mode toggle + calculator + fullscreen — 2nd row on mobile */}
        <div className="flex items-center gap-2">
          <SegmentedToggle
            value={mode}
            onChange={setMode}
            options={[["compare", t("zagruzka.modeCompare")], ["diff", t("zagruzka.modeDiff")]]}
          />
          {isAdmin && onCalcFactorsChange && (
            <button
              onClick={() => setShowCalc(true)}
              title={t("zagruzka.calcTitle")}
              className="relative flex-shrink-0 h-[32px] w-[32px] flex items-center justify-center rounded-lg transition-colors"
              style={{
                background: "var(--bg-inner)",
                border: `1px solid ${calcModified ? "var(--brand)" : "var(--border-md)"}`,
                color: calcModified ? "var(--brand)" : "var(--text-3)",
              }}
            >
              <Calculator size={16} />
              {calcModified && (
                <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />
              )}
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={fullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
              className="flex-shrink-0 h-[32px] w-[32px] flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Diff legend — always rendered to hold space; invisible in compare mode */}
      <div
        className="flex flex-wrap items-center gap-3 text-[10px] mb-3"
        style={{ color: "var(--text-3)", visibility: isDiff ? "visible" : "hidden" }}
      >
        <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>D = P−A:</span>
        {diffLegendBands(dsegs, t).map(({ color, label }, i) => (
          <span key={`${color}-${i}`} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span>{label}</span>
          </span>
        ))}
      </div>

      {/* Table */}
      <div ref={scrollRef} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} onClick={() => clearSel()}>
        <table style={{
          borderCollapse: "collapse", borderSpacing: 0,
          tableLayout: "fixed",
          width: tableWidth,
        }}>
          {/* colgroup defines the real column grid (2 cols per date, each colW) */}
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {dates.flatMap((_, i) => [
              <col key={`cg-${i}-1`} style={{ width: colW }} />,
              <col key={`cg-${i}-2`} style={{ width: colW }} />,
            ])}
            {pads.flatMap((_, i) => [
              <col key={`cg-pad-${i}-1`} style={{ width: colW }} />,
              <col key={`cg-pad-${i}-2`} style={{ width: colW }} />,
            ])}
            {!isMobile && <col style={{ width: colW }} />}
            {!isMobile && <col style={{ width: colW }} />}
          </colgroup>

          <thead>
            {/* Date row */}
            <tr>
              <th
                onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}
                style={{
                  ...thBase,
                  position: "sticky", left: 0, zIndex: 4,
                  borderRight: "2px solid var(--border-md)",
                  width: LABEL_W, textAlign: "left", paddingLeft: 12,
                  cursor: "pointer", userSelect: "none",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Brigadir
                  {nameAsc === null
                    ? <span style={{ opacity: .4, fontSize: 9 }}>⇅</span>
                    : nameAsc
                      ? <span style={{ fontSize: 9 }}>↑</span>
                      : <span style={{ fontSize: 9 }}>↓</span>}
                </span>
              </th>

              {dates.map((d, i) => {
                const dateSel   = selection?.type === "date";
                const thisDSel  = dateSel && selection.value === d;
                const thisDGray = dateSel && selection.value !== d;
                return (
                  <th key={d} colSpan={2}
                    onClick={e => { e.stopPropagation(); toggleSel("date", d); }}
                    style={{
                      ...thBase,
                      textAlign: "center", color: "#fff",
                      fontWeight: thisDSel ? 700 : 600,
                      border: "1px solid var(--border)",
                      borderRight: (i < dates.length - 1 || padCount > 0) ? GROUP_BORDER : undefined,
                      opacity: thisDGray ? 0.45 : 1,
                      filter: noSel && hoveredCol === d ? "brightness(1.3)" : "none",
                      transition: "filter .08s, opacity .1s",
                      cursor: "pointer", userSelect: "none",
                    }}
                  >
                    {shortDate(d)}
                    {thisDSel && (
                      <span style={{ display: "block", height: 2, borderRadius: 1, background: "#fff", marginTop: 3 }} />
                    )}
                  </th>
                );
              })}

              {/* Blank placeholder date headers */}
              {pads.map((_, i) => (
                <th key={`pad-dh-${i}`} colSpan={2} style={{
                  ...thBase,
                  border: "1px solid var(--border)",
                  background: HDR_BG,
                }} />
              ))}

              {!isMobile && (
                <th
                  colSpan={2}
                  onClick={() => setSummaryMode(m => SUMMARY_CYCLE[m])}
                  style={{
                    ...thBase,
                    ...stickySum,
                    zIndex: 5,
                    textAlign: "center",
                    borderLeft: "2px solid var(--border-md)",
                    cursor: "pointer", userSelect: "none",
                    color: "#fff",
                  }}
                  title={t("comparison.cycleTooltip")}
                >
                  {summaryMode.toUpperCase()}
                </th>
              )}
            </tr>

            {/* P / A|D sub-header — animated internally */}
            <tr>
              <th style={{
                position: "sticky", left: 0, zIndex: 4,
                background: HDR_BG,
                borderRight: "2px solid var(--border-md)",
              }} />

              {dates.map((d, i) => (
                <th key={`${d}-sub`} colSpan={2} style={{
                  padding: 0, position: "relative", height: 24,
                  border: "1px solid var(--border)", background: HDR_BG,
                  borderRight: (i < dates.length - 1 || padCount > 0) ? GROUP_BORDER : undefined,
                  overflow: "hidden",
                }}>
                  {/* P label — shrinks away */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: isDiff ? "0%" : "50%",
                    transition: `width ${DUR} ${EASE}`,
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: ".5px",
                    borderRight: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}>P</div>

                  {/* A/D label — overgrrows P */}
                  <div style={{
                    position: "absolute", right: 0, top: 0, bottom: 0,
                    width: isDiff ? "100%" : "50%",
                    transition: `width ${DUR} ${EASE}`,
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: ".5px",
                  }}>
                    {isDiff ? "D" : "A"}
                  </div>
                </th>
              ))}

              {/* Blank placeholder sub-headers */}
              {pads.map((_, i) => (
                <th key={`pad-sub-${i}`} colSpan={2} style={{
                  padding: 0, height: 24,
                  border: "1px solid var(--border)", background: HDR_BG,
                }} />
              ))}

              {!isMobile && (
                <th colSpan={2} style={{
                  ...stickySum,
                  zIndex: 5,
                  padding: 0, height: 24,
                  border: "1px solid var(--border)", background: HDR_BG,
                  borderLeft: "2px solid var(--border-md)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: isDiff ? "0%" : "50%",
                    transition: `width ${DUR} ${EASE}`,
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: ".5px",
                    borderRight: "1px solid var(--border)",
                    boxSizing: "border-box",
                  }}>P</div>
                  <div style={{
                    position: "absolute", right: 0, top: 0, bottom: 0,
                    width: isDiff ? "100%" : "50%",
                    transition: `width ${DUR} ${EASE}`,
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: ".5px",
                  }}>
                    {isDiff ? "D" : "A"}
                  </div>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {displayManagers.map(name => {
              // Un-approved days are excluded from the visible summaries.
              const pVals = dates.map(d => {
                const cell = data[name]?.[d];
                return isApproved(name, d) && cell?.baseline_util != null ? Math.round(cell.baseline_util * 100) : null;
              });
              const aVals = dates.map(d => {
                const cell = data[name]?.[d];
                const a = actualUtil(cell, factors);
                return isApproved(name, d) && a != null ? Math.round(a * 100) : null;
              });
              const dVals = dates.map(d => {
                const cell = data[name]?.[d];
                if (!isApproved(name, d)) return null;
                const pv = cell?.baseline_util != null ? Math.round(cell.baseline_util * 100) : null;
                const a  = actualUtil(cell, factors);
                const av = a != null ? Math.round(a * 100) : null;
                return (pv !== null && av !== null) ? pv - av : null;
              });

              let pSummary, aSummary, dSummary;
              if (summaryMode === "avg") {
                pSummary = rowAvg(pVals);
                aSummary = rowAvg(aVals);
                dSummary = rowAvg(dVals);
              } else {
                const idx = findExtremeIdx(dVals, pVals, summaryMode);
                pSummary = idx !== null ? pVals[idx] : null;
                aSummary = idx !== null ? aVals[idx] : null;
                dSummary = idx !== null ? dVals[idx] : null;
              }

              const pSumColor = pSummary !== null ? getColor(pSummary, psegs) : { bg: "transparent", fg: "var(--text-4)" };
              const aSumColor = dSummary !== null ? getColor(dSummary, dsegs) : { bg: "transparent", fg: "var(--text-4)" };
              const dSumColor = dSummary !== null ? getColor(dSummary, dsegs) : { bg: "transparent", fg: "var(--text-4)" };

              const mgrSel      = selection?.type === "manager";
              const thisMgrSel  = mgrSel && selection.value === name;
              const thisMgrGray = mgrSel && selection.value !== name;

              return (
                <tr key={name}>
                  {/* Name — sticky */}
                  <td
                    onClick={e => { e.stopPropagation(); toggleSel("manager", name); }}
                    style={{
                      position: "sticky", left: 0, zIndex: 3,
                      background: noSel && hoveredRow === name ? "var(--bg-inner)" : "var(--bg-card)",
                      borderRight: "2px solid var(--border-md)",
                      textAlign: "left", paddingLeft: 12, paddingRight: 8,
                      fontSize: 12,
                      fontWeight: thisMgrSel ? 700 : 500,
                      color: thisMgrGray ? "var(--text-4)" : thisMgrSel ? "var(--text-1)" : labelColor,
                      opacity: thisMgrGray ? 0.35 : 1,
                      whiteSpace: "nowrap",
                      verticalAlign: "middle", height: 34,
                      width: LABEL_W, minWidth: LABEL_W,
                      transition: "background .08s, opacity .1s, color .1s",
                      cursor: "pointer", userSelect: "none",
                    }}
                  >
                    {tl(name)}
                  </td>

                  {/* Per-date cell — colSpan=2, animated P and A/D inside */}
                  {dates.map((d, i) => {
                    const cell = data[name]?.[d];
                    const pv = cell?.baseline_util != null ? Math.round(cell.baseline_util * 100) : null;
                    const aRaw = actualUtil(cell, factors);
                    const av = aRaw != null ? Math.round(aRaw * 100) : null;
                    const dv = (pv !== null && av !== null) ? pv - av : null;

                    const pColor = pv !== null
                      ? getColor(pv, psegs)
                      : { bg: "transparent", fg: "var(--text-4)", noData: true };
                    // A column color is always based on diff
                    const aColor = dv !== null
                      ? getColor(dv, dsegs)
                      : { bg: "transparent", fg: "var(--text-4)", noData: true };
                    const dColor = dv !== null
                      ? getColor(dv, dsegs)
                      : { bg: "transparent", fg: "var(--text-4)", noData: true };

                    const isLast = i === dates.length - 1;

                    // Pending = Verifix data uploaded but the day isn't confirmed
                    // yet. The backend marks the cell with the blocking reason:
                    // "not_closed" | "requests" (unprocessed edit requests).
                    const pendingReason =
                      cell?.pending ?? ((pv !== null || av !== null) && !isApproved(name, d) ? "not_closed" : null);
                    if (pendingReason !== null) {
                      return (
                        <td
                          key={`${name}-${d}`} colSpan={2}
                          title={t(pendingReason === "requests" ? "zagruzka.pendingRequests" : "zagruzka.pendingNotClosed")}
                          onClick={e => {
                            e.stopPropagation();
                            if (selection) clearSel();
                            else setPendingInfo({ name, date: d, reason: pendingReason });
                          }}
                          onMouseEnter={() => { if (noSel) { setHoveredRow(name); setHoveredCol(d); } }}
                          onMouseLeave={() => { if (noSel) { setHoveredRow(null); setHoveredCol(null); } }}
                          style={{
                            padding: 0,
                            border: "1px solid var(--border)",
                            borderRight: (!isLast || padCount > 0) ? GROUP_BORDER : undefined,
                            height: 34, verticalAlign: "middle", textAlign: "center",
                            background: "repeating-linear-gradient(45deg, var(--bg-inner), var(--bg-inner) 5px, transparent 5px, transparent 10px)",
                            opacity: cellGrayed(name, d) ? 0.18 : 1,
                            transition: "opacity .1s",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ opacity: 0.55, fontSize: 11 }}>⏳</span>
                        </td>
                      );
                    }

                    const isHoveredCell = noSel && hoveredRow === name && hoveredCol === d;
                    const isHoveredLine = noSel && (hoveredRow === name || hoveredCol === d);
                    const grayed = cellGrayed(name, d);
                    const cellFilter = grayed ? "none"
                      : isHoveredCell
                        ? "brightness(1.25)"
                        : isHoveredLine
                          ? "brightness(1.12)"
                          : "none";

                    return (
                      <td
                        key={`${name}-${d}`} colSpan={2}
                        onClick={e => e.stopPropagation()}
                        onMouseEnter={() => { if (noSel) { setHoveredRow(name); setHoveredCol(d); } }}
                        onMouseLeave={() => { if (noSel) { setHoveredRow(null); setHoveredCol(null); } }}
                        style={{
                          padding: 0, position: "relative",
                          border: "1px solid var(--border)",
                          borderRight: (!isLast || padCount > 0) ? GROUP_BORDER : undefined,
                          height: 34, verticalAlign: "middle",
                          opacity: grayed ? 0.18 : 1,
                          filter: cellFilter,
                          transform: isHoveredCell ? "scale(1.04)" : "none",
                          zIndex: isHoveredCell ? 2 : "auto",
                          transition: "filter .08s, transform .07s, opacity .1s",
                        }}
                      >
                        {/* P half — shrinks toward zero */}
                        <div style={{
                          position: "absolute", left: 0, top: 0, bottom: 0,
                          width: isDiff ? "0%" : "50%",
                          transition: `width ${DUR} ${EASE}`,
                          overflow: "hidden",
                          background: pColor.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          borderRight: "1px solid var(--border)",
                          boxSizing: "border-box",
                        }}>
                          {pv !== null
                            ? <button
                                onClick={() => setFormulaModal({
                                  title: `${t("zagruzka.planned")} (P) — ${shortDate(d)}`,
                                  value: `${pv}%`,
                                  formula: `${pValueNumbers(cell) || "P = prod_plan ÷ (480 × headcount) × 100"}\n${t("fm.planOnlyNote")}`,
                                  inputs: pValueInputs(cell, t),
                                })}
                                style={{ fontSize: 11, fontWeight: 700, color: pColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                              >
                                {pv}%
                              </button>
                            : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                          }
                        </div>

                        {/* A/D half — overgrrows P to fill the whole cell */}
                        <div style={{
                          position: "absolute", right: 0, top: 0, bottom: 0,
                          width: isDiff ? "100%" : "50%",
                          transition: `width ${DUR} ${EASE}, background-color 250ms`,
                          overflow: "hidden",
                          background: isDiff ? dColor.bg : aColor.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isDiff
                            ? dv !== null
                              ? <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                                  <button
                                    onClick={() => setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, mode: "actual" })}
                                    style={{ fontSize: 11, fontWeight: 700, color: dColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                  >
                                    {dv > 0 ? "+" : ""}{dv}%
                                  </button>
                                  {commentedCells.has(`${managerIds[name]}_${isoOf(d)}`) && (
                                    <span style={{ position: "absolute", top: -3, right: -5, width: 5, height: 5, borderRadius: "50%", background: "#fff", opacity: 0.9, display: "block" }} />
                                  )}
                                </div>
                              : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                            : av !== null
                              ? <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                                  <button
                                    onClick={() => setComment({ managerId: managerIds[name], managerName: name, date: d, rawCell: cell, mode: "actual" })}
                                    style={{ fontSize: 11, fontWeight: 700, color: aColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                  >
                                    {av}%
                                  </button>
                                  {commentedCells.has(`${managerIds[name]}_${isoOf(d)}`) && (
                                    <span style={{ position: "absolute", top: -3, right: -5, width: 5, height: 5, borderRadius: "50%", background: "#fff", opacity: 0.9, display: "block" }} />
                                  )}
                                </div>
                              : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                          }
                        </div>
                      </td>
                    );
                  })}

                  {/* Blank placeholder body cells */}
                  {pads.map((_, i) => (
                    <td key={`pad-${name}-${i}`} colSpan={2} style={{
                      padding: 0, height: 34,
                      border: "1px solid var(--border)",
                      background: "var(--bg-card)",
                    }} />
                  ))}

                  {/* Summary column — mirrors a date cell, pinned right (hidden on phones) */}
                  {!isMobile && (
                  <td colSpan={2} style={{
                    ...stickySum,
                    zIndex: 4,
                    padding: 0,
                    border: "1px solid var(--border)",
                    borderLeft: "2px solid var(--border-md)",
                    height: 34, verticalAlign: "middle",
                    background: "var(--bg-card)",
                  }}>
                    {/* P half */}
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: isDiff ? "0%" : "50%",
                      transition: `width ${DUR} ${EASE}`,
                      overflow: "hidden",
                      background: pSumColor.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRight: "1px solid var(--border)",
                      boxSizing: "border-box",
                    }}>
                      {pSummary !== null
                        ? <button
                            onClick={() => setFormulaModal({
                              title: `${summaryMode.toUpperCase()} ${t("comparison.plannedP")}`,
                              value: `${pSummary}%`,
                              formula: summaryMode === "avg"
                                ? t("comparison.fmAvgP")
                                : t("comparison.fmModeP")
                                    .replace("{mode}", t(summaryMode === "min" ? "comparison.minimum" : "comparison.maximum"))
                                    .replace("{tb}", t(summaryMode === "min" ? "comparison.lowest" : "comparison.highest")),
                              inputs: [{ label: t("comparison.pValue"), val: `${pSummary}%` }, { label: t("comparison.mode"), val: summaryMode.toUpperCase() }],
                            })}
                            style={{ fontSize: 11, fontWeight: 700, color: pSumColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                          >
                            {pSummary}%
                          </button>
                        : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                      }
                    </div>
                    {/* A / D half */}
                    <div style={{
                      position: "absolute", right: 0, top: 0, bottom: 0,
                      width: isDiff ? "100%" : "50%",
                      transition: `width ${DUR} ${EASE}, background-color 250ms`,
                      overflow: "hidden",
                      background: isDiff ? dSumColor.bg : aSumColor.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isDiff
                        ? dSummary !== null
                          ? <button
                              onClick={() => setFormulaModal({
                                title: `${summaryMode.toUpperCase()} ${t("comparison.differenceD")}`,
                                value: `${dSummary > 0 ? "+" : ""}${dSummary}%`,
                                formula: summaryMode === "avg"
                                  ? t("comparison.fmAvgD")
                                  : t("comparison.fmModeD")
                                      .replace("{mode}", t(summaryMode === "min" ? "comparison.minimum" : "comparison.maximum")),
                                inputs: [
                                  { label: t("comparison.dValue"), val: `${dSummary > 0 ? "+" : ""}${dSummary}%` },
                                  { label: t("comparison.pSameDate"), val: pSummary !== null ? `${pSummary}%` : "—" },
                                  { label: t("comparison.aSameDate"), val: aSummary !== null ? `${aSummary}%` : "—" },
                                ],
                              })}
                              style={{ fontSize: 11, fontWeight: 700, color: dSumColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            >
                              {dSummary > 0 ? "+" : ""}{dSummary}%
                            </button>
                          : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                        : aSummary !== null
                          ? <button
                              onClick={() => setFormulaModal({
                                title: `${summaryMode.toUpperCase()} ${t("comparison.actualA")}`,
                                value: `${aSummary}%`,
                                formula: summaryMode === "avg"
                                  ? t("comparison.fmAvgA")
                                  : t("comparison.fmModeA")
                                      .replace("{mode}", t(summaryMode === "min" ? "comparison.minimum" : "comparison.maximum"))
                                      .replace("{tb}", t(summaryMode === "min" ? "comparison.lowest" : "comparison.highest")),
                                inputs: [{ label: t("comparison.aValue"), val: `${aSummary}%` }, { label: t("comparison.mode"), val: summaryMode.toUpperCase() }],
                              })}
                              style={{ fontSize: 11, fontWeight: 700, color: aSumColor.fg, whiteSpace: "nowrap", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            >
                              {aSummary}%
                            </button>
                          : <span style={{ opacity: 0.25, fontSize: 11 }}>—</span>
                      }
                    </div>
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] mt-2 text-center" style={{ color: "var(--text-4)" }}>
        {t("zagruzka.tapComment")}
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

      {comment && (
        <CommentModal
          managerId={comment.managerId}
          managerName={comment.managerName}
          date={comment.date}
          rawCell={comment.rawCell}
          mode={comment.mode}
          onClose={() => setComment(null)}
          formulaCollapsible
        />
      )}

      {pendingInfo && (
        <PendingInfoModal
          managerName={pendingInfo.name}
          date={pendingInfo.date}
          reason={pendingInfo.reason}
          onClose={() => setPendingInfo(null)}
        />
      )}

      {showGuide && (
        <ColorGuideModal
          title={t("zagruzka.colorGuide")}
          subtitle={t("zagruzka.colorGuideSub")}
          sections={[
            { heading: t("zagruzka.guide.adSection"), segments: dsegs },
            { heading: t("zagruzka.guide.pSection"),  segments: psegs },
          ]}
          onClose={() => setShowGuide(false)}
        />
      )}

      {showCalc && (
        <Modal
          title={t("zagruzka.calcTitle")}
          subtitle={t("zagruzka.calcSubtitle")}
          icon={<Calculator size={18} style={{ color: "var(--brand)" }} />}
          onClose={() => setShowCalc(false)}
          maxWidth="max-w-sm"
          footer={<Button onClick={() => setShowCalc(false)}>{t("zagruzka.calcDone")}</Button>}
        >
          {CALC_FACTOR_DEFS.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{t(f.label)}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t(f.sub)}</div>
              </div>
              <SegmentedToggle
                size="sm"
                value={!!factors[f.key]}
                onChange={(v) => onCalcFactorsChange?.({ ...factors, [f.key]: v })}
                options={[[true, t("zagruzka.calcOn")], [false, t("zagruzka.calcOff")]]}
              />
            </div>
          ))}
          <div className="text-[11px] pt-2" style={{ color: "var(--text-4)", borderTop: "1px dashed var(--border)" }}>
            {t("zagruzka.calcHint")}
          </div>
        </Modal>
      )}
    </div>
  );
}
