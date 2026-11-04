"""
Which supervisor units a SHIFT-MANAGER reaches, and who is ANSWERABLE for a
unit — ONE definition each.

**Reach is EVERY unit — every shift, every plant** (2026-11-04, the operator:
«all shift managers should have access to all factories and all shifts»).
From 2026-09-02 until then a shift-manager reached the intersection of their
shift and their plant; :func:`unit_ids` and :func:`covers` are what every page,
guard and register reads, so widening them here widened /staff, /concerns,
/production, /tasks, /kelish, /people, the bell queue and the rest at once.
Never re-spell a shift-manager's reach at a call site.

**Answerable is every shift-manager too** (the operator, the same day:
«notify all of them») — :func:`role_ids_for_unit` returns every shift-manager
profile for any unit, so every unit's requests, approvals and live-day notices
reach every shift-manager, and a supervisor may escalate a concern to any of
them. It is the inverse of :func:`covers` again. ``role_profiles.shift`` and
``role_profiles.factory_id`` no longer decide anything about reach or routing.

The factory dimension is still attached in exactly ONE place for DATA
(``managers.factory_id``). ``role_profiles.factory_id`` says which plant a
PERSON belongs to — a record only, since 2026-11-04.
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
    """THE unit set a shift-manager reaches: every unit, every shift, every
    plant (see the module docstring).

    ``include_archived`` mirrors what each call site did before — /staff reads
    live units only, /concerns keeps archived ones so a unit's history does not
    vanish the day it is archived. An explicit list rather than None, because
    several callers spell «no unit» as ``or []``.
    """
    if not role_id:
        return []
    q = db.query(Manager.id)
    if not include_archived:
        q = q.filter(Manager.archived.is_(False))
    return [mid for (mid,) in q.all()]


def covers(db: Session, role_id: Optional[int], manager_id: Optional[int]) -> bool:
    """Is this ONE unit inside the shift-manager's reach? Every existing unit
    is (see the module docstring). Answers False for a unit that does not exist
    — a caller naming a missing unit is not authorised over it.
    """
    if not manager_id or not role_id:
        return False
    return db.query(Manager.id).filter(Manager.id == manager_id).first() is not None


def role_ids_for_unit(db: Session, manager_id: Optional[int]) -> list[int]:
    """The shift-manager profile ids answerable for a unit — the fan-out door.

    Every shift-manager profile, for any unit that exists (2026-11-04, see the
    module docstring): this decides who is notified about a unit's requests and
    whom a supervisor may escalate a concern to, and it is the inverse of
    :func:`covers`. ``concerns._sm_names`` is its in-memory twin.
    """
    if not manager_id:
        return []
    if db.query(Manager.id).filter(Manager.id == manager_id).first() is None:
        return []
    return [pid for (pid,) in db.query(RoleProfile.id)
            .filter(RoleProfile.role == "shift-manager")
            .order_by(RoleProfile.id).all()]
