"""TEMPORARY boot report (2026-10-24): the state of four units before their
brigadirs change.

The operator (2026-10-24, the ten rulings in `docs/plan-brigadir-change-oct24.md`):
unit 9 «Mirmaxmudova Munira» goes to Raximova Kamola, unit 6 «Suvonov Elshod»
to Erkanboyev Zafarjon, unit 5 «Suvonov Elshod OF» to Suvonov Elshod, unit 10
«Raximova Kamola» to Niyozov Izzatilla. Before any of it is written, production's
own record of everything the change will touch is DMed once — the one-shot that
applies the change is written against THIS, not against a local copy.

READS and writes nothing but its flag (`startup.BRIGADIR_CHANGE_STATE_FLAG`):
the four units' rows, their hand ties and what Verifix says of them, their
cells, leaders and Telegram holders, every other role of those accounts, the
browser logins and translation overrides on their names, the two leader profiles
of the men who become brigadir (and their cells), who Verifix puts over each
unit's cells today, the open sync items about them, and the five people as the
stored Verifix org lists them. Text in chunks plus the same text as a .txt file,
so nothing is cut. Delete this module, `startup.report_brigadir_change_state`
and both entrypoint calls once the change has shipped.
"""
from __future__ import annotations

import json
import time
from collections import Counter, defaultdict
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AppSetting, Cell, CellLinkEvent, Factory, Manager, PPManagerSetting, RoleProfile,
    TelegramUser, TelegramUserRole, Translation, VerifixSyncItem, VerifixTie, WebCredential,
)
from app.services import verifix_org
from app.services.name_map import _name_tokens

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3

UNIT_IDS = (9, 6, 5, 10)
# The change, as ruled: unit id → (who holds it today, who takes it).
CHANGE = {
    9:  ("Mirmaxmudova Munira", "Raximova Kamola"),
    6:  ("Suvonov Elshod", "Erkanboyev Zafarjon"),
    5:  ("Suvonov Elshod OF", "Suvonov Elshod"),
    10: ("Raximova Kamola", "Niyozov Izzatilla"),
}
PEOPLE = ("Mirmaxmudova Munira", "Raximova Kamola", "Suvonov Elshod",
          "Erkanboyev Zafarjon", "Niyozov Izzatilla")
WATCH_CELLS = ("4112", "9412")   # the two men's own cells as leaders


# ── name matching, on the sheet matcher's folded skeleton ─────────────────────

def _key(name: str) -> tuple[str, str]:
    toks = _name_tokens(name or "")
    return (toks[0] if toks else "", toks[1] if len(toks) > 1 else "")


def _same(a: str, b_key: tuple[str, str]) -> bool:
    """Surname equal; first name equal or one the prefix of the other (4+)."""
    sur, first = _key(a)
    if not sur or sur != b_key[0]:
        return False
    if not first or not b_key[1]:
        return True
    if first == b_key[1]:
        return True
    return len(first) >= 4 and len(b_key[1]) >= 4 and (first.startswith(b_key[1])
                                                         or b_key[1].startswith(first))


def _iso(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(TZ).isoformat(timespec="minutes")
    return str(v)


# ── collect ───────────────────────────────────────────────────────────────────

def collect(db: Session) -> dict:
    now = datetime.now(TZ)
    rep: dict = {"at": now.isoformat(timespec="seconds"), "units": [], "people": {},
                 "watch_cells": [], "queue": {}, "all_units": [], "org": None,
                 "sync_mode": None, "problems": []}

    mode = db.query(AppSetting).filter_by(key="verifix_sync_mode").first()
    rep["sync_mode"] = (mode.value if mode else None) or "report (default)"

    factories = {f.id: (getattr(f, "name_uz", None) or getattr(f, "name", None)
                        or getattr(f, "code", None) or "")
                 for f in db.query(Factory).all()}
    managers = {m.id: m for m in db.query(Manager).order_by(Manager.id).all()}
    rep["all_units"] = [{"id": m.id, "name": m.name, "shift": m.shift, "archived": bool(m.archived),
                         "vfx": m.vfx_employee_id}
                        for m in managers.values()]
    # Does a unit OUTSIDE the chain already carry one of the NEW names? Inside
    # it two do by design (10 is «Raximova Kamola» until 9 takes the name, 6 is
    # «Suvonov Elshod» until 5 does) — the one-shot renames in the right order.
    for uid, (_old, new) in CHANGE.items():
        for m in managers.values():
            if m.id == uid or m.archived or not _same(m.name or "", _key(new)):
                continue
            if m.id in CHANGE and _same(CHANGE[m.id][0], _key(new)):
                continue
            rep["problems"].append(f"unit {m.id} «{m.name}» already carries the name meant for unit {uid}")

    ties = defaultdict(dict)
    for t in db.query(VerifixTie).all():
        ties[t.kind][t.our_id] = {"vfx_id": t.vfx_id or "(untied by hand)", "how": t.how, "by": t.by_name,
                                  "at": _iso(t.created_at)}

    users = {u.telegram_id: u for u in db.query(TelegramUser).all()}
    roles_by_tid: dict = defaultdict(list)
    for r in db.query(TelegramUserRole).order_by(TelegramUserRole.id).all():
        roles_by_tid[r.telegram_id].append(r)

    cells = db.query(Cell).order_by(Cell.id).all()
    cells_by_unit: dict = defaultdict(list)
    for c in cells:
        if c.manager_id:
            cells_by_unit[c.manager_id].append(c)
    profiles = db.query(RoleProfile).order_by(RoleProfile.id).all()
    prof_by_id = {p.id: p for p in profiles}
    leaders_by_unit: dict = defaultdict(list)
    for p in profiles:
        if p.role == "leader" and p.manager_id:
            leaders_by_unit[p.manager_id].append(p)
    cells_by_leader: dict = defaultdict(list)
    for c in cells:
        if c.leader_id and c.archived_at is None:
            cells_by_leader[c.leader_id].append(c.verifix_code)

    pending = defaultdict(list)
    for ev in (db.query(CellLinkEvent).filter(CellLinkEvent.applied_at.is_(None))
               .order_by(CellLinkEvent.id).all()):
        pending[ev.cell_id].append({"field": ev.field, "value": ev.value, "prev": ev.prev,
                                    "from": _iso(ev.effective_from), "src": ev.src, "by": ev.by_name})

    web = {w.profile_key: w for w in db.query(WebCredential).all()}
    pp = {s.manager_id: bool(s.auto_fill) for s in db.query(PPManagerSetting).all()}

    # Verifix's stored org: who the five are, and who stands over each unit's cells.
    org, org_at = verifix_org.stored(db)
    over = None
    org_rows: list = []
    if org:
        divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
        cn = verifix_org.cell_nodes(divs, emps, jobs)
        org_rows = verifix_org.people(divs, emps, jobs, cn)
        unit_by_emp: dict = defaultdict(list)
        for m in managers.values():
            if m.vfx_employee_id:
                unit_by_emp[m.vfx_employee_id].append(m.id)
        over = verifix_org.brigadirs_over(divs, emps, jobs, unit_by_emp)
        rep["org"] = {"read_at": _iso(org_at), "employees": len(emps), "divisions": len(divs)}
    else:
        rep["problems"].append("no stored Verifix org read — the Verifix side of this report is empty")
    emp_by_id = {p["id"]: p for p in org_rows}

    def _holder(r: TelegramUserRole) -> dict:
        u = users.get(r.telegram_id)
        others = Counter()
        for o in roles_by_tid.get(r.telegram_id, []):
            if o.id != r.id and o.status == "approved":
                others[f"{o.role}:{o.role_id}"] += 1
        return {"row": r.id, "telegram_id": r.telegram_id, "status": r.status,
                "profile_key": r.profile_key, "full_name": r.full_name,
                "approved_at": _iso(r.approved_at),
                "account": (u.full_name if u else None), "tg_name": (u.tg_name if u else None),
                "username": (u.username if u else None), "lang": (u.language if u else None),
                "dm_ok": (u.dm_failed_at is None) if u else None,
                "active_role_ref": (u.active_role_ref if u else None),
                "other_roles": sorted(others)}

    def _vfx_person(eid: Optional[str]) -> Optional[dict]:
        p = emp_by_id.get(eid or "")
        if not p:
            return {"id": eid, "missing": True} if eid else None
        return {"id": p["id"], "name": p["name"], "status": p["status"], "job": p["job"],
                "unit": p["unit_name"], "cell": p["cell_raw"], "where": p["where"]}

    for uid in UNIT_IDS:
        m = managers.get(uid)
        if m is None:
            rep["problems"].append(f"unit {uid} does not exist")
            continue
        meta = m.supervisor_kind_meta if isinstance(m.supervisor_kind_meta, dict) else {}
        vmeta = m.vfx_meta if isinstance(m.vfx_meta, dict) else {}
        alive = [c for c in cells_by_unit.get(uid, []) if c.archived_at is None]
        overs: Counter = Counter()
        over_detail: dict = {}
        if over is not None:
            for c in alive:
                if not c.vfx_division_id:
                    overs["(cell not tied to Verifix)"] += 1
                    continue
                bs = over(c.vfx_division_id)
                if not bs:
                    overs["(no brigadir above in Verifix)"] += 1
                for b in bs:
                    label = f"{b['name']} [vfx {b['id']}] → our unit(s) {list(b['unit']) or '—'}"
                    overs[label] += 1
                    over_detail.setdefault(label, []).append(c.verifix_code)
        unit_leaders = []
        for p in leaders_by_unit.get(uid, []):
            holders = [r for r in db.query(TelegramUserRole).filter_by(role="leader", role_id=uid).all()
                       if r.profile_key == f"leader:{p.id}" or (not r.profile_key and r.full_name == p.name)]
            unit_leaders.append({
                "id": p.id, "name": p.name, "vfx": p.vfx_employee_id, "kind": p.leader_kind,
                "owes_from": _iso(p.owes_from), "cells": sorted(cells_by_leader.get(p.id, [])),
                "holders": [f"{r.telegram_id}:{r.status}" for r in holders],
                "hand_tie": ties["leader"].get(p.id) or ties["profile"].get(p.id),
            })
        row = {
            "id": m.id, "name": m.name, "today": CHANGE[uid][0], "becomes": CHANGE[uid][1],
            "shift": m.shift, "factory": f"{m.factory_id} {factories.get(m.factory_id, '')}".strip(),
            "archived": bool(m.archived), "zagruzka_on": bool(m.zagruzka_on),
            "supervisor_kind": m.supervisor_kind, "kind_src": meta.get("src"), "kind_by": meta.get("by"),
            "vfx_employee_id": m.vfx_employee_id,
            "vfx_meta": {k: vmeta.get(k) for k in ("name", "job", "status", "how", "confirmed", "seen_at")
                         if vmeta.get(k) is not None},
            "vfx_person": _vfx_person(m.vfx_employee_id),
            "hand_tie": ties["unit"].get(uid),
            "name_aliases": m.name_aliases,
            "cells": {"alive": len(alive), "with_leader": sum(1 for c in alive if c.leader_id),
                      "in_load": sum(1 for c in alive if getattr(c, "in_load", None)),
                      "tied": sum(1 for c in alive if c.vfx_division_id),
                      "codes": sorted(c.verifix_code for c in alive),
                      "pending": {c.verifix_code: pending[c.id] for c in alive if pending.get(c.id)}},
            "verifix_over": {"summary": dict(overs), "cells": over_detail},
            "leaders": unit_leaders,
            "holders": [_holder(r) for r in sorted(
                (r for rs in roles_by_tid.values() for r in rs if r.role == "supervisor" and r.role_id == uid),
                key=lambda r: (r.status != "approved", r.id))],
            "web_login": ({"username": web[f"supervisor:{uid}"].username,
                           "enabled": bool(web[f"supervisor:{uid}"].enabled)}
                          if f"supervisor:{uid}" in web else None),
            "pp_auto_fill": pp.get(uid, "(no row = on)"),
            "translations": [{"lang": t.lang, "value": t.value} for t in
                             db.query(Translation).filter(Translation.key == f"name.{m.name}").all()],
        }
        rep["units"].append(row)

    for code in WATCH_CELLS:
        k = verifix_org.code_key(code)
        for c in cells:
            if verifix_org.code_key(c.verifix_code) != k:
                continue
            lead = prof_by_id.get(c.leader_id)
            own = prof_by_id.get(c.owner_id) if getattr(c, "owner_id", None) else None
            rep["watch_cells"].append({
                "id": c.id, "code": c.verifix_code, "unit": c.manager_id,
                "unit_name": (managers.get(c.manager_id).name if c.manager_id in managers else None),
                "leader": f"{c.leader_id} {lead.name}" if lead else None,
                "owner": f"{c.owner_id} {own.name}" if own else None,
                "vfx_division_id": c.vfx_division_id, "archived_at": _iso(c.archived_at),
                "in_load": getattr(c, "in_load", None),
                "wc_group": getattr(c, "wc_group", None),
                "pending": pending.get(c.id, []),
            })

    for name in PEOPLE:
        key = _key(name)
        rep["people"][name] = {
            "profiles": [{"id": p.id, "role": p.role, "name": p.name, "unit": p.manager_id,
                          "vfx": p.vfx_employee_id, "kind": p.leader_kind, "owes_from": _iso(p.owes_from),
                          "cells": sorted(cells_by_leader.get(p.id, [])),
                          "hand_tie": ties["leader"].get(p.id) or ties["profile"].get(p.id),
                          "aliases": p.name_aliases}
                         for p in profiles if _same(p.name or "", key)],
            "units_named": [{"id": m.id, "name": m.name, "archived": bool(m.archived)}
                            for m in managers.values() if _same(m.name or "", key)],
            "accounts": [{"telegram_id": u.telegram_id, "account": u.full_name, "tg_name": u.tg_name,
                          "username": u.username, "lang": u.language,
                          "roles": [f"{r.role}:{r.role_id} {r.status} «{r.full_name}»"
                                    for r in roles_by_tid.get(u.telegram_id, [])]}
                         for u in users.values()
                         if _same(u.full_name or "", key) or _same(u.tg_name or "", key)],
            "role_rows_named": [f"row {r.id} tid {r.telegram_id} {r.role}:{r.role_id} {r.status} «{r.full_name}»"
                                for rs in roles_by_tid.values() for r in rs
                                if _same(r.full_name or "", key)],
            "verifix": [{"id": p["id"], "name": p["name"], "status": p["status"], "job": p["job"],
                         "unit": p["unit_name"], "cell": p["cell_raw"], "where": p["where"],
                         "dismissed": p.get("dismissed"),
                         "tied_to": ([f"unit {m.id} «{m.name}»" for m in managers.values()
                                      if m.vfx_employee_id == p["id"]]
                                     + [f"{q.role} profile {q.id} «{q.name}»" for q in profiles
                                        if q.vfx_employee_id == p["id"]])}
                        for p in org_rows if _same(p["name"], key)],
            "web_login": [{"profile_key": k, "username": w.username, "enabled": bool(w.enabled)}
                          for k, w in web.items()
                          if any(k == f"leader:{p.id}" for p in profiles if _same(p.name or "", key))],
        }

    unit_cell_ids = {str(c.id) for uid in UNIT_IDS for c in cells_by_unit.get(uid, [])}
    unit_ids = {str(u) for u in UNIT_IDS}
    for it in db.query(VerifixSyncItem).filter(VerifixSyncItem.status == "open").all():
        p = it.payload or {}
        touches = (str(p.get("unit")) in unit_ids or str(p.get("from_unit")) in unit_ids
                   or str(p.get("to_unit")) in unit_ids or str(p.get("cell")) in unit_cell_ids)
        if touches:
            rep["queue"].setdefault(it.kind, []).append(
                {k: p.get(k) for k in ("unit", "from_unit", "to_unit", "cell", "code", "brigadir", "name")
                 if p.get(k) is not None})
    return rep


# ── text ──────────────────────────────────────────────────────────────────────

def _j(v) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)


def text(rep: dict) -> str:
    L: list[str] = []
    L.append(f"BRIGADIR CHANGE — STATE REPORT · {rep['at']}")
    L.append(f"Verifix sync mode: {rep['sync_mode']} · org read: {_j(rep.get('org'))}")
    if rep["problems"]:
        L.append("PROBLEMS: " + " | ".join(rep["problems"]))
    L.append("")
    for u in rep["units"]:
        L.append(f"=== UNIT {u['id']} «{u['name']}»  (today: {u['today']} → becomes: {u['becomes']}) ===")
        L.append(f"shift {u['shift']} · factory {u['factory']} · archived {u['archived']} · "
                 f"zagruzka_on {u['zagruzka_on']} · supervisor_kind {u['supervisor_kind']} "
                 f"(src {u['kind_src']}, by {u['kind_by']}) · pp_auto_fill {u['pp_auto_fill']}")
        L.append(f"vfx_employee_id {u['vfx_employee_id']} · vfx_meta {_j(u['vfx_meta'])}")
        L.append(f"Verifix person on that id: {_j(u['vfx_person'])}")
        L.append(f"hand tie: {_j(u['hand_tie'])} · name_aliases {_j(u['name_aliases'])}")
        L.append(f"web login: {_j(u['web_login'])} · translations {_j(u['translations'])}")
        c = u["cells"]
        L.append(f"cells: {c['alive']} alive ({c['with_leader']} with leader, {c['in_load']} in load, "
                 f"{c['tied']} tied) — {', '.join(c['codes'])}")
        if c["pending"]:
            L.append(f"  pending dated link changes: {_j(c['pending'])}")
        L.append("Verifix puts over these cells today:")
        for who, n in sorted(u["verifix_over"]["summary"].items(), key=lambda kv: -kv[1]):
            codes = u["verifix_over"]["cells"].get(who)
            L.append(f"  · {who}: {n} cell(s)" + (f" — {', '.join(codes)}" if codes else ""))
        L.append(f"leaders ({len(u['leaders'])}):")
        for p in u["leaders"]:
            L.append(f"  · #{p['id']} {p['name']} · vfx {p['vfx']} · kind {p['kind']} · owes_from {p['owes_from']} "
                     f"· cells {', '.join(p['cells']) or '—'} · holders {', '.join(p['holders']) or '—'}"
                     + (f" · hand tie {_j(p['hand_tie'])}" if p['hand_tie'] else ""))
        L.append(f"Telegram holders of supervisor:{u['id']} ({len(u['holders'])}):")
        for h in u["holders"]:
            L.append(f"  · row {h['row']} · tid {h['telegram_id']} · {h['status']} · key {h['profile_key']} "
                     f"· account «{h['account']}» (tg «{h['tg_name']}», @{h['username']}, lang {h['lang']}, "
                     f"dm_ok {h['dm_ok']}, active_ref {h['active_role_ref']}) · approved {h['approved_at']} "
                     f"· other roles: {', '.join(h['other_roles']) or '—'}")
        L.append("")
    L.append("=== THE TWO MEN'S CELLS AS LEADERS ===")
    for c in rep["watch_cells"]:
        L.append(f"  · {_j(c)}")
    L.append("")
    L.append("=== THE FIVE PEOPLE ===")
    for name, info in rep["people"].items():
        L.append(f"--- {name} ---")
        L.append(f"  units named so: {_j(info['units_named'])}")
        L.append(f"  profiles: {_j(info['profiles'])}")
        L.append(f"  accounts: {_j(info['accounts'])}")
        L.append(f"  role rows carrying the name: {_j(info['role_rows_named'])}")
        L.append(f"  on Verifix: {_j(info['verifix'])}")
        L.append(f"  web login: {_j(info['web_login'])}")
    L.append("")
    L.append("=== OPEN SYNC ITEMS TOUCHING THESE UNITS ===")
    if not rep["queue"]:
        L.append("  none")
    for kind, items in sorted(rep["queue"].items()):
        L.append(f"  · {kind}: {len(items)} — {_j(items[:12])}" + (" …" if len(items) > 12 else ""))
    L.append("")
    L.append("=== ALL UNITS (id · name · shift · archived · vfx) ===")
    for m in rep["all_units"]:
        L.append(f"  {m['id']} · {m['name']} · S{m['shift']} · {'ARCHIVED' if m['archived'] else 'live'} · vfx {m['vfx']}")
    return "\n".join(L)


# ── send ──────────────────────────────────────────────────────────────────────

def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=180)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    """The report as a .txt document (complete) plus the text in chunks, so it
    can be read on the phone and forwarded whole. Returns the messages sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    body = text(rep)
    db.rollback()
    print("[startup] brigadir change state report:\n" + body)
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H-%M")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": "Brigadir change — the state of units 9, 6, 5, 10 before anything is written. "
                      "Forward this file to the session that builds the change."},
          files={"document": (f"brigadir-change-state-{stamp}.txt", body.encode("utf-8"), "text/plain")})
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks) + 1
