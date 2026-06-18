import { useRef, useState, useEffect } from "react";
import { useChartTheme } from "../../hooks/useChartTheme";
import { utilColor } from "../../utils/formatters";

export default function BarRankingChart({
  names, values, height = 400,
  colors: customColors,
  xMin,
  xMax,
  seriesName = "Workload %",
}) {
  const { labelColor, gridColor } = useChartTheme();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const NAME_W  = 140;
  const CHART_W = Math.max(width - NAME_W, 60);
  const ROW_H   = 32;
  const BAR_PAD = 6;  // vertical padding inside each row

  const min  = xMin ?? 0;
  const max  = xMax ?? Math.max(...values, 110);
  const span = (max - min) || 1;
  const hasNeg = min < 0;

  const toX   = (v) => ((v - min) / span) * CHART_W;
  const zeroX = toX(0);

  const barColors = customColors ?? values.map((v) => utilColor(v / 100));
  const svgH = names.length * ROW_H;

  return (
    <div ref={wrapRef} style={{ overflowY: "auto", maxHeight: height, width: "100%" }}>
      <svg width={width} height={svgH} style={{ display: "block" }}>
        {/* Zero line for mixed +/– charts */}
        {hasNeg && (
          <line
            x1={NAME_W + zeroX} y1={0}
            x2={NAME_W + zeroX} y2={svgH}
            stroke={gridColor} strokeWidth={1} opacity={0.35}
          />
        )}

        {names.map((name, i) => {
          const v    = values[i];
          const clr  = barColors[i];
          const y    = i * ROW_H;
          const midY = y + ROW_H / 2;

          const vX   = toX(v);
          const barX = Math.min(zeroX, vX);
          const barW = Math.max(Math.abs(vX - zeroX), 0);

          /* ── label placement ─────────────────────────────────────────
             Diff mode (hasNeg=true): labels OUTSIDE the bar at zero crossing
               < 0  → right side of bar (just right of zero)
               > 0  → left  side of bar (just left  of zero)
               = 0  → side with more room
             P / A mode (hasNeg=false): label INSIDE the bar, centered, white
          ─────────────────────────────────────────────────────────── */
          let lx, anchor, textFill;
          if (!hasNeg) {
            // P / A mode — centered inside bar, white text
            lx       = barX + barW / 2;
            anchor   = "middle";
            textFill = "#ffffff";
          } else if (v < 0) {
            lx = zeroX + 5;  anchor = "start"; textFill = labelColor;  // right of zero
          } else if (v > 0) {
            lx = zeroX - 5;  anchor = "end";   textFill = labelColor;  // left of zero
          } else {
            // zero → side with more space
            if (zeroX >= CHART_W / 2) { lx = zeroX - 5; anchor = "end"; }
            else                        { lx = zeroX + 5; anchor = "start"; }
            textFill = labelColor;
          }

          const labelStr  = v > 0 && hasNeg ? `+${v}%` : `${v}%`;
          const shortName = name.length > 20 ? name.slice(0, 19) + "…" : name;

          return (
            <g key={name}>
              {/* Row name */}
              <text
                x={NAME_W - 8} y={midY + 4}
                textAnchor="end" fontSize={11} fill={labelColor}
              >
                {shortName}
              </text>

              {/* Bar */}
              {barW > 0 && (
                <rect
                  x={NAME_W + barX}  y={y + BAR_PAD}
                  width={barW}       height={ROW_H - BAR_PAD * 2}
                  fill={clr}         rx={2}
                />
              )}

              {/* Value label */}
              <text
                x={NAME_W + lx} y={midY + 4}
                textAnchor={anchor}
                fontSize={11} fontWeight={700} fill={textFill}
              >
                {labelStr}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
