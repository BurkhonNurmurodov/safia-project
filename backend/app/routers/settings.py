import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSetting
from app.permissions import get_page_access, PAGE_KEYS, TOGGLEABLE_ROLES

router = APIRouter(prefix="/api", tags=["settings"])

DEFAULT_HEATMAP_SEGMENTS = [
    {"from": 0,   "color": "#ef4444"},
    {"from": 85,  "color": "#22c55e"},
    {"from": 101, "color": "#3b82f6"},
]

DEFAULT_P_SEGMENTS = [
    {"from": 0,  "color": "#ef4444"},
    {"from": 80, "color": "#eab308"},
    {"from": 85, "color": "#22c55e"},
]

DEFAULT_DIFF_SEGMENTS = [
    {"from": -9999, "color": "#3b82f6"},
    {"from": -20,   "color": "#22c55e"},
    {"from": 1,     "color": "#eab308"},
    {"from": 6,     "color": "#ef4444"},
]


@router.get("/heatmap-thresholds")
def get_heatmap_thresholds(db: Session = Depends(get_db)):
    row = db.query(AppSetting).filter(AppSetting.key == "heatmap_segments").first()
    segments = json.loads(row.value) if row else DEFAULT_HEATMAP_SEGMENTS
    return {"segments": segments}


@router.get("/comparison-thresholds")
def get_comparison_thresholds(db: Session = Depends(get_db)):
    p_row = db.query(AppSetting).filter(AppSetting.key == "comparison_p_segments").first()
    d_row = db.query(AppSetting).filter(AppSetting.key == "comparison_diff_segments").first()
    return {
        "p_segments":    json.loads(p_row.value) if p_row else DEFAULT_P_SEGMENTS,
        "diff_segments": json.loads(d_row.value) if d_row else DEFAULT_DIFF_SEGMENTS,
    }


@router.get("/page-access")
def get_page_access_matrix(db: Session = Depends(get_db)):
    """Public read of the page-access matrix so every role can render its own
    navigation. Admin always has full access (not represented in the matrix)."""
    return {
        "pages":            get_page_access(db),
        "page_keys":        PAGE_KEYS,
        "toggleable_roles": TOGGLEABLE_ROLES,
    }
