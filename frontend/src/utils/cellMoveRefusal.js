// One place that turns a refused cell MOVE into a sentence (2026-10-26, «the
// catalog follows its cells» — backend services/catalog_refusal.py).
//
// A cell's positions follow it to its new brigadir, and a position several
// cells of one work centre share can follow none of them alone — so the
// server refuses the move until each position is lettered with the cell that
// makes it. Every door that changes a cell's brigadir meets the same refusal:
// the cell form (/cells, /cells/:id), «Doimiy qilish» on the admin «Davomat»
// tab and a «Verifix sinxron» tap. Three spellings of it would name three
// different things to fix.
//
// The STRUCTURE lives on `detail_raw`: utils/api.js flattens a non-string
// `detail` to its English `message` and keeps the object there.
import { productionLink } from "./scopeLinks";
import { wcGroupLabel } from "./wcGroup";

export const MOVE_REFUSALS = ["shared_positions", "positions_need_unit"];
const SHOWN = 5;

const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

/** The refusal object off an axios error, or null when it is not one. */
export function cellMoveRefusal(e) {
  const raw = e?.response?.data?.detail_raw;
  return raw && typeof raw === "object" && MOVE_REFUSALS.includes(raw.code) ? raw : null;
}

/**
 * `raw` (the server's {code, message, params}) in the reader's words:
 *
 *   text      – what blocks the move and what to letter: the cell and its
 *               work centre by CODE, the first five positions by name (DB
 *               text, through `tx`) then «+N», the cells staying with their
 *               letters. A reader who is not an admin is told that lettering
 *               positions is an admin's job («Zagruzka fayli»'s catalog is
 *               admin-only).
 *   linkTo    – for an admin, the unit's «Zagruzka fayli» page, where the
 *               positions are lettered; null otherwise.
 *   together  – {ids, cells, items} when going TOGETHER could pass: the cells
 *               staying (ids + their codes as one string) and, on «Verifix
 *               sinxron», the suggestions to apply with it (`together_items`).
 *               Null for a split team or a cleared brigadir, where moving more
 *               cells along changes nothing.
 *
 * Null when `raw` is not a move refusal — the caller says its own error.
 */
export function cellMoveRefusalText(raw, { t, tx = (s) => s, tl, isAdmin = false } = {}) {
  if (!raw || typeof raw !== "object" || !MOVE_REFUSALS.includes(raw.code)) return null;
  const p = raw.params || {};
  const lines = p.lines || [];
  const count = p.count ?? lines.length;
  const shown = lines.slice(0, SHOWN).map((l) =>
    `«${tx(l.name || l.sap_code || "")}»${l.group ? ` (${l.group})` : ""}`);
  const rest = count - shown.length;
  const linesText = shown.join(", ") + (rest > 0 ? ` ${fill(t("cellMove.more"), { n: rest })}` : "");
  const staying = p.staying || [];
  const stayingText = staying.map((s) => wcGroupLabel(s.code, s.letter)).join(", ");
  const key = raw.code === "positions_need_unit" ? "cellMove.needUnit"
    : p.kind === "unlettered_cell" ? "cellMove.unletteredCell"
      : p.kind === "split" ? "cellMove.split" : "cellMove.shared";
  const body = fill(t(key), {
    cell: p.cell, code: p.code, count, lines: linesText, staying: stayingText,
    unit: (tl || tx)(p.unit_name || ""),
  });
  const items = p.together_items || [];
  // Never towards no brigadir: «together» there would clear the cells staying.
  const canTogether = raw.code === "shared_positions" && p.kind !== "split"
    && p.to_unit != null && (staying.length > 0 || items.length > 0);
  return {
    text: isAdmin ? body : `${body} ${t("cellMove.askAdmin")}`,
    linkTo: isAdmin && p.unit ? productionLink({ unit: p.unit, tab: "positions" }) : null,
    together: canTogether
      ? { ids: staying.map((s) => s.id), cells: staying.map((s) => s.code).join(", "), items }
      : null,
  };
}
