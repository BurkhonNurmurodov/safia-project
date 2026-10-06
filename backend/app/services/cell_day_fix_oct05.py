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

Refuses — stages nothing and says what it found — unless the cell and the unit
resolve exactly once, the rows sit under ONE other unit, and nothing on that
unit's 5 Oct depends on them (a split half outside the cell, a pending or
approved request or document naming one of the workers). Ids are never trusted.
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
    out: dict = {"problems": [], "already": False, "cell": None, "to": None,
                 "from": None, "rows": 0, "people": 0.0, "hours": 0.0,
                 "routing": [], "missing": [], "states": {}, "leader": None}

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
        out["problems"].append(
            f"{DAY:%d.%m.%Y} uchun {cell.verifix_code} davomati hali yo'q "
            "(«Davomat» saqlanmagan) — ko'chiradigan narsa yo'q")
        return out
    src = sorted({r.manager_id for r in rows if r.manager_id != to_.id})
    if not src:
        out["already"] = True
        out["rows"] = len(rows)
        return out
    if len(src) > 1:
        out["problems"].append(
            "qatorlar bir nechta bo'linmada: "
            + ", ".join(unit_name.get(m, f"#{m}") for m in src))
        return out
    from_id = src[0]
    out["from"] = unit_name.get(from_id, f"#{from_id}")

    moving = [r for r in rows if r.manager_id == from_id]
    ids = {r.id for r in moving}
    names = {(r.worker_name or "").strip() for r in moving if r.worker_name}

    # A split half on another cell would leave the worker-day across two units.
    loose = [r for r in moving if r.split_of and r.split_of not in ids]
    loose += (db.query(Attendance)
              .filter(Attendance.split_of.in_(ids), ~Attendance.id.in_(ids)).all()
              if ids else [])
    if loose:
        out["problems"].append(
            "ikkiga bo'lingan xodimlar boshqa yacheykada ham: "
            + ", ".join(sorted({r.worker_name or "—" for r in loose})))

    # Anything on that unit's day that names one of these workers would point at
    # a row that is no longer there.
    reqs = (db.query(EditRequest)
            .filter(EditRequest.manager_id == from_id, EditRequest.date == DAY,
                    EditRequest.status != "rejected").all())
    hit = [r for r in reqs if (r.worker_name or "").strip() in names]
    docs = (db.query(HrDocument)
            .filter(HrDocument.manager_id == from_id, HrDocument.date == DAY,
                    HrDocument.status != "rejected").all())
    for d in docs:
        blob = json.dumps(d.payload or {}, ensure_ascii=False)
        if any(n and n in blob for n in names):
            hit.append(d)
    if hit:
        out["problems"].append(
            f"«{out['from']}» {DAY:%d.%m} kunida bu xodimlarga tegishli "
            f"{len(hit)} ta so'rov/hujjat bor — avval ularni hal qiling")
    if out["problems"]:
        return out

    for r in moving:
        r.manager_id = to_.id
    out["rows"] = len(moving)
    out["people"] = round(sum(1.0 if r.hc_weight is None else float(r.hc_weight)
                              for r in moving if (r.hours_worked or 0) > 0), 2)
    out["hours"] = round(sum(float(r.hours_worked or 0) for r in moving), 2)

    for bc in bcs:
        before = bc.manager_id
        bc.manager_id = to_.id
        if bc.prev_manager_id == from_id:
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

    out["states"] = {to_.name: _state(db, to_.id), out["from"]: _state(db, from_id)}

    # The cell's leader and the unit their 5 Oct checklist counts in — reported
    # only; a checklist follows its leader's profile, not the cell.
    if cell.leader_id:
        prof = db.query(RoleProfile).filter(RoleProfile.id == cell.leader_id).first()
        days = (db.query(LeaderTaskDay.manager_id)
                .filter(LeaderTaskDay.leader_id == cell.leader_id,
                        LeaderTaskDay.date == DAY).all())
        out["leader"] = (
            prof.name if prof else f"#{cell.leader_id}",
            unit_name.get(prof.manager_id, "—") if prof else "—",
            sorted({unit_name.get(m, f"#{m}") for (m,) in days}),
        )
    return out


def message(out: dict) -> str:
    day = f"{DAY:%d.%m.%Y}"
    if out["problems"]:
        return (f"⚠️ {CELL} yacheykasining {day} davomatini «{UNIT}»ga qaytarib "
                "bo'lmadi — hech narsa o'zgarmadi:\n• "
                + "\n• ".join(out["problems"])
                + "\n\nQo'lda: «Davomat» tabida shu sanani ochib, yacheykani "
                  f"{UNIT} bo'limiga sudrang (faqat shu kun) va Saqlang. "
                  "Keyingi deployda yana tekshiriladi.")
    if out["already"]:
        return (f"✅ {out['cell']} yacheykasining {day} davomati ({out['rows']} qator) "
                f"allaqachon «{out['to']}»da — hech narsa o'zgartirilmadi.")
    lines = [
        f"✅ {out['cell']} yacheykasi {day} kuni «{out['to']}» brigadasida hisoblanadi.",
        f"• Davomat: {out['rows']} qator «{out['from']}»dan ko'chirildi "
        f"({out['people']:g} kishi kelgan, {out['hours']:g} soat).",
    ]
    if out["routing"]:
        lines.append("• «Davomat» tabida shu kunning yo'nalishi ham "
                     f"«{out['to']}» (faqat {day}); keyingi Saqlash ularni joyida qoldiradi.")
    lines.append(f"• Yacheykalar reyestri o'zgarmadi: {out['cell']} 06.10 dan "
                 f"«{out['from']}»da qoladi.")
    for unit, st in out["states"].items():
        lines.append(f"• {unit} — {day}: {st}")
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
