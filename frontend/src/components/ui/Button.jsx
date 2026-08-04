import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Canonical button — THE template for every action button in the app.
 * Use this instead of hand-styling <button> so all pages stay consistent.
 *
 * Props:
 *   variant   – "primary" (brand gold, white text — the main action)
 *               "secondary" (neutral card bg — cancel / less important)
 *               "danger" (red — destructive confirm)
 *               "success" (Excel green — spreadsheet / export actions)
 *               "ghost" (borderless, subdued — inline/toolbar actions)
 *   size      – "md" (default, compact px-3.5 py-1.5 text-xs ≈ 30px)
 *               | "sm" (px-3 py-1 text-xs ≈ 26px)
 *               | "lg" (px-4 py-2 text-sm = 38px) — the toolbar height; use in
 *                 table toolbars so the button lines up with the filter/search
 *                 controls (SearchInput / FilterPanel / SegmentedToggle md,
 *                 all 38px). md/sm stay compact for modals and inline actions.
 *   tint      – soft-tinted treatment of the same variant: 12%-alpha background,
 *               coloured border, coloured label instead of a solid fill. THE
 *               form for table-row actions (approve / reject / archive / edit),
 *               which used to be hand-rolled <button>s with inline rgba and
 *               onMouseEnter styling — that pattern leaves a destructive action
 *               stuck in its neutral rest state on touch, where mouse events
 *               never fire, so "delete" looked identical to "archive" on a
 *               phone. Tint carries the semantics at rest, in CSS, on any input.
 *   icon      – optional lucide icon element rendered before the label
 *   loading   – overlays a centered Loader2 spinner (label kept in place to
 *               reserve width, so the button never reflows) and disables
 *   className – extra classes (layout only — colors come from the variant)
 */
const SOLID = {
  primary:   { background: "var(--brand)",    color: "#fff", border: "1px solid transparent" },
  secondary: { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" },
  danger:    { background: "#ef4444",         color: "#fff", border: "1px solid transparent" },
  success:   { background: "#217346",         color: "#fff", border: "1px solid transparent" },
  ghost:     { background: "transparent",     color: "var(--text-3)", border: "1px solid transparent" },
};

const TINT = {
  primary:   { background: "var(--brand-bg)",        color: "var(--brand-text)", border: "1px solid var(--brand-border)" },
  secondary: { background: "var(--bg-inner)",        color: "var(--text-2)",     border: "1px solid var(--border-md)" },
  danger:    { background: "rgba(239,68,68,0.12)",   color: "#ef4444",           border: "1px solid rgba(239,68,68,0.35)" },
  success:   { background: "rgba(34,197,94,0.12)",   color: "#22c55e",           border: "1px solid rgba(34,197,94,0.35)" },
  ghost:     { background: "transparent",            color: "var(--text-3)",     border: "1px solid var(--border-md)" },
};

const Button = forwardRef(function Button({
  variant = "primary",
  size = "md",
  tint = false,
  icon = null,
  loading = false,
  disabled = false,
  className = "",
  style = {},
  children,
  ...rest
}, ref) {
  // Borderless variants carry a transparent border so every variant renders
  // the same height as bordered controls (secondary, SearchInput, FilterPanel).
  const palette = (tint ? TINT : SOLID)[variant] ?? SOLID.primary;

  const sizing =
    size === "sm" ? "px-3 py-1 text-xs"      // ≈26px
    : size === "lg" ? "px-4 py-2 text-sm"    // 38px — toolbar baseline
    : "px-3.5 py-1.5 text-xs";               // md, ≈30px
  const isDisabled = disabled || loading;
  const spinner = <Loader2 size={size === "sm" ? 12 : size === "lg" ? 14 : 13} className="animate-spin" />;

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-opacity ${sizing} ${className}`}
      style={{ ...palette, opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? "not-allowed" : "pointer", ...style }}
      {...rest}
    >
      {/* Spinner is overlaid (not inline) so toggling `loading` never changes
          the button's width — an inline spinner on an icon-less button grows it
          and, under a right-aligned footer + opacity transition, leaves a
          ghost/double-image on mobile WebViews. */}
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
      )}
      <span className={`inline-flex items-center gap-1.5 ${loading ? "invisible" : ""}`}>
        {icon}
        {children}
      </span>
    </button>
  );
});

export default Button;
