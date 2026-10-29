"""Cells, leaders and brigadirs follow Verifix LIVE — THE sync (2026-10-12).

The operator's rulings (docs/plan-verifix-live-sync.md): every change on
Verifix happens here too, by itself where it is safe and as a one-tap
suggestion where it is not; history is never affected; the Verifix seat is a
cell's manager by default and a brigadir may override it from the unit's own
Verifix workers; rows are connected by Verifix ID, once, and followed
through the tie from then on.

Three parts:

* **the tie run** (`tie_run`) — connects every row it is SURE of: a cell by
  its code (`verifix_org.code_key`), a person by the strict name match
  (`SURE_HOW`: full name, surname + first name, a pin) narrowed by their own
  cells / unit / workshop. Everything else is listed for the operator, who
  ties it by naming the pair (`tie_by_hand` → `verifix_ties`). It writes only
  the ties.
* **the pass** (`run_pass`, the job every `ORG_TTL_S`, after a fresh org
  read): applies the AUTOMATIC column of the catalogue — cells created,
  renamed, archived at now (seen closed twice), restored (if the sync
  archived them), kinds from the job, photos, the seat as «Egasi» and as the
  default «Boshqaruvchi», a dismissal (status D with a date, seen twice)
  releasing the person's cells and cutting their results from max(date,
  today), a return lifting it — and turns everything else into queue items
  (`verifix_sync_items`). Guards: a cut answer (`verifix_org.guard`, ≥ 80 %
  of tied cells found), and per-pass caps — a pass over a cap applies
  NOTHING. Mode (`verifix_sync_mode`): "off" | "report" (default: computes,
  queues, writes nothing automatic) | "on".
* **the queue** (`apply_item` / `dismiss_item`) — the taps.

Every link change is DATED (`cell_links`, `cell_archive`) and goes through
`cell_register` — no filed day moves. A row whose tie no longer looks like
the same person (`verifix_org.same_person`) is HELD: nothing automatic
reaches it until a person confirms or re-ties it.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time as _time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import String, or_
from sqlalchemy.orm import Session

from app.models import (AppSetting, Cell, Manager, ProfilePhoto, RoleProfile, VerifixSyncItem,
                        VerifixSyncRun, VerifixTie)
from app.services import cell_links, cell_register, leader_owes, verifix_org
from app.services.cell_register import Refused
from app.services.name_map import _name_tokens

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
MODE_KEY = "verifix_sync_mode"
MODES = ("off", "report", "on")
DEFAULT_MODE = "report"
BY = verifix_org.ARCHIVED_BY
# A removal (an archive, a dismissal) acts only once the fact stood in two
# reads at least this far apart.
TWO_READS_MIN = 9
MIN_FOUND_SHARE = 0.8
# A pass that would do more than this of one thing does NOTHING (and says so):
# that is a different Verifix than the one the operator looked at.
CAPS = {"cell_archived": 15, "cell_created": 20, "dismissed": 10, "seat_moves": 30,
        "profile_created": 20}
PHOTOS_PER_PASS = 20
PROFILE_ROLES = ("leader", "shift-manager", "top-manager", "admin", "guest", "idle-owner")
# A photo the 5 Oct one-shot wrote (seeded at boot): adopted as the sync's own
# on the first pass, without fetching it again.
PHOTO_SEEDED = "seeded"
# Both blue-green copies: the job runs on one, a person's «Hozir tekshirish»
# thread on whichever served it — one pass at a time across the platform
# (leader_ai's drain is 8_140_573_112_004_331, the scheduler's 8_140_573_112_009_001).
_SYNC_LOCK_KEY = 8_140_573_112_012_207
# A hand UNTIE is kept as a tie to nobody (`vfx_id` ""): the rules never tie
# that row again by themselves (the pass's auto-tie, the tie run).
UNTIED = ""
PHOTO_RETRY_AFTER = timedelta(hours=24)   # a photo Verifix would not hand over waits this long
REARM_AFTER = timedelta(hours=3)   # an armed «two reads» older than this starts over
# Cells kept, on the operator's word, in a unit that is NOT the brigadir
# Verifix puts over them: cell code → the unit's NAME (ids differ between
# copies). The sync never suggests moving such a cell (`brigadir_differs`),
# refuses a suggestion already on the queue, and reads the seat holding that
# very unit as expected. 0811 (2026-10-14, the operator: «keep him as an
# exception»): Turdimurodov Nodirjon is counted under Aripova Manzura while
# his cell's загрузка is read in a unit made for it (the 26 Sep ruling,
# `cell_lookup.cells_unit_for_leader`); a `brigadir_differs` applied on
# 13 Oct moved 0811 to Aripova and his /production went blank.
KEPT_APART = {"0811": "Turdimurodov Nodirjon"}


def kept_apart(code) -> Optional[str]:
    """The unit NAME a cell is kept in against Verifix's brigadir, or None."""
    k = verifix_org.code_key(code)
    if not k:
        return None
    return next((u for c, u in KEPT_APART.items() if verifix_org.code_key(c) == k), None)


_pass_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return datetime.now(TZ).date()


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat(timespec="seconds") if dt else None


def mode(db: Session) -> str:
    row = db.query(AppSetting).filter_by(key=MODE_KEY).first()
    v = (row.value or "").strip() if row else ""
    return v if v in MODES else DEFAULT_MODE


def name_locked(cell, on: bool) -> bool:
    """Whether a cell's RU name is Verifix's and no person's to edit: tied,
    named by Verifix, and the sync is ON (`on` = `mode(db) == "on"`, read once
    by the caller) — the pass writes it back within ten minutes, so the cell
    form shows it read-only and the register's PUT does not write it."""
    return bool(on) and verifix_org.cell_vfx_name(cell) is not None


def set_mode(db: Session, m: str) -> None:
    if m not in MODES:
        raise Refused("bad_mode", "Mode is off, report or on")
    row = db.query(AppSetting).filter_by(key=MODE_KEY).first()
    if row is None:
        db.add(AppSetting(key=MODE_KEY, value=m))
    else:
        row.value = m


# ── what one read says, folded ────────────────────────────────────────────────

class Ctx:
    """One org read and our registers, indexed once per pass / tie run."""

    def __init__(self, db: Session, org: dict, org_at: Optional[datetime]):
        self.org, self.org_at = org, org_at
        self.preview = False            # a pass that applies nothing (`_two_reads`)
        self.divs, self.emps, self.jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
        self.cn = verifix_org.cell_nodes(self.divs, self.emps, self.jobs)
        self.rows = verifix_org.people(self.divs, self.emps, self.jobs, self.cn)
        self.by_emp = {p["id"]: p for p in self.rows}
        self.working_rows = [p for p in self.rows if p["status"] == "W"]
        self.working = verifix_org.index(self.working_rows)
        self.gone = verifix_org.index([p for p in self.rows if p["status"] != "W"])
        self.seats = verifix_org.seats(self.rows)
        self.seated = {s["id"] for sl in self.seats.values() for s in sl}
        self.cells = db.query(Cell).order_by(Cell.id).all()
        self.cell_by_div = {c.vfx_division_id: c for c in self.cells if c.vfx_division_id}
        self.cells_by_key = defaultdict(list)
        for c in self.cells:
            k = verifix_org.code_key(c.verifix_code)
            if k:
                self.cells_by_key[k].append(c)
        self.profiles = db.query(RoleProfile).order_by(RoleProfile.id).all()
        # One Verifix person tied to TWO profiles is followed for neither —
        # the pass lists the pair (`shared_tie`) until the operator unties one.
        by_emp: dict = defaultdict(list)
        for p in self.profiles:
            if p.vfx_employee_id:
                by_emp[p.vfx_employee_id].append(p)
        self.shared_emp = {k: v for k, v in by_emp.items() if len(v) > 1}
        self.prof_by_emp = {k: v[0] for k, v in by_emp.items() if len(v) == 1}
        self.units = db.query(Manager).order_by(Manager.id).all()
        self.unit_by_emp = defaultdict(list)
        for m in self.units:
            if m.vfx_employee_id:
                self.unit_by_emp[m.vfx_employee_id].append(m.id)
        live = {m.id for m in self.units if not m.archived}
        self.live_units = live
        names = {(m.name or "").strip().casefold(): m.id for m in self.units if not m.archived}
        self.kept_unit = {c.id: names.get(n.strip().casefold()) for c in self.cells
                          if (n := kept_apart(c.verifix_code))}
        self.hand = _hand_ties(db)
        # Units held UNTIED by hand (2026-10-24, the brigadir change): a person
        # said who runs the unit while Verifix still lists somebody else over
        # its cells, so the pass never suggests moving those cells to Verifix's
        # brigadir — `brigadir_differs` is not raised for them, and an item
        # already on the queue is refused (`apply_item`). Tying the unit lifts it.
        self.untied_units = {uid for uid, v in (self.hand.get("unit") or {}).items() if v == UNTIED}
        # Rows nothing automatic may reach this pass (a doubtful or missing
        # tie): filled by the people / units loops, read by the seats loop.
        self.held: set = set()
        self.over = verifix_org.brigadirs_over(
            self.divs, self.emps, self.jobs,
            {eid: tuple(i for i in ids if i in live) for eid, ids in self.unit_by_emp.items()})

    def node_of(self, cell: Cell) -> Optional[dict]:
        if cell.vfx_division_id:
            return self.cn["by_id"].get(cell.vfx_division_id)
        return None

    def own_keys(self, prof: RoleProfile) -> set:
        return {verifix_org.code_key(c.verifix_code) for c in self.cells
                if c.leader_id == prof.id} - {None}

    def unit_keys(self, mid: Optional[int]) -> set:
        return {verifix_org.code_key(c.verifix_code) for c in self.cells
                if mid and c.manager_id == mid} - {None}


def _load_org(db: Session, force: bool = False):
    org, at, fresh = verifix_org.refresh(db, force=force)
    return org, at, fresh


# ── the tie run ───────────────────────────────────────────────────────────────

def unit_held_untied(db: Session, manager_id: Optional[int]) -> bool:
    """Is this unit held UNTIED from Verifix by hand (`tie_by_hand(None)`)? Such
    a unit keeps its cells against Verifix's brigadir (the 2026-10-24 rule)."""
    if not manager_id:
        return False
    return db.query(VerifixTie.id).filter_by(kind="unit", our_id=manager_id,
                                             vfx_id=UNTIED).first() is not None


def _hand_ties(db: Session) -> dict:
    out = defaultdict(dict)
    for t in db.query(VerifixTie).all():
        out[t.kind][t.our_id] = t.vfx_id
    return out


def _cell_meta(node: dict, div: dict) -> dict:
    return {"name": node.get("name"), "raw": div.get("raw_code") or node.get("code"),
            "code": node.get("code"), "src": node.get("src"), "state": div.get("state"),
            "parent": div.get("parent"), "opened": div.get("opened"), "closed": div.get("closed")}


def _claim_sync_lock():
    """The platform-wide sync slot (a Postgres advisory lock on a connection of
    its own — the leader_ai drain's lesson: never on a Session, which hands its
    connection back at every commit). Returns the holding connection, True on
    a database without advisory locks, None when another copy holds it."""
    from sqlalchemy import text
    from app.database import engine
    if engine.dialect.name != "postgresql":
        return True
    try:
        conn = engine.connect()
    except Exception:  # noqa: BLE001
        log.exception("verifix sync: no connection to claim the lock on")
        return None
    try:
        got = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"),
                                {"k": _SYNC_LOCK_KEY}).scalar())
        conn.commit()
    except Exception:  # noqa: BLE001
        log.exception("verifix sync: could not ask for the lock")
        got = False
    if got:
        return conn
    conn.close()
    return None


def _release_sync_lock(conn) -> None:
    if conn is None or conn is True:
        return
    from sqlalchemy import text
    try:
        conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SYNC_LOCK_KEY})
        conn.commit()
    except Exception:  # noqa: BLE001 — closing the connection drops it anyway
        pass
    finally:
        conn.close()


def tie_run(db: Session, *, dry: bool = False, by: Optional[str] = None,
            force_read: bool = False) -> dict:
    """Connect every row the rules are SURE of; list the rest. Writes only
    the tie columns (and their `vfx_meta`), in one transaction with the run's
    record. `dry` computes and writes nothing (the record says what would).
    One at a time across both app copies, with the pass."""
    if not _pass_lock.acquire(blocking=False):
        raise Refused("busy", "A pass or a tie run is running", 409)
    try:
        conn = _claim_sync_lock()
        if conn is None:
            raise Refused("busy", "A pass or a tie run is running on the other app copy", 409)
        try:
            return _tie_run(db, dry=dry, by=by, force_read=force_read)
        finally:
            _release_sync_lock(conn)
    finally:
        _pass_lock.release()


def _tie_run(db: Session, *, dry: bool, by: Optional[str], force_read: bool) -> dict:
    t0 = _time.monotonic()
    org, org_at, _ = _load_org(db, force=force_read)
    g = verifix_org.guard(org)
    if g:
        rec = {"guard": g}
        _save_run(db, "tie_dry" if dry else "tie", ok=False, guard=g, org_at=org_at,
                  counts={}, changes=rec, t0=t0)
        db.commit()
        return rec
    ctx = Ctx(db, org, org_at)
    hand = _hand_ties(db)
    rep: dict = {"cells": {"tied": [], "already": 0, "untied": []},
                 "leaders": {"tied": [], "already": 0, "untied": [], "doubtful": []},
                 "units": {"tied": [], "already": 0, "untied": [], "doubtful": []},
                 "others": {"tied": [], "already": 0, "untied": []}}

    # Cells — by code. Two of ours on one key, or one key on two subdivisions,
    # is listed, never tied.
    taken_divs = {c.vfx_division_id for c in ctx.cells if c.vfx_division_id}
    would_div: dict = {}          # a dry run's cell ties, so the units are narrowed the same
    for c in sorted(ctx.cells, key=lambda x: x.verifix_code):
        if c.vfx_division_id:
            rep["cells"]["already"] += 1
            continue
        hid = hand["cell"].get(c.id)
        k = verifix_org.code_key(c.verifix_code)
        node = ctx.cn["by_id"].get(hid) if hid else ctx.cn["nodes"].get(k)
        why = None
        if hid == UNTIED:
            why, node = "hand_untied", None
        elif node is None:
            why = "dup" if k in ctx.cn["dup_keys"] else "not_in_verifix"
        elif not hid and len(ctx.cells_by_key.get(k) or []) > 1:
            why = "two_ours"
        elif node["id"] in taken_divs:
            why = "taken"
        if why:
            rep["cells"]["untied"].append({"id": c.id, "code": c.verifix_code, "why": why,
                                           "archived": c.archived_at is not None})
            continue
        div = ctx.divs.get(node["id"]) or {}
        rep["cells"]["tied"].append({"id": c.id, "code": c.verifix_code, "vfx": node["name"],
                                     "how": "hand" if hid else "code"})
        taken_divs.add(node["id"])
        would_div[c.id] = node["id"]
        if not dry:
            c.vfx_division_id = node["id"]
            c.vfx_meta = {**_cell_meta(node, div), "seen_at": _iso(org_at)}

    # People. One Verifix person answering for two rows is no tie for either.
    taken_emps = set(ctx.prof_by_emp) | set(ctx.unit_by_emp) | set(ctx.shared_emp)
    plans: list = []
    for p in sorted(ctx.profiles, key=lambda x: (x.role, x.name)):
        bucket = "leaders" if p.role == "leader" else "others"
        if p.role not in PROFILE_ROLES:
            continue
        if p.vfx_employee_id:
            rep[bucket]["already"] += 1
            e = ctx.by_emp.get(p.vfx_employee_id)
            if bucket == "leaders" and e and not verifix_org.same_person(p.name, e["name"]):
                rep["leaders"]["doubtful"].append({"id": p.id, "name": p.name,
                                                   "vfx": verifix_org.who(e)})
            continue
        hid = hand["leader" if p.role == "leader" else "profile"].get(p.id)
        if hid == UNTIED:
            plans.append((bucket, p, None, None, "hand_untied"))
            continue
        if hid:
            e = ctx.by_emp.get(hid)
            plans.append((bucket, p, e, "hand", None) if e else (bucket, p, None, None, "hand_missing"))
            continue
        toks = _name_tokens(p.name)
        own = ctx.own_keys(p) if p.role == "leader" else set()
        unit = ctx.unit_keys(p.manager_id) if p.role == "leader" else set()
        m = verifix_org.match(toks, own, unit, ctx.working, ctx.gone, ctx.working_rows)
        e, how = m.get("emp"), m.get("how")
        if e and (verifix_org.sure(how) if p.role == "leader" else how in ("full", "two")):
            plans.append((bucket, p, e, how, None))
        else:
            plans.append((bucket, p, None, how, m.get("reason") or ("weak_" + (how or ""))
                          if e else m.get("reason")))
    # Units — narrowed by the unit's Verifix workshop (the parents of its cells).
    for m_ in sorted(ctx.units, key=lambda x: x.name or ""):
        if m_.vfx_employee_id:
            rep["units"]["already"] += 1
            e = ctx.by_emp.get(m_.vfx_employee_id)
            if e and not verifix_org.same_person(m_.name, e["name"]):
                rep["units"]["doubtful"].append({"id": m_.id, "name": m_.name,
                                                 "vfx": verifix_org.who(e)})
            continue
        if m_.archived:
            continue
        hid = hand["unit"].get(m_.id)
        if hid == UNTIED:
            plans.append(("units", m_, None, None, "hand_untied"))
            continue
        if hid:
            e = ctx.by_emp.get(hid)
            plans.append(("units", m_, e, "hand", None) if e else ("units", m_, None, None, "hand_missing"))
            continue
        toks = _name_tokens(m_.name)
        shops = {(ctx.divs.get(c.vfx_division_id or would_div.get(c.id)) or {}).get("parent")
                 for c in ctx.cells
                 if c.manager_id == m_.id and (c.vfx_division_id or would_div.get(c.id))} - {None}
        m = verifix_org.match(toks, set(), set(), ctx.working, ctx.gone, ctx.working_rows)
        e, how = m.get("emp"), m.get("how")
        if not e and m.get("reason") == "ambiguous":
            hits = [x for x in m.get("cands") or [] if x["unit_id"] in shops]
            if len(hits) == 1:
                e, how = hits[0], "two+workshop"
            else:
                bs = [x for x in m.get("cands") or [] if verifix_org.is_supervisor_job(x["job"])]
                if len(bs) == 1:
                    e, how = bs[0], "two+job"
        if e and verifix_org.sure(how):
            plans.append(("units", m_, e, how, None))
        else:
            plans.append(("units", m_, None, how, m.get("reason") if not e else "weak_" + (how or "")))
    claims = Counter(e["id"] for _, _, e, _, _ in plans if e)
    for bucket, row, e, how, why in plans:
        name = row.name
        if e and (claims[e["id"]] > 1 or e["id"] in taken_emps):
            why, e = "shared" if claims[e["id"]] > 1 else "taken", None
        if not e:
            item = {"id": row.id, "name": name, "why": why}
            if bucket != "units":
                item["role"] = row.role
            rep[bucket]["untied"].append(item)
            continue
        rep[bucket]["tied"].append({"id": row.id, "name": name, "how": how,
                                    "vfx": verifix_org.who(e)})
        taken_emps.add(e["id"])
        if not dry:
            row.vfx_employee_id = e["id"]
            row.vfx_meta = {**cell_register.person_meta(e), "seen_at": _iso(org_at),
                            "how": how}
    counts = {f"{b}_{k}": (len(v) if isinstance(v, list) else v)
              for b, part in rep.items() for k, v in part.items()}
    _save_run(db, "tie_dry" if dry else "tie", ok=True, org_at=org_at, counts=counts,
              changes=rep, t0=t0, by=by)
    db.commit()
    if not dry:
        cell_register.after_commit()
        from app.services import action_log
        action_log.record_system("org", "org.verifix_tie_run", details=[
            (k, v) for k, v in counts.items() if v])
    return rep


def _photo_keys(meta: dict, org: Optional[dict], old_vid: Optional[str]) -> dict:
    """What the sync knows about a row's PHOTO, kept across a hand tie or an
    untie while the rest of `vfx_meta` is replaced: `photo_set` (the photo the
    sync itself wrote), `photo_kept` (a person's upload — never replaced) and
    `photo_failed` (a download refused lately). Dropped with the rest, the
    sync's own face read as a person's upload at the next tie (`_set_photo`:
    a photo row with no `photo_set`) and was never replaced — a profile
    re-tied to ANOTHER person kept the old face. A seeded value names no
    photo and the pass adopts whatever sha it then finds without fetching,
    which for another person would again be the old face: it becomes the OLD
    person's sha, or «stale» when Verifix no longer lists them — either is
    unequal to the new person's sha, so their photo is fetched."""
    out = {k: meta[k] for k in ("photo_set", "photo_kept", "photo_failed") if k in meta}
    if out.get("photo_set") == PHOTO_SEEDED:
        old = ((org or {}).get("emps") or {}).get(old_vid or "") or {}
        out["photo_set"] = old.get("photo") or "stale"
    return out


def fetch_photo_now(db: Session, kind: str, our_id: int) -> Optional[str]:
    """Verifix's photo onto a row a PERSON has just tied («Bog'lash», a
    confirmed doubtful tie, a seat tied to a leader) — in that request, in
    every mode. Until 2026-10-16 the face came only with an «on» pass, and in
    report mode never. The pass's own rules hold: the sync replaces only a
    photo it wrote itself, a person's upload stays (`photo_kept`), a download
    Verifix refuses is marked `photo_failed` and retried by a pass after
    PHOTO_RETRY_AFTER. Called AFTER the tie is committed: the download runs
    with no transaction open, and what it stores is committed here. Returns
    what happened — "stored", "same" (the row already carries that photo),
    "kept", "none" (Verifix holds no photo of the person), "failed" — or None
    where there is nothing to fetch (a cell, an untied row)."""
    from app.services import verifix_explore
    if kind == "cell":
        return None
    model = Manager if kind == "unit" else RoleProfile
    row = db.query(model).filter_by(id=our_id).first()
    if row is None or not row.vfx_employee_id:
        return None
    org, _ = verifix_org.stored(db)
    e = ((org or {}).get("emps") or {}).get(row.vfx_employee_id) or {}
    sha = e.get("photo")
    if not sha:
        return "none"
    meta = dict(row.vfx_meta or {})
    if meta.get("photo_set") == sha:
        return "same"
    if meta.get("photo_kept"):
        return "kept"
    key = f"supervisor:{row.id}" if kind == "unit" else f"{row.role}:{row.id}"
    act = {"kind": "photo", "key": key, "sha": sha, "row": (type(row).__name__, row.id),
           "_fetched": True}
    try:
        cfg = verifix_explore.config(db)
    except Exception:  # noqa: BLE001 — no credential on the card: a pass will try
        log.exception("verifix sync: photo %s", key)
        return "failed"
    db.commit()                       # the download must hold no pooled connection
    act["_jpeg"] = _fetch_jpeg(cfg, sha, key)
    stored = _set_photo(db, act)
    kept = not stored and bool((row.vfx_meta or {}).get("photo_kept"))
    db.commit()
    return "stored" if stored else ("kept" if kept else "failed")


def tie_by_hand(db: Session, kind: str, our_id: int, vfx_id: Optional[str], *,
                by: Optional[str], release: bool = False) -> dict:
    """The operator names the pair: our row ↔ a Verifix person / subdivision
    (None unties — and the untie is REMEMBERED, so no pass ties the row back by
    itself). A hand tie wins over every rule. Refused when the Verifix record
    is tied to another row already. `release=True` lifts a remembered untie:
    the row may be tied automatically again. Caller commits."""
    if release:
        t = db.query(VerifixTie).filter_by(kind=kind, our_id=our_id).first()
        if t is None or t.vfx_id != UNTIED:
            raise Refused("not_blocked", "This row is not held untied", 409)
        db.delete(t)
        return {"ok": True, "kind": kind, "id": our_id, "released": True}
    org, at = verifix_org.stored(db)
    if not org:
        raise Refused("no_read", "Verifix has not been read yet", 409)
    vid = str(vfx_id) if vfx_id else None
    if kind == "cell":
        row = db.query(Cell).filter_by(id=our_id).first()
        if row is None:
            raise Refused("not_found", "Cell not found", 404)
        if vid:
            if vid not in (org.get("divs") or {}):
                raise Refused("vfx_not_found", "No such subdivision in Verifix", 404)
            other = db.query(Cell.id).filter(Cell.vfx_division_id == vid, Cell.id != our_id).first()
            if other:
                raise Refused("taken", "This subdivision is tied to another cell", 409)
            div = org["divs"][vid]
            ctx_node = {"name": div.get("name"), "code": div.get("raw_code"), "src": "hand"}
            row.vfx_division_id = vid
            row.vfx_meta = {**_cell_meta(ctx_node, div), "seen_at": _iso(at)}
        else:
            row.vfx_division_id, row.vfx_meta = None, None
    elif kind in ("leader", "profile", "unit"):
        model = Manager if kind == "unit" else RoleProfile
        row = db.query(model).filter_by(id=our_id).first()
        if row is None:
            raise Refused("not_found", "Row not found", 404)
        photo_keys = _photo_keys(dict(row.vfx_meta or {}), org, row.vfx_employee_id)
        if vid:
            e = (org.get("emps") or {}).get(vid)
            if not e:
                raise Refused("vfx_not_found", "No such person in Verifix", 404)
            # One brigadir may head two units (the Suvonov Elshod pair, ruling of
            # 4 Oct) — a unit is refused only over a PROFILE holding the person.
            if (db.query(RoleProfile.id).filter(RoleProfile.vfx_employee_id == vid,
                                                RoleProfile.id != (our_id if kind != "unit" else -1)).first()
                    or (kind != "unit" and db.query(Manager.id).filter(
                        Manager.vfx_employee_id == vid).first())):
                raise Refused("taken", "This person is tied to another row", 409)
            row.vfx_employee_id = vid
            job = verifix_org.job_name(org, e.get("job"))
            row.vfx_meta = {**cell_register.person_meta({**e, "job": job}), "seen_at": _iso(at),
                            "how": "hand", "confirmed": e.get("name"), **photo_keys}
        else:
            row.vfx_employee_id, row.vfx_meta = None, (photo_keys or None)
    else:
        raise Refused("bad_kind", "Unknown kind")
    t = db.query(VerifixTie).filter_by(kind=kind, our_id=our_id).first()
    val, how = (vid, "hand") if vid else (UNTIED, "untied")
    if t is None:
        db.add(VerifixTie(kind=kind, our_id=our_id, vfx_id=val, how=how, by_name=by))
    else:
        t.vfx_id, t.how, t.by_name = val, how, by
    # A doubtful-tie item about this row is settled by the decision.
    key = {"cell": "cell", "unit": "unit"}.get(kind, "profile") + f":{our_id}"
    for it in db.query(VerifixSyncItem).filter(VerifixSyncItem.status == "open",
                                               VerifixSyncItem.key == key,
                                               VerifixSyncItem.kind.in_(
                                                   ("tie_doubtful", "missing", "shared_tie"))).all():
        it.status, it.decided_at, it.decided_by = "applied", _now(), by
    return {"ok": True, "kind": kind, "id": our_id, "vfx_id": vid}


# ── the pass ──────────────────────────────────────────────────────────────────

class Plan:
    """What one pass found: automatic actions (applied in mode "on") and
    queue items (always)."""

    def __init__(self):
        self.auto: list[dict] = []
        self.items: list[dict] = []
        self.meta: list[tuple] = []        # (row, new vfx_meta) — written only on change
        self.counts: Counter = Counter()
        self.found_share = 1.0
        self.photos = 0

    def act(self, kind: str, cap: Optional[str] = None, **kw) -> None:
        self.auto.append({"kind": kind, "cap": cap, **kw})
        if cap:
            self.counts[cap] += 1

    def item(self, kind: str, key: str, payload: dict) -> None:
        self.items.append({"kind": kind, "key": key, "payload": payload})


def _two_reads(meta: dict, flag: str, org_at: Optional[datetime],
               preview: bool = False) -> tuple[dict, bool]:
    """(new meta, act?) — the first read that sees the fact arms it, a read at
    least TWO_READS_MIN later acts on it. `preview` (a pass that applies
    nothing — mode «report», «off» pressed by hand) answers «act» whenever the
    fact holds in this read: its would-list, digest and caps then show what
    «on» will do two reads later, and it stores no arm."""
    if preview:
        return dict(meta or {}), True
    meta = dict(meta or {})
    seen = meta.get(flag)
    now = org_at or _now()
    last_key = flag + "_last"
    if not seen:
        meta[flag] = meta[last_key] = _iso(now)
        return meta, False
    try:
        first = datetime.fromisoformat(seen)
        last = datetime.fromisoformat(meta.get(last_key) or seen)
    except ValueError:
        meta[flag] = meta[last_key] = _iso(now)
        return meta, False
    if now - last > REARM_AFTER:
        # No acting pass has looked for that long (the job stopped, the mode was
        # «report»): this read is not the second of two looks — it arms again.
        meta[flag] = meta[last_key] = _iso(now)
        return meta, False
    # A fact seen on every read stays armed — its «last looked» stamp moves
    # about hourly (one write an hour, not one a pass).
    if now - last >= REARM_AFTER / 3:
        meta[last_key] = _iso(now)
    return meta, (now - first) >= timedelta(minutes=TWO_READS_MIN)


TWO_READ_FLAGS = ("gone_seen", "gone_seen_last", "dismissed_seen", "dismissed_seen_last")


def _keep_two_reads(pl: "Plan") -> None:
    """A pass refused by a guard writes nothing — except the «two reads»
    flags: a read that saw the fact GONE again must disarm it, or the read after
    the refusal would act on two looks that were not consecutive. Caller
    commits (with the refused run's record)."""
    for row, meta in pl.meta:
        old = dict(row.vfx_meta or {})
        new = dict(old)
        for f in TWO_READ_FLAGS:
            if f in (meta or {}):
                new[f] = meta[f]
            else:
                new.pop(f, None)
        if new != old:
            row.vfx_meta = new


def _disarm(meta: dict, flag: str) -> dict:
    meta = dict(meta or {})
    meta.pop(flag, None)
    meta.pop(flag + "_last", None)
    return meta


def _changed(a: Optional[dict], b: Optional[dict]) -> bool:
    strip = lambda m: {k: v for k, v in (m or {}).items() if k != "seen_at"}  # noqa: E731
    return strip(a) != strip(b)


def plan_pass(db: Session, ctx: Ctx) -> Plan:
    pl = Plan()
    today = _today()
    archived_open = []
    # ── cells
    tied_alive = [c for c in ctx.cells if c.vfx_division_id and c.archived_at is None]
    found_open = sum(1 for c in tied_alive
                     if (ctx.divs.get(c.vfx_division_id) or {}).get("state", "A") == "A"
                     and c.vfx_division_id in ctx.divs)
    pl.found_share = (found_open / len(tied_alive)) if tied_alive else 1.0
    known_divs = {c.vfx_division_id for c in ctx.cells if c.vfx_division_id}
    for c in ctx.cells:
        if not c.vfx_division_id:
            k = verifix_org.code_key(c.verifix_code)
            node = ctx.cn["nodes"].get(k)
            if (node and node["id"] not in known_divs and len(ctx.cells_by_key.get(k) or []) == 1
                    and ctx.hand["cell"].get(c.id) != UNTIED):
                pl.act("cell_tied", cell=c.id, code=c.verifix_code, div=node["id"],
                       meta=_cell_meta(node, ctx.divs.get(node["id"]) or {}))
                known_divs.add(node["id"])
            continue
        div = ctx.divs.get(c.vfx_division_id)
        node = ctx.cn["by_id"].get(c.vfx_division_id)
        meta = dict(c.vfx_meta or {})
        if div is None or (div.get("state") or "A") != "A":
            if c.archived_at is None:
                meta, go = _two_reads(meta, "gone_seen", ctx.org_at, ctx.preview)
                if go:
                    pl.act("cell_archived", cap="cell_archived", cell=c.id, code=c.verifix_code,
                           why="missing" if div is None else "closed")
            if _changed(c.vfx_meta, meta):
                pl.meta.append((c, meta))
            continue
        meta = _disarm(meta, "gone_seen")
        new_meta = {**meta, **_cell_meta(node or {"name": div.get("name"),
                                                   "code": div.get("raw_code")}, div)}
        if c.archived_at is not None:
            if c.archived_by == BY:
                pl.act("cell_restored", cell=c.id, code=c.verifix_code)
            else:
                archived_open.append(c)
                pl.item("archived_open", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                          "by": c.archived_by})
        if node is not None:
            if node["key"] and node["key"] != verifix_org.code_key(c.verifix_code):
                pl.item("code_changed", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                         "new_code": node["code"]})
            else:
                # The name FOLLOWS Verifix (2026-10-19): pulled whenever the
                # cell's RU name is not Verifix's — not only when Verifix's
                # spelling changed, which left every name that already differed
                # as it was. A Verifix rename still clears the translations of
                # the old name even where the RU name already matched.
                v = verifix_org.vx_name(node["name"], c.verifix_code)
                spelled = ((meta.get("name") or None) != (node["name"] or None)
                           and meta.get("name") is not None)
                if (v and (spelled or verifix_org.ru_differs(c, v))
                        and verifix_org.renamed(c, v) is not None):
                    pl.act("cell_renamed", cell=c.id, code=c.verifix_code, name=v)
        if _changed(c.vfx_meta, new_meta):
            pl.meta.append((c, new_meta))
    # New cells: an open Verifix cell people work in that no cell of ours is.
    for k, node in ctx.cn["nodes"].items():
        if node["id"] in known_divs or ctx.cells_by_key.get(k):
            continue
        if not node["open"] or not node["workers"]:
            continue
        pl.act("cell_created", cap="cell_created", code=node["code"], div=node["id"],
               name=verifix_org.vx_name(node["name"], node["code"]),
               meta=_cell_meta(node, ctx.divs.get(node["id"]) or {}))

    # ── units
    for m in ctx.units:
        if not m.vfx_employee_id or m.archived:
            continue
        e = ctx.by_emp.get(m.vfx_employee_id)
        meta = dict(m.vfx_meta or {})
        if e is None:
            pl.item("missing", f"unit:{m.id}", {"unit": m.id, "name": m.name,
                                                "vfx_id": m.vfx_employee_id})
            ctx.held.add(("unit", m.id))
            continue
        if not verifix_org.same_person(m.name, e["name"]) and meta.get("confirmed") != e["name"]:
            pl.item("tie_doubtful", f"unit:{m.id}", {"unit": m.id, "name": m.name,
                                                     "vfx": verifix_org.who(e)})
            ctx.held.add(("unit", m.id))
            continue
        kind = "supervisor" if verifix_org.is_supervisor_job(e["job"]) else "acting"
        if ((m.supervisor_kind_meta or {}).get("src") != "manual" and m.supervisor_kind != kind
                and e["status"] == "W"):
            pl.act("unit_kind", unit=m.id, name=m.name, value=kind, job=e["job"])
        if e["status"] == "D" and e.get("dismissed"):
            meta, go = _two_reads(meta, "dismissed_seen", ctx.org_at, ctx.preview)
            if go:
                pl.item("unit_dismissed", f"unit:{m.id}", {"unit": m.id, "name": m.name,
                                                           "date": e["dismissed"]})
        else:
            meta = _disarm(meta, "dismissed_seen")
        meta = _photo(pl, f"supervisor:{m.id}", m, e, meta)
        meta = _rename(pl, f"unit:{m.id}", {"unit": m.id}, m.name, e, meta)
        new_meta = {**meta, **cell_register.person_meta(e, None)}
        if _changed(m.vfx_meta, new_meta):
            pl.meta.append((m, new_meta))

    # ── people
    for p in ctx.profiles:
        if not p.vfx_employee_id or p.role not in PROFILE_ROLES:
            continue
        if p.vfx_employee_id in ctx.shared_emp:
            e = ctx.by_emp.get(p.vfx_employee_id)
            pl.item("shared_tie", f"profile:{p.id}", {
                "profile": p.id, "role": p.role, "name": p.name,
                "vfx": verifix_org.who(e) if e else {"id": p.vfx_employee_id},
                "others": [{"id": o.id, "role": o.role, "name": o.name}
                           for o in ctx.shared_emp[p.vfx_employee_id] if o.id != p.id]})
            continue
        e = ctx.by_emp.get(p.vfx_employee_id)
        meta = dict(p.vfx_meta or {})
        if e is None:
            pl.item("missing", f"profile:{p.id}", {"profile": p.id, "role": p.role, "name": p.name,
                                                   "vfx_id": p.vfx_employee_id})
            ctx.held.add(("profile", p.id))
            continue
        if not verifix_org.same_person(p.name, e["name"]) and meta.get("confirmed") != e["name"]:
            pl.item("tie_doubtful", f"profile:{p.id}", {"profile": p.id, "role": p.role,
                                                        "name": p.name, "vfx": verifix_org.who(e)})
            ctx.held.add(("profile", p.id))
            continue
        if p.role == "leader" and e["status"] == "W":
            kind = cell_register.kind_of_job(e["job"])
            if (p.leader_kind_meta or {}).get("src") != "manual" and p.leader_kind != kind:
                pl.act("leader_kind", profile=p.id, name=p.name, value=kind, job=e["job"])
        if e["status"] == "D" and e.get("dismissed"):
            meta, go = _two_reads(meta, "dismissed_seen", ctx.org_at, ctx.preview)
            if go and not meta.get("cut_from"):
                if p.role == "leader":
                    pl.act("dismissed", cap="dismissed", profile=p.id, name=p.name,
                           date=e["dismissed"], unit=p.manager_id)
                else:
                    pl.item("profile_dismissed", f"profile:{p.id}",
                            {"profile": p.id, "role": p.role, "name": p.name,
                             "date": e["dismissed"]})
        else:
            meta = _disarm(meta, "dismissed_seen")
            if e["status"] == "W" and meta.get("cut_from") and p.role == "leader":
                pl.act("returned", profile=p.id, name=p.name, unit=p.manager_id)
        meta = _photo(pl, f"{p.role}:{p.id}", p, e, meta)
        meta = _rename(pl, f"profile:{p.id}", {"profile": p.id, "role": p.role}, p.name, e, meta)
        new_meta = {**meta, **cell_register.person_meta(e, None)}
        if _changed(p.vfx_meta, new_meta):
            pl.meta.append((p, new_meta))

    # ── seats: the «Egasi», and the default «Boshqaruvchi»
    modes = cell_links.manager_mode(db, [c.id for c in ctx.cells if c.vfx_division_id])
    pend = cell_links.pending(db, [c.id for c in ctx.cells if c.vfx_division_id])
    new_by_emp: dict = {}
    patch: dict = defaultdict(dict)   # cell id → vfx_meta keys this loop sets
    for c in ctx.cells:
        if not c.vfx_division_id or c.archived_at is not None:
            continue
        div = ctx.divs.get(c.vfx_division_id)
        if not div or (div.get("state") or "A") != "A":
            continue
        if c.vfx_division_id not in ctx.cn["by_id"]:
            # The tied subdivision is open but no longer a cell (it lost its
            # code, became somebody's department, its code went to two places):
            # nothing about its seat is followed until a person looks.
            pl.item("not_a_cell", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                   "div": div.get("name")})
            continue
        seats = ctx.seats.get(c.vfx_division_id) or []
        pick = (c.vfx_meta or {}).get("seat_pick")
        if len(seats) > 1 and pick and any(s["id"] == pick for s in seats):
            seats = [s for s in seats if s["id"] == pick]
        pc = pend.get(c.id, {})
        cur_owner = pc["owner_id"]["value"] if "owner_id" in pc else c.owner_id
        cur_mgr = pc["leader_id"]["value"] if "leader_id" in pc else c.leader_id
        mmode = modes.get(c.id)
        seat_prof = (ctx.prof_by_emp.get(seats[0]["id"]) if len(seats) == 1 else None)
        if mmode is None and cur_mgr:
            # First sight of a cell with a manager and no decision recorded: a
            # manager who is not the seat was chosen by a person before this
            # build and stays, marked as theirs (the plan's grandfathering);
            # one who IS the seat is marked as Verifix's — so a later seat
            # change is followed, never frozen as an override.
            if seat_prof is not None and seat_prof.id == cur_mgr:
                pl.act("verifix_mark", cell=c.id, code=c.verifix_code, to=cur_mgr)
                mmode = "verifix"
            else:
                pl.act("grandfather", cell=c.id, code=c.verifix_code, to=cur_mgr)
                mmode = "manual"
        if len(seats) > 1:
            # Two leaders seated: nothing moves until the operator says which.
            pl.item("two_seats", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                  "seats": [verifix_org.who(s) for s in seats]})
            continue
        if not seats:
            # Nobody seated now. Ruling 6: only «dismissed with a date» is a
            # departure — and that is the dismissal's own two-read path, which
            # releases the person's cells. A seat that MOVED to another cell
            # (a positive fact) is released here; anything else (missing, a
            # status or job change, moved out of every cell) waits for a person.
            holds = cur_owner or (mmode != "manual" and cur_mgr)
            if not holds:
                continue
            prev = (c.vfx_meta or {}).get("seat")
            pe = ctx.by_emp.get(prev) if prev else None
            if pe is not None and pe["status"] == "D" and pe.get("dismissed"):
                continue
            if pe is not None and pe["status"] == "W" and prev in ctx.seated:
                if cur_owner:
                    pl.act("owner", cap="seat_moves", cell=c.id, code=c.verifix_code, to=None,
                           why="seat_moved")
                if mmode != "manual" and cur_mgr:
                    pl.act("manager", cap="seat_moves", cell=c.id, code=c.verifix_code, to=None,
                           why="seat_moved")
                continue
            why = ("no_seat" if not prev else "missing" if pe is None
                   else "status" if pe["status"] != "W" else "left_cells")
            pl.item("seat_gone", f"cell:{c.id}", {
                "cell": c.id, "code": c.verifix_code, "why": why,
                "seat": verifix_org.who(pe) if pe else ({"id": prev} if prev else None),
                "owner": cur_owner, "manager": cur_mgr if mmode != "manual" else None})
            continue
        s = seats[0]
        prof = ctx.prof_by_emp.get(s["id"])
        if prof is not None and ("profile", prof.id) in ctx.held:
            continue                    # a doubtful / missing tie: nothing automatic
        if prof is not None and prof.role != "leader":
            pl.item("seat_other_role", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                        "seat": verifix_org.who(s),
                                                        "profile": prof.id, "role": prof.role})
            continue
        kept = ctx.kept_unit.get(c.id)
        # The seat heading the very unit a kept-apart cell is kept in is the
        # exception itself (0811: the unit made to measure its leader's cell).
        if s["id"] in ctx.unit_by_emp and not (kept and set(ctx.unit_by_emp[s["id"]]) <= {kept}):
            pl.item("seat_other_role", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                        "seat": verifix_org.who(s), "role": "supervisor"})
            continue
        if prof is None:
            why = _skip_reason(ctx, s)
            if why:
                pl.item("seat_no_profile", f"emp:{s['id']}", {"cell": c.id, "code": c.verifix_code,
                                                              "seat": verifix_org.who(s), "why": why})
                continue
            # Connected (the cell's unit) only where they will RUN it: the cell
            # has a live brigadir and nobody a person chose runs it instead.
            # Otherwise the profile is the cell's «Egasi» alone, with no unit —
            # it files nothing until a person connects it.
            unit_ok = bool(c.manager_id and c.manager_id in ctx.live_units)
            connected = unit_ok and mmode != "manual"
            # A seat that ARRIVES under a person's override with no profile yet
            # is remembered as new, so the pass after the profile exists still
            # suggests adopting it (`seat_changed`).
            if mmode == "manual" and (c.vfx_meta or {}).get("seat") not in (None, s["id"]):
                patch[c.id]["seat_new"] = s["id"]
            if s["id"] not in new_by_emp:
                new_by_emp[s["id"]] = c.id
                pl.act("profile_created", cap="profile_created", cell=c.id, code=c.verifix_code,
                       emp=s, unit=c.manager_id if connected else None)
            if not unit_ok:
                pl.item("hold", f"emp:{s['id']}", {"cell": c.id, "code": c.verifix_code,
                                                   "seat": verifix_org.who(s), "why": "no_brigadir"})
            elif not connected:
                # A person chose another manager: the seat is the «Egasi» only,
                # with no unit — which keeps them off the registration list
                # until somebody connects them (the tap moves the profile into
                # the cell's unit, the manager stays the person's choice).
                pl.item("hold", f"emp:{s['id']}", {"cell": c.id, "code": c.verifix_code,
                                                   "seat": verifix_org.who(s),
                                                   "why": "manual_manager"})
            pl.act("owner", cap="seat_moves", cell=c.id, code=c.verifix_code, to=("emp", s["id"]),
                   seat=s)
            if connected and mmode != "manual":
                pl.act("manager", cap="seat_moves", cell=c.id, code=c.verifix_code,
                       to=("emp", s["id"]))
            continue
        if cur_owner != prof.id:
            pl.act("owner", cap="seat_moves", cell=c.id, code=c.verifix_code, to=prof.id, seat=s)
        if mmode == "manual":
            # A seat that ARRIVED under a person's override is suggested until
            # it is adopted, dismissed, or the override ends (remembered in
            # `vfx_meta.seat_new`, so the suggestion survives the next pass).
            cm = c.vfx_meta or {}
            arrived = cm.get("seat") not in (None, s["id"])
            if (arrived or cm.get("seat_new") == s["id"]) and cur_mgr != prof.id:
                patch[c.id]["seat_new"] = s["id"]
                pl.item("seat_changed", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                         "seat": verifix_org.who(s),
                                                         "profile": prof.id})
            elif cm.get("seat_new"):
                patch[c.id]["seat_new"] = None
            # The seat's profile created unconnected (a person chose another
            # manager) stays on the queue until somebody connects it — keyed
            # like the pass that created it, so it is ONE item throughout.
            if not prof.manager_id and c.manager_id and c.manager_id in ctx.live_units:
                # The payload the creating pass wrote, byte for byte — a
                # dismissal of it then holds (the tap finds the profile by the
                # seat's Verifix id).
                pl.item("hold", f"emp:{s['id']}", {"cell": c.id, "code": c.verifix_code,
                                                   "seat": verifix_org.who(s),
                                                   "why": "manual_manager"})
            continue
        if cur_mgr == prof.id:
            continue
        # A kept-apart cell's leader is counted under ANOTHER brigadir on
        # purpose: never suggest moving their profile to the cell's unit.
        if (prof.manager_id and c.manager_id and prof.manager_id != c.manager_id
                and c.id not in ctx.kept_unit):
            pl.item("leader_moved", f"profile:{prof.id}", {"profile": prof.id, "name": prof.name,
                                                           "cell": c.id, "code": c.verifix_code,
                                                           "from_unit": prof.manager_id,
                                                           "to_unit": c.manager_id})
            continue
        if not prof.manager_id:
            pl.item("hold", f"profile:{prof.id}", {"profile": prof.id, "name": prof.name,
                                                   "cell": c.id, "code": c.verifix_code,
                                                   "why": "no_unit"})
            continue
        pl.act("manager", cap="seat_moves", cell=c.id, code=c.verifix_code, to=prof.id)
    # The seat itself is remembered — the LAST one seen: a cell left with no
    # seat keeps the name of who sat there (a `seat_gone` item names them, and
    # stays one item until a person answers it).
    for c in ctx.cells:
        if not c.vfx_division_id:
            continue
        seats = ctx.seats.get(c.vfx_division_id) or []
        sid = seats[0]["id"] if len(seats) == 1 else None
        want = dict(patch.get(c.id) or {})
        if sid is not None:
            want["seat"] = sid
        cur = c.vfx_meta or {}
        if any(cur.get(k) != v for k, v in want.items()):
            found = next((m for r, m in pl.meta if r is c), None)
            base = dict(found if found is not None else cur)
            for k, v in want.items():
                if v is None:
                    base.pop(k, None)
                else:
                    base[k] = v
            pl.meta = [(r, m) for r, m in pl.meta if r is not c] + [(c, base)]

    # ── brigadirs: the one over a tied cell, and Verifix brigadirs with no unit
    by_parent: dict = defaultdict(Counter)
    # The Verifix brigadirs standing over a HELD-UNTIED unit's cells — the
    # person who left, whom Verifix still lists there. A cell with NO unit
    # under them (one the pass just created) is suggested nowhere by their
    # say-so: it would land in the unit their Verifix id is tied to now (the
    # one they moved to), not in the unit whose workshop it stands in. A
    # person decides (the seats loop's `hold`, the /cells form).
    held_over: set = set()
    for c in ctx.cells:
        if c.vfx_division_id and c.archived_at is None and c.manager_id:
            parent = (ctx.divs.get(c.vfx_division_id) or {}).get("parent")
            by_parent[parent][c.manager_id] += 1
            if c.manager_id in ctx.untied_units:
                held_over |= {b["id"] for b in ctx.over(c.vfx_division_id)}
    for c in ctx.cells:
        if not c.vfx_division_id or c.archived_at is not None:
            continue
        if c.id in ctx.kept_unit:
            continue            # kept in its unit against Verifix's brigadir (KEPT_APART)
        pc = pend.get(c.id, {})
        cur_unit = pc["manager_id"]["value"] if "manager_id" in pc else c.manager_id
        if cur_unit in ctx.untied_units:
            continue            # its unit is held untied by hand — a person named its brigadir
        bs = ctx.over(c.vfx_division_id)
        if cur_unit is None and any(b["id"] in held_over for b in bs):
            continue            # a brigadir who left names no unit for a cell with none
        units = {u for b in bs for u in b["unit"]}
        if len(units) != 1 or cur_unit in units:
            continue
        want = next(iter(units))
        parent = (ctx.divs.get(c.vfx_division_id) or {}).get("parent")
        tally = by_parent.get(parent) or Counter()
        total = sum(tally.values())
        if c.manager_id and not (total and tally[want] * 3 >= total * 2):
            continue
        pl.item("brigadir_differs", f"cell:{c.id}", {"cell": c.id, "code": c.verifix_code,
                                                     "from_unit": c.manager_id, "to_unit": want,
                                                     "brigadir": bs[0]["name"]})
    seen_b = set()
    untied_units = [(m, _name_tokens(m.name)) for m in ctx.units
                    if not m.archived and not m.vfx_employee_id]
    for e in ctx.working_rows:
        if e["id"] in seen_b or not verifix_org.is_supervisor_job(e["job"]):
            continue
        seen_b.add(e["id"])
        # Tied to a unit at all (an archived one too — archived on purpose).
        if ctx.unit_by_emp.get(e["id"]):
            continue
        if e["id"] in ctx.prof_by_emp or e["id"] in ctx.shared_emp:
            continue
        # An untied live unit that may be this person: the tie run's list
        # (the untied units, with the pair picker) is where that is settled.
        keys = verifix_org.two_keys(e["toks"])
        if any(keys & verifix_org.two_keys(t) or verifix_org.similar(t, e["toks"])
               for _, t in untied_units):
            continue
        pl.item("new_unit", f"emp:{e['id']}", {"vfx": verifix_org.who(e),
                                               "name": verifix_org.profile_name(e["name"])})
    return pl


def _folded(name: str) -> str:
    return " ".join(_name_tokens(name or ""))


def _photo(pl: Plan, key: str, row, e: dict, meta: dict) -> dict:
    """Queue Verifix's photo for the row (at most PHOTOS_PER_PASS a pass — the
    rest come on the next passes). A photo the 5 Oct one-shot wrote is adopted
    as the sync's own without fetching it again. Returns the row's meta."""
    sha = e.get("photo")
    if not sha:
        return meta
    if meta.get("photo_set") == PHOTO_SEEDED:
        return {**meta, "photo_set": sha}
    failed = meta.get("photo_failed") or {}
    if failed.get("sha") == sha:
        try:
            if _now() - datetime.fromisoformat(failed.get("at")) < PHOTO_RETRY_AFTER:
                return meta                      # this photo failed lately: wait
        except (TypeError, ValueError):
            pass
    if meta.get("photo_set") != sha and not meta.get("photo_kept"):
        if pl.photos < PHOTOS_PER_PASS:
            pl.photos += 1
            pl.act("photo", key=key, sha=sha, row=(type(row).__name__, row.id),
                   had=meta.get("photo_set"))
    return meta


def _rename(pl: Plan, key: str, ident: dict, name: str, e: dict, meta: dict) -> dict:
    """A rename is suggested only when VERIFIX's own spelling changed (the
    register's two-word names never match Verifix's full ones, so comparing
    the two would suggest a rename for nearly every row). The change is
    remembered until the register follows it or the item is dismissed."""
    prev = meta.get("name")
    if prev and prev != e["name"]:
        meta = {**meta, "renamed_from": prev}
    if not meta.get("renamed_from"):
        return meta
    new = verifix_org.profile_name(e["name"])
    if _folded(name) == _folded(new):
        meta = dict(meta)
        meta.pop("renamed_from", None)
        return meta
    pl.item("rename", key, {**ident, "name": name, "new": new, "vfx_name": e["name"],
                            "vfx_was": meta["renamed_from"]})
    return meta


def _skip_reason(ctx: Ctx, s: dict) -> Optional[str]:
    """The 5 Oct SKIP rules: why a seated leader gets no profile automatically
    — they may already be on the platform under another spelling or role."""
    toks = s["toks"]
    if len(toks) < 2:
        return "short_name"
    keys = verifix_org.two_keys(toks)
    for m in ctx.units:
        if keys & verifix_org.two_keys(_name_tokens(m.name)):
            return "other_role"
    for p in ctx.profiles:
        pt = _name_tokens(p.name)
        if p.role != "leader" and keys & verifix_org.two_keys(pt):
            return "other_role"
        if p.role == "leader" and not p.vfx_employee_id:
            if keys & verifix_org.two_keys(pt):
                return "same_name"
            if verifix_org.similar(pt, toks):
                return "similar"
    same = [x for x in ctx.working_rows if x["full"] == s["full"] and x["id"] != s["id"]
            and verifix_org.is_leader_job(x["job"])]
    if same:
        return "same_vx_name"
    return None


# ── applying ──────────────────────────────────────────────────────────────────

CAPS_KEY = "verifix_sync_caps"


def caps(db: Session) -> dict:
    """The per-pass caps — `CAPS`, each overridable by the admin page (an
    AppSetting JSON object)."""
    out = dict(CAPS)
    row = db.query(AppSetting).filter_by(key=CAPS_KEY).first()
    if row and row.value:
        try:
            for k, v in (json.loads(row.value) or {}).items():
                if k in out and isinstance(v, int) and v >= 0:
                    out[k] = v
        except (TypeError, ValueError):
            pass
    return out


def _cap_breach(pl: Plan, limits: dict) -> Optional[str]:
    for k, cap in limits.items():
        if pl.counts.get(k, 0) > cap:
            return f"cap:{k}:{pl.counts[k]}>{cap}"
    return None


def _apply(db: Session, ctx: Ctx, pl: Plan, notes: list) -> list:
    """Every automatic action, through the register's cores. Returns the
    changes made (for the run record and the digest)."""
    done = []
    created_prof: dict = {}
    cells = {c.id: c for c in ctx.cells}
    for a in pl.auto:
        try:
            with db.begin_nested():
                ok = _apply_one(db, ctx, a, cells, created_prof, notes)
        except Refused as exc:
            done.append({**_describe(a), "refused": exc.code})
            continue
        except Exception:  # noqa: BLE001 — one action's failure is said, never the pass's
            log.exception("verifix sync: %s failed", a.get("kind"))
            done.append({**_describe(a), "refused": "error"})
            continue
        if ok:
            done.append(_describe(a))
    return done


def _apply_one(db: Session, ctx: Ctx, a: dict, cells: dict, created_prof: dict,
               notes: list) -> bool:
    from app.services import leader_cutoffs
    k = a["kind"]
    if k == "cell_tied":
        c = cells[a["cell"]]
        c.vfx_division_id = a["div"]
        c.vfx_meta = {**(c.vfx_meta or {}), **a["meta"], "seen_at": _iso(ctx.org_at)}
    elif k == "cell_created":
        c = cell_register.create_cell(db, a["code"], name_ru=a.get("name"), in_load=False,
                                      vfx_division_id=a["div"],
                                      vfx_meta={**a["meta"], "seen_at": _iso(ctx.org_at)})
        cells[c.id] = c
    elif k == "cell_renamed":
        cell_register.rename_cell(db, cells[a["cell"]], a["name"])
    elif k == "cell_archived":
        cell_register.archive(db, cells[a["cell"]], by=BY, src="verifix")
    elif k == "cell_restored":
        cell_register.restore(db, cells[a["cell"]], by=BY, src="verifix")
    elif k == "unit_kind":
        m = db.query(Manager).filter_by(id=a["unit"]).first()
        meta = dict(m.supervisor_kind_meta or {})
        meta.update(src="verifix", at=_iso(_now()), by="Verifix")
        m.supervisor_kind, m.supervisor_kind_meta = a["value"], meta
    elif k == "leader_kind":
        p = db.query(RoleProfile).filter_by(id=a["profile"]).first()
        meta = dict(p.leader_kind_meta or {})
        meta.update(src="verifix", at=_iso(_now()), by="Verifix")
        p.leader_kind, p.leader_kind_meta = a["value"], meta
    elif k == "profile_created":
        e = a["emp"]
        p = cell_register.create_leader(db, emp=e, manager_id=a.get("unit"),
                                        owes_from=leader_owes.UNCLAIMED, how="seat")
        created_prof[e["id"]] = p
        ctx.prof_by_emp[e["id"]] = p
    elif k in ("owner", "manager"):
        to = a["to"]
        if isinstance(to, tuple):
            p = created_prof.get(to[1]) or ctx.prof_by_emp.get(to[1])
            if p is None:
                return False
            to = p.id
        c = cells[a["cell"]]
        if k == "owner":
            s = a.get("seat")
            cell_register.set_owner(db, c, to, vfx=verifix_org.who(s) if s else None)
        else:
            cell_register.set_manager(db, c, to, src="verifix", by="Verifix")
    elif k == "grandfather":
        c = cells[a["cell"]]
        cell_links.record(db, c, "leader_id", a["to"], src="grandfather", by="Verifix",
                          effective_from=_today(), mark=True)
    elif k == "verifix_mark":
        c = cells[a["cell"]]
        cell_links.record(db, c, "leader_id", a["to"], src="verifix", by="Verifix",
                          effective_from=_today(), mark=True)
    elif k == "dismissed":
        p = db.query(RoleProfile).filter_by(id=a["profile"]).first()
        fallback = {}
        for c in cell_register.held_cells(db, p.id, "leader_id"):
            seats = ctx.seats.get(c.vfx_division_id) or []
            if len(seats) == 1:
                sp = ctx.prof_by_emp.get(seats[0]["id"])
                if (sp is not None and sp.role == "leader" and sp.id != p.id
                        and ("profile", sp.id) not in ctx.held
                        and sp.manager_id and sp.manager_id == c.manager_id):
                    fallback[c.id] = sp.id
        codes = cell_register.release_profile(db, p.id, src="verifix", by="Verifix",
                                              fallback=fallback)
        cut = max(date.fromisoformat(a["date"][:10]), _today()).isoformat()
        # A cutoff a PERSON set stands whatever its date — its reason
        # and author are theirs (an earlier one already cuts more; a later
        # one is their call). Only the sync's own is moved.
        have = leader_cutoffs.record(leader_cutoffs.load(db), p.id, p.name)
        cut_set = False
        if have is None or ((have.set_by or "") == BY and str(have.from_date)[:10] > cut):
            reason = f"Verifix: dismissed {a['date'][:10]}"
            leader_cutoffs.set_cutoff(db, leader_id=p.id, leader_name=p.name,
                                      from_date=cut, manager_id=p.manager_id,
                                      reason=reason, actor=BY)
            leader_cutoffs.drop_pending_reviews(db, p.id, cut)
            cut_set = True
        p.vfx_meta = {**(p.vfx_meta or {}), "cut_from": cut}
        if cut_set:
            notes.append(("cutoff", p.id, {"name": p.name, "unit": p.manager_id,
                                           "from": cut, "reason": reason}))
        notes.append(("vfx_leader_dismissed", p.manager_id,
                      {"leader": p.name, "date": a["date"][:10], "cut": cut,
                       "cells": ", ".join(codes) or "—"}))
    elif k == "returned":
        p = db.query(RoleProfile).filter_by(id=a["profile"]).first()
        have = leader_cutoffs.record(leader_cutoffs.load(db), p.id, p.name)
        if have is not None and (have.set_by or "") == BY:
            leader_cutoffs.lift(db, leader_id=p.id, leader_name=p.name)
        meta = dict(p.vfx_meta or {})
        meta.pop("cut_from", None)
        p.vfx_meta = meta
        notes.append(("vfx_leader_returned", p.manager_id, {"leader": p.name}))
    elif k == "photo":
        if not _set_photo(db, a):
            return False
    else:
        return False
    return True


def _describe(a: dict) -> dict:
    out = {k: v for k, v in a.items() if k not in ("emp", "meta", "row", "cap", "seat", "_jpeg")}
    if "emp" in a:
        out["vfx"] = verifix_org.who(a["emp"])
    if isinstance(out.get("to"), tuple):
        out["to"] = "new:" + out["to"][1]
    return out


def _fetch_jpeg(cfg: dict, sha: str, key: Optional[str]) -> Optional[bytes]:
    """Verifix's photo ``sha`` as the platform's square avatar JPEG — None when
    Verifix would not hand it over or the bytes are no image (logged; the
    caller marks the row `photo_failed`)."""
    import io
    from PIL import Image, ImageOps
    from app.services import profile_photo, verifix_explore
    try:
        raw = verifix_explore.download(cfg, sha)
        if raw:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
            return profile_photo.square_jpeg(img, top=0.35)
    except Exception:  # noqa: BLE001 — the next pass tries again
        log.exception("verifix sync: photo %s", key)
    return None


def _prefetch_photos(db: Session, pl: "Plan") -> None:
    """Download the planned photos BEFORE the write phase: a slow photo door
    must not hold rows the pass already updated (and a pooled connection) for
    minutes. A photo that cannot be fetched is simply not stored this pass."""
    from app.services import verifix_explore
    acts = [a for a in pl.auto if a["kind"] == "photo"]
    if not acts:
        return
    try:
        cfg = verifix_explore.config(db)
    except Exception:  # noqa: BLE001
        return
    for a in acts:
        a["_fetched"] = True
        a["_jpeg"] = _fetch_jpeg(cfg, a["sha"], a.get("key"))


def _set_photo(db: Session, a: dict) -> bool:
    """Verifix's main photo onto the profile, unless a person uploaded one (a
    photo row the sync did not write). Returns True when stored."""
    from app.services import profile_photo, verifix_explore
    model, rid = a["row"]
    row = (db.query(Manager) if model == "Manager" else db.query(RoleProfile)).filter_by(id=rid).first()
    if row is None:
        return False
    meta = dict(row.vfx_meta or {})
    have = db.query(ProfilePhoto.profile_key).filter(ProfilePhoto.profile_key == a["key"]).first()
    if have and not meta.get("photo_set"):
        if not meta.get("photo_kept"):
            row.vfx_meta = {**meta, "photo_kept": True}
        return False
    try:
        jpeg = a.get("_jpeg")
        if jpeg is None and not a.get("_fetched"):
            jpeg = _fetch_jpeg(verifix_explore.config(db), a["sha"], a["key"])
        if not jpeg:
            row.vfx_meta = {**meta, "photo_failed": {"sha": a["sha"], "at": _iso(_now())}}
            return False
        profile_photo.store(db, a["key"], jpeg)
    except Exception:  # noqa: BLE001 — retried after PHOTO_RETRY_AFTER
        log.exception("verifix sync: photo %s", a["key"])
        row.vfx_meta = {**meta, "photo_failed": {"sha": a["sha"], "at": _iso(_now())}}
        return False
    meta.pop("photo_failed", None)
    row.vfx_meta = {**meta, "photo_set": a["sha"]}
    return True


# ── the queue ─────────────────────────────────────────────────────────────────

def _hash(kind: str, payload: dict) -> str:
    keep = {k: v for k, v in payload.items() if k not in ("since",)}
    return hashlib.sha1(json.dumps([kind, keep], sort_keys=True, default=str).encode()).hexdigest()


def _queue(db: Session, pl: Plan) -> dict:
    """Open what is new, refresh what stands, settle what went away. A
    dismissed fact does not come back until Verifix says something else."""
    now = _now()
    want = {}
    for it in pl.items:
        want[(it["kind"], it["key"])] = it
    rows = db.query(VerifixSyncItem).filter(VerifixSyncItem.status.in_(("open", "dismissed"))).all()
    by = defaultdict(list)
    for r in rows:
        by[(r.kind, r.key)].append(r)
    opened = refreshed = settled = 0
    for (kind, key), it in want.items():
        h = _hash(kind, it["payload"])
        existing = by.get((kind, key)) or []
        if any(r.status == "dismissed" and r.value_hash == h for r in existing):
            for r in existing:
                if r.status == "open":
                    r.status, r.decided_at, r.decided_by = "settled", now, "Verifix"
                    settled += 1
            continue
        open_ = next((r for r in existing if r.status == "open"), None)
        if open_ is not None:
            if open_.value_hash != h:
                open_.payload, open_.value_hash = it["payload"], h
            open_.last_seen = now
            refreshed += 1
            continue
        db.add(VerifixSyncItem(kind=kind, key=key, payload=it["payload"], value_hash=h,
                               status="open", first_seen=now, last_seen=now))
        opened += 1
    for (kind, key), rs in by.items():
        if (kind, key) in want:
            continue
        for r in rs:
            if r.status == "open":
                r.status, r.decided_at, r.decided_by = "settled", now, "Verifix"
                settled += 1
    return {"opened": opened, "refreshed": refreshed, "settled": settled}


def run_pass(db: Session, *, force_read: bool = False, by: Optional[str] = None,
             dry: bool = False, mode_override: Optional[str] = None) -> dict:
    """One pass: read (when due), apply what is due on the links, plan, guard,
    apply (mode "on"), queue, record, tell. Never two at once in a process."""
    if not _pass_lock.acquire(blocking=False):
        return {"busy": True}
    try:
        # The Verifix read (up to READ_BUDGET_S) BEFORE the platform-wide slot:
        # holding its connection through the read would leave the pool one
        # short for minutes of every interval. The read is single-flight per
        # process and stored, so `_run` then finds it fresh.
        if (mode_override or mode(db)) != "off" or force_read:
            try:
                _load_org(db, force=force_read)
            except Exception:  # noqa: BLE001 — `_run` reads again and records the failure
                db.rollback()
        conn = _claim_sync_lock()
        if conn is None:
            return {"busy": True, "where": "other_copy"}
        try:
            return _run(db, force_read=force_read, by=by, dry=dry, mode_override=mode_override,
                        read_done=True)
        finally:
            _release_sync_lock(conn)
    finally:
        _pass_lock.release()


def _last_run(db: Session) -> Optional[VerifixSyncRun]:
    return (db.query(VerifixSyncRun).filter(VerifixSyncRun.kind == "pass")
            .order_by(VerifixSyncRun.id.desc()).first())


def _run(db: Session, *, force_read: bool, by: Optional[str], dry: bool,
         mode_override: Optional[str], read_done: bool = False) -> dict:
    t0 = _time.monotonic()
    m = mode_override or mode(db)
    if m == "off" and not force_read:
        return {"mode": "off"}
    try:
        cell_links.apply_due(db)
        db.commit()
        cell_register.after_commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("verifix sync: apply_due failed")
    # `read_done`: the caller already read (forced or due) before taking the slot.
    org, org_at, fresh = _load_org(db, force=force_read and not read_done)
    last = _last_run(db)
    if not force_read and not dry and last is not None and org_at is not None \
            and last.org_at is not None and last.org_at >= org_at:
        return {"mode": m, "skipped": "no_new_read"}
    g = verifix_org.guard(org)
    if g:
        rec = _save_run(db, "dry" if dry else "pass", ok=False, guard=g, org_at=org_at,
                        counts={}, changes={}, t0=t0, mode=m, by=by)
        db.commit()
        _tell_guard(db, rec, g)
        return {"mode": m, "guard": g}
    ctx = Ctx(db, org, org_at)
    ctx.preview = m != "on"
    pl = plan_pass(db, ctx)
    guard = None
    if pl.found_share < MIN_FOUND_SHARE:
        guard = f"found:{pl.found_share:.2f}"
    guard = guard or _cap_breach(pl, caps(db))
    if guard:
        db.rollback()
        if m == "on" and not dry:
            _keep_two_reads(pl)
        rec = _save_run(db, "dry" if dry else "pass", ok=False, guard=guard, org_at=org_at,
                        counts=dict(pl.counts), changes={"would": [_describe(a) for a in pl.auto]},
                        t0=t0, mode=m, by=by)
        db.commit()
        _tell_guard(db, rec, guard)
        return {"mode": m, "guard": guard}
    notes: list = []
    done = []
    if dry:
        db.rollback()
        # Every planned kind, as a report-mode pass counts them — the capped
        # kinds alone (`pl.counts`) made a trial run read smaller than it is.
        rec = _save_run(db, "dry", ok=True, org_at=org_at,
                        counts=dict(Counter(a["kind"] for a in pl.auto)),
                        changes={"would": [_describe(a) for a in pl.auto],
                                 "items": pl.items}, t0=t0, mode=m, by=by)
        db.commit()
        return {"mode": m, "dry": True, "would": len(pl.auto), "items": len(pl.items),
                "run": rec.id}
    # What a pass REMEMBERS (two-read arms, the last seat, Verifix's last
    # spelling) is written only when it ACTS — a report-mode pass that wrote it
    # would consume the change it only reported, and «on» would never act on it.
    if m == "on":
        if any(a["kind"] == "photo" for a in pl.auto):
            # End the read transaction first: up to PHOTOS_PER_PASS downloads
            # must not keep a pooled connection «idle in transaction» holding
            # share locks a deploy's boot ALTER TABLE would queue behind.
            db.commit()
            _prefetch_photos(db, pl)
        for row, meta in pl.meta:
            row.vfx_meta = meta
        done = _apply(db, ctx, pl, notes)
    q = _queue(db, pl)
    would = [_describe(a) for a in pl.auto] if m != "on" else []
    counts = dict(Counter(d["kind"] for d in done)) if m == "on" else \
        dict(Counter(a["kind"] for a in pl.auto))
    counts.update({f"queue_{k}": v for k, v in q.items() if v})
    rec = _save_run(db, "pass", ok=True, org_at=org_at, counts=counts,
                    changes={"done": done, "would": would}, t0=t0, mode=m, by=by)
    db.commit()
    cell_register.after_commit()
    changed = [d for d in done if not d.get("refused")]
    if changed:
        from app.services import action_log
        action_log.record_system(
            "org", "org.verifix_sync_pass",
            details=[("mode", m)] + [(k, v) for k, v in counts.items()] +
                    [("change", _line(d)) for d in changed[:40]])
    _notify(db, notes)
    _digest(db, rec, last, m, done, would, q)
    return {"mode": m, "done": len(done), "would": len(would), "queue": q, "run": rec.id}


RUNS_KEEP_REPORT = timedelta(days=3)    # report / trial runs re-list the same plan every pass
RUNS_KEEP = timedelta(days=90)


def _purge_runs(db) -> None:
    now = _now()
    db.query(VerifixSyncRun).filter(
        VerifixSyncRun.finished_at < now - RUNS_KEEP_REPORT,
        or_(VerifixSyncRun.kind.in_(("dry", "tie_dry")), VerifixSyncRun.mode == "report"),
    ).delete(synchronize_session=False)
    db.query(VerifixSyncRun).filter(VerifixSyncRun.finished_at < now - RUNS_KEEP) \
        .delete(synchronize_session=False)


def _save_run(db, kind, *, ok, org_at, counts, changes, t0, guard=None, mode=None, by=None):
    try:
        with db.begin_nested():
            _purge_runs(db)
    except Exception:  # noqa: BLE001 — housekeeping never costs the record
        log.exception("verifix sync: run purge")
    rec = VerifixSyncRun(kind=kind, mode=mode, org_at=org_at, ok=ok, guard=guard,
                         counts=counts, changes=json.loads(json.dumps(changes, default=str)),
                         finished_at=_now(), ms=int((_time.monotonic() - t0) * 1000),
                         error=None)
    db.add(rec)
    db.flush()
    return rec


def _line(d: dict) -> str:
    k = d.get("kind")
    who = d.get("code") or d.get("name") or d.get("key") or ""
    extra = (d.get("to") if k in ("owner", "manager")
             else ("→ " + d["name"]) if k == "cell_renamed" and d.get("name")
             else d.get("date") or d.get("why") or "")
    return f"{k} {who} {extra or ''}".strip()


# ── telling people ────────────────────────────────────────────────────────────

def _notify(db: Session, notes: list) -> None:
    """The brigadir of a dismissed (or returned) leader, once."""
    if not notes:
        return
    try:
        from app.identity import profile_key
        from app.routers.staff import notify_profile
        from app.services import leader_reports
        for nkey, mid, params in notes:
            if nkey == "cutoff":
                try:
                    leader_reports.notify_cutoff(
                        db, leader_id=mid, leader_name=params["name"], manager_id=params["unit"],
                        from_date=params["from"], reason=params["reason"], actor=BY)
                except Exception:  # noqa: BLE001
                    log.exception("verifix sync: cutoff notice failed")
                continue
            if mid:
                notify_profile(db, profile_key("supervisor", mid), nkey, params, type="warning",
                               subject=("page", "/cells"))
        db.commit()
    except Exception:  # noqa: BLE001 — a notice never undoes the pass
        db.rollback()
        log.exception("verifix sync: brigadir notices failed")


def _dm(text: str) -> None:
    try:
        from app.routers.boot import _recipients
        from app.telegram_bot import bot
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text[:4000], parse_mode="HTML")
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        log.exception("verifix sync: admin DM failed")


def _esc(v) -> str:
    import html
    return html.escape(str(v if v is not None else ""))


def _digest(db: Session, rec: VerifixSyncRun, last: Optional[VerifixSyncRun], m: str,
            done: list, would: list, q: dict) -> None:
    """One DM to the admins after a pass that changed something (or, in
    report mode, whose would-do list differs from the previous pass)."""
    if m == "on":
        # A refusal repeated every pass is said once — when it is new.
        prev_ref = sorted(_line(x) for x in ((last.changes or {}).get("done") or [] if last else [])
                          if x.get("refused"))
        refused = sorted(_line(x) for x in done if x.get("refused"))
        if not [d for d in done if not d.get("refused")] and not q.get("opened") \
                and refused == prev_ref:
            return
    if m != "on":
        prev = ((last.changes or {}).get("would") if last is not None else None) or []
        if sorted(_line(x) for x in prev) == sorted(_line(x) for x in would) \
                and not q.get("opened"):
            return
    open_n = db.query(VerifixSyncItem).filter(VerifixSyncItem.status == "open").count()
    head = ("🔄 <b>Verifix sinxron</b>" + (" · <i>faqat hisobot</i>" if m != "on" else ""))
    lines = [head, ""]
    rows = done if m == "on" else would
    tally = Counter(d["kind"] for d in rows)
    if tally:
        lines.append(("Bajarildi: " if m == "on" else "Bajarilardi: ") +
                     ", ".join(f"{k} {v}" for k, v in sorted(tally.items())))
        for d in rows[:25]:
            lines.append("• " + _esc(_line(d)))
        if len(rows) > 25:
            lines.append(f"… +{len(rows) - 25}")
    if q.get("opened"):
        lines.append(f"\nYangi takliflar: {q['opened']}")
    lines.append(f"Kutayotgan takliflar: {open_n}")
    lines.append("👉 /admin/upload?tab=verifixsync")
    _dm("\n".join(lines))


def _tell_guard(db: Session, rec: VerifixSyncRun, guard: str) -> None:
    """A refused pass is said once per guard (not every ten minutes)."""
    prev = (db.query(VerifixSyncRun).filter(VerifixSyncRun.kind == "pass",
                                            VerifixSyncRun.id < rec.id)
            .order_by(VerifixSyncRun.id.desc()).first())
    if prev is not None and (prev.guard or "").split(":")[:2] == guard.split(":")[:2]:
        return
    _dm(f"⛔ <b>Verifix sinxron</b>: hech narsa yozilmadi — <code>{_esc(guard)}</code>\n"
        "👉 /admin/upload?tab=verifixsync")


# ── the taps ──────────────────────────────────────────────────────────────────

APPLICABLE = {"brigadir_differs", "leader_moved", "new_unit", "code_changed", "rename",
              "tie_doubtful", "two_seats", "seat_changed", "hold", "archived_open",
              "seat_no_profile", "seat_gone"}


def apply_item(db: Session, item_id: int, *, by: Optional[str], choice: Optional[str] = None) -> dict:
    """Do what the item suggests. Caller commits."""
    it = db.query(VerifixSyncItem).filter_by(id=item_id).with_for_update().first()
    if it is None:
        raise Refused("not_found", "Item not found", 404)
    if it.status != "open":
        raise Refused("decided", "Already decided", 409)
    if it.kind not in APPLICABLE:
        raise Refused("info_only", "This item is information — dismiss it", 400)
    p = it.payload or {}
    out: dict = {}
    k = it.kind
    if k == "brigadir_differs":
        c = _cell(db, p["cell"])
        if kept_apart(c.verifix_code):
            raise Refused("kept_apart", f"Cell {c.verifix_code} stays in «{kept_apart(c.verifix_code)}» "
                          "(an exception) — dismiss this", 409,
                          {"code": c.verifix_code, "unit": kept_apart(c.verifix_code)})
        if unit_held_untied(db, c.manager_id):
            raise Refused("unit_untied", f"Cell {c.verifix_code} stays in its unit — the unit is held "
                          "untied from Verifix by hand (a person named its brigadir); dismiss this", 409,
                          {"code": c.verifix_code, "unit": c.manager_id})
        # The other open suggestions moving a cell of the same unit and work
        # centre to the same unit. A cell refused because it shares positions
        # with them may go TOGETHER with them («Hammasini birga ko'chirish»):
        # one `leaving` for every check, so none counts another as staying.
        from app.services.cell_lookup import norm_code as _norm_code
        code = _norm_code(c.sap_code)

        def team_items(lock: bool) -> list:
            """[(item, cell)] of those suggestions. Locked only to be applied,
            and then SKIP LOCKED: two taps running at once never wait on each
            other's items (waiting, each holding its own, they deadlock) — an
            item another tap holds is left out, and its cell counts as staying."""
            if not code or c.manager_id is None:
                return []
            q = (db.query(VerifixSyncItem)
                 .filter(VerifixSyncItem.kind == "brigadir_differs",
                         VerifixSyncItem.status == "open", VerifixSyncItem.id != it.id)
                 .order_by(VerifixSyncItem.id))
            found = []
            for mi in (q.with_for_update(skip_locked=True) if lock else q).all():
                mp = mi.payload or {}
                mc = db.query(Cell).filter_by(id=mp.get("cell")).first()
                if (mc is not None and mp.get("to_unit") == p["to_unit"]
                        and mc.manager_id == c.manager_id and _norm_code(mc.sap_code) == code
                        and not kept_apart(mc.verifix_code)):
                    found.append((mi, mc))
            return found

        if choice == "together":
            mates = team_items(lock=True)
            leaving = {c.id: p["to_unit"], **{mc.id: p["to_unit"] for _mi, mc in mates}}
            for mi, mc in mates:
                cell_register.set_unit(db, mc, p["to_unit"], src="manual", by=by,
                                       vfx={"brigadir": (mi.payload or {}).get("brigadir")},
                                       leaving=leaving)
            ev = cell_register.set_unit(db, c, p["to_unit"], src="manual", by=by,
                                        vfx={"brigadir": p.get("brigadir")}, leaving=leaving)
            for mi, _mc in mates:
                mi.status, mi.decided_at, mi.decided_by, mi.note = "applied", _now(), by, "together"
            out["together"] = [mi.id for mi, _mc in mates]
            if mates:
                # The tap's own «Jurnal» row names the cells that went along.
                from app.services import action_log
                action_log.enrich(details=[("move_with", ", ".join(mc.verifix_code
                                                                   for _mi, mc in mates))])
        else:
            try:
                ev = cell_register.set_unit(db, c, p["to_unit"], src="manual", by=by,
                                            vfx={"brigadir": p.get("brigadir")})
            except Refused as exc:
                # Offered only where going together CAN pass: every cell
                # staying has a suggestion of its own to the same unit.
                stay = {s["id"] for s in (exc.params.get("staying") or [])}
                mates = team_items(lock=False) if exc.code == "shared_positions" else []
                if (exc.code == "shared_positions" and mates and stay
                        and stay <= {mc.id for _mi, mc in mates}):
                    exc.params["together_items"] = [mi.id for mi, _mc in mates]
                raise
        out["from"] = ev.effective_from.isoformat() if ev is not None else None
    elif k == "leader_moved":
        prof = db.query(RoleProfile).filter_by(id=p["profile"], role="leader").first()
        if prof is None:
            raise Refused("not_found", "Profile not found", 404)
        _move_leader_unit(db, prof, p["to_unit"])
        c = _cell(db, p["cell"])
        cell_register.set_manager(db, c, prof.id, src="verifix", by=by, mark=True)
    elif k == "new_unit":
        out["unit"] = _create_unit(db, p, by)
    elif k == "code_changed":
        c = _cell(db, p["cell"])
        out["moved"] = rename_code(db, c, p["new_code"])
    elif k == "rename":
        new = (choice or p.get("new") or "").strip()
        if "unit" in p:
            cell_register.rename_profile(db, "supervisor", p["unit"], new, keep_alias=False)
        else:
            cell_register.rename_profile(db, p["role"], p["profile"], new)
    elif k == "tie_doubtful":
        if choice == "untie":
            kind = "unit" if "unit" in p else ("leader" if p.get("role") == "leader" else "profile")
            tie_by_hand(db, kind, p.get("unit") or p.get("profile"), None, by=by)
        else:
            row = (db.query(Manager).filter_by(id=p["unit"]).first() if "unit" in p
                   else db.query(RoleProfile).filter_by(id=p["profile"]).first())
            row.vfx_meta = {**(row.vfx_meta or {}), "confirmed": (p.get("vfx") or {}).get("name")}
            # A confirmed tie is a person's tie: the router fetches its photo now.
            out["tied"] = {"kind": "unit" if "unit" in p else "profile",
                           "id": p.get("unit") or p.get("profile")}
    elif k == "two_seats":
        if not choice or choice not in {s["id"] for s in p.get("seats") or []}:
            raise Refused("choice_required", "Say which of them is the seat")
        c = _cell(db, p["cell"])
        c.vfx_meta = {**(c.vfx_meta or {}), "seat_pick": choice}
    elif k == "seat_changed":
        c = _cell(db, p["cell"])
        cell_register.set_manager(db, c, p["profile"], src="verifix", by=by, mark=True)
        meta = dict(c.vfx_meta or {})
        meta.pop("seat_new", None)
        c.vfx_meta = meta
    elif k == "hold" and p.get("why") == "manual_manager":
        # Connect the seat's profile to the cell's unit — the cell's manager
        # stays the person's choice.
        c = _cell(db, p["cell"])
        prof = (db.query(RoleProfile).filter_by(id=p["profile"]).first() if p.get("profile")
                else db.query(RoleProfile).filter_by(
                    vfx_employee_id=(p.get("seat") or {}).get("id")).first())
        if prof is None or not c.manager_id:
            raise Refused("wait", "The pass creates the profile first", 409)
        _move_leader_unit(db, prof, c.manager_id)
    elif k == "hold":
        if "profile" in p:
            prof = db.query(RoleProfile).filter_by(id=p["profile"]).first()
            c = _cell(db, p["cell"])
            if not c.manager_id:
                raise Refused("no_brigadir", "Give the cell its brigadir first", 409)
            _move_leader_unit(db, prof, c.manager_id)
            cell_register.set_manager(db, c, prof.id, src="verifix", by=by, mark=True)
        else:
            raise Refused("wait", "The pass connects it once the cell has a brigadir", 409)
    elif k == "archived_open":
        c = _cell(db, p["cell"])
        cell_register.restore(db, c, by=by, src="manual")
    elif k == "seat_gone":
        # The person confirms Verifix seats nobody: the «Egasi» goes, and the
        # «Boshqaruvchi» too unless a person chose them (dated, next opening).
        c = _cell(db, p["cell"])
        cell_register.set_owner(db, c, None, vfx=None)
        pc = cell_links.pending(db, [c.id]).get(c.id, {})
        cur_mgr = pc["leader_id"]["value"] if "leader_id" in pc else c.leader_id
        if cur_mgr and cell_links.manager_mode(db, [c.id]).get(c.id) != "manual":
            cell_register.set_manager(db, c, None, src="verifix", by=by)
        meta = dict(c.vfx_meta or {})
        meta.pop("seat", None)
        c.vfx_meta = meta
    elif k == "seat_no_profile":
        org, _ = verifix_org.stored(db)
        c = _cell(db, p["cell"])
        if choice and choice.isdigit():
            tie_by_hand(db, "leader", int(choice), p["seat"]["id"], by=by)
            out["tied"] = {"kind": "leader", "id": int(choice)}
        else:
            emp = dict((org.get("emps") or {}).get(p["seat"]["id"]) or {})
            emp.update(job=p["seat"].get("job"), cell_raw=p.get("code"))
            prof = cell_register.create_leader(db, emp=emp, manager_id=c.manager_id,
                                               owes_from=leader_owes.UNCLAIMED, how="seat")
            out["tied"] = {"kind": "leader", "id": prof.id}
    it.status, it.decided_at, it.decided_by = "applied", _now(), by
    it.note = choice
    return {"ok": True, "kind": k, **out}


def dismiss_item(db: Session, item_id: int, *, by: Optional[str]) -> dict:
    it = db.query(VerifixSyncItem).filter_by(id=item_id).with_for_update().first()
    if it is None:
        raise Refused("not_found", "Item not found", 404)
    if it.status != "open":
        raise Refused("decided", "Already decided", 409)
    it.status, it.decided_at, it.decided_by = "dismissed", _now(), by
    return {"ok": True}


def _cell(db: Session, cid: int) -> Cell:
    c = db.query(Cell).filter_by(id=cid).first()
    if c is None:
        raise Refused("not_found", "Cell not found", 404)
    return c


def _move_leader_unit(db: Session, prof: RoleProfile, new_mid: Optional[int]) -> None:
    """A leader's unit, moved the way the profile editor moves it (role rows
    re-pointed) — and NO cell dragged with it (ruling 3) — DATED from the new
    unit's first fileable checklist day (`leader_follow.move`)."""
    if not new_mid or prof.manager_id == new_mid:
        prof.manager_id = new_mid or prof.manager_id
        return
    from app.services import leader_follow, leader_owes
    leader_follow.move(db, prof, new_mid, leader_owes.unit_day(db, new_mid), src="verifix",
                       by="Verifix")


def _create_unit(db: Session, p: dict, by: Optional[str]) -> int:
    """A Verifix brigadir with no unit here → a unit the 8 Oct way: OFF, no
    shift, no plant, tied; the brigadir-less tied cells under them join it
    (dated, from tomorrow)."""
    from sqlalchemy import func
    vfx = p.get("vfx") or {}
    eid = str(vfx.get("id") or "")
    if not eid or db.query(Manager.id).filter(Manager.vfx_employee_id == eid).first():
        raise Refused("taken", "A unit is tied to this person already", 409)
    name = (p.get("name") or "").strip()
    if db.query(Manager.id).filter(func.lower(Manager.name) == name.lower()).first():
        raise Refused("name_exists", f"A unit named {name} exists", 409)
    next_id = int(db.query(func.coalesce(func.max(Manager.id), 0)).scalar() or 0) + 1
    at = _iso(_now())
    m = Manager(id=next_id, name=name, shift=None, archived=False, zagruzka_on=False,
                supervisor_kind="supervisor",
                supervisor_kind_meta={"src": "verifix", "at": at, "by": "Verifix",
                                      "vfx": {"checked_at": at, "found": True, "id": eid,
                                              "name": vfx.get("name"), "job": vfx.get("job"),
                                              "how": "created"}},
                vfx_employee_id=eid, vfx_meta={"name": vfx.get("name"), "status": "W",
                                               "job": vfx.get("job")})
    db.add(m)
    db.flush()
    org, at_ = verifix_org.stored(db)
    if org:
        ctx = Ctx(db, org, at_)
        for c in ctx.cells:
            if c.manager_id or not c.vfx_division_id or c.archived_at is not None:
                continue
            bs = ctx.over(c.vfx_division_id)
            if len(bs) == 1 and bs[0]["id"] == eid:
                cell_register.set_unit(db, c, next_id, src="manual", by=by)
    return next_id


# Text columns that carry a cell's code besides `verifix_code` / `cell_code`
# (found by name in the schema): a frozen turnover month, a split's second
# cell, a «Perenaladka» row.
_CODE_COLS = {("live_placements", "second_code"), ("setup_times", "cell"),
              ("turnover_people", "code"), ("turnover_leavers", "code"),
              ("turnover_month_people", "code")}
# JSON keys that name a cell code inside a stored payload (an HR document's
# revert snapshot, a people-exchange's target).
_CODE_KEYS = {"verifix_code", "old_verifix_code", "target_cell", "cell", "cell_code", "code"}


def rename_code(db: Session, cell: Cell, new_code: str) -> int:
    """A tied subdivision's CODE changed (same Verifix id): the cell takes the
    new code and every stored row that names it follows, so no past day loses
    its cell — attendance, the batch rows, placements, kelish, ojidaniya,
    concerns, «Perenaladka», the turnover months (text columns), plus the JSON
    that carries a code: the live-day copies' rosters, the stored day reads,
    the HR documents' snapshots. A stored code is matched the way Verifix's
    codes are (`code_key`: «0028» and «28» are one), and keeps its own form.
    Returns the rows moved. Not followed: the Quality register's fault code
    (re-synced from its sheet)."""
    from sqlalchemy import bindparam, text
    from sqlalchemy.orm.attributes import flag_modified
    from app.models import HrDocument, LiveProjection, LiveVerifixRead
    new = cell_register.norm_code(new_code)
    old = cell.verifix_code
    if not new or new == old:
        return 0
    if db.query(Cell.id).filter(Cell.verifix_code == new, Cell.id != cell.id).first():
        raise Refused("code_exists", f"Cell {new} already exists", 409)
    old_key, new_key = verifix_org.code_key(old), verifix_org.code_key(new)
    variants = sorted({old, old_key} - {None, ""})

    def swap(v):
        return new_key if v == old_key and v != old else new

    moved = 0
    cols = [tuple(r) for r in db.execute(text(
        "SELECT table_name, column_name FROM information_schema.columns "
        "WHERE table_schema = current_schema() "
        "AND data_type IN ('character varying', 'text') AND table_name <> 'cells'")).all()]
    for table, col in cols:
        if col not in ("verifix_code", "cell_code") and (table, col) not in _CODE_COLS:
            continue
        q = text(f'UPDATE "{table}" SET "{col}" = CASE WHEN "{col}" = :ok AND :ok <> :o '
                 f'THEN :nk ELSE :n END WHERE "{col}" IN :vs').bindparams(
            bindparam("vs", expanding=True))
        moved += db.execute(q, {"ok": old_key, "o": old, "nk": new_key, "n": new,
                                "vs": variants}).rowcount or 0

    def walk(x):
        n = 0
        if isinstance(x, dict):
            for k, v in list(x.items()):
                if isinstance(v, str) and k in _CODE_KEYS and v in variants:
                    x[k] = swap(v)
                    n += 1
                else:
                    n += walk(v)
        elif isinstance(x, list):
            for v in x:
                n += walk(v)
        return n

    pats = [f'%"{v}"%' for v in variants]
    for rec in db.query(LiveProjection).filter(
            or_(*[LiveProjection.roster.cast(String).like(pt) for pt in pats])).all():
        roster = list(rec.roster or [])
        hit = 0
        for row in roster:
            if isinstance(row, list) and len(row) > 1 and row[1] in variants:
                row[1] = swap(row[1])
                hit += 1
        if hit:
            rec.roster = roster
            flag_modified(rec, "roster")
            moved += hit
    for doc in db.query(HrDocument).filter(
            or_(*[HrDocument.payload.cast(String).like(pt) for pt in pats])).all():
        payload = doc.payload or {}
        hit = walk(payload)
        if hit:
            doc.payload = payload
            flag_modified(doc, "payload")
            moved += hit
    # The stored live day reads are megabytes each and never purged: their KEYS
    # are found first, then each row is loaded, rewritten, flushed and let go
    # — never the whole set in memory at once.
    keys = [k for (k,) in db.query(LiveVerifixRead.key).filter(LiveVerifixRead.key.like("day:%")).filter(
        or_(*[LiveVerifixRead.data.cast(String).like(f'%"c": "{v}"%') for v in variants])).all()]
    for key in keys:
        rd = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == key).first()
        if rd is None:
            continue
        data = rd.data or {}
        hit = 0
        for e in (data.get("emps") or {}).values():
            if isinstance(e, dict) and e.get("c") in variants:
                e["c"] = swap(e["c"])
                hit += 1
        if hit:
            rd.data = data
            flag_modified(rd, "data")
            moved += hit
            db.flush()
        db.expunge(rd)
    cell.verifix_code = new
    meta = dict(cell.vfx_meta or {})
    meta["code_from"] = old
    cell.vfx_meta = meta
    return moved


# ── the job ───────────────────────────────────────────────────────────────────

def run_job() -> None:
    """Every ORG_TTL_S: read the org (when due) and pass over it. Its own
    session — `verifix_org.refresh` commits and rolls back."""
    from app.database import SessionLocal
    try:
        with SessionLocal() as db:
            run_pass(db)
    except Exception:  # noqa: BLE001 — the next run tries again
        log.exception("verifix sync: the pass failed")


def register_jobs() -> None:
    """Mirrored in passenger_wsgi.py. A box with no Verifix login reads
    nothing (`verifix_org.refresh` returns at once)."""
    from datetime import timedelta as _td
    from app.scheduler import schedule_at, schedule_interval
    schedule_interval("verifix-sync", run_job, minutes=max(1, verifix_org.ORG_TTL_S // 60))
    # A boot catch-up a minute and a half in: the interval's first run is a
    # whole interval away, and until the org is read the /cells manager picker
    # has no pool. A fresh stored read makes it a no-op (`no_new_read`).
    schedule_at("verifix-sync-boot", _now() + _td(seconds=90), run_job)
