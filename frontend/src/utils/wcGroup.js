/**
 * A work centre's GROUP — the client twin of backend `services/wc_group.py`.
 *
 * Inside one unit several cells may stand at one SAP work centre (A2894 has six
 * on Ibragimova Sayyora's shift). Each carries a GROUP — one Latin capital
 * letter — and so do the catalog lines that group produces and the «Bugungi
 * fakt» typed for it. A (SAP code, group) names ONE cell of the unit.
 *
 * `normGroup` mirrors `norm_group`: blank is null; a Cyrillic twin typed on the
 * Russian layout («А», «В», «С» …, either case) IS the Latin letter; anything
 * that is not then exactly one letter A–Z is INVALID and comes back
 * `undefined` — so a form can tell «cleared» (null) from «refuse this»
 * (undefined). The server re-checks; this only lets the form say it first.
 *
 * `wcGroupLabel` is the one plain-text spelling — «A2894 · A», or the bare code
 * for something with no group. Tables show the code chip with the letter as a
 * small badge beside it; anything that has to be a string uses this.
 */
const TWINS = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P",
  С: "C", Т: "T", Х: "X", У: "Y", Ү: "Y", І: "I", Ј: "J", Ѕ: "S",
};

export const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function normGroup(value) {
  const s = String(value ?? "").trim().toUpperCase();
  if (!s) return null;
  const latin = [...s].map((ch) => TWINS[ch] ?? ch).join("");
  return /^[A-Z]$/.test(latin) ? latin : undefined;
}

export function wcGroupLabel(code, group) {
  const c = String(code ?? "").trim();
  return group ? `${c} · ${group}` : c;
}
