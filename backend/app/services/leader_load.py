"""A leader who owes NO checklist because none of their cells counts in the
загрузка — THE definition.

From **2026-10-05** (the operator's directive): «If the leader has no cell on
the workload and didn't submit anything in October, they don't submit daily
tasks and don't affect the rating on Monitoring.» Both halves must hold:

* **no cell of theirs carries «Zagruzkada hisoblanadi»** (`cells.in_load`) —
  a leader with no cell at all included — and
* **they have filed nothing since `FROM`** (1 October 2026): no bot checklist
  day of any state (one exists only once the leader answered a task or shot a
  photo), and no Google-Form row the register resolves to them.

A leader with no counted cell who DID file in October keeps filing and keeps
being ranked; a leader with one counted cell files as always.

What follows from it, everywhere at once:

* `leader_cells.expected_days` answers `[]` from `FROM` on, so the automatic
  checks neither warn nor judge them and the brigadir's digest does not list
  them as «not filed»;
* the bot, the «Chek-list» tab and the camera page refuse their writes and say
  why — a filing would make them «filed in October» and put them back on the
  hook for every day they were told they did not owe;
* the `/leaders` ranking takes every day from `FROM` on out of BOTH sides of
  their average (the roster's `no_load_from`, folded by the client exactly
  like a cutoff, and `with_cuts` for the server's own census). Days filed
  before `FROM` keep counting — nothing already scored moves.

**Nothing is stored.** The answer is read off the cells register and the filed
days on every request (kept `_TTL` seconds), so switching a cell's
«Zagruzkada hisoblanadi» back on puts its leader back on the hook at once. It
is the CURRENT state applied from `FROM` on: `in_load` keeps no history, so a
cell switched on later makes its leader owe the days since `FROM` again.
"""
from __future__ import annotations

import threading
from time import monotonic
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.models import Cell, LeaderChecklist, LeaderTaskDay, Manager, RoleProfile

# The first day the rule reaches — «didn't submit anything in October».
FROM = "2026-10-01"

REASON = "Zagruzkada hisoblanadigan yacheykasi yo'q va oktabrda hech narsa topshirmagan"

_TTL = 60.0
_lock = threading.Lock()
_cache: dict = {"at": 0.0, "ids": None}


def _filed_since(db: Session, leaders: list[RoleProfile]) -> set[int]:
    """Every leader profile with anything filed on or after `FROM`."""
    out = {int(lid) for (lid,) in
           db.query(LeaderTaskDay.leader_id)
           .filter(LeaderTaskDay.leader_id.isnot(None),
                   LeaderTaskDay.date >= FROM).distinct().all()}
    # The Google-Form layer, resolved to a profile the way the register
    # resolves it (`routers/leaders._leaders_feed`): the supervisor spelling to
    # a unit, then the leader spelling to a profile of that unit.
    sheet = (db.query(LeaderChecklist.supervisor, LeaderChecklist.leader)
             .filter(LeaderChecklist.date >= FROM).distinct().all())
    if sheet:
        from app.services.name_map import (
            leader_match, relabel_supervisor, supervisor_match)
        sup = supervisor_match(db.query(Manager).all(),
                               {relabel_supervisor(s) for s, _ in sheet if s})
        pairs = {(l, (sup.get(relabel_supervisor(s)) or {}).get("id"))
                 for s, l in sheet if l}
        out |= {int(v["id"]) for v in leader_match(leaders, pairs).values()
                if v.get("id")}
    return out


def _compute(db: Session) -> frozenset[int]:
    leaders = db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
    if not leaders:
        return frozenset()
    counted = {int(lid) for (lid,) in
               db.query(Cell.leader_id)
               .filter(Cell.leader_id.isnot(None), Cell.in_load.is_(True))
               .distinct().all()}
    filed = _filed_since(db, leaders)
    return frozenset(p.id for p in leaders
                     if p.id not in counted and p.id not in filed)


def exempt_ids(db: Session) -> frozenset[int]:
    """Every leader profile id the rule exempts today."""
    with _lock:
        ids = _cache["ids"]
        if ids is not None and monotonic() - _cache["at"] < _TTL:
            return ids
    ids = _compute(db)
    with _lock:
        _cache["ids"] = ids
        _cache["at"] = monotonic()
    return ids


def forget() -> None:
    """Drop the kept answer — called where a cell's leader or its
    «Zagruzkada hisoblanadi» is written, so the bot answers the new state on
    the next press rather than a minute later."""
    with _lock:
        _cache["ids"] = None


def exempt(db: Session, prof, date: str | None = None) -> bool:
    """Does this leader owe nothing on `date` (today when omitted)?

    Always False before `FROM`: a day before October is read as it was filed.
    """
    pid = getattr(prof, "id", prof)
    if not pid:
        return False
    if date and str(date)[:10] < FROM:
        return False
    return int(pid) in exempt_ids(db)


def with_cuts(cuts: dict, ids) -> dict:
    """`leader_cutoffs.load()`'s map plus a cutoff from `FROM` for every
    exempt leader — for the register's own census (which names and units have
    stopped counting), so the server and the client read one rule. A real
    cutoff earlier than `FROM` stays the answer."""
    if not ids:
        return cuts
    from app.services.leader_cutoffs import person_key
    out = dict(cuts)
    for pid in ids:
        k = person_key(int(pid), None)
        cur = out.get(k)
        if cur is not None and str(cur.from_date)[:10] <= FROM:
            continue
        out[k] = SimpleNamespace(from_date=FROM, reason=REASON, set_by=None,
                                 set_at=None)
    return out
