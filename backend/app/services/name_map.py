"""name_map.py — resolve the name each brigadir/unit is listed under in the
source Google Sheets.

The Verifix-linked ``Manager.name`` is the canonical (Latin, "uz") name shown in
the admin Profiles tab. The production / headcount / downtime source sheets list
those same brigadirs in Cyrillic, so exact matching on ``Manager.name`` breaks
once an admin renames a profile to Latin. Admins keep the two aligned by setting
the profile's **uz_cyrl** display override to the exact sheet spelling, so that
override is what sheet rows are matched against — falling back to the canonical
name when no override exists (best effort; Latin→Cyrillic can't be derived)."""

from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Translation


def sheet_name_map(db: Session, names: Iterable[str]) -> dict[str, str]:
    """Return ``{canonical_name: sheet_name}`` for the given canonical manager
    names, using each profile's uz_cyrl display override as the sheet name."""
    canon = {n for n in names if n}
    if not canon:
        return {}
    key_to_canon = {f"name.{n}": n for n in canon}
    overrides = {
        key_to_canon[t.key]: t.value.strip()
        for t in db.query(Translation).filter(
            Translation.lang == "uz_cyrl",
            Translation.key.in_(list(key_to_canon.keys())),
        ).all()
        if t.value and t.value.strip()
    }
    return {n: overrides.get(n, n) for n in canon}
