import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import Tooltip from "./Tooltip";

const GOOD = "#22c55e";
const BAD  = "#ef4444";
const FLAT = "#94a3b8";

// Tiny inline sparkline. Scales to the card width; stroke stays crisp.
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
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${P},${H} ${line} ${(W - P)},${H}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline
        points={line} fill="none" stroke={color} strokeWidth={1.6}
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
