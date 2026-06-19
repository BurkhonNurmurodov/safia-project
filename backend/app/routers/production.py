"""
Production-planning API (ABC form).

Brigadir-facing (supervisor scoped to their own Manager via the JWT role_id;
admin may pass ?manager_id=):
    GET  /api/production/dashboard?date=YYYY-MM-DD
    GET  /api/production/dates
    POST /api/production/override          {date, sap_code, work_center, field, value}
    POST /api/production/reconciliation     {date, data}

Admin-only:
    POST /admin/production/upload           file(s) + manager_id + date + mode
    GET  /admin/production/work-centers?manager_id=
    PUT  /admin/production/work-centers/{id}    {shtatka, capacity}
    GET  /admin/production/catalog?manager_id=
    PUT  /admin/production/catalog/{id}         {labor_time, name, active}
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

import jwt
from jwt import PyJWTError as JWTError
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Manager, AppSetting, PPProduct, PPWorkCenter, PPDaily, PPReconciliation
from app.permissions import require_page
from app.services.pp_parser import parse_phase_file
from app.services.pp_calc import compute_dashboard, DEFAULT_SHIFT_MIN, DEFAULT_PRODUCTIVE_MIN

router = APIRouter(tags=["production"])
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

PAGE = "production"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _verify_admin(token: Annotated[str, Depends(_oauth2)]) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


def _resolve_manager_id(payload: dict, requested: Optional[int]) -> int:
    """Supervisors are pinned to their own unit (role_id); admins choose via
    ?manager_id=. Anything else is refused."""
    role = payload.get("role")
    if role == "supervisor":
        mid = payload.get("role_id")
        if not mid:
            raise HTTPException(status_code=403, detail="No unit assigned to this supervisor")
        return int(mid)
    if role == "admin":
        if not requested:
            raise HTTPException(status_code=400, detail="manager_id is required for admin")
        return int(requested)
    raise HTTPException(status_code=403, detail="Not allowed to view production data")


def _constants(db: Session) -> tuple[float, float]:
    rows = {r.key: r.value for r in db.query(AppSetting).filter(
        AppSetting.key.in_(["pp_shift_min", "pp_productive_min"])).all()}
    def num(k, default):
        try:
            return float(rows[k])
        except (KeyError, ValueError, TypeError):
            return default
    return num("pp_shift_min", DEFAULT_SHIFT_MIN), num("pp_productive_min", DEFAULT_PRODUCTIVE_MIN)


def _parse_date(s: Optional[str]) -> date:
    if not s:
        return date.today()
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")


def _build_dashboard(db: Session, manager_id: int, day: date) -> dict:
    products = (
        db.query(PPProduct)
        .filter(PPProduct.manager_id == manager_id, PPProduct.active.is_(True))
        .order_by(PPProduct.sort_order, PPProduct.id)
        .all()
    )
    wcs = (
        db.query(PPWorkCenter)
        .filter(PPWorkCenter.manager_id == manager_id, PPWorkCenter.active.is_(True))
        .order_by(PPWorkCenter.sort_order, PPWorkCenter.id)
        .all()
    )
    daily = db.query(PPDaily).filter(PPDaily.manager_id == manager_id, PPDaily.date == day).all()

    quantities: dict[tuple[str, str], dict] = {}
    for d in daily:
        plan_eff = d.plan_override if d.plan_override is not None else d.plan_qty
        actual_eff = d.actual_override if d.actual_override is not None else d.actual_qty
        quantities[(d.sap_code, d.work_center)] = {
            "plan_qty": float(plan_eff or 0),
            "actual_qty": float(actual_eff or 0),
            "plan_overridden": d.plan_override is not None,
            "actual_overridden": d.actual_override is not None,
        }

    shift_min, productive_min = _constants(db)
    result = compute_dashboard(
        products=[{
            "sap_code": p.sap_code, "name": p.name, "work_center": p.work_center,
            "labor_time": (float(p.labor_time) if p.labor_time is not None else None),
            "sort_order": p.sort_order,
        } for p in products],
        quantities=quantities,
        work_centers=[{
            "code": w.code, "shtatka": w.shtatka,
            "capacity": (float(w.capacity) if w.capacity is not None else None),
            "sort_order": w.sort_order,
        } for w in wcs],
        shift_min=shift_min,
        productive_min=productive_min,
    )

    # SKUs present in the SAP snapshot but absent from the catalog
    catalog_keys = {(p.sap_code, p.work_center) for p in products}
    unknown = sorted({k for k in quantities if k not in catalog_keys})

    recon = db.query(PPReconciliation).filter(
        PPReconciliation.manager_id == manager_id, PPReconciliation.date == day).first()

    mgr = db.query(Manager).filter(Manager.id == manager_id).first()
    result.update({
        "manager_id": manager_id,
        "manager_name": mgr.name if mgr else None,
        "date": day.isoformat(),
        "reconciliation": (recon.data if recon else {}),
        "unknown_skus": [{"sap_code": s, "work_center": w} for s, w in unknown],
        "missing_labor_count": sum(1 for r in result["rows"] if not r["has_labor"]),
    })
    return result


# --------------------------------------------------------------------------- #
# brigadir-facing
# --------------------------------------------------------------------------- #
@router.get("/api/production/dashboard")
def get_dashboard(
    date: Optional[str] = Query(None),
    manager_id: Optional[int] = Query(None),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    mid = _resolve_manager_id(payload, manager_id)
    return _build_dashboard(db, mid, _parse_date(date))


@router.get("/api/production/dates")
def get_dates(
    manager_id: Optional[int] = Query(None),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    mid = _resolve_manager_id(payload, manager_id)
    rows = (
        db.query(PPDaily.date)
        .filter(PPDaily.manager_id == mid)
        .distinct()
        .order_by(PPDaily.date.desc())
        .all()
    )
    return {"dates": [r[0].isoformat() for r in rows]}


class OverrideBody(BaseModel):
    date: str
    sap_code: str
    work_center: str
    field: str            # 'plan' | 'actual'
    value: Optional[float]  # null clears the override


@router.post("/api/production/override")
def set_override(
    body: OverrideBody,
    manager_id: Optional[int] = Query(None),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    if body.field not in ("plan", "actual"):
        raise HTTPException(status_code=400, detail="field must be 'plan' or 'actual'")
    mid = _resolve_manager_id(payload, manager_id)
    day = _parse_date(body.date)

    row = db.query(PPDaily).filter(
        PPDaily.manager_id == mid, PPDaily.date == day,
        PPDaily.sap_code == body.sap_code, PPDaily.work_center == body.work_center,
    ).first()
    if not row:
        # allow overriding a row that has no SAP snapshot yet
        row = PPDaily(manager_id=mid, date=day, sap_code=body.sap_code,
                      work_center=body.work_center, plan_qty=0, actual_qty=0)
        db.add(row)

    if body.field == "plan":
        row.plan_override = body.value
    else:
        row.actual_override = body.value
    db.commit()
    return _build_dashboard(db, mid, day)


class ReconciliationBody(BaseModel):
    date: str
    data: dict


@router.post("/api/production/reconciliation")
def save_reconciliation(
    body: ReconciliationBody,
    manager_id: Optional[int] = Query(None),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    mid = _resolve_manager_id(payload, manager_id)
    day = _parse_date(body.date)
    row = db.query(PPReconciliation).filter(
        PPReconciliation.manager_id == mid, PPReconciliation.date == day).first()
    if not row:
        row = PPReconciliation(manager_id=mid, date=day, data=body.data or {})
        db.add(row)
    else:
        row.data = body.data or {}
    db.commit()
    return {"ok": True, "data": row.data}


# --------------------------------------------------------------------------- #
# admin
# --------------------------------------------------------------------------- #
@router.post("/admin/production/upload")
async def upload_phase(
    files: list[UploadFile] = File(...),
    manager_id: int = Form(...),
    date: str = Form(...),
    mode: str = Form("both"),           # 'plan' | 'actual' | 'both'
    _: dict = Depends(_verify_admin),
    db: Session = Depends(get_db),
):
    if mode not in ("plan", "actual", "both"):
        raise HTTPException(status_code=400, detail="mode must be plan|actual|both")
    day = _parse_date(date)
    if not db.query(Manager).filter(Manager.id == manager_id).first():
        raise HTTPException(status_code=404, detail=f"Manager {manager_id} not found")

    # restrict to the work centers this brigadir owns (catalog-defined)
    own_wcs = {w.code for w in db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == manager_id).all()}
    own_keys = {(p.sap_code, p.work_center) for p in db.query(PPProduct).filter(
        PPProduct.manager_id == manager_id).all()}

    merged: dict[tuple[str, str], dict] = {}
    file_reports = []
    dates_seen: set[str] = set()
    for f in files:
        parsed = parse_phase_file(await f.read())
        dates_seen.update(d.isoformat() for d in parsed["dates"])
        bucket = parsed["by_date"].get(day, {})
        for key, agg in bucket.items():
            m = merged.setdefault(key, {"plan_qty": 0.0, "actual_qty": 0.0})
            m["plan_qty"] += agg["plan_qty"]
            m["actual_qty"] += agg["actual_qty"]
        file_reports.append({"file": f.filename, "rows": parsed["rows"],
                             "matched_keys_for_date": len(bucket)})

    updated = 0
    for (sap, wc), agg in merged.items():
        # only this brigadir's rows (by work center, or known catalog key)
        if own_wcs and wc not in own_wcs and (sap, wc) not in own_keys:
            continue
        row = db.query(PPDaily).filter(
            PPDaily.manager_id == manager_id, PPDaily.date == day,
            PPDaily.sap_code == sap, PPDaily.work_center == wc).first()
        if not row:
            row = PPDaily(manager_id=manager_id, date=day, sap_code=sap, work_center=wc,
                          plan_qty=0, actual_qty=0)
            db.add(row)
        if mode in ("plan", "both"):
            row.plan_qty = agg["plan_qty"]
            row.plan_override = None      # SAP upload resets the manual override
        if mode in ("actual", "both"):
            row.actual_qty = agg["actual_qty"]
            row.actual_override = None
        updated += 1
    db.commit()

    return {
        "status": "ok", "manager_id": manager_id, "date": day.isoformat(),
        "mode": mode, "rows_written": updated, "dates_in_file": sorted(dates_seen),
        "files": file_reports,
    }


@router.get("/admin/production/work-centers")
def admin_work_centers(manager_id: int = Query(...), _: dict = Depends(_verify_admin),
                       db: Session = Depends(get_db)):
    wcs = db.query(PPWorkCenter).filter(PPWorkCenter.manager_id == manager_id).order_by(
        PPWorkCenter.sort_order, PPWorkCenter.id).all()
    return [{"id": w.id, "code": w.code, "shtatka": w.shtatka,
             "capacity": (float(w.capacity) if w.capacity is not None else None),
             "active": w.active} for w in wcs]


class WorkCenterBody(BaseModel):
    shtatka: Optional[int] = None
    capacity: Optional[float] = None


@router.put("/admin/production/work-centers/{wc_id}")
def admin_update_work_center(wc_id: int, body: WorkCenterBody,
                             _: dict = Depends(_verify_admin), db: Session = Depends(get_db)):
    w = db.query(PPWorkCenter).filter(PPWorkCenter.id == wc_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="work center not found")
    if body.shtatka is not None:
        w.shtatka = body.shtatka
    if body.capacity is not None:
        w.capacity = body.capacity
    db.commit()
    return {"ok": True}


@router.get("/admin/production/catalog")
def admin_catalog(manager_id: int = Query(...), _: dict = Depends(_verify_admin),
                  db: Session = Depends(get_db)):
    rows = db.query(PPProduct).filter(PPProduct.manager_id == manager_id).order_by(
        PPProduct.sort_order, PPProduct.id).all()
    return [{"id": p.id, "sap_code": p.sap_code, "name": p.name,
             "work_center": p.work_center,
             "labor_time": (float(p.labor_time) if p.labor_time is not None else None),
             "active": p.active} for p in rows]


class CatalogBody(BaseModel):
    labor_time: Optional[float] = None
    name: Optional[str] = None
    active: Optional[bool] = None


@router.put("/admin/production/catalog/{prod_id}")
def admin_update_catalog(prod_id: int, body: CatalogBody,
                         _: dict = Depends(_verify_admin), db: Session = Depends(get_db)):
    p = db.query(PPProduct).filter(PPProduct.id == prod_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="product not found")
    if body.labor_time is not None:
        p.labor_time = body.labor_time
    if body.name is not None:
        p.name = body.name
    if body.active is not None:
        p.active = body.active
    db.commit()
    return {"ok": True}
