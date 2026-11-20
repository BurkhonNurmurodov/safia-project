"""One-shot: which supervisor unit of the NEW plant a catalogue belongs to.

The operator, 2026-11-20: «We have add our factory which is in Kazakstan. Here I
have the catalogue for the supervisor in there, please add this catalogue» —
with the supervisor's own form (83 positions, teams A · B · C). A catalogue
hangs on `managers.id`, and a cloud session cannot read production: the report
door refused the session's key that day, so this is the documented fallback
(`docs/cloud-sessions.md`, «When a cloud session needs an answer only
production has»). The operator named Abbos as its one reader.

WHAT it answers, in one go — everything the catalogue seed needs to be written
without a guess:

  * every plant (`factories`), with how many units hang on it;
  * every unit that is not archived — id · name · shift · plant · how many
    catalogue lines, work centres and cells it holds — so the supervisor is
    found whatever plant their unit was put on, or on none;
  * for every plant but the largest (the one the platform grew up on), each
    unit in full: its cells (verifix code, SAP work centre, group letter, load
    switch, leader), its work centres with their штатка, its catalogue line by
    line, and how many typed days and kept catalogue versions stand on it —
    what a seed must not overwrite.

It is TEXT, never a workbook: its reader forwards it and the operator pastes it
back into the session. READ-ONLY — it writes nothing but its flag
(`startup._send_report_once`). A snapshot of one instant: a unit, cell or line
added after it ran is not in it.

Temporary: delete this module, `startup.report_plant_units` /
`_plant_units_job` and the call in BOTH entrypoints once the answer is back —
a call left behind imports a deleted module at boot, and a failed boot rolls
the deploy back.
"""
from __future__ import annotations

import time
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Cell, Factory, Manager, PPCatalogVersion, PPDaily, PPLineDaily, PPProduct,
    PPWorkCenter, RoleProfile,
)

_API = "https://api.telegram.org"
SEND_RETRIES = 3
# A unit's catalogue is printed whole up to this many lines; past it the rest
# is counted, never silently dropped.
MAX_LINES = 150
_TZ = ZoneInfo("Asia/Tashkent")


def _s(v) -> str:
    return " ".join(str(v if v is not None else "").split())


def _yn(v) -> str:
    return "yes" if v else "no"


def _num(v) -> str:
    if v is None:
        return "—"
    f = float(v)
    return str(int(f)) if f == int(f) else f"{f:g}"


def collect(db: Session) -> dict:
    """Everything the report prints, as plain data."""
    factories = db.query(Factory).order_by(Factory.sort_order, Factory.id).all()
    managers = db.query(Manager).order_by(Manager.id).all()

    def counts(col, *where):
        q = db.query(col, func.count()).group_by(col)
        for w in where:
            q = q.filter(w)
        return {k: n for k, n in q.all()}

    lines_on = counts(PPProduct.manager_id, PPProduct.active.is_(True))
    lines_off = counts(PPProduct.manager_id, PPProduct.active.is_(False))
    wcs = counts(PPWorkCenter.manager_id)
    cells_live = counts(Cell.manager_id, Cell.archived_at.is_(None))

    live_units = Counter(m.factory_id for m in managers if not m.archived)
    all_units = Counter(m.factory_id for m in managers)
    # «The largest» is the plant the platform grew up on; every other one is
    # printed in full. With one plant (or none) nothing is.
    with_units = [f for f in factories if live_units.get(f.id)]
    main_id = (max(with_units, key=lambda f: (live_units[f.id], -f.id)).id
               if with_units else None)
    detail_ids = [f.id for f in factories if f.id != main_id]

    units = [{
        "id": m.id, "name": _s(m.name), "shift": m.shift, "factory_id": m.factory_id,
        "archived": bool(m.archived),
        "lines": lines_on.get(m.id, 0), "lines_archived": lines_off.get(m.id, 0),
        "work_centers": wcs.get(m.id, 0), "cells": cells_live.get(m.id, 0),
        "kind": m.supervisor_kind, "zagruzka_on": bool(m.zagruzka_on),
        "verifix": bool(m.vfx_employee_id),
    } for m in managers]

    detail_units = [u for u in units if u["factory_id"] in detail_ids]
    ids = [u["id"] for u in detail_units]
    detail: dict[int, dict] = {i: {"cells": [], "work_centers": [], "lines": [],
                                   "leaders": [], "typed": None, "typed_lines": None,
                                   "versions": 0} for i in ids}
    if ids:
        leader_name = {p.id: _s(p.name) for p in db.query(RoleProfile).filter(
            RoleProfile.role == "leader").all()}
        for c in (db.query(Cell).filter(Cell.manager_id.in_(ids))
                  .order_by(Cell.verifix_code).all()):
            detail[c.manager_id]["cells"].append({
                "id": c.id, "code": _s(c.verifix_code), "sap": _s(c.sap_code),
                "group": c.wc_group, "in_load": bool(c.in_load),
                "archived": c.archived_at is not None,
                "leader": leader_name.get(c.leader_id) if c.leader_id else None,
            })
        for p in (db.query(RoleProfile).filter(RoleProfile.role == "leader",
                                               RoleProfile.manager_id.in_(ids))
                  .order_by(RoleProfile.name).all()):
            detail[p.manager_id]["leaders"].append(_s(p.name))
        for w in (db.query(PPWorkCenter).filter(PPWorkCenter.manager_id.in_(ids))
                  .order_by(PPWorkCenter.sort_order, PPWorkCenter.id).all()):
            detail[w.manager_id]["work_centers"].append({
                "code": _s(w.code), "shtatka": w.shtatka, "capacity": w.capacity,
                "active": bool(w.active)})
        for p in (db.query(PPProduct).filter(PPProduct.manager_id.in_(ids))
                  .order_by(PPProduct.sort_order, PPProduct.id).all()):
            detail[p.manager_id]["lines"].append({
                "sap": _s(p.sap_code), "name": _s(p.name), "wc": _s(p.work_center),
                "labor": p.labor_time, "group": p.wc_group, "active": bool(p.active)})
        for model, key in ((PPDaily, "typed"), (PPLineDaily, "typed_lines")):
            for mid, n, lo, hi in (db.query(model.manager_id, func.count(),
                                            func.min(model.date), func.max(model.date))
                                   .filter(model.manager_id.in_(ids))
                                   .group_by(model.manager_id).all()):
                detail[mid][key] = (n, lo, hi)
        for mid, n in (db.query(PPCatalogVersion.manager_id, func.count())
                       .filter(PPCatalogVersion.manager_id.in_(ids))
                       .group_by(PPCatalogVersion.manager_id).all()):
            detail[mid]["versions"] = n

    return {
        "factories": [{
            "id": f.id, "code": _s(f.code), "ru": _s(f.name_ru), "uz": _s(f.name_uz),
            "en": _s(f.name_en), "archived": bool(f.archived),
            "units": live_units.get(f.id, 0),
            "units_archived": all_units.get(f.id, 0) - live_units.get(f.id, 0),
            "main": f.id == main_id,
        } for f in factories],
        "units": units, "detail_ids": detail_ids, "detail": detail,
    }


def _span(t) -> str:
    if not t:
        return "0"
    n, lo, hi = t
    return f"{n} ({lo:%d.%m.%Y}–{hi:%d.%m.%Y})"


def text(rep: dict) -> str:
    now = datetime.now(_TZ)
    fac = {f["id"]: f for f in rep["factories"]}

    def plant(fid) -> str:
        f = fac.get(fid)
        return f"#{f['id']} {f['code']}" if f else "no plant"

    out = [
        f"Safia IMS — plants and supervisor units, {now:%d.%m.%Y %H:%M} (Tashkent)",
        "A read-only one-shot for the Kazakhstan catalogue. Please send this whole "
        "text back to Burkhon — it is pasted into the session that adds the catalogue.",
        "",
        f"PLANTS ({len(rep['factories'])})",
    ]
    for f in rep["factories"]:
        out.append(
            f"#{f['id']} code={f['code']} · ru={f['ru'] or '—'} · uz={f['uz'] or '—'} · "
            f"en={f['en'] or '—'} · units {f['units']} (+{f['units_archived']} archived)"
            f"{' · ARCHIVED' if f['archived'] else ''}{' · the largest' if f['main'] else ''}")

    live = [u for u in rep["units"] if not u["archived"]]
    out += ["", f"UNITS, not archived ({len(live)}) — id · name · shift · plant · "
                "catalogue lines · work centres · cells"]
    by_plant = defaultdict(list)
    for u in live:
        by_plant[u["factory_id"]].append(u)
    order = [f["id"] for f in rep["factories"]] + [k for k in by_plant if k not in fac]
    for fid in order:
        for u in by_plant.get(fid, []):
            arch = f"+{u['lines_archived']}a" if u["lines_archived"] else ""
            out.append(f"{u['id']} · {u['name']} · s{u['shift'] or '—'} · {plant(fid)} · "
                       f"L{u['lines']}{arch} · WC{u['work_centers']} · C{u['cells']}")

    if not rep["detail_ids"]:
        out += ["", "There is ONE plant with units — no other plant to print in full."]
    for fid in rep["detail_ids"]:
        f = fac[fid]
        mine = [u for u in rep["units"] if u["factory_id"] == fid]
        out += ["", f"PLANT #{fid} {f['code']} «{f['ru'] or f['uz'] or f['en'] or '—'}» "
                    f"— every unit in full ({len(mine)})"]
        if not mine:
            out.append("  no unit hangs on this plant")
        for u in mine:
            d = rep["detail"][u["id"]]
            out.append(
                f"UNIT {u['id']} «{u['name']}» · shift {u['shift'] or '—'} · "
                f"archived {_yn(u['archived'])} · kind {u['kind'] or '—'} · "
                f"zagruzka_on {_yn(u['zagruzka_on'])} · verifix {_yn(u['verifix'])}")
            out.append(f"  typed days pp_daily {_span(d['typed'])} · pp_line_daily "
                       f"{_span(d['typed_lines'])} · catalogue versions {d['versions']}")
            out.append(f"  leaders ({len(d['leaders'])}): {', '.join(d['leaders']) or '—'}")
            out.append(f"  cells ({len(d['cells'])}):")
            for c in d["cells"]:
                out.append(
                    f"    {c['code']} · id {c['id']} · sap {c['sap'] or '—'} · group "
                    f"{c['group'] or '—'} · in_load {_yn(c['in_load'])} · leader "
                    f"{c['leader'] or '—'}{' · ARCHIVED' if c['archived'] else ''}")
            out.append(f"  work centres ({len(d['work_centers'])}):")
            for w in d["work_centers"]:
                out.append(f"    {w['code']} · штатка {w['shtatka']} · capacity "
                           f"{_num(w['capacity'])}{'' if w['active'] else ' · inactive'}")
            out.append(f"  catalogue ({len(d['lines'])}): № · SAP · name · team · "
                       "Трудоемкость · group")
            for i, p in enumerate(d["lines"][:MAX_LINES], start=1):
                out.append(
                    f"    {i}. {p['sap'] or '—'} · {p['name'] or '—'} · {p['wc'] or '—'} · "
                    f"{_num(p['labor'])} · {p['group'] or '—'}"
                    f"{'' if p['active'] else ' · archived'}")
            if len(d["lines"]) > MAX_LINES:
                out.append(f"    … and {len(d['lines']) - MAX_LINES} more line(s), not printed")

    loose = [u for u in live if u["factory_id"] not in fac]
    out += ["", f"Units on NO plant: {len(loose)}", "— end of the report —"]
    return "\n".join(out)


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


def chunks(body: str, limit: int = 3900) -> list[str]:
    """`body` cut at line ends into Telegram-sized messages."""
    out, cur = [], ""
    for line in body.split("\n"):
        if cur and len(cur) + len(line) + 1 > limit:
            out.append(cur)
            cur = ""
        cur += line[:limit] + "\n"
    if cur.strip():
        out.append(cur)
    return out


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    db.rollback()   # read-only: nothing of this session's is left open
    parts = chunks(text(rep))
    for i, c in enumerate(parts, start=1):
        head = f"[{i}/{len(parts)}]\n" if len(parts) > 1 else ""
        _post("sendMessage", {"chat_id": chat_id, "text": head + c})
    return len(parts)
