"""
Resolve the raw cell / work-center code strings that other tables store against
the canonical `cells` registry (models.Cell), so pages can show the platform's
workshop name and owning leader next to (or instead of) a bare code.

Two disjoint code namespaces live in the plant's data:
  * Verifix codes    — 4-digit strings ("0822")  → cells.verifix_code
  * SAP work centers — letter+4-digit ("A1431")   → cells.sap_code
Never cross them: a work center will not match verifix_code and vice-versa.

Matching is whitespace/case-insensitive because cells.sap_code is hand-entered
free text (only .strip()ed) and the quality register mixes zero-padded and bare
spellings of verifix codes ("0111" vs "113"). cells.sap_code is nullable and NOT
unique, so a lookup keeps the first row per key (cells ordered by verifix_code);
any unmatched code resolves to None and the caller keeps the raw string.

sap_code is currently populated only by hand via the admin Cells tab (the bulk
seed fills verifix_code only), so the SAP-side maps are empty until admins fill
those codes — the enrichment is correct plumbing that lights up as data lands.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.models import Cell, RoleProfile

# UI language code → the Cell column holding that language's workshop name.
_WS_COL = {
    "uz": "name_workshop_uz",
    "uz_cyrl": "name_workshop_uz_cyrl",
    "ru": "name_workshop_ru",
    "en": "name_workshop_en",
}
# Fallback order when the viewer language has no name filled in.
_LANGS = ("ru", "uz", "uz_cyrl", "en")


def _norm(code) -> str:
    """Common normal form for matching: whitespace stripped, upper-cased."""
    return re.sub(r"\s+", "", str(code or "")).upper()


def _leader_names(db: Session) -> dict[int, str]:
    rows = (
        db.query(RoleProfile.id, RoleProfile.name)
        .filter(RoleProfile.role == "leader")
        .all()
    )
    return {r.id: r.name for r in rows}


def _cell_dict(c: Cell, leader: str | None) -> dict:
    """Compact, JSON-ready projection of a cell row for API enrichment. Short
    per-language keys keep it light when embedded in large payloads."""
    return {
        "id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        "uz": c.name_workshop_uz,
        "uz_cyrl": c.name_workshop_uz_cyrl,
        "ru": c.name_workshop_ru,
        "en": c.name_workshop_en,
        "leader": leader,
    }


def by_verifix(db: Session, with_leader: bool = False) -> dict[str, dict]:
    """{normalized verifix code → cell dict}. Codes are keyed both zero-padded
    (authoritative) and zero-stripped (alias) so '0822' and '822' both resolve."""
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    leaders = _leader_names(db) if with_leader else {}
    out: dict[str, dict] = {}
    for c in cells:                       # pass 1 — exact, zero-padded keys win
        key = _norm(c.verifix_code)
        if key:
            out.setdefault(key, _cell_dict(c, leaders.get(c.leader_id)))
    for c in cells:                       # pass 2 — zero-stripped aliases fill gaps
        key = _norm(c.verifix_code)
        alias = key.lstrip("0")
        if key and alias:
            out.setdefault(alias, out[key])
    return out


def by_sap(db: Session, with_leader: bool = False) -> dict[str, dict]:
    """{normalized SAP work-center code → cell dict} over cells that carry one."""
    cells = (
        db.query(Cell)
        .filter(Cell.sap_code.isnot(None))
        .order_by(Cell.verifix_code)
        .all()
    )
    leaders = _leader_names(db) if with_leader else {}
    out: dict[str, dict] = {}
    for c in cells:
        key = _norm(c.sap_code)
        if key:
            out.setdefault(key, _cell_dict(c, leaders.get(c.leader_id)))
    return out


def resolve_verifix(table: dict[str, dict], code) -> dict | None:
    """Look a verifix-family code up in a by_verifix() table (raw then zero-stripped)."""
    n = _norm(code)
    if not n:
        return None
    return table.get(n) or table.get(n.lstrip("0"))


def resolve_sap(table: dict[str, dict], code) -> dict | None:
    """Look a SAP work-center code up in a by_sap() table."""
    n = _norm(code)
    return table.get(n) if n else None


def workshop_name(cell: dict | None, lang: str = "ru") -> str | None:
    """Pick the workshop name for the viewer language, falling back across the
    other languages so a partially-filled cell still shows something."""
    if not cell:
        return None
    for l in (lang, *_LANGS):
        v = cell.get(l)
        if v:
            return v
    return None
