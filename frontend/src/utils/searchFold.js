/**
 * How the header search (components/layout/GlobalSearch.jsx) decides that
 * what somebody typed names a thing — THE fold, applied to BOTH sides.
 *
 * The platform holds one person under several spellings (Latin and Cyrillic,
 * «Xolmatov» / «Холматов» / «Kholmatov»), and a code may be typed on the
 * Russian layout («В2942» for B2942). Per word:
 *   - a word with a DIGIT is a code: lower-cased, Cyrillic twins folded onto
 *     Latin (`latinFold`, the /cells search rule) — «В2942» is b2942;
 *   - any other word is transliterated to Uzbek Latin, lower-cased, stripped
 *     of apostrophes, and the letters the alphabets disagree on are merged:
 *     kh / x → h, q → k, ye → e, yo → o. Looser than any spelling rule on
 *     purpose — it decides only whether two strings MATCH, never what is shown.
 */
import { transliterate } from "./transliterate";
import { latinFold } from "./latinCode";

const APOS = /[ʻʼ'‘’`´]/g;

function foldWord(word) {
  if (/\d/.test(word)) return latinFold(word);
  return latinFold(transliterate(word, "uz").toLowerCase().replace(APOS, ""))
    .replace(/kh/g, "h").replace(/x/g, "h").replace(/q/g, "k")
    .replace(/ye/g, "e").replace(/yo/g, "o");
}

export function searchFold(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).map(foldWord).join(" ");
}

/**
 * How well a folded query names an item whose folded terms are `terms` — the
 * first term is the item's own label (a page's name, a cell's code, a
 * person's name), the rest are other spellings it answers to. 0 = no match:
 * every word of the query must appear somewhere in the item.
 */
export function matchScore(query, terms) {
  if (!query) return 0;
  const words = query.split(" ");
  const hay = terms.join(" | ");
  if (!words.every((w) => hay.includes(w))) return 0;
  let best = 1;
  terms.forEach((term, i) => {
    if (!term) return;
    const bonus = i === 0 ? 5 : 0;
    let s = 0;
    if (term === query) s = 100;
    else if (term.startsWith(query)) s = 60;
    else if (term.split(/[\s|·,()\-/]+/).some((w) => w.startsWith(query))) s = 40;
    else if (term.includes(query)) s = 20;
    if (s) best = Math.max(best, s + bonus);
  });
  return best;
}
