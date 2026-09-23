"""One-off: WHEN did a leader finish filling the page, and what stood at the hour.

The operator asked on 2026-09-23 for the time Normanov Xurshidbek finished
filling his plan and people on 23 Sep. His task #1 («Yacheykaning kunlik planini
qayd qilish», 10:00) was recorded «started late» while he said the page was
filled before 10:00. Production is not readable from the machine that wrote
this, so the answer is DMed from the server.

It READS and writes nothing but its flag. Every time comes from the Jurnal
(`action_logs`, one row per save, with who made it) and the stored rows' own
timestamps. «What stood at 10:00» is the replay the 22 Sep restore list used
(`auto_check_restore._Unit`), so it answers the question the same way that
list did.

Temporary: delete this module, `startup.report_filling_times` /
`_filling_times_job` and the call in BOTH entrypoints once it has been sent.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ActionLog, Cell, LeaderAutoCheck, LeaderTaskDay, LeaderTaskDef,
    LeaderTaskEntry, Manager, PPWorkCenterDaily, RoleProfile,
)
from app.services import leader_auto

log = logging.getLogger(__name__)

LEADER_ID = 306                 # Normanov Xurshidbek Musaddin O'g'li
DATE = "2026-09-23"
TZ = leader_auto.TASHKENT
_API = "https://api.telegram.org"
SEND_RETRIES = 3
_PEOPLE = ("production.staffing_set", "production.wc_override_set")


def _hms(v: datetime | None) -> str:
    if v is None:
        return "—"
    v = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ).strftime("%H:%M:%S")


def _dhm(v: datetime | None) -> str:
    if v is None:
        return "—"
    v = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ).strftime("%d.%m %H:%M")


def _det(r: ActionLog) -> dict:
    out = {}
    for pair in (r.details or []):
        try:
            out[str(pair[0])] = pair[1]
        except Exception:
            continue
    return out


def collect(db: Session, leader_id: int = LEADER_ID, date: str = DATE) -> dict:
    """Everything the message says, as plain data."""
    from app.services import auto_check_restore as acr

    prof = db.get(RoleProfile, leader_id)
    if prof is None:
        raise RuntimeError(f"leader profile {leader_id} not found")
    m = db.get(Manager, prof.manager_id)
    cells = (db.query(Cell).filter(Cell.leader_id == prof.id)
             .order_by(Cell.verifix_code).all())
    codes = {acr._norm(c.sap_code) for c in cells if c.sap_code}
    day_d = datetime.strptime(date, "%Y-%m-%d").date()

    # ── the checks' own record ───────────────────────────────────────────────
    defs = {d.id: d for d in db.query(LeaderTaskDef).all()}
    ledger = (db.query(LeaderAutoCheck)
              .filter(LeaderAutoCheck.leader_id == prof.id,
                      LeaderAutoCheck.date == date)
              .order_by(LeaderAutoCheck.task_id, LeaderAutoCheck.cell_id).all())
    checks = [{
        "task": a.task_id,
        "name": getattr(defs.get(a.task_id), "name_uz", None) or f"#{a.task_id}",
        "check": a.check, "due": _hms(a.due_at), "warned": _hms(a.warned_at),
        "checked": _hms(a.checked_at), "outcome": a.outcome, "code": a.code,
        "facts": a.facts, "entry": a.entry_id,
    } for a in ledger]
    due = next((a.due_at for a in ledger if a.check == "plan_staffing" and a.due_at),
               datetime.strptime(date + " 10:00", "%Y-%m-%d %H:%M").replace(tzinfo=TZ))

    # ── his bot checklist: the first answer IS the moment it began ──────────
    days = (db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.leader_id == prof.id, LeaderTaskDay.date == date).all())
    entries = []
    for d in days:
        for e in (db.query(LeaderTaskEntry).filter_by(day_id=d.id)
                  .order_by(LeaderTaskEntry.saved_at).all()):
            entries.append({"task": e.task_id, "done": e.done,
                            "saved": e.saved_at, "closed": e.closed_at,
                            "reason": (e.reason or "")[:60]})
    entries.sort(key=lambda x: (x["saved"] is None, x["saved"] or due))

    # ── every people save on his work centres ───────────────────────────────
    people = []
    for r in (db.query(ActionLog)
              .filter(ActionLog.unit_id == m.id, ActionLog.day == day_d,
                      ActionLog.action.in_(_PEOPLE))
              .order_by(ActionLog.created_at, ActionLog.id).all()):
        bits = []
        for ch in (r.changes or []):
            try:
                name, old, new = str(ch[0]), ch[1], ch[2]
            except Exception:
                continue
            if name == "minutes":
                continue
            if r.action == "production.wc_override_set":
                parts = str(r.target_id or "").split(":")
                wc = acr._norm(parts[2]) if len(parts) > 2 else ""
                label = parts[2] + (f" · {parts[3]}" if len(parts) > 3 and parts[3] else "") \
                    if len(parts) > 2 else name
            else:
                wc = acr._norm(name.split(" · ", 1)[0])
                label = name
            if wc in codes:
                bits.append(f"{label}: {old if old is not None else '—'} → "
                            f"{new if new is not None else '—'}")
        if bits:
            people.append({"at": r.created_at, "who": r.actor_name,
                           "role": r.actor_role, "outcome": r.outcome,
                           "what": "; ".join(bits)})

    # ── plan / fact saves on his work centres, summed per person ────────────
    typed: dict = {}
    for r in (db.query(ActionLog)
              .filter(ActionLog.unit_id == m.id, ActionLog.day == day_d,
                      ActionLog.action == "production.override_set")
              .order_by(ActionLog.created_at).all()):
        if acr._norm(_det(r).get("work_center")) not in codes:
            continue
        for ch in (r.changes or []):
            try:
                field = str(ch[0])
            except Exception:
                continue
            k = ("plan" if field == "plan" else "fact", r.actor_name, r.actor_role,
                 r.outcome)
            g = typed.setdefault(k, {"n": 0, "first": r.created_at,
                                     "last": r.created_at, "before": 0,
                                     "last_before": None})
            g["n"] += 1
            g["last"] = r.created_at
            if r.created_at <= due:
                g["before"] += 1
                g["last_before"] = r.created_at
    saves = [{"field": k[0], "who": k[1], "role": k[2], "outcome": k[3], **v}
             for k, v in sorted(typed.items(), key=lambda kv: (kv[0][0], kv[1]["first"]))]

    uploads = [{"at": r.created_at, "who": r.actor_name, "outcome": r.outcome,
                "mode": _det(r).get("mode"), "type": _det(r).get("type")}
               for r in (db.query(ActionLog)
                         .filter(ActionLog.action == "production.phase_uploaded",
                                 ActionLog.day == day_d)
                         .order_by(ActionLog.created_at).all())]

    pins_now = [{"wc": w.work_center, "grp": w.wc_group, "people": w.people,
                 "changed": w.updated_at}
                for w in (db.query(PPWorkCenterDaily)
                          .filter(PPWorkCenterDaily.manager_id == m.id,
                                  PPWorkCenterDaily.date == day_d).all())
                if acr._norm(w.work_center) in codes]

    # ── what stood at the hour, and from when #1 would have passed ──────────
    ctx = leader_auto._Ctx(db, prof, m, m.shift, date, None, due,
                           datetime.now(timezone.utc))
    rows = ctx.dashboard.get("rows") or []
    u = acr._Unit(db, m, date)
    trusted = u.replay_ok()

    def state(t: datetime) -> dict:
        pins = u.pins_at(t) if trusted else None
        out = {}
        for c in cells:
            typed_ = None if pins is None else u.cell_value(pins, c)
            plan, why = acr._plan_at_hour(u, rows, c, t)
            out[leader_auto.cell_label(c)] = {"people": typed_, "plan": plan, "why": why}
        return out

    def complete(st: dict) -> bool:
        return any(v["people"] is not None and v["plan"] is True for v in st.values())

    at_hour = state(due)
    times = sorted({e["at"] for e in u.events()["pins"]}
                   | {e["at"] for e in u.events()["plans"]}
                   | {x["at"] for x in u.reaching_faza()})
    complete_from = next((t for t in times if complete(state(t))), None)

    return {
        "leader": prof.name, "unit": getattr(m, "name", m.id), "date": date,
        "cells": [f"{c.verifix_code} ({c.sap_code or '—'}"
                  f"{' · ' + c.wc_group if c.wc_group else ''})" for c in cells],
        "due": due, "checks": checks, "entries": entries, "people": people,
        "saves": saves, "uploads": uploads, "pins_now": pins_now,
        "trusted": trusted, "at_hour": at_hour, "complete_at_hour": complete(at_hour),
        "complete_from": complete_from,
    }


def text(rep: dict) -> str:
    due = rep["due"]
    L = [f"{rep['leader']} — {rep['date']}",
         f"Unit: {rep['unit']} · cells: {', '.join(rep['cells']) or '—'}", ""]

    L.append(f"AT {_hms(due)[:5]} (task #1: plan + people on one cell)")
    for label, v in rep["at_hour"].items():
        ppl = ("? (the Jurnal replay does not match the stored pins)"
               if not rep["trusted"] else
               "—" if v["people"] is None else f"{v['people']:g}")
        plan = {True: "yes", False: "no", None: "cannot be placed"}[v["plan"]]
        L.append(f"• {label}: people {ppl} · plan {plan} ({v['why']})")
    cf = rep["complete_from"]
    L.append("→ Filled by the hour: " + ("YES" if rep["complete_at_hour"] else "NO"))
    L.append("→ Complete from: " + (_hms(cf) if cf else "never, per the Jurnal"))
    L.append("")

    L.append("People («Bugungi fakt») saves:")
    for p in rep["people"] or []:
        flag = "" if p["outcome"] == "done" else f" [{p['outcome']}]"
        L.append(f"{_hms(p['at'])}  {p['who']} ({p['role']}): {p['what']}{flag}")
    if not rep["people"]:
        L.append("none on his work centres")
    for p in rep["pins_now"]:
        L.append(f"  now: {p['wc']}{' · ' + p['grp'] if p['grp'] else ''} = "
                 f"{p['people'] if p['people'] is not None else '—'} "
                 f"(last changed {_hms(p['changed'])})")
    L.append("")

    L.append("Plan / fact typed on his work centres:")
    for s in rep["saves"]:
        flag = "" if s["outcome"] == "done" else f" [{s['outcome']}]"
        L.append(f"{s['field'].upper()}: {s['who']} ({s['role']}) — {s['n']} saves, "
                 f"{_hms(s['first'])}–{_hms(s['last'])}; before {_hms(due)[:5]}: "
                 f"{s['before']} (last {_hms(s['last_before'])}){flag}")
    if not rep["saves"]:
        L.append("none")
    ups = ", ".join(f"{_dhm(x['at'])} ({x['mode']}, {x['who']})" for x in rep["uploads"])
    L.append(f"SAP file for {rep['date'][8:10]}.{rep['date'][5:7]}: {ups or 'not uploaded'}")
    L.append("")

    L.append("His bot checklist:")
    if rep["entries"]:
        first = rep["entries"][0]
        L.append(f"first answer saved {_hms(first['saved'])} (task #{first['task']}) — "
                 f"the checklist did not exist before this")
        for e in rep["entries"][:14]:
            L.append(f"  #{e['task']} {'✓' if e['done'] else '✗'} saved {_hms(e['saved'])}"
                     f", closed {_hms(e['closed'])}"
                     + (f" — {e['reason']}" if e["reason"] and not e["done"] else ""))
    else:
        L.append("no checklist for this day")
    L.append("")

    L.append("The automatic checks' own record:")
    for c in rep["checks"]:
        L.append(f"#{c['task']} {c['check']}: due {c['due'][:5]}, warned {c['warned']}, "
                 f"checked {c['checked']} → {c['outcome']} / {c['code']}")
    return "\n".join(L)


def _post(method: str, data: dict) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, timeout=60)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    body = text(collect(db))
    db.rollback()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks)
