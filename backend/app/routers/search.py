"""The header search («Qidiruv», components/layout/GlobalSearch.jsx).

ONE read: everything the search box can find that the browser does not
already hold — the cells, the brigadirs' units and the leaders — as a small
index the page filters as somebody types. Pages and admin tabs are found on
the client (the sidebar's own list and `config/adminNav.js`), because which of
them a viewer may open is already decided there.

Why an index and not a query per keystroke: the whole plant is a few hundred
rows (~300 cells, ~30 units, ~200 leaders), so one request, cached by the
page, answers every keystroke at once and keeps working offline; and the
matching rule — Cyrillic and Latin spellings, a code typed on the Russian
layout — lives in ONE place (utils/searchFold.js), not two.

Scope is the PLANT lock (`factory_scope.scoped_manager_ids`): a supervisor, a
leader and a shift-manager find their own plant's cells and people, an admin
and a top-manager everybody's. Nothing here is more than the platform already
shows those viewers (the brigadir pickers, the cell links); it only puts it
behind one box. Archived units and archived cells are left out, as they are
from every other list. A cell is labelled by its CODE (CLAUDE.md «A cell is
its CODE»): the workshop names ride along ONLY so typing «яблоки» still finds
1612, exactly as the /cells search does — the client never prints them.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, Manager, RoleProfile
from app.security import require_auth
from app.services.factory_scope import empty_scope, scoped_manager_ids

router = APIRouter(prefix="/api/search", tags=["search"])


def _names(*vals) -> list[str]:
    """Distinct non-blank spellings, in order — what the box matches against."""
    out: list[str] = []
    for v in vals:
        if isinstance(v, (list, tuple)):
            items = v
        else:
            items = [v]
        for s in items:
            s = (s or "").strip() if isinstance(s, str) else ""
            if s and s not in out:
                out.append(s)
    return out


@router.get("/index")
def search_index(db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    scope: Optional[list[int]] = scoped_manager_ids(db, payload, None)
    if empty_scope(scope):
        return {"cells": [], "units": [], "leaders": []}
    allowed = None if scope is None else set(scope)

    def in_scope(mid) -> bool:
        # A row with no unit belongs to no plant: shown only to a viewer the
        # plant does not narrow (the factory rule — «All factories» only).
        if allowed is None:
            return True
        return mid is not None and mid in allowed

    units = (
        db.query(Manager.id, Manager.name, Manager.shift, Manager.factory_id, Manager.name_aliases)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    unit_rows = [u for u in units if in_scope(u.id)]
    unit_name = {u.id: u.name for u in units}

    leaders = (
        db.query(RoleProfile.id, RoleProfile.name, RoleProfile.name_uz_cyrl,
                 RoleProfile.name_ru, RoleProfile.name_en, RoleProfile.name_aliases,
                 RoleProfile.manager_id)
        .filter(RoleProfile.role == "leader")
        .order_by(RoleProfile.name)
        .all()
    )
    leader_name = {l.id: l.name for l in leaders}

    cells = (
        db.query(Cell.id, Cell.verifix_code, Cell.sap_code, Cell.wc_group,
                 Cell.name_workshop_uz, Cell.name_workshop_uz_cyrl,
                 Cell.name_workshop_ru, Cell.name_workshop_en,
                 Cell.manager_id, Cell.leader_id)
        .filter(Cell.archived_at.is_(None))
        .order_by(Cell.verifix_code)
        .all()
    )
    cell_rows = [c for c in cells if in_scope(c.manager_id)]

    # The cells each leader RUNS («Boshqaruvchi»), for the leader's result line
    # and its link — counted over the whole register, so a leader of this
    # plant whose cell stands in another unit still names it.
    runs: dict[int, list[dict]] = {}
    runs_here: set[int] = set()
    for c in cells:
        if c.leader_id is not None:
            runs.setdefault(c.leader_id, []).append({"id": c.id, "code": c.verifix_code})
            if in_scope(c.manager_id):
                runs_here.add(c.leader_id)

    return {
        "cells": [
            {
                "id": c.id,
                "code": c.verifix_code,
                "sap": c.sap_code,
                "group": c.wc_group,
                "leader": leader_name.get(c.leader_id),
                "unit_id": c.manager_id,
                "unit": unit_name.get(c.manager_id),
                # Search only — never a label (see the module docstring).
                "names": _names(c.name_workshop_ru, c.name_workshop_uz,
                                c.name_workshop_uz_cyrl, c.name_workshop_en),
            }
            for c in cell_rows
        ],
        "units": [
            {
                "id": u.id,
                "name": u.name,
                "shift": u.shift,
                "factory_id": u.factory_id,
                "aliases": _names(u.name_aliases if isinstance(u.name_aliases, list) else []),
            }
            for u in unit_rows
        ],
        "leaders": [
            {
                "id": l.id,
                "name": l.name,
                "names": _names(l.name_uz_cyrl, l.name_ru, l.name_en,
                                l.name_aliases if isinstance(l.name_aliases, list) else []),
                "unit_id": l.manager_id,
                "unit": unit_name.get(l.manager_id),
                "cells": runs.get(l.id, []),
            }
            for l in leaders
            if in_scope(l.manager_id) or l.id in runs_here
        ],
    }
