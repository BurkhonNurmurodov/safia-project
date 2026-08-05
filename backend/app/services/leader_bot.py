"""Bot-filled leader checklist days, reshaped as /leaders dashboard rows.

The Google Form (→ leaders sheet → `leader_checklists`) and the in-bot /tasks
checklist are two collection layers for the SAME daily checklist. Shift 2 files
in the bot, so a shift-2 unit's day is served from here whenever the leader
closed it in the bot, and from the sheet otherwise — the sheet stays as the
history of everything filed before the bot took over.

Shift 1 still files on the form, so its bot days (if any exist at all) are
deliberately NOT merged: that page has to keep showing the sheet alone.

Only CLOSED days surface. An open day is a leader mid-checklist, not a
submission — the same rule the dashboard has always applied.
"""
from sqlalchemy.orm import Session

from app.models import (
    LeaderTaskDay,
    LeaderTaskEntry,
    LeaderTaskMedia,
    Manager,
    RoleProfile,
)

# The shift whose bot submissions replace the sheet row. Shift 1 is untouched.
MERGE_SHIFT = 2


def closed_days(
    db: Session,
    *,
    shift: int | None = MERGE_SHIFT,
    manager_id: int | None = None,
    leader_id: int | None = None,
) -> list[LeaderTaskDay]:
    """Closed bot days, optionally narrowed to one unit / leader / shift.
    `shift=None` lifts the shift filter (the admin clear tool wants every day
    it could ever delete, whichever unit filed it)."""
    q = db.query(LeaderTaskDay).filter(LeaderTaskDay.closed_at.isnot(None))
    if manager_id is not None:
        q = q.filter(LeaderTaskDay.manager_id == manager_id)
    if leader_id is not None:
        q = q.filter(LeaderTaskDay.leader_id == leader_id)
    days = q.all()
    if not days or shift is None:
        return days
    shifts = {
        m.id: m.shift
        for m in db.query(Manager).filter(Manager.id.in_({d.manager_id for d in days})).all()
    }
    return [d for d in days if shifts.get(d.manager_id) == shift]


def entries_of(db: Session, days: list[LeaderTaskDay]) -> dict[int, list[LeaderTaskEntry]]:
    by_day: dict[int, list[LeaderTaskEntry]] = {}
    ids = [d.id for d in days]
    if not ids:
        return by_day
    for e in db.query(LeaderTaskEntry).filter(LeaderTaskEntry.day_id.in_(ids)).all():
        by_day.setdefault(e.day_id, []).append(e)
    return by_day


def media_of(db: Session, entry_ids: list[int]) -> dict[int, list[int]]:
    by_entry: dict[int, list[int]] = {}
    if not entry_ids:
        return by_entry
    for m in (
        db.query(LeaderTaskMedia)
        .filter(LeaderTaskMedia.entry_id.in_(entry_ids))
        .order_by(LeaderTaskMedia.pos)
        .all()
    ):
        by_entry.setdefault(m.entry_id, []).append(m.id)
    return by_entry


def dashboard_rows(
    db: Session,
    days: list[LeaderTaskDay],
    *,
    sup_display: dict[int, str] | None = None,
) -> list[dict]:
    """Shape closed bot days like `/api/leaders` sheet rows so the dashboard
    can score, group and rank both through one code path.

    `sup_display` maps a unit id to the supervisor spelling the SHEET rows use.
    Without it a merged unit would appear twice in every picker and split its
    own standings — the sheet prints the passport-form name from the form
    ("XAKIMOV RUSLAN ..."), `Manager.name` the short canonical one.
    """
    if not days:
        return []

    profs = {
        p.id: p
        for p in db.query(RoleProfile)
        .filter(RoleProfile.id.in_({d.leader_id for d in days}))
        .all()
    }
    mgrs = {
        m.id: m
        for m in db.query(Manager).filter(Manager.id.in_({d.manager_id for d in days})).all()
    }
    by_day = entries_of(db, days)
    by_entry = media_of(db, [e.id for es in by_day.values() for e in es])

    rows = []
    for d in days:
        prof = profs.get(d.leader_id)
        if not prof:
            continue  # profile deleted since the day was filed — nothing to name it with
        mgr = mgrs.get(d.manager_id)
        rows.append(
            {
                "uid": f"bot-{d.id}",
                "source": "bot",
                "date": d.date,
                "submitted_at": d.closed_at.isoformat() if d.closed_at else None,
                "supervisor": (sup_display or {}).get(d.manager_id)
                or (mgr.name if mgr else "N/A"),
                "shift": mgr.shift if mgr else None,
                "leader_id": prof.id,
                "leader": prof.name,
                "completion": float(d.completion or 0),
                "tasks": [
                    {
                        "id": e.task_id,
                        "done": bool(e.done),
                        "answered": True,
                        "photo": "",
                        "reason": e.reason or "",
                        "media": by_entry.get(e.id, []),
                    }
                    for e in sorted(by_day.get(d.id, []), key=lambda e: e.task_id)
                ],
            }
        )
    return rows


def visible_day(db: Session, day: LeaderTaskDay, payload: dict, *, sees_all: bool) -> bool:
    """Can this viewer see the row this bot day feeds? Mirrors the scoping in
    `/api/leaders` — used by the proof-photo proxy, which streams bytes that
    belong to exactly one (leader, unit) row."""
    role = payload.get("role")
    if role == "admin":
        return True
    # Everyone below admin only ever sees a bot day through a merged row, and
    # only shift 2 merges — so a shift-1 day's photos stay unreachable for them.
    mgr = db.query(Manager).filter_by(id=day.manager_id).first()
    if not mgr or mgr.shift != MERGE_SHIFT:
        return False
    # Below that, mirror /api/leaders exactly: only supervisors and leaders are
    # narrowed, and a personal "see all" page grant lifts both.
    if not sees_all:
        if role == "supervisor":
            return day.manager_id == payload.get("role_id")
        if role == "leader":
            from app import identity

            return day.leader_id == identity.viewer_leader_profile_id(db, payload)
    return True
