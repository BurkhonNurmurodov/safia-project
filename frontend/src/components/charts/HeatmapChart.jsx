import { useState, useRef, useEffect } from "react";
import { useChartTheme } from "../../hooks/useChartTheme";
import useIsMobile from "../../hooks/useIsMobile";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import PendingInfoModal from "../ui/PendingInfoModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_W  = 42;
const LABEL_W = 172;
const AVG_W   = 56;

// The table is calibrated to fit exactly this many day-columns with no
// horizontal scroll. Day-columns stretch so exactly BASIS_DAYS fill the
// available width; fewer days → blank placeholder cells keep the width
// constant; more days → the container scrolls horizontally.
const BASIS_DAYS = 14;

// 3-tier thresholds matching design: <81 red, 81-117 green, ≥118 blue
export const DEFAULT_SEGMENTS = [
  { from: 0,   color: "#ef4444" }, // < 81%   → red
  { from: 81,  color: "#22c55e" }, // 81–117% → green
  { from: 118, color: "#3b82f6" }, // ≥ 118%  → blue
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pick black or white text so it's legible on any solid hex background. */
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance (WCAG formula, simplified)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.52 ? "#111827" : "#ffffff";
}

function getSegmentColor(v, segs) {
  if (v == null || v < 0) return { bg: "transparent", fg: "var(--text-4)", accent: "var(--text-4)", noData: true };
  let result = segs[0];
  for (const seg of segs) {
    if (v >= seg.from) result = seg;
    else break;
  }
  return {
    bg:     result.color,                  // fully saturated background
    fg:     contrastText(result.color),    // auto-contrast text (black or white)
    accent: result.color,                  // original color for dots / borders
  };
}

function shortDate(d) { return d.slice(0, 5); }

// Compute row statistic based on mode (only over approved days)
function rowStat(managerName, mode, data, dates, statMode, isApproved) {
  const vals = dates
    .map(d => {
      if (isApproved && !isApproved(managerName, d)) return null;
      const cell = data[managerName]?.[d];
      const v = mode === "planned" ? cell?.baseline_util : cell?.net_util;
      return v != null ? Math.round(v * 100) : null;
    })
    .filter(v => v !== null);
  if (!vals.length) return null;
  if (statMode === "max") return Math.max(...vals);
  if (statMode === "min") return Math.min(...vals);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ─── Cell style builder ───────────────────────────────────────────────────────

function buildCellStyle({ color, grayed, rowHovered, colHovered, cellHovered, width }) {
  let filter    = "none";
  let transform = "none";
  let boxShadow = "none";
  let zIndex    = "auto";

  if (!grayed && !color.noData) {
    if (cellHovered) {
      filter    = "brightness(1.25)";
      transform = "scale(1.06)";
      boxShadow = "0 4px 12px rgba(0,0,0,.25)";
      zIndex    = 3;
    } else if (rowHovered || colHovered) {
      filter = "brightness(1.12)";
    }
  }

  return {
    background:    color.noData ? "transparent" : color.bg,
    color:         color.fg,
    textAlign:     "center",
    fontSize:      11,
    fontWeight:    color.noData ? 400 : 700,
    cursor:        grayed || color.noData ? "default" : "pointer",
    padding:       0,
    height:        34,
    border:        "1px solid var(--border)",
    opacity:       grayed ? 0.18 : 1,
    filter,
    transform,
    boxShadow,
    zIndex,
    verticalAlign: "middle",
    transition:    "filter .08s, transform .07s, box-shadow .07s",
    width:         width,
    minWidth:      width,
    letterSpacing: "-0.2px",
    position:      "relative",
  };
}

const AVG_CYCLE = ["avg", "max", "min"];

// ─── Single-mode grid ─────────────────────────────────────────────────────────

function SingleGrid({
  dates, managers, data, mode, labelColor,
  onCellClick, onPendingClick, segs, selection, toggleSel, clearSel,
  managerIds, commentedCells, isoOf, approvedCells,
  avgMode, onCycleAvg,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const isMobile = useIsMobile(); // phones: hide the pinned AVG/MAX/MIN column
  const [hoveredRow,  setHoveredRow]  = useState(null);
  const [hoveredCol,  setHoveredCol]  = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [nameAsc,     setNameAsc]     = useState(true);

  const displayManagers = nameAsc !== null
    ? [...managers].sort((a, b) => nameAsc
        ? (a || "").localeCompare(b || "")
        : (b || "").localeCompare(a || ""))
    : managers;
  const noSel = !selection;

  // A (manager, date) cell is gated until its day is approved. When
  // approvedCells is null the gate is OFF (e.g. still loading) → show all.
  const gateOn = approvedCells instanceof Set;
  const isApproved = (name, d) =>
    !gateOn || approvedCells.has(`${managerIds[name]}_${isoOf(d)}`);

  // Measure the scroll container so day-columns size to fill exactly BASIS_DAYS
  // across the available width (both embedded and fullscreen). Column width
  // depends only on container size + BASIS_DAYS — never on how many days are
  // selected — so cells never grow/shrink as you change the date range.
  const scrollRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pad up to BASIS_DAYS with blank cells so the table keeps a constant width;
  // more than BASIS_DAYS overflows and scrolls. Day-columns stretch so exactly
  // BASIS_DAYS fill the container (clamped to a CELL_W minimum on narrow views).
  const padCount   = Math.max(0, BASIS_DAYS - dates.length);
  const effDays    = Math.max(BASIS_DAYS, dates.length);
  const avgW       = isMobile ? 0 : AVG_W;  // summary column is dropped on phones
  const cellW      = containerW > 0
    ? Math.max(CELL_W, Math.floor((containerW - LABEL_W - avgW) / BASIS_DAYS))
    : CELL_W;
  const tableWidth = LABEL_W + effDays * cellW + avgW;
  const pads       = Array.from({ length: padCount });

  // Summary column is pinned to the right edge; data scrolls underneath it.
  const stickyAvg = {
    position: "sticky", right: 0,
    boxShadow: "-6px 0 8px -6px rgba(0,0,0,0.25)",
  };

  function cellGrayed(name, d) {
    if (!selection) return false;
    if (selection.type === "manager") return selection.value !== name;
    if (selection.type === "date")    return selection.value !== d;
    return false;
  }

  const stickyNameBase = {
    position: "sticky", left: 0, zIndex: 3,
    background: "var(--bg-card)",
    borderRight: "2px solid var(--border-md)",
  };

  const thBase = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".07em",
    textTransform: "uppercase", color: "#fff",
    paddingBottom: 6, paddingTop: 4,
    whiteSpace: "nowrap",
    background: "var(--brand)",
  };

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
      onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); setHoveredCell(null); }}
      onClick={() => clearSel()}
    >
      <table style={{
        borderCollapse: "collapse",
        borderSpacing:  0,
        width:          tableWidth,
      }}>
        <thead>
          <tr>
            {/* BRIGADIR header */}
            <th
              onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}
              style={{
                ...stickyNameBase,
                ...thBase,
                width: LABEL_W,
                zIndex: 4,
                textAlign: "left",
                paddingLeft: 12,
                cursor: "pointer",
                userSelect: "none",
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

            {/* Date headers */}
            {dates.map(d => {
              const dateSel  = selection?.type === "date";
              const thisSel  = dateSel && selection.value === d;
              const thisGray = dateSel && selection.value !== d;
              return (
                <th
                  key={d}
                  onClick={e => { e.stopPropagation(); toggleSel("date", d); }}
                  style={{
                    ...thBase,
                    textAlign:  "center",
                    fontWeight: thisSel ? 700 : 600,
                    color:      "#fff",
                    opacity:    thisGray ? 0.45 : 1,
                    cursor:     "pointer",
                    transition: "opacity .1s, color .1s",
                    userSelect: "none",
                    width:      cellW,
                    minWidth:   cellW,
                    border:     "1px solid var(--border)",
                  }}
                >
                  {shortDate(d)}
                  {thisSel && (
                    <span style={{
                      display: "block", height: 2, borderRadius: 1,
                      background: "#fff", marginTop: 3,
                    }} />
                  )}
                </th>
              );
            })}

            {/* Blank placeholder headers — hold the BASIS_DAYS width */}
            {pads.map((_, i) => (
              <th key={`pad-h-${i}`} style={{
                ...thBase,
                width: cellW, minWidth: cellW,
                border: "1px solid var(--border)",
              }} />
            ))}

            {/* AVG / MAX / MIN header — clickable to cycle, pinned right (hidden on phones) */}
            {!isMobile && (
              <th
                onClick={e => { e.stopPropagation(); onCycleAvg(); }}
                style={{
                  ...thBase,
                  ...stickyAvg,
                  zIndex:      5,
                  textAlign:   "center",
                  width:       AVG_W,
                  minWidth:    AVG_W,
                  cursor:      "pointer",
                  userSelect:  "none",
                  borderLeft:  "2px solid var(--border-md)",
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                {t(`zagruzka.stat${avgMode.charAt(0).toUpperCase() + avgMode.slice(1)}`)}
                <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>↕</span>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {displayManagers.map(name => {
            const mgrSel   = selection?.type === "manager";
            const thisSel  = mgrSel && selection.value === name;
            const thisGray = mgrSel && selection.value !== name;
            const stat     = rowStat(name, mode, data, dates, avgMode, isApproved);
            const statColor = getSegmentColor(stat, segs);

            return (
              <tr key={name}>
                {/* Name cell */}
                <td
                  onClick={e => { e.stopPropagation(); toggleSel("manager", name); }}
                  style={{
                    ...stickyNameBase,
                    textAlign:     "left",
                    paddingLeft:   12,
                    paddingRight:  8,
                    fontSize:      12,
                    fontWeight:    thisSel ? 700 : 500,
                    color:         thisGray ? "var(--text-4)" : thisSel ? "var(--text-1)" : labelColor,
                    whiteSpace:    "nowrap",
                    verticalAlign: "middle",
                    cursor:        "pointer",
                    opacity:       thisGray ? 0.35 : 1,
                    transition:    "opacity .1s, color .1s",
                    userSelect:    "none",
                    height:        34,
                  }}
                >
                  {tl(name)}
                </td>

                {/* Data cells */}
                {dates.map(d => {
                  const cell   = data[name]?.[d];
                  const val    = mode === "planned" ? cell?.baseline_util : cell?.net_util;
                  const v      = val != null ? Math.round(val * 100) : -1;
                  const hasData = v >= 0;
                  // Pending = Verifix data uploaded but the day isn't confirmed
                  // yet. The backend marks the cell with the blocking reason:
                  // "not_closed" | "requests" (unprocessed edit requests).
                  const pendingReason =
                    cell?.pending ?? (hasData && !isApproved(name, d) ? "not_closed" : null);
                  const pending = pendingReason !== null;
                  const color  = pending ? { bg: "transparent", fg: "var(--text-4)", accent: "var(--text-4)", noData: true } : getSegmentColor(v, segs);
                  const grayed = cellGrayed(name, d);
                  const rowH   = noSel && hoveredRow === name;
                  const colH   = noSel && hoveredCol === d;
                  const cHov   = noSel && hoveredCell?.row === name && hoveredCell?.col === d;

                  return (
                    <td
                      key={d}
                      onMouseEnter={() => { if (noSel) { setHoveredRow(name); setHoveredCol(d); setHoveredCell({ row: name, col: d }); } }}
                      onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); setHoveredCell(null); }}
                      onClick={e => {
                        e.stopPropagation();
                        if (selection) clearSel();
                        else if (pending) onPendingClick(name, d, pendingReason);
                        else if (!color.noData) onCellClick(name, d, v, cell);
                      }}
                      title={pending
                        ? t(pendingReason === "requests" ? "zagruzka.pendingRequests" : "zagruzka.pendingNotClosed")
                        : undefined}
                      style={{
                        ...buildCellStyle({
                          color, grayed,
                          rowHovered: rowH, colHovered: colH, cellHovered: cHov,
                          width: cellW,
                        }),
                        ...(pending ? {
                          background: "repeating-linear-gradient(45deg, var(--bg-inner), var(--bg-inner) 5px, transparent 5px, transparent 10px)",
                          cursor: "pointer",
                        } : {}),
                      }}
                    >
                      <div style={{ position: "relative", display: "inline-block", lineHeight: 1 }}>
                        {pending
                          ? <span style={{ opacity: 0.55, fontSize: 11 }}>⏳</span>
                          : v < 0 ? <span style={{ opacity: 0.25 }}>—</span> : `${v}%`}
                      </div>
                    </td>
                  );
                })}

                {/* Blank placeholder cells — hold the BASIS_DAYS width */}
                {pads.map((_, i) => (
                  <td key={`pad-${name}-${i}`} style={{
                    width: cellW, minWidth: cellW, height: 34,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                  }} />
                ))}

                {/* AVG / MAX / MIN cell — pinned right (hidden on phones) */}
                {!isMobile && (
                  <td style={{
                    ...buildCellStyle({
                      color:      statColor,
                      grayed:     thisGray,
                      rowHovered: false,
                      colHovered: false,
                      cellHovered: false,
                      width: AVG_W,
                    }),
                    ...stickyAvg,
                    zIndex:       4,
                    minWidth:     AVG_W,
                    background:   statColor.noData ? "var(--bg-card)" : statColor.bg,
                    borderLeft:   "2px solid var(--border-md)",
                    fontWeight:   700,
                    cursor:       "default",
                  }}>
                    {stat !== null ? `${stat}%` : <span style={{ opacity: 0.25 }}>—</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function HeatmapChart({
  dates, managers, data,
  mode = "actual",
  managerIds = {},
  segments = [],
  commentedCells = new Set(),
  approvedCells = null,
  onCellClick = () => {},
  fullscreen = false,
}) {
  const { labelColor } = useChartTheme();
  const { t } = useLang();
  const [selection, setSelection] = useState(null);
  const [avgMode,   setAvgMode]   = useState("avg"); // avg → max → min → avg
  const [pendingInfo, setPendingInfo] = useState(null); // { name, date, reason }

  const segs = segments.length ? segments : DEFAULT_SEGMENTS;

  function toggleSel(type, value) {
    setSelection(prev =>
      prev?.type === type && prev?.value === value ? null : { type, value }
    );
  }
  function clearSel() { setSelection(null); }
  function cycleAvg() {
    setAvgMode(m => {
      const idx = AVG_CYCLE.indexOf(m);
      return AVG_CYCLE[(idx + 1) % AVG_CYCLE.length];
    });
  }

  const isoOf = (ddmmyyyy) => {
    const [d, m, y] = ddmmyyyy.split(".");
    return `${y}-${m}-${d}`;
  };

  const gridProps = {
    dates, managers, data, labelColor,
    onCellClick,
    onPendingClick: (name, date, reason) => setPendingInfo({ name, date, reason }),
    segs, selection, toggleSel, clearSel,
    managerIds, commentedCells, isoOf, approvedCells, fullscreen,
    avgMode, onCycleAvg: cycleAvg,
  };

  return (
    <div style={{ height: fullscreen ? "100%" : undefined, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SingleGrid {...gridProps} mode={mode} />
      </div>

      {pendingInfo && (
        <PendingInfoModal
          managerName={pendingInfo.name}
          date={pendingInfo.date}
          reason={pendingInfo.reason}
          onClose={() => setPendingInfo(null)}
        />
      )}
    </div>
  );
}
