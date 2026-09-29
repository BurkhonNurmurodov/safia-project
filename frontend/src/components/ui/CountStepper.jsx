import { forwardRef } from "react";
import { Minus, Plus } from "lucide-react";
import { useLang } from "../../context/LangContext";

/**
 * Canonical WHOLE-NUMBER count field — THE template for "how many people /
 * pieces" on the platform. First caller: the «Tozalovchilar» count a Tozalash
 * ojidaniya must carry (2026-09-29), on the /idle-cell form and in the live
 * «Jonli» recorder, so both doors ask the same question the same way.
 *
 * Why a stepper and not a bare <input type="number">:
 *  • the typical count is small (1–3 cleaners), so − / + is one tap on a phone
 *    where a numeric keyboard is three, and it never opens a keyboard over the
 *    sheet it sits in;
 *  • the ± buttons stop AT the bounds, so the usual answers are unpickable when
 *    wrong; a typed number above `max` is kept as typed and left to the
 *    caller's `error` line — silently clamping somebody's number is a guess;
 *  • blank is a real value (null): "not answered yet" must not read as 0.
 *
 * Props:
 *   value / onChange – a whole number or null; onChange receives the NUMBER
 *                      (or null when the box is emptied), never the event.
 *   min / max        – bounds for the ± buttons (max optional); a press from
 *                      blank lands on `min`.
 *   invalid          – red border (pair it with FormField's `error`)
 *   disabled, id, placeholder, aria-label – forwarded; the ref lands on the
 *                      <input>.
 *
 * Skin: the house control (bg-inner, border, rounded-xl) at 38px — the toolbar
 * baseline — with 16px text below md so iOS never zooms the page into it.
 */
const CountStepper = forwardRef(function CountStepper({
  value,
  onChange,
  min = 1,
  max = null,
  invalid = false,
  disabled = false,
  id,
  placeholder = "",
  className = "",
  ...rest
}, ref) {
  const { t } = useLang();
  const n = Number.isInteger(value) ? value : null;
  const canDown = !disabled && n != null && n > min;
  const canUp = !disabled && (max == null || n == null || n < max);
  const step = (d) => {
    if (n == null) return onChange(min);
    let next = n + d;
    // A number TYPED above the bound comes down onto it in one press, rather
    // than leaving − inert until the reader has backed off step by step.
    if (max != null && next > max) next = d < 0 ? max : n;
    if (next < min || next === n) return;
    onChange(next);
  };
  const btn = (enabled, onClick, Icon, label) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
      className="h-[38px] w-[38px] flex-shrink-0 rounded-xl flex items-center justify-center transition-colors disabled:cursor-not-allowed"
      style={{
        background: "var(--bg-inner)",
        border: "1px solid var(--border)",
        color: enabled ? "var(--text-1)" : "var(--text-4)",
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <Icon size={16} />
    </button>
  );
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {btn(canDown, () => step(-1), Minus, t("ui.countStepper.less"))}
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={n == null ? "" : String(n)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          onChange(digits === "" ? null : parseInt(digits, 10));
        }}
        className="h-[38px] w-20 min-w-0 rounded-xl px-3 text-center text-base md:text-sm font-semibold tabular-nums outline-none disabled:cursor-not-allowed"
        style={{
          background: "var(--bg-inner)",
          border: `1px solid ${invalid ? "#ef4444" : n != null ? "var(--border-md)" : "var(--border)"}`,
          color: "var(--text-1)",
          opacity: disabled ? 0.5 : 1,
        }}
        {...rest}
      />
      {btn(canUp, () => step(1), Plus, t("ui.countStepper.more"))}
    </div>
  );
});

export default CountStepper;
