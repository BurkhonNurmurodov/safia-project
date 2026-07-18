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

# Cross-person sheet-name pins for the SOURCE / shift-report pipelines
# (production, downtime, workers, brigadirs). Unlike the ru/uz_cyrl display
# overrides — which are just other spellings of the SAME brigadir — these
# deliberately fold one person's sheet rows onto a DIFFERENT platform unit's
# canonical name. Keyed by the EXACT «Бригадир ФИО» text the sheets carry
# (read_downtime_data matches it verbatim). The QA register has its own
# equivalent below in _OVERRIDES / supervisor_match.
_SHEET_NAME_PINS = {
    "Файзуллаева Малика": "Murodali Ochilov",
}


def sheet_alias_map(db: Session, names: Iterable[str]) -> dict[str, str]:
    """Return ``{sheet_spelling: canonical_name}`` covering every known spelling
    of the given canonical manager names: the canonical name itself plus its
    ru/uz_cyrl display overrides, and any cross-person pins (see
    ``_SHEET_NAME_PINS``). Sheet rows in either alphabet resolve to the same
    canonical ``Manager.name``."""
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
    # Cross-person pins: resolve each target to whichever canonical spelling this
    # manager set actually holds (order/alphabet-tolerant, so a Latin/Cyrillic or
    # surname-first profile name still matches), and skip a pin whose unit isn't
    # in this set — those rows simply stay unmatched, exactly as before.
    canon_by_norm: dict[str, str] = {}
    for n in canon:
        canon_by_norm.setdefault(" ".join(sorted(_name_tokens(n))), n)
    for spelling, target in _SHEET_NAME_PINS.items():
        resolved = canon_by_norm.get(" ".join(sorted(_name_tokens(target))))
        if resolved:
            alias[spelling] = resolved
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
    disagree on. ZH→J matters most: the transliterator writes ж the Russian way
    (Санжар → Sanzhar) while the sheet types it the Uzbek way (SANJARBEK)."""
    s = transliterate(name or "", "uz").upper()
    s = re.sub(r"[ʻ'’‘`´]", "", s)
    s = re.sub(r"\b(O\s*G\s*LI|OGLI|QIZI|UGLI|O\s*G\s*L)\b", " ", s)
    s = (s.replace("KH", "X").replace("ZH", "J").replace("DJ", "J")
          .replace("H", "X").replace("YO", "O").replace("YE", "E")
          .replace("Y", "I").replace("W", "V").replace("Q", "K"))
    return [t for t in re.sub(r"[^A-Z]", " ", s).split() if len(t) > 1]


def _skeleton(word: str) -> str:
    """Consonant skeleton — the last resort for surnames whose vowels drift
    between sources (O'ROZOV vs Уразов → RZV)."""
    return "".join(c for c in word if c not in _VOWELS)


def _pair_score(sheet: list[str], canon: list[str]) -> float:
    """0 when the two names can't be the same person, else how well they agree.
    Never a hit on the surname alone: 'SULTONOV ABROR' and 'Султонова Умида'
    share a surname stem and are two different people."""
    if len(sheet) < 2 or len(canon) < 2:
        return 0.0
    s_sur, s_first = sheet[0], sheet[1]
    c_sur, c_first = canon[0], canon[1]

    sur = difflib.SequenceMatcher(None, s_sur, c_sur).ratio()
    first = difflib.SequenceMatcher(None, s_first, c_first).ratio()

    sur_ok = sur >= 0.75 or _skeleton(s_sur) == _skeleton(c_sur)   # O'ROZOV ≡ Уразов
    # A clear short-form prefix counts as a full first-name hit (SANJAR ⊂ SANJARBEK).
    prefix = (min(len(s_first), len(c_first)) >= 4
              and (s_first.startswith(c_first) or c_first.startswith(s_first)))
    first_ok = first >= 0.70 or prefix
    if not (sur_ok and first_ok):
        return 0.0
    return 0.5 * sur + 0.5 * (1.0 if prefix else first)


def _norm(name: str) -> str:
    """The folded token skeleton used as a lookup key on both sides of a match."""
    return " ".join(_name_tokens(name))


# ─── Manual sheet-name → unit overrides ──────────────────────────────────────
# Real cases the fuzzy scorer above can't handle:
#   • the register names someone in a form unrelated to their unit's profile
#     name — "XAYRULLO O'G'LI ХABIBULLO" is the unit shown as "Suvonov Elshod OF",
#     which scores 0 against it and would drop every one of that unit's rows;
#   • two units share the same surname+first name, so every candidate ties on
#     the two-token score and iteration order alone would decide the winner —
#     "SUVONOV ELSHOD VALIJON O'G'LI" scores 1.0 for BOTH "Suvonov Elshod" and
#     "Suvonov Elshod OF" and must be pinned to the former;
#   • the register attributes a whole unit's complaints to an entirely different
#     person's name — "FAYZULLAYEVA MALIKA ABDUMANNOB QIZI" is the unit shown as
#     "Murodali Ochilov" (shares no tokens, so the scorer can never reach it).
# Keyed and valued on the folded skeleton (via _norm) so alphabet/spelling drift
# on either the sheet or the profile name still resolves.
_OVERRIDES = {
    _norm(sheet): _norm(unit)
    for sheet, unit in {
        "SUVONOV ELSHOD VALIJON O'G'LI": "Suvonov Elshod",
        "XAYRULLO O'G'LI ХABIBULLO": "Suvonov Elshod OF",
        "FAYZULLAYEVA MALIKA ABDUMANNOB QIZI": "Murodali Ochilov",
    }.items()
}


def supervisor_match(managers: Iterable, names: Iterable[str]) -> dict[str, dict]:
    """Map each sheet name to the supervisor unit it belongs to.

    Returns ``{sheet_name: {"name": canonical, "id": manager_id, "shift": n}}``,
    skipping every name that isn't one of the given managers (the register is
    full of them). Resolved per request rather than baked into the synced rows,
    so renaming a unit in the Profiles tab takes effect without a re-sync.
    """
    canon = [(m, _name_tokens(m.name)) for m in managers]
    by_norm = {" ".join(ctok): m for m, ctok in canon}
    # Token-order-insensitive index, used only to resolve a pinned override unit
    # (see _OVERRIDES): the Profiles tab may store a name surname-first or
    # first-first, and a hand-written pin shouldn't have to guess which.
    by_sorted = {" ".join(sorted(ctok)): m for m, ctok in canon}
    out: dict[str, dict] = {}
    for raw in names:
        if not raw:
            continue
        tokens = _name_tokens(raw)
        if len(tokens) < 2:            # "Технологи", "IT отдел", "АХО" …
            continue
        # Explicit override wins over the score when the register spelling can't
        # be reached by fuzzy matching (see _OVERRIDES). Falls through to the
        # scorer when the pinned unit isn't in this manager set.
        forced = _OVERRIDES.get(" ".join(tokens))
        if forced:
            m = by_norm.get(forced) or by_sorted.get(" ".join(sorted(forced.split())))
            if m is not None:
                out[raw] = {"name": m.name, "id": m.id, "shift": m.shift}
                continue
        # Best candidate, not the first acceptable one: two supervisors can both
        # clear the bar (TALIPOVA MAMURA also half-resembles Арипова Манзура),
        # and the register hands those rows to the wrong unit if order decides.
        best, best_score = None, 0.0
        for m, ctok in canon:
            score = _pair_score(tokens, ctok)
            if score > best_score:
                best, best_score = m, score
        if best is not None:
            out[raw] = {"name": best.name, "id": best.id, "shift": best.shift}
    return out
