import { useRef, useState, useEffect } from "react";
import { useChartTheme } from "../../hooks/useChartTheme";

// Planned-vs-Actual workload, one group of bars per supervisor.
//   group mode → two bars (planned, actual) side by side, growing from the floor
//   diff  mode → the two bars slide to the centre and merge into a single signed
//                bar = Planned − Actual, diverging from a zero line: positive
//                diffs rise above it, negative diffs hang below.
// The container height is fixed, so toggling only animates the bars themselves
// (CSS transitions) — the chart box keeps its size and position exactly.

const PLANNED_COLOR = "#3b82f6";
const ACTUAL_COLOR  = "#22c55e";

// Pick the threshold colour for a value — same rule as the fleet heatmap and
// the comparison table: the highest segment whose `from` ≤ v (segments sorted
// ascending by `from`). Falls back to a solid colour until config has loaded.
function colorFor(v, segs, fallback) {
  if (!segs?.length) return fallback;
  let result = segs[0];
  for (const seg of segs) {
    if (v >= seg.from) result = seg;
    else break;
  }
  return result.color;
}

const T = [
  "x .45s cubic-bezier(.4,0,.2,1)",
  "width .45s cubic-bezier(.4,0,.2,1)",
  "y .45s cubic-bezier(.4,0,.2,1)",
  "height .45s cubic-bezier(.4,0,.2,1)",
  "opacity .35s ease",
  "fill .35s ease",
].join(", ");

// "Hakimov Ruslan" → "H. Ruslan". Falls back to ellipsis truncation when the
// name is a single word.
function shortName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0]) {
    return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
  }
  return name.length > 13 ? name.slice(0, 12) + "…" : name;
}

export default function LoadBarChart({
  names, planned, actual,
  diffMode = false,
  height = 300,
  plannedLabel = "Planned",
  actualLabel = "Actual",
  // Live admin-config colour thresholds. plannedSegments → P bars (fleet-heatmap
  // logic); diffSegments → A bars, keyed on D = P − A (comparison-table logic).
  plannedSegments = [],
  diffSegments = [],
}) {
  const { labelColor, gridColor } = useChartTheme();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const n = names.length;
  const PAD_TOP = 22, PAD_BOTTOM = 52, PAD_X = 8;
  const MIN_GROUP = 60;

  const innerW = Math.max(width - PAD_X * 2, 60);
  const groupW = Math.max(innerW / Math.max(n, 1), MIN_GROUP);
  const svgW   = Math.max(width, PAD_X * 2 + groupW * n);
  const plotH  = height - PAD_TOP - PAD_BOTTOM;
  const baseY  = PAD_TOP + plotH;

  const diffs  = planned.map((p, i) => Math.round((p ?? 0) - (actual[i] ?? 0)));
  const maxGrp = Math.max(110, ...planned, ...actual);
  // Group-mode bar height: scaled against the largest plan/actual value.
  const hGroup = (val) => (val ? Math.max((val / maxGrp) * plotH, 2) : 0);

  // Diff mode is a diverging chart. The zero line sits so the largest positive
  // and largest negative bar each just reach the plot edges (minus a label
  // margin reserved at top and bottom for the value labels).
  const DIFF_LBL  = 16;
  const maxPos    = Math.max(0, ...diffs);
  const maxNeg    = Math.max(0, ...diffs.map((d) => -d));
  const diffSpan  = Math.max(1, maxPos + maxNeg);
  const diffPlotH = Math.max(plotH - DIFF_LBL * 2, 10);
  const diffScale = diffPlotH / diffSpan;
  const zeroY     = PAD_TOP + DIFF_LBL + diffPlotH * (maxPos / diffSpan);

  const barW = Math.min(groupW * 0.30, 34);
  const gap  = Math.min(groupW * 0.07, 10);

  // Per-group geometry for the planned / actual bars.
  const groups = names.map((name, i) => {
    const cx = PAD_X + groupW * i + groupW / 2;
    const p = planned[i] ?? 0;
    const a = actual[i]  ?? 0;
    const d = diffs[i];
    const xPlannedGrp = cx - gap / 2 - barW;
    const xActualGrp  = cx + gap / 2;
    // Diverging diff bar: |d| tall, rising above zero (d ≥ 0) or hanging below.
    const dh  = d ? Math.max(Math.abs(d) * diffScale, 2) : 0;
    const dUp = d >= 0;
    return {
      name, i, cx, p, a, d, dh,
      xPlannedGrp, xActualGrp,
      hP: hGroup(p),
      hA: hGroup(a),
      diffY:      dUp ? zeroY - dh : zeroY,            // rect top edge
      diffLabelY: dUp ? zeroY - dh - 6 : zeroY + dh + 12,
      // P bar → heatmap thresholds; A bar → diff thresholds on D = P − A.
      pColor: colorFor(p, plannedSegments, PLANNED_COLOR),
      aColor: colorFor(d, diffSegments, ACTUAL_COLOR),
    };
  });

  return (
    <div ref={wrapRef} style={{ width: "100%", overflowX: svgW > width ? "auto" : "hidden" }}>
      <svg width={svgW} height={height} style={{ display: "block" }}>
        <line
          x1={PAD_X} y1={diffMode ? zeroY : baseY}
          x2={svgW - PAD_X} y2={diffMode ? zeroY : baseY}
          stroke={gridColor} strokeWidth={1}
        />

        {groups.map(({ name, cx, p, a, d, dh, xPlannedGrp, xActualGrp, hP, hA, diffY, diffLabelY, pColor, aColor }) => {
          // Planned bar morphs into the diff bar; actual bar slides under it and fades.
          const plannedX = diffMode ? cx - barW / 2 : xPlannedGrp;
          const plannedY = diffMode ? diffY : baseY - hP;
          const plannedH = diffMode ? dh : hP;
          const plannedFill = diffMode ? aColor : pColor;
          const actualX = diffMode ? cx - barW / 2 : xActualGrp;
          const actualY = diffMode ? diffY : baseY - hA;
          const actualH = diffMode ? dh : hA;

          return (
            <g key={name}>
              <rect
                x={actualX} y={actualY} width={barW} height={actualH}
                rx={3} fill={aColor}
                opacity={diffMode ? 0 : 1} style={{ transition: T }}
              />
              <rect
                x={plannedX} y={plannedY} width={barW} height={plannedH}
                rx={3} fill={plannedFill} style={{ transition: T }}
              />

              {/* Planned / diff value label */}
              <text
                x={diffMode ? cx : xPlannedGrp + barW / 2}
                y={diffMode ? diffLabelY : baseY - hP - 6}
                textAnchor="middle" fontSize={10} fontWeight={700}
                fill={diffMode ? aColor : pColor}
                style={{ transition: "fill .35s ease" }}
              >
                {diffMode ? `${d > 0 ? "+" : ""}${d}%` : `${Math.round(p)}%`}
              </text>
              {/* Actual value label — hidden in diff mode */}
              <text
                x={xActualGrp + barW / 2} y={baseY - hA - 6}
                textAnchor="middle" fontSize={10} fontWeight={700} fill={aColor}
                opacity={diffMode ? 0 : 1} style={{ transition: "opacity .3s ease" }}
              >
                {`${Math.round(a)}%`}
              </text>

              {/* Category label — shortened + horizontal in both modes */}
              <text x={cx} y={baseY + 16} textAnchor="middle" fontSize={10} fill={labelColor}>
                {shortName(name)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-center gap-4 mt-1 text-[10px]" style={{ color: labelColor }}>
        {!diffMode ? (
          <span>{plannedLabel} · {actualLabel}</span>
        ) : (
          <span>{plannedLabel} − {actualLabel}</span>
        )}
      </div>
    </div>
  );
}
