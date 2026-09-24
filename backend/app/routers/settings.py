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

# The platform-wide band keys: `/heatmap-thresholds` and
# `/comparison-thresholds` read them for every page that colours a load figure.
HEATMAP_KEY = "heatmap_segments"
COMP_P_KEY = "comparison_p_segments"
COMP_DIFF_KEY = "comparison_diff_segments"


# ─── Every /zagruzka table's own colour bands ─────────────────────────────────
# From 2026-09-24 (the operator's directive) each table on /zagruzka carries
# its OWN bands, edited from a button on the table itself — admin only — and no
# longer from the admin panel, whose «Ko'rinish» tab is gone. THE registry:
# table → field → (setting key, default).
#
# Two tables hold the platform-wide keys, because other pages read those keys
# and they have no other editor left: the load heatmap owns `heatmap_segments`,
# the full comparison table the two `comparison_*` keys, and saving either
# re-colours those pages too — the modal says so (`shared`). The other three
# have keys of their own, seeded ONCE from the ones they used to share
# (`startup.split_zagruzka_bands`), so no table changed colour when this shipped.
ZAGRUZKA_BANDS = {
    "load":   {"segments": (HEATMAP_KEY, DEFAULT_HEATMAP_SEGMENTS)},
    "fulfil": {"segments": ("heatmap_fulfil_segments", DEFAULT_HEATMAP_SEGMENTS)},
    "eff":    {"segments": ("heatmap_eff_segments", DEFAULT_HEATMAP_SEGMENTS)},
    "full":   {"p_segments": (COMP_P_KEY, DEFAULT_P_SEGMENTS),
               "diff_segments": (COMP_DIFF_KEY, DEFAULT_DIFF_SEGMENTS)},
    "simple": {"p_segments": ("comparison_simple_p_segments", DEFAULT_P_SEGMENTS),
               "diff_segments": ("comparison_simple_diff_segments", DEFAULT_DIFF_SEGMENTS)},
}
SHARED_BAND_KEYS = {HEATMAP_KEY, COMP_P_KEY, COMP_DIFF_KEY}
# Each table-own key → the shared key it was seeded from.
ZAGRUZKA_BAND_SEEDS = {
    "heatmap_fulfil_segments": HEATMAP_KEY,
    "heatmap_eff_segments": HEATMAP_KEY,
    "comparison_simple_p_segments": COMP_P_KEY,
    "comparison_simple_diff_segments": COMP_DIFF_KEY,
}


def _segments(raw, default):
    """A stored band list, or `default` when there is none or it cannot be
    read — a corrupt blob must never blank a table's colours."""
    try:
        segs = json.loads(raw) if raw else None
    except (TypeError, ValueError):
        segs = None
    if not isinstance(segs, list) or not segs:
        return default
    for s in segs:
        if not isinstance(s, dict) or not isinstance(s.get("color"), str):
            return default
        try:
            float(s.get("from"))
        except (TypeError, ValueError):
            return default
    return segs


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
    row = db.query(AppSetting).filter(AppSetting.key == HEATMAP_KEY).first()
    segments = json.loads(row.value) if row else DEFAULT_HEATMAP_SEGMENTS
    return {"segments": segments}


@router.get("/comparison-thresholds")
def get_comparison_thresholds(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    p_row = db.query(AppSetting).filter(AppSetting.key == COMP_P_KEY).first()
    d_row = db.query(AppSetting).filter(AppSetting.key == COMP_DIFF_KEY).first()
    return {
        "p_segments":    json.loads(p_row.value) if p_row else DEFAULT_P_SEGMENTS,
        "diff_segments": json.loads(d_row.value) if d_row else DEFAULT_DIFF_SEGMENTS,
    }


@router.get("/zagruzka-bands")
def get_zagruzka_bands(db: Session = Depends(get_db), _: dict = Depends(require_auth)):
    """Every /zagruzka table's bands in one read, each field resolved against
    its own default.

    EVERY viewer reads it — it paints their screen — while only an admin writes
    it, through `PUT /admin/settings` under the key `keys` names, so a save is
    admin-gated, action-logged and undoable with no second door. `shared` lists
    the tables whose keys other pages read too.
    """
    wanted = [key for fields in ZAGRUZKA_BANDS.values() for key, _d in fields.values()]
    stored = {r.key: r.value for r in
              db.query(AppSetting).filter(AppSetting.key.in_(wanted)).all()}
    return {
        "tables": {
            table: {field: _segments(stored.get(key), default)
                    for field, (key, default) in fields.items()}
            for table, fields in ZAGRUZKA_BANDS.items()
        },
        "keys": {
            table: {field: key for field, (key, _d) in fields.items()}
            for table, fields in ZAGRUZKA_BANDS.items()
        },
        "shared": [table for table, fields in ZAGRUZKA_BANDS.items()
                   if any(key in SHARED_BAND_KEYS for key, _d in fields.values())],
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
