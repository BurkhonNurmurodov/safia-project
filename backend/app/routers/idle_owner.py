"""WHO owns which ojidaniya category — the admin register behind the
«Kutish mas'uli» role.

The reading surfaces are the ordinary ojidaniya pages: `/downtime` and
`/idle-cell`, both narrowed to the caller's own categories by
`services/idle_scope` on the server. A page of this role's own was built and
then withdrawn (2026-09-10, the operator's call) — narrowing the pages people
already know beat teaching them a second one. What is left here is the one
thing those pages cannot carry: the assignment itself.

**Admin-only and NOT grantable.** No capability exists for it, so
`capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
/ `logs` / `ltdaily` model. The assignment decides what a whole ROLE may read,
so handing it out is handing out the ability to widen somebody's scope.

The prefix stays `/api/idle-owner` even though only the admin half remains: it
names the SUBJECT (who owns a category), not a page, and the admin destination
already calls these two paths.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import Manager, RoleProfile
from app.permissions import require_page
from app.services import action_log, idle_scope

router = APIRouter(prefix="/api/idle-owner", tags=["idle-owner"])


def _verify_admin(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/admin/owners")
def list_owners(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime", "idle-cell")),
):
    """Every category and the person answerable for it, plus the profiles an
    admin may assign.

    Readable by anyone who can open the page — a name printed beside a category
    on four surfaces is not a secret, and hiding the register would only make
    those names unexplainable. WRITING is admin-only; see below.
    """
    labels = idle_scope.owner_labels(db)
    assigned = idle_scope.owners(db)
    rows = [{
        "category": c,
        "profile_key": assigned.get(c),
        "owner": labels.get(c),
    } for c in idle_scope.CATEGORIES]

    # The pick list. «Kutish mas'uli» profiles first because that is the role
    # the page exists for, then everybody else who could hold the answer — a
    # brigadir or a shift manager may perfectly well own a cause, and refusing
    # to offer them would make the register describe less than reality.
    people = [{
        "profile_key": f"{p.role}:{p.id}", "role": p.role, "id": p.id,
        "name": p.name, "name_uz_cyrl": p.name_uz_cyrl,
        "name_ru": p.name_ru, "name_en": p.name_en,
    } for p in db.query(RoleProfile).filter(
        RoleProfile.role.in_((idle_scope.OWNER_ROLE, "shift-manager", "top-manager"))
    ).order_by(RoleProfile.role, RoleProfile.name).all()]
    people += [{
        "profile_key": f"supervisor:{m.id}", "role": "supervisor", "id": m.id,
        "name": m.name, "name_uz_cyrl": None, "name_ru": None, "name_en": None,
    } for m in db.query(Manager).filter(Manager.archived.is_(False))
        .order_by(Manager.name).all()]

    return {"rows": rows, "people": people,
            "can_edit": payload.get("role") == "admin"}


class OwnerAssignBody(BaseModel):
    # A LIST, so one toggle and a bulk press are one call and one transaction —
    # the rule `PUT /admin/leader-tasks/cell-from` already keeps. A null
    # profile_key CLEARS that category.
    assignments: List[dict]


@router.put("/admin/owners")
def put_owners(
    request: Request,
    body: OwnerAssignBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime", "idle-cell")),
):
    """Assign or clear the owner of one or more categories.

    Checked here and not merely by hiding the control: the endpoint is
    reachable without the UI, and this is what decides which register a whole
    role may read.
    """
    _verify_admin(payload)

    actor = None
    try:
        actor = int(payload.get("sub"))
    except (TypeError, ValueError):
        pass

    before = idle_scope.owners(db)
    changed = []
    for a in body.assignments or []:
        cat = str((a or {}).get("category") or "")
        key = (a or {}).get("profile_key") or None
        if cat not in idle_scope.CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Unknown category: {cat}")
        if key:
            role, ref = identity.parse_profile_key(key)
            # A key naming nothing would store an owner no reader can resolve,
            # which prints as «nobody is assigned» while the register says
            # somebody is — the one state this table must not be able to hold.
            exists = (
                db.query(Manager).filter(Manager.id == ref).first() if role == "supervisor"
                else db.query(RoleProfile).filter(RoleProfile.id == ref,
                                                  RoleProfile.role == role).first()
            ) if ref else None
            if not exists:
                raise HTTPException(status_code=400, detail=f"Unknown profile: {key}")
        if before.get(cat) != key:
            changed.append((cat, before.get(cat), key))
        idle_scope.set_owner(db, cat, key, actor)
    db.commit()

    # `changes` is the old→new table the register renders — one line per
    # category that actually moved, so «why is Cat D3 mine now» is answerable
    # from «Jurnal» rather than from memory.
    action_log.enrich(
        target_kind="setting", target_id="idle_category_owners",
        details=[("changed", len(changed))],
        changes=[(c, w or "—", n or "—") for c, w, n in changed],
    )
    return {"rows": list_owners(db, payload)["rows"], "changed": len(changed)}
