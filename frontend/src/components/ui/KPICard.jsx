import Tooltip from "./Tooltip";

export default function KPICard({ label, value, sub, accent = false, danger = false, tooltip, onValueClick }) {
  const textStyle = accent
    ? { color: "var(--brand-text)" }
    : danger
      ? {}
      : { color: "var(--text-1)" };

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-widest mb-1 flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <div
        className={`text-2xl font-bold font-mono ${danger ? "text-red-400" : ""}`}
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
