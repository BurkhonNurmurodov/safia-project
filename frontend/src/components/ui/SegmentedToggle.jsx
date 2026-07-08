/**
 * SegmentedToggle — THE template for the app's inline "pill" toggles
 * (min/hrs, P·A·P−A, workload/headcount/idle, theme switch, shift, view
 * switch, …).
 *
 * Recessed-track pill look: a RECESSED track (--bg-inner + a subtle border)
 * holds the segments with a small inset; the SELECTED segment is a brand-gold
 * (--brand) pill with a white label; the rest are transparent with muted
 * --text-3 labels. No divider lines. This is ALSO the style for page-level
 * "view tabs" (Production view switch, Staff Workers/Requests) — same
 * component, not a hand-rolled copy. Never hand-roll this bar — use this so
 * every toggle shares the app's button height. Outer heights mirror Button:
 *   size="md" (default) → ≈ 38px  (Button md / toolbar baseline)
 *   size="sm"           → ≈ 30px  (Button sm)
 *
 * Props:
 *   value     – the currently selected option value (compared with ===)
 *   onChange  – (value) => void, called with the clicked option's value
 *   options   – array of either [value, label] tuples or
 *               { value, label, title } objects. `label` may be a string or
 *               a node (e.g. an icon for icon-only segments).
 *   size      – "md" (default) | "sm"
 *   className – extra wrapper classes (widths / shrink / margins only)
 */
export default function SegmentedToggle({
  value,
  onChange,
  options = [],
  size = "md",
  className = "",
}) {
  // Segment padding keeps the OUTER height at 38px (md) / 30px (sm) once the
  // 3px track inset is added, so the toggle still lines up with SearchInput,
  // Button md and the FilterPanel trigger in toolbars.
  const seg = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const items = options.map((o) =>
    Array.isArray(o) ? { value: o[0], label: o[1], title: o[2] } : o
  );

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl p-[3px] ${className}`}
      style={{ background: "var(--bg-inner)" }}
    >
      {items.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${seg}`}
            style={
              active
                ? {
                    background: "var(--bg-card)",
                    color: "var(--text-1)",
                    fontWeight: 600,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.05)",
                  }
                : { background: "transparent", color: "var(--text-3)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
