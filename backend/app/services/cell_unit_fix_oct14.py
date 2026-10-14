"""TEMPORARY one-shot (2026-10-14): cell 0811 back in «Turdimurodov Nodirjon».

Turdimurodov Nodirjon is Aripova Manzura's leader while his cell 0811 is kept
in a unit made to read its загрузка apart (the 26 Sep ruling,
`cell_lookup.cells_unit_for_leader`). On 13 Oct a `brigadir_differs`
suggestion of the Verifix live sync («Verifix puts 0811 under Aripova») was
applied, and from 14 Oct 08:00 the cell stood in Aripova's unit: its people
showed on her /staff list and his /production read her unit, which holds no
catalog line of A0081, so the page was empty. The operator: «fix it and keep
him as an exception» — the exception is `verifix_sync.KEPT_APART`; this puts
the cell back.

The move back is a DATED link event (`cell_links.record`) effective from the
very day the wrong one landed, so that day and every day after read 0811 in
its own unit again, while every day before it never moved; the wrong event
stays (the register is append-only) and the record names it. Only when the
cell is still where that event put it — anything else is left and reported.
Then every CLOSED live unit-day of both units since that day is re-copied over
the stored read (`live_projection.refresh`, no Verifix call), and whatever
Aripova's unit filed on those days about 0811's people (documents, placements,
deletions, clock fixes) is COUNTED for the operator — nothing is changed there.

One transaction for the move, the flag and the record; the DM is sent from the
record, so a DM that fails is re-sent at the next boot and the repair never
re-runs. Delete this module, `startup.put_cell_0811_back` and both entrypoint
calls once the flag and its DM flag read «done».
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AppSetting, Attendance, Cell, CellLinkEvent, LiveClockFix, LiveDayClose, LiveDeletion,
    LiveDocument, LivePlacement, Manager,
)
from app.services import action_log, cell_links, cell_register, live_day, live_projection, live_staff
from app.services import verifix_live, verifix_org, verifix_sync

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Tashkent")

FLAG = "cell_0811_own_unit_2026_10_14_v1"
RECORD = "cell_0811_own_unit_2026_10_14"
DM_FLAG = FLAG + "_dm"
ACTOR = "Tizim · 2026-10-14 tuzatish"
CODE = "0811"


def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _cell(db: Session) -> list[Cell]:
    k = verifix_org.code_key(CODE)
    return [c for c in db.query(Cell).all() if verifix_org.code_key(c.verifix_code) == k]


def _unit(db: Session, name: str) -> list[Manager]:
    want = name.strip().casefold()
    return [m for m in db.query(Manager).filter(Manager.archived.is_(False)).all()
            if (m.name or "").strip().casefold() == want]


def _counts(db: Session, mid: int, day: date) -> dict:
    """The unit's copy in `attendance` on `day`: rows, and those coded 0811."""
    rows = db.query(Attendance.verifix_code).filter(Attendance.manager_id == mid,
                                                    Attendance.date == day).all()
    k = verifix_org.code_key(CODE)
    return {"rows": len(rows),
            "c0811": sum(1 for (v,) in rows if verifix_org.code_key(v) == k)}


def run(db: Session) -> Optional[dict]:
    """One pass. None = already done."""
    f = _setting(db, FLAG)
    if f is not None and (f.value or "") == "done":
        return None
    name = verifix_sync.kept_apart(CODE)
    rec: dict = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "code": CODE, "unit": name, "result": None, "days": {}, "left": {}}
    units = {m.id: m.name for m in db.query(Manager).all()}
    cells, mgrs = _cell(db), _unit(db, name or "")
    old_mid = None
    since: Optional[date] = None
    if len(cells) != 1:
        rec["result"] = f"cell_count_{len(cells)}"
    elif len(mgrs) != 1:
        rec["result"] = f"unit_count_{len(mgrs)}"
    else:
        cell, unit = cells[0], mgrs[0]
        rec.update(cell_id=cell.id, unit_id=unit.id, was=cell.manager_id,
                   was_name=units.get(cell.manager_id))
        if cell.manager_id == unit.id:
            # Already home: only a move AWAY still waiting is taken back.
            waiting = cell_links.pending(db, [cell.id]).get(cell.id, {}).get("manager_id")
            if waiting and waiting.get("value") != unit.id:
                cell_links.withdraw(db, cell, "manager_id")
                rec["result"] = "withdrew_waiting"
            else:
                rec["result"] = "already_home"
        else:
            ev = (db.query(CellLinkEvent)
                  .filter(CellLinkEvent.cell_id == cell.id, CellLinkEvent.field == "manager_id",
                          CellLinkEvent.applied_at.isnot(None))
                  .order_by(CellLinkEvent.effective_from.desc(), CellLinkEvent.id.desc())
                  .first())
            if ev is None or ev.prev != unit.id or ev.value != cell.manager_id:
                rec["result"] = "changed_since"
                rec["event"] = ({"id": ev.id, "prev": ev.prev, "value": ev.value,
                                 "from": ev.effective_from.isoformat(), "by": ev.by_name}
                                if ev is not None else None)
            else:
                old_mid, since = cell.manager_id, ev.effective_from
                new = cell_links.record(
                    db, cell, "manager_id", unit.id, src="manual", by=ACTOR,
                    vfx={"repair": FLAG, "undoes": ev.id, "kept_apart": True},
                    effective_from=ev.effective_from, effective_at=ev.effective_at)
                if getattr(cell, "wc_group", None):
                    from app.services import wc_group
                    try:
                        wc_group.settle_moved(db, [cell], unit.id)
                    except Exception:  # noqa: BLE001 — a letter never holds the move back
                        pass
                rec.update(result="moved_back" if new is not None else "no_change",
                           since=since.isoformat(), undoes=ev.id, undone_by=ev.by_name,
                           event=new.id if new is not None else None)
    _put(db, FLAG, "done")
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    cell_register.after_commit()

    if rec["result"] == "moved_back" and old_mid and since:
        action_log.record_system(
            "org", "org.cell_links_applied", db, target_kind="cell", target_id=rec["cell_id"],
            target_name=CODE, unit_id=rec["unit_id"], unit_name=name, day=since.isoformat(),
            changes=[("brigadir", units.get(old_mid), name)],
            details=[("cell", f"{CODE} manager_id: {old_mid} → {rec['unit_id']} from {since}")],
            reason="Kept apart from Verifix's brigadir (KEPT_APART) — the 13 Oct move undone")
        _recopy(db, rec, old_mid, rec["unit_id"], since)
        _left(db, rec, old_mid, since)
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
    return rec


def _recopy(db: Session, rec: dict, old_mid: int, new_mid: int, since: date) -> None:
    today = datetime.now(TZ).date()
    d = since
    while d <= today:
        info: dict = {"closed": [], "rewritten": 0, "before": {}, "after": {}, "error": None}
        rec["days"][d.isoformat()] = info
        closed = [m for (m,) in db.query(LiveDayClose.manager_id).filter(
            LiveDayClose.day == d, LiveDayClose.manager_id.in_((old_mid, new_mid)))]
        info["closed"] = closed
        if closed and live_day.is_live(d):
            info["before"] = {m: _counts(db, m, d) for m in (old_mid, new_mid)}
            try:
                rd = verifix_live.day_read(db, closed[0], d, stored_only=True)
                if rd.get("error"):
                    info["error"] = f"no stored read ({rd.get('error')})"
                else:
                    ctx = live_staff.load(db, rd["day"], rd["directory"], rd["store"], rd["now"])
                    info["rewritten"] = live_projection.refresh(db, ctx, closed)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                info["error"] = f"{type(exc).__name__}: {exc}"[:300]
                log.exception("cell 0811 fix: re-copying %s failed", d)
            info["after"] = {m: _counts(db, m, d) for m in (old_mid, new_mid)}
        d += timedelta(days=1)


def _left(db: Session, rec: dict, old_mid: int, since: date) -> None:
    """What the OLD unit filed about 0811's people since the move — counted
    only: a person decides (it is keyed to that unit and reads nothing now)."""
    try:
        today = datetime.now(TZ).date()
        rd = verifix_live.day_read(db, old_mid, today, stored_only=True)
        k = verifix_org.code_key(CODE)
        ids = set()
        if not rd.get("error"):
            ctx = live_staff.load(db, rd["day"], rd["directory"], rd["store"], rd["now"])
            ids = {eid for eid, (_m, ck) in ctx.homes.items() if ck == k}
        docs = [d for d in db.query(LiveDocument).filter(LiveDocument.manager_id == old_mid,
                                                         LiveDocument.day >= since).all()
                if {str(e.get("employee_id")) for e in (d.payload or {}).get("employees") or []} & ids]
        rec["left"] = {
            "workers": len(ids),
            "documents": [{"id": d.id, "day": d.day.isoformat(), "type": d.doc_type,
                           "status": d.status} for d in docs],
            "placements": db.query(LivePlacement).filter(
                LivePlacement.manager_id == old_mid, LivePlacement.day >= since,
                LivePlacement.employee_id.in_(ids or {"-"})).count(),
            "deletions": db.query(LiveDeletion).filter(
                LiveDeletion.manager_id == old_mid, LiveDeletion.day >= since,
                LiveDeletion.employee_id.in_(ids or {"-"})).count(),
            "clock_fixes": db.query(LiveClockFix).filter(
                LiveClockFix.manager_id == old_mid, LiveClockFix.day >= since,
                LiveClockFix.employee_id.in_(ids or {"-"})).count(),
        }
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        rec["left"] = {"error": f"{type(exc).__name__}: {exc}"[:300]}


def summary(rec: dict) -> str:
    unit = rec.get("unit")
    lines = [f"🔧 Cell {CODE} — kept in «{unit}» (2026-10-14)", ""]
    r = rec.get("result")
    if r == "moved_back":
        lines.append(f"Moved back from «{rec.get('was_name')}» to «{unit}», from "
                     f"{rec['since'][8:]}.{rec['since'][5:7]} — the day the Verifix-sync "
                     f"«brigadir_differs» move (applied by {rec.get('undone_by')}) landed.")
        lines.append("Days before it never moved. Turdimurodov's /production reads his cell again; "
                     "0811's people are on his unit's /staff list, not Aripova's.")
    elif r == "already_home":
        lines.append(f"Nothing to move: {CODE} already stands in «{unit}».")
    elif r == "withdrew_waiting":
        lines.append(f"{CODE} was in «{unit}»; a move away that was still waiting was withdrawn.")
    else:
        lines.append(f"LEFT AS IT WAS — {r} {json.dumps(rec.get('event') or {}, ensure_ascii=False)}")
    for day, info in (rec.get("days") or {}).items():
        if not info.get("closed"):
            lines.append(f"{day[8:]}.{day[5:7]}: neither unit closed — nothing to re-copy")
            continue
        lines.append(f"{day[8:]}.{day[5:7]}: {info['rewritten']} closed copies rewritten"
                     + (f" — {info['error']}" if info.get("error") else ""))
        for m, b in (info.get("before") or {}).items():
            a = (info.get("after") or {}).get(m) or {}
            lines.append(f"  unit {m}: rows {b['rows']} → {a.get('rows')}, 0811 rows {b['c0811']} → {a.get('c0811')}")
    left = rec.get("left") or {}
    if left.get("error"):
        lines.append(f"Old unit's filings: not counted ({left['error']})")
    elif left:
        docs = left.get("documents") or []
        if docs or left.get("placements") or left.get("deletions") or left.get("clock_fixes"):
            lines.append("")
            lines.append(f"Filed by «{rec.get('was_name')}» about 0811's {left.get('workers')} people since "
                         f"the move — now read by nobody, check them: "
                         f"{len(docs)} documents ({', '.join('№' + str(d['id']) + ' ' + d['status'] for d in docs) or '—'}), "
                         f"{left.get('placements')} placements, {left.get('deletions')} deletions, "
                         f"{left.get('clock_fixes')} clock fixes.")
        else:
            lines.append(f"«{rec.get('was_name')}» filed nothing about 0811's people since the move.")
    lines.append("")
    lines.append("Exception: the Verifix sync no longer suggests moving 0811 to Verifix's brigadir "
                 "(verifix_sync.KEPT_APART), and refuses such a suggestion already on the queue.")
    return "\n".join(lines)


def send_dm(db: Session, chat_id: int) -> None:
    """The record as a DM to the operator, once; a failure is retried at the next boot."""
    f = _setting(db, DM_FLAG)
    if f is not None and (f.value or "") == "done":
        return
    r = _setting(db, RECORD)
    if r is None or not r.value:
        return
    text = summary(json.loads(r.value))
    print("[startup] " + text.replace("\n", "\n[startup] "))
    try:
        import requests
        resp = requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            data={"chat_id": chat_id, "text": text[:4000]}, timeout=20)
        if resp.status_code != 200:
            raise RuntimeError(f"telegram answered {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] cell 0811 fix DM failed: {exc}")
        return
    _put(db, DM_FLAG, "done")
    db.commit()
