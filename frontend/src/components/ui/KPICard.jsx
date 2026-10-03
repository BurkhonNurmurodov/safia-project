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
    <div className="relative rounded-xl p-4 max-sm:flex max-sm:flex-col max-sm:active:bg-[var(--bg-inner)]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        {/* Phone: sentence case without the wide tracking — uppercase spaced
            11px breaks a two-word label into a stack of fragments on a
            half-width card. Desktop is unchanged. */}
        <div className="text-[11px] uppercase tracking-widest max-sm:normal-case max-sm:tracking-normal max-sm:text-xs mb-1 min-w-0" style={{ color: "var(--text-3)" }}>
          {/* The (i) is bound to the label's LAST word, so on a phone it follows
              the text instead of floating alone at the card's edge. Above the
              stretched value button, so it still opens itself. */}
          {(() => {
            const info = tooltip && <span className="relative z-10 inline-flex align-middle"><Tooltip text={tooltip} /></span>;
            if (typeof label !== "string" || !info) return <>{label}{info}</>;
            const cut = label.lastIndexOf(" ");
            return (
              <>
                {cut > 0 && label.slice(0, cut + 1)}
                <span className="whitespace-nowrap">{label.slice(cut + 1)}{info}</span>
              </>
            );
          })()}
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
        className={`max-sm:mt-auto text-2xl ${String(value ?? "").length > 7 ? "max-sm:text-lg" : "max-sm:text-xl"} font-bold font-mono ${danger && !color ? "text-red-400" : ""}`}
        style={textStyle}
      >
        {onValueClick ? (
          <button
            onClick={onValueClick}
            // Phone: the button stretches over the whole card (after:inset-0), so
            // the card — not a 14px figure — is what a thumb taps.
            className="hover:underline underline-offset-2 text-left max-sm:after:absolute max-sm:after:inset-0 max-sm:after:content-[''] max-sm:after:rounded-xl"
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
