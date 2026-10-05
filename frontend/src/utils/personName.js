// A person's DB name written surname-first with an optional patronymic
// («Radjapov Shuxrat Raxim O'g'li») → «R. Shuxrat»: enough to tell two people
// apart in a dense column or a chart axis, with the full spelling one hover
// away wherever the caller keeps it. Applied AFTER `tl()`, or the initial
// would be in a different script from the name standing beside it. A
// single-word name is left exactly as it is: there is no surname to shorten,
// and an initial on its own names nobody.
//
// ONE definition — the ARC register's owner columns and the ARC analysis
// charts both read it, and two spellings of «how a name shortens» is how a
// chart row and the table cell it drills into stop looking like one person.
//
// `nameCase` also writes an ALL-CAPS given name in ordinary case — Verifix
// spells every name in capitals, «ABDAKIMOV SARDOR …» → «A. Sardor»
// (/staff-live). A word already carrying a lowercase letter is left as typed.
const wordCase = (w) => (w === w.toUpperCase() && w !== w.toLowerCase()
  ? w.toLowerCase().replace(/(^|-)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  : w);
export const shortPerson = (name, { nameCase = false } = {}) => {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  const cased = (w) => (nameCase ? wordCase(w) : w);
  if (p.length < 2) return cased(p[0] || "");
  return `${p[0][0].toUpperCase()}. ${cased(p[1])}`;
};

// The other way round — the SURNAME kept whole and the given name down to an
// initial: «Ortiqova Mohlaroyim Ziodullo Qizi» → «Ortiqova M.». A phone's name
// column, where rows are sorted by surname and the surname is what tells two
// of them apart (/leaders' day calendar, /zagruzka's grids). Applied after
// `tl()`, and a single-word name is left as it is, like `shortPerson`.
export const surnameInitial = (name) => {
  const p = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || String(name ?? "");
  return `${p[0]} ${p[1][0].toUpperCase()}.`;
};

// Soft hyphens inside a VERY long word (13+ letters — longer than a name
// column holds on a 320px phone; at least four letters kept on each side), so
// it breaks WITH a visible hyphen instead of being cut or breaking silently,
// which turned «Abdurakhmonova» into «Abdurakhmono va…», i.e. «… and …».
// Shorter words get none: a hyphen is honoured greedily, so «Gulchehra» would
// split even where it fits a line of its own. Invisible wherever the word fits.
// (The «Smena hisoboti» board's name column and /worker-concerns' phone rows.)
const SHY = "\u00AD";
export const softHyphenate = (s) => String(s ?? "").replace(/\S{13,}/g, (w) => [...w]
  .map((ch, i, a) => (i >= 4 && a.length - i >= 4 ? SHY + ch : ch)).join(""));
