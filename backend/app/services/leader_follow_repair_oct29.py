"""TEMPORARY one-shot (2026-10-29): put the leaders whose cells changed brigadir
under their NEW brigadir from the move day — the days «Lider nazorati» kept
under the old one.

The report from the floor: after Maksumov Sanjar's and Xakimov Ruslan's units
exchanged cells (25 Oct), the leaders who run those cells stayed under their
original brigadir on every day since. `services/leader_follow.py` is the rule
from this build on (the operator, 2026-10-29: «Yes, automatically»); this pass
runs that same rule ONCE over every brigadir change in force since the dated
links began (`leader_follow.FLOOR`, 12 Oct), in one transaction with its flag
and its record (app setting `RECORD`), then DMs Burkhon from the record — a
failed DM is re-sent at the next boot, never re-run.

The DM also lists, for every cell whose brigadir changed since 12 Oct with
its «Boshqaruvchi» staying, where that leader and their days stand AFTER the
pass, and every leader-day still stamped with a brigadir none of the leader's
cells stood in — the check the floor asked for, whatever the rule decided.

Delete this module, `startup.repair_leader_units` and both entrypoint calls
once `DM_FLAG` reads «done».
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, CellLinkEvent, LeaderTaskDay, Manager, RoleProfile
from app.services import leader_follow

log = logging.getLogger(__name__)

RECORD = "leader_follow_repair_2026_10_29"
FLAG = RECORD + "_v1"
DM_FLAG = RECORD + "_v1_dm"


def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _state(db: Session) -> list[dict]:
    """Every cell whose brigadir changed since the floor with its leader staying:
    the move, and where the leader and their days stand now."""
    from app.services import cell_links
    E = CellLinkEvent
    evs = (db.query(E.cell_id, E.effective_from, E.prev, E.value)
           .filter(E.field == "manager_id", E.applied_at.isnot(None),
                   E.effective_from >= leader_follow.FLOOR, E.value.isnot(None))
           .order_by(E.effective_from, E.id).all())
    evs = [e for e in evs if e.prev != e.value]
    if not evs:
        return []
    cells = {c.id: c for c in db.query(Cell).filter(Cell.id.in_({e.cell_id for e in evs})).all()}
    names = {m.id: m.name for m in db.query(Manager).all()}
    out = []
    for e in evs:
        c = cells.get(e.cell_id)
        if c is None:
            continue
        day = e.effective_from
        lid = cell_links.value_on(c, "leader_id", day)
        if not lid or lid != cell_links.value_on(c, "leader_id", day - timedelta(days=1)):
            continue
        prof = db.query(RoleProfile).filter_by(id=lid).first()
        stamps = Counter(m for (m,) in db.query(LeaderTaskDay.manager_id).filter(
            LeaderTaskDay.leader_id == lid, LeaderTaskDay.date >= day.isoformat()).all())
        out.append({
            "cell": c.verifix_code, "day": day.isoformat(),
            "from": names.get(e.prev, e.prev), "to": names.get(e.value, e.value),
            "leader": prof.name if prof else lid,
            "profile_unit": names.get(prof.manager_id) if prof else None,
            "days_since": {names.get(k, str(k)): v for k, v in stamps.items()},
        })
    return out


def _mismatch(db: Session) -> list[dict]:
    """Every leader-day since the floor still stamped with a unit none of the
    leader's cells stood in that day, while all their cells stood in ONE other
    unit — grouped per leader and pair. The 0811 exception (and anybody counted
    elsewhere on purpose) shows here too: it is a list to read, not a verdict."""
    from app.services import cell_archive, cell_links
    today = datetime.now(timezone.utc).date()
    cells = db.query(Cell).all()
    days = (db.query(LeaderTaskDay.leader_id, LeaderTaskDay.date, LeaderTaskDay.manager_id)
            .filter(LeaderTaskDay.date >= leader_follow.FLOOR.isoformat()).all())
    if not days:
        return []
    per_day: dict[str, dict] = {}
    d = leader_follow.FLOOR
    while d <= today:
        lead = cell_links.map_on(cells, "leader_id", d)
        unit = cell_links.map_on(cells, "manager_id", d)
        m: dict = {}
        for c in cells:
            lid = lead.get(c.id)
            if lid and cell_archive.alive(c, d):
                m.setdefault(lid, set()).add(unit.get(c.id))
        per_day[d.isoformat()] = m
        d += timedelta(days=1)
    names = {m.id: m.name for m in db.query(Manager).all()}
    profs = {p.id: p.name for p in db.query(RoleProfile).filter(RoleProfile.role == "leader").all()}
    agg: dict = {}
    for lid, day, mid in days:
        us = (per_day.get(day) or {}).get(lid)
        if not us or len(us) != 1 or None in us:
            continue
        u = next(iter(us))
        if u == mid:
            continue
        k = (lid, mid, u)
        a = agg.setdefault(k, {"leader": profs.get(lid, lid), "stamp": names.get(mid, mid),
                               "cells_in": names.get(u, u), "first": day, "last": day, "days": 0})
        a["days"] += 1
        a["first"], a["last"] = min(a["first"], day), max(a["last"], day)
    return sorted(agg.values(), key=lambda a: (str(a["leader"]), a["first"]))


def run(db: Session) -> Optional[dict]:
    """Once: the follow over history, its record and its flag in one
    transaction. Returns the record, or None when it already ran."""
    if _setting(db, FLAG) is not None:
        return None
    res = leader_follow.follow(db, since=leader_follow.FLOOR, by="Avtomatik (tuzatish)")
    if res.get("busy"):
        db.rollback()
        return None
    names = {m.id: m.name for m in db.query(Manager).all()}
    rec = {
        "at": datetime.now(timezone.utc).isoformat(),
        "moves": [{**m, "from_name": names.get(m["from"]), "to_name": names.get(m["to"]),
                   "profile_unit_name": names.get(m.get("profile_unit"))}
                  for m in res["moves"]],
        "named": [{**n, **{f"{k}_name": names.get(n[k]) for k in
                           ("counted", "to", "from", "profile_unit") if n.get(k) is not None}}
                  for n in res["named"]],
    }
    db.flush()
    rec["state"] = _state(db)
    rec["mismatch"] = _mismatch(db)
    _put(db, RECORD, json.dumps(rec, ensure_ascii=False, default=str))
    _put(db, FLAG, f"done:{len(rec['moves'])}/{len(rec['named'])}")
    db.commit()
    leader_follow.after_commit()
    leader_follow.log_moves(db, res["moves"])
    try:
        from app.services import leader_register
        leader_register.forget()
    except Exception:  # noqa: BLE001
        pass
    return rec


_KIND = {
    "split": "yacheykalari ikki brigadirda — joyida qoldi",
    "counted_elsewhere": "ataylab boshqa brigadirda hisoblanadi — tegilmadi",
    "profile_elsewhere": "profili uchinchi brigadirda — tegilmadi",
    "kept_apart": "istisno (0811) — tegilmadi",
    "no_unit": "yacheykasining brigadiri yo'q — tegilmadi",
    "unit_gone": "yangi brigadir arxivda — tegilmadi",
}


def summary(rec: dict) -> str:
    lines = ["Lider nazorati: yacheykalari bilan ko'chgan liderlar (12-oktabrdan)", ""]
    moves = rec.get("moves") or []
    if moves:
        lines.append(f"Ko'chirildi — {len(moves)} ta lider:")
        for m in moves:
            rs = m.get("restamped") or {}
            what = ", ".join(f"{k} {v}" for k, v in sorted(rs.items())) or "kunlar yo'q"
            pre = " (profil allaqachon yangi brigadirda edi)" if m.get("profile_unit") == m.get("to") else ""
            lines.append(f"• {m['leader']} — {m['from_name']} → {m['to_name']} "
                         f"{m['day']} dan · {' · '.join(m.get('cells') or [])} · {what}{pre}")
    else:
        lines.append("Ko'chiriladigan lider topilmadi.")
    named = rec.get("named") or []
    if named:
        lines += ["", f"Tegilmadi — {len(named)}:"]
        for n in named:
            lines.append(f"• {n['leader']} · {n['day']} · {' · '.join(n.get('cells') or [])} — "
                         f"{_KIND.get(n['kind'], n['kind'])}")
    state = rec.get("state") or []
    if state:
        lines += ["", "Brigadiri o'zgargan yacheykalar (lider o'zgarmagan) — hozirgi holat:"]
        for s in state:
            days = ", ".join(f"{k}: {v}" for k, v in s["days_since"].items()) or "kun yo'q"
            lines.append(f"• {s['cell']} {s['day']}: {s['from']} → {s['to']} · {s['leader']} · "
                         f"profil: {s['profile_unit']} · kunlari: {days}")
    mism = rec.get("mismatch") or []
    lines += ["", "Hali ham boshqa brigadirda turgan kunlar (lider yacheykalari bitta boshqa brigadirda):"
              if mism else "Boshqa brigadirda qolgan kun yo'q — har bir lider kuni o'z yacheykalari "
                           "turgan brigadirda (12-oktabrdan)."]
    for a in mism[:40]:
        lines.append(f"• {a['leader']}: {a['first']}…{a['last']} ({a['days']} kun) — kuni "
                     f"{a['stamp']}da, yacheykalari {a['cells_in']}da")
    if len(mism) > 40:
        lines.append(f"… yana {len(mism) - 40} ta")
    return "\n".join(lines)


def send_dm(db: Session, chat_id: int) -> None:
    """The record as a DM, once; a failure is retried at the next boot."""
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
        base = f"https://api.telegram.org/bot{settings.telegram_bot_token}"
        if len(text) <= 4000:
            resp = requests.post(f"{base}/sendMessage",
                                 data={"chat_id": chat_id, "text": text}, timeout=20)
        else:
            resp = requests.post(f"{base}/sendDocument",
                                 data={"chat_id": chat_id,
                                       "caption": text[:900].rsplit("\n", 1)[0]},
                                 files={"document": ("lider-kochish.txt", text.encode("utf-8"),
                                                     "text/plain")},
                                 timeout=40)
        if resp.status_code != 200:
            raise RuntimeError(f"telegram answered {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] leader follow repair DM failed: {exc}")
        return
    _put(db, DM_FLAG, "done")
    db.commit()
