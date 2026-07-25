// ── Seasonality heatmap — THE template for "share of a period" matrices ──────
// A native grid (not ApexCharts) styled after the fleet HeatmapChart: brand-gold
// sticky header, solid gold-ramp cells with auto-contrast labels, collapsed 1px
// borders and a sticky row-name column. Held to `cols` data columns: scroll past
// that many, blank-pad under it, so the card never resizes between modes.
//
// Shared by the Quality «Мавсумийлик» card (rows = complaint types) and the
// Ojidaniya one (rows = waiting categories). Values are percentages already —
// the caller divides by its own column denominator.

// Brand-gold ramp for a row's share of a column. The low buckets are tight
// because most cells sit under 20%; coarse buckets flatten the whole matrix into
// one shade of gold and hide the seasonality. Ordered high→low for a first-match
// lookup. (A value-intensity ramp is one of the few places gold is allowed.)
const SEASON_RAMP = [
  { from: 35,     color: "#7d5c21" },
  { from: 25,     color: "#a87c2f" },
  { from: 18,     color: "#C8973F" },
  { from: 12,     color: "#d3ac60" },
  { from: 7,      color: "#e0c48c" },
  { from: 3,      color: "#eddcb9" },
  { from: 0.0001, color: "#f6ecd9" },
];
export const seasonColor = (v) => {
  for (const s of SEASON_RAMP) if (v >= s.from) return s.color;
  return null; // 0% / no share → neutral cell, no fill
};

// Black or white label so the % stays legible across the whole light→dark ramp
// (WCAG perceived-luminance split) — the fleet heatmap's contrast trick, which
// beats forcing one text colour on every cell.
const contrastText = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#3d2c10" : "#ffffff";
};

/**
 * @param {string[]}  labels     column labels (months / week ranges)
 * @param {number[]}  colTotals  per-column denominator; 0 ⇒ the column has no
 *                               data at all (dimmed head, blank cells)
 * @param {object[]}  rows       [{ key, label, title?, data: number[] (percent) }]
 * @param {string}    firstColLabel  header of the sticky name column
 */
export default function SeasonalityHeatmap({
  labels, colTotals, rows, firstColLabel,
  cols = 12, colWidth = 96, firstColWidth = 134, scrollRef,
}) {
  const real = labels.length;
  const scroll = real > cols;
  const pad = scroll ? 0 : Math.max(0, cols - real);
  const totalCols = scroll ? real : cols;

  const th = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
    color: "#fff", background: "var(--brand)", padding: "7px 4px",
    whiteSpace: "nowrap", border: "1px solid var(--border)",
  };
  const blankHead = { ...th, background: "var(--bg-inner)", borderColor: "var(--border)" };

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-1">
      <table
        className="season-heat"
        style={{
          borderCollapse: "collapse",
          width: scroll ? firstColWidth + real * colWidth : "100%",
          // Under the column budget the grid stretches to the card, but never
          // squeezes a column below 52px — narrower and the % labels collide.
          minWidth: scroll ? undefined : firstColWidth + cols * 52,
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: firstColWidth }} />
          {Array.from({ length: totalCols }).map((_, i) => (
            <col key={i} style={scroll ? { width: colWidth } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, position: "sticky", left: 0, zIndex: 2, textAlign: "left", paddingLeft: 12 }}>
              {firstColLabel}
            </th>
            {labels.map((lb, m) => (
              <th key={m} style={{ ...th, textAlign: "center", opacity: colTotals[m] ? 1 : 0.5 }}>{lb}</th>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <th key={`p${i}`} style={blankHead} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td
                title={row.title || (typeof row.label === "string" ? row.label : undefined)}
                style={{
                  position: "sticky", left: 0, zIndex: 1,
                  background: "var(--bg-card)",
                  borderRight: "2px solid var(--border-md)",
                  borderBottom: "1px solid var(--border)",
                  padding: "0 10px", height: 40, whiteSpace: "nowrap",
                  fontSize: 12, fontWeight: 600, color: "var(--text-2)",
                }}
              >
                <span className="block truncate" style={{ maxWidth: firstColWidth - 20 }}>{row.label}</span>
              </td>
              {row.data.map((v, m) => {
                const noData = colTotals[m] === 0;
                const bg = noData ? null : seasonColor(v);
                return (
                  <td
                    key={m}
                    title={noData ? undefined : `${row.title || row.label} · ${labels[m]} — ${v}%`}
                    style={{
                      height: 40, textAlign: "center",
                      fontSize: 11, fontWeight: 700, letterSpacing: "-0.2px",
                      border: "1px solid var(--border)",
                      background: bg || "var(--bg-inner)",
                      color: bg ? contrastText(bg) : "var(--text-4)",
                    }}
                  >
                    {noData || !bg ? "" : v >= 1 ? `${Math.round(v)}%` : "<1%"}
                  </td>
                );
              })}
              {Array.from({ length: pad }).map((_, i) => (
                <td key={`p${i}`} style={{ height: 40, border: "1px solid var(--border)", background: "var(--bg-inner)" }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
