"""
Factories (plants) — the register, the supervisor→factory assignment, and the
two settings that decide how the factory tabs open.

Read (`GET /api/factories`) is open to any approved session: every one of the
six factory-aware pages needs the tab strip, and the payload already tells the
caller what they are allowed to do with it (`locked_factory_id`). Writes need
admin or ``admin.factories.manage``.

The write endpoints are deliberately small and total — create, update, archive,
reorder, assign, settings — because the factory dimension is load-bearing:
moving one supervisor moves that unit's rows between tabs on six pages at once,
so there must be exactly one place that does it.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.capabilities import CAP_FACTORIES_MANAGE, require_cap
from app.database import get_db
from app.models import AppSetting, Factory, Manager
from app.security import require_auth
from app.services import action_log
from app.services.factory_scope import (
    DEFAULT_FACTORY_SETTING, FACTORY_ALL_TAB_SETTING,
    all_tab_enabled, default_factory_id, list_factories, serialize,
    viewer_factory_id,
)

router = APIRouter(prefix="/api/factories", tags=["factories"])

_admin = require_cap(CAP_FACTORIES_MANAGE)


class FactoryIn(BaseModel):
    code: str
    name_uz: Optional[str] = None
    name_uz_cyrl: Optional[str] = None
    name_ru: Optional[str] = None
    name_en: Optional[str] = None
    sort_order: Optional[int] = None
    archived: Optional[bool] = None


class AssignIn(BaseModel):
    """Move supervisor units to a factory. ``factory_id=None`` unassigns, which
    parks the units on «All factories» until someone decides where they live."""
    manager_ids: list[int]
    factory_id: Optional[int] = None


class SettingsIn(BaseModel):
    # "all" → the combined tab is the landing view; an int → that factory.
    default_factory: Optional[str] = None
    all_tab: Optional[bool] = None


class ReorderIn(BaseModel):
    order: list[int]


def _fname(f: Optional[Factory]) -> Optional[str]:
    """Display name for the log, ru-first — the same fallback every DB-held
    name uses. Snapshotted at the moment of the action, never re-derived."""
    if not f:
        return None
    return f.name_ru or f.name_uz or f.name_en or f.name_uz_cyrl or f.code


def _get(db: Session, factory_id: int) -> Factory:
    f = db.query(Factory).filter(Factory.id == factory_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Factory not found")
    return f


@router.get("")
def get_factories(db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    """The tab strip's whole input, in one call.

    ``locked_factory_id`` is the contract with the frontend: non-null means this
    viewer is pinned to one plant and the UI must render a static context chip
    instead of a switcher. The backend enforces the same pin regardless (see
    services/factory_scope.resolve_factory) — the field exists so the UI can
    stop offering a choice that would be silently overruled.
    """
    rows = list_factories(db)
    locked = viewer_factory_id(db, payload)
    return {
        "factories": [serialize(f) for f in rows],
        "default_factory_id": default_factory_id(db),
        # Whether the admin left the combined tab on. Always forced off for a
        # locked viewer: «All» would show them plants they may not read.
        "all_tab": all_tab_enabled(db) and locked is None,
        "locked_factory_id": locked,
        "can_manage": payload.get("role") == "admin",
    }


@router.get("/admin")
def admin_factories(db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """The register plus every supervisor unit and where it currently sits —
    one payload, so the assignment screen never has to correlate two fetches.

    Archived factories are included here (and only here): an admin must be able
    to see and un-archive them.
    """
    managers = (
        db.query(Manager)
        .order_by(Manager.archived, Manager.shift, Manager.name)
        .all()
    )
    counts: dict[int, int] = {}
    for m in managers:
        if m.factory_id and not m.archived:
            counts[m.factory_id] = counts.get(m.factory_id, 0) + 1
    return {
        "factories": [
            {**serialize(f), "manager_count": counts.get(f.id, 0)}
            for f in list_factories(db, include_archived=True)
        ],
        "managers": [
            {"id": m.id, "name": m.name, "shift": m.shift,
             "archived": m.archived, "factory_id": m.factory_id}
            for m in managers
        ],
        "default_factory": (
            str(default_factory_id(db)) if default_factory_id(db) is not None else "all"
        ),
        "all_tab": all_tab_enabled(db),
    }


@router.post("")
def create_factory(body: FactoryIn, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code required")
    if db.query(Factory).filter(Factory.code == code).first():
        raise HTTPException(status_code=409, detail="A factory with this code already exists")
    last = db.query(Factory).order_by(Factory.sort_order.desc()).first()
    f = Factory(
        code=code,
        name_uz=(body.name_uz or "").strip() or None,
        name_uz_cyrl=(body.name_uz_cyrl or "").strip() or None,
        name_ru=(body.name_ru or "").strip() or None,
        name_en=(body.name_en or "").strip() or None,
        sort_order=body.sort_order if body.sort_order is not None
        else ((last.sort_order + 1) if last else 0),
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    action_log.enrich(
        target_kind="factory", target_id=f.id, target_name=_fname(f),
        details=[("code", f.code), ("name", _fname(f))],
    )
    return serialize(f)


@router.put("/{factory_id}")
def update_factory(factory_id: int, body: FactoryIn,
                   db: Session = Depends(get_db), _: dict = Depends(_admin)):
    f = _get(db, factory_id)
    old = {"code": f.code, "name": f.name_ru, "name_uz": f.name_uz,
           "name_uz_cyrl": f.name_uz_cyrl, "name_en": f.name_en,
           "sort_order": f.sort_order, "archived": bool(f.archived)}
    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code required")
    clash = db.query(Factory).filter(Factory.code == code, Factory.id != factory_id).first()
    if clash:
        raise HTTPException(status_code=409, detail="A factory with this code already exists")
    f.code = code
    f.name_uz = (body.name_uz or "").strip() or None
    f.name_uz_cyrl = (body.name_uz_cyrl or "").strip() or None
    f.name_ru = (body.name_ru or "").strip() or None
    f.name_en = (body.name_en or "").strip() or None
    if body.sort_order is not None:
        f.sort_order = body.sort_order
    if body.archived is not None:
        f.archived = bool(body.archived)
    new = {"code": f.code, "name": f.name_ru, "name_uz": f.name_uz,
           "name_uz_cyrl": f.name_uz_cyrl, "name_en": f.name_en,
           "sort_order": f.sort_order, "archived": bool(f.archived)}
    db.commit()
    action_log.enrich(
        target_kind="factory", target_id=factory_id, target_name=_fname(f),
        details=[("code", new["code"])],
        changes=[(k, old[k], new[k]) for k in old if old[k] != new[k]],
    )
    return serialize(f)


@router.delete("/{factory_id}", status_code=204)
def delete_factory(factory_id: int, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """Delete only while empty. A factory holding units is archived instead —
    the same rule supervisor units follow, and for the same reason: deleting it
    would orphan every row those units own on six pages.
    """
    f = _get(db, factory_id)
    name, code = _fname(f), f.code
    held = db.query(Manager).filter(Manager.factory_id == factory_id).count()
    if held:
        raise HTTPException(
            status_code=409,
            detail=f"{held} supervisor(s) still belong to this factory — move them first, or archive it.",
        )
    # Drop a default that pointed HERE — compared against the stored raw value,
    # not default_factory_id(), which already reconciles away a dead id and so
    # would never report the factory being deleted.
    row = db.query(AppSetting).filter_by(key=DEFAULT_FACTORY_SETTING).first()
    if row and (row.value or "").strip() == str(factory_id):
        db.delete(row)
    db.delete(f)
    db.commit()
    action_log.enrich(
        target_kind="factory", target_id=factory_id, target_name=name,
        details=[("code", code)],
    )
    return None


@router.put("/reorder/all")
def reorder(body: ReorderIn, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """Tab order, by id. Anything the client omits keeps its place after the
    listed ones rather than jumping to the front."""
    for i, fid in enumerate(body.order):
        db.query(Factory).filter(Factory.id == fid).update({"sort_order": i})
    db.commit()
    action_log.enrich(target_kind="factory",
                      details=[("count", len(body.order))])
    return {"ok": True}


@router.put("/assign/managers")
def assign_managers(body: AssignIn, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """Move supervisor units between factories (bulk)."""
    target = _get(db, body.factory_id) if body.factory_id is not None else None
    ids = [int(m) for m in body.manager_ids or []]
    if not ids:
        return {"ok": True, "moved": 0}
    moved = (
        db.query(Manager)
        .filter(Manager.id.in_(ids))
        .update({"factory_id": body.factory_id}, synchronize_session=False)
    )
    db.commit()
    action_log.enrich(
        target_kind="factory", target_id=body.factory_id,
        target_name=_fname(target),
        details=[("factory", _fname(target) or "—"), ("count", moved)],
    )
    return {"ok": True, "moved": moved}


@router.put("/settings/defaults")
def save_settings(body: SettingsIn, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """The global landing tab and whether «All factories» is offered.

    One default for all six pages by decision: a factory is a CONTEXT, and six
    pages that each open on a different plant is exactly the confusion this
    feature exists to remove.
    """
    before_default = default_factory_id(db)
    before_all = all_tab_enabled(db)
    if body.default_factory is not None:
        raw = str(body.default_factory).strip()
        if raw != "all":
            try:
                wanted = int(raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="default_factory must be an id or 'all'")
            _get(db, wanted)
            raw = str(wanted)
        row = db.query(AppSetting).filter_by(key=DEFAULT_FACTORY_SETTING).first()
        if row:
            row.value = raw
        else:
            db.add(AppSetting(key=DEFAULT_FACTORY_SETTING, value=raw))
    if body.all_tab is not None:
        val = "1" if body.all_tab else "0"
        row = db.query(AppSetting).filter_by(key=FACTORY_ALL_TAB_SETTING).first()
        if row:
            row.value = val
        else:
            db.add(AppSetting(key=FACTORY_ALL_TAB_SETTING, value=val))
    db.commit()
    after_default, after_all = default_factory_id(db), all_tab_enabled(db)
    fmt = lambda v: "all" if v is None else str(v)
    diff = []
    if after_default != before_default:
        diff.append(("factory", fmt(before_default), fmt(after_default)))
    if after_all != before_all:
        diff.append(("all_tab", before_all, after_all))
    action_log.enrich(target_kind="setting", target_id=DEFAULT_FACTORY_SETTING,
                      changes=diff)
    return {
        "default_factory": (
            str(default_factory_id(db)) if default_factory_id(db) is not None else "all"
        ),
        "all_tab": all_tab_enabled(db),
    }
