"""Bot-filled leader checklist days, reshaped as /leaders dashboard rows.

The Google Form (→ leaders sheet → `leader_checklists`) and the in-bot /tasks
checklist are two collection layers for the SAME daily checklist. A unit's day
is served from here whenever its leader CLOSED it in the bot, and from the sheet
otherwise — the sheet stays as the history of everything filed before the bot
took over.

**Which days merge** is `merges()`, and it is deliberately narrow. Shift 2 files
in the bot, so it has always merged and still does. Shift 1 files on the Google
Form, so its bot days stay hidden — with ONE exception added on 2026-08-19 for
in-app camera proofs: a unit whose config puts any task on the mini-app camera
collects that task in the bot by construction, and a proof the platform demanded,
in the mode the platform chose, that no register anywhere displays is worse than
a duplicated row.

That exception is bounded twice, because it is a pilot and must not silently
rewrite anybody else's register: only units actually enrolled in camera capture,
and only days from `MERGE_FROM` on. A shift-1 unit that never touches the camera
reads exactly as it did before, and enrolling one later cannot resurrect bot days
it closed months ago.

A unit may also carry its OWN, later floor — `LeaderUnitSetting.bot_from`, the
day its bot filings start counting. A unit is enrolled on the day somebody has
time to teach it, and the leaders spend that day learning where the buttons are;
before the floor the bot day is a REHEARSAL, so the sheet row stays the record
and `training()` says so to the one other reader that must agree — the day
report, which would otherwise DM a score for a day the register does not show.

Only CLOSED days surface. An open day is a leader mid-checklist, not a
submission — the same rule the dashboard has always applied.
"""
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import (
    LeaderTaskDay,
    LeaderTaskDef,
    LeaderTaskEntry,
    LeaderTaskLeaderSetting,
    LeaderTaskMedia,
    LeaderTaskPhoto,
    LeaderTaskSetting,
    LeaderUnitSetting,
    Manager,
    RoleProfile,
)

# The shift that has always filed in the bot, and whose days therefore replace
# the sheet row.
MERGE_SHIFT = 2

# The day the camera exception opens. A unit enrolled in in-app capture merges
# its bot days from here on — never the ones it closed before, which belong to
# whatever regime it was under then.
MERGE_FROM = "2026-08-19"


def camera_units(db: Session) -> set[int]:
    """Supervisor units with at least one task collected through the mini-app
    camera — the only shift-1 units whose bot days merge.

    Read from the CONFIG rather than from the photos, so a day whose every task
    was answered «Yo'q» still belongs to an enrolled unit; the alternative
    ("did this day produce camera photos") would hide exactly the day a
    supervisor most wants to look at. Walks the two override levels; a GLOBAL
    default of camera is a deliberate platform-wide rollout, and then every unit
    is enrolled, which is the right answer at that point.
    """
    out: set[int] = set()
    if (db.query(LeaderTaskDef)
          .filter(LeaderTaskDef.proof_kind == "camera").first()):
        return {m.id for m in db.query(Manager.id).all()} or set()
    out |= {m for (m,) in db.query(LeaderTaskSetting.manager_id)
            .filter(LeaderTaskSetting.proof_kind == "camera").distinct().all()}
    lead_ids = [l for (l,) in db.query(LeaderTaskLeaderSetting.leader_id)
                .filter(LeaderTaskLeaderSetting.proof_kind == "camera").distinct().all()]
    if lead_ids:
        out |= {m for (m,) in db.query(RoleProfile.manager_id)
                .filter(RoleProfile.id.in_(lead_ids),
                        RoleProfile.manager_id.isnot(None)).distinct().all()}
    return out


def bot_from_floors(db: Session) -> dict[int, str]:
    """Per-unit "bot filings count from this day" floors, in one query.

    Only units an admin actually opened a rehearsal window for are in the map;
    everyone else falls through to `MERGE_FROM`, i.e. behaves as before.
    """
    return {m: (f or "").strip()
            for m, f in db.query(LeaderUnitSetting.manager_id,
                                 LeaderUnitSetting.bot_from).all()
            if (f or "").strip()}


def merges(shift: int | None, manager_id: int | None, date: str | None,
           cams: set[int], floors: dict[int, str] | None = None) -> bool:
    """Does this closed bot day replace its (leader, date) sheet row?

    THE merge rule, in one place: both readers below call it, so the register
    and the photo proxy can never disagree about whether a day is visible.

    `floors` is the per-unit rehearsal window. It can only ever move the day
    LATER — `max` against `MERGE_FROM` — so a floor typed into the admin panel
    cannot reach back past the pilot's own bound and pull months of bot days
    into a register that has never shown them.
    """
    if shift == MERGE_SHIFT:
        return True
    if manager_id not in cams:
        return False
    floor = (floors or {}).get(manager_id)
    return str(date or "") >= (max(str(floor), MERGE_FROM) if floor else MERGE_FROM)


def training(shift: int | None, manager_id: int | None, date: str | None,
             floors: dict[int, str] | None = None) -> bool:
    """Is this closed bot day a REHEARSAL — filed in the bot on a day whose
    counted submission is still the sheet row?

    Deliberately NOT `not merges(...)`. Every shift-1 unit outside the camera
    pilot fails the merge too, and those days have always been reviewed and
    reported; widening "rehearsal" to cover them would silence day reports
    nobody asked to silence. True only for a day an admin explicitly declared
    practice, and never for shift 2 — which files ONLY in the bot, so there is
    no sheet row underneath it to fall back to.
    """
    if shift == MERGE_SHIFT:
        return False
    floor = (floors or {}).get(manager_id)
    return bool(floor) and str(date or "") < str(floor)


def closed_days(
    db: Session,
    *,
    merged: bool = True,
    manager_id: int | None = None,
    leader_id: int | Iterable[int] | None = None,
) -> list[LeaderTaskDay]:
    """Closed bot days, optionally narrowed to one unit / leader.

    `leader_id` takes a collection as well as one id, because one person can
    own several leader profile records and their days hang off whichever record
    was current when each day closed (`identity.viewer_leader_profile_ids`).
    An EMPTY collection is a real answer — no record, so no days — not "every
    leader".

    `merged=False` lifts the merge rule (the admin clear tool wants every day it
    could ever delete, whichever unit filed it and whether or not it shows)."""
    q = db.query(LeaderTaskDay).filter(LeaderTaskDay.closed_at.isnot(None))
    if manager_id is not None:
        q = q.filter(LeaderTaskDay.manager_id == manager_id)
    if leader_id is not None:
        ids = [leader_id] if isinstance(leader_id, int) else list(leader_id)
        q = q.filter(LeaderTaskDay.leader_id.in_(ids))
    days = q.all()
    if not days or not merged:
        return days
    shifts = {
        m.id: m.shift
        for m in db.query(Manager).filter(Manager.id.in_({d.manager_id for d in days})).all()
    }
    cams = camera_units(db)
    floors = bot_from_floors(db)
    return [d for d in days
            if merges(shifts.get(d.manager_id), d.manager_id, d.date, cams, floors)]


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


def captures_of(db: Session, days: list[LeaderTaskDay]) -> dict[tuple[int, int], list[dict]]:
    """(day_id, task_id) → what the in-app camera recorded for each shot, in
    slot order — empty for every screenshot task and everything filed before the
    camera existed.

    Shipped beside the media ids rather than folded into them: the reviewer
    surfaces need to say «📷 taken in the app · 14:32:07», and the alternative
    was re-deriving that per photo in three different places from a table those
    pages otherwise never touch.
    """
    out: dict[tuple[int, int], list[dict]] = {}
    ids = [d.id for d in days]
    if not ids:
        return out
    for p in (db.query(LeaderTaskPhoto)
              .filter(LeaderTaskPhoto.day_id.in_(ids))
              .order_by(LeaderTaskPhoto.slot).all()):
        out.setdefault((p.day_id, p.task_id), []).append({
            "at": p.captured_at.isoformat() if p.captured_at else None,
            "late": bool(p.late),
            "deferred": bool(p.deferred),
        })
    return out


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
    caps = captures_of(db, days)

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
                        # Positionally aligned with `media` — both are built in
                        # slot order (services/leader_proof.sync_entry rebuilds
                        # the media rows from the roll on every change), so the
                        # nth capture describes the nth photo.
                        "cam": caps.get((d.id, e.task_id), []),
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
    # Everyone below admin only ever sees a bot day through a merged row, so a
    # day the merge rule does not carry has unreachable photos for them.
    mgr = db.query(Manager).filter_by(id=day.manager_id).first()
    if not merges(mgr.shift if mgr else None, day.manager_id, day.date,
                  camera_units(db), bot_from_floors(db)):
        return False
    # Below that, mirror /api/leaders exactly: only supervisors and leaders are
    # narrowed, and a personal "see all" page grant lifts both.
    if not sees_all:
        if role == "supervisor":
            return day.manager_id == payload.get("role_id")
        if role == "leader":
            from app import identity

            # Every record of this person, exactly as /api/leaders scopes the
            # rows these photos hang off — a day filed under their other
            # profile is still their own day.
            return day.leader_id in identity.viewer_leader_profile_ids(db, payload)
    return True
