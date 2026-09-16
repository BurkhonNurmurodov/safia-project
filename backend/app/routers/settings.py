import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.capabilities import (
    caller_caps, caller_denied_pages, capability_pages, capability_tabs, page_scopes,
)
from app.database import get_db
from app.models import AppSetting
from app.permissions import get_page_access, PAGE_KEYS, TOGGLEABLE_ROLES
from app.security import require_auth

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


# ─── Traffic-light bands ──────────────────────────────────────────────────────
# The bands a headline figure is JUDGED by — «Smena hisoboti» on Overview and
# the «Zagruzka fayli» KPI cards read the same ones, because one figure must not
# be green on one page and yellow on the next. These numbers are the twin of
# `frontend/src/utils/statusBands.js`, which ships them as the floor the client
# paints with until this endpoint answers: change one and change the other.
#
# Concerns are a COUNT and fewer is better, so its two edges read the other way
# round — ok is the TOP of green, warn the top of yellow.
STATUS_BANDS_KEY = "status_bands"
DEFAULT_STATUS_BANDS = {
    "load":     {"ok": 90, "warn": 80},
    "compl":    {"ok": 95, "warn": 70},
    "quality":  {"ok": 90, "warn": 70},
    "concerns": {"ok": 5,  "warn": 20},
}


def _band(stored: dict, key: str) -> dict:
    """One figure's band, each EDGE falling back to its default on its own."""
    d = DEFAULT_STATUS_BANDS[key]
    v = stored.get(key) if isinstance(stored, dict) else None
    if not isinstance(v, dict):
        return dict(d)
    out = {}
    for edge in ("ok", "warn"):
        try:
            out[edge] = int(v[edge])
        except (KeyError, TypeError, ValueError):
            out[edge] = d[edge]
    return out


@router.get("/status-bands")
def get_status_bands(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    """The bands in force, resolved figure by figure against the defaults.

    EVERY viewer reads this — it is what paints their screen — while only an
    admin writes it, through `PUT /admin/settings` (`status_bands`), so the
    write is already admin-gated, action-logged and undoable with no second
    door to keep in step.

    Resolving key by key is the point: a blob written by an older client, one
    missing a figure added since, or one somebody corrupted can never blank a
    band — each edge falls back to the very number the client ships as its own
    floor. The rule `heatmap-thresholds` already follows, one level finer.
    """
    row = db.query(AppSetting).filter(AppSetting.key == STATUS_BANDS_KEY).first()
    try:
        stored = json.loads(row.value) if row else {}
    except (TypeError, ValueError):
        stored = {}
    return {"bands": {k: _band(stored, k) for k in DEFAULT_STATUS_BANDS}}


@router.get("/heatmap-thresholds")
def get_heatmap_thresholds(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    row = db.query(AppSetting).filter(AppSetting.key == "heatmap_segments").first()
    segments = json.loads(row.value) if row else DEFAULT_HEATMAP_SEGMENTS
    return {"segments": segments}


@router.get("/comparison-thresholds")
def get_comparison_thresholds(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    p_row = db.query(AppSetting).filter(AppSetting.key == "comparison_p_segments").first()
    d_row = db.query(AppSetting).filter(AppSetting.key == "comparison_diff_segments").first()
    return {
        "p_segments":    json.loads(p_row.value) if p_row else DEFAULT_P_SEGMENTS,
        "diff_segments": json.loads(d_row.value) if d_row else DEFAULT_DIFF_SEGMENTS,
    }


@router.get("/page-access")
def get_page_access_matrix(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    """Public read of the page-access matrix so every role can render its own
    navigation. Admin always has full access (not represented in the matrix)."""
    return {
        "pages":            get_page_access(db),
        "page_keys":        PAGE_KEYS,
        "toggleable_roles": TOGGLEABLE_ROLES,
    }


@router.get("/my-capabilities")
def my_capabilities(db: Session = Depends(get_db), caller: dict = Depends(require_auth)):
    """The caller's OWN capability grants, so the UI can show the buttons and
    admin tabs they were given.

    Read live rather than baked into the JWT: a grant — and, more importantly, a
    revoke — must take effect on the next page load, not at the next login.
    Admins get the whole catalog at "all", which is the baseline grants imitate.

    `pages` are the page keys these grants unlock on their own, so navigation
    can show a page the role × page matrix alone would hide; `tabs` are the
    admin-panel tabs a non-admin grantee may open; `page_scopes` says, per
    page-view grant, whether the person sees only their own rows ("own") or the
    whole factory ("all") — the flag a page reads before pinning a supervisor
    to their unit.

    `denied_pages` is the subtractive half: pages CLOSED for this person even
    though their role opens them. The client needs it to keep the nav honest —
    a link that 403s when tapped is worse than no link — but it is only a
    rendering aid, since `require_page` refuses the data with or without it.
    """
    return {
        "caps":         caller_caps(db, caller),
        "pages":        capability_pages(db, caller),
        "tabs":         capability_tabs(db, caller),
        "page_scopes":  page_scopes(db, caller),
        "denied_pages": caller_denied_pages(db, caller),
    }
