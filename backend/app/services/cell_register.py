"""The cells register's write cores — ONE cascade for /cells, the profile
editor and the Verifix sync (2026-10-12, Verifix live sync).

The 4–8 Oct one-shots wrote `cells.leader_id` and created profiles directly,
calling none of the cascades the form runs (group letters, `leader_load`, the
Jurnal). From this build every writer of a cell's links goes through here:

* `set_unit` / `set_manager` / `set_owner` record a DATED change
  (`cell_links.record` — a brigadir change lands at the unit's next shift
  opening, so no filed day moves; a leader's link counts from the day it is
  made, `cell_links.connected`). A manager pick NEVER moves the cell to another unit (the
  operator's ruling 3); a brigadir change is a dated event like any other.
* `archive` / `restore` go through `cell_archive` (archive at now; a restore
  from the next shift opening — the archived days stay archived).
* `create_cell`, `rename_cell`, `create_leader`, `release_profile`,
  `manager_pool`, `pick_manager`.

Errors are `Refused(code, message, status)` — never an HTTPException: the sync
is not a request. The router converts. Callers commit, then call
`after_commit()` (the caches every reader keeps).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Cell, Manager, RoleProfile
from app.services import cell_archive, cell_links, leader_owes
from app.services.latin_code import latin_code


class Refused(Exception):
    def __init__(self, code: str, message: str, status: int = 400, params: Optional[dict] = None):
        super().__init__(message)
        self.code, self.message, self.status, self.params = code, message, status, params or {}

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message, "params": self.params}


def after_commit() -> None:
    """Drop what readers keep in memory about cells and leaders — call AFTER
    the commit, or a concurrent request re-caches the old answer."""
    from app.services import leader_load
    leader_load.forget()
    cell_links.forget()
    cell_archive.forget()
    try:
        from app.services import leader_shift
        leader_shift.forget()
    except Exception:  # noqa: BLE001
        pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ── cells ─────────────────────────────────────────────────────────────────────

def norm_code(code: str) -> str:
    return latin_code(" ".join((code or "").split())) or ""


def unit_counts(db: Session, manager_id: Optional[int]) -> bool:
    """Does this unit's загрузка count? What a new cell's «Zagruzkada
    hisoblanadi» starts as (`profiles._unit_counts`, the same rule)."""
    if not manager_id:
        return False
    m = db.query(Manager).filter_by(id=manager_id).first()
    return bool(m and m.zagruzka_on and not m.archived)


def create_cell(db: Session, code: str, *, name_ru: Optional[str] = None,
                manager_id: Optional[int] = None, leader_id: Optional[int] = None,
                in_load: Optional[bool] = None, vfx_division_id: Optional[str] = None,
                vfx_meta: Optional[dict] = None) -> Cell:
    """A new cell. Its links are plain columns: a cell that did not exist has
    no past day to protect. Refused when the code is taken."""
    code = norm_code(code)
    if not code:
        raise Refused("code_required", "A cell needs a code")
    if db.query(Cell.id).filter(Cell.verifix_code == code).first():
        raise Refused("code_exists", f"Cell {code} already exists", 409, {"code": code})
    row = Cell(verifix_code=code, name_workshop_ru=(name_ru or None), manager_id=manager_id,
               leader_id=leader_id,
               in_load=unit_counts(db, manager_id) if in_load is None else bool(in_load),
               vfx_division_id=vfx_division_id, vfx_meta=vfx_meta)
    db.add(row)
    db.flush()
    return row


def rename_cell(db: Session, cell: Cell, v: str) -> Optional[tuple[dict, dict]]:
    """Verifix's name onto the four name columns (`verifix_org.renamed`) —
    printed only on the /cells register (2026-10-19; everywhere else a cell is
    its CODE). (before, after) or None."""
    from app.services import verifix_org
    after = verifix_org.renamed(cell, v)
    if after is None:
        return None
    before = verifix_org.names_of(cell)
    cell.name_workshop_ru = after["ru"]
    cell.name_workshop_uz_cyrl = after["uz_cyrl"]
    cell.name_workshop_uz = after["uz"]
    cell.name_workshop_en = after["en"]
    return before, after


def set_unit(db: Session, cell: Cell, manager_id: Optional[int], *, src: str,
             by: Optional[str] = None, vfx: Optional[dict] = None, apply_now: bool = False,
             leaving: Optional[dict] = None):
    """The cell's brigadir, from the unit's next shift opening.

    A move to another unit is REFUSED while the cell's work centre holds
    positions it shares with cells staying behind (`catalog_refusal`, the
    operator's ruling 2 of 2026-10-26: its positions follow it, and a shared
    one can follow nobody). `leaving` = {cell id: destination} of the other
    cells the same request moves — a team leaving together to one unit takes
    its shared positions along. A withdrawal (the unit in force) is never
    refused. The event keeps the SAP code the move was asked at, so the
    follow can name a code changed before it landed."""
    if manager_id and not db.query(Manager.id).filter(Manager.id == manager_id).first():
        raise Refused("unit_not_found", "Supervisor unit not found")
    new = manager_id or None
    eff, eff_at = cell_links.opening_for_move(db, cell.manager_id, new)
    if new != cell.manager_id:
        from app.services import catalog_refusal
        bad = catalog_refusal.shared_positions(db, cell, new, day=eff, leaving=leaving)
        if bad is not None:
            raise bad
    vfx = {**(vfx or {}), "sap_code_at_request": cell.sap_code}
    ev = cell_links.record(db, cell, "manager_id", new, src=src, by=by, vfx=vfx,
                           effective_from=eff, effective_at=eff_at)
    if ev is not None and apply_now and ev.applied_at is None:
        cell_links._apply(db, cell, ev, datetime.now(timezone.utc))
    return ev


def set_manager(db: Session, cell: Cell, leader_id: Optional[int], *, src: str,
                by: Optional[str] = None, vfx: Optional[dict] = None, mark: bool = False,
                apply_now: bool = False):
    """The cell's «Boshqaruvchi», from the day it is made (with a brigadir
    change already waiting: with that move). Never moves the cell's unit
    (ruling 3)."""
    if leader_id and not db.query(RoleProfile.id).filter(
            RoleProfile.id == leader_id, RoleProfile.role == "leader").first():
        raise Refused("leader_not_found", "Leader profile not found")
    return _record(db, cell, "leader_id", leader_id or None, src=src, by=by, vfx=vfx,
                   mark=mark, apply_now=apply_now)


def set_owner(db: Session, cell: Cell, leader_id: Optional[int], *, by: Optional[str] = None,
              vfx: Optional[dict] = None, apply_now: bool = False):
    """The cell's «Egasi» — the Verifix seat and nothing else (ruling 3: the
    manual owner is retired). Dated like every link; `owner_meta` says what
    Verifix said."""
    ev = _record(db, cell, "owner_id", leader_id or None, src="verifix", by=by or "Verifix",
                 vfx=vfx, apply_now=apply_now)
    # `owner_meta` describes the owner ON the column — written when the change
    # lands (now, or by `cell_links.apply_due` at the opening, from the event).
    if ev is not None and ev.applied_at is not None:
        cell.owner_meta = owner_meta_of(ev)
    return ev


def owner_meta_of(ev) -> Optional[dict]:
    """The `owner_meta` an applied «Egasi» event leaves on the cell."""
    if ev.value is None:
        return None
    meta = {"src": "verifix",
            "at": (ev.created_at or datetime.now(timezone.utc)).isoformat(timespec="seconds")
            if hasattr(ev, "created_at") else _now_iso(),
            "by": ev.by_name or "Verifix"}
    if ev.vfx:
        meta["vfx"] = ev.vfx
    return meta


def _record(db, cell, field, value, *, src, by, vfx=None, mark=False, apply_now=False):
    ev = cell_links.record(db, cell, field, value, src=src, by=by, vfx=vfx, mark=mark)
    if ev is not None and apply_now and ev.applied_at is None:
        cell_links._apply(db, cell, ev, datetime.now(timezone.utc))
    return ev


def archive(db: Session, cell: Cell, *, by: Optional[str], src: str) -> bool:
    return cell_archive.archive(db, cell, by=by, src=src)


def restore(db: Session, cell: Cell, *, by: Optional[str], src: str) -> bool:
    eff, _ = cell_links.opening(db, cell.manager_id)
    return cell_archive.restore(db, cell, effective_from=eff, by=by, src=src)


def held_cells(db: Session, profile_id: int, field: str = "leader_id") -> list[Cell]:
    """Every cell whose `field` names the profile now OR from a pending change."""
    from app.models import CellLinkEvent as E
    ids = {c.id for c in db.query(Cell).filter(getattr(Cell, field) == profile_id).all()}
    ids |= {cid for (cid,) in db.query(E.cell_id).filter(
        E.field == field, E.value == profile_id, E.applied_at.is_(None)).all()}
    return db.query(Cell).filter(Cell.id.in_(ids)).all() if ids else []


def release_profile(db: Session, profile_id: int, *, src: str, by: Optional[str],
                    fallback: Optional[dict] = None, apply_now: bool = False) -> list[str]:
    """Let go of every cell the profile runs or owns. `fallback` = {cell id:
    profile id} — the seat a released «Boshqaruvchi» falls back to (else no
    manager). `apply_now` clears the columns at once (a profile being deleted:
    the FK must not point at it), while the EVENT is still dated, so the days
    before read the profile as it was. Returns the codes released."""
    fallback = fallback or {}
    # A release is never a person's override of «nobody»: the cell goes back to
    # following its Verifix seat (`cell_links.MANUAL` holds no "release").
    rel = "verifix" if src == "verifix" else "release"
    out = []
    cells = held_cells(db, profile_id, "leader_id")
    for c in cells:
        to = fallback.get(c.id)
        release_one(db, c, profile_id, "leader_id", to=None if to == profile_id else to,
                    src=rel, by=by, apply_now=apply_now)
        out.append(c.verifix_code)
    for c in held_cells(db, profile_id, "owner_id"):
        release_one(db, c, profile_id, "owner_id", to=None, src=rel, by=by, apply_now=apply_now)
    return out


def release_one(db: Session, cell: Cell, profile_id: int, field: str, *, to: Optional[int],
                src: str, by: Optional[str], apply_now: bool = False) -> None:
    """Let go of ONE link that names the profile — and touch nothing that does
    not: a change already waiting for SOMEBODY ELSE (a brigadir's pick landing
    tomorrow) stands, since it takes the cell from them anyway; a change
    waiting for THEM is withdrawn and the column stands. Only where the column
    itself names them is a release recorded (dated, the profile's days before
    read as they were)."""
    waiting = cell_links.pending(db, [cell.id]).get(cell.id, {}).get(field)
    if getattr(cell, field) == profile_id:
        if waiting is not None and waiting["value"] != profile_id:
            if apply_now:
                # The FK must not point at a profile being deleted; the days
                # before the waiting change still resolve to the profile.
                setattr(cell, field, None)
                if field == "owner_id":
                    cell.owner_meta = None
            return
        if field == "owner_id":
            _record(db, cell, "owner_id", to, src=src, by=by, apply_now=apply_now)
            if apply_now:
                cell.owner_meta = None
        else:
            set_manager(db, cell, to, src=src, by=by, mark=True, apply_now=apply_now)
        return
    if waiting is not None and waiting["value"] == profile_id:
        cell_links.withdraw(db, cell, field)


# ── leader profiles ───────────────────────────────────────────────────────────

def kind_of_job(job: Optional[str]) -> str:
    from app.services import verifix_org
    return "leader" if verifix_org.is_leader_job(job) else "acting"


def create_leader(db: Session, *, emp: dict, manager_id: Optional[int],
                  owes_from, how: str = "created", name: Optional[str] = None) -> RoleProfile:
    """A leader profile for a Verifix person: the register's spelling of the
    Verifix name, kind from the job (src verifix), tied by employee id. Refused
    when that exact name stands in the unit already (a namesake the operator
    ties by hand) or when somebody is already tied to the person."""
    from app.services import verifix_org
    eid = str(emp["id"])
    if db.query(RoleProfile.id).filter(RoleProfile.vfx_employee_id == eid).first() or \
            db.query(Manager.id).filter(Manager.vfx_employee_id == eid).first():
        raise Refused("already_tied", "This Verifix person is tied to a profile already", 409)
    nm = (name or verifix_org.profile_name(emp.get("name") or "")).strip()
    if not nm:
        raise Refused("no_name", "No name")
    q = db.query(RoleProfile.id).filter(RoleProfile.role == "leader", RoleProfile.name == nm)
    q = q.filter(RoleProfile.manager_id == manager_id) if manager_id else q.filter(
        RoleProfile.manager_id.is_(None))
    if q.first():
        raise Refused("name_exists", f"A leader named {nm} exists there", 409, {"name": nm})
    at = _now_iso()
    vfx = {"checked_at": at, "found": True, "id": eid, "name": emp.get("name"),
           "job": emp.get("job") or None, "cell": emp.get("cell_raw") or emp.get("cell"),
           "status": emp.get("status"), "how": how}
    p = RoleProfile(role="leader", name=nm, manager_id=manager_id,
                    leader_kind=kind_of_job(emp.get("job")),
                    leader_kind_meta={"src": "verifix", "at": at, "by": "Verifix", "vfx": vfx},
                    vfx_employee_id=eid, owes_from=owes_from,
                    vfx_meta=person_meta(emp))
    db.add(p)
    db.flush()
    return p


def person_meta(emp: dict, prev: Optional[dict] = None) -> dict:
    """What the sync keeps of a Verifix person on the tied row — compared on
    every pass, written only when it changed."""
    out = dict(prev or {})
    out.update({"name": emp.get("name"), "status": emp.get("status"),
                "job": emp.get("job") or None, "unit": emp.get("unit_id") or emp.get("unit"),
                "cell": emp.get("cell_raw"), "hired": emp.get("hired"),
                "dismissed": emp.get("dismissed"), "photo": emp.get("photo")})
    return out


def rename_profile(db: Session, ptype: str, pid: int, new_name: str, *,
                   keep_alias: bool = True) -> str:
    """The register's rename cascade (role rows, translation keys) + the old
    spelling kept as an alias. Returns the old name. Caller commits."""
    from fastapi import HTTPException
    from app.routers import profiles as _p
    try:
        old = _p._rename_profile(db, ptype, pid, new_name)
    except HTTPException as exc:
        raise Refused("rename_refused", str(exc.detail), exc.status_code)
    if ptype == "supervisor" and old and old != new_name:
        # A unit keeps its old spelling ALWAYS: its sheet-era rows are keyed by
        # it (`name_map.sheet_alias_map`), so dropping it would blank the days
        # already reported.
        m = db.query(Manager).filter_by(id=pid).first()
        if m is not None:
            aliases = [a for a in (m.name_aliases or []) if a != new_name]
            if old not in aliases:
                aliases.append(old)
            m.name_aliases = aliases
    if keep_alias and ptype != "supervisor" and old and old != new_name:
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        if prof is not None:
            aliases = [a for a in (prof.name_aliases or []) if a != new_name]
            if old not in aliases:
                aliases.append(old)
            prof.name_aliases = aliases
            for col in ("name_uz_cyrl", "name_ru", "name_en"):
                if getattr(prof, col) == old:
                    setattr(prof, col, None)
    return old


# ── the manager picker (ruling 3) ─────────────────────────────────────────────

def _org(db: Session):
    from app.services import verifix_org
    org, at = verifix_org.stored(db)
    return org, at


def unit_divisions(db: Session, org: dict, manager_id: Optional[int]) -> dict:
    """division id → our cell code, for every cell of the unit that is tied
    (or, untied, whose code names exactly one Verifix cell)."""
    from app.services import verifix_org
    if not manager_id:
        return {}
    cells = (db.query(Cell).filter(Cell.manager_id == manager_id,
                                   cell_archive.alive_clause()).all())
    by_key = {}
    for d in (org.get("divs") or {}).values():
        k = verifix_org.code_key(d.get("raw_code"))
        if k:
            by_key.setdefault(k, []).append(d["id"])
    out = {}
    for c in cells:
        if c.vfx_division_id:
            out[c.vfx_division_id] = c.verifix_code
            continue
        ids = by_key.get(verifix_org.code_key(c.verifix_code)) or []
        if len(ids) == 1:
            out[ids[0]] = c.verifix_code
    return out


def pick_unit(db: Session, cell: Cell) -> Optional[int]:
    """The unit the cell stands in when a «Boshqaruvchi» picked NOW lands: a
    brigadir change already waiting lands first (a pick made meanwhile is
    dated with it — `cell_links.record`), so the waiting unit decides who may
    pick, whom the pool offers and where a new profile is made."""
    w = cell_links.pending(db, [cell.id]).get(cell.id, {})
    return w["manager_id"].get("value") if "manager_id" in w else cell.manager_id


def manager_pool(db: Session, cell: Cell) -> dict:
    """Who may be picked as this cell's «Boshqaruvchi»: the WORKING people
    Verifix places in a cell of the cell's unit — the seat on top as the
    suggestion, then leader jobs, then everybody else. Nobody else (ruling 3:
    nobody who is not on Verifix)."""
    from app.services import verifix_org
    org, at = _org(db)
    unit = pick_unit(db, cell)
    base = {"read_at": at.isoformat() if at else None, "pool": [], "seat": None,
            "two_seats": [], "unit_id": unit}
    if not org:
        base["reason"] = "no_read"
        return base
    divs = unit_divisions(db, org, unit)
    # The cell itself, wherever its column stands — a cell joining the unit at
    # the next opening is not among the unit's cells yet, and its own seat is
    # the suggestion.
    if cell.vfx_division_id:
        divs.setdefault(cell.vfx_division_id, cell.verifix_code)
    else:
        own = [d["id"] for d in (org.get("divs") or {}).values()
               if verifix_org.code_key(d.get("raw_code")) == verifix_org.code_key(cell.verifix_code)]
        if len(own) == 1:
            divs.setdefault(own[0], cell.verifix_code)
    if not divs:
        base["reason"] = "no_tied_cells"
        return base
    jobs = org.get("jobs") or {}
    tied = {p.vfx_employee_id: p for p in db.query(RoleProfile).filter(
        RoleProfile.vfx_employee_id.isnot(None)).all()}
    tied_units = {m.vfx_employee_id for m in db.query(Manager).filter(
        Manager.vfx_employee_id.isnot(None)).all()}
    own_div = cell.vfx_division_id or next(
        (d for d, code in divs.items() if code == cell.verifix_code), None)
    seat_ids = []
    pool = []
    names_index = namesake_index(db)
    for e in (org.get("emps") or {}).values():
        if (e.get("status") or "W") != "W" or e.get("unit") not in divs:
            continue
        job = (jobs.get(e.get("job") or "") or {}).get("name") or ""
        is_leader = verifix_org.is_leader_job(job)
        p = tied.get(e["id"])
        item = {"employee_id": e["id"], "name": verifix_org.profile_name(e.get("name") or ""),
                "vfx_name": e.get("name"), "job": job, "is_leader": is_leader,
                "cell": divs.get(e.get("unit")),
                "profile_id": p.id if p is not None and p.role == "leader" else None,
                "profile_name": p.name if p is not None else None,
                "profile_role": p.role if p is not None else None,
                "profile_unit": p.manager_id if p is not None else None,
                "pickable": (p is None or p.role == "leader") and e["id"] not in tied_units}
        # Nobody tied yet — but an untied profile may already be this person.
        if p is None and item["pickable"]:
            same = namesake(db, item["name"], names_index)
            if same is not None:
                item["pickable"] = False
                item["maybe"] = same
        if e.get("unit") == own_div and is_leader:
            seat_ids.append(e["id"])
        pool.append(item)
    if len(seat_ids) == 1:
        base["seat"] = next(i for i in pool if i["employee_id"] == seat_ids[0])
    elif len(seat_ids) > 1:
        base["two_seats"] = seat_ids
    seat_id = base["seat"]["employee_id"] if base["seat"] else None
    pool.sort(key=lambda i: (i["employee_id"] != seat_id, not i["is_leader"],
                             i["cell"] != cell.verifix_code, i["name"]))
    base["pool"] = pool
    return base


def namesake_index(db: Session) -> list:
    """[(role, name, tokens)] of every UNTIED profile and active unit — what
    `namesake` compares a Verifix person against (built once per pool)."""
    from app.services.name_map import _name_tokens
    out = [(p.role, p.name, _name_tokens(p.name)) for p in
           db.query(RoleProfile).filter(RoleProfile.vfx_employee_id.is_(None)).all()]
    out += [("supervisor", m.name, _name_tokens(m.name)) for m in
            db.query(Manager).filter(Manager.vfx_employee_id.is_(None),
                                     Manager.archived.isnot(True)).all()]
    return out


def namesake(db: Session, name: str, index: Optional[list] = None) -> Optional[dict]:
    """{role, name} of an UNTIED profile (any role) or unit sharing surname +
    first name with `name`, or of an untied leader whose name is merely alike
    — the 5 Oct SKIP rules (`verifix_sync._skip_reason`): they may already be
    this person, so a new profile would split one person's history."""
    from app.services import verifix_org
    from app.services.name_map import _name_tokens
    toks = _name_tokens(name or "")
    keys = verifix_org.two_keys(toks)
    if not keys:
        return None
    for role, nm, pt in (index if index is not None else namesake_index(db)):
        if keys & verifix_org.two_keys(pt) or (role == "leader" and verifix_org.similar(pt, toks)):
            return {"role": role, "name": nm}
    return None


def pick_manager(db: Session, cell: Cell, employee_id: Optional[str], *, by: Optional[str],
                 today=None) -> dict:
    """A brigadir's (or admin's) pick of the cell's «Boshqaruvchi» from the
    pool. None = back to the Verifix seat («Verifix bo'yicha»). Resolves the
    person to a leader profile by Verifix id, creating one (owes from the pick
    day) where none exists; never moves the cell's unit. Caller commits."""
    pool = manager_pool(db, cell)
    seat = pool.get("seat")
    if employee_id is None:
        target = seat
        if target and not target["pickable"]:
            target = None
    else:
        target = next((i for i in pool["pool"] if i["employee_id"] == str(employee_id)), None)
        if target is None:
            raise Refused("not_in_pool", "Only a worker Verifix places in this unit's cells "
                          "can run the cell", 400)
        if not target["pickable"]:
            if target.get("maybe"):
                raise Refused("maybe_existing",
                              f"{target['maybe']['name']} may be this person — tie them on "
                              "«Verifix sinxron» first", 409, target["maybe"])
            raise Refused("other_role", "This person holds another role here", 409)
    prof = None
    created = False
    unit = pool.get("unit_id")
    if target is not None:
        if target["profile_id"]:
            prof = db.query(RoleProfile).filter_by(id=target["profile_id"]).first()
            # A profile standing in NO unit (created unconnected, held) is on no
            # roster and nobody can claim it in the bot — the pick connects it
            # to the unit the cell runs in, as the hold tap does.
            if prof is not None and prof.manager_id is None and unit:
                from app.services import verifix_sync
                verifix_sync._move_leader_unit(db, prof, unit)
        else:
            # The pass's own namesake test: an UNTIED profile that may already
            # be this person (another spelling, another role) is tied by hand
            # first — a second profile would split one person's history.
            same = namesake(db, target["name"])
            if same is not None:
                raise Refused("maybe_existing",
                              f"{same['name']} may be this person — tie them on «Verifix sinxron» first",
                              409, same)
            org, _ = _org(db)
            emp = dict((org.get("emps") or {}).get(target["employee_id"]) or {})
            emp.update(job=target["job"], cell_raw=target["cell"], unit_id=emp.get("unit"))
            prof = create_leader(db, emp=emp, manager_id=unit,
                                 owes_from=today or leader_owes.unit_day(db, unit),
                                 how="picked")
            created = True
        if prof is not None and not created:
            leader_owes.picked(prof, today or leader_owes.shift_day(db, prof))
    is_seat = bool(target and seat and target["employee_id"] == seat["employee_id"])
    ev = set_manager(db, cell, prof.id if prof else None,
                     src="verifix" if (employee_id is None or is_seat) else "manual",
                     by=by, mark=True)
    return {"profile_id": prof.id if prof else None, "created": created,
            "from": ev.effective_from.isoformat() if ev is not None else None,
            "mode": "verifix" if (employee_id is None or is_seat) else "manual"}
