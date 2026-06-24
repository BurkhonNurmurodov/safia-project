from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderChecklist
from app.permissions import require_page

router = APIRouter(prefix="/api", tags=["leaders"])


@router.get("/leaders")
def get_leaders(
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("leaders")),
):
    """All leader checklist submissions. Filtering (period / supervisor / leader)
    is done client-side, mirroring the original Apps Script dashboard."""
    rows = (
        db.query(LeaderChecklist)
        .order_by(LeaderChecklist.date.desc(), LeaderChecklist.id.desc())
        .all()
    )
    return {
        "data": [
            {
                "uid": f"row-{r.id}",
                "date": r.date,
                "supervisor": r.supervisor,
                "leader": r.leader,
                "completion": float(r.completion or 0),
                "tasks": r.tasks or [],
            }
            for r in rows
        ]
    }
