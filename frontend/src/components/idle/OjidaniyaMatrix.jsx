// ── «Brigadir × kun» — the Ojidaniya register as a heatmap ───────────────────
// The workbook's «Kunlik» sheet, on the page it is exported from: one row per
// supervisor, one column per date of the period, each cell the waiting minutes
// that unit's day was counted for.
//
// It wears the ATTENDANCE heatmap's chrome — components/charts/HeatmapChart.jsx,
// the grid /workers and /zagruzka read — by the operator's call (2026-09-03):
// solid banded cells, a hover cross-hair, a sortable identity header, the
// right-pinned summary column and the 14-day width basis, so the two grids on
// this platform read as one instrument. It is a RESTYLE and deliberately not a
// merge: that component reads a 0–1 fraction, prints a percent and averages
// percentages, where this one carries unbounded MINUTES against a 50-minute
// flag behind three frozen identity columns. Serving both from one grid takes a
// value reader, a formatter, a second ramp and an extra-columns prop — a fork
// wearing a prop-shaped coat. The two must nevertheless stay in step: a change
// to the LOOK of one belongs in the other.
//
// The ramp is that grid's six hues INVERTED, because here low is good: 0 minutes
// is the best a day can go, so it reads darkest green, and the hue turns red at
// 50 — the threshold every surface on this page shares. A day nobody reported is
// «—» and never a zero: a unit that reported and waited nothing and a unit that
// filed nothing are different facts, and only one of them is an answer.
//
// Every figure arrives ALREADY NARROWED by the page: the tab half
// (тўхтаганда / тўхтамаганда), the загрузка scope and the doughnut's category
// picks are the page's own state, and a second derivation of them here is how
// this table would start contradicting the bars it sits under.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../../context/LangContext";
import useIsMobile from "../../hooks/useIsMobile";

// The flag every surface on this page shares — the workbook's THRESHOLD.
export const IDLE_THRESHOLD = 50;

const MIN_DAY_W = 52;
const STAT_W = 66;

const Z_ID = 4, Z_STAT = 5, Z_ID_HEAD = 6, Z_STAT_HEAD = 7;

// The table is calibrated so exactly this many day-columns fill the card. Column
// width therefore depends on the card and never on how long a period is picked,
// so a cell does not resize under the reader when they widen the range — the
// attendance grid's own rule. Shorter periods keep the width with blank
// placeholder columns (headerless, so they are never mistaken for a date), and
// longer ones scroll.
const BASIS_DAYS = 14;

// The attendance grid's six hues, inverted: darkest = best. 50 is where the hue
// turns, because 50 is where the day becomes a flag.
const IDLE_SEGMENTS = [
  { from: 0,   color: "#15803d" }, // nothing waited → darkest green
  { from: 1,   color: "#22c55e" }, // under a quarter-hour
  { from: 15,  color: "#84cc16" }, // 15–29 → lime
  { from: 30,  color: "#eab308" }, // 30–49 → yellow, approaching the flag
  { from: 50,  color: "#ef4444" }, // over the threshold → red
  { from: 100, color: "#b91c1c" }, // 100+ → deep red
];

// "#,##0.#" in the workbook — a decimal only when there is one.
const fmtMin = (v) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

/** Pick black or white text so it stays legible on any solid band. */
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.52 ? "#111827" : "#ffffff";
}

function band(v) {
  if (v == null) return null;
  let hit = IDLE_SEGMENTS[0];
  for (const seg of IDLE_SEGMENTS) {
    if (v >= seg.from) hit = seg;
    else break;
  }
  return { bg: hit.color, fg: contrastText(hit.color) };
}

// The pinned column, in the order the header cycles through it. The two averages
// answer different questions and the header says which is on screen: over the
// days this unit REPORTED, or over every day of the period. MAX and MIN stay on
// reported days — a minimum over every day reads 0 for anyone with one gap.
const STAT_CYCLE = ["avg", "avgAll", "max", "min"];
const STAT_LABEL = {
  avg:    ["downtime.mx.statAvg", "downtime.mx.subReported"],
  avgAll: ["downtime.mx.statAvg", "downtime.mx.subAll"],
  max:    ["downtime.mx.statMax", "downtime.mx.subDay"],
  min:    ["downtime.mx.statMin", "downtime.mx.subDay"],
};
const STAT_TIP = {
  avg: "downtime.mx.tipAvg", avgAll: "downtime.mx.tipAvgAll",
  max: "downtime.mx.tipMax", min: "downtime.mx.tipMin",
};

function rowStat(byDate, dates, mode) {
  const vals = [];
  dates.forEach((d) => { const v = byDate?.[d]; if (v != null) vals.push(v); });
  if (!vals.length) return null;
  if (mode === "max") return Math.max(...vals);
  if (mode === "min") return Math.min(...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  return mode === "avgAll" ? sum / dates.length : sum / vals.length;
}

function cellStyle({ fill, width, rowHovered, colHovered, cellHovered }) {
  let filter = "none", transform = "none", boxShadow = "none", zIndex = "auto";
  if (fill) {
    if (cellHovered) {
      filter = "brightness(1.25)";
      transform = "scale(1.06)";
      boxShadow = "0 4px 12px rgba(0,0,0,.25)";
      zIndex = 3;
    } else if (rowHovered || colHovered) {
      filter = "brightness(1.12)";
    }
  }
  return {
    background: fill ? fill.bg : "transparent",
    color: fill ? fill.fg : "var(--text-4)",
    textAlign: "center",
    fontSize: 11,
    fontWeight: fill ? 700 : 400,
    height: 34,
    padding: 0,
    border: "1px solid var(--border)",
    letterSpacing: "-0.2px",
    verticalAlign: "middle",
    transition: "filter .08s, transform .07s, box-shadow .07s",
    position: "relative",
    width, minWidth: width,
    filter, transform, boxShadow, zIndex,
  };
}

/**
 * @param {string[]} dates  every calendar day of the period, "DD.MM.YYYY",
 *                          ascending — including the ones nobody reported on,
 *                          which are exactly the «—» cells this table shows.
 * @param {object[]} rows   [{ key, managerId, name, shift, total, flagged,
 *                             byDate: { "DD.MM.YYYY": minutes } }] in the bar
 *                          chart's own order, which the identity header can
 *                          return to after sorting by name
 * @param {object}   fleet  { byDate, total } — the whole fleet's day, as a row
 * @param {function} onPick (row, date|null) → the unit's detail modal. A press
 *                          on a CELL names the date it landed on; a press on the
 *                          identity columns names none, i.e. the whole period.
 */
export default function OjidaniyaMatrix({ dates = [], rows = [], fleet, onPick }) {
  const { t } = useLang();
  const isMobile = useIsMobile(); // phones: the pinned summary column is dropped

  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(el.clientWidth);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ↑ by default, as on /workers. A third press returns the rows to the order
  // they arrived in — the bar chart's — so the two cards can be read together.
  const [nameAsc, setNameAsc] = useState(true);
  const [stat, setStat] = useState("avg");
  const [hoverRow, setHoverRow] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);

  const shown = useMemo(() => (
    nameAsc === null
      ? rows
      : [...rows].sort((a, b) => (nameAsc
          ? (a.name || "").localeCompare(b.name || "")
          : (b.name || "").localeCompare(a.name || "")))
  ), [rows, nameAsc]);

  // Three frozen identity columns (name · shift · total) — the sheet's own
  // freeze pane. On a phone they shrink rather than disappear: a row whose
  // total has scrolled off screen is a row that says nothing.
  const narrow = boxW > 0 && boxW < 560;
  const NAME_W = narrow ? 108 : 176;
  const SHIFT_W = narrow ? 34 : 52;
  const TOT_W = narrow ? 54 : 74;
  const frozen = NAME_W + SHIFT_W + TOT_W;
  const statW = isMobile ? 0 : STAT_W;

  const dayW = boxW > 0
    ? Math.max(MIN_DAY_W, Math.floor((boxW - frozen - statW) / BASIS_DAYS))
    : MIN_DAY_W;
  const padCount = Math.max(0, BASIS_DAYS - dates.length);
  const effDays = Math.max(BASIS_DAYS, dates.length);
  const tableW = frozen + effDays * dayW + statW;
  const scroll = boxW > 0 && tableW > boxW;
  const pads = Array.from({ length: padCount });

  // Newest days are what a reader opens on — land on the right edge.
  useEffect(() => {
    const el = boxRef.current;
    if (el && scroll) el.scrollLeft = el.scrollWidth;
  }, [scroll, dates.length, dayW]);

  const minLabel = t("general.min");
  const th = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
    color: "#fff", background: "var(--brand)", padding: "7px 4px",
    whiteSpace: "nowrap", border: "1px solid var(--border)", textAlign: "center",
  };
  // One z-index ladder for the whole grid. A hovered day cell lifts to 3 (it
  // scales, so it must clear its neighbours), and every FROZEN cell has to stay
  // above that or a hover would paint over the name column the reader is
  // scrolling against: identity 4, the pinned summary 5, their headers 6 and 7.
  const stick = (left, zIndex = Z_ID) => ({ position: "sticky", left, zIndex });
  const stickStat = (zIndex = Z_STAT) => ({
    position: "sticky", right: 0, zIndex,
    boxShadow: "-6px 0 8px -6px rgba(0,0,0,0.25)",
    borderLeft: "2px solid var(--border-md)",
  });
  // A frozen body cell scrolls OVER the day columns, so it needs an opaque base;
  // the fleet row's brand tint is layered on top of one as an image.
  const solid = { backgroundColor: "var(--bg-card)" };
  const brand = { ...solid, backgroundImage: "linear-gradient(var(--brand-bg), var(--brand-bg))" };
  const edge = { borderRight: "2px solid var(--border-md)" };
  const idCell = {
    height: 34, textAlign: "center", fontSize: 11, fontWeight: 600,
    letterSpacing: "-0.2px", border: "1px solid var(--border)",
  };
  const padCell = {
    width: dayW, minWidth: dayW, height: 34,
    border: "1px solid var(--border)", background: "var(--bg-card)",
  };
  const clearHover = () => { setHoverRow(null); setHoverCol(null); setHoverCell(null); };

  const [statKey, statSub] = STAT_LABEL[stat];

  return (
    <div
      ref={boxRef}
      className="idle-matrix overflow-x-auto pb-1"
      onMouseLeave={clearHover}
    >
      <table
        style={{
          borderCollapse: "collapse", borderSpacing: 0, tableLayout: "fixed",
          width: scroll ? tableW : "100%",
        }}
      >
        <colgroup>
          <col style={{ width: NAME_W }} />
          <col style={{ width: SHIFT_W }} />
          <col style={{ width: TOT_W }} />
          {dates.map((d) => <col key={d} style={scroll ? { width: dayW } : undefined} />)}
          {pads.map((_, i) => <col key={`pc-${i}`} style={scroll ? { width: dayW } : undefined} />)}
          {!isMobile && <col style={{ width: STAT_W }} />}
        </colgroup>
        <thead>
          <tr>
            <th
              onClick={() => setNameAsc((p) => (p === null ? true : p ? false : null))}
              title={t("downtime.mx.sortHint")}
              style={{
                ...th, ...stick(0, Z_ID_HEAD), textAlign: "left", paddingLeft: 10,
                cursor: "pointer", userSelect: "none",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {t("downtime.name")}
                {nameAsc === null
                  ? <span style={{ opacity: .4, fontSize: 9 }}>⇅</span>
                  : <span style={{ fontSize: 9 }}>{nameAsc ? "↑" : "↓"}</span>}
              </span>
            </th>
            <th style={{ ...th, ...stick(NAME_W, Z_ID_HEAD) }}>{t("downtime.colShift")}</th>
            <th style={{ ...th, ...stick(NAME_W + SHIFT_W, Z_ID_HEAD), ...edge }}>
              {t("downtime.xl.fleetTotal")}
            </th>
            {dates.map((d) => (
              <th
                key={d}
                title={d}
                style={{
                  ...th,
                  // The header is the other half of the cross-hair: without it a
                  // reader tracing a column upward loses which date they are on.
                  boxShadow: hoverCol === d ? "inset 0 -3px 0 #fff" : undefined,
                }}
              >
                {d.slice(0, 5)}
              </th>
            ))}
            {/* Headerless placeholders — they hold the BASIS_DAYS width and name
                no date, so they cannot be read as a day nobody reported on. */}
            {pads.map((_, i) => <th key={`ph-${i}`} style={th} />)}
            {!isMobile && (
              <th
                onClick={() => setStat((m) => STAT_CYCLE[(STAT_CYCLE.indexOf(m) + 1) % STAT_CYCLE.length])}
                title={t(STAT_TIP[stat])}
                style={{ ...th, ...stickStat(Z_STAT_HEAD), cursor: "pointer", userSelect: "none", lineHeight: 1.15 }}
              >
                <span style={{ display: "block" }}>
                  {t(statKey)}
                  <span style={{ fontSize: 8, opacity: .55, marginLeft: 2 }}>↕</span>
                </span>
                <span style={{
                  display: "block", fontSize: 8, fontWeight: 600, opacity: .75,
                  letterSpacing: 0, textTransform: "none",
                }}>
                  {t(statSub)}
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const press = onPick && r.managerId ? (d) => onPick(r, d) : null;
            const rowH = hoverRow === r.key;
            const sv = rowStat(r.byDate, dates, stat);
            const sfill = band(sv);
            // The identity columns carry the row hover inline like the day cells
            // do, so the whole row lights up wherever the pointer entered it.
            const idHover = rowH ? { filter: "brightness(1.14)" } : null;
            return (
              <tr
                key={r.key}
                onMouseEnter={() => setHoverRow(r.key)}
                onMouseLeave={() => setHoverRow(null)}
              >
                <td
                  onClick={press ? () => press(null) : undefined}
                  title={press ? `${r.name} — ${t("downtime.matrixOpen")}` : r.name}
                  style={{
                    ...idCell, ...stick(0), ...solid,
                    textAlign: "left", padding: "0 10px", fontSize: 12,
                    color: "var(--text-2)", cursor: press ? "pointer" : undefined, ...idHover,
                  }}
                >
                  <span className="block truncate" style={{ maxWidth: NAME_W - 20 }}>{r.name}</span>
                </td>
                <td
                  onClick={press ? () => press(null) : undefined}
                  style={{
                    ...idCell, ...stick(NAME_W), ...solid, fontSize: 10,
                    color: "var(--text-3)", cursor: press ? "pointer" : undefined, ...idHover,
                  }}
                >
                  {r.shift ? `S${r.shift}` : "—"}
                </td>
                {/* The 50-min flag is a fact about the unit's WHOLE day — as on
                    the bars and in the workbook — never re-derived from a cell
                    the doughnut's picks have narrowed. The period total is on a
                    different scale from a day cell, so it is never banded: one
                    ramp over both would paint every unit's total red. */}
                <td
                  onClick={press ? () => press(null) : undefined}
                  style={{
                    ...idCell, ...stick(NAME_W + SHIFT_W), ...solid, ...edge,
                    fontWeight: 700, color: r.flagged ? "#ef4444" : "var(--text-1)",
                    cursor: press ? "pointer" : undefined, ...idHover,
                  }}
                >
                  {fmtMin(r.total)}
                </td>
                {dates.map((d) => {
                  const v = r.byDate?.[d];
                  const fill = band(v);
                  return (
                    <td
                      key={d}
                      onMouseEnter={() => { setHoverCol(d); setHoverCell(`${r.key}|${d}`); }}
                      onMouseLeave={() => { setHoverCol(null); setHoverCell(null); }}
                      onClick={press ? () => press(d) : undefined}
                      title={v == null
                        ? `${r.name} · ${d} — ${t("downtime.mx.noReport")}`
                        : `${r.name} · ${d} — ${fmtMin(v)} ${minLabel}`}
                      style={{
                        ...cellStyle({
                          fill, width: dayW,
                          rowHovered: rowH, colHovered: hoverCol === d,
                          cellHovered: hoverCell === `${r.key}|${d}`,
                        }),
                        cursor: press ? "pointer" : "default",
                      }}
                    >
                      {v == null ? <span style={{ opacity: .25 }}>—</span> : fmtMin(v)}
                    </td>
                  );
                })}
                {pads.map((_, i) => <td key={`p-${r.key}-${i}`} style={padCell} />)}
                {!isMobile && (
                  <td
                    title={t(STAT_TIP[stat])}
                    style={{
                      ...cellStyle({ fill: sfill, width: STAT_W }),
                      ...stickStat(),
                      background: sfill ? sfill.bg : "var(--bg-card)",
                    }}
                  >
                    {sv == null ? <span style={{ opacity: .25 }}>—</span> : fmtMin(sv)}
                  </td>
                )}
              </tr>
            );
          })}
          {/* The fleet's own day — the row the trend below is drawn from. Its
              cells sum every unit, so they are on a different scale from a
              brigadir's day and carry no band for the same reason JAMI does not. */}
          <tr>
            <td
              colSpan={2}
              style={{
                ...idCell, ...stick(0), ...brand,
                textAlign: "left", padding: "0 10px", fontSize: 12, fontWeight: 700,
                color: "var(--text-1)", borderTop: "2px solid var(--brand)",
              }}
            >
              {t("downtime.xl.fleetTotal")}
            </td>
            <td
              style={{
                ...idCell, ...stick(NAME_W + SHIFT_W), ...brand, ...edge,
                fontWeight: 700, color: "var(--text-1)", borderTop: "2px solid var(--brand)",
              }}
            >
              {fmtMin(fleet?.total || 0)}
            </td>
            {dates.map((d) => {
              const v = fleet?.byDate?.[d];
              return (
                <td
                  key={d}
                  title={v == null ? undefined : `${d} — ${fmtMin(v)} ${minLabel}`}
                  style={{
                    ...idCell, ...brand, borderTop: "2px solid var(--brand)",
                    fontWeight: 700, color: v ? "var(--text-1)" : "var(--text-4)",
                  }}
                >
                  {v == null ? "" : fmtMin(v)}
                </td>
              );
            })}
            {pads.map((_, i) => (
              <td key={`fp-${i}`} style={{ ...padCell, borderTop: "2px solid var(--brand)" }} />
            ))}
            {!isMobile && (() => {
              const v = rowStat(fleet?.byDate, dates, stat);
              return (
                <td
                  title={t(STAT_TIP[stat])}
                  style={{
                    ...idCell, ...brand, ...stickStat(),
                    borderTop: "2px solid var(--brand)",
                    fontWeight: 700, color: "var(--text-1)",
                  }}
                >
                  {v == null ? "" : fmtMin(v)}
                </td>
              );
            })()}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
