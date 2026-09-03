// ── «Brigadir × kun» — the Ojidaniya register as a matrix ────────────────────
// The workbook's «Kunlik» sheet, on the page it is exported from: one row per
// supervisor, one column per date of the period, each cell the waiting minutes
// that unit's day was counted for. A BLANK cell is «no report» — deliberately
// not a zero, which is a unit that reported and waited nothing. The two are
// different facts and the legend under the title says so.
//
// Deliberately NOT the SeasonalityHeatmap grid next door. That one answers
// «what SHARE of this column is this row», in percent, on the gold intensity
// ramp; this one carries absolute MINUTES against the 50-minute threshold,
// which is a STATUS and therefore traffic-light (gold is never a status here).
// Serving both from one grid would take a value formatter, a second ramp,
// three leading identity columns and a footer row — a fork wearing a
// prop-shaped coat.
//
// Every figure arrives ALREADY NARROWED by the page: the tab half
// (тўхтаганда / тўхтамаганда), the загрузка scope and the doughnut's category
// picks are the page's own state, and a second derivation of them here is how
// this table would start contradicting the bars it sits under.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../../context/LangContext";

// The flag every surface on this page shares — the workbook's THRESHOLD.
export const IDLE_THRESHOLD = 50;

const MIN_DAY_W = 52;

// "#,##0.#" in the workbook — a decimal only when there is one.
const fmtMin = (v) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

// The sheet's three-stop colour scale, read as a status ramp: under the
// threshold nothing is an alarm, so the tint only deepens in amber; over it the
// HUE changes, because 50 minutes is where the day becomes a flag. Translucent
// over the card, so one ramp serves both themes.
const tint = (v, max) => {
  if (v == null || v <= 0) return null;
  if (v > IDLE_THRESHOLD) {
    const span = Math.max(max - IDLE_THRESHOLD, 1);
    const a = 0.16 + 0.28 * Math.min(1, (v - IDLE_THRESHOLD) / span);
    return `rgba(239,68,68,${a.toFixed(3)})`;
  }
  return `rgba(234,179,8,${(0.22 * (v / IDLE_THRESHOLD)).toFixed(3)})`;
};

/**
 * @param {string[]} dates  every calendar day of the period, "DD.MM.YYYY",
 *                          ascending — including the ones nobody reported on,
 *                          which are exactly the blanks this table shows.
 * @param {object[]} rows   [{ key, managerId, name, shift, total, flagged,
 *                             byDate: { "DD.MM.YYYY": minutes } }] in the bar
 *                          chart's own order, so the two read top-to-bottom alike
 * @param {object}   fleet  { byDate, total } — the whole fleet's day, as a row
 * @param {function} onPick row press → the unit's detail modal (optional)
 */
export default function OjidaniyaMatrix({ dates = [], rows = [], fleet, onPick }) {
  const { t } = useLang();

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

  // Three frozen identity columns (name · shift · total) — the sheet's own
  // freeze pane. On a phone they shrink rather than disappear: a row whose
  // total has scrolled off screen is a row that says nothing.
  const narrow = boxW > 0 && boxW < 560;
  const NAME_W = narrow ? 108 : 176;
  const SHIFT_W = narrow ? 34 : 52;
  const TOT_W = narrow ? 54 : 74;
  const frozen = NAME_W + SHIFT_W + TOT_W;

  // Days stretch to fill the card while they fit; past that they hold
  // MIN_DAY_W and the grid scrolls. Never PADDED with blank columns, unlike the
  // seasonality grid — here a blank column is a date nobody reported on, so an
  // invented one is an invented silence.
  const avail = Math.max(0, boxW - frozen);
  const fitW = dates.length ? Math.max(MIN_DAY_W, Math.floor(avail / dates.length)) : MIN_DAY_W;
  const scroll = boxW > 0 && dates.length * fitW > avail;

  // Newest days are what a reader opens on — land on the right edge.
  useEffect(() => {
    const el = boxRef.current;
    if (el && scroll) el.scrollLeft = el.scrollWidth;
  }, [scroll, dates.length, fitW]);

  const max = useMemo(() => {
    let m = 0;
    rows.forEach((r) => Object.values(r.byDate || {}).forEach((v) => { if (v > m) m = v; }));
    return m;
  }, [rows]);

  const minLabel = t("general.min");
  const th = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
    color: "#fff", background: "var(--brand)", padding: "7px 4px",
    whiteSpace: "nowrap", border: "1px solid var(--border)", textAlign: "center",
  };
  const stick = (left, zIndex) => ({ position: "sticky", left, zIndex });
  // A frozen body cell scrolls OVER the day columns, so it needs an opaque base;
  // the fleet row's brand tint is layered on top of one as an image.
  const solid = { backgroundColor: "var(--bg-card)" };
  const brand = { ...solid, backgroundImage: "linear-gradient(var(--brand-bg), var(--brand-bg))" };
  const edge = { borderRight: "2px solid var(--border-md)" };
  const cell = {
    height: 34, textAlign: "center", fontSize: 11, fontWeight: 600,
    letterSpacing: "-0.2px", border: "1px solid var(--border)",
  };

  return (
    <div ref={boxRef} className="idle-matrix overflow-x-auto pb-1">
      <table
        style={{
          borderCollapse: "collapse", tableLayout: "fixed",
          width: scroll ? frozen + dates.length * fitW : "100%",
        }}
      >
        <colgroup>
          <col style={{ width: NAME_W }} />
          <col style={{ width: SHIFT_W }} />
          <col style={{ width: TOT_W }} />
          {dates.map((d) => <col key={d} style={scroll ? { width: fitW } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, ...stick(0, 3), textAlign: "left", paddingLeft: 10 }}>
              {t("downtime.name")}
            </th>
            <th style={{ ...th, ...stick(NAME_W, 3) }}>{t("downtime.colShift")}</th>
            <th style={{ ...th, ...stick(NAME_W + SHIFT_W, 3), ...edge }}>
              {t("downtime.xl.fleetTotal")}
            </th>
            {dates.map((d) => (
              <th key={d} style={th} title={d}>{d.slice(0, 5)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const press = onPick && r.managerId ? () => onPick(r) : null;
            return (
              <tr
                key={r.key}
                onClick={press || undefined}
                style={press ? { cursor: "pointer" } : undefined}
              >
                <td
                  title={press ? `${r.name} — ${t("downtime.matrixOpen")}` : r.name}
                  style={{
                    ...cell, ...stick(0, 1), ...solid,
                    textAlign: "left", padding: "0 10px", fontSize: 12, color: "var(--text-2)",
                  }}
                >
                  <span className="block truncate" style={{ maxWidth: NAME_W - 20 }}>{r.name}</span>
                </td>
                <td style={{ ...cell, ...stick(NAME_W, 1), ...solid, fontSize: 10, color: "var(--text-3)" }}>
                  {r.shift ? `S${r.shift}` : "—"}
                </td>
                {/* The 50-min flag is a fact about the unit's WHOLE day — as on
                    the bars and in the workbook — never re-derived from a cell
                    the doughnut's picks have narrowed. */}
                <td
                  style={{
                    ...cell, ...stick(NAME_W + SHIFT_W, 1), ...solid, ...edge,
                    fontWeight: 700, color: r.flagged ? "#ef4444" : "var(--text-1)",
                  }}
                >
                  {fmtMin(r.total)}
                </td>
                {dates.map((d) => {
                  const v = r.byDate?.[d];
                  const bg = tint(v, max);
                  const hot = v > IDLE_THRESHOLD;
                  return (
                    <td
                      key={d}
                      title={v == null ? undefined : `${r.name} · ${d} — ${fmtMin(v)} ${minLabel}`}
                      style={{
                        ...cell,
                        background: bg || "var(--bg-inner)",
                        fontWeight: hot ? 700 : 600,
                        color: hot ? "#ef4444" : v ? "var(--text-1)" : "var(--text-4)",
                      }}
                    >
                      {v == null ? "" : fmtMin(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* The fleet's own day — the row the trend below is drawn from. */}
          <tr>
            <td
              colSpan={2}
              style={{
                ...cell, ...stick(0, 1), ...brand,
                textAlign: "left", padding: "0 10px", fontSize: 12, fontWeight: 700,
                color: "var(--text-1)", borderTop: "2px solid var(--brand)",
              }}
            >
              {t("downtime.xl.fleetTotal")}
            </td>
            <td
              style={{
                ...cell, ...stick(NAME_W + SHIFT_W, 1), ...brand, ...edge,
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
                    ...cell, ...brand, borderTop: "2px solid var(--brand)",
                    fontWeight: 700, color: v ? "var(--text-1)" : "var(--text-4)",
                  }}
                >
                  {v == null ? "" : fmtMin(v)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
