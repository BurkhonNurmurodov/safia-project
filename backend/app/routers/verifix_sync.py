"""«Verifix sinxron» — `/admin/upload?tab=verifixsync` (2026-10-12).

The doors over `services/verifix_sync.py`: the state (mode, caps, the last
passes, the queue, the untied rows), the tie run and a pass on demand (each
on a thread of its own — a Verifix read is longer than a request may be),
the operator's hand ties, and the queue's approve / dismiss.

ADMIN-ONLY and NOT grantable: it moves people, cells and access — the
`permissions` / `logs` model. Every write is in the action register.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import Cell, Manager, RoleProfile, VerifixSyncItem, VerifixSyncRun, VerifixTie
from app.routers.admin import verify_admin
from app.services import action_log, cell_register, verifix_org, verifix_sync
from app.services.cell_register import Refused
from app.services.name_map import _name_tokens

router = APIRouter(prefix="/api/admin/verifix-sync", tags=["verifix-sync"])
log = logging.getLogger(__name__)

_job_lock = threading.Lock()
_job: dict = {"kind": None, "started": None, "error": None}


def _who(admin: dict) -> str:
    return (admin.get("full_name") or admin.get("username")
            or str(admin.get("telegram_id") or "admin"))


def _refused(exc: Refused) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=exc.detail())


def _run_bg(kind: str, fn) -> bool:
    """One background job at a time per process (the tie run or a pass)."""
    if not _job_lock.acquire(blocking=False):
        return False
    from datetime import datetime, timezone
    _job.update(kind=kind, started=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                error=None)

    def go():
        try:
            with SessionLocal() as db:
                fn(db)
        except Exception as exc:  # noqa: BLE001 — said on the page
            log.exception("verifix sync: background %s failed", kind)
            _job["error"] = str(exc)[:300]
        finally:
            _job["kind"] = None
            _job_lock.release()

    threading.Thread(target=go, name=f"verifix-sync-{kind}", daemon=True).start()
    return True


def _run_out(r: VerifixSyncRun, full: bool = False) -> dict:
    out = {"id": r.id, "kind": r.kind, "mode": r.mode, "ok": r.ok, "guard": r.guard,
           "started_at": r.started_at.isoformat() if r.started_at else None,
           "finished_at": r.finished_at.isoformat() if r.finished_at else None,
           "org_at": r.org_at.isoformat() if r.org_at else None,
           "counts": r.counts or {}, "ms": r.ms}
    if full:
        out["changes"] = r.changes or {}
    return out


def _item_out(it: VerifixSyncItem) -> dict:
    return {"id": it.id, "kind": it.kind, "key": it.key, "payload": it.payload or {},
            "status": it.status, "applicable": it.kind in verifix_sync.APPLICABLE,
            "first_seen": it.first_seen.isoformat() if it.first_seen else None,
            "last_seen": it.last_seen.isoformat() if it.last_seen else None,
            "decided_at": it.decided_at.isoformat() if it.decided_at else None,
            "decided_by": it.decided_by, "note": it.note}


def _untied(db: Session) -> dict:
    """The rows the tie run could not be sure of, as they stand NOW."""
    units = {m.id: m.name for m in db.query(Manager).all()}
    cells = [{"id": c.id, "code": c.verifix_code, "unit": units.get(c.manager_id),
              "archived": c.archived_at is not None}
             for c in db.query(Cell).filter(Cell.vfx_division_id.is_(None))
             .order_by(Cell.verifix_code).all()]
    people = [{"id": p.id, "name": p.name, "role": p.role, "unit": units.get(p.manager_id)}
              for p in db.query(RoleProfile).filter(RoleProfile.vfx_employee_id.is_(None))
              .order_by(RoleProfile.role, RoleProfile.name).all()
              if p.role in verifix_sync.PROFILE_ROLES]
    mgrs = [{"id": m.id, "name": m.name}
            for m in db.query(Manager).filter(Manager.vfx_employee_id.is_(None),
                                              Manager.archived.is_(False))
            .order_by(Manager.name).all()]
    return {"cells": cells, "people": people, "units": mgrs}


_UNIT_KEYS = ("unit", "from_unit", "to_unit")
_PROFILE_KEYS = ("profile", "owner", "manager")


def _names(db: Session, items: list, ties: list) -> dict:
    units, profs, cells = set(), set(), set()
    for it in items:
        p = it.payload or {}
        units |= {p[k] for k in _UNIT_KEYS if isinstance(p.get(k), int)}
        profs |= {p[k] for k in _PROFILE_KEYS if isinstance(p.get(k), int)}
        if isinstance(p.get("cell"), int):
            cells.add(p["cell"])
    for t in ties:
        (units if t.kind == "unit" else cells if t.kind == "cell" else profs).add(t.our_id)
    out = {"units": {}, "profiles": {}, "cells": {}}
    if units:
        out["units"] = {m.id: m.name for m in db.query(Manager.id, Manager.name)
                        .filter(Manager.id.in_(units))}
    if profs:
        out["profiles"] = {p.id: {"name": p.name, "role": p.role, "unit": p.manager_id}
                           for p in db.query(RoleProfile.id, RoleProfile.name, RoleProfile.role,
                                             RoleProfile.manager_id)
                           .filter(RoleProfile.id.in_(profs))}
        missing = {p["unit"] for p in out["profiles"].values() if p["unit"]} - set(out["units"])
        if missing:
            out["units"].update({m.id: m.name for m in db.query(Manager.id, Manager.name)
                                 .filter(Manager.id.in_(missing))})
    if cells:
        out["cells"] = {c.id: c.verifix_code for c in db.query(Cell.id, Cell.verifix_code)
                        .filter(Cell.id.in_(cells))}
    return out


def _tie_names(t: VerifixTie, org: Optional[dict], names: dict) -> dict:
    if t.kind == "cell":
        ours = names["cells"].get(t.our_id)
        vfx = ((org or {}).get("divs") or {}).get(t.vfx_id) or {}
    elif t.kind == "unit":
        ours = names["units"].get(t.our_id)
        vfx = ((org or {}).get("emps") or {}).get(t.vfx_id) or {}
    else:
        ours = (names["profiles"].get(t.our_id) or {}).get("name")
        vfx = ((org or {}).get("emps") or {}).get(t.vfx_id) or {}
    return {"our_name": ours, "vfx_name": vfx.get("name"), "vfx_status": vfx.get("status")}


@router.get("")
def get_state(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    # The job flag FIRST: a job that ends while this reads must not show as
    # finished beside a run list read before its record was committed.
    job = dict(_job)
    org, at = verifix_org.stored(db)
    from app.models import LiveVerifixRead
    # The stored read's error columns only — never its multi-MB data.
    row = (db.query(LiveVerifixRead.error, LiveVerifixRead.error_at, LiveVerifixRead.read_at)
           .filter(LiveVerifixRead.key == verifix_org.ORG_KEY).first())
    from sqlalchemy.orm import defer
    runs = (db.query(VerifixSyncRun).options(defer(VerifixSyncRun.changes))
            .order_by(VerifixSyncRun.id.desc()).limit(30).all())
    items = (db.query(VerifixSyncItem).filter(VerifixSyncItem.status == "open")
             .order_by(VerifixSyncItem.kind, VerifixSyncItem.first_seen).all())
    decided = (db.query(VerifixSyncItem).filter(VerifixSyncItem.status != "open")
               .order_by(VerifixSyncItem.decided_at.desc().nullslast()).limit(50).all())
    ties = db.query(VerifixTie).order_by(VerifixTie.created_at.desc()).all()
    names = _names(db, items + decided, ties)
    tied = {
        "cells": db.query(Cell.id).filter(Cell.vfx_division_id.isnot(None)).count(),
        "people": db.query(RoleProfile.id).filter(RoleProfile.vfx_employee_id.isnot(None)).count(),
        "units": db.query(Manager.id).filter(Manager.vfx_employee_id.isnot(None)).count(),
    }
    return {
        "mode": verifix_sync.mode(db), "modes": list(verifix_sync.MODES),
        "caps": verifix_sync.caps(db), "cap_defaults": verifix_sync.CAPS,
        "org": {"read_at": at.isoformat() if at else None,
                "error": row.error if row else None,
                "error_at": row.error_at.isoformat() if row and row.error_at else None,
                "divisions": len((org or {}).get("divs") or {}),
                "employees": len((org or {}).get("emps") or {}),
                "working": sum(1 for e in ((org or {}).get("emps") or {}).values()
                               if (e.get("status") or "W") == "W"),
                "guard": verifix_org.guard(org)},
        "job": job,
        "runs": [_run_out(r) for r in runs],
        "items": [_item_out(i) for i in items],
        "decided": [_item_out(i) for i in decided],
        "ties": [{"id": t.id, "kind": t.kind, "our_id": t.our_id, "vfx_id": t.vfx_id,
                  "how": t.how, "by": t.by_name,
                  "at": t.created_at.isoformat() if t.created_at else None,
                  **_tie_names(t, org, names)}
                 for t in ties if t.vfx_id != verifix_sync.UNTIED],
        # Rows a person UNTIED — no pass ties them back by itself until the
        # block is lifted (POST /tie with release).
        "blocked": [{"id": t.id, "kind": t.kind, "our_id": t.our_id, "by": t.by_name,
                     "at": t.created_at.isoformat() if t.created_at else None,
                     **_tie_names(t, org, names)}
                    for t in ties if t.vfx_id == verifix_sync.UNTIED],
        # Names of the units / profiles / cells the items and ties refer to by
        # id — so the page needs no roster of its own to read them.
        "names": names,
        "tied": tied,
        "untied": _untied(db),
    }


@router.get("/runs/{rid}")
def get_run(rid: int, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    r = db.query(VerifixSyncRun).filter_by(id=rid).first()
    if r is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_out(r, full=True)


class ModeIn(BaseModel):
    mode: str = Field(max_length=10)


@router.put("/mode")
def put_mode(body: ModeIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    before = verifix_sync.mode(db)
    try:
        verifix_sync.set_mode(db, body.mode)
    except Refused as exc:
        raise _refused(exc)
    db.commit()
    action_log.enrich(target_kind="setting", target_name="verifix_sync_mode",
                      changes=[("mode", before, body.mode)])
    return {"ok": True, "mode": body.mode}


class CapsIn(BaseModel):
    caps: dict


@router.put("/caps")
def put_caps(body: CapsIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    import json
    from app.models import AppSetting
    clean = {k: int(v) for k, v in (body.caps or {}).items()
             if k in verifix_sync.CAPS and isinstance(v, (int, float)) and 0 <= int(v) <= 5000}
    before = verifix_sync.caps(db)
    row = db.query(AppSetting).filter_by(key=verifix_sync.CAPS_KEY).first()
    if row is None:
        db.add(AppSetting(key=verifix_sync.CAPS_KEY, value=json.dumps(clean)))
    else:
        row.value = json.dumps(clean)
    db.commit()
    after = verifix_sync.caps(db)
    action_log.enrich(target_kind="setting", target_name="verifix_sync_caps",
                      changes=[(k, before[k], after[k]) for k in after if before[k] != after[k]])
    return {"ok": True, "caps": after}


class RunIn(BaseModel):
    dry: bool = False
    force_read: bool = True


@router.post("/tie-run")
def post_tie_run(body: RunIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    by = _who(admin)
    started = _run_bg("tie", lambda s: verifix_sync.tie_run(s, dry=body.dry, by=by,
                                                            force_read=body.force_read))
    action_log.enrich(details=[("dry", body.dry), ("started", started)])
    return {"ok": True, "started": started, "job": dict(_job)}


@router.post("/pass")
def post_pass(body: RunIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    by = _who(admin)
    started = _run_bg("pass", lambda s: verifix_sync.run_pass(s, force_read=body.force_read,
                                                              by=by, dry=body.dry))
    action_log.enrich(details=[("dry", body.dry), ("started", started)])
    return {"ok": True, "started": started, "job": dict(_job)}


@router.get("/search")
def search(q: str = "", kind: str = "person", db: Session = Depends(get_db),
           _: dict = Depends(verify_admin)):
    """Find a Verifix person or subdivision in the stored read — what a hand
    tie picks from. Never a fuzzy SAVE: the operator chooses."""
    org, at = verifix_org.stored(db)
    if not org:
        return {"items": [], "reason": "no_read"}
    q = (q or "").strip()
    if len(q) < 2:
        return {"items": []}
    out = []
    if kind == "division":
        qk = verifix_org.code_key(q)
        ql = q.lower()
        for d in (org.get("divs") or {}).values():
            hit = (qk and (verifix_org.code_key(d.get("raw_code")) == qk)) or ql in (d.get("name") or "").lower()
            if hit:
                out.append({"id": d["id"], "name": d.get("name"), "code": d.get("raw_code"),
                            "state": d.get("state")})
        # Every match first, THEN the cut: open subdivisions before closed ones.
        out.sort(key=lambda x: (x["state"] != "A", x["code"] is None, x["name"] or ""))
        return {"items": out[:40], "more": max(0, len(out) - 40)}
    toks = _name_tokens(q)
    jobs = org.get("jobs") or {}
    divs = org.get("divs") or {}
    index = verifix_org.emp_tokens(org, at)
    for eid, e in (org.get("emps") or {}).items():
        et = index.get(eid) or ()
        if toks and all(any(w.startswith(t) for w in et) for t in toks):
            out.append({"id": e["id"], "name": e.get("name"), "status": e.get("status"),
                        "job": ((jobs.get(e.get("job") or "") or {}).get("name")),
                        # A cell's subdivision by its CODE — its name is the
                        # workshop name «A cell is its CODE» keeps off screens;
                        # any other subdivision (a department) by name.
                        "unit": ((divs.get(e.get("unit") or "") or {}).get("raw_code")
                                 or (divs.get(e.get("unit") or "") or {}).get("name")),
                        "dismissed": e.get("dismissed")})
    # Every match first, THEN the cut — working people before the thousands of
    # dismissed namesakes, or the one an operator needs falls outside the 40.
    out.sort(key=lambda x: (x["status"] != "W", x["name"] or ""))
    return {"items": out[:40], "more": max(0, len(out) - 40)}


class TieIn(BaseModel):
    kind: str = Field(max_length=10)
    our_id: int
    vfx_id: Optional[str] = Field(default=None, max_length=32)
    # Lift a remembered untie (the row may then be tied automatically again).
    release: bool = False


def _photo_now(db: Session, kind: str, our_id: int) -> Optional[str]:
    """Verifix's photo onto a row a person has just tied, in this request —
    after the tie's commit, so a failure here can neither undo nor fail it."""
    try:
        return verifix_sync.fetch_photo_now(db, kind, our_id)
    except Exception:  # noqa: BLE001
        log.exception("verifix sync: photo after a hand tie (%s %s)", kind, our_id)
        db.rollback()
        return "failed"


@router.post("/tie")
def post_tie(body: TieIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    try:
        out = verifix_sync.tie_by_hand(db, body.kind, body.our_id, body.vfx_id, by=_who(admin),
                                       release=body.release)
    except Refused as exc:
        raise _refused(exc)
    db.commit()
    cell_register.after_commit()
    if body.vfx_id and not body.release:
        photo = _photo_now(db, body.kind, body.our_id)
        if photo:
            out["photo"] = photo
    action_log.enrich(target_kind=body.kind, target_id=body.our_id,
                      details=[("vfx_id", body.vfx_id), ("release", body.release or None),
                               ("photo", out.get("photo"))])
    return out


class ItemIn(BaseModel):
    choice: Optional[str] = Field(default=None, max_length=200)


@router.post("/items/{iid}/apply")
def post_apply(iid: int, body: ItemIn, db: Session = Depends(get_db),
               admin: dict = Depends(verify_admin)):
    try:
        out = verifix_sync.apply_item(db, iid, by=_who(admin), choice=body.choice)
    except Refused as exc:
        db.rollback()
        raise _refused(exc)
    db.commit()
    cell_register.after_commit()
    tied = out.pop("tied", None)          # a tap that tied or confirmed a person
    if tied:
        photo = _photo_now(db, tied["kind"], tied["id"])
        if photo:
            out["photo"] = photo
    it = db.query(VerifixSyncItem).filter_by(id=iid).first()
    action_log.enrich(target_kind="verifix_item", target_id=iid,
                      target_name=it.kind if it else None,
                      details=[("kind", it.kind if it else None), ("key", it.key if it else None),
                               ("choice", body.choice), ("photo", out.get("photo"))])
    return out


@router.post("/items/{iid}/dismiss")
def post_dismiss(iid: int, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    try:
        out = verifix_sync.dismiss_item(db, iid, by=_who(admin))
    except Refused as exc:
        raise _refused(exc)
    db.commit()
    it = db.query(VerifixSyncItem).filter_by(id=iid).first()
    action_log.enrich(target_kind="verifix_item", target_id=iid,
                      target_name=it.kind if it else None,
                      details=[("kind", it.kind if it else None), ("key", it.key if it else None)])
    return out
