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
