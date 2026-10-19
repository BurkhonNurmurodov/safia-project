import { exportXlsx } from "./exportXlsx";
import { PENDING_ICONS, PENDING_TITLE_KEYS } from "../components/ui/PendingInfoModal";

/**
 * A /zagruzka table as a workbook that looks like the table.
 *
 * Every figure on those tables is computed here in the browser —
 * utils/formulas.js is THE definition of all of them — so the table describes
 * ITSELF (rows in screen order, its summary column in the mode on screen, its
 * P·A or D view, each cell's band colour) and the server only lays it out:
 * backend/app/services/grid_export.py, which documents the spec.
 *
 * The grid components build `cols / head / body / foot / legend / lines`
 * (they hold the sort, the summary mode and the view); the page adds the
 * words around it — title, the scope lines, the file name — and calls this.
 */
export function postGridXlsx(grid, { title, lines = [], sheet, filename, caption, table }) {
  return exportXlsx("/api/zagruzka/export.xlsx", {
    body: {
      ...grid,
      lines: [...(grid.lines || []), ...lines],
      title, sheet: sheet || title, filename, caption, table,
    },
    fallbackName: "zagruzka.xlsx",
  });
}

// ── Cell builders — the spec's vocabulary, in one place ──
// A whole percent filled with its band colour (`color` is the grid's own
// { bg, fg } — the very pair the screen paints, never a re-derived one).
export const pctCell = (v, color, kind = "pct", span = 1) => (
  v == null
    ? { t: "—", span }
    : { v, k: kind, bg: color?.noData ? null : color?.bg, fg: color?.fg, span }
);
// A day whose figure cannot show yet: the screen's striped cell and its icon.
export const hatchCell = (reason, span = 1) => (
  { hatch: true, t: PENDING_ICONS[reason] || "⏳", span }
);

// The striped cells' key, for the reasons the grid actually holds — one line
// per icon (two reasons share ⏳ and one title).
export function pendingLegend(reasons, t, title) {
  const seen = new Map();
  for (const r of reasons) {
    const icon = PENDING_ICONS[r] || "⏳";
    if (!seen.has(icon)) seen.set(icon, t(PENDING_TITLE_KEYS[r] || "zagruzka.pendingTitle"));
  }
  return seen.size
    ? [{ title, items: [...seen].map(([icon, label]) => ({ hatch: true, icon, label })) }]
    : [];
}
