/**
 * Codes are LATIN — the search twin of backend `services/latin_code.py`.
 *
 * A Cyrillic «В» and a Latin «B» are drawn identically and are different
 * characters, so a code typed on the Russian layout («В2942») never found the
 * cell whose register says B2942, and nothing on screen said why.
 *
 * `latinFold` lower-cases a string and folds every Cyrillic letter that has a
 * Latin twin onto it. Applied to BOTH sides of a match it can only ever ADD
 * matches: the fold works per character, so text that contained the query
 * still does — «яблоки» still finds the workshop named with it — and a code
 * now matches whichever keyboard typed it.
 *
 * Deliberately broader than the backend rule: that one decides what is
 * WRITTEN, so it converts only a whole code; this one only decides whether two
 * strings match, so it folds every twin unconditionally.
 */
const TWINS = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p",
  с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ү: "y",
};
const TWIN_RE = /[авекмнорстухіјѕү]/g;

export function latinFold(text) {
  return String(text ?? "").toLowerCase().replace(TWIN_RE, (ch) => TWINS[ch]);
}
