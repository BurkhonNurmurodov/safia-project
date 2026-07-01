"""
Kaizen project analytics API.

Serves a flat snapshot of the eight Kaizen-session Notion databases (see
services/notion_kaizen.py). The frontend computes all the charts from the raw
task list, so this router stays thin: read the snapshot, or (admin) refresh it
from Notion.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import KaizenTask, KaizenSyncMeta
from app.permissions import require_page
from app.services import notion_kaizen as nk

router = APIRouter(prefix="/api/kaizen", tags=["kaizen"])


def _serialize(t: KaizenTask) -> dict:
    return {
        "id": t.notion_id or f"row-{t.id}",
        "project": t.project,
        "project_key": t.project_key,
        "url": t.url,
        "title": t.title,
        "status": t.status,
        "task_type": t.task_type,
        "responsible": t.responsible or [],
        "customer": t.customer or [],
        "deadline": t.deadline,
        "created_time": t.created_time,
    }


@router.get("")
def get_kaizen(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("kaizen")),
):
    """Return the stored snapshot plus sync metadata. Admin-only by default
    (page-access matrix), so no per-row scoping is applied."""
    meta = db.query(KaizenSyncMeta).filter_by(id=1).first()
    rows = (
        db.query(KaizenTask)
        .order_by(KaizenTask.project_key, KaizenTask.deadline.is_(None), KaizenTask.deadline)
        .all()
    )
    return {
        "configured": nk.token_configured(),
        "can_refresh": payload.get("role") == "admin",
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "ok": meta.ok if meta else None,
        "message": meta.message if meta else None,
        "projects": [{"key": p["key"], "name": p["name"]} for p in nk.KAIZEN_PROJECTS],
        "tasks": [_serialize(t) for t in rows],
    }


@router.post("/refresh")
def refresh_kaizen(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("kaizen")),
):
    """Re-pull every database from Notion and replace the snapshot. Admin only."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can refresh Kaizen data")

    if not nk.token_configured():
        raise HTTPException(
            status_code=400,
            detail="Notion is not connected. Add NOTION_TOKEN to the backend and "
                   "share the Kaizen hub page with the integration.",
        )

    meta = db.query(KaizenSyncMeta).filter_by(id=1).first()
    if not meta:
        meta = KaizenSyncMeta(id=1)
        db.add(meta)

    try:
        tasks = nk.fetch_all_tasks()
    except Exception as exc:  # surface a readable error to the admin
        meta.ok = False
        meta.message = str(exc)[:1000]
        meta.last_synced = nk.now_utc()
        db.commit()
        raise HTTPException(status_code=502, detail=f"Notion sync failed: {exc}")

    # Full replace — the snapshot mirrors Notion exactly each time.
    db.query(KaizenTask).delete()
    for t in tasks:
        db.add(KaizenTask(
            project=t["project"],
            project_key=t["project_key"],
            notion_id=t["notion_id"],
            url=t["url"],
            title=t["title"],
            status=t["status"],
            task_type=t["task_type"],
            responsible=t["responsible"],
            customer=t["customer"],
            deadline=t["deadline"],
            created_time=t["created_time"],
        ))

    meta.ok = True
    meta.message = None
    meta.task_count = len(tasks)
    meta.last_synced = nk.now_utc()
    db.commit()

    return {"ok": True, "count": len(tasks), "last_synced": meta.last_synced.isoformat()}
