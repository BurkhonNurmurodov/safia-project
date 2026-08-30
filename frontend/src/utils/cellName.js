/**
 * How a production cell is NAMED on screen — the ONE definition, so every page
 * that refers to a cell refers to it the same way.
 *
 * **A cell is its CODE.** The four-digit verifix code is the whole label; the
 * workshop name («Холодные яблоки», «Холодильщик и кладовщик») is never printed
 * anywhere a cell is identified — not in a table cell, a chip, a filter option,
 * a chart axis, a modal title, a tooltip or an export column (the operator's
 * standing directive). The names are long, near-duplicates of one another
 * («Холодная ягода» appears on 1611 and on 1622) and truncate to nothing in the
 * narrow controls that carry them, so they cost a line and settle nothing.
 *
 * **When a code alone is too thin, the second fact is the LEADER's name** — the
 * person answerable for that cell — never the workshop. `cellLabel` is that
 * join and the only place the separator lives.
 *
 * The workshop names are still STORED and still edited on `/cells` (they are
 * what the plant calls these rooms, and the register is where that is kept), so
 * `cellName` survives for the editor and for SEARCH — typing «яблоки» still
 * finds 1612. It must not be rendered as a label; use `cellLabel` for that.
 *
 * Endpoints spell the name keys differently, so `prefix` names the key family:
 *   "name_workshop_" → /api/profiles/admin/cells   (the register itself)
 *   "name_"          → /api/cell-attendance, /api/idle-cell
 *   ""               → the short {uz, uz_cyrl, ru, en} shape from cell_lookup
 */

// Fallback order after the viewer's own language — Russian first.
export const CELL_NAME_LANGS = ["ru", "uz", "uz_cyrl", "en"];

/**
 * THE cell label: the code, plus the leader's name when one is at hand.
 *
 * `leader` is already display-ready (transliterated by the caller's `tl`) — the
 * separator and the "code alone when there is no leader" rule live here so a
 * cell reads identically on every surface.
 */
export function cellLabel(code, leader) {
  const c = String(code ?? "").trim();
  const l = String(leader ?? "").trim();
  if (c && l) return `${c} · ${l}`;
  return c || l || "";
}

/**
 * The stored workshop name, viewer-language-first then Russian.
 *
 * SEARCH AND THE REGISTER EDITOR ONLY — see the file header. Every language
 * column on `cells` is nullable and Russian is the one the plant actually fills
 * in (the bulk seed writes ru + a transliterated uz_cyrl), so the fallback
 * reaches Russian before the remaining languages.
 */
export function cellName(cell, lang = "ru", prefix = "name_workshop_") {
  if (!cell) return "";
  for (const l of [lang, ...CELL_NAME_LANGS]) {
    const v = cell[`${prefix}${l}`];
    if (v) return String(v);
  }
  return "";
}

export default cellName;
