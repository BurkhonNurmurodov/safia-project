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
    from app.models import LiveProjection
    from app.services import kelish
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        p("now", {"tash": loc(now), "version": APP_VERSION})
        # Every failed #11 since 10 Oct, plant-wide: which list was judged, the
        # counts, and whether that list GREW after the leader marked it — the
        # unit-day's live copy (the brigadir's close) re-feeds tomorrow's list.
        rows = (db.query(LeaderAutoCheck)
                .filter(LeaderAutoCheck.check == "staff_list",
                        LeaderAutoCheck.date >= "2026-10-10",
                        LeaderAutoCheck.outcome == "failed")
                .order_by(LeaderAutoCheck.date).all())
        cells = {c.verifix_code: c for c in db.query(Cell).all() if c.verifix_code}
        mshift = {m.id: m.shift for m in db.query(Manager).all()}
        kinds_now = {k.cell_id: k for k in db.query(KelishCellKind).all()}
        tally = Counter()
        for r in rows:
            f = r.facts or {}
            ds = [date.fromisoformat(x) for x in (f.get("days") or [])[:2]]
            for it in f.get("lists") or []:
                if not isinstance(it, dict) or it.get("ok"):
                    continue
                k = it.get("kind")
                c = cells.get(it.get("cell"))
                out = {"date": r.date, "lid": r.leader_id, "unit": r.manager_id,
                       "sh": mshift.get(r.manager_id), "cell": it.get("cell"),
                       "kind": k, "kind_now": (kinds_now.get(c.id).kind + "/" + kinds_now.get(c.id).src)
                       if c is not None and kinds_now.get(c.id) else None,
                       "today": it.get("today"), "tomorrow": it.get("tomorrow"),
                       "filled_at": it.get("filled_at"), "late": it.get("filled_late_min")}
                if c is not None and len(ds) == 2 and k in kelish.KINDS:
                    day = ds[kelish.KINDS.index(k)]
                    cut = r.due_at
                    proj = (db.query(LiveProjection.copied_at)
                            .filter(LiveProjection.manager_id == c.manager_id,
                                    LiveProjection.day == ds[0]).first())
                    out["copy"] = loc(proj[0]) if proj else None
                    ev = [e for e in kelish.load_events(db, [c.id]).get(c.id, [])
                          if e.created_at is not None and e.created_at <= cut]
                    mk = {kk: m for kk, m in kelish.load_marks_days(db, [c.id], [day])
                          .get(c.id, {}).get(day, {}).items()
                          if m.set_at is not None and m.set_at <= cut}
                    fw, last = kelish.file_workers_days(db, [day], as_of=cut)[day]
                    lst = kelish.roster(c.verifix_code, day, fw, last, ev, mk)
                    un = [x for x in lst if x["mark"] not in kelish.STATUSES]
                    out["unmarked"] = [[x["source"], x["came"]] for x in un][:15]
                    if proj and proj[0] is not None:
                        before = proj[0] - timedelta(seconds=1)
                        fw0, last0 = kelish.file_workers_days(db, [day], as_of=before)[day]
                        lst0 = kelish.roster(c.verifix_code, day, fw0, last0, ev, mk)
                        keys0 = {x["key"] for x in lst0}
                        out["before_copy"] = [len(lst0), sum(1 for x in lst0 if x["mark"] in kelish.STATUSES)]
                        out["new_by_copy_unmarked"] = sum(1 for x in un if x["key"] not in keys0)
                    # the leader's other tasks: when the last one closed
                    day_row = (db.query(LeaderTaskDay)
                               .filter(LeaderTaskDay.leader_id == r.leader_id,
                                       LeaderTaskDay.date == r.date).first())
                    if day_row is not None:
                        ents = db.query(LeaderTaskEntry).filter_by(day_id=day_row.id).all()
                        out["others_done"] = loc(max((e.closed_at for e in ents
                                                      if e.task_id != r.task_id and e.closed_at),
                                                     default=None))
                    tally[("grew" if out.get("new_by_copy_unmarked") else
                           "other_full" if (k == "tomorrow" and (it.get("today") or [0, 0])[0] == (it.get("today") or [0, 1])[1] and (it.get("today") or [0, 0])[1])
                           else "plain")] += 1
                p("fail", out)
                db.rollback()
        p("tally", dict(tally))
    except Exception:  # noqa: BLE001
        traceback.print_exc()
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
