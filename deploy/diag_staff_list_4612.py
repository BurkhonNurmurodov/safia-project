"""⚠ TEMPORARY (2026-10-13): task #11 («Ish grafigi») on cell 4612, 10—11 Oct,
printed into the deploy job's log — the one window onto production a cloud
session can read.

A leader of 4612 disputes the #11 verdict of 10.10 (checked 20:00, list of
11.10 read 11/13): she says every worker was marked before 20:00. The «at the
check» modal rebuilds the past from each mark's LAST `set_at`, so a mark set
before the hour and tapped again after it reads as «—» there. This prints what
actually happened: every «Ish grafigi» tap on the cell (the action register,
refusals included), the marks as stored, the roster events, WHEN each worker
joined the 11.10 list (file uploads / live close copies), the verdict row and
the modal's own rebuild.

READ-ONLY: writes nothing, rolls the session back. NO WORKER NAMES: each
worker is «#n AB» — n = their row in the modal (sorted by name), AB = the
initials of surname and first name. Lives under deploy/ so adding it does not
restart the backend. Delete it with its workflow step.
"""
from __future__ import annotations

import os
import re
import sys
import traceback
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from sqlalchemy import or_, text  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ActionLog, Cell, KelishCellKind, KelishMark, KelishRosterEvent, LeaderAutoCheck,
    LeaderTaskDay, LeaderTaskEntry, LiveDayClose, LiveProjection, Manager, RoleProfile,
)
from app.services import kelish, leader_auto  # noqa: E402

CODE = "4612"
D0, D1 = date(2026, 10, 10), date(2026, 10, 11)
TZ = leader_auto.TASHKENT
W_FROM = datetime(2026, 10, 9, 18, 0, tzinfo=timezone.utc)    # 9.10 23:00 Tashkent
W_TO = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)     # 11.10 17:00 Tashkent

_alias: dict[str, str] = {}


def P(*a):
    print("DIAG4612", *a, flush=True)


def t(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, str):
        try:
            v = datetime.fromisoformat(v)
        except ValueError:
            return v
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ).strftime("%d.%m %H:%M:%S")


def who(name) -> str:
    if not name:
        return "?"
    k = kelish.worker_key(str(name))
    if k in _alias:
        return _alias[k]
    toks = [x for x in re.split(r"\s+", str(name).strip()) if x]
    ini = "".join(x[0].upper() for x in toks[:2])
    _alias[k] = f"#? {ini}"
    return _alias[k]


def main() -> None:
    db = SessionLocal()
    try:
        cells = db.query(Cell).filter(Cell.verifix_code == CODE).all()
        for c in cells:
            mgr = db.get(Manager, c.manager_id) if c.manager_id else None
            ld = db.get(RoleProfile, c.leader_id) if c.leader_id else None
            P("cell", c.id, "unit", c.manager_id, mgr.name if mgr else None,
              "shift", getattr(mgr, "shift", None), "leader", c.leader_id,
              ld.name if ld else None, "archived", c.archived_at)
        c = next((x for x in cells if x.archived_at is None), cells[0] if cells else None)
        if c is None:
            P("no cell"); return
        kr = db.query(KelishCellKind).filter_by(cell_id=c.id).first()
        P("kind", kr and kr.kind, kr and kr.src, kr and kr.decided_on, kr and kr.by_name,
          kr and t(kr.set_at))

        # The 11.10 list now: the modal's order fixes each worker's number.
        fw, last = kelish.file_workers(db, D1)
        ev = kelish.load_events(db, [c.id]).get(c.id, [])
        mk = kelish.load_marks(db, [c.id], D1).get(c.id, {})
        now_rows = kelish.roster(c.verifix_code, D1, fw, last, ev, mk)
        for i, r in enumerate(now_rows, 1):
            toks = r["name"].split()
            ini = "".join(x[0].upper() for x in toks[:2])
            for k in [r["key"], *r["aliases"]]:
                _alias[k] = f"#{i} {ini}"
        P("list 11.10 now:", len(now_rows), "rows; last file day", last)
        for r in now_rows:
            w = fw.get(r["key"])
            P("  ", who(r["name"]), "src", r["source"], "mark", r["mark"], "at", t(r["at"]),
              "by", r["by"], "| placed by row of", w and w["seen"], "code", w and w["code"],
              "came", w and w["came"])

        # Marks as stored, both days.
        for d in (D0, D1):
            ms = db.query(KelishMark).filter_by(cell_id=c.id, day=d).all()
            P("marks", d, len(ms))
            for m in sorted(ms, key=lambda m: m.set_at or datetime.min.replace(tzinfo=timezone.utc)):
                P("  ", who(m.worker_name), m.status, t(m.set_at), m.set_by_name)

        # Roster events.
        P("roster events", len(ev))
        for e in ev:
            P("  ", e.action, who(e.worker_name), "from", e.effective_from, "made", t(e.created_at),
              "by", e.by_name)

        # Every «Ish grafigi» request in the window: the cell's own rows, and
        # every kelish request of the cell's leader / brigadir (a refusal is
        # not enriched, so it carries no cell — it is found by its actor).
        keys = []
        if c.leader_id:
            keys.append(f"leader:{c.leader_id}")
        if c.manager_id:
            keys.append(f"supervisor:{c.manager_id}")
        logs = (db.query(ActionLog)
                .filter(ActionLog.created_at >= W_FROM, ActionLog.created_at <= W_TO,
                        ActionLog.action.like("kelish.%"),
                        or_(ActionLog.target_name == CODE,
                            ActionLog.actor_profile_key.in_(keys)))
                .order_by(ActionLog.created_at, ActionLog.id).all())
        P("action log", len(logs), "actor keys", keys)
        for a in logs:
            det = dict((x[0], x[1]) for x in (a.details or []) if isinstance(x, list) and len(x) >= 2)
            ch = a.changes or []
            P("  ", t(a.created_at), a.action, a.outcome, a.status, a.source,
              "actor", a.actor_profile_key, a.actor_role,
              "cell", a.target_name, "day", a.day, "worker", who(det.get("worker")) if det.get("worker") else "-",
              "chg", [[x[1], x[2]] for x in ch if isinstance(x, list) and len(x) >= 3],
              "dur", a.duration_ms)

        # All kelish taps by anyone in the window, counted per actor (a tap on
        # another cell is not shown, only counted).
        rows = db.execute(text(
            "SELECT actor_profile_key, outcome, count(*), min(created_at), max(created_at)"
            "  FROM action_logs WHERE action = 'kelish.mark_set'"
            "   AND created_at BETWEEN :a AND :b AND actor_profile_key = ANY(:k)"
            " GROUP BY 1, 2 ORDER BY 1, 2"), {"a": W_FROM, "b": W_TO, "k": keys}).all()
        for r in rows:
            P("taps by", r[0], r[1], r[2], t(r[3]), "→", t(r[4]))

        # When did each worker join the 11.10 list? The list as the file stood
        # at a run of instants (the check's own `as_of` rule).
        stamps = [datetime(2026, 10, 10, h, m, tzinfo=TZ)
                  for h, m in ((6, 0), (12, 0), (16, 0), (17, 0), (18, 0), (18, 30), (19, 0),
                               (19, 15), (19, 30), (19, 45), (19, 55), (20, 0), (20, 5),
                               (21, 0), (22, 0))]
        for s in stamps:
            fws, lasts = kelish.file_workers_days(db, [D1], as_of=s)[D1]
            lst = kelish.roster(c.verifix_code, D1, fws, lasts, ev, {})
            got = sorted(who(r["name"]) for r in lst)
            P("list as of", t(s), len(lst), got)

        # The days the 11.10 window draws on near its end: uploads and copies.
        up = db.execute(text(
            "SELECT b.date, u.id, u.source, u.uploaded_at, u.filename"
            "  FROM attendance_upload_files u JOIN attendance_batches b ON b.id = u.batch_id"
            " WHERE b.date BETWEEN :lo AND :hi ORDER BY u.uploaded_at"),
            {"lo": D0 - timedelta(days=6), "hi": D0}).all()
        for r in up:
            P("upload", r[0], r[1], r[2], t(r[3]), (r[4] or "")[:30])
        for lp in (db.query(LiveProjection)
                   .filter(LiveProjection.day >= D0 - timedelta(days=4), LiveProjection.day <= D0)
                   .order_by(LiveProjection.day, LiveProjection.manager_id).all()):
            mine = [x for x in (lp.roster or []) if isinstance(x, list) and len(x) > 1
                    and kelish.norm_code(x[1]) == kelish.norm_code(CODE)]
            cl = (db.query(LiveDayClose).filter_by(manager_id=lp.manager_id, day=lp.day)
                  .order_by(LiveDayClose.id).all())
            if mine or lp.manager_id == c.manager_id:
                P("copy", lp.day, "unit", lp.manager_id, "copied", t(lp.copied_at),
                  "closes", [t(x.closed_at) for x in cl], "4612 rows", len(mine),
                  sorted(who(x[0]) for x in mine))
        # Every row of the 13 workers in the last 6 days of the window, any cell.
        names = {r["key"] for r in now_rows}
        raw = db.execute(text(
            "SELECT b.date, r.worker_name, r.verifix_code, r.status, r.upload_id"
            "  FROM attendance_batch_rows r JOIN attendance_batches b ON b.id = r.batch_id"
            " WHERE b.date BETWEEN :lo AND :hi ORDER BY b.date"),
            {"lo": D0 - timedelta(days=6), "hi": D0}).all()
        for d, n, code, st, upl in raw:
            if kelish.worker_key(n or "") in names:
                P("filerow", d, who(n), code, (st or "")[:16], "upload", upl)
        for lp in (db.query(LiveProjection)
                   .filter(LiveProjection.day >= D0 - timedelta(days=6), LiveProjection.day <= D0)
                   .all()):
            for x in lp.roster or []:
                if isinstance(x, list) and x and kelish.worker_key(str(x[0])) in names:
                    P("copyrow", lp.day, who(x[0]), x[1] if len(x) > 1 else None,
                      "came", x[3] if len(x) > 3 else None, "unit", lp.manager_id,
                      "copied", t(lp.copied_at))

        # The verdicts (#11) that name this cell, 8—12 Oct.
        chk = (db.query(LeaderAutoCheck)
               .filter(LeaderAutoCheck.check == "staff_list",
                       LeaderAutoCheck.date >= "2026-10-08", LeaderAutoCheck.date <= "2026-10-12")
               .order_by(LeaderAutoCheck.date, LeaderAutoCheck.id).all())
        for r in chk:
            items = [it for it in ((r.facts or {}).get("lists") or [])
                     if isinstance(it, dict) and (it.get("cell") == CODE or it.get("cell_id") == c.id)]
            if not items and r.leader_id != c.leader_id:
                continue
            day_id = None
            if r.entry_id:
                e = db.get(LeaderTaskEntry, r.entry_id)
                day_id = e.day_id if e else None
            P("verdict", r.id, "leader", r.leader_id, "date", r.date, "cell", r.cell_id,
              "due", t(r.due_at), "warned", t(r.warned_at), "checked", t(r.checked_at),
              r.outcome, r.code, "entry", r.entry_id, "day", day_id,
              "checked_fact", (r.facts or {}).get("checked"))
            for it in items:
                P("   item", it)
            if day_id and r.date == "2026-10-10":
                d = db.get(LeaderTaskDay, day_id)
                P("   day row", day_id, "created", t(getattr(d, "created_at", None)),
                  "closed", t(getattr(d, "closed_at", None)))
                snap = leader_auto.staff_list_snapshot(db, f"bot-{day_id}", r.task_id)
                if snap:
                    P("   snapshot cutoff", snap.get("cutoff"), "checked", snap.get("checked"))
                    for lst in snap.get("lists") or []:
                        P("   list", lst["cell"], lst["kind"], lst["day"], "check", lst["check"],
                          "now", lst["now"])
                        for u in lst["rows"]:
                            P("     ", who(u["name"]), "check", u["check"] and u["check"]["mark"],
                              u["check"] and u["check"]["at"], "| now",
                              u["now"] and u["now"]["mark"], u["now"] and u["now"]["at"],
                              "late" if u["late"] else "")
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:                       # noqa: BLE001
        traceback.print_exc()
    P("done")
