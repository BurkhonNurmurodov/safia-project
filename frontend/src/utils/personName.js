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
export const shortPerson = (name) => {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || "";
  return `${p[0][0].toUpperCase()}. ${p[1]}`;
};
