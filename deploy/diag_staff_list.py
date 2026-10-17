"""⚠ TEMPORARY (2026-10-17): the #11 «Ish grafigi» check REPORT, printed into
the deploy job's log — the one window onto production a cloud session can read.

For the operator's two complaints of 17 Oct: leaders who filled their list and
lost #11's point, and cells set to «bugungi» whose report names another day.
Prints, for Talipova Mamura's unit and for every unit whose cell type was
changed by hand in the last 5 days: the hand changes (action register), each
cell's type, every #11 ledger row from 12 Oct (what was read, which list, the
counts), each checklist day's close moments, the digest and day-report sends,
the unit's #11 hour, and what the check would read NOW. Plus a plant-wide
tally of failed #11 lists whose OTHER list was full.

Run by `.gitea/workflows/deploy.yaml` from `backend/` as
`python ../deploy/diag_staff_list.py`. READ-ONLY: writes nothing, rolls the
session back. No worker names; leaders as «profile id + short name», cells by
code. Lives under deploy/ so adding it restarts nothing. Delete it with its
workflow step.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from collections import Counter
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ActionLog, Cell, KelishCellKind, LeaderAutoCheck, LeaderDayReport,
    LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry, LeaderUnitReport,
    LeaderUnitSetting, Manager, RoleProfile,
)
from app.services import leader_auto, leader_tasks  # noqa: E402
from app.version import APP_VERSION  # noqa: E402

TZ = leader_auto.TASHKENT
FROM = "2026-10-12"


def p(tag, obj):
    print("STL", tag, json.dumps(obj, ensure_ascii=False, default=str), flush=True)


def loc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ).strftime("%m-%d %H:%M:%S")


def short(name):
    w = (name or "").split()
    return f"{w[0][:1]}. {w[1]}" if len(w) >= 2 else (name or "")


def items(facts):
    out = []
    for it in (facts or {}).get("lists") or []:
        if isinstance(it, dict):
            out.append({k: it.get(k) for k in (
                "cell", "kind", "today", "tomorrow", "ok", "filled_at",
                "filled_kind", "would_be", "decided", "filled_late_min")
                if it.get(k) is not None})
    return out


def main():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        p("now", {"utc": now.isoformat(), "tash": loc(now), "version": APP_VERSION,
                  "eff_s1": leader_tasks.effective_date(1),
                  "eff_s2": leader_tasks.effective_date(2)})
        td11 = (db.query(LeaderTaskDef)
                .filter(LeaderTaskDef.auto_check == "staff_list").all())
        p("defs", [{"id": t.id, "auto": t.auto_check} for t in td11])
        tid = td11[0].id if td11 else 11

        # Kind tally plant-wide
        kinds = db.query(KelishCellKind).all()
        p("kinds_tally", Counter(f"{k.kind}/{k.src}" for k in kinds))

        # Hand changes in the last 5 days
        since = now - timedelta(days=5)
        logs = (db.query(ActionLog)
                .filter(ActionLog.action == "kelish.kind_set",
                        ActionLog.created_at >= since)
                .order_by(ActionLog.created_at).all())
        hand_units, hand_cells = set(), set()
        for r in logs:
            p("kind_set", {"at": loc(r.created_at), "cell": r.target_name,
                           "cell_id": r.target_id, "unit": r.unit_id,
                           "changes": r.changes, "role": r.actor_role,
                           "outcome": r.outcome})
            if r.unit_id:
                hand_units.add(int(r.unit_id))
            if r.target_id:
                try:
                    hand_cells.add(int(r.target_id))
                except ValueError:
                    pass

        tal = [m for m in db.query(Manager).all()
               if "talipova" in (m.name or "").lower()]
        units = {m.id for m in tal} | hand_units
        mgrs = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(sorted(units) or [0])).all()}
        defs = {t.id: t for t in td11}
        for m in mgrs.values():
            st = db.query(LeaderUnitSetting).filter_by(manager_id=m.id).first()
            dues = {}
            for d in (leader_tasks.effective_date(m.shift),):
                try:
                    got = leader_auto._unit_due(db, m, defs, d)
                    dues[d] = {k: [loc(v[0]), v[1]] for k, v in got.items()}
                except Exception as e:  # noqa: BLE001
                    dues[d] = repr(e)
            p("unit", {"id": m.id, "name": m.name, "shift": m.shift,
                       "per_task": bool(st and st.per_task_close),
                       "cell_from": st.cell_from if st else None, "due": dues})

        cells = db.query(Cell).filter(
            (Cell.manager_id.in_(sorted(units) or [0])) | (Cell.id.in_(sorted(hand_cells) or [0]))).all()
        kmap = {k.cell_id: k for k in kinds}
        for c in sorted(cells, key=lambda c: c.verifix_code or ""):
            k = kmap.get(c.id)
            p("cell", {"id": c.id, "code": c.verifix_code, "unit": c.manager_id,
                       "leader": c.leader_id, "owner": getattr(c, "owner_id", None),
                       "archived": bool(c.archived_at),
                       "kind": k.kind if k else None, "src": k.src if k else None,
                       "decided_on": k.decided_on if k else None,
                       "set_at": loc(k.set_at) if k else None})

        leaders = db.query(RoleProfile).filter(
            RoleProfile.role == "leader",
            (RoleProfile.manager_id.in_(sorted(units) or [0]))
            | (RoleProfile.id.in_(sorted({c.leader_id for c in cells if c.leader_id}) or [0]))).all()
        for prof in leaders:
            p("leader", {"id": prof.id, "name": short(prof.name), "unit": prof.manager_id,
                         "ck_shift": getattr(prof, "checklist_shift", None)})
        lids = [x.id for x in leaders]

        rows = (db.query(LeaderAutoCheck)
                .filter(LeaderAutoCheck.leader_id.in_(lids or [0]),
                        LeaderAutoCheck.check == "staff_list",
                        LeaderAutoCheck.date >= FROM)
                .order_by(LeaderAutoCheck.date, LeaderAutoCheck.leader_id).all())
        for r in rows:
            e = db.query(LeaderTaskEntry).filter_by(id=r.entry_id).first() if r.entry_id else None
            f = r.facts or {}
            p("ledger", {"lid": r.leader_id, "date": r.date, "cell": r.cell_id,
                         "due": loc(r.due_at), "warned": loc(r.warned_at),
                         "checked": loc(r.checked_at), "out": r.outcome, "code": r.code,
                         "entry": e and {"done": e.done, "reason": e.reason,
                                         "saved": loc(e.saved_at), "closed": loc(e.closed_at)},
                         "days": f.get("days"), "chk": f.get("checked"),
                         "lists": items(f), "empty": f.get("empty"),
                         "no_plan": f.get("no_plan"),
                         "at_hour": bool(f.get("at_hour")),
                         "seen": f.get("checklist_seen")})

        days = (db.query(LeaderTaskDay)
                .filter(LeaderTaskDay.leader_id.in_(lids or [0]),
                        LeaderTaskDay.date >= FROM)
                .order_by(LeaderTaskDay.date, LeaderTaskDay.leader_id).all())
        for d in days:
            ents = db.query(LeaderTaskEntry).filter_by(day_id=d.id).all()
            e11 = next((x for x in ents if x.task_id == tid), None)
            last = max((x.closed_at for x in ents if x.task_id != tid and x.closed_at),
                       default=None)
            p("day", {"id": d.id, "lid": d.leader_id, "date": d.date, "cell": d.cell_id,
                      "closed": loc(d.closed_at), "finished": loc(d.finished_at),
                      "completion": float(d.completion) if d.completion is not None else None,
                      "entries": len(ents),
                      "closed_entries": sum(1 for x in ents if x.closed_at),
                      "last_other_close": loc(last),
                      "e11": e11 and {"done": e11.done, "reason": e11.reason,
                                      "saved": loc(e11.saved_at),
                                      "closed": loc(e11.closed_at)}})

        for u in (db.query(LeaderUnitReport)
                  .filter(LeaderUnitReport.manager_id.in_(sorted(units) or [0]),
                          LeaderUnitReport.date >= FROM)
                  .order_by(LeaderUnitReport.date).all()):
            p("digest", {"unit": u.manager_id, "date": u.date, "sends": u.sends,
                         "first": loc(u.first_sent_at), "last": loc(u.last_sent_at),
                         "dirty": loc(u.dirty_at), "parked": u.parked})
        for r in (db.query(LeaderDayReport)
                  .filter(LeaderDayReport.leader_id.in_(lids or [0]),
                          LeaderDayReport.date >= FROM)
                  .order_by(LeaderDayReport.date).all()):
            p("dayrep", {"lid": r.leader_id, "date": r.date, "uid": r.uid,
                         "score": r.score_sent, "sends": r.sends,
                         "first": loc(r.first_sent_at), "last": loc(r.last_sent_at)})

        # What the check would read NOW for each leader (read only: before
        # the hour `decide` is False, so no type is fixed).
        from app.services import leader_auto_rich
        for prof in leaders:
            m = mgrs.get(prof.manager_id) or db.query(Manager).filter_by(id=prof.manager_id).first()
            if m is None:
                continue
            d = leader_tasks.effective_date(m.shift)
            try:
                got = leader_auto._unit_due(db, m, defs, d)
                due = got.get(tid, (now + timedelta(hours=1), ""))[0]
                use_now = min(now.astimezone(TZ), due - timedelta(minutes=1))
                snap = leader_auto_rich.snapshot(db, prof, m, "staff_list", None,
                                                 due, use_now, date=d)
                p("now_read", {"lid": prof.id, "date": d, "due": loc(due),
                               "code": snap.get("code"), "err": snap.get("error"),
                               "days": (snap.get("facts") or {}).get("days"),
                               "lists": items(snap.get("facts")),
                               "empty": (snap.get("facts") or {}).get("empty"),
                               "no_plan": (snap.get("facts") or {}).get("no_plan")})
            except Exception as e:  # noqa: BLE001
                p("now_read_err", {"lid": prof.id, "err": repr(e)[:300]})
            db.rollback()

        # Plant-wide: failed #11 lists whose OTHER list was full at the check.
        tally, examples = Counter(), []
        for r in (db.query(LeaderAutoCheck)
                  .filter(LeaderAutoCheck.check == "staff_list",
                          LeaderAutoCheck.date >= FROM,
                          LeaderAutoCheck.outcome == "failed").all()):
            for it in (r.facts or {}).get("lists") or []:
                if not isinstance(it, dict) or it.get("ok"):
                    continue
                k = it.get("kind")
                t, w = it.get("today") or [0, 0], it.get("tomorrow") or [0, 0]
                other = w if k == "today" else t if k == "tomorrow" else None
                full_other = bool(other and other[1] and other[0] == other[1])
                tally[(r.date, k or "-", "other_full" if full_other else "not")] += 1
                if full_other and len(examples) < 40:
                    examples.append({"date": r.date, "lid": r.leader_id,
                                     "cell": it.get("cell"), "kind": k,
                                     "today": t, "tomorrow": w})
        p("failed_tally", {f"{a}|{b}|{c}": n for (a, b, c), n in sorted(tally.items())})
        p("failed_other_full", examples)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
