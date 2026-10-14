"""⚠ TEMPORARY (2026-10-14): where did cell 0811 go?

Turdimurodov Nodirjon is Aripova Manzura's leader, while his cell 0811 is kept
in the unit «Turdimurodov Nodirjon» so its загрузка is read on its own (the
26 Sep ruling, `cell_lookup.cells_unit_for_leader`). Since the Verifix live
sync his cell's people show on Aripova's /staff list and his /production page
reads Aripova's unit and finds nothing — i.e. 0811 now stands in Aripova's
unit. This prints, into the deploy job's log (the one window onto production a
cloud session can read): both units, his profile(s), the cell as stored, every
dated link event on it, every Verifix-sync item and Jurnal row that names it,
which unit each reader takes the cell to be in, day by day, and where its
catalog, typed people and attendance landed.

READ-ONLY: writes nothing, rolls the session back. Prints leader / brigadir
names only (platform users) and counts of attendance rows, never a worker's
name. Lives under deploy/ so adding it does not restart the backend. Delete it
with its workflow step.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from sqlalchemy import func, or_  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ActionLog, Attendance, Cell, CellLinkEvent, LiveDayClose, LiveProjection, Manager,
    PPDaily, PPProduct, PPWorkCenterDaily, RoleProfile, VerifixSyncItem, VerifixTie,
)

CODE = "0811"
TZ = ZoneInfo("Asia/Tashkent")
SINCE = date(2026, 10, 6)


def P(*a):
    print("DIAG0811", *a, flush=True)


def t(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(TZ).strftime("%d.%m %H:%M:%S")
    return str(v)


def j(v, n=600) -> str:
    s = json.dumps(v, ensure_ascii=False, default=str)
    return s if len(s) <= n else s[:n] + "…"


def main() -> None:
    db = SessionLocal()
    try:
        from app.services import cell_links, cell_lookup, verifix_live, verifix_sync

        P("now", datetime.now(TZ).strftime("%d.%m.%Y %H:%M"))
        try:
            P("sync mode", verifix_sync.mode(db))
        except Exception as e:  # noqa: BLE001
            P("sync mode ?", e)

        units = db.query(Manager).filter(or_(Manager.name.ilike("%turdimurodov%"),
                                             Manager.name.ilike("%aripova%"))).all()
        for m in units:
            P("unit", m.id, m.name, "shift", m.shift, "factory", m.factory_id,
              "zagruzka_on", m.zagruzka_on, "archived", m.archived,
              "vfx", m.vfx_employee_id, "kind", m.supervisor_kind,
              "kind_src", (m.supervisor_kind_meta or {}).get("src"),
              "vfx_meta", j(m.vfx_meta, 300))
        uids = {m.id for m in units}
        profs = db.query(RoleProfile).filter(RoleProfile.name.ilike("%turdimurodov%")).all()
        for p in profs:
            P("profile", p.id, p.role, p.name, "unit", p.manager_id, "vfx", p.vfx_employee_id,
              "kind", p.leader_kind, "owes_from", p.owes_from,
              "vfx_meta", j(p.vfx_meta, 300))
        pids = {p.id for p in profs}

        cells = db.query(Cell).filter(or_(Cell.verifix_code == CODE,
                                          Cell.leader_id.in_(pids or {-1}),
                                          Cell.owner_id.in_(pids or {-1}),
                                          Cell.manager_id.in_(uids or {-1}))).all()
        mine = [c for c in cells if c.verifix_code == CODE or c.leader_id in pids
                or c.owner_id in pids]
        P("cells of the two units:", len(cells),
          "by unit", j(dict(sorted(((m, sum(1 for c in cells if c.manager_id == m))
                                     for m in uids)))))
        for c in mine:
            P("cell", c.id, c.verifix_code, "sap", c.sap_code, "grp", c.wc_group,
              "unit", c.manager_id, "leader", c.leader_id, "owner", c.owner_id,
              "in_load", c.in_load, "archived", t(c.archived_at), "div", c.vfx_division_id)
            P("  vfx_meta", j(c.vfx_meta, 500))
            P("  owner_meta", j(c.owner_meta, 300))
            for e in (db.query(CellLinkEvent).filter(CellLinkEvent.cell_id == c.id)
                      .order_by(CellLinkEvent.id).all()):
                P("  event", e.id, e.field, e.prev, "→", e.value, "from", e.effective_from,
                  "at", t(e.effective_at), "applied", t(e.applied_at), "src", e.src,
                  "by", e.by_name, "created", t(e.created_at), "vfx", j(e.vfx, 200))
            for d in range(-8, 4):
                day = date.today() + timedelta(days=d)
                P("  on", day, "unit", cell_links.value_on(c, "manager_id", day),
                  "leader", cell_links.value_on(c, "leader_id", day))
            try:
                P("  pending", j(cell_links.pending(db, [c.id]).get(c.id)))
                P("  manager_mode", cell_links.manager_mode(db, [c.id]).get(c.id))
            except Exception as e:  # noqa: BLE001
                P("  pending ?", e)
        for p in profs:
            if p.role == "leader":
                P("cells_unit_for_leader", p.id, cell_lookup.cells_unit_for_leader(db, p.id),
                  "sap codes", sorted(cell_lookup.sap_codes_for_leader(db, p.id)))
        try:
            for d in (0, -1, -2):
                day = date.today() + timedelta(days=d)
                reg, _ = verifix_live._registry(db, day)
                hit = {k: v for k, v in reg.items() if v.get("code") == CODE}
                P("live registry", day, j(hit))
        except Exception as e:  # noqa: BLE001
            P("live registry ?", e)

        ids = {str(c.id) for c in mine}
        for it in db.query(VerifixSyncItem).order_by(VerifixSyncItem.id).all():
            pl = it.payload or {}
            names = {str(pl.get(k)) for k in ("cell", "profile", "unit", "from_unit", "to_unit")}
            if (ids & names or {str(x) for x in pids} & names or {str(x) for x in uids} & names
                    or CODE in j(pl, 4000)):
                P("item", it.id, it.kind, it.key, it.status, "seen", t(it.first_seen), "→",
                  t(it.last_seen), "decided", t(it.decided_at), it.decided_by, it.note,
                  j(pl, 500))
        for tie in db.query(VerifixTie).all():
            if ((tie.kind in ("unit", "supervisor") and tie.our_id in uids)
                    or (tie.kind in ("leader", "profile") and tie.our_id in pids)
                    or (tie.kind == "cell" and str(tie.our_id) in ids)):
                P("hand tie", tie.kind, tie.our_id, tie.vfx_id, tie.how, tie.by_name, t(tie.created_at))

        logs = (db.query(ActionLog)
                .filter(ActionLog.created_at >= datetime(2026, 10, 11, tzinfo=TZ))
                .filter(or_(ActionLog.target_id.in_(ids | {str(x) for x in pids}),
                            ActionLog.path.ilike("%verifix-sync%"),
                            ActionLog.action.ilike("%cell%"),
                            ActionLog.unit_id.in_(uids)))
                .order_by(ActionLog.id).all())
        for a in logs:
            blob = j([a.target_name, a.details, a.changes], 3000)
            if (a.target_id in ids or a.target_id in {str(x) for x in pids} or CODE in blob
                    or "Turdimurodov" in blob or "verifix-sync" in (a.path or "")):
                P("log", a.id, t(a.created_at), a.action, a.outcome, a.source, a.actor_name,
                  a.method, a.path, a.target_kind, a.target_id, a.target_name, a.unit_name,
                  j(a.changes, 300), j(a.details, 300))

        for m in sorted(uids):
            P("unit", m, "catalog lines", db.query(func.count(PPProduct.id))
              .filter(PPProduct.manager_id == m).scalar(),
              "A0081 lines", db.query(func.count(PPProduct.id))
              .filter(PPProduct.manager_id == m, PPProduct.work_center.ilike("%0081%")).scalar())
            for r in (db.query(PPWorkCenterDaily).filter(
                    PPWorkCenterDaily.manager_id == m, PPWorkCenterDaily.date >= SINCE)
                    .order_by(PPWorkCenterDaily.date).all()):
                if "0081" in (r.work_center or ""):
                    P("  typed", r.date, r.work_center, r.wc_group, "people", r.people,
                      "shtatka", r.shtatka)
            for d, n in (db.query(PPDaily.date, func.count(PPDaily.id))
                         .filter(PPDaily.manager_id == m, PPDaily.date >= SINCE,
                                 PPDaily.work_center.ilike("%0081%"))
                         .group_by(PPDaily.date).order_by(PPDaily.date).all()):
                P("  pp_daily A0081", d, n)
            for c in (db.query(LiveDayClose).filter(LiveDayClose.manager_id == m,
                                                    LiveDayClose.day >= SINCE)
                      .order_by(LiveDayClose.day).all()):
                P("  live close", c.day, c.closed_by_name, t(c.closed_at))
            for pr in (db.query(LiveProjection).filter(LiveProjection.manager_id == m,
                                                       LiveProjection.day >= SINCE)
                       .order_by(LiveProjection.day).all()):
                n0811 = sum(1 for r in (pr.roster or []) if len(r) > 1 and r[1] == CODE)
                P("  copy", pr.day, "rows", pr.rows, "roster 0811", n0811, t(pr.copied_at))
        for mid, d, n, h in (db.query(Attendance.manager_id, Attendance.date,
                                      func.count(Attendance.id),
                                      func.coalesce(func.sum(Attendance.hours_worked), 0))
                             .filter(Attendance.verifix_code == CODE, Attendance.date >= SINCE)
                             .group_by(Attendance.manager_id, Attendance.date)
                             .order_by(Attendance.date).all()):
            P("attendance 0811", d, "unit", mid, "rows", n, "hours", float(h))
    except Exception:  # noqa: BLE001
        P("FAILED", traceback.format_exc())
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
