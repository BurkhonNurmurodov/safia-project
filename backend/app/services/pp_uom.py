"""«O'lchov birligi» — the unit a catalog line's quantities are counted in.

THE definition of the four options and the one normaliser. A catalog line on
«Zagruzka fayli» says what its ПЛАН and ФАКТ are counted in — kilograms, pieces
(«dona»), litres or cauldrons («qozon») — and `labor_time` is the seconds that
one of those costs, which is why the two sit side by side on the table.

Three things it deliberately is NOT:

  • **Not a daily fact.** A torte is counted in pieces every day of its life, so
    this is a property of the CATALOG LINE (`pp_products.uom`), edited by an
    admin and dated by `services/pp_catalog.py` like Трудоемкость or Команда —
    never the per-day overlay «Kontiner krishka» beside it, which answers a
    question about one shift. CLAUDE.md states the rule the other way round for
    that column: "a constant would be a catalog field".

  • **Not part of the line's identity.** `pp_calc.line_keys` and `line_ident`
    key a line by its name and Трудоемкость, so changing the unit moves no
    stored quantity and needs no carry.

  • **Not read by any figure.** Nothing converts, sums or compares across units:
    a line's minutes are still Трудоемкость × quantity ÷ 60 whatever this says.
    It is a REGISTER — what the number on screen means — exactly as
    `cells.one_process` is a register. Making a загрузка figure read it would
    move numbers on every page at once and needs the operator's decision first.

Why `uom` and not `unit`: everywhere else in this codebase a "unit" is a
BRIGADIR's unit (`manager_id`, `unit_id`, `_unit_cells_on`), and the action
log's own catalog record already spends the detail key «unit» on it. The
standard ERP spelling keeps the two apart at every call site.
"""

from typing import Optional


class InvalidUom(ValueError):
    """What the caller must print: a value outside the four options."""


# The four the operator named (2026-10-24), in the order every picker lists
# them. A fifth is one entry here plus its four `production.uom.*` strings —
# nothing else reads the list, because nothing else may hold a copy of it.
UOMS: tuple[str, ...] = ("kg", "dona", "litr", "qozon")

# Cyrillic twins of the stored keys, so a value typed on a Russian keyboard
# against the API (the endpoints are reachable without the form) is understood
# rather than refused. The form itself only ever sends a key.
_ALIASES = {
    "кг": "kg", "кг.": "kg",
    "дона": "dona", "шт": "dona", "шт.": "dona", "штука": "dona", "pcs": "dona",
    "литр": "litr", "л": "litr", "л.": "litr", "liter": "litr", "litre": "litr",
    "қозон": "qozon", "казан": "qozon", "qozon": "qozon", "козон": "qozon",
}


def norm_uom(value: Optional[str]) -> Optional[str]:
    """One of `UOMS`, or None for «not stated».

    Blank, None and whitespace all answer None — a line nobody has told the
    platform about is NOT silently given a default, because «kg» guessed onto a
    cake is worse on screen than a dash that says nothing. Anything else that is
    not one of the four raises, so a mis-built request is a 400 naming the
    options rather than a value no reader can decode.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    low = s.lower()
    low = _ALIASES.get(low, low)
    if low not in UOMS:
        raise InvalidUom(f"«{s}» — unit must be one of: {', '.join(UOMS)}")
    return low
