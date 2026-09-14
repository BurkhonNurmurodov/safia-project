/**
 * THE letter badge of a work-centre GROUP (backend `services/wc_group.py`).
 *
 * Inside one unit several cells may stand at one SAP work centre; each carries
 * a group letter, and so do the catalog lines and the «Bugungi fakt» typed for
 * it. Wherever a work-centre code or a cell is shown and a group applies, this
 * sits right after the code chip — never a second hand-rolled pill.
 *
 * Renders NOTHING without a group: a cell alone at its work centre has none,
 * and a placeholder would only say so ten times over. `tone="warn"` is for an
 * ORPHAN letter (lines or pins naming a group no cell carries). `title` is the
 * caller's translated tooltip; `wcGroupLabel` (utils/wcGroup.js) is the
 * plain-text spelling for anything that must be a string.
 */
export default function GroupBadge({ group, title, tone = "neutral", className = "" }) {
  if (!group) return null;
  const warn = tone === "warn";
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center font-mono text-[10px] font-bold leading-none rounded-md px-1.5 py-[3px] align-middle ${className}`}
      style={{
        background: warn ? "rgba(234,179,8,0.12)" : "var(--bg-inner)",
        border: `1px solid ${warn ? "rgba(234,179,8,0.45)" : "var(--border-md)"}`,
        color: warn ? "#eab308" : "var(--text-2)",
      }}
    >
      {group}
    </span>
  );
}
