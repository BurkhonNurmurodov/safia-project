"""GET /api/shift-report — «Smena hisoboti», the first block of Overview.

A shift manager's status board: one row per brigadir of their own shift, five
columns, every figure computed by the page that owns it
(`services/shift_report.py` names each one). This router FETCHES and SCOPES;
the service folds.

Scope. The rows are the units the rest of Overview lists
(`factory_scope.scoped_manager_ids` — the plant lock plus the toolbar's
supervisor pick), narrowed to the reach each role already has everywhere else
on the platform — the tiers `routers/concerns.py` `_scope_query` applies:

    admin, top-manager  every unit; both shifts, as two groups
    shift-manager       their shift ∩ their plant (`shift_scope.unit_ids`)
    supervisor, leader  their own unit (reachable only through a page grant)

A shift manager whose profile names no shift reads an EMPTY board with
`note = "no_shift"`, never the whole plant: an empty scope is a real answer.

The period picker beside the table does not reach it. Each column has a fixed
window — today, yesterday, this month, whole time — and its header prints it.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderConcern, Manager, QualityComplaint
from app.permissions import require_page
from app.routers import production
from app.services import cell_hours, live_overview, shift_report, shift_scope
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.name_map import supervisor_match

router = APIRouter(prefix="/api/shift-report", tags=["shift-report"])


def _scope(db: Session, payload: dict, factory: Optional[int],
           manager_id: list) -> tuple[Optional[list[int]], Optional[str]]:
    """(the unit ids in reach — None for «no narrowing» — and a note naming why
    an empty scope is empty, when the reader has to be told)."""
    ids = scoped_manager_ids(db, payload, factory, manager_id)
    role = payload.get("role")
    rid = payload.get("role_id")
    if role == "shift-manager":
        if shift_scope.shift_of(db, rid) is None:
            return [], "no_shift"
        own = set(shift_scope.unit_ids(db, rid))
    elif role in ("supervisor", "leader"):
        own = {int(rid)} if rid else set()
    else:
        return ids, None
    return [m for m in (ids if ids is not None else own) if m in own], None


@router.get("")
def get_shift_report(
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview")),
):
    now = live_overview.now_local()
    ids, note = _scope(db, payload, factory, manager_id)
    # The quality window rides on the payload from the first line, so an empty
    # board still states which month its (absent) closure rates would have been
    # counted over, and the header never has to guess it off the browser clock.
    month, m_from, m_to = shift_report.quality_window(now.date())
    out = {
        "generated_at": now.isoformat(timespec="seconds"),
        "note": note,
        "quality_month": month,
        "shifts": [],
    }
    if empty_scope(ids):
        return out

    q = db.query(Manager).filter(Manager.archived.is_(False))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    units = q.order_by(Manager.name, Manager.id).all()
    if not units:
        return out
    unit_ids = [m.id for m in units]

    # ── O'rt. zagruzka / Bajarilish % — the «Zagruzka fayli» page's own engine,
    # the very call GET /api/production/dashboard makes, so the two figures are
    # its KPI cards' figures by construction. A unit with no production set up
    # has no dashboard to read.
    configured = production._configured_manager_ids(db)

    def totals(mid: int, day) -> Optional[dict]:
        if mid not in configured:
            return None
        return production._build_dashboard(db, mid, day)["totals"]

    # ── Hal qilingan % — the quality register for the CURRENT MONTH
    # (`shift_report.quality_window`, which is also what says why), WITHOUT the
    # hair category (`SKIP_CATEGORY`, ditto), attributed exactly as the Quality
    # page attributes it: «Отв. бригадир» resolved against EVERY live unit (a
    # subset would let the fuzzy matcher hand a row to the wrong unit), over
    # every spelling the register holds.
    #
    # The category test keeps a row whose category is NULL: in SQL `category !=
    # 'hair'` is NULL there, i.e. false, so an uncategorised record would be
    # dropped as though it were hair.
    counts = (
        db.query(QualityComplaint.brigadir, QualityComplaint.status,
                 func.count(QualityComplaint.id))
        .filter(QualityComplaint.brigadir.isnot(None),
                QualityComplaint.date >= m_from, QualityComplaint.date < m_to,
                or_(QualityComplaint.category.is_(None),
                    QualityComplaint.category != shift_report.SKIP_CATEGORY))
        .group_by(QualityComplaint.brigadir, QualityComplaint.status)
        .all()
    )
    live = db.query(Manager).filter(Manager.archived.is_(False)).all()
    match = supervisor_match(live, {b for b, _st, _n in counts if b})
    quality = shift_report.fold_quality(counts, match)

    # ── Ochiq xavotirlar — open, and sitting at the brigadir's own level.
    concerns = dict(
        db.query(LeaderConcern.brigadir_manager_id, func.count(LeaderConcern.id))
        .filter(
            LeaderConcern.brigadir_manager_id.in_(unit_ids),
            LeaderConcern.status.in_(shift_report.OPEN_CONCERN),
            or_(LeaderConcern.level == shift_report.SUPERVISOR_LEVEL,
                LeaderConcern.level.is_(None), LeaderConcern.level == ""),
        )
        .group_by(LeaderConcern.brigadir_manager_id)
        .all()
    )

    windows = cell_hours.defaults(db)
    groups: dict = {}
    for m in units:
        groups.setdefault(m.shift if m.shift in (1, 2) else None, []).append(m)
    for s in sorted(groups, key=lambda k: (k is None, k or 0)):
        today, yesterday = shift_report.report_days(now, s, windows)
        out["shifts"].append({
            "shift": s,
            "today": today.isoformat(),
            "yesterday": yesterday.isoformat(),
            "rows": [
                shift_report.row(
                    m,
                    shift_report.load_cell(totals(m.id, today)),
                    shift_report.compl_cell(totals(m.id, yesterday)),
                    shift_report.quality_cell(quality.get(m.id)),
                    concerns.get(m.id, 0),
                )
                for m in groups[s]
            ],
        })
    return out
