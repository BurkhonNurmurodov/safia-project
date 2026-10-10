"""TEMPORARY one-shot (2026-10-10): the cell flag replaces the five names.

On 25 Sep the operator named five leaders whose cells only ever do one process
(services/leader_rules_sep26 `ONE_PROCESS_LEADERS`), and each got a LEADER-level
task-3 text saying all three photos may show that process. From today a cell
says it itself — `cells.one_process`, «Jarayonlar» on /cells — and
`services/one_process.py` hands the very same text to every leader whose cells
are all one-process. So, once (the operator's pick, 2026-10-10):

1. every cell each of the five runs that exists today is marked «Bitta jarayon»;
2. their own task-3 text is cleared where it is still one of the 26 Sep
   one-process texts — they then read that same text through the flag, so
   NOTHING a leader reads or is judged by moves; a text an admin wrote for
   them by hand stays, and is named;
3. a leader with no cell keeps their text (clearing it would put them back on
   3 processes), and is named.

One transaction with the flag claimed inside it, so two copies booting together
cannot both act. The record is kept in app setting `RECORD`; the list of marked
cells goes to the operator's chat (`send_dm`, once; a failure retries at the
next boot) and one «Jurnal» row (`org.cells_one_process_seeded`).

Delete this module, `startup.seed_one_process_cells` and its call in BOTH
entrypoints once `DM_FLAG` reads «done» — and before `leader_rules_sep26`,
whose texts it compares against.
"""
from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, LeaderTaskLeaderSetting, Manager, RoleProfile
from app.services import one_process

FLAG = "one_process_cells_seed_2026_10_10_v1"
DM_FLAG = FLAG + "_dm"
RECORD = "one_process_cells_seed_2026_10_10"

#: The operator's 25 Sep list, matched by profile id AND name — ids are this
#: database's, and a renamed or re-used profile is not the person named.
LEADERS = (
    (292, "Akramov Dilshodbek"),     # crêpes · Kamolova Nargiza · shift 2
    (307, "Omonov Bekzod"),          # cream-coating · Akbarov Tursunali · shift 2
    (282, "Ro'ziyeva Munisxon"),     # packing · Ibragimova Sayyora · shift 2
    (228, "Saidova Xosiyatxon"),     # sponge slicing · Xakimov Ruslan · shift 1
    (220, "Tursunboyev Abduqodir"),  # boxing · Abdukarimov Sanjar · shift 1
)


def _known_texts() -> set[str]:
    """Every one-process text a leader row may still hold: the current one,
    plus the 26 Sep first cut and the hand-width sleeve wording."""
    out = {one_process.CRITERIA.strip()}
    try:
        from app.services import leader_rules_sep26 as sep26
        out.add(sep26.ONE_PROCESS_CRITERIA.strip())
        out.add(sep26.ONE_PROCESS_CRITERIA_V1.strip())
        out |= {old for old, new in sep26.SLEEVE_UPGRADE.items()
                if new.strip() == sep26.ONE_PROCESS_CRITERIA.strip()}
    except Exception:            # the 26 Sep module already deleted
        pass
    return out


def _setting(db: Session, key: str):
    return db.query(AppSetting).filter_by(key=key).first()


def run(db: Session) -> dict | None:
    """Mark, clear, record — once. None when the flag was already taken."""
    from app.services import cell_archive, leader_tasks

    claimed = db.execute(text(
        "INSERT INTO app_settings (key, value) VALUES (:k, '1') "
        "ON CONFLICT (key) DO NOTHING RETURNING key"), {"k": FLAG}).first()
    if not claimed:
        db.rollback()
        return None
    known = _known_texts()
    rec: dict = {"leaders": [], "skipped": [], "cells": 0, "cleared": 0}
    for pid, name in LEADERS:
        prof = db.query(RoleProfile).filter_by(id=pid, role="leader").first()
        if not prof or not (prof.name or "").startswith(name):
            rec["skipped"].append({"name": name, "why": "no_profile"})
            continue
        cells = (db.query(Cell)
                 .filter(Cell.leader_id == prof.id, cell_archive.alive_clause())
                 .order_by(Cell.verifix_code).all())
        unit = (db.query(Manager.name).filter_by(id=prof.manager_id).scalar()
                if prof.manager_id else None)
        if not cells:
            rec["skipped"].append({"name": prof.name, "why": "no_cell"})
            continue
        for c in cells:
            c.one_process = True
        row = (db.query(LeaderTaskLeaderSetting)
               .filter_by(leader_id=prof.id, task_id=one_process.TASK).first())
        cur = (row.criteria or "").strip() if row else ""
        if not cur:
            state = "none"
        elif cur in known:
            row.criteria = None
            if leader_tasks._leader_row_bare(row):
                db.delete(row)
            state = "cleared"
            rec["cleared"] += 1
        else:
            state = "kept"               # an admin's own wording — it still wins
        rec["cells"] += len(cells)
        rec["leaders"].append({"name": prof.name, "unit": unit, "text": state,
                               "codes": [c.verifix_code for c in cells]})
    db.add(AppSetting(key=RECORD, value=json.dumps(rec, ensure_ascii=False)))
    db.commit()
    return rec


def summary(rec: dict) -> str:
    """The operator's DM, in Uzbek."""
    lines = [
        "📋 Bitta jarayonli yacheykalar (10.10)",
        "25.09 da nomlangan liderlarning yacheykalari «Bitta jarayon» deb "
        "belgilandi. 3-vazifada ular uchun 3 xil jarayon talab qilinmaydi — "
        "oldingidek; endi bu /cells dagi «Jarayonlar» belgisidan o'qiladi.",
        "",
        f"Belgilangan yacheykalar: {rec.get('cells', 0)}",
    ]
    for item in rec.get("leaders", []):
        who = item["name"] + (f" · {item['unit']}" if item.get("unit") else "")
        lines.append(f"• {who}: {', '.join(item['codes'])}")
    kept = [i["name"] for i in rec.get("leaders", []) if i.get("text") == "kept"]
    lines.append("")
    lines.append(f"Liderning o'z 3-vazifa matni olib tashlandi: {rec.get('cleared', 0)} "
                 "(xuddi shu matn endi yacheyka belgisidan keladi)")
    if kept:
        lines.append("Qo'lda yozilgan o'z matni qoldirildi (u ustun): " + ", ".join(kept))
    why = {"no_profile": "profil topilmadi", "no_cell": "yacheykasi yo'q (o'z 3-vazifa matni o'zgarmadi)"}
    for s in rec.get("skipped", []):
        lines.append(f"Tegilmadi: {s['name']} — {why.get(s['why'], s['why'])}")
    lines.append("")
    lines.append("Ro'yxatdagi yacheyka aslida bir necha jarayonda ishlasa, /cells da "
                 "uni «Ko'p jarayon» qiling. Oldingi xulosalar qayta hisoblanmaydi.")
    return "\n".join(lines)


def send_dm(db: Session, chat_id: int) -> None:
    """The record as a DM to the operator, once; a failure retries at the next boot."""
    f = _setting(db, DM_FLAG)
    if f is not None and (f.value or "") == "done":
        return
    r = _setting(db, RECORD)
    if r is None or not r.value:
        return
    body = summary(json.loads(r.value))
    print("[startup] " + body.replace("\n", "\n[startup] "))
    try:
        import requests
        resp = requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            data={"chat_id": chat_id, "text": body[:4000]}, timeout=20)
        if resp.status_code != 200:
            raise RuntimeError(f"telegram answered {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] one-process cells DM failed: {exc}")
        return
    if f is None:
        db.add(AppSetting(key=DM_FLAG, value="done"))
    else:
        f.value = "done"
    db.commit()
