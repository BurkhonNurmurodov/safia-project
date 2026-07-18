from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderChecklist, LeaderSyncMeta, Manager
from app.permissions import require_page
from app.services.name_map import (
    _norm as _fold_name,
    _name_tokens,
    _pair_score,
    supervisor_match,
)

router = APIRouter(prefix="/api", tags=["leaders"])


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
    brigadir's data via the raw API; a leader is likewise scoped to their own
    checklist rows; admins / shift-managers / top-managers see everything."""
    role = payload.get("role")

    rows = (
        db.query(LeaderChecklist)
        .order_by(LeaderChecklist.date.desc(), LeaderChecklist.id.desc())
        .all()
    )

    # Each row's (relabeled) supervisor resolves to a unit via the Manager table.
    # The leaders sheet's «Бригадир ФИО» column is a FULL passport-form name in
    # either alphabet ("XAKIMOV RUSLAN ..."), while Manager.name is the short
    # canonical unit name ("Хакимов Руслан") — so the fuzzy supervisor_match (the
    # same matcher the QA register uses) is what bridges the alphabet + short-vs-
    # full-form gap. Both the supervisor scoping below and the shift tagging hang
    # off this one map; a short-name matcher like sheet_alias_map only catches the
    # few rows already in short form. Lets the client offer a shift filter without
    # a separate, auth-gated /api/staff/supervisors round-trip (top-managers can't
    # call it). Unmatched names carry a null shift.
    managers = db.query(Manager).all()
    sup_match = supervisor_match(
        managers, {_relabel(r.supervisor) for r in rows if r.supervisor}
    )

    if role == "supervisor":
        # Scope by the matched unit id, not name equality: the sheet name never
        # string-equals the JWT/Manager short canonical name (alphabet + patronymic
        # + spelling drift), which used to drop every row for supervisors.
        rows = [
            r
            for r in rows
            if (sup_match.get(_relabel(r.supervisor)) or {}).get("id")
            == payload.get("role_id")
        ]
    elif role == "leader":
        # Scope a leader to their OWN checklist rows: the sheet's «Лидер ФИО» is a
        # full passport-form name in either alphabet, while the JWT carries the
        # canonical profile name — so match with the same fuzzy scorer the
        # supervisor units use (surname + first name, alphabet/form tolerant).
        # No confident name match ⇒ no rows, never another leader's data.
        me = _name_tokens(payload.get("full_name") or "")
        rows = (
            [r for r in rows if r.leader and _pair_score(_name_tokens(r.leader), me) > 0]
            if len(me) >= 2
            else []
        )

    sup_shift = {name: info["shift"] for name, info in sup_match.items()}

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
