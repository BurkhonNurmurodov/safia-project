"""⚠ TEMPORARY one-shot (2026-10-06): cell 9123's 5 October counts for
Raximova Kamola.

Delete this module together with `startup.fix_cell_9123_oct05` and its call in
BOTH `main.py` and `passenger_wsgi.py` once its flag reads «done».

The operator (6 Oct 2026): cell 9123 was moved to its new unit on 5 October,
but the move was meant to start on the 6th. The cells register is not dated, so
the move itself is right from 6 Oct on (a live day reads the register when it
is read) and is left alone. What is wrong is the one day that was STORED after
the move: 5 October's «Davomat» Save routed the cell by the register as it
stood then, so 9123's people of that day landed on the new unit's attendance.

What it writes — on 2026-10-05 only:
  1. every `attendance` row of the cell on that date, still under the unit it
     was routed to, moves to Raximova Kamola's unit (`manager_id` only — hours,
     clocks, cells, splits untouched);
  2. that day's «Davomat» routing of the cell (`attendance_batch_cells`) names
     her unit as a THIS-DAY-ONLY move — exactly what dragging the cell on the
     tab does — so a later Save of the day keeps the rows where they are. The
     cells register (`cells.manager_id`) is NOT touched.

It moves rows, never re-projects a day: a re-projection wipes and rebuilds the
whole (unit, date), which would undo anything the brigadirs did on /staff.

Refuses — stages nothing — only when the cell or the unit does not resolve
exactly once, or the rows sit under several units none of which is the cell's
register unit. Otherwise it moves every row it safely can and HOLDS BACK, per
worker, only one still named by something WAITING on that unit's 5 Oct (a
pending request, a draft document) or split across another cell; held workers
are re-checked until the reason is gone. Requests and documents already decided
travel with the row and are only named. With no row saved yet it routes the
day's batch cell to her and waits (`waiting`). Ids are never trusted.

v2 (same day): v1 ran once at boot, refused the WHOLE cell over any one worker,
and went silent — 9123 was still on Yogmirov Feruz's 5 Oct afterwards and nothing
said why. Now it holds back per worker, the startup side re-checks every 10
minutes until nothing is left (or 13 Oct), and every distinct outcome is DMed.
"""
from __future__ import annotations

import json
from datetime import date

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Attendance, AttendanceBatch, AttendanceBatchCell, AttendanceBatchRow, Cell,
    EditRequest, HrDocument, LeaderTaskDay, Manager, RoleProfile,
)
from app.services.name_map import _name_tokens, _norm

CELL = "9123"
UNIT = "Raximova Kamola"
DAY = date(2026, 10, 5)


def _unit(db: Session):
    units = db.query(Manager).filter(Manager.archived.is_(False)).all()
    exact = [m for m in units if _norm(m.name) == _norm(UNIT)]
    if len(exact) == 1:
        return exact[0], []
    key = _name_tokens(UNIT)[:2]
    near = [m for m in units if _name_tokens(m.name)[:2] == key]
    if len(near) == 1:
        return near[0], []
    return None, exact or near


def _state(db: Session, mid: int) -> str:
    from app.services.day_state import day_state
    state, closure, _counts = day_state(db, mid, DAY)
    if closure is None:
        return "ochiq"
    who = closure.approved_by_name or "—"
    return f"{'yopilgan' if state == 'closed' else 'tasdiqlangan'} ({who})"


def apply(db: Session) -> dict:
    """Stage the move on `db` and report it. Never commits: the caller commits
    it together with its flag. A non-empty ``problems`` means nothing staged;
    ``already`` means the rows were already hers and nothing needed doing."""
    out: dict = {"problems": [], "already": False, "waiting": False, "cell": None,
                 "to": None, "from": None, "rows": 0, "people": 0.0, "hours": 0.0,
                 "routing": [], "missing": [], "states": {}, "leader": None,
                 "notes": [], "held": [], "held_key": ""}

    cells = db.query(Cell).filter(Cell.verifix_code.in_(
        [CELL, CELL.lstrip("0"), CELL.zfill(4)])).all()
    if len(cells) != 1:
        out["problems"].append(f"yacheyka {CELL}: {len(cells)} ta topildi (bitta kutilgan)")
        return out
    cell = cells[0]
    out["cell"] = cell.verifix_code

    to_, found = _unit(db)
    if to_ is None:
        names = ", ".join(f"#{m.id} {m.name}" for m in found) or "topilmadi"
        out["problems"].append(f"«{UNIT}» bo'linmasi: {names} (bitta kutilgan)")
        return out
    out["to"] = to_.name
    unit_name = {m.id: m.name for m in db.query(Manager).all()}

    batch = db.query(AttendanceBatch).filter(AttendanceBatch.date == DAY).first()
    bcs = []
    codes = {cell.verifix_code}
    if batch is not None:
        bcs = (db.query(AttendanceBatchCell)
               .filter(AttendanceBatchCell.batch_id == batch.id,
                       or_(AttendanceBatchCell.cell_id == cell.id,
                           AttendanceBatchCell.verifix_code == cell.verifix_code))
               .all())
        codes |= {bc.verifix_code for bc in bcs}

    rows = (db.query(Attendance)
            .filter(Attendance.date == DAY, Attendance.verifix_code.in_(codes))
            .all())
    if not rows:
        # Nothing saved for the cell yet: route the day's batch cell to her now
        # (the tab's own this-day-only drag), so the next Save writes the rows
        # there. Checked again until the rows exist.
        out["waiting"] = True
        out["routed"] = bool(bcs)
        for bc in bcs:
            if bc.manager_id != to_.id:
                out["routing"].append((bc.verifix_code, unit_name.get(bc.manager_id, "—"),
                                       bool(bc.included)))
                bc.manager_id = to_.id
                bc.pending = True
        return out
    src = sorted({r.manager_id for r in rows if r.manager_id != to_.id})
    if not src:
        out["already"] = True
        out["rows"] = len(rows)
        for bc in bcs:
            if bc.manager_id != to_.id:
                out["routing"].append((bc.verifix_code, unit_name.get(bc.manager_id, "—"),
                                       bool(bc.included)))
                bc.manager_id = to_.id
                if not bc.pending:
                    bc.prev_manager_id = to_.id
        return out
    # The unit the move sent the cell to is its register unit today; rows under
    # any OTHER unit (an admin's hand, an older routing) are named, not moved.
    from_id = cell.manager_id if cell.manager_id in src else (src[0] if len(src) == 1 else None)
    if from_id is None:
        out["problems"].append(
            "qatorlar bir nechta bo'linmada: "
            + ", ".join(unit_name.get(m, f"#{m}") for m in src))
        return out
    out["from"] = unit_name.get(from_id, f"#{from_id}")
    others = [m for m in src if m != from_id]
    if others:
        out["notes"].append(
            f"{CELL} qatorlari boshqa bo'linmada ham bor (tegilmadi): "
            + ", ".join(unit_name.get(m, f"#{m}") for m in others))

    moving = [r for r in rows if r.manager_id == from_id]
    ids = {r.id for r in moving}
    names = {(r.worker_name or "").strip() for r in moving if r.worker_name}

    # Held back, per WORKER, never the whole cell: everybody else moves now and
    # the held ones are re-checked until their reason is gone.
    held: dict = {}

    # A split whose other half stands in another cell would leave the
    # worker-day across two units — both halves stay until it is un-split.
    partners = (db.query(Attendance)
                .filter(Attendance.split_of.in_(ids), ~Attendance.id.in_(ids)).all()
                if ids else [])
    for r in moving:
        if (r.split_of and r.split_of not in ids) or any(p.split_of == r.id for p in partners):
            held.setdefault(r.id, (r.worker_name or "—", "ikki yacheykaga bo'lingan"))

    # A request or document still WAITING on that unit's day that names a
    # worker would be decided against a row that is no longer there — that
    # worker stays until it is approved or rejected. One already decided was
    # applied to the row and travels with it; it is only noted.
    def _names_in(d) -> list:
        blob = json.dumps(d.payload or {}, ensure_ascii=False)
        return sorted(n for n in names if n and n in blob)

    waits: dict = {}
    for r in (db.query(EditRequest)
              .filter(EditRequest.manager_id == from_id, EditRequest.date == DAY).all()):
        nm = (r.worker_name or "").strip()
        if nm in names and r.status != "rejected":
            if r.status == "pending":
                waits.setdefault(nm, f"so'rov #{r.id} kutilmoqda")
            else:
                out["notes"].append(f"so'rov #{r.id} ({r.status}) — {r.worker_name}")
    for d in (db.query(HrDocument)
              .filter(HrDocument.manager_id == from_id, HrDocument.date == DAY).all()):
        hit = _names_in(d)
        if hit and d.status != "rejected":
            if d.status == "draft":
                for nm in hit:
                    waits.setdefault(nm, f"hujjat #{d.id} ({d.doc_type}) kutilmoqda")
            else:
                out["notes"].append(f"hujjat #{d.id} {d.doc_type} ({d.status}) — "
                                    + ", ".join(hit[:3]))
    for r in moving:
        nm = (r.worker_name or "").strip()
        if nm in waits:
            held.setdefault(r.id, (r.worker_name or "—", waits[nm]))

    out["held"] = sorted({v for v in held.values()})
    out["held_key"] = ",".join(str(i) for i in sorted(held))
    movable = [r for r in moving if r.id not in held]
    out["states"] = _report_only(db, lambda: {to_.name: _state(db, to_.id),
                                              out["from"]: _state(db, from_id)}, {})
    if not movable:
        return out

    for r in movable:
        r.manager_id = to_.id
    out["rows"] = len(movable)
    out["people"] = round(sum(1.0 if r.hc_weight is None else float(r.hc_weight)
                              for r in movable if (r.hours_worked or 0) > 0), 2)
    out["hours"] = round(sum(float(r.hours_worked or 0) for r in movable), 2)

    for bc in bcs:
        if bc.manager_id == to_.id:
            continue
        before = bc.manager_id
        bc.manager_id = to_.id
        if bc.prev_manager_id == from_id or not bc.pending:
            bc.prev_manager_id = to_.id
        out["routing"].append((bc.verifix_code, unit_name.get(before, "—"), bool(bc.included)))

    # Workers the day's read filed under the cell who are not among the rows —
    # placed elsewhere or never ticked. Named, never touched.
    if batch is not None:
        read = {(r.worker_name or "").strip() for r in db.query(AttendanceBatchRow.worker_name)
                .filter(AttendanceBatchRow.batch_id == batch.id,
                        AttendanceBatchRow.verifix_code.in_(codes)).all() if r.worker_name}
        out["missing"] = sorted(read - names - {
            (r.worker_name or "").strip() for r in rows if r.manager_id == to_.id})

    # The cell's leader and the unit their 5 Oct checklist counts in — reported
    # only; a checklist follows its leader's profile, not the cell.
    # `leader_task_days.date` is a "YYYY-MM-DD" STRING: compared with a date it
    # raised, rolled the whole move back on every pass (v2, 6 Oct) — so this
    # part is also fenced off and can never block the move again.
    if cell.leader_id:
        def leader():
            prof = db.query(RoleProfile).filter(RoleProfile.id == cell.leader_id).first()
            days = (db.query(LeaderTaskDay.manager_id)
                    .filter(LeaderTaskDay.leader_id == cell.leader_id,
                            LeaderTaskDay.date == DAY.isoformat()).all())
            return (
                prof.name if prof else f"#{cell.leader_id}",
                unit_name.get(prof.manager_id, "—") if prof else "—",
                sorted({unit_name.get(m, f"#{m}") for (m,) in days}),
            )
        out["leader"] = _report_only(db, leader, None)
    return out


def _report_only(db: Session, fn, fallback):
    """Run a REPORT-ONLY read inside a savepoint. A failed statement aborts a
    Postgres transaction, so without the savepoint one bad read in the message
    would take the staged move down with it."""
    try:
        with db.begin_nested():
            return fn()
    except Exception as exc:
        print(f"[cell_day_fix_oct05] report-only read skipped: {exc!r}"[:300])
        return fallback


def message(out: dict) -> str:
    day = f"{DAY:%d.%m.%Y}"
    if out["problems"]:
        return (f"⚠️ {CELL} yacheykasining {day} davomatini «{UNIT}»ga qaytarib "
                "bo'lmadi — hech narsa o'zgarmadi:\n• "
                + "\n• ".join(out["problems"])
                + "\n\nHar 10 daqiqada qayta tekshiriladi: sabab yo'qolsa, o'zi "
                  "ko'chiradi. Qo'lda: «Davomat» tabida shu sanani ochib, yacheykani "
                  f"{UNIT} bo'limiga sudrang (faqat shu kun) va Saqlang.")
    if out["waiting"]:
        return (f"⏳ {CELL} yacheykasining {day} davomati hali saqlanmagan — "
                + (f"«Davomat» tabida shu kunning yo'nalishi «{out['to']}»ga "
                   "qo'yildi, Saqlanganda qatorlar o'sha yerga tushadi. "
                   if out.get("routed") else "")
                + "Har 10 daqiqada qayta tekshiriladi.")
    if out["already"]:
        return (f"✅ {out['cell']} yacheykasining {day} davomati ({out['rows']} qator) "
                f"«{out['to']}»da"
                + (" — «Davomat» yo'nalishi ham unga qo'yildi." if out["routing"] else "."))
    held = "; ".join(f"{n} — {why}" for n, why in out["held"][:12]) + (
        f" va yana {len(out['held']) - 12}" if len(out["held"]) > 12 else "")
    if not out["rows"] and out["held"]:
        return (f"⏳ {out['cell']} yacheykasining {day} davomati: {len(out['held'])} kishi "
                f"hali «{out['from']}»da — {held}.\nSababi yo'qolishi bilan (so'rov/hujjat "
                "hal qilinsa, bo'lingan xodim birlashtirilsa) o'zi «"
                f"{out['to']}»ga ko'chadi; har 10 daqiqada tekshiriladi.")
    lines = [
        f"✅ {out['cell']} yacheykasi {day} kuni «{out['to']}» brigadasida hisoblanadi.",
        f"• Davomat: {out['rows']} qator «{out['from']}»dan ko'chirildi "
        f"({out['people']:g} kishi kelgan, {out['hours']:g} soat).",
    ]
    if out["held"]:
        lines.append(f"• Hali «{out['from']}»da qoldi ({len(out['held'])} kishi; sababi "
                     f"yo'qolishi bilan o'zi ko'chadi, har 10 daqiqada tekshiriladi): {held}")
    if out["routing"]:
        lines.append("• «Davomat» tabida shu kunning yo'nalishi ham "
                     f"«{out['to']}» (faqat {day}); keyingi Saqlash ularni joyida qoldiradi.")
    lines.append(f"• Yacheykalar reyestri o'zgarmadi: {out['cell']} 06.10 dan "
                 f"«{out['from']}»da qoladi.")
    for unit, st in out["states"].items():
        lines.append(f"• {unit} — {day}: {st}")
    if out["notes"]:
        lines.append("• Avval hal qilingan so'rov/hujjatlar (qator bilan ko'chdi; "
                     "bekor qilinsa qo'lda tekshiring): " + "; ".join(out["notes"][:6]))
    if out["missing"]:
        lines.append("• O'qilgan, lekin qatorlarda topilmagan (tegilmadi): "
                     + ", ".join(out["missing"][:15])
                     + (f" va yana {len(out['missing']) - 15}" if len(out["missing"]) > 15 else ""))
    if out["leader"]:
        name, unit, day_units = out["leader"]
        lines.append(f"• Lider: {name} (profili «{unit}»da); {day} chek-listi: "
                     + (", ".join(day_units) if day_units else "kun yo'q")
                     + " — o'zgartirilmadi.")
    lines.append("• Kutish (ojidaniya) yozuvlari yacheykaning HOZIRGI bo'linmasi "
                 "bo'yicha o'qiladi — bu tuzatish ularga tegmadi.")
    return "\n".join(lines)
