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
from app.models import Manager, AppSetting, PPProduct, PPWorkCenter, PPDaily, PPReconciliation, PPUpload
from app.permissions import require_page
from app.services.pp_parser import read_workbook_slices, parse_catalog_workbook, FAZA_COLUMNS
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
def _upsert_upload(db, manager_id, day, file_type, columns, rows, filename):
    up = db.query(PPUpload).filter(
        PPUpload.manager_id == manager_id, PPUpload.date == day,
        PPUpload.file_type == file_type).first()
    if not up:
        up = PPUpload(manager_id=manager_id, date=day, file_type=file_type)
        db.add(up)
    up.columns = columns
    up.rows = rows
    up.row_count = len(rows)
    up.filename = filename


@router.post("/admin/production/upload")
async def upload_phase(
    files: list[UploadFile] = File(...),
    manager_id: int = Form(...),
    date: str = Form(...),
    mode: str = Form("both"),           # 'plan' | 'actual' | 'both'
    file_type: Optional[str] = Form(None),  # 'faza' | 'zaga' | None (auto-detect)
    _: dict = Depends(_verify_admin),
    db: Session = Depends(get_db),
):
    if mode not in ("plan", "actual", "both"):
        raise HTTPException(status_code=400, detail="mode must be plan|actual|both")
    force_type = file_type if file_type in ("faza", "zaga") else None
    day = _parse_date(date)
    if not db.query(Manager).filter(Manager.id == manager_id).first():
        raise HTTPException(status_code=404, detail=f"Manager {manager_id} not found")

    # Scope to this brigadir: own work centers (config ∪ catalog) and catalog SKUs.
    products = db.query(PPProduct).filter(PPProduct.manager_id == manager_id).all()
    own_wcs = {w.code for w in db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == manager_id).all()} | {p.work_center for p in products}
    catalog_skus = {p.sap_code for p in products}

    faza_ops: list[dict] = []          # raw operation dicts (no SKU yet)
    faza_dates: set = set()
    order_sku: dict[str, str] = {}     # order → SKU, from заголовок
    order_deliv: dict[str, float] = {} # order → «Поставлено» (= Excel «План пост»), drives «Факт»
    zaga_rows: list[list] = []
    zaga_cols = None
    faza_present = zaga_present = False
    faza_file = zaga_file = None
    file_reports = []

    for f in files:
        slices = read_workbook_slices(await f.read(), day, own_wcs, catalog_skus, force_type=force_type)
        rep = {"file": f.filename, "faza": None, "zaga": None}
        fz = slices.get("faza")
        if fz is not None:
            faza_present = True
            faza_ops += fz["raw"]
            faza_dates.update(fz["dates"])
            faza_file = f.filename
            rep["faza"] = {"operations": len(fz["raw"]), "dates": [d.isoformat() for d in fz["dates"]]}
        zg = slices.get("zaga")
        if zg is not None:
            zaga_present = True
            order_sku.update(zg["order_sku"])
            order_deliv.update(zg.get("order_deliv", {}))
            zaga_rows += zg["rows"]
            zaga_cols = zg["columns"]
            zaga_file = f.filename
            rep["zaga"] = {"orders": len(zg["order_sku"]), "rows": len(zg["rows"])}
        file_reports.append(rep)

    if not faza_present and not zaga_present:
        raise HTTPException(
            status_code=400,
            detail="Не удалось распознать тип файла автоматически. Выберите «Тип файла» (Фаза или Заголовок) и загрузите снова.",
        )

    # Supplement order→SKU with the заголовок already stored for this date, so a
    # фаза-only upload can still resolve SKUs (stored zaga rows: [order, sku, …]).
    if faza_present:
        stored_zaga = db.query(PPUpload).filter(
            PPUpload.manager_id == manager_id, PPUpload.date == day,
            PPUpload.file_type == "zaga").first()
        if stored_zaga:
            # stored zaga row: [order, sku, plant, ordqty, deliv, conf, date, name, status]
            for r in (stored_zaga.rows or []):
                if len(r) >= 2 and r[0] and r[1]:
                    order_sku.setdefault(str(r[0]), str(r[1]))
                    if len(r) > 4:
                        order_deliv.setdefault(str(r[0]), float(r[4] or 0))

    # Join фаза operations → SKU, aggregate plan/actual by (SKU, work center).
    #   ПЛАН  = Σ «Кол-во операции» over the matching operations          (Excel col F)
    #   ФАКТ  = Σ order «Поставлено» over the matching operations          (Excel «План пост», col M)
    # «Поставлено» is order-level and repeats per operation, exactly like the
    # Excel SUMIFS over «План пост» — so we add it once per matching фаза row.
    faza_agg: dict[tuple[str, str], dict] = {}
    faza_rows: list[list] = []
    unmapped = 0
    for op in faza_ops:
        sku = order_sku.get(op["order"])
        if sku and (not catalog_skus or sku in catalog_skus):
            a = faza_agg.setdefault((sku, op["wc"]), {"plan_qty": 0.0, "actual_qty": 0.0})
            a["plan_qty"] += op["plan"]
            a["actual_qty"] += order_deliv.get(op["order"], 0.0)
        elif not sku:
            unmapped += 1
        faza_rows.append([op["order"], op["op"], op["wc"], sku or "—", op["name"],
                          op["plan"], op["status"], op["date"], op["conf"]])

    updated = 0
    if faza_agg:
        # mode 'both' = fresh daily snapshot → replace the date (also clears overrides).
        if mode == "both":
            db.query(PPDaily).filter(PPDaily.manager_id == manager_id, PPDaily.date == day).delete()
            db.flush()
        for (sap, wc), agg in faza_agg.items():
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

    if faza_present:
        _upsert_upload(db, manager_id, day, "faza", FAZA_COLUMNS, faza_rows, faza_file)
    if zaga_present:
        _upsert_upload(db, manager_id, day, "zaga", zaga_cols, zaga_rows, zaga_file)

    db.commit()
    return {
        "status": "ok", "manager_id": manager_id, "date": day.isoformat(), "mode": mode,
        "rows_written": updated,
        "faza_operations": len(faza_ops) if faza_present else 0,
        "unmapped_operations": unmapped,
        "zaga_orders": len(order_sku),
        "files": file_reports,
    }


@router.get("/api/production/raw")
def get_raw(
    file_type: str = Query(...),       # 'faza' | 'zaga'
    date: Optional[str] = Query(None),
    manager_id: Optional[int] = Query(None),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    if file_type not in ("faza", "zaga"):
        raise HTTPException(status_code=400, detail="file_type must be faza|zaga")
    mid = _resolve_manager_id(payload, manager_id)
    day = _parse_date(date)
    up = db.query(PPUpload).filter(
        PPUpload.manager_id == mid, PPUpload.date == day,
        PPUpload.file_type == file_type).first()
    if not up:
        return {"present": False, "columns": [], "rows": [], "file_type": file_type, "date": day.isoformat()}
    return {
        "present": True, "file_type": file_type, "date": day.isoformat(),
        "columns": up.columns, "rows": up.rows, "row_count": up.row_count,
        "filename": up.filename,
        "uploaded_at": up.uploaded_at.isoformat() if up.uploaded_at else None,
    }


@router.post("/admin/production/catalog/import")
async def import_catalog(
    file: UploadFile = File(...),
    manager_id: int = Form(...),
    sheet_name: Optional[str] = Form(None),
    _: dict = Depends(_verify_admin),
    db: Session = Depends(get_db),
):
    """Replace a brigadir's catalog from an uploaded 'Sheet1 …' sheet: products
    (SKU, name, labor, work center) + work-center штатка/capacity. Junk '0' rows
    are dropped. Overrides/snapshots (pp_daily) are untouched — they key on
    (sap_code, work_center)."""
    if not db.query(Manager).filter(Manager.id == manager_id).first():
        raise HTTPException(status_code=404, detail=f"Manager {manager_id} not found")
    parsed = parse_catalog_workbook(await file.read(), sheet_name)
    if not parsed["products"]:
        raise HTTPException(
            status_code=400,
            detail="Каталог не найден. Укажите имя листа (напр. «Sheet1 Торт») с колонками Трудоёмкость/Команда.",
        )

    db.query(PPProduct).filter(PPProduct.manager_id == manager_id).delete()
    for i, p in enumerate(parsed["products"]):
        db.add(PPProduct(
            manager_id=manager_id, sap_code=p["sap_code"], name=p.get("name") or "",
            work_center=p.get("work_center") or "", labor_time=p.get("labor_time"),
            sort_order=i,
        ))

    existing = {w.code: w for w in db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == manager_id).all()}
    wc_added = wc_updated = 0
    for w in parsed["work_centers"]:
        wc = existing.get(w["code"])
        if wc:
            wc.shtatka = w.get("shtatka") or 0
            if w.get("capacity") is not None:
                wc.capacity = w["capacity"]
            wc_updated += 1
        else:
            db.add(PPWorkCenter(
                manager_id=manager_id, code=w["code"], shtatka=w.get("shtatka") or 0,
                capacity=w.get("capacity"), sort_order=w.get("sort_order", 0)))
            wc_added += 1
    db.commit()
    return {
        "status": "ok", "manager_id": manager_id, "sheet": parsed["sheet"],
        "products": len(parsed["products"]),
        "work_centers_added": wc_added, "work_centers_updated": wc_updated,
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
