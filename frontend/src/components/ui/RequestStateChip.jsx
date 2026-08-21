import { Ban, Hourglass, ShieldCheck } from "lucide-react";

/**
 * THE request-state chip — one look for "waiting / accepted / refused" wherever
 * the platform asks somebody to approve something.
 *
 * Hoisted out of `components/leaders/LateReports.jsx`, which had drawn the only
 * good version of it privately while `pages/Staff.jsx` drew a second, text-only
 * one in a different amber. Two vocabularies for one fact is how a reader stops
 * being able to tell "pending" apart at a glance across pages.
 *
 * Every state carries an ICON as well as a colour (the `verifyState.js` rule):
 * about one man in twelve sees these hues differently, and a chip that says
 * only "amber" says nothing to them.
 *
 * `neutral` is grey, not red — a thing that simply does not apply is the rule
 * working, not a mistake somebody made.
 */
const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_OFF = "#94a3b8";

export const REQUEST_STATE_STYLE = {
  pending:  { color: C_WAIT, Icon: Hourglass },
  approved: { color: C_OK,   Icon: ShieldCheck },
  rejected: { color: C_BAD,  Icon: Ban },
  neutral:  { color: C_OFF,  Icon: Ban },
};

/** #rrggbb → rgba(), so one hue yields both the tint and its border. */
export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const SIZES = {
  xs: "gap-1 px-1.5 py-0.5 text-[10px]",
  sm: "gap-1.5 px-2 py-1 text-[11px]",
};

export default function RequestStateChip({ state, label, size = "sm", className = "" }) {
  const { color, Icon } = REQUEST_STATE_STYLE[state] || REQUEST_STATE_STYLE.neutral;
  return (
    <span
      className={`inline-flex items-center rounded-lg font-semibold ${SIZES[size] || SIZES.sm} ${className}`}
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color }}
    >
      <Icon size={size === "xs" ? 10 : 12} />{label}
    </span>
  );
}
