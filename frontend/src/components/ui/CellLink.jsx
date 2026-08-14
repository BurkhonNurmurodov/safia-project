import { useNavigate } from "react-router-dom";

/**
 * THE pressable cell reference — the one template for opening a production
 * cell's own page (/cells/:id) from anywhere it appears as CONTENT: a table
 * cell, a mobile card, a chip, a register row. Wrap the visible name/code:
 *
 *   <CellLink id={row.cell_id}>{row.verifix_code}</CellLink>
 *
 * Rules (see CLAUDE.md UI-template table):
 *   • Content renders only — FILTER controls listing cells (FilterPanel
 *     sections, StyledSelect options) never navigate.
 *   • `id` is the cells.id primary key. Without one (an unmatched code, a raw
 *     string from an import) the children render as-is, inert — a dead link
 *     styled as a live one teaches users the affordance lies.
 *   • Clicks stop propagation, so a link inside a clickable row/card
 *     navigates to the CELL, not the row's own destination.
 *   • The look lives in index.css (.cell-link): dotted underline at rest —
 *     the affordance must survive touch, where hover never fires.
 */
export default function CellLink({ id, children, className = "", title, style }) {
  const navigate = useNavigate();
  if (!id) {
    return (
      <span className={className} title={title} style={style}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`cell-link ${className}`}
      title={title}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/cells/${id}`);
      }}
    >
      {children}
    </button>
  );
}
