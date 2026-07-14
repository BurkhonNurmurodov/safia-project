"""name_map.py — resolve which ``Manager`` a source-sheet row belongs to.

The Verifix-linked ``Manager.name`` is the canonical (Latin, "uz") name shown in
the admin Profiles tab. The production / headcount / downtime source sheets list
those same brigadirs inconsistently — some rows in Cyrillic, some in Latin, and
the sheets can even disagree with each other for the same person. Admins record
the Cyrillic spelling as the profile's **ru** (and/or **uz_cyrl**) display
override.

So instead of picking one spelling to match against, we accept *every* known
spelling of a brigadir — the canonical Latin name plus its Cyrillic overrides —
and map them all back to the single canonical name the app keys everything by."""

from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Translation

# Display overrides that may carry a Cyrillic sheet spelling of a brigadir's name.
SHEET_LANGS = ("ru", "uz_cyrl")


def sheet_alias_map(db: Session, names: Iterable[str]) -> dict[str, str]:
    """Return ``{sheet_spelling: canonical_name}`` covering every known spelling
    of the given canonical manager names: the canonical name itself plus its
    ru/uz_cyrl display overrides. Sheet rows in either alphabet resolve to the
    same canonical ``Manager.name``."""
    canon = {n for n in names if n}
    if not canon:
        return {}
    alias = {n: n for n in canon}  # canonical spelling maps to itself
    key_to_canon = {f"name.{n}": n for n in canon}
    for t in db.query(Translation).filter(
        Translation.lang.in_(SHEET_LANGS),
        Translation.key.in_(list(key_to_canon.keys())),
    ).all():
        val = (t.value or "").strip()
        if val:
            alias[val] = key_to_canon[t.key]
    return alias


# ─── Passport-style names → supervisor units ─────────────────────────────────
#
# The quality register names the responsible person in full passport form
# ("ABDUKARIMOV SANJARBEK XAYRULLA O'G'LI"), while a Manager (supervisor unit)
# carries the short canonical name from the Profiles tab ("Абдукаримов Санжар"),
# usually in Cyrillic. So a match has to survive three gaps at once:
#
#   alphabet   Cyrillic ↔ Latin        (Хакимов / XAKIMOV)
#   spelling   the sheet's own drift   (Эргашев / ERGASHOV, Уразов / O'ROZOV)
#   form       short vs full name      (Санжар / SANJARBEK ... O'G'LI)
#
# The register also names plenty of people who are NOT supervisors (technologists,
# IT, logistics, individual leaders) — those must stay unmatched, so the rules
# below are deliberately strict on the FIRST name. Surnames alone are treacherous:
# "SULTONOV ABROR" and "Султонова Умида" share a surname stem but are two
# different people, and one of them owns 1,287 rows.

import difflib
import re

from app.translit import transliterate

_VOWELS = "AEIOU"


def _name_tokens(name: str) -> list[str]:
    """Fold a name onto a comparable Latin skeleton: transliterate, drop the
    Uzbek patronymic suffixes, and normalize the letter pairs the two sources
    disagree on (KH/X/H, YO/O, Y/I, J/DJ)."""
    s = transliterate(name or "", "uz").upper()
    s = re.sub(r"[ʻ'’‘`´]", "", s)
    s = re.sub(r"\b(O\s*G\s*LI|OGLI|QIZI|UGLI|O\s*G\s*L)\b", " ", s)
    s = (s.replace("KH", "X").replace("H", "X").replace("YO", "O")
          .replace("YE", "E").replace("Y", "I").replace("DJ", "J").replace("W", "V"))
    return [t for t in re.sub(r"[^A-Z]", " ", s).split() if len(t) > 1]


def _skeleton(word: str) -> str:
    """Consonant skeleton — the last resort for surnames whose vowels drift
    between sources (O'ROZOV vs Уразов → RZV)."""
    return "".join(c for c in word if c not in _VOWELS)


def _same_person(sheet: list[str], canon: list[str]) -> bool:
    if len(sheet) < 2 or len(canon) < 2:
        return False
    s_sur, s_first = sheet[0], sheet[1]
    c_sur, c_first = canon[0], canon[1]

    sur_ok = (difflib.SequenceMatcher(None, s_sur, c_sur).ratio() >= 0.75
              or _skeleton(s_sur) == _skeleton(c_sur))
    # The first name is what tells two same-surname people apart, so accept it
    # only on a strong match or a clear short-form prefix (SANJAR ⊂ SANJARBEK).
    first_ok = (difflib.SequenceMatcher(None, s_first, c_first).ratio() >= 0.70
                or (min(len(s_first), len(c_first)) >= 4
                    and (s_first.startswith(c_first) or c_first.startswith(s_first))))
    return sur_ok and first_ok


def supervisor_match(managers: Iterable, names: Iterable[str]) -> dict[str, dict]:
    """Map each sheet name to the supervisor unit it belongs to.

    Returns ``{sheet_name: {"name": canonical, "id": manager_id, "shift": n}}``,
    skipping every name that isn't one of the given managers (the register is
    full of them). Resolved per request rather than baked into the synced rows,
    so renaming a unit in the Profiles tab takes effect without a re-sync.
    """
    canon = [(m, _name_tokens(m.name)) for m in managers]
    out: dict[str, dict] = {}
    for raw in names:
        if not raw:
            continue
        tokens = _name_tokens(raw)
        if len(tokens) < 2:            # "Технологи", "IT отдел", "АХО" …
            continue
        for m, ctok in canon:
            if _same_person(tokens, ctok):
                out[raw] = {"name": m.name, "id": m.id, "shift": m.shift}
                break
    return out
