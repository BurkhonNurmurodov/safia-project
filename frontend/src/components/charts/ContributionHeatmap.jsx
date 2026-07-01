import { useMemo, useState } from "react";

// GitHub-style contribution calendar. Renders one small square per calendar day,
// laid out in week-columns (Sunday at top) with month labels along the top and
// a few weekday labels down the left. Colour intensity scales with the day's
// value relative to the busiest day in the series.
//
// Props:
//   series      [{ day:'YYYY-MM-DD', minutes, count }]  — daily values
//   valueKey    which numeric field drives the colour (default 'minutes')
//   accent      base brand hex for the filled scale (default gold)
//   label       metric name shown in the tooltip (e.g. "min")
//   formatValue (v) => string for the tooltip value
//   onDayClick  optional (dayObj) => void

const CELL = 12;   // square size (px)
const GAP = 3;     // gap between squares
const STEP = CELL + GAP;
const LABEL_W = 30; // left weekday-label gutter
const MONTH_H = 16; // top month-label band

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""]; // sparse, GitHub-style

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Mix a hex toward white by amount 0..1 → lighter shade for the low levels.
const lighten = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  const ch = (c) => Math.round(c + (255 - c) * amt);
  return `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`;
};

const iso = (d) => d.toISOString().slice(0, 10);

export default function ContributionHeatmap({
  series = [],
  valueKey = "minutes",
  accent = "#C8973F",
  label = "",
  formatValue,
  onDayClick,
}) {
  const [hover, setHover] = useState(null); // { col, row, day, value, count }

  const { columns, monthLabels, maxVal, totalActive } = useMemo(() => {
    const byDay = new Map();
    let maxVal = 0;
    let totalActive = 0;
    for (const d of series) {
      byDay.set(d.day, d);
      const v = d[valueKey] || 0;
      if (v > maxVal) maxVal = v;
      if (v > 0) totalActive++;
    }

    if (!series.length) return { columns: [], monthLabels: [], maxVal: 0, totalActive: 0 };

    // Align the grid to whole weeks: start on the Sunday on/before the first day.
    const first = new Date(series[0].day + "T00:00:00Z");
    const last = new Date(series[series.length - 1].day + "T00:00:00Z");
    const gridStart = new Date(first);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay()); // back to Sunday

    const columns = [];
    const monthLabels = [];
    let prevMonth = -1;
    let cursor = new Date(gridStart);
    let col = 0;
    while (cursor <= last) {
      const cells = [];
      for (let row = 0; row < 7; row++) {
        const key = iso(cursor);
        const rec = byDay.get(key);
        const inRange = cursor >= first && cursor <= last;
        cells.push({
          day: key,
          date: new Date(cursor),
          inRange,
          value: rec ? (rec[valueKey] || 0) : 0,
          count: rec ? (rec.count || 0) : 0,
        });
        // Month label anchored to the row-0 cell that opens a new month.
        if (row === 0) {
          const m = cursor.getUTCMonth();
          if (m !== prevMonth) {
            monthLabels.push({ col, label: MONTHS[m] });
            prevMonth = m;
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      columns.push({ col, cells });
      col++;
    }
    return { columns, monthLabels, maxVal, totalActive };
  }, [series, valueKey]);

  // value → one of 5 levels (0 empty + 4 shades)
  const levelColor = (value, inRange) => {
    if (!inRange) return "transparent";
    if (value <= 0) return "var(--bg-inner)";
    const ratio = maxVal > 0 ? value / maxVal : 0;
    const level = ratio > 0.66 ? 4 : ratio > 0.33 ? 3 : ratio > 0.1 ? 2 : 1;
    const shades = { 1: lighten(accent, 0.62), 2: lighten(accent, 0.4), 3: lighten(accent, 0.18), 4: accent };
    return shades[level];
  };

  const fmt = formatValue || ((v) => `${v} ${label}`.trim());
  const width = LABEL_W + columns.length * STEP;
  const height = MONTH_H + 7 * STEP;

  if (!columns.length) {
    return <div className="text-xs py-8 text-center" style={{ color: "var(--text-4)" }}>—</div>;
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
      <div style={{ position: "relative", width, minWidth: width }}>
        {/* Month labels */}
        <div style={{ position: "relative", height: MONTH_H, marginLeft: LABEL_W }}>
          {monthLabels.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              style={{
                position: "absolute", left: m.col * STEP, top: 0,
                fontSize: 10, color: "var(--text-4)", whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </span>
          ))}
        </div>

        <div style={{ display: "flex" }}>
          {/* Weekday labels */}
          <div style={{ width: LABEL_W, position: "relative", flexShrink: 0 }}>
            {WEEKDAYS.map((w, row) => (
              w ? (
                <span
                  key={row}
                  style={{
                    position: "absolute", top: row * STEP - 1, right: 6,
                    fontSize: 9, lineHeight: `${CELL}px`, color: "var(--text-4)",
                  }}
                >
                  {w}
                </span>
              ) : null
            ))}
          </div>

          {/* Week columns */}
          <div style={{ display: "flex", gap: GAP }}>
            {columns.map((c) => (
              <div key={c.col} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {c.cells.map((cell, row) => (
                  <div
                    key={cell.day}
                    onMouseEnter={() => cell.inRange && setHover({ col: c.col, row, ...cell })}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => cell.inRange && onDayClick?.(cell)}
                    style={{
                      width: CELL, height: CELL, borderRadius: 2,
                      background: levelColor(cell.value, cell.inRange),
                      border: cell.inRange ? "1px solid var(--border)" : "none",
                      cursor: cell.inRange && onDayClick ? "pointer" : "default",
                      outline: hover?.col === c.col && hover?.row === row ? "1px solid var(--brand-text)" : "none",
                      transition: "outline .08s",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {hover && (
          <div
            style={{
              position: "absolute",
              left: Math.min(LABEL_W + hover.col * STEP + CELL / 2, width - 120),
              top: MONTH_H + hover.row * STEP + CELL + 6,
              transform: "translateX(-50%)",
              zIndex: 20, pointerEvents: "none",
              background: "rgba(18,21,31,0.94)", color: "#f5f6f8",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
              padding: "6px 9px", fontSize: 11, whiteSpace: "nowrap",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {hover.value > 0 ? fmt(hover.value) : "No activity"}
            </div>
            <div style={{ opacity: 0.7, fontSize: 10, marginTop: 1 }}>
              {hover.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, marginLeft: LABEL_W }}>
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>{totalActive} active days</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>Less</span>
          {["var(--bg-inner)", lighten(accent, 0.62), lighten(accent, 0.4), lighten(accent, 0.18), accent].map((c, i) => (
            <span key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: c, border: "1px solid var(--border)" }} />
          ))}
          <span style={{ fontSize: 10, color: "var(--text-4)" }}>More</span>
        </div>
      </div>
    </div>
  );
}
