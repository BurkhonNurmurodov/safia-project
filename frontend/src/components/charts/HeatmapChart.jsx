import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useChartTheme } from "../../hooks/useChartTheme";
import useIsMobile from "../../hooks/useIsMobile";
import useGridHover from "../../hooks/useGridHover";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import PendingInfoModal, { PENDING_ICONS, PENDING_MSG_KEYS } from "../ui/PendingInfoModal";
// The ink on a solid status fill is ONE rule — this file had its own copy of
// it and «Smena hisoboti» paints the same cell, so the rule moved to the file
// that owns the bands and both read it there.
import { contrastText } from "../../utils/statusBands";
import { SkeletonBlock, SKELETON_NAME_WIDTHS, skeletonWave } from "../ui/Skeleton";

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
function isoOf(ddmmyyyy) { const [d, m, y] = ddmmyyyy.split("."); return `${y}-${m}-${d}`; }

// Defaults shared across renders, so a caller that omits a prop does not hand
// the memoised grid a new object every time (see the memo at the bottom).
const NO_IDS  = {};
const NO_SEGS = [];
const NO_SET  = new Set();
const NOOP    = () => {};

// Compute row statistic (only over approved days). `read` is the grid's one
// value reader, so the pinned AVG/MAX/MIN reads exactly what the cells do.
function rowStat(managerName, read, data, dates, statMode, isApproved) {
  const vals = dates
    .map(d => {
      if (isApproved && !isApproved(managerName, d)) return null;
      const cell = data[managerName]?.[d];
      const v = read(cell);
      return v != null ? Math.round(v * 100) : null;
    })
    .filter(v => v !== null);
  if (!vals.length) return null;
  if (statMode === "max") return Math.max(...vals);
  if (statMode === "min") return Math.min(...vals);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ─── Cell style builder ───────────────────────────────────────────────────────

// No filter / transform / shadow / z-index here: the hover lift is index.css's
// («Grid hover», driven by hooks/useGridHover.js), and an inline value would
// win over it.
function buildCellStyle({ color, grayed, width }) {
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
    verticalAlign: "middle",
    transition:    "filter .08s, transform .07s, box-shadow .07s",
    width:         width,
    minWidth:      width,
    letterSpacing: "-0.2px",
    position:      "relative",
  };
}

const AVG_CYCLE = ["avg", "max", "min"];

// A phone's row name: a touch screen has no tooltip to read a clipped name
// from, so a name too long for its line («Abdurakhmonova G.») takes a second
// one inside the same 34px row instead of losing its tail to an ellipsis.
const PHONE_NAME = {
  display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
  overflow: "hidden", lineHeight: "14px",
};

// ─── Single-mode grid ─────────────────────────────────────────────────────────

const SingleGrid = memo(function SingleGrid({
  dates, managers, data, mode, labelColor,
  onCellClick, onPendingClick, segs, selection, toggleSel, clearSel,
  managerIds, commentedCells, isoOf, approvedCells,
  avgMode, onCycleAvg, cellTitle,
  rowLabel = "Brigadir", labelWidth = LABEL_W,
  labelFor = null,
  pinnedRow = null,
  cellValue = null,
  loading = false,
  loadingRows = 6,
  phoneFit = false,
  fullscreen = false,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const isMobile = useIsMobile(); // phones: hide the pinned AVG/MAX/MIN column
  const fit = phoneFit && isMobile;
  // THE value reader — every cell, the unit row and both summaries go through
  // it. Without `cellValue` it is the fleet heatmap's own Plan/Fact switch,
  // byte-for-byte what this grid has always read.
  const read = cellValue || ((cell) => (mode === "planned" ? cell?.baseline_util : cell?.net_util));
  const [nameAsc,     setNameAsc]     = useState(true);
  const hover = useGridHover();

  const displayManagers = nameAsc !== null
    ? [...managers].sort((a, b) => nameAsc
        ? (a || "").localeCompare(b || "")
        : (b || "").localeCompare(a || ""))
    : managers;
  // Display spelling of a row key. Rows sort by the KEY (the cell code on the
  // per-cell загрузка), so a leader's name appended here never reorders them.
  const shown = (name, full = false) => (labelFor ? labelFor(name, full, tl) : tl(name));

  // A (manager, date) cell is gated until its day is approved. When
  // approvedCells is null the gate is OFF (e.g. still loading) → show all.
  const gateOn = approvedCells instanceof Set;
  const isApproved = (name, d) =>
    !gateOn || approvedCells.has(`${managerIds[name]}_${isoOf(d)}`);

  // Measure the scroll container so day-columns size to fill exactly BASIS_DAYS
  // across the available width (both embedded and fullscreen). Column width
  // depends only on container size + BASIS_DAYS — never on how many days are
  // selected — so cells never grow/shrink as you change the date range.
  // On a phone (`fit`) the grid is two boxes side by side — see the render —
  // so the width measured is the wrapper holding both.
  const scrollRef = useRef(null);
  const outerRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = fit ? outerRef.current : scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Pad up to BASIS_DAYS with blank cells so the table keeps a constant width;
  // more than BASIS_DAYS overflows and scrolls. Day-columns stretch so exactly
  // BASIS_DAYS fill the container (clamped to a CELL_W minimum on narrow views).
  // `fit` (a phone, opted in): no pads, and the real days alone share the
  // width — stretched when they all fit, scrolled when they do not.
  const padCount   = fit ? 0 : Math.max(0, BASIS_DAYS - dates.length);
  const effDays    = fit ? dates.length : Math.max(BASIS_DAYS, dates.length);
  const avgW       = isMobile ? 0 : AVG_W;  // summary column is dropped on phones
  let labelW = labelWidth;
  let cellW = containerW > 0
    ? Math.max(CELL_W, Math.floor((containerW - labelWidth - avgW) / BASIS_DAYS))
    : CELL_W;
  if (fit && containerW > 0) {
    // On a phone the columns SNAP to the screen: as many whole days as fit
    // beside the names (all of them, stretched, when they all fit), and the
    // name column takes the remainder — so the grid never opens on a sliver
    // of a day peeking out from under the names.
    const room = containerW - labelWidth;
    const n = Math.max(1, Math.min(dates.length || 1, Math.floor(room / CELL_W)));
    cellW = Math.floor(room / n);
    labelW = containerW - n * cellW;
  }
  const tableWidth = labelW + effDays * cellW + avgW;
  const pads       = Array.from({ length: padCount });

  // A phone opens the grid on the LATEST days — the ones a reader checks first
  // — and slides left into the older ones. Re-aimed when the period changes,
  // never on a mode switch or a data refresh, so a reader's own scroll stays.
  const measured  = containerW > 0;
  const firstDate = dates[0];
  const lastDate  = dates[dates.length - 1];
  useEffect(() => {
    if (!fit || !measured) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [fit, measured, dates.length, firstDate, lastDate]);

  // The name column's text lines up with the card title (16px) once the grid
  // bleeds to the card's edges on a phone.
  const namePadL = fit ? 16 : 12;
  const namePadR = fit ? 6 : 8;
  // Fullscreen on a phone: the grid fills the overlay and scrolls down inside
  // it. Left at its content height it ran past the screen's bottom edge, and
  // the rows down there could not be reached at all.
  const fillFull = fit && fullscreen;
  // A phone's header row has ONE height in both of its tables (a selected
  // day's underline must not make the day row taller than the names' row).
  const headH = fit ? { height: 30 } : null;

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
  // In a phone's own names table nothing scrolls under a name, so it is not
  // sticky: a sticky cell is drawn as a layer of its own, and a layer that
  // lands a frame late is what let the days under the names show through.
  // Its cells carry the day cells' 1px rules (invisible), so a row of names
  // and its row of days collapse to exactly the same pitch.
  const namesOnly = (part) => (part === "names"
    ? { position: "static", borderTop: "1px solid transparent", borderBottom: "1px solid transparent" }
    : null);

  const thBase = {
    fontSize: fit ? 11 : 10, fontWeight: 700, letterSpacing: ".07em",
    textTransform: "uppercase", color: "#fff",
    paddingBottom: 6, paddingTop: 4,
    whiteSpace: "nowrap",
    background: "var(--brand)",
  };

  // Loading rows: the real row in every measure — the sticky name column, a
  // full-bleed fill per day where the coloured cell will land (inset a pixel so
  // the card shows between cells as the grid rule), blank pads, the pinned
  // AVG column — pulsing as one diagonal wave.
  const skFill = (col, row) => ({
    position: "absolute", inset: 1,
    background: "var(--skeleton)",
    ...skeletonWave(col, row),
  });
  const skRows = (part) => (loading ? Array.from({ length: loadingRows }, (_, r) => (
    <tr key={`sk-${r}`} aria-hidden="true">
      {part !== "data" && <td style={{
        ...stickyNameBase,
        ...namesOnly(part),
        paddingLeft: namePadL, paddingRight: namePadR,
        width: labelW, maxWidth: labelW,
        verticalAlign: "middle", height: 34,
      }}>
        <SkeletonBlock
          className={`h-3 ${SKELETON_NAME_WIDTHS[r % SKELETON_NAME_WIDTHS.length]}`}
          style={skeletonWave(0, r)}
        />
      </td>}
      {part !== "names" && dates.map((d, i) => (
        <td key={d} style={{
          position: "relative", padding: 0,
          width: cellW, minWidth: cellW, height: 34,
          border: "1px solid var(--border)",
        }}>
          <div className="animate-pulse" style={skFill(i + 1, r)} />
        </td>
      ))}
      {part !== "names" && pads.map((_, i) => (
        <td key={`sk-pad-${r}-${i}`} style={{
          width: cellW, minWidth: cellW, height: 34,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
        }} />
      ))}
      {part !== "names" && !isMobile && (
        <td style={{
          ...stickyAvg,
          zIndex: 4, padding: 0,
          width: AVG_W, minWidth: AVG_W, height: 34,
          border: "1px solid var(--border)",
          borderLeft: "2px solid var(--border-md)",
          background: "var(--bg-card)",
        }}>
          <div className="animate-pulse" style={skFill(dates.length + 1, r)} />
        </td>
      )}
    </tr>
  )) : null);

  // ONE table in every measure, drawn whole ("all") — or, on a phone, as its
  // two halves side by side: the names ("names") and the days ("data"), in a
  // horizontal scroller of their own. On a phone the grid opens scrolled to
  // the latest day, so a sticky name column sat over days at rest — and a
  // sticky cell is its own layer, which a fast scroll can draw a frame late,
  // showing the days under the names first. With nothing under the names
  // there is nothing to show through. Rows keep one pitch in both halves:
  // every cell is 34px, the header row 30px on a phone.
  const renderTable = (part) => (
    <table style={{
      borderCollapse: "collapse",
      borderSpacing:  0,
      width:          part === "names" ? labelW : part === "data" ? tableWidth - labelW : tableWidth,
      ...(part === "names" ? { flexShrink: 0 } : null),
    }}>
      <thead>
        <tr>
          {/* BRIGADIR header */}
          {part !== "data" && <th
            onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}
            style={{
              ...stickyNameBase,
              ...thBase,
              width: labelW,
              zIndex: 4,
              ...namesOnly(part),
              ...headH,
              textAlign: "left",
              paddingLeft: namePadL,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {rowLabel}
              {nameAsc === null
                ? <span style={{ opacity: .4, fontSize: 9 }}>⇅</span>
                : nameAsc
                  ? <span style={{ fontSize: 9 }}>↑</span>
                  : <span style={{ fontSize: 9 }}>↓</span>}
            </span>
          </th>}

          {/* Date headers */}
          {part !== "names" && dates.map(d => {
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
                  ...(fit ? { scrollSnapAlign: "start" } : null),
                  ...headH,
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
          {part !== "names" && pads.map((_, i) => (
            <th key={`pad-h-${i}`} style={{
              ...thBase,
              width: cellW, minWidth: cellW,
              border: "1px solid var(--border)",
            }} />
          ))}

          {/* AVG / MAX / MIN header — clickable to cycle, pinned right (hidden on phones) */}
          {part !== "names" && !isMobile && (
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
        {loading ? skRows(part) : displayManagers.map((name, ri) => {
          const mgrSel   = selection?.type === "manager";
          const thisSel  = mgrSel && selection.value === name;
          const thisGray = mgrSel && selection.value !== name;
          const stat     = rowStat(name, read, data, dates, avgMode, isApproved);
          const statColor = getSegmentColor(stat, segs);

          return (
            <tr key={name}>
              {/* Name cell */}
              {part !== "data" && <td
                onClick={e => { e.stopPropagation(); toggleSel("manager", name); }}
                style={{
                  ...stickyNameBase,
                  ...namesOnly(part),
                  textAlign:     "left",
                  paddingLeft:   namePadL,
                  paddingRight:  namePadR,
                  fontSize:      12,
                  fontWeight:    thisSel ? 700 : 500,
                  color:         thisGray ? "var(--text-4)" : thisSel ? "var(--text-1)" : labelColor,
                  // nowrap alone let a long row name widen the column past
                  // labelW (which tableWidth was computed from) or spill
                  // over the date cells. Clip it; the tooltip keeps the rest.
                  whiteSpace:    fit ? "normal" : "nowrap",
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  width:         labelW,
                  maxWidth:      labelW,
                  verticalAlign: "middle",
                  cursor:        "pointer",
                  opacity:       thisGray ? 0.35 : 1,
                  transition:    "opacity .1s, color .1s",
                  userSelect:    "none",
                  height:        34,
                }}
                title={shown(name, true)}
              >
                {fit ? <span style={PHONE_NAME}>{shown(name)}</span> : shown(name)}
              </td>}

              {/* Data cells */}
              {part !== "names" && dates.map((d, ci) => {
                const cell   = data[name]?.[d];
                const val    = read(cell);
                const v      = val != null ? Math.round(val * 100) : -1;
                const hasData = v >= 0;
                // Pending = Verifix data uploaded but the value can't show
                // yet. The backend marks the cell with the blocking reason:
                // "not_closed" | "requests" (unprocessed edit requests) |
                // "no_headcount" (day confirmed, «Odam soni» not loaded).
                const pendingReason =
                  cell?.pending ?? (hasData && !isApproved(name, d) ? "not_closed" : null);
                const pending = pendingReason !== null;
                const color  = pending ? { bg: "transparent", fg: "var(--text-4)", accent: "var(--text-4)", noData: true } : getSegmentColor(v, segs);
                const grayed = cellGrayed(name, d);

                return (
                  <td
                    key={d}
                    className={color.noData ? undefined : "hm-live"}
                    data-gt=""
                    data-gr={ri}
                    data-gc={ci}
                    onClick={e => {
                      e.stopPropagation();
                      if (selection) clearSel();
                      else if (pending) onPendingClick(name, d, pendingReason);
                      else if (!color.noData) onCellClick(name, d, v, cell);
                    }}
                    title={pending
                      ? t(PENDING_MSG_KEYS[pendingReason] || "zagruzka.pendingNotClosed")
                      : cellTitle?.(cell, name, d)}
                    style={{
                      ...buildCellStyle({ color, grayed, width: cellW }),
                      ...(pending ? {
                        background: "repeating-linear-gradient(45deg, var(--bg-inner), var(--bg-inner) 5px, transparent 5px, transparent 10px)",
                        cursor: "pointer",
                      } : {}),
                    }}
                  >
                    <div style={{ position: "relative", display: "inline-block", lineHeight: 1 }}>
                      {pending
                        ? <span style={{ opacity: 0.55, fontSize: 11 }}>{PENDING_ICONS[pendingReason] || "⏳"}</span>
                        : v < 0 ? <span style={{ opacity: 0.25 }}>—</span> : `${v}%`}
                    </div>
                  </td>
                );
              })}

              {/* Blank placeholder cells — hold the BASIS_DAYS width */}
              {part !== "names" && pads.map((_, i) => (
                <td key={`pad-${name}-${i}`} style={{
                  width: cellW, minWidth: cellW, height: 34,
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                }} />
              ))}

              {/* AVG / MAX / MIN cell — pinned right (hidden on phones) */}
              {part !== "names" && !isMobile && (
                <td style={{
                  ...buildCellStyle({ color: statColor, grayed: thisGray, width: AVG_W }),
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

      {/* ── The unit's own row ──────────────────────────────────────────
          The supervisor the rows belong to, computed from the unit's summed
          inputs rather than averaged out of the grid. It sits in the footer,
          visually separated, and names itself: two percentages for one day
          are only readable when each says which question it answers. */}
      {pinnedRow?.data && (
        <tfoot>
          <tr>
            {part !== "data" && <td
              title={pinnedRow.hint || undefined}
              style={{
                ...stickyNameBase,
                ...namesOnly(part),
                background:    "var(--bg-inner)",
                borderTop:     "2px solid var(--border-md)",
                textAlign:     "left",
                paddingLeft:   namePadL,
                paddingRight:  namePadR,
                fontSize:      12,
                fontWeight:    700,
                color:         "var(--text-1)",
                whiteSpace:    "nowrap",
                overflow:      "hidden",
                textOverflow:  "ellipsis",
                width:         labelW,
                maxWidth:      labelW,
                verticalAlign: "middle",
                height:        34,
              }}
            >
              {tl(pinnedRow.label)}
              {pinnedRow.note && (
                <div style={{
                  fontSize: 10, fontWeight: 500, color: "var(--text-3)",
                  overflow: "hidden", textOverflow: "ellipsis", marginTop: -1,
                }}>
                  {pinnedRow.note}
                </div>
              )}
            </td>}

            {part !== "names" && dates.map((d, ci) => {
              const cell = pinnedRow.data[d];
              const val  = read(cell);
              const v    = val != null ? Math.round(val * 100) : -1;
              const color = getSegmentColor(v, segs);
              return (
                <td
                  key={`unit-${d}`}
                  className={color.noData ? undefined : "hm-live"}
                  data-gt=""
                  data-gc={ci}
                  onClick={e => {
                    e.stopPropagation();
                    if (selection) clearSel();
                    else if (!color.noData) onCellClick(pinnedRow.label, d, v, cell);
                  }}
                  title={cellTitle?.(cell, pinnedRow.label, d)}
                  style={{
                    ...buildCellStyle({ color, grayed: false, width: cellW }),
                    borderTop: "2px solid var(--border-md)",
                  }}
                >
                  <div style={{ position: "relative", display: "inline-block", lineHeight: 1 }}>
                    {v < 0 ? <span style={{ opacity: 0.25 }}>—</span> : `${v}%`}
                  </div>
                </td>
              );
            })}

            {part !== "names" && pads.map((_, i) => (
              <td key={`unit-pad-${i}`} style={{
                width: cellW, minWidth: cellW, height: 34,
                border: "1px solid var(--border)",
                borderTop: "2px solid var(--border-md)",
                background: "var(--bg-card)",
              }} />
            ))}

            {part !== "names" && !isMobile && (() => {
              // The same statistic the rows use, over the unit's own values —
              // so the pinned column reads one way down the whole table.
              const stat = rowStat(pinnedRow.label, read, { [pinnedRow.label]: pinnedRow.data },
                                   dates, avgMode, null);
              const statColor = getSegmentColor(stat, segs);
              return (
                <td style={{
                  ...buildCellStyle({ color: statColor, grayed: false, width: AVG_W }),
                  ...stickyAvg,
                  zIndex:     4,
                  minWidth:   AVG_W,
                  background: statColor.noData ? "var(--bg-card)" : statColor.bg,
                  borderLeft: "2px solid var(--border-md)",
                  borderTop:  "2px solid var(--border-md)",
                  fontWeight: 700,
                  cursor:     "default",
                }}>
                  {stat !== null ? `${stat}%` : <span style={{ opacity: 0.25 }}>—</span>}
                </td>
              );
            })()}
          </tr>
        </tfoot>
      )}
    </table>
  );

  if (fit) return (
    <div
      ref={outerRef}
      // flex-start: each half keeps its own content height — stretched to a
      // fullscreen wrapper's fixed height, the days half turned into a
      // vertical scroller of its own and slid out of line with the names.
      style={{ display: "flex", alignItems: "flex-start", ...(fillFull ? { height: "100%", overflowY: "auto" } : null) }}
      data-grid=""
      data-sel={selection ? "" : undefined}
      onMouseOver={hover.onMouseOver}
      onMouseLeave={hover.onMouseLeave}
      onClick={() => clearSel()}
    >
      {renderTable("names")}
      {/* A phone's swipe comes to rest on a whole day. */}
      <div
        ref={scrollRef}
        style={{ flex: 1, minWidth: 0, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
      >
        {renderTable("data")}
      </div>
    </div>
  );

  return (
    <div
      ref={scrollRef}
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
      data-grid=""
      data-sel={selection ? "" : undefined}
      onMouseOver={hover.onMouseOver}
      onMouseLeave={hover.onMouseLeave}
      onClick={() => clearSel()}
    >
      {renderTable("all")}
    </div>
  );
});

// ─── Main export ──────────────────────────────────────────────────────────────

// Memoised, with every callback it hands the grid held stable: the grid is
// thousands of cells, and a page re-rendering for an unrelated reason (a popup
// opening, a toggle elsewhere) must not redraw it.
export default memo(function HeatmapChart({
  dates, managers, data,
  mode = "actual",
  managerIds = NO_IDS,
  segments = NO_SEGS,
  commentedCells = NO_SET,
  approvedCells = null,
  onCellClick = NOOP,
  // Hover text for a cell that HAS a value: (cell, rowName, date) → string.
  // The percentage alone rarely says enough — the attendance grid uses this to
  // spell out the counts behind it ("on the list 85 · came 70 · absent 15").
  // Pending cells keep their own blocked-reason title.
  cellTitle,
  fullscreen = false,
  // Row-identity column: what the rows ARE, and how much room their names need.
  // Defaults are the fleet page's (supervisors, whose names fit 172px); the
  // per-cell page passes "Yacheyka" and a wider column for «4311 · Участок …».
  rowLabel = "Brigadir",
  labelWidth = LABEL_W,
  // How a row KEY is spelled on screen: `(key, full, tl) => string` (`tl` is
  // the grid's own name transliterator, so a module-level speller stays a
  // stable reference for the memoised grid). Keys stay the
  // keys — `data`, sorting and the selection all go on using them — so this
  // only ever changes what the reader sees. It is called twice per row: once
  // for the CELL, which is clipped to `labelWidth`, and once with `full = true`
  // for the tooltip, so a caller that shortens a name (the per-cell загрузка
  // spells its rows «7213 · M. Sanjar») still has somewhere to put the full
  // spelling. Every other caller passes nothing and its rows read exactly as
  // they always did.
  labelFor = null,
  // The UNIT the rows roll up into, as a footer row: `{ label, note, data }`,
  // `data` keyed by date exactly like one row of `data`. It is measured from
  // the unit's own inputs, never averaged out of the rows above — which is why
  // it is a row of its own and carries a note saying what it is.
  pinnedRow = null,
  // WHICH NUMBER a cell shows: `(cell) => util | null`, as a fraction (0.87 →
  // 87%). Omitted, the grid reads the fleet heatmap's own `mode` switch —
  // baseline_util for "planned", net_util for "actual" — exactly as before, so
  // every existing caller is untouched. The two single-metric heatmaps under
  // the fleet heatmap on /zagruzka pass `fulfilUtil` / `effUtil` from
  // utils/formulas.js: the SAME grid, bands, pending markers, sort and
  // summaries, one different number. A prop and not a copy, so a change to the
  // grid reaches all three at once.
  //
  // NEVER name this `valueOf`. Every object inherits `Object.prototype.valueOf`,
  // and a destructuring default applies only to `undefined` — so a caller that
  // passes nothing would get the inherited method instead of null, and the
  // fleet heatmap (which passes nothing) would call it on each cell and crash.
  cellValue = null,
  // The page's data is still in flight: the grid keeps its real frame — the
  // gold header carrying `dates` (the period's own days, known before the
  // payload is), the sticky name and AVG columns — and draws `loadingRows`
  // pulsing rows where the coloured ones will land, so nothing jumps when
  // they do. `managers` / `data` are not read.
  loading = false,
  loadingRows = 6,
  // On a phone (below sm) the grid fits the SCREEN instead of the desktop's
  // calibrated 14-day width: no blank pad columns, the days stretch when they
  // all fit, and it opens scrolled to the LATEST day. Opt-in, so every other
  // page reads exactly as before; from sm up it changes nothing at all. The
  // bleed to the card's edges is the caller's — it owns the card's padding.
  phoneFit = false,
}) {
  const { labelColor } = useChartTheme();
  const { t } = useLang();
  const [selection, setSelection] = useState(null);
  const [avgMode,   setAvgMode]   = useState("avg"); // avg → max → min → avg
  const [pendingInfo, setPendingInfo] = useState(null); // { name, date, reason }

  const segs = segments.length ? segments : DEFAULT_SEGMENTS;

  const toggleSel = useCallback((type, value) => {
    setSelection(prev =>
      prev?.type === type && prev?.value === value ? null : { type, value }
    );
  }, []);
  const clearSel = useCallback(() => setSelection(null), []);
  const cycleAvg = useCallback(() => {
    setAvgMode(m => {
      const idx = AVG_CYCLE.indexOf(m);
      return AVG_CYCLE[(idx + 1) % AVG_CYCLE.length];
    });
  }, []);
  const onPendingClick = useCallback(
    (name, date, reason) => setPendingInfo({ name, date, reason }), []);

  const gridProps = {
    dates, managers, data, labelColor,
    onCellClick,
    onPendingClick,
    segs, selection, toggleSel, clearSel,
    managerIds, commentedCells, isoOf, approvedCells, fullscreen,
    avgMode, onCycleAvg: cycleAvg, cellTitle,
    rowLabel, labelWidth, labelFor, pinnedRow, cellValue,
    loading, loadingRows, phoneFit,
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
});
