// The one tooltip box every Targets chart uses: the card surface, a hairline
// border, values first. Positioned inside the chart's own (relative) wrapper,
// kept inside it, above the point when there is room and below it otherwise.
import { clamp } from "./chartKit";

export default function ChartTip({ x, y, boxW, boxH, width = 220, interactive = false, children }) {
  const w = Math.min(width, boxW - 8);
  const left = clamp(x - w / 2, 4, Math.max(4, boxW - w - 4));
  const above = y > 110;
  return (
    <div
      role="tooltip"
      className={`absolute z-20 rounded-xl px-3 py-2.5 text-xs leading-snug ${interactive ? "" : "pointer-events-none"}`}
      style={{
        left, width: w,
        ...(above ? { bottom: boxH - y + 14 } : { top: y + 14 }),
        background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
      }}
    >
      {children}
    </div>
  );
}

// One readout row: a short line-key in the series colour, the value first,
// the series name after it.
export function TipRow({ color, dashed = false, value, label }) {
  return (
    <div className="flex items-center gap-2 mt-1 first:mt-0">
      <span
        aria-hidden
        className="w-3 flex-shrink-0"
        style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="truncate" style={{ color: "var(--text-2)" }}>{label}</span>
    </div>
  );
}
