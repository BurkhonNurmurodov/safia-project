"""⚠ TEMPORARY (2026-10-14): why does Malikov Xasan Avaz O'g'li's /production
read «Sizga yacheyka biriktirilmagan» while his profile page lists cell 8911?
Printed into the deploy job's log — the one window onto production a cloud
session can read.

The page narrows a leader to `cell_lookup.sap_codes_for_leader`, i.e. cells
whose CURRENT `cells.leader_id` names him and that carry a SAP code. The
profile page also lists a «Boshqaruvchi» pick still WAITING for its shift
opening (`cell_links.pending`). So either the pick has not landed yet, or the
cell has no SAP code, or the session resolves another profile. This prints:
cell 8911 as stored, every link event on it, the leader profile(s), what the
page's scope helpers answer for each, what an «open as» session resolves to,
today's register rows for the cell / the profile, and every «Boshqaruvchi»
pick on the platform still waiting (how many leaders are in the same state).

READ-ONLY: writes nothing, rolls the session back. Prints leader / brigadir
names only (platform users), never a worker's. Lives under deploy/ so adding
it does not restart the backend. Delete it with its workflow step.
"""
from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from sqlalchemy import or_  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ActionLog, Cell, CellLinkEvent, Manager, RoleProfile, TelegramUserRole,
)

CODE = "8911"
NAME_LIKE = "%malikov%"
TZ = ZoneInfo("Asia/Tashkent")


def P(*a):
    print("DIAG8911", *a, flush=True)


def t(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(TZ).strftime("%d.%m %H:%M:%S")
    return str(v)


def main() -> None:
    db = SessionLocal()
    try:
        from app import identity, web_auth
        from app.services import cell_links, cell_lookup, cell_register

        mgr = {m.id: m for m in db.query(Manager).all()}
        prof = {p.id: p for p in db.query(RoleProfile).all()}

        def pn(pid):
            p = prof.get(pid)
            return f"{pid}:{p.name}" if p else f"{pid}:?"

        def mn(mid):
            m = mgr.get(mid)
            return f"{mid}:{m.name}(s{m.shift})" if m else f"{mid}:?"

        now = datetime.now(TZ)
        P("now", now.strftime("%d.%m.%Y %H:%M"))

        # ── 1. the cell ──────────────────────────────────────────────────────
        cells = db.query(Cell).filter(or_(Cell.verifix_code == CODE,
                                          Cell.verifix_code.like(f"%{CODE}%"))).all()
        P("cells matching", CODE, len(cells))
        for c in cells:
            P(" cell", c.id, repr(c.verifix_code), "sap", repr(c.sap_code), "group", c.wc_group,
              "| unit", mn(c.manager_id), "| leader", pn(c.leader_id) if c.leader_id else "—",
              "| owner", pn(c.owner_id) if c.owner_id else "—",
              "| archived", t(c.archived_at), "| in_load", c.in_load)
            for e in (db.query(CellLinkEvent).filter(CellLinkEvent.cell_id == c.id)
                      .order_by(CellLinkEvent.effective_from, CellLinkEvent.id).all()):
                fmt = mn if e.field == "manager_id" else pn
                P("   event", e.id, e.field, fmt(e.prev) if e.prev else "—", "→",
                  fmt(e.value) if e.value else "—", "| from", e.effective_from,
                  "at", t(e.effective_at), "| applied", t(e.applied_at),
                  "| src", e.src, "| by", e.by_name, "| made", t(e.created_at))
            P("   pending", cell_links.pending(db, [c.id]).get(c.id))
            if c.manager_id:
                d, at = cell_links.opening(db, c.manager_id)
                P("   next opening of its unit", d, t(at))

        # ── 2. the leader profile(s) ─────────────────────────────────────────
        leaders = (db.query(RoleProfile)
                   .filter(RoleProfile.role == "leader", RoleProfile.name.ilike(NAME_LIKE)).all())
        P("leader profiles like", NAME_LIKE, len(leaders))
        for p in leaders:
            P(" profile", p.id, repr(p.name), "| unit", mn(p.manager_id),
              "| owes_from", getattr(p, "owes_from", None),
              "| kind", getattr(p, "leader_kind", None))
            col = db.query(Cell).filter(Cell.leader_id == p.id).all()
            P("   cells.leader_id == him:", [(c.verifix_code, c.sap_code) for c in col])
            held = cell_register.held_cells(db, p.id, "leader_id")
            P("   held (now + waiting):", [c.verifix_code for c in held])
            P("   sap_codes_for_leader:", sorted(cell_lookup.sap_codes_for_leader(db, p.id)))
            P("   sap_groups_for_leader:", sorted(cell_lookup.sap_groups_for_leader(db, p.id),
                                                  key=str))
            P("   cells_unit_for_leader:", cell_lookup.cells_unit_for_leader(db, p.id))
            owned = db.query(Cell).filter(Cell.owner_id == p.id).all()
            P("   owner of:", [c.verifix_code for c in owned])
            key = f"leader:{p.id}"
            regs = (db.query(TelegramUserRole)
                    .filter(TelegramUserRole.role == "leader",
                            or_(TelegramUserRole.profile_key == key,
                                TelegramUserRole.full_name.ilike(NAME_LIKE))).all())
            for r in regs:
                P("   registration", r.id, "tg…" + str(r.telegram_id)[-4:], "role_id", r.role_id,
                  r.status, "key", r.profile_key, repr(r.full_name))
            try:
                ident = web_auth.session_identity(db, key)
            except Exception as exc:  # noqa: BLE001
                ident = f"error {exc!r}"
            P("   «open as» identity:", None if not isinstance(ident, dict) else
              {k: v for k, v in ident.items() if k != "telegram_id"} if ident else ident)
            if isinstance(ident, dict):
                payload = {"sub": str(ident["telegram_id"]), "role": ident["role"],
                           "role_id": ident["role_id"], "role_ref": ident["role_ref"],
                           "full_name": ident["full_name"]}
                vid = identity.viewer_leader_profile_id(db, payload)
                P("   session resolves to profile", pn(vid) if vid else vid,
                  "| its sap codes", sorted(cell_lookup.sap_codes_for_leader(db, vid)) if vid else "—")

        # ── 3. today's register rows about the cell or the profile ──────────
        since = now - timedelta(days=3)
        ids = [str(p.id) for p in leaders] + [str(c.id) for c in cells] + [CODE]
        rows = (db.query(ActionLog).filter(ActionLog.created_at >= since)
                .filter(or_(ActionLog.target_id.in_(ids),
                            ActionLog.target_name.ilike(NAME_LIKE),
                            ActionLog.target_name.ilike(f"%{CODE}%")))
                .order_by(ActionLog.id).limit(60).all())
        P("register rows since", t(since), len(rows))
        for r in rows:
            P(" log", r.id, t(r.created_at), r.action, r.outcome, "| by", r.actor_name,
              "| target", r.target_kind, r.target_id, repr(r.target_name),
              "| changes", str(r.changes)[:300], "| details", str(r.details)[:300])

        # ── 4. how many leaders wait on a pick like this ─────────────────────
        waiting = (db.query(CellLinkEvent).filter(CellLinkEvent.field == "leader_id",
                                                  CellLinkEvent.applied_at.is_(None))
                   .order_by(CellLinkEvent.effective_at).all())
        P("waiting «Boshqaruvchi» changes platform-wide", len(waiting))
        code_of = {c.id: c.verifix_code for c in db.query(Cell.id, Cell.verifix_code).all()}
        for e in waiting:
            P(" wait", code_of.get(e.cell_id), pn(e.prev) if e.prev else "—", "→",
              pn(e.value) if e.value else "—", "| lands", t(e.effective_at),
              "| src", e.src, "| by", e.by_name, "| made", t(e.created_at))
    except Exception:  # noqa: BLE001
        P("FAILED")
        for line in traceback.format_exc().splitlines():
            P(line)
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
