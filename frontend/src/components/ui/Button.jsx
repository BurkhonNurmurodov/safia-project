import { Loader2 } from "lucide-react";

/**
 * Canonical button — THE template for every action button in the app.
 * Use this instead of hand-styling <button> so all pages stay consistent.
 *
 * Props:
 *   variant   – "primary" (brand gold, white text — the main action)
 *               "secondary" (neutral card bg — cancel / less important)
 *               "danger" (red — destructive confirm)
 *               "ghost" (borderless, subdued — inline/toolbar actions)
 *   size      – "md" (default, px-4 py-2 text-sm) | "sm" (px-3 py-1.5 text-xs)
 *   icon      – optional lucide icon element rendered before the label
 *   loading   – shows a Loader2 spinner in place of the icon and disables
 *   className – extra classes (layout only — colors come from the variant)
 */
export default function Button({
  variant = "primary",
  size = "md",
  icon = null,
  loading = false,
  disabled = false,
  className = "",
  style = {},
  children,
  ...rest
}) {
  // Borderless variants carry a transparent border so every variant renders
  // the same height as bordered controls (secondary, SearchInput, FilterPanel).
  const palette = {
    primary:   { background: "var(--brand)",    color: "#fff", border: "1px solid transparent" },
    secondary: { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" },
    danger:    { background: "#ef4444",         color: "#fff", border: "1px solid transparent" },
    ghost:     { background: "transparent",     color: "var(--text-3)", border: "1px solid transparent" },
  }[variant];

  const sizing = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const isDisabled = disabled || loading;
  const spinner = <Loader2 size={size === "sm" ? 13 : 14} className="animate-spin" />;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-opacity ${sizing} ${className}`}
      style={{ ...palette, opacity: isDisabled ? 0.6 : 1, cursor: isDisabled ? "not-allowed" : "pointer", ...style }}
      {...rest}
    >
      {loading ? spinner : icon}
      {children}
    </button>
  );
}
