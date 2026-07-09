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
 *   size="md" (default) → ≈ 32px  (compact Button md + a touch of inset)
 *   size="sm"           → ≈ 28px  (compact Button sm + a touch of inset)
 *
 * Props:
 *   value     – the currently selected option value (compared with ===)
 *   onChange  – (value) => void, called with the clicked option's value
 *   options   – array of either [value, label] tuples or
 *               { value, label, title } objects. `label` may be a string or
 *               a node (e.g. an icon for icon-only segments).
 *   size      – "md" (default) | "sm"
 *   fill      – when true, the track spans its container full-width and every
 *               segment grows to an equal share (flex-1). Use for form-panel
 *               fields (stacked in a flex column) so the pill fills the row
 *               instead of leaving dead track space on the right. Toolbars
 *               leave this off so the toggle shrink-wraps to its labels.
 *   className – extra wrapper classes (widths / shrink / margins only)
 */
export default function SegmentedToggle({
  value,
  onChange,
  options = [],
  size = "md",
  fill = false,
  className = "",
}) {
  // A 4px track inset gives the selected pill a little breathing room from the
  // track border on every side; with the segment padding below the OUTER height
  // lands at ~32px (md) / ~28px (sm) — a hair taller than compact Button md/sm
  // by design (the white StyledSelect dropdowns stay taller too).
  const seg = size === "sm" ? "px-2 py-[1px] text-xs" : "px-2.5 py-[3px] text-xs";
  const items = options.map((o) =>
    Array.isArray(o) ? { value: o[0], label: o[1], title: o[2] } : o
  );

  return (
    <div
      className={`${fill ? "flex w-full" : "inline-flex"} items-center gap-1 rounded-xl p-[4px] ${className}`}
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      {items.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`${fill ? "flex-1" : ""} inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${seg}`}
            style={
              active
                ? { background: "var(--brand)", color: "#fff", fontWeight: 600 }
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
