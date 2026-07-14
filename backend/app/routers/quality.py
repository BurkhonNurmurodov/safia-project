"""
Quality register API (жалобы и несоответствия).

Serves the flat non-conformance log synced from the QA workbook's first tab
(«для свода», see services/sheets_reader.read_quality_data). The frontend
computes every chart from the raw rows, so this router stays thin.

The list payload deliberately omits the three long free-text columns
(описание / комментарии / корректирующие действия) — with ~12k rows they would
triple the response for text that is only ever read one row at a time. The row
modal pulls them from /api/quality/{id}.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager, QualityComplaint, QualitySyncMeta, SheetSource
from app.permissions import require_page
from app.services.name_map import supervisor_match
from app.services.sheets_sync import sync_quality_sheet

router = APIRouter(prefix="/api/quality", tags=["quality"])

SHEET_NAME = "quality"


@router.get("")
def get_quality(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("quality")),
):
    """The whole register in compact form + sync metadata. Admin / top- /
    shift-manager only (page-access matrix), so no per-row scoping."""
    meta = db.query(QualitySyncMeta).filter_by(id=1).first()
    rows = (
        db.query(
            QualityComplaint.id, QualityComplaint.date, QualityComplaint.source,
            QualityComplaint.place, QualityComplaint.product, QualityComplaint.ctype,
            QualityComplaint.category, QualityComplaint.fault, QualityComplaint.fault_code,
            QualityComplaint.cell_name, QualityComplaint.brigadir, QualityComplaint.manager,
            QualityComplaint.returned, QualityComplaint.status, QualityComplaint.ref_no,
        )
        .order_by(QualityComplaint.date.desc(), QualityComplaint.id.desc())
        .all()
    )

    return {
        "can_refresh": payload.get("role") == "admin",
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "ok": meta.ok if meta else None,
        "message": meta.message if meta else None,
        # Short keys: this array carries ~12k rows.
        "rows": [
            {
                "id": r.id, "d": r.date, "s": r.source, "pl": r.place, "pr": r.product,
                "t": r.ctype, "c": r.category, "f": r.fault, "fc": r.fault_code,
                "cn": r.cell_name, "b": r.brigadir, "m": r.manager, "r": r.returned,
                "st": r.status, "no": r.ref_no,
            }
            for r in rows
        ],
    }


@router.get("/{row_id}")
def get_quality_row(
    row_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("quality")),
):
    """One row with its long free-text columns — powers the detail modal."""
    r = db.query(QualityComplaint).filter_by(id=row_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Row not found")
    return {
        "id": r.id, "date": r.date, "source": r.source, "place": r.place,
        "product": r.product, "ctype": r.ctype, "category": r.category,
        "description": r.description, "fault": r.fault, "fault_code": r.fault_code,
        "cell_name": r.cell_name, "brigadir": r.brigadir, "manager": r.manager,
        "returned": r.returned, "status": r.status, "comment": r.comment,
        "action": r.action, "ref_no": r.ref_no,
    }


@router.post("/refresh")
def refresh_quality(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("quality")),
):
    """Re-pull the register from the Google Sheet. Admin-only, triggered from
    the page header — there is no scheduled sync."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can refresh the quality register")

    src = db.query(SheetSource).filter(SheetSource.name == SHEET_NAME).first()
    if not src:
        raise HTTPException(status_code=404, detail="Quality sheet is not configured")

    try:
        result = sync_quality_sheet(src.sheet_id, db)
    except Exception as exc:
        db.rollback()
        meta = db.query(QualitySyncMeta).filter_by(id=1).first()
        if not meta:
            meta = QualitySyncMeta(id=1)
            db.add(meta)
        meta.ok = False
        meta.message = str(exc)[:500]
        db.commit()
        raise HTTPException(status_code=502, detail=f"Failed to sync the quality sheet: {exc}")

    return {"status": "ok", **result}
