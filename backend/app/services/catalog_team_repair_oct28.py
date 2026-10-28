"""TEMPORARY one-shot (2026-10-28): follow, as ONE team, the cells that moved
TOGETHER between Maksumov Sanjar's and Xakimov Ruslan's units and whose
positions the retroactive catalog follow left behind.

The defect (fixed in the same release): the retroactive one-shot
(`catalog_follow_retro`) followed cells ONE AT A TIME, so when two or more
cells at one work centre changed brigadir on the same day — a team, or a swap
of teams — every member saw the others' moves as «another cell at the code
moved in the window» and was named `window_cells_moved`: nothing followed, the
record is FINAL, and the live sweep never takes a final record up. The cells
stood in their new unit with their positions still in the old one. The
one-shot and the sweep's retry check now follow such a team as one group
(`catalog_follow_retro._team_of`).

This pass repairs what the old reading left, for the two units the floor
reported only: a retroactive move record `named` for `window_cells_moved` and
NOTHING else, whose team (every record of the same move day and work centre,
two or more) names only its own members, is RE-ARMED — `busy`, tries 0, due
now — and handed to the live sweep. The sweep follows the team as one group
through every guard the retro had (`catalog_follow._recheck_retro` →
`catalog_follow_retro.recheck`, team-aware) and the engine's strict stops; a
team that fails one is named again, with that reason, and stays where it is.
Nothing is followed while the live sweep is off (`catalog_follow.enabled`).

The result is stored once (app setting `RECORD`) and DMed to Burkhon from the
record, so a failed DM never runs the repair twice. Other units' teams stuck
the same way are LISTED, not touched — the operator decides.

Delete this module, `startup.repair_catalog_teams` / `_catalog_team_repair_job`
and both entrypoint calls once the DM has landed.
"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, Cell, Manager, PPCatalogMove

RECORD = "catalog_team_repair_2026_10_28"
WAIT_S = 150                 # how long the pass waits for the sweep to settle what it re-armed
NOTE = "re-armed 2026-10-28: cells that moved together are followed as one team"


def _only_window(r: PPCatalogMove) -> bool:
    kinds = {n.get("kind") for n in r.named or [] if isinstance(n, dict)}
    return kinds == {"window_cells_moved"}


def stuck_teams(db: Session) -> list[list[PPCatalogMove]]:
    """Every team the old one-cell-at-a-time reading left behind: retroactive
    records `named` for `window_cells_moved` alone, grouped by (move day,
    work centre), two or more, each naming only a member of its own team."""
    rows = [r for r in db.query(PPCatalogMove).filter(
        PPCatalogMove.kind == "retro", PPCatalogMove.state == "named",
        PPCatalogMove.event_id.isnot(None)).all() if _only_window(r)]
    groups: dict = defaultdict(list)
    for r in rows:
        groups[(r.home_from, r.code)].append(r)
    vc = {c.id: c.verifix_code for c in db.query(Cell.id, Cell.verifix_code).filter(
        Cell.id.in_([r.cell_id for r in rows] or [0])).all()}
    out = []
    for _k, rs in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or "")):
        if len(rs) < 2:
            continue
        members = {vc.get(r.cell_id) for r in rs}
        others = {n.get("other") for r in rs for n in r.named or [] if isinstance(n, dict)}
        if others <= members:
            out.append(sorted(rs, key=lambda r: r.cell_id))
    return out


def _scope_units(db: Session) -> set[int]:
    from app.services.catalog_swap_report_oct28 import _units
    units, _note = _units(db)
    return {m.id for m in units.values()}


def _row(r: PPCatalogMove, vc: dict) -> dict:
    return {"id": r.id, "cell": vc.get(r.cell_id, r.cell_id), "from": r.from_unit, "to": r.to_unit,
            "h": r.home_from.isoformat() if r.home_from else None, "code": r.code,
            "state": r.state, "lines": len(r.line_ids or []), "tries": r.tries,
            "named": [n.get("kind") for n in r.named or [] if isinstance(n, dict)],
            "error": (r.error or "")[:200] or None}


def run(db: Session) -> dict:
    """Re-arm the two units' stuck teams, let the sweep follow them, record the
    outcome. Returns the record."""
    from app.services import catalog_follow as cf
    now = datetime.now(timezone.utc)
    units = _scope_units(db)
    teams = stuck_teams(db)
    mine = [rs for rs in teams if any(r.from_unit in units or r.to_unit in units for r in rs)]
    others = [rs for rs in teams if rs not in mine]
    vc = {c.id: c.verifix_code for c in db.query(Cell.id, Cell.verifix_code).all()}
    names = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    enabled = cf.enabled(db)
    ids = []
    for rs in mine:
        for r in rs:
            r.state, r.tries, r.next_try_at, r.error = "busy", 0, now, NOTE
            ids.append(r.id)
    db.commit()
    if ids and enabled:
        deadline = time.monotonic() + WAIT_S
        while True:
            cf.run_sweep()                       # a no-op while the minute job is mid-pass
            db.expire_all()
            left = db.query(PPCatalogMove.id).filter(PPCatalogMove.id.in_(ids),
                                                     PPCatalogMove.state.in_(cf.RETRY)).count()
            if not left or time.monotonic() > deadline:
                break
            time.sleep(10)
    db.expire_all()
    after = {r.id: r for r in db.query(PPCatalogMove).filter(PPCatalogMove.id.in_(ids or [0])).all()}
    rec = {"at": now.isoformat(), "units": sorted(units),
           "unit_names": {str(u): names.get(u) for u in units},
           "sweep_enabled": enabled,
           "flag": db.query(AppSetting.value).filter(AppSetting.key == cf.RETRO_FLAG).scalar(),
           "rearmed": [[_row(after.get(r.id, r), vc) for r in rs] for rs in mine],
           "elsewhere": [[_row(r, vc) | {"from_name": names.get(r.from_unit),
                                          "to_name": names.get(r.to_unit)} for r in rs]
                         for rs in others]}
    row = db.query(AppSetting).filter(AppSetting.key == RECORD).first()
    if row is None:
        db.add(AppSetting(key=RECORD, value=json.dumps(rec, default=str, ensure_ascii=False)))
    else:
        row.value = json.dumps(rec, default=str, ensure_ascii=False)
    db.commit()
    return rec


def text_of(rec: dict) -> str:
    lines = ["🔧 Pozitsiyalar — birga ko'chgan yacheykalar jamoa bo'lib qayta ko'chirildi",
             "(Maksumov Sanjar ↔ Xakimov Ruslan)", ""]
    if not rec.get("sweep_enabled"):
        lines.append(f"⚠️ Jonli ko'chirish o'chiq (retro flag: {rec.get('flag')!r}) — "
                     "qayta qurollangan yozuvlar u yoqilganda ko'chadi.")
    teams = rec.get("rearmed") or []
    if not teams:
        lines.append("Bu ikki brigadirda «birga ko'chgan jamoa» sababli to'xtab qolgan yozuv yo'q — "
                     "sabab boshqa (to'liq hisobot alohida yuborildi).")
    for rs in teams:
        lines.append(f"• {rs[0]['code']} · {rs[0]['h']}:")
        for r in rs:
            lines.append(f"   {r['cell']} {r['from']}→{r['to']}: {r['state']}"
                         + (f" · {r['lines']} pozitsiya" if r["lines"] else "")
                         + (f" · {', '.join(r['named'])}" if r["named"] else "")
                         + (f" · {r['error']}" if r["error"] and r["state"] != "moved" else ""))
    other = rec.get("elsewhere") or []
    if other:
        lines += ["", f"Boshqa brigadirlarda xuddi shunday to'xtab qolgan {len(other)} ta jamoa "
                      "(tegilmadi — siz qaror qilasiz):"]
        for rs in other[:30]:
            lines.append(f"• {rs[0]['code']} · {rs[0]['h']}: " + ", ".join(
                f"{r['cell']} {r.get('from_name') or r['from']}→{r.get('to_name') or r['to']}" for r in rs))
    return "\n".join(lines)


def send(db: Session, chat_id: int, *_window) -> int:
    """Run the repair once (or read its stored record), then DM it."""
    from app.services.catalog_swap_report_oct28 import _post
    raw = db.query(AppSetting.value).filter(AppSetting.key == RECORD).scalar()
    rec: Optional[dict] = json.loads(raw) if raw else None
    if rec is None:
        rec = run(db)
    body = text_of(rec)
    print("[startup] catalog team repair:\n" + body)
    _post("sendMessage", {"chat_id": chat_id, "text": body[:4000]})
    return 1
