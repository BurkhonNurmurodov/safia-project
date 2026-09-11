"""A CODE is spelled in LATIN letters — THE definition.

SAP work centres (A1432, B2942), SKUs (F00000094) and every other code the
platform joins on are Latin. A keyboard on the Russian layout types a Cyrillic
А, В, Е, К, М, Н, О, Р, С, Т or Х that is drawn identically to its Latin twin
and is a DIFFERENT character to every comparison — so a code typed that way
looks right on every screen and matches nothing: not the SAP file, not the cell
register, not a search box. Found 2026-09-11: three of Suvonov Elshod OF's
catalog lines carried Команда «А1432 · А1435 · А1436» with a Cyrillic А and
never read the ПЛАН/ФАКТ the SAP file wrote under the Latin spelling.

`latin_code` sits on the doors a PERSON types a code through — the cell
register, the catalog sheet and the catalog's editors — so a stored code is
Latin by construction and every join stays a plain string comparison. The SAP
export is machine-written and is not passed through it.

It converts ONLY what is unmistakably a code spelled with twins, and returns
everything else untouched, which is what makes it safe on a column that
sometimes holds text:

  * the value must contain a DIGIT — «ТОРТ» is a word that happens to be made
    of twins, «Т1» is a code;
  * EVERY Cyrillic letter in it must have a twin — «Цех 1» is Russian text and
    stays Russian rather than turning into half-Latin nonsense.

The search twin is `frontend/src/utils/latinCode.js`; keep the letters in step.
"""
from __future__ import annotations

import re

# Cyrillic letter → the Latin letter it is drawn identically to. Upper case is
# what a code is typed in; of the lower-case letters only the ones that really
# are the same glyph are listed, so «к» or «м» — which are not — keep a value
# from being read as a code at all.
_TWINS = {
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "Ү": "Y", "І": "I",
    "Ј": "J", "Ѕ": "S",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "і": "i", "ј": "j", "ѕ": "s", "ү": "y",
}
_TABLE = str.maketrans(_TWINS)
_CYRILLIC = re.compile("[Ѐ-ԯ]")
_DIGIT = re.compile(r"\d")

# The SQL spelling of `_CYRILLIC` (a Postgres `~` pattern), for narrowing a
# table to the rows worth handing to `latin_code`. It matches any Cyrillic
# letter at all, so it is a SUPERSET of what gets converted — never the decision.
CYRILLIC_SQL = "[Ѐ-ԯ]"


def latin_code(value):
    """``value`` with every Cyrillic twin replaced by its Latin letter — or
    ``value`` itself, unchanged, when it is not a code spelled with twins (see
    the module docstring). ``None`` and non-strings pass straight through."""
    if not isinstance(value, str) or not _CYRILLIC.search(value):
        return value
    if not _DIGIT.search(value):
        return value
    out = value.translate(_TABLE)
    return value if _CYRILLIC.search(out) else out
