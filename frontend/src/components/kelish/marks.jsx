/* The «Ish grafigi» answers, drawn ONE way everywhere a list is shown — the
 * /kelish grid (pages/Kelish.jsx) and the «how the list looked at the check»
 * modal of a task-#11 verdict (components/leaders/StaffListAtCheck.jsx). Moved
 * out of the page on 2026-10-12 so the modal reuses the grid's cells instead of
 * forking them.
 */
import { Check, X } from "lucide-react";
import { toneFill } from "../../utils/statusBands";

// The two answers, painted as the platform paints every heatmap cell: the hue
// at full saturation with the ink `contrastText` picks for it (dark on green,
// white on red), so a cell reads the same on both themes.
export const FILL = { yes: toneFill("ok"), no: toneFill("bad") };
// Where a cell holds no slot at all.
export const OFF = { background: "var(--bg-inner)" };
// A closed day's listed cell nobody answered prints «—», the totals row's own
// blank — so a gap in the record is never the same flat colour as «not on that
// day's list», and never a hollow box that reads as an unticked checkbox.
export const DASH = <span aria-hidden="true" className="text-xs leading-none" style={{ color: "var(--text-3)" }}>—</span>;
// An open day's unanswered cell: a brand wash that says «tap here». In the grid
// `.kelish-hit.is-empty` adds a dashed slot inside it (index.css), so an open
// empty cell never reads as the flat grey of «no slot».
export const LANE = { background: "rgba(var(--brand-rgb), 0.12)" };
export const SLOT_EDGE = "1px dashed var(--brand)";
// The open days' header, opaque because the header row is sticky.
export const LANE_HEAD = "linear-gradient(rgba(var(--brand-rgb), 0.14), rgba(var(--brand-rgb), 0.14)), var(--bg-inner)";

export function MarkIcon({ mark, pop = false }) {
  const Icon = mark === "yes" ? Check : X;
  return <Icon aria-hidden="true" className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${pop ? "kelish-pop" : ""}`} strokeWidth={3} />;
}

// A cell in miniature, for the legend and the worker card — drawn exactly as
// the grid draws it: `lane` is an open cell nobody answered yet (the dashed
// slot), `off` is «no slot», and a bare chip is a closed cell left unanswered
// — the «—» the grid prints there.
export function Chip({ mark = null, off = false, lane = false, size = 14 }) {
  const Icon = mark === "yes" ? Check : mark === "no" ? X : null;
  const style = mark ? FILL[mark]
    : off ? { ...OFF, border: "1px solid var(--border)" }
      : lane ? { ...LANE, border: SLOT_EDGE }
        : null;
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-[3px] flex-shrink-0"
      style={{ width: size, height: size, ...style }}
    >
      {Icon && <Icon style={{ width: size - 4, height: size - 4 }} strokeWidth={3.5} />}
      {!mark && !off && !lane && DASH}
    </span>
  );
}
