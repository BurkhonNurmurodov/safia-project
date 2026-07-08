/**
 * SegmentedToggle — THE template for the app's inline "pill" toggles
 * (min/hrs, P·A·P−A, workload/headcount/idle, theme switch, shift, …).
 *
 * One rounded-lg bar split into connected segments; the selected segment is
 * filled brand-gold, the rest sit on --bg-inner with hairline dividers.
 * Never hand-roll this bar — use this so every toggle shares the app's
 * button height. Heights mirror Button exactly:
 *   size="md" (default) → px-3.5 py-2 text-sm  ≈ 38px  (Button md / toolbar)
 *   size="sm"           → px-3   py-1.5 text-xs ≈ 30px (Button sm)
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
  const seg = size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  const items = options.map((o) =>
    Array.isArray(o) ? { value: o[0], label: o[1], title: o[2] } : o
  );

  return (
    <div
      className={`inline-flex rounded-lg overflow-hidden divide-x divide-[var(--border-md)] ${className}`}
      style={{ border: "1px solid var(--border-md)" }}
    >
      {items.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors ${seg}`}
            style={
              active
                ? { background: "var(--brand)", color: "#fff", fontWeight: 600 }
                : { background: "var(--bg-inner)", color: "var(--text-3)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
