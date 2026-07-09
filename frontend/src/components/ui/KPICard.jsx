import Tooltip from "./Tooltip";

// Soft rgba tint from a #hex (mirrors the ProjectIcon chip in Kaizen).
const hexA = (hex, a) => {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function KPICard({
  label, value, sub, accent = false, danger = false, tooltip, onValueClick,
  icon: Icon, color,
}) {
  // `color` (a #hex from the palette) tints the icon chip + value; it takes
  // precedence over the legacy accent/danger coloring but leaves them intact
  // for existing callers that pass neither icon nor color.
  const textStyle = color
    ? { color }
    : accent
      ? { color: "var(--brand-text)" }
      : danger
        ? {}
        : { color: "var(--text-1)" };

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
          {label}
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        {Icon && (
          <span
            className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0 -mt-0.5"
            style={{ background: hexA(color || "#94a3b8", 0.14), color: color || "var(--text-3)" }}
          >
            <Icon size={15} strokeWidth={2.3} />
          </span>
        )}
      </div>
      <div
        className={`text-2xl font-bold font-mono ${danger && !color ? "text-red-400" : ""}`}
        style={textStyle}
      >
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
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}
