from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderChecklist, Manager
from app.permissions import require_page
from app.services.name_map import _norm as _fold_name, supervisor_match

router = APIRouter(prefix="/api", tags=["leaders"])


def _norm(name: str | None) -> str:
    """Normalize a person/unit name for tolerant matching across the two source
    sheets (manager unit names vs the leaders sheet's brigadir column): uppercase
    and collapse internal whitespace."""
    return re.sub(r"\s+", " ", (name or "").strip()).upper()


# Leaders-form supervisor relabels. The checklist form tags some rows with a
# person's name that doesn't match the supervisor unit those rows belong to;
# correct them on read so the dashboard groups, scopes and ranks them under the
# right unit (no re-sync needed). Keyed on the folded name skeleton so any
# alphabet/spelling of the source resolves to the same entry.
_SUPERVISOR_RELABEL = {
    _fold_name("Abdugamitov Muhammad"): "Suvonov Elshod OF",
}


def _relabel(name: str | None) -> str:
    return _SUPERVISOR_RELABEL.get(_fold_name(name or ""), name)


@router.get("/leaders")
def get_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """All leader checklist submissions. Period/leader filtering is done
    client-side, mirroring the original Apps Script dashboard. A supervisor is
    scoped server-side to their own unit's rows so they can never read another
    brigadir's data via the raw API; admins / shift-managers / top-managers see
    everything."""
    role = payload.get("role")

    rows = (
        db.query(LeaderChecklist)
        .order_by(LeaderChecklist.date.desc(), LeaderChecklist.id.desc())
        .all()
    )

    if role == "supervisor":
        # full_name on a supervisor's JWT is the role-scoped unit (manager) name;
        # fall back to the Manager row by role_id in case the token is older.
        names = {_norm(payload.get("full_name"))}
        mgr = db.query(Manager).filter_by(id=payload.get("role_id")).first()
        if mgr:
            names.add(_norm(mgr.name))
        names.discard("")
        rows = [r for r in rows if _norm(_relabel(r.supervisor)) in names]

    # Each row's (relabeled) supervisor resolves to a shift via the Manager table.
    # The leaders sheet's «Бригадир ФИО» column is a FULL passport-form name in
    # either alphabet ("XAKIMOV RUSLAN ..."), while Manager.name is the short
    # canonical unit name ("Хакимов Руслан") — so the fuzzy supervisor_match (the
    # same matcher the QA register uses) is what bridges the alphabet + short-vs-
    # full-form gap and returns each unit's shift. A short-name matcher like
    # sheet_alias_map only catches the few rows already in short form, which is why
    # the mismatched majority collapsed onto one shift. Lets the client offer a
    # shift filter without a separate, auth-gated /api/staff/supervisors round-trip
    # (top-managers can't call it). Unmatched names carry a null shift.
    managers = db.query(Manager).all()
    sup_shift = {
        name: info["shift"]
        for name, info in supervisor_match(
            managers, {_relabel(r.supervisor) for r in rows if r.supervisor}
        ).items()
    }

    return {
        "role": role,
        "data": [
            {
                # The form's submission id when we have it — unlike the row id it
                # survives the wipe-and-reload of every sheet refresh.
                "uid": r.submission_id or f"row-{r.id}",
                "date": r.date,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "supervisor": _relabel(r.supervisor),
                "shift": sup_shift.get(_relabel(r.supervisor)),
                "leader": r.leader,
                "completion": float(r.completion or 0),
                "tasks": r.tasks or [],
            }
            for r in rows
        ],
    }
