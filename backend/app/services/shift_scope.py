"""
Which supervisor units a SHIFT-MANAGER covers — ONE definition.

A shift-manager used to be answered by SHIFT alone: every unit on shift 1,
whichever plant it stood in. The company runs more than one plant, so from
2026-09-02 (the operator's directive) the answer is the INTERSECTION — the
shift-1 manager of Keles covers the shift-1 supervisors of Keles and nobody
else.

Why this module exists at all: "the units this shift-manager covers" was
spelled NINE times before it — six in ``routers/staff.py``, one in
``routers/concerns.py``, two in ``routers/production.py`` — and every one of
them was ``Manager.shift == shift`` with no plant in it. Nine spellings of one
rule is how a shift-manager comes to read one plant's day on /staff and approve
another plant's edit request from the same screen. Never re-spell the
intersection at a call site.

The factory dimension is still attached in exactly ONE place for DATA
(``managers.factory_id``: a cell follows its supervisor, a downtime row follows
the unit its name resolves to). ``role_profiles.factory_id`` is not a second
copy of that — it says which plant a PERSON belongs to, exactly as
``role_profiles.shift`` already says which shift they work. A supervisor and a
leader answer the same question through their unit, which is why
:func:`factory_scope.viewer_factory_id` reads it off ``managers`` for them and
off the profile through here.

**A shift-manager with NO factory is unchanged: they cover their shift in every
plant.** That is the same rule ``viewer_factory_id`` already applies to a unit
nobody has assigned yet — pinning somebody to nothing would empty their pages —
and it is what makes this inert until an admin says where each shift-manager
works. It also means the answer degrades toward the OLD behaviour, never toward
an empty one.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Manager, RoleProfile


def profile(db: Session, role_id: Optional[int]) -> Optional[RoleProfile]:
    """The shift-manager profile a JWT's ``role_id`` names, or None."""
    if not role_id:
        return None
    return db.query(RoleProfile).filter_by(id=role_id, role="shift-manager").first()


def shift_of(db: Session, role_id: Optional[int]) -> Optional[int]:
    """The shift (1|2) a shift-manager profile covers.

    Pre-profile JWTs still carry the old fixed slot numbers 1-4; the rollout
    backfill created the slot profiles under those very ids, so the lookup
    covers them, with the historic 1/2→shift-1, 3/4→shift-2 mapping as a last
    resort for tokens issued before the migration ran. (Lifted verbatim from
    ``staff._sm_shift`` — it was the only one of the nine sites that had it.)
    """
    if not role_id:
        return None
    p = profile(db, role_id)
    if p and p.shift in (1, 2):
        return p.shift
    return 1 if role_id in (1, 2) else 2


def factory_of(db: Session, role_id: Optional[int]) -> Optional[int]:
    """The plant a shift-manager belongs to, or None for "every plant".

    None is a real answer and the DEFAULT one — see the module docstring. A
    legacy-slot token that resolves to no profile is treated the same way: it
    already has a shift by fallback, and inventing a plant for it would hide
    units from somebody who has read them since before factories existed.
    """
    p = profile(db, role_id)
    return p.factory_id if p else None


def unit_ids(db: Session, role_id: Optional[int], *,
             include_archived: bool = False) -> list[int]:
    """THE unit set: this shift-manager's shift, narrowed to their plant.

    ``include_archived`` mirrors what each call site did before — /staff reads
    live units only, /concerns keeps archived ones so a unit's history does not
    vanish the day it is archived.
    """
    shift = shift_of(db, role_id)
    if shift is None:
        return []
    q = db.query(Manager.id).filter(Manager.shift == shift)
    if not include_archived:
        q = q.filter(Manager.archived.is_(False))
    fac = factory_of(db, role_id)
    if fac is not None:
        q = q.filter(Manager.factory_id == fac)
    return [mid for (mid,) in q.all()]


def covers(db: Session, role_id: Optional[int], manager_id: Optional[int]) -> bool:
    """Is this ONE unit inside the shift-manager's reach?

    The single-unit door, so the guards that used to compare two shift numbers
    do not each have to remember the plant half. Answers False for a unit that
    does not exist — a caller naming a missing unit is not authorised over it.
    """
    if not manager_id:
        return False
    shift = shift_of(db, role_id)
    if shift is None:
        return False
    m = db.query(Manager.shift, Manager.factory_id).filter(Manager.id == manager_id).first()
    if m is None or m.shift != shift:
        return False
    fac = factory_of(db, role_id)
    return fac is None or m.factory_id == fac


def role_ids_for_unit(db: Session, manager_id: Optional[int]) -> list[int]:
    """The shift-manager profile ids answerable for a unit — the fan-out door.

    The inverse of :func:`covers`, and it must stay the inverse: this is what
    decides who is notified about a unit's requests and who a supervisor may
    escalate a concern to. Addressing "every manager on shift 1" is what sent
    Keles's decisions to the other plant's chat.

    A shift-manager with no plant is included for every unit on their shift —
    the same "None covers everything" rule the rest of the module runs on.
    """
    if not manager_id:
        return []
    m = db.query(Manager.shift, Manager.factory_id).filter(Manager.id == manager_id).first()
    if m is None or m.shift is None:
        return []
    return [
        p.id for p in db.query(RoleProfile.id, RoleProfile.factory_id)
        .filter(RoleProfile.role == "shift-manager", RoleProfile.shift == m.shift).all()
        if p.factory_id is None or p.factory_id == m.factory_id
    ]

