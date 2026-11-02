"""TEMPORARY one-shot (2026-11-02): unit «Turdimurodov Nodirjon» joins Aripova Manzura's.

The operator, 2026-11-02: «Remove the Nodirjon Turdimurodov from brigadirs, add
his unit to Aripova Manzura where it belongs. Keep him as a Leader of her.»
Asked one by one:

  • MERGE — cell 0811 (work centre A0081), the only cell of unit 21, joins her
    unit 1 with its people, positions, ojidaniya and figures; unit 21 is
    ARCHIVED (its history kept, hidden like any archived unit's);
  • from TODAY, the moment this reaches production — she closes 2 Nov with
    0811's people in it;
  • 0811's ПЛАН/ФАКТ stay typed by hand: every coded line of unit 21 is set
    «Qo'lda» (per-line `auto_fill` off) BEFORE it moves into her SAP-filled unit;
  • unit 21's positions with no Команда (47) get A0081, so they follow the cell;
  • his open brigadir-level concern goes to her, deadline kept; closed ones stay
    unit 21's history;
  • both of them are told; the report goes to Burkhon.

His leader profile (#211) has stood in her unit since 26 Sep, so he stays what
he is there: the «Boshqaruvchi» and «Egasi» of 0811. Nothing about him moves.

ONE transaction with the flag, after preconditions that block the whole run
(nothing written, DMed once) when the state is not the one this was written
against (the 2 Nov report-door reads):
  1. unit 21's catalog, dated from today (`pp_catalog.freeze`): every coded line
     «Qo'lda», the lines with no Команда → A0081, typed values carried
     (`production._carry_manual_quantities` — the bulk editor's own carry);
  2. 0811's brigadir: a DATED link event 21 → 1, effective 2 Nov from the
     shift's 08:00 opening, applied at once (the 14 Oct one-shot's shape) —
     today and every later day read the cell in her unit, every earlier day in
     his; the catalog follow (kicked after the commit) moves its positions,
     today's typed values and its people pin from today, as for any move;
  3. unit 21's open concerns → unit 1, deadline kept; its live documents,
     deletions, clock fixes and placements from today → unit 1 (today: one
     draft role change), and an exchange INTO unit 21 → into unit 1;
  4. its brigadir role rows (supervisor:21 — one approved, one pending) go, the
     Profiles tab's own way (`profiles._remove_role_row`: an account's active
     role falls back to its leader one); a supervisor:21 browser login, if one
     exists, is DISABLED (kept, reversible), never deleted;
  5. its Verifix tie is held untied (`verifix_sync.tie_by_hand`) — his person
     stays on his leader profile alone;
  6. it is archived.
Every row it changes or removes is snapshotted into RECORD, so each step can be
put back by hand.

After the commit: the Jurnal rows; either unit's 2 Nov live day already closed
is re-copied over the stored read; the catalog and leader follows are kicked;
kept answers dropped; the two people told (own flag); the report to Burkhon
from the record, a couple of minutes later so it can say whether the positions
have followed (`startup.merge_nodirjon_unit_nov02`).

Delete this module, `startup.merge_nodirjon_unit_nov02` /
`_unit_merge_report_job` and both entrypoint calls once FLAG reads «done» and
the report has gone.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AppSetting, Cell, LeaderConcern, LiveClockFix, LiveDayClose, LiveDeletion, LiveDocument,
    LivePlacement, Manager, PPCatalogMove, PPProduct, RoleProfile, TelegramUser, WebCredential,
)
from app.services import action_log, cell_links, cell_register, verifix_org
from app.services.cell_lookup import norm_code
from app.services.cell_register import Refused

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Tashkent")

FLAG = "unit_merge_nodirjon_0811_2026_11_02_v1"
RECORD = "unit_merge_nodirjon_0811_2026_11_02"
NOTIFY_FLAG = FLAG + "_notify"
ACTOR = "Tizim · 2026-11-02 birlashtirish"
DAY = date(2026, 11, 2)
DAY_LABEL = "02.11.2026"
OPENS, CLOSES = time(8, 0), time(20, 0)     # shift 1 — the day being moved is running
SRC, SRC_NAME = 21, "Turdimurodov Nodirjon"
DST, DST_NAME = 1, "Aripova Manzura"
CODE, WC = "0811", "A0081"
LEADER = 211
LOCK_KEY = 20261102          # pg advisory lock: one copy applies the merge
TRIES = 3
REASON = ("The operator, 2026-11-02: unit «Turdimurodov Nodirjon» joins Aripova Manzura's "
          "from today; he stays her leader")


def dm_flag(result: Optional[str]) -> str:
    """The report's flag, one per result — a «failed» report does not silence
    the «applied» one a retry produces."""
    return f"{FLAG}_dm_{result or 'none'}"


# ── helpers ───────────────────────────────────────────────────────────────────

def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _snap(row) -> dict:
    """Every column of a row as it stood — enough to put it back by hand."""
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


def _cell(db: Session) -> list[Cell]:
    k = verifix_org.code_key(CODE)
    return [c for c in db.query(Cell).all() if verifix_org.code_key(c.verifix_code) == k]


def record(db: Session) -> dict:
    r = _setting(db, RECORD)
    try:
        return json.loads(r.value) if r is not None and r.value else {}
    except ValueError:
        return {}


def result(db: Session) -> Optional[str]:
    return record(db).get("result")


# ── preconditions ─────────────────────────────────────────────────────────────

def check(db: Session, now: datetime) -> tuple[dict, list[str]]:
    """What the run reads before it writes anything. Returns (facts, problems);
    any problem blocks the whole run."""
    problems: list[str] = []
    facts: dict = {}
    local = now.astimezone(TZ)
    facts["at_local"] = local.isoformat(timespec="minutes")
    # «From today, the moment it reaches production»: the move is FOR the 2 Nov
    # shift-1 day while it runs. A boot after it (a failed deploy re-run in the
    # evening) must not move a finished day — a person decides the date again.
    if local.date() != DAY or not (OPENS <= local.time() < CLOSES):
        problems.append(f"the move is for the 2 Nov 2026 shift-1 day while it runs "
                        f"(08:00–20:00 Tashkent); it is now {local:%d.%m.%Y %H:%M}")

    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_((SRC, DST))).all()}
    for uid, name in ((SRC, SRC_NAME), (DST, DST_NAME)):
        m = units.get(uid)
        if m is None:
            problems.append(f"unit {uid} does not exist")
            continue
        if m.archived:
            problems.append(f"unit {uid} «{m.name}» is archived")
        if (m.name or "").strip() != name:
            problems.append(f"unit {uid} is «{m.name}», expected «{name}»")
    if SRC in units and DST in units and units[SRC].shift != units[DST].shift:
        problems.append(f"the two units run different shifts "
                        f"({units[SRC].shift} / {units[DST].shift})")

    cells = _cell(db)
    if len(cells) != 1:
        problems.append(f"{len(cells)} cells carry the code {CODE}")
        return facts, problems
    cell = cells[0]
    facts["cell_id"] = cell.id
    if cell.manager_id != SRC:
        problems.append(f"cell {CODE} stands in unit {cell.manager_id}, not in {SRC}")
    if cell.archived_at is not None:
        problems.append(f"cell {CODE} is archived")
    if norm_code(cell.sap_code) != norm_code(WC):
        problems.append(f"cell {CODE}'s work centre is {cell.sap_code!r}, not {WC}")
    if cell.leader_id != LEADER:
        problems.append(f"cell {CODE} is run by profile {cell.leader_id}, not by #{LEADER}")
    waiting = cell_links.pending(db, [cell.id]).get(cell.id) or {}
    if waiting:
        problems.append(f"cell {CODE} has a change still waiting: {json.dumps(waiting, default=str)}")

    others = [c.verifix_code for c in db.query(Cell).filter(
        Cell.manager_id == SRC, Cell.id != cell.id, Cell.archived_at.is_(None)).all()]
    if others:
        problems.append(f"unit {SRC} has other live cells ({', '.join(map(str, others))}) — "
                        f"archiving it would strand them")
    lp = db.query(RoleProfile).filter_by(id=LEADER).first()
    if lp is None or lp.role != "leader" or lp.manager_id != DST:
        problems.append(f"leader profile #{LEADER} is not a leader of unit {DST} "
                        f"({getattr(lp, 'role', None)} in {getattr(lp, 'manager_id', None)})")
    else:
        facts["leader_name"] = lp.name
    stranded = [p.name for p in db.query(RoleProfile).filter_by(role="leader", manager_id=SRC).all()]
    if stranded:
        problems.append(f"unit {SRC} still has leader profiles: {', '.join(stranded)}")

    from app.services import catalog_follow, catalog_refusal
    if not catalog_follow.enabled(db):
        problems.append("the catalog follow is switched off — 0811's positions would not follow it")
    try:
        refusal = catalog_refusal.shared_positions(db, cell, DST, day=DAY)
    except Exception as exc:  # noqa: BLE001
        refusal = None
        problems.append(f"the positions check failed: {type(exc).__name__}: {exc}"[:300])
    if refusal is not None:
        problems.append(f"the move would be refused: {refusal.code} — {refusal.message}")
    return facts, problems


# ── the merge ─────────────────────────────────────────────────────────────────

def apply(db: Session, facts: dict, now: datetime) -> dict:
    """Every write, staged on `db`; the caller commits. Returns the record."""
    from app.routers import production as _production
    from app.routers import profiles as _profiles
    from app.services import pp_catalog, verifix_sync
    rec: dict = {"at": now.isoformat(timespec="seconds"), "day": DAY.isoformat(), "left": []}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_((SRC, DST))).all()}
    src, dst = units[SRC], units[DST]
    cell = db.query(Cell).filter_by(id=facts["cell_id"]).first()

    # 1. Unit 21's catalog, dated from today. Both units' catalog locks first —
    #    the follow takes the same ones and must find this edit whole.
    pp_catalog.lock(db, [SRC, DST])
    eff = pp_catalog.freeze(db, SRC, "unit merge: 0811 joins Aripova Manzura", day=DAY)
    if eff != DAY:
        raise RuntimeError(f"unit {SRC}'s catalog answers from {eff}, not from {DAY}")
    before = _production._catalog_snapshot(db, SRC)
    lines = db.query(PPProduct).filter(PPProduct.manager_id == SRC).order_by(PPProduct.id).all()
    manual: list[int] = []
    given_wc: list[dict] = []
    for p in lines:
        # «Qo'lda»: what the leader types is what counts; the SAP file her unit
        # takes never reaches these lines. A code-less line never took it.
        if (p.sap_code or "").strip() and p.auto_fill is not False:
            p.auto_fill = False
            manual.append(p.id)
        if not (p.work_center or "").strip():
            given_wc.append({"id": p.id, "sap_code": p.sap_code, "name": p.name,
                             "labor_time": p.labor_time, "was": p.work_center})
            p.work_center = WC
    new_wc = {g["id"] for g in given_wc}
    after = [({**d, "work_center": WC} if d["id"] in new_wc else d) for d in before]
    carried = _production._carry_manual_quantities(db, SRC, before, after, since=eff)
    db.flush()
    rec["catalog"] = {"from": eff.isoformat(), "lines": len(lines), "set_manual": len(manual),
                      "manual_ids": manual, "given_wc": given_wc, "carried": carried}

    # 2. The cell. A dated event from today's opening, applied at once.
    eff_at = datetime.combine(DAY, OPENS, tzinfo=TZ)
    letter = getattr(cell, "wc_group", None) or None
    ev = cell_links.record(db, cell, "manager_id", DST, src="manual", by=ACTOR,
                           vfx={"merge": FLAG, "letter_before": letter},
                           effective_from=DAY, effective_at=eff_at, now=now)
    if ev is None or ev.applied_at is None or cell.manager_id != DST:
        raise RuntimeError(f"the move of {CODE} did not land (event {getattr(ev, 'id', None)})")
    if letter:
        from app.services import wc_group
        try:
            wc_group.settle_moved(db, [cell], DST)
        except Exception:  # noqa: BLE001 — a letter never holds the move back
            pass
    rec["move"] = {"event": ev.id, "cell": cell.id, "code": CODE, "from": SRC, "to": DST,
                   "prev": ev.prev, "effective_from": DAY.isoformat(),
                   "effective_at": eff_at.isoformat(), "letter": letter}

    # 3. What waits on unit 21's brigadir, and today's live filings.
    concerns = []
    for c in (db.query(LeaderConcern)
              .filter(LeaderConcern.brigadir_manager_id == SRC,
                      LeaderConcern.status.in_(("todo", "doing")))
              .order_by(LeaderConcern.id).all()):
        concerns.append({"id": c.id, "seq": c.seq, "level": c.level, "status": c.status,
                         "deadline_days": c.deadline_days, "was": c.brigadir_name})
        c.brigadir_manager_id = DST
        c.brigadir_name = dst.name
    rec["concerns"] = concerns

    docs = []
    for d in (db.query(LiveDocument)
              .filter(LiveDocument.manager_id == SRC, LiveDocument.day >= DAY)
              .order_by(LiveDocument.id).all()):
        docs.append({"id": d.id, "type": d.doc_type, "status": d.status,
                     "day": d.day.isoformat(), "moved": "unit",
                     "was": {"manager_id": d.manager_id, "supervisor_name": d.supervisor_name}})
        d.manager_id = DST
        d.supervisor_name = dst.name
    for d in (db.query(LiveDocument).filter(LiveDocument.day >= DAY)
              .order_by(LiveDocument.id).all()):
        pl = dict(d.payload or {})
        tgt = pl.get("target_manager_id")
        if tgt is None or str(tgt) != str(SRC):
            continue
        docs.append({"id": d.id, "type": d.doc_type, "status": d.status,
                     "day": d.day.isoformat(), "moved": "target",
                     "was": {"target_manager_id": tgt,
                             "target_manager_name": pl.get("target_manager_name")}})
        pl["target_manager_id"] = DST if isinstance(tgt, int) else str(DST)
        if "target_manager_name" in pl:
            pl["target_manager_name"] = dst.name
        d.payload = pl
    rec["documents"] = docs

    others: dict = {}
    for model in (LiveDeletion, LiveClockFix, LivePlacement):
        rows = db.query(model).filter(model.manager_id == SRC, model.day >= DAY).all()
        for r in rows:
            r.manager_id = DST
        others[model.__tablename__] = [r.id for r in rows]
    rec["live_rows"] = others
    db.flush()

    # 4. The brigadir: his supervisor:21 registrations, and a browser login.
    holders = []
    for r in _profiles._bound_role_rows(db, "supervisor", SRC):
        user = db.query(TelegramUser).filter_by(telegram_id=r.telegram_id).first()
        holders.append({"row": _snap(r), "was_active": bool(user and user.active_role_ref == r.id),
                        "account": user.full_name if user else None})
        _profiles._remove_role_row(db, r)
    db.flush()
    for h in holders:
        user = db.query(TelegramUser).filter_by(telegram_id=h["row"]["telegram_id"]).first()
        h["account_kept"] = user is not None
        h["active_now"] = user.active_role_ref if user else None
    rec["holders"] = holders
    cred = db.query(WebCredential).filter_by(profile_key=f"supervisor:{SRC}").first()
    if cred is not None:
        rec["web_login"] = {"username": cred.username, "was_enabled": bool(cred.enabled),
                            "token_version": [cred.token_version, int(cred.token_version or 0) + 1]}
        cred.enabled = False
        cred.token_version = int(cred.token_version or 0) + 1
    else:
        rec["web_login"] = None

    # 5. Verifix: the unit is held untied, so his person (on his leader profile)
    #    is the seat of 0811 and nothing else.
    tie = {"was": src.vfx_employee_id}
    try:
        verifix_sync.tie_by_hand(db, "unit", SRC, None, by=ACTOR)
        tie["now"] = "held untied"
    except Refused as exc:
        src.vfx_employee_id = None
        tie["now"] = f"cleared without a hold ({exc.code})"
        rec["left"].append(f"Verifix untie by hand refused ({exc.code}); the tie was cleared instead")
    rec["verifix"] = tie

    # 6. The unit leaves every picker, board and figure; its history is kept.
    src.archived = True
    rec["archived"] = SRC
    return rec


def run(db: Session) -> Optional[dict]:
    """One pass. None = already done (or blocked / out of tries)."""
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        return None
    tries = 0
    if val.startswith("failed:"):
        try:
            tries = int(val.split(":")[-1])
        except ValueError:
            tries = TRIES
    if tries >= TRIES:
        return None

    # One copy at a time (the worker swap boots the new copy beside the old
    # one): a transaction-scoped advisory lock, then the flag read again.
    from sqlalchemy import text as _text
    try:
        got = db.execute(_text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY}).scalar()
    except Exception:  # noqa: BLE001 — not Postgres: no second copy either
        got = True
    if not got:
        db.rollback()
        print("[startup] unit merge 0811: another copy holds the lock — left to it")
        return None
    db.expire_all()
    f = _setting(db, FLAG)
    val = (f.value or "") if f else ""
    if val.startswith("done") or val.startswith("blocked"):
        db.rollback()
        return None

    now = datetime.now(timezone.utc)
    try:
        facts, problems = check(db, now)
    except Exception as exc:  # noqa: BLE001 — a read that broke is a failed attempt
        db.rollback()
        _put(db, FLAG, f"failed:{tries + 1}")
        _put(db, RECORD, json.dumps({"at": _now_iso(), "result": "failed", "attempt": tries + 1,
                                     "retried": tries + 1 < TRIES,
                                     "error": f"check: {type(exc).__name__}: {exc}"[:500]}))
        db.commit()
        log.exception("unit merge 0811: preconditions could not be read")
        return None
    if problems:
        db.rollback()
        rec = {"at": _now_iso(), "result": "blocked", "problems": problems, "facts": facts}
        _put(db, FLAG, "blocked")
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
        print("[startup] unit merge 0811 REFUSED: " + "; ".join(problems))
        return rec
    try:
        rec = apply(db, facts, now)
        rec.update(result="applied", facts=facts)
        _put(db, FLAG, "done")
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _put(db, FLAG, f"failed:{tries + 1}")
        _put(db, RECORD, json.dumps({"at": _now_iso(), "result": "failed", "attempt": tries + 1,
                                     "retried": tries + 1 < TRIES,
                                     "error": f"{type(exc).__name__}: {exc}"[:500]}))
        db.commit()
        log.exception("unit merge 0811 failed")
        print(f"[startup] unit merge 0811 failed (attempt {tries + 1}/{TRIES}): {exc}")
        return None
    cell_register.after_commit()
    _after(db, rec)
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    return rec


def _after(db: Session, rec: dict) -> None:
    """After the commit: the Jurnal, today's closed copies, the follows, the
    caches. Every step on its own — none of them can undo the merge."""
    cat, mv = rec["catalog"], rec["move"]
    try:
        action_log.record_system(
            "shopfloor", "production.catalog_bulk_edited", db,
            target_kind="catalog", target_id=f"{SRC}:merge:{cat['lines']}",
            target_name=f"{cat['lines']} × {WC}", unit_id=SRC, unit_name=SRC_NAME,
            day=DAY.isoformat(),
            details=[("rows", cat["lines"]), ("auto_fill", f"off on {cat['set_manual']}"),
                     ("work_center", f"{WC} on {len(cat['given_wc'])} lines that had none"),
                     ("from", cat["from"]), ("carried_values", cat["carried"] or None)],
            reason=REASON)
        action_log.record_system(
            "org", "org.cell_links_applied", db, target_kind="cell", target_id=mv["cell"],
            target_name=CODE, unit_id=DST, unit_name=DST_NAME, day=DAY.isoformat(),
            changes=[("brigadir", SRC_NAME, DST_NAME)],
            details=[("cell", f"{CODE} manager_id: {SRC} → {DST} from {DAY}"),
                     ("concerns", ", ".join(f"№{c['seq'] or c['id']}" for c in rec["concerns"]) or None),
                     ("documents", ", ".join(f"№{d['id']}" for d in rec["documents"]) or None)],
            reason=REASON)
        action_log.record_system(
            "identity", "identity.profile_deleted", db, target_kind="profile",
            target_id=f"supervisor:{SRC}", target_name=SRC_NAME, unit_id=SRC,
            unit_name=SRC_NAME, day=DAY.isoformat(),
            changes=[("status", None, "archived")],
            details=[("role", "supervisor"), ("profile", SRC_NAME),
                     ("role_rows", len(rec["holders"])),
                     ("web_login", "disabled" if rec.get("web_login") else None),
                     ("verifix", rec["verifix"].get("now"))],
            reason=REASON)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        rec["left"].append(f"Jurnal rows not written: {exc}"[:200])

    # Either unit's 2 Nov live day already closed is copied again over the
    # stored read, so its attendance says where 0811's people now stand.
    info: dict = {"closed": [], "rewritten": 0, "error": None}
    try:
        from app.services import live_day, live_projection, live_staff, verifix_live
        closed = [m for (m,) in db.query(LiveDayClose.manager_id).filter(
            LiveDayClose.day == DAY, LiveDayClose.manager_id.in_((SRC, DST)))]
        info["closed"] = closed
        if closed and live_day.is_live(DAY):
            rd = verifix_live.day_read(db, DST, DAY, stored_only=True)
            if rd.get("error"):
                info["error"] = f"no stored read ({rd.get('error')})"
            else:
                ctx = live_staff.load(db, rd["day"], rd["directory"], rd["store"], rd["now"])
                info["rewritten"] = live_projection.refresh(db, ctx, closed)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        info["error"] = f"{type(exc).__name__}: {exc}"[:300]
        log.exception("unit merge 0811: re-copying 2 Nov failed")
    rec["recopy"] = info

    for name, fn in (("catalog follow", "app.services.catalog_follow"),
                     ("leader follow", "app.services.leader_follow")):
        try:
            import importlib
            importlib.import_module(fn).kick()
        except Exception as exc:  # noqa: BLE001 — the minute jobs pick it up
            rec["left"].append(f"{name} not kicked: {exc}"[:200])
    for fn in ("app.services.kept_answer:forget_all", "app.routers.shift_report:forget",
               "app.services.leader_register:forget"):
        try:
            import importlib
            mod, attr = fn.split(":")
            getattr(importlib.import_module(mod), attr)()
        except Exception:  # noqa: BLE001
            pass


# ── after: the two people, then Burkhon ───────────────────────────────────────

def notify(db: Session) -> None:
    """Aripova learns that 0811 is hers from today (she closes today with its
    people); Nodirjon that his brigadir role has ended and he stays her leader —
    once (own flag), bell row + DM in each account's language."""
    f = _setting(db, NOTIFY_FLAG)
    if f is not None and (f.value or "").startswith("done"):
        return
    rec = record(db)
    if rec.get("result") != "applied":
        return
    from app.routers.staff import notify_profile
    sent = {"aripova": 0, "nodirjon": 0}
    nums = ", ".join(f"№{c.get('seq') or c['id']}" for c in rec.get("concerns") or [])
    docs = ", ".join(f"№{d['id']}" for d in rec.get("documents") or [] if d.get("status") == "draft")
    try:
        sent["aripova"] = len(notify_profile(
            db, f"supervisor:{DST}", "cell_unit_merged",
            {"cell": CODE, "leader": SRC_NAME, "date": DAY_LABEL, "concerns": nums, "docs": docs},
            subject=("live_day", f"{DST}:{DAY.isoformat()}")))
    except Exception:  # noqa: BLE001
        log.exception("unit merge 0811: Aripova not told")
    try:
        sent["nodirjon"] = len(notify_profile(
            db, f"leader:{LEADER}", "cell_unit_merged_leader",
            {"cell": CODE, "unit": DST_NAME, "name": SRC_NAME, "date": DAY_LABEL},
            subject=("page", "/production")))
    except Exception:  # noqa: BLE001
        log.exception("unit merge 0811: Nodirjon not told")
    _put(db, NOTIFY_FLAG, f"done:{sent['aripova']}+{sent['nodirjon']}")
    db.commit()


def _follow_state(db: Session, rec: dict) -> list[str]:
    """What the catalog follow made of the move, read now."""
    ev = (rec.get("move") or {}).get("event")
    if not ev:
        return []
    out = []
    row = db.query(PPCatalogMove).filter(PPCatalogMove.event_id == ev).first()
    if row is None:
        out.append("Positions: the catalog follow has not recorded the move yet — it runs every "
                   "minute; check «Jurnal» (Tashkilot · Pozitsiyalar ko'chdi).")
    else:
        named = [n.get("kind") for n in (row.named or []) if isinstance(n, dict)]
        out.append(f"Positions: follow {row.state} ({row.kind}), {len(row.line_ids or [])} lines "
                   f"moved from {row.storage_from or '—'}"
                   + (f"; named: {', '.join(k for k in named if k)}" if named else "")
                   + (f"; error: {row.error}" if row.error else ""))
    a = db.query(PPProduct).filter(PPProduct.manager_id == DST, PPProduct.work_center == WC).count()
    b = db.query(PPProduct).filter(PPProduct.manager_id == SRC).count()
    manual = db.query(PPProduct).filter(PPProduct.manager_id == DST, PPProduct.work_center == WC,
                                        PPProduct.auto_fill.is_(False)).count()
    out.append(f"Catalog now: {DST_NAME} has {a} lines at {WC} ({manual} «Qo'lda»); "
               f"{SRC_NAME} has {b} lines left.")
    c = db.query(Cell).filter(Cell.id == (rec.get("move") or {}).get("cell")).first()
    if c is not None:
        out.append(f"Cell {CODE} now stands in unit {c.manager_id}.")
    return out


def summary(db: Session, rec: dict) -> str:
    L = [f"🔀 Unit «{SRC_NAME}» → «{DST_NAME}» · {DAY_LABEL}", ""]
    if rec.get("result") == "blocked":
        L.append("REFUSED — nothing was written. Problems:")
        L += [f"• {p}" for p in rec.get("problems") or []]
        L += ["", "Decide again (and redeploy services/unit_merge_nov02.py with a NEW flag key)."]
        return "\n".join(L)
    if rec.get("result") == "failed":
        tail = ("retried at the next boot" if rec.get("retried")
                else f"attempts spent ({TRIES}) — NOT retried; fix and redeploy with a new flag key")
        return "\n".join(L + [f"❌ Failed (attempt {rec.get('attempt')}/{TRIES}): "
                              f"{rec.get('error')} — {tail}."])
    cat, mv = rec.get("catalog") or {}, rec.get("move") or {}
    L.append(f"Cell {CODE} ({WC}) stands in «{DST_NAME}» from {DAY_LABEL} 08:00 "
             f"(dated event #{mv.get('event')}); every earlier day stays «{SRC_NAME}»'s.")
    L.append(f"Catalog of «{SRC_NAME}», from {cat.get('from')}: {cat.get('set_manual')} of "
             f"{cat.get('lines')} lines set «Qo'lda»; {len(cat.get('given_wc') or [])} lines with no "
             f"Команда given {WC}; {cat.get('carried') or 0} typed values carried.")
    L += _follow_state(db, rec)
    cs = rec.get("concerns") or []
    L.append("Open concerns handed to Aripova: " + (", ".join(
        f"№{c.get('seq') or c['id']} ({c['level']}, {c['status']}, deadline {c.get('deadline_days')} d)"
        for c in cs) or "none"))
    ds = rec.get("documents") or []
    L.append("Live documents re-pointed to unit 1: " + (", ".join(
        f"№{d['id']} {d['type']} {d['status']} {d['day']} ({d['moved']})" for d in ds) or "none"))
    lr = rec.get("live_rows") or {}
    if any(lr.values()):
        L.append("Other live rows moved: " + ", ".join(f"{k} {len(v)}" for k, v in lr.items() if v))
    L.append("Brigadir role removed: " + ("; ".join(
        f"row {h['row'].get('id')} ({h['row'].get('status')}, account {h['row'].get('telegram_id')}"
        + (", was active" if h.get("was_active") else "") + f", active now {h.get('active_now')})"
        for h in rec.get("holders") or []) or "no registrations found"))
    w = rec.get("web_login")
    L.append(f"Browser login supervisor:{SRC}: " + (f"{w['username']} DISABLED (kept)" if w else "none"))
    L.append(f"Verifix: unit {SRC} {(rec.get('verifix') or {}).get('now')} "
             f"(was {(rec.get('verifix') or {}).get('was')}); his person stays on leader profile #{LEADER}.")
    L.append(f"Unit {SRC} «{SRC_NAME}» ARCHIVED (history kept; un-archive on the Profiles tab).")
    rc = rec.get("recopy") or {}
    L.append("2 Nov live copies: " + (f"closed {rc.get('closed')}, {rc.get('rewritten')} re-copied"
                                      if rc.get("closed") else "neither unit had closed — Aripova closes it")
             + (f" — {rc['error']}" if rc.get("error") else ""))
    if rec.get("left"):
        L.append("")
        L.append("Left / to look at:")
        L += [f"• {x}" for x in rec["left"]]
    L += ["", "Still yours: his account keeps the brigadir session in an OPEN Telegram app until it is "
              "relaunched (his DM asks him to); supervisor:21 keeps its personal «page.view.production» "
              "grant, inert while nobody holds the profile."]
    return "\n".join(L)


def send_report(db: Session, chat_id: int, _from=None, _to=None) -> int:
    """`startup._send_report_once`'s sender: the record (and the follow's state,
    read now) as one plain-text DM. Raises on a failed send, so it is retried."""
    rec = record(db)
    if not rec:
        raise RuntimeError("no record yet")
    text_ = summary(db, rec)
    print("[startup] " + text_.replace("\n", "\n[startup] "))
    import requests
    resp = requests.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                         data={"chat_id": chat_id, "text": text_[:4000]}, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"telegram answered {resp.status_code}")
    return 1
