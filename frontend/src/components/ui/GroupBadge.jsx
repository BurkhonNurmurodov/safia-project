import { groupColor } from "../../utils/wcGroup";

/**
 * THE letter badge of a work-centre GROUP (backend `services/wc_group.py`).
 *
 * Inside one unit several cells may stand at one SAP work centre; each carries
 * a group letter, and so do the catalog lines and the «Bugungi fakt» typed for
 * it. Wherever a work-centre code or a cell is shown and a group applies, this
 * sits right after the code chip — never a second hand-rolled pill.
 *
 * Every letter wears its own fixed colour (`groupColor`: A red · B blue ·
 * C yellow · D green · E orange · F purple …), tinted exactly like a work-centre
 * chip — 16% fill, 30% border, the colour itself for the letter — so «A» is the
 * same red on every page it appears on.
 *
 * Renders NOTHING without a group: a cell alone at its work centre has none,
 * and a placeholder would only say so ten times over. `tone="warn"` is for an
 * ORPHAN letter (lines or pins naming a group no cell carries): the letter keeps
 * its own colour and loses its fill behind a DASHED outline — an amber pill
 * would read as group C. `title` is the caller's translated tooltip;
 * `wcGroupLabel` (utils/wcGroup.js) is the plain-text spelling for anything
 * that must be a string.
 */
const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function GroupBadge({ group, title, tone = "neutral", className = "" }) {
  if (!group) return null;
  const c = groupColor(group);
  const orphan = tone === "warn";
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center font-mono text-[10px] font-bold leading-none rounded-md px-1.5 py-[3px] align-middle ${className}`}
      style={{
        background: orphan ? "transparent" : tint(c, 0.16),
        border: `1px ${orphan ? "dashed" : "solid"} ${tint(c, orphan ? 0.75 : 0.3)}`,
        color: c,
      }}
    >
      {group}
    </span>
  );
}
