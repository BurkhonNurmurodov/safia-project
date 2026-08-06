/**
 * Workshop-name resolution for the cells registry — the ONE place the language
 * fallback lives, so every page that renders a cell name agrees.
 *
 * All four language columns on `cells` are nullable. Russian is the language
 * the plant actually fills in (the bulk seed writes ru + a transliterated
 * uz_cyrl, and the /cells editor treats ru as the authoritative name), so a
 * name resolves viewer-language-first and then falls back to RUSSIAN before
 * the remaining languages: a cell that only ever got a Russian name still
 * reads correctly on an Uzbek or English UI.
 *
 * Endpoints spell the keys differently, so `prefix` names the key family:
 *   "name_workshop_" → /api/profiles/admin/cells   (the register itself)
 *   "name_"          → /api/cell-attendance, /api/idle-cell
 *   ""               → the short {uz, uz_cyrl, ru, en} shape from cell_lookup
 */

// Fallback order after the viewer's own language — Russian first.
export const CELL_NAME_LANGS = ["ru", "uz", "uz_cyrl", "en"];

export function cellName(cell, lang = "ru", prefix = "name_workshop_") {
  if (!cell) return "";
  for (const l of [lang, ...CELL_NAME_LANGS]) {
    const v = cell[`${prefix}${l}`];
    if (v) return String(v);
  }
  return "";
}

// People-exchange documents: the destination-cell suffix (" · <cell name>") for
// a → supervisor move. Empty for task targets and for documents that predate
// destination cells, so every existing render keeps working unchanged.
export function exchangeCellSuffix(doc, lang = "ru") {
  if (!doc || doc.target_type !== "supervisor" || !doc.target_cell) return "";
  const nm = cellName(doc.target_cell_names || {}, lang, "");
  return ` · ${nm || doc.target_cell}`;
}

export default cellName;
