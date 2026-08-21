import { forwardRef, useState } from "react";
import { X } from "lucide-react";
import Button from "./Button";
import { useLang } from "../../context/LangContext";

/**
 * Canonical time-of-day field — THE template for every clock input on the
 * platform (shift start/end, photo windows, submission deadlines). Use this
 * instead of a bare <input type="time">, exactly as every dropdown goes through
 * StyledSelect and every date through DateRangePicker.
 *
 * THREE things it exists for, none of which a native input gives you:
 *
 * 1. BLANK IS A REAL VALUE, and it means "inherit" / "not set" — never
 *    midnight. Every clock on this platform sits on an inheritance chain (a
 *    cell inherits its shift default, a leader task inherits its supervisor's
 *    window), so "" is the value an admin most often wants to get BACK to, and
 *    no engine offers an affordance for it: Chrome wants a Delete keypress on
 *    the focused segment, and Telegram's iOS wheel picker has no clear at all —
 *    so on the primary device a time set once could never be unset. The ✕ is
 *    that way back. It sits OUTSIDE the input, clear of whatever picker
 *    indicator the engine draws inside the right edge.
 *
 * 2. THE INHERIT CAPTION. A blank native time input renders "--:--", which
 *    reads as broken rather than as inherited and states nothing about what is
 *    actually in force. Pass `inherit` (the effective value coming from the
 *    level above) and the field spells it out underneath, so leaving the field
 *    blank is an informed choice instead of a guess.
 *
 * 3. ONE resting appearance for every clock in the app (bg-inner, border,
 *    rounded-xl, px-3 py-2 text-sm — the modal/field baseline), plus designed
 *    hover, focus and disabled states rather than whatever the engine defaults
 *    to under `outline-none`.
 *
 * Props:
 *   value / onChange – controlled "HH:MM" string; onChange receives the STRING
 *                      (not the event), and "" when the ✕ is pressed.
 *   inherit          – effective value from the level above ("08:00", or a pair
 *                      like "08:00–20:00"). Rendered as an 11px caption under
 *                      the control ONLY while `value` is blank. Pass null when
 *                      the surface already prints its own inherit line (two
 *                      fields sharing one caption, say) — never both.
 *   inheritLabel     – full replacement caption text, when the surface needs to
 *                      say something the templated sentence cannot.
 *   clearable        – show the ✕ when there is a value (default true)
 *   disabled         – dims and disables BOTH the input and the ✕
 *   className        – extra classes on the wrapper (layout only)
 *   id / placeholder – forwarded to the input; ...rest too
 *
 * The ref lands on the <input>.
 */
const TimeField = forwardRef(function TimeField({
  value,
  onChange,
  inherit = null,
  inheritLabel = null,
  clearable = true,
  disabled = false,
  className = "",
  id,
  placeholder,
  ...rest
}, ref) {
  const { t } = useLang();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const v = value || "";
  const clearLabel = t("ui.timeField.clear");
  // Only while blank: once a value is typed, the inherited one is not in force
  // and saying otherwise would be a lie sitting under the control.
  const caption = v
    ? null
    : inheritLabel ||
      (typeof inherit === "string" && inherit
        ? t("ui.timeField.inherits").replace("{v}", inherit)
        : null);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-1">
        {/* `rest` is spread FIRST so the field's own value, handlers and styling
            always win; the handlers below still chain whatever the caller
            passed, so an onFocus from outside is not swallowed. */}
        <input
          {...rest}
          ref={ref}
          id={id}
          type="time"
          value={v}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          onMouseEnter={(e) => { setHovered(true); rest.onMouseEnter?.(e); }}
          onMouseLeave={(e) => { setHovered(false); rest.onMouseLeave?.(e); }}
          className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-colors"
          style={{
            background: "var(--bg-inner)",
            // Focus is the brand ring; hover only firms the border up. Both are
            // painted here rather than left to the engine, because `outline-none`
            // otherwise leaves a keyboard user with no focus indication at all.
            border: `1px solid ${focused ? "var(--brand)" : hovered && !disabled ? "var(--border-md)" : "var(--border)"}`,
            boxShadow: focused ? "0 0 0 3px var(--brand-bg)" : "none",
            color: "var(--text-1)",
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "auto",
            ...(rest.style || {}),
          }}
        />
        {clearable && v ? (
          <Button
            type="button"
            variant="ghost"
            tint
            size="lg"
            disabled={disabled}
            className="shrink-0"
            // lg is already 38px — the control row's height — and the floor
            // keeps it a real touch target if the sizing ever changes.
            style={{ paddingInline: 8, minHeight: 32 }}
            icon={<X size={14} />}
            title={clearLabel}
            aria-label={clearLabel}
            onClick={() => onChange("")}
          />
        ) : null}
      </div>
      {caption ? (
        <div className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
});

export default TimeField;
