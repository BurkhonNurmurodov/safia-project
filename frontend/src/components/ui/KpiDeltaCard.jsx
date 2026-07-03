import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import Tooltip from "./Tooltip";

const GOOD = "#22c55e";
const BAD  = "#ef4444";
const FLAT = "#94a3b8";

// Tiny inline sparkline. Scales to the card width; stroke stays crisp.
// Points are joined with Catmull-Rom-derived Béziers so the line reads as a
// gentle curve; control-point Y is clamped so curves never overshoot the box.
function Sparkline({ values, color }) {
  const pts = (values || []).filter((v) => v != null);
  if (pts.length < 2) return <div style={{ height: 30 }} />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const W = 120, H = 30, P = 3;
  const step = (W - P * 2) / (pts.length - 1);
  const coords = pts.map((v, i) => {
    const x = P + i * step;
    const y = P + (1 - (v - min) / span) * (H - P * 2);
    return [x, y];
  });
  const clampY = (y) => Math.min(H - P, Math.max(P, y));
  let curve = "";
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
    curve += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const start = `${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
  const line = `M ${start}${curve}`;
  const area = `M ${P},${H} L ${start}${curve} L ${W - P},${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={area} fill={color} opacity={0.12} />
      <path
        d={line} fill="none" stroke={color} strokeWidth={1.6}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function KpiDeltaCard({
  label, tooltip,
  value, prevValue, prevLabel = "prev.",
  delta = 0, deltaText,
  higherIsBetter = true,
  trend,
  accent = false, danger = false,
  onValueClick,
}) {
  const favorable = delta === 0 ? null : (delta > 0) === higherIsBetter;
  const chipColor = favorable === null ? FLAT : favorable ? GOOD : BAD;
  const Arrow = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  const valueStyle = accent
    ? { color: "var(--brand-text)" }
    : danger
      ? { color: "#f87171" }
      : { color: "var(--text-1)" };

  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold font-mono" style={valueStyle}>
          {onValueClick ? (
            <button
              onClick={onValueClick}
              className="hover:underline underline-offset-2"
              style={{ background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer" }}
            >
              {value ?? "—"}
            </button>
          ) : (value ?? "—")}
        </div>
        {deltaText && (
          <span
            className="flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md mb-1 flex-shrink-0"
            style={{ color: chipColor, background: `${chipColor}1f` }}
          >
            <Arrow size={12} />
            {deltaText}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
          {prevLabel} {prevValue ?? "—"}
        </div>
        <div className="w-[55%] max-w-[130px]">
          <Sparkline values={trend} color={chipColor === FLAT ? "var(--brand)" : chipColor} />
        </div>
      </div>
    </div>
  );
}
