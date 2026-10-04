"""One-off (2026-10-04): make the cells register the same as Verifix's.

The operator asked to check every cell on Verifix, rename ours to the names
Verifix gives them, create the cells Verifix has and the platform does not,
archive the ones Verifix no longer has, and report every mismatch. Production's
Verifix login lives only on the server, so this runs there once, at boot, and
DMs the operator a summary and a workbook.

WHICH Verifix subdivisions are cells. Verifix keeps one tree of subdivisions
and puts every employee at two levels of it: a DEPARTMENT (the employee's
``division_id`` — «Производство», «HR департамент») and an org unit, the
«отдел» (``org_unit_id``). Our cells are org units, and a subdivision's
``code`` IS our verifix code (settled on 1 Oct, 159 of 159). A few departments
carry a code too (0006 «Отдел инвентаря производство», 0012 «Медицинский пункт
на предприятии», 111, 112, 400), so "has a code" is not enough: a coded
subdivision that some employee, of any status, holds as their DEPARTMENT is a
department; every other coded subdivision is a cell. On the 1 Oct API dump
that split is exact — none of our 156 cells is anybody's department, and each
of those five is.

A cell is OPEN in Verifix while its state is «A» and CLOSED once it is «P»
(passive): on the dump no passive subdivision has a single working employee.

What is CHANGED, in one transaction:

- RENAMED: every cell of ours whose name is not Verifix's. Verifix writes the
  code in front of the name («0811 Горячий пирож»); the code is left out,
  because ours has its own column and ``cellLabel`` prints it (A0061 is named
  «0611 Обработка яиц», so a leading four-digit number goes as well).
  Russian is the language Verifix names cells in: ``name_workshop_ru`` takes
  the name, ``name_workshop_uz_cyrl`` takes it where it held one (the seed
  kept a copy of the Russian there), and a Latin ``uz`` / ``en`` name is
  cleared — it translated the OLD name, and a blank one falls back to Russian.
- CREATED: every OPEN Verifix cell we do not have, the way the attendance
  upload has always registered a cell it had never seen: no brigadir, no
  leader, out of the загрузка, the Russian name only. Which unit a cell
  belongs to is a person's decision on /cells (it moves attendance and the
  загрузка), so the report names the unit Verifix files it under instead.
- ARCHIVED: every active cell of ours that Verifix has CLOSED, or does not
  have at all. Archiving changes no figure and deletes nothing.

What is only REPORTED: a cell whose brigadir is not the one the other cells
under its Verifix parent belong to, a cell archived here that Verifix still
has open (somebody archived it by hand — not undone), coded departments,
codes spelled two ways, codes Verifix gives to two cells, and Verifix's closed
cells the platform never had.

Nothing is changed when Verifix answers with too little — an empty or cut
tree would read as "archive everything" — and the report then says why. Every
old value is kept in the ``verifix_cell_sync_2026_10_04`` app setting (and in
the workbook), so any of it can be put back.

Temporary: delete this module, ``startup.sync_cells_from_verifix`` /
``_cell_sync_job`` and the call in BOTH entrypoints once the report has landed.
The created, renamed and archived cells stay — they are the register now.
"""
from __future__ import annotations

import html
import json
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from io import BytesIO
from zoneinfo import ZoneInfo

import requests
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Font
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Manager, RoleProfile
from app.services import action_log, verifix, verifix_explore
from app.services.latin_code import latin_code

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
# A boot job, not a request: the employee list is ~18 pages.
READ_BUDGET_S = 420.0
SNAPSHOT_KEY = "verifix_cell_sync_2026_10_04"
ARCHIVED_BY = "Verifix (avtomatik)"

# Below these, Verifix did not hand over the whole tree (1 Oct: 539 / 8,531).
MIN_DIVISIONS = 100
MIN_EMPLOYEES = 1000
# Most of our active cells must be found OPEN in Verifix…
MIN_FOUND_SHARE = 0.8
# …and one pass may archive no more than this many (1 Oct dump: 6).
MAX_ARCHIVE_SHARE = 0.10
MAX_ARCHIVE_FLOOR = 15
MAX_CREATE = 150

_WS = re.compile(r"\s+")
_LEAD = re.compile(r"^(\S+)\s+(.+)$")
_FOUR = re.compile(r"\d{4}")
_NAMELESS = re.compile(r"#?\d+")


# ── names ─────────────────────────────────────────────────────────────────────

def vx_name(raw: str | None, code: str) -> str | None:
    """Verifix's name without the code in front: «0811 Горячий пирож» →
    «Горячий пирож». A leading four-digit number goes too (A0061 is named
    «0611 Обработка яиц»). A name that is nothing but a number is no name."""
    s = _WS.sub(" ", raw or "").strip()
    m = _LEAD.match(s)
    if m and (m.group(1).upper() == code.upper() or _FOUR.fullmatch(m.group(1))):
        s = m.group(2).strip()
    if not s or s.upper() == code.upper() or _NAMELESS.fullmatch(s):
        return None
    return s


def _names(c: Cell) -> dict:
    return {"ru": c.name_workshop_ru, "uz_cyrl": c.name_workshop_uz_cyrl,
            "uz": c.name_workshop_uz, "en": c.name_workshop_en}


def _strip(v: str | None) -> str:
    return (v or "").strip()


def _code(c: Cell) -> str:
    """Our code the way it is compared: Latin, upper case (`latin_code`)."""
    return (latin_code(_strip(c.verifix_code)) or "").upper()


def _renamed(c: Cell, v: str) -> dict | None:
    """The four name columns once the cell carries Verifix's name ``v`` — None
    when a reader in every language already sees exactly ``v``."""
    before = _names(c)
    after = {
        "ru": v,
        "uz_cyrl": v if _strip(before["uz_cyrl"]) else before["uz_cyrl"],
        "uz": None if _strip(before["uz"]) and _strip(before["uz"]) != v else before["uz"],
        "en": None if _strip(before["en"]) and _strip(before["en"]) != v else before["en"],
    }
    return after if after != before else None


def _shown(names: dict) -> str:
    """The name a reader sees — the editor's own fallback, Russian first."""
    for k in ("ru", "uz", "uz_cyrl", "en"):
        if _strip(names.get(k)):
            return _strip(names[k])
    return ""


# ── reading Verifix ───────────────────────────────────────────────────────────

def _read(db: Session) -> tuple[dict, dict]:
    c = verifix_explore.config(db)
    dl = time.monotonic() + READ_BUDGET_S
    divs, _ = verifix_explore._divisions(c, dl, force=True)
    emps, _ = verifix_explore._employees(c, dl, force=True)
    return divs, emps


def _classify(divs: dict, emps: dict) -> tuple[dict, list, list]:
    """(code → the one cell node, coded departments, codes on several cells)."""
    dept_of = Counter(e["div"] for e in emps.values() if e.get("div"))
    workers = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W")
    nodes: dict[str, list[dict]] = defaultdict(list)
    depts: list[dict] = []
    for d in divs.values():
        raw = latin_code(_strip(d.get("raw_code")))
        if not raw:
            continue
        parent = divs.get(d.get("parent") or "") or {}
        node = {
            "id": d["id"], "code": raw, "name": d.get("name") or "",
            "open": (d.get("state") or "A") == "A", "parent": d.get("parent"),
            "parent_name": parent.get("name") or "", "closed": d.get("closed"),
            "workers": workers.get(d["id"], 0),
        }
        if dept_of.get(d["id"]):
            depts.append({**node, "people": dept_of[d["id"]]})
        else:
            nodes[raw.upper()].append(node)
    cells: dict[str, dict] = {}
    dups: list[dict] = []
    for code, ns in nodes.items():
        if len(ns) == 1:
            cells[code] = ns[0]
            continue
        open_ = [n for n in ns if n["open"]]
        if len(open_) <= 1:
            cells[code] = open_[0] if open_ else ns[0]
            continue
        dups.append({"code": ns[0]["code"], "names": [n["name"] for n in open_]})
    return cells, depts, dups


# ── the plan ──────────────────────────────────────────────────────────────────

def plan(db: Session, divs: dict, emps: dict) -> dict:
    """Compare the register with Verifix and say what changes. Writes nothing."""
    cells, depts, dups = _classify(divs, emps)
    dup_codes = {d["code"].upper() for d in dups}
    by_key: dict[str, list[dict]] = defaultdict(list)
    for code, n in cells.items():
        by_key[verifix._code_key(code)].append(n)

    ours = db.query(Cell).order_by(Cell.verifix_code).all()
    units = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    lead_ids = {c.leader_id for c in ours if c.leader_id}
    leaders = ({p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
                .filter(RoleProfile.id.in_(lead_ids)).all()} if lead_ids else {})
    our_by_key: dict[str, list[str]] = defaultdict(list)
    for c in ours:
        our_by_key[verifix._code_key(_code(c))].append(c.verifix_code)

    # A code Verifix gives to two open cells, or one ours could tie to two
    # Verifix cells, is NOT a missing cell: it is left alone and reported.
    match: dict[int, dict] = {}
    unsure: set[int] = set()
    spelled: list[dict] = []
    for c in ours:
        code = _code(c)
        n = cells.get(code)
        if n is None:
            if code in dup_codes:
                unsure.add(c.id)
                continue
            cands = by_key.get(verifix._code_key(code)) or []
            if len(cands) == 1:
                n = cands[0]
                spelled.append({"ours": c.verifix_code, "verifix": n["code"]})
            elif len(cands) > 1:
                unsure.add(c.id)
                spelled.append({"ours": c.verifix_code,
                                "verifix": " / ".join(x["code"] for x in cands)})
        if n is not None:
            match[c.id] = n
    matched_nodes = {n["id"] for n in match.values()}

    # Which unit the cells under one Verifix parent belong to here — the unit
    # holding at least two thirds of the open, active ones that have a unit.
    # A bare majority is not enough: Verifix files BOTH Suvonov Elshod units
    # under one «Цех - 4», seven cells against six, and a cell of the six is
    # not misfiled — the two units simply share Verifix's parent.
    par_units: dict[str, Counter] = defaultdict(Counter)
    for c in ours:
        n = match.get(c.id)
        if n and n["open"] and c.archived_at is None and c.manager_id and n["parent"]:
            par_units[n["parent"]][c.manager_id] += 1

    def expected(parent: str | None) -> int | None:
        cnt = par_units.get(parent or "")
        if not cnt:
            return None
        top, k = cnt.most_common(1)[0]
        return top if k * 3 >= sum(cnt.values()) * 2 else None

    shared = [{"parent": divs.get(p, {}).get("name") or p,
               "units": [units.get(u, f"#{u}") for u, _ in cnt.most_common()]}
              for p, cnt in par_units.items() if len(cnt) > 1 and expected(p) is None]

    renamed, archived, unit_diff, archived_open, rows = [], [], [], [], []
    for c in ours:
        n = match.get(c.id)
        unit = units.get(c.manager_id) if c.manager_id else None
        leader = leaders.get(c.leader_id) if c.leader_id else None
        before = _names(c)
        if c.id in unsure:
            rows.append({"code": c.verifix_code, "ours": "arxivda" if c.archived_at else "faol",
                         "name": _shown(before), "vx_name": None, "vx_state": "noaniq",
                         "vx_parent": None, "workers": None, "unit": unit, "leader": leader,
                         "action": "o'zgartirilmadi (kod noaniq)"})
            continue
        v = vx_name(n["name"], n["code"]) if n else None
        after = _renamed(c, v) if v else None
        action = []
        if after:
            renamed.append({"id": c.id, "code": c.verifix_code, "unit": unit,
                            "before": before, "after": after, "vx_name": n["name"]})
            action.append("nomi o'zgardi")
        if c.archived_at is None and (n is None or not n["open"]):
            archived.append({"id": c.id, "code": c.verifix_code, "name": _shown(before),
                             "unit": unit, "leader": leader,
                             "why": "missing" if n is None else "closed",
                             "vx_name": n["name"] if n else None,
                             "vx_closed": n["closed"] if n else None})
            action.append("arxivlandi")
        if n and n["open"] and c.archived_at is not None:
            archived_open.append({"code": c.verifix_code, "name": _shown(before), "unit": unit,
                                  "archived_at": c.archived_at.astimezone(TZ).strftime("%d.%m.%Y"),
                                  "archived_by": c.archived_by, "vx_name": n["name"],
                                  "workers": n["workers"]})
        if n and n["open"] and c.archived_at is None:
            exp = expected(n["parent"])
            if exp and c.manager_id != exp:
                unit_diff.append({"code": c.verifix_code, "name": _shown(before), "unit": unit,
                                  "leader": leader, "vx_parent": n["parent_name"],
                                  "expected": units.get(exp, f"#{exp}")})
        rows.append({
            "code": c.verifix_code, "ours": "arxivda" if c.archived_at else "faol",
            "name": _shown(before), "vx_name": n["name"] if n else None,
            "vx_state": ("ochiq" if n["open"] else "yopiq") if n else "yo'q",
            "vx_parent": n["parent_name"] if n else None,
            "workers": n["workers"] if n else None, "unit": unit, "leader": leader,
            "action": ", ".join(action) or "—",
        })

    created, closed_absent = [], []
    for code, n in sorted(cells.items()):
        if n["id"] in matched_nodes:
            continue
        if not n["open"]:
            closed_absent.append({"code": n["code"], "name": n["name"], "parent": n["parent_name"],
                                  "closed": n["closed"]})
            continue
        if our_by_key.get(verifix._code_key(code)):
            # A code of ours names it in another spelling and could not be
            # tied to it alone — never a second cell for one code.
            spelled.append({"ours": ", ".join(our_by_key[verifix._code_key(code)]),
                            "verifix": n["code"]})
            continue
        exp = expected(n["parent"])
        created.append({"code": n["code"], "name": vx_name(n["name"], n["code"]),
                        "vx_name": n["name"], "vx_parent": n["parent_name"],
                        "workers": n["workers"], "suggest": units.get(exp) if exp else None})
        rows.append({"code": n["code"], "ours": "yo'q edi", "name": None, "vx_name": n["name"],
                     "vx_state": "ochiq", "vx_parent": n["parent_name"], "workers": n["workers"],
                     "unit": None, "leader": None, "action": "yaratildi"})

    active = [c for c in ours if c.archived_at is None]
    found_open = sum(1 for c in active if (match.get(c.id) or {}).get("open") or c.id in unsure)
    refused = None
    if len(divs) < MIN_DIVISIONS or len(emps) < MIN_EMPLOYEES:
        refused = (f"Verifix handed over only {len(divs)} subdivisions and {len(emps)} employees "
                   f"(expected at least {MIN_DIVISIONS} and {MIN_EMPLOYEES}) — a cut answer.")
    elif active and found_open < MIN_FOUND_SHARE * len(active):
        refused = (f"only {found_open} of our {len(active)} active cells were found open in "
                   "Verifix — that reads like a broken answer, not a closed plant.")
    elif len(archived) > max(MAX_ARCHIVE_FLOOR, int(MAX_ARCHIVE_SHARE * len(active))):
        refused = (f"it would archive {len(archived)} of our {len(active)} active cells at once — "
                   "too many to do without a person looking first.")
    elif len(created) > MAX_CREATE:
        refused = f"it would create {len(created)} cells at once — too many to do unseen."

    rows.sort(key=lambda r: (r["code"] or ""))
    return {
        "at": datetime.now(TZ).isoformat(timespec="minutes"),
        "applied": False, "refused": refused,
        "vx": {"divisions": len(divs), "employees": len(emps),
               "working": sum(1 for e in emps.values() if (e.get("status") or "W") == "W"),
               "cells": len(cells), "open": sum(1 for n in cells.values() if n["open"]),
               "closed": sum(1 for n in cells.values() if not n["open"]), "departments": len(depts)},
        "ours": {"total": len(ours), "active": len(active), "archived": len(ours) - len(active)},
        "renamed": renamed, "created": created, "archived": archived,
        "unit_diff": unit_diff, "archived_open": archived_open, "shared": shared,
        "departments": sorted(({"code": d["code"], "name": d["name"], "open": d["open"],
                                "people": d["people"], "parent": d["parent_name"]} for d in depts),
                              key=lambda d: d["code"]),
        "spelled": spelled, "dups": dups, "closed_absent": closed_absent, "rows": rows,
    }


def _apply(db: Session, rep: dict) -> None:
    now = datetime.now(timezone.utc)
    by_id = {c.id: c for c in db.query(Cell).filter(
        Cell.id.in_([r["id"] for r in rep["renamed"]] + [a["id"] for a in rep["archived"]])).all()}
    for r in rep["renamed"]:
        c = by_id[r["id"]]
        a = r["after"]
        c.name_workshop_ru = a["ru"]
        c.name_workshop_uz_cyrl = a["uz_cyrl"]
        c.name_workshop_uz = a["uz"]
        c.name_workshop_en = a["en"]
    for a in rep["archived"]:
        c = by_id[a["id"]]
        if c.archived_at is None:
            c.archived_at = now
            c.archived_by = ARCHIVED_BY
    for k in rep["created"]:
        cell = Cell(verifix_code=latin_code(k["code"]), name_workshop_ru=k["name"],
                    manager_id=None, leader_id=None, in_load=False)
        db.add(cell)
        db.flush()
        k["id"] = cell.id


def run(db: Session) -> dict:
    """Read Verifix, compare, apply (unless a guard refuses) and keep the record."""
    divs, emps = _read(db)
    rep = plan(db, divs, emps)
    if not rep["refused"]:
        _apply(db, rep)
        rep["applied"] = True
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    value = json.dumps(rep, ensure_ascii=False, default=str)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SNAPSHOT_KEY, value=value))
    db.commit()
    action_log.record_system(
        "org", "org.cells_verifix_sync", db=db,
        outcome="done" if rep["applied"] else "refused",
        details=[("cells", rep["vx"]["cells"]), ("added", len(rep["created"])),
                 ("changed", len(rep["renamed"])), ("archived", len(rep["archived"]))],
        reason=rep["refused"],
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


_WHY = {"closed": "closed in Verifix", "missing": "not in Verifix at all"}


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    vx, ours = rep["vx"], rep["ours"]
    done = rep["applied"]
    L = [f"<b>Cells × Verifix</b> · {at:%d.%m.%Y %H:%M}" + ("" if done else " — <b>NOTHING was changed</b>"),
         f"Read from Verifix's API: {vx['divisions']} subdivisions, {vx['working']:,} working "
         "employees. A subdivision with a code that nobody holds as their department is a cell — "
         f"the «отдел» level our cells sit on. Verifix has <b>{vx['cells']}</b> cells: "
         f"{vx['open']} open, {vx['closed']} closed.",
         f"The platform had {ours['total']} cells ({ours['active']} active, "
         f"{ours['archived']} archived).", ""]
    if not done:
        L += [f"⚠ Stopped: {_e(rep['refused'])}",
              "What it would have done is below and in the workbook; nothing was written.", ""]
    arch = rep["archived"]
    closed = sum(1 for a in arch if a["why"] == "closed")
    L += [f"<b>{'Done' if done else 'Plan'}</b>",
          f"➕ {'Created' if done else 'To create'} — <b>{len(rep['created'])}</b> cells open in "
          "Verifix that the platform did not have. No brigadir, no leader, not in the загрузка — "
          "give each its brigadir on /cells.",
          f"🗄 {'Archived' if done else 'To archive'} — <b>{len(arch)}</b> of ours: {closed} closed "
          f"in Verifix, {len(arch) - closed} not in Verifix at all. Archiving changes no figure and "
          "deletes nothing; the cell keeps its brigadir, leader and history.",
          f"✏️ {'Renamed' if done else 'To rename'} — <b>{len(rep['renamed'])}</b> to the Verifix "
          "name (the code in front left out).", ""]
    L += ["<b>Not changed — for a person to look at</b>",
          f"👥 Brigadir differs from the unit of the other cells under its Verifix parent — "
          f"{len(rep['unit_diff'])}",
          f"🗃 Archived here, open in Verifix — {len(rep['archived_open'])}",
          f"🏢 Coded subdivisions that are departments, not cells — "
          f"{sum(1 for d in rep['departments'] if d['open'])}",
          f"🔤 Codes spelled differently — {len(rep['spelled'])} · one code on two cells — "
          f"{len(rep['dups'])}",
          f"⛔ Closed in Verifix, never on the platform — {len(rep['closed_absent'])} (nothing to do)",
          ""]

    if rep["created"]:
        L.append(f"<b>➕ {'Created' if done else 'To create'} ({len(rep['created'])})</b> · "
                 "code — name — its Verifix parent · working people")
        for k in rep["created"]:
            hint = f" → on the platform that is <b>{_e(k['suggest'])}</b>" if k["suggest"] else ""
            empty = " ⚠ nobody works there" if not k["workers"] else ""
            L.append(f"{_e(k['code'])} — {_e(k['name'] or '(no name)')} — {_e(k['vx_parent'] or '—')}{hint} · "
                     f"{k['workers']}{empty}")
        L.append("")
    if arch:
        L.append(f"<b>🗄 {'Archived' if done else 'To archive'} ({len(arch)})</b>")
        for a in arch:
            who = " · ".join(x for x in (a["unit"], a["leader"] and f"leader {a['leader']}") if x)
            L.append(f"{_e(a['code'])} — {_e(a['name'] or '—')}" + (f" — {_e(who)}" if who else "")
                     + f" — {_WHY[a['why']]}")
        if any(a["leader"] for a in arch):
            L.append("An archived cell keeps its leader, and a per-cell checklist goes on asking "
                     "for it — take the leader off the cell on /cells where it really closed.")
        L.append("")
    if rep["unit_diff"]:
        L.append(f"<b>👥 Brigadir differs ({len(rep['unit_diff'])})</b> · not changed")
        for u in rep["unit_diff"]:
            L.append(f"{_e(u['code'])} — here: {_e(u['unit'] or 'no brigadir')} · Verifix files it "
                     f"under «{_e(u['vx_parent'])}», whose other cells here are "
                     f"{_e(u['expected'])}'s")
        L.append("")
    if rep["shared"]:
        L.append("Verifix keeps two of our units under one parent (no majority, so not compared): "
                 + "; ".join(f"«{_e(s['parent'])}» — {_e(', '.join(s['units']))}" for s in rep["shared"]))
        L.append("")
    if rep["archived_open"]:
        L.append(f"<b>🗃 Archived here, open in Verifix ({len(rep['archived_open'])})</b> · not restored")
        for a in rep["archived_open"]:
            L.append(f"{_e(a['code'])} — {_e(a['name'] or '—')} — archived {a['archived_at']} by "
                     f"{_e(a['archived_by'] or '—')} · {a['workers']} working people in Verifix")
        L.append("")
    open_depts = [d for d in rep["departments"] if d["open"]]
    if open_depts:
        L.append("<b>🏢 Departments with a code</b> (not cells — people hold them as their "
                 "department; not created): " + "; ".join(
                     f"{_e(d['code'])} {_e(d['name'])}" for d in open_depts))
        L.append("")
    if rep["spelled"] or rep["dups"]:
        if rep["spelled"]:
            L.append("🔤 Spelled differently (here → Verifix): "
                     + "; ".join(f"{_e(s['ours'])} → {_e(s['verifix'])}" for s in rep["spelled"]))
        if rep["dups"]:
            L.append("Verifix gives one code to two open cells (left alone): "
                     + "; ".join(f"{_e(d['code'])}: {_e(' / '.join(d['names']))}" for d in rep["dups"]))
        L.append("")
    if rep["renamed"]:
        L.append(f"<b>✏️ {'Renamed' if done else 'To rename'} ({len(rep['renamed'])})</b> · old → new")
        for r in rep["renamed"]:
            old = _shown(r["before"]) or "(no name)"
            L.append(f"{_e(r['code'])}: {_e(old)} → {_e(r['after']['ru'])}")
        L.append("")
    if done:
        L.append("To undo any of it: an archived cell comes back with «Qaytarish» on /cells; every "
                 "old name is in the workbook (sheet «Nomi o'zgardi») and kept on the server. "
                 "Every cell side by side with Verifix is in the attached workbook.")
    return "\n".join(L).strip()


def _cell(v):
    if isinstance(v, str):
        return ILLEGAL_CHARACTERS_RE.sub("", v)
    return v


def _sheet(wb: Workbook, title: str, head: list[str], rows: list[list]) -> None:
    ws = wb.create_sheet(title)
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([_cell(v) for v in r])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(head, start=1):
        width = max([len(str(h))] + [len(str(r[i - 1])) for r in rows[:400]
                                     if i - 1 < len(r) and r[i - 1] is not None])
        ws.column_dimensions[ws.cell(1, i).column_letter].width = min(max(width + 2, 9), 60)


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    _sheet(wb, "Barcha yacheykalar", [
        "Kod", "Bizda", "Bizdagi nomi (oldin)", "Verifix nomi", "Verifixda", "Verifix bo'limi",
        "Verifixda ishlayotganlar", "Brigadir", "Lider", "Natija"],
        [[r["code"], r["ours"], r["name"], r["vx_name"], r["vx_state"], r["vx_parent"],
          r["workers"], r["unit"], r["leader"], r["action"]] for r in rep["rows"]])
    _sheet(wb, "Yaratildi", [
        "Kod", "Nomi", "Verifix nomi", "Verifix bo'limi", "Platformada shu bo'lim yacheykalari",
        "Verifixda ishlayotganlar"],
        [[k["code"], k["name"], k["vx_name"], k["vx_parent"], k["suggest"], k["workers"]]
         for k in rep["created"]])
    _sheet(wb, "Arxivlandi", ["Kod", "Nomi", "Brigadir", "Lider", "Sabab", "Verifix nomi",
                              "Verifixda yopilgan sana"],
           [[a["code"], a["name"], a["unit"], a["leader"],
             "Verifixda yopilgan" if a["why"] == "closed" else "Verifixda yo'q",
             a["vx_name"], a["vx_closed"]] for a in rep["archived"]])
    _sheet(wb, "Nomi o'zgardi", ["Kod", "Brigadir", "Eski (ru)", "Eski (uz_cyrl)", "Eski (uz)",
                                 "Eski (en)", "Yangi", "Verifix to'liq nomi"],
           [[r["code"], r["unit"], r["before"]["ru"], r["before"]["uz_cyrl"], r["before"]["uz"],
             r["before"]["en"], r["after"]["ru"], r["vx_name"]] for r in rep["renamed"]])
    _sheet(wb, "Brigadir farqi", ["Kod", "Nomi", "Bizdagi brigadir", "Lider", "Verifix bo'limi",
                                  "Shu bo'limdagi boshqa yacheykalar brigadiri"],
           [[u["code"], u["name"], u["unit"], u["leader"], u["vx_parent"], u["expected"]]
            for u in rep["unit_diff"]])
    other = (
        [["Bizda arxivda, Verifixda ochiq", a["code"], a["name"],
          f"{a['archived_at']} · {a['archived_by'] or '—'} · Verifixda {a['workers']} kishi"]
         for a in rep["archived_open"]]
        + [["Kodli bo'lim (yacheyka emas)", d["code"], d["name"],
            f"{d['people']} xodimning bo'limi" + ("" if d["open"] else " · yopiq")]
           for d in rep["departments"]]
        + [["Kod boshqacha yozilgan", s["ours"], None, f"Verifixda: {s['verifix']}"]
           for s in rep["spelled"]]
        + [["Verifixda bitta kod ikki yacheykada", d["code"], " / ".join(d["names"]), None]
           for d in rep["dups"]]
        + [["Ikkita brigadamiz bitta Verifix bo'limida", None, s["parent"], ", ".join(s["units"])]
           for s in rep["shared"]]
        + [["Verifixda yopiq, bizda bo'lmagan", c["code"], c["name"],
            f"{c['parent'] or '—'}" + (f" · yopilgan {c['closed']}" if c["closed"] else "")]
           for c in rep["closed_absent"]]
    )
    _sheet(wb, "Boshqa farqlar", ["Turi", "Kod", "Nomi", "Izoh"], other)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── delivery ──────────────────────────────────────────────────────────────────

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
        except Exception as exc:
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def _why(exc: Exception) -> str:
    if isinstance(exc, verifix_explore.NotConfigured):
        return "the Verifix login is not saved on the admin «Verifix» card"
    if isinstance(exc, verifix.VerifixError):
        return f"Verifix answered «{exc.code}» {exc.message or ''}".strip()
    return f"{type(exc).__name__}: {exc}"[:300]


def send(db: Session, chat_id: int, *_window) -> int:
    """Sync once and DM the report. A sync already made by an earlier attempt
    whose delivery failed is never made twice — its stored record is sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    if row:
        rep = json.loads(row.value)
    else:
        try:
            rep = run(db)
        except Exception as exc:
            db.rollback()
            try:
                _post("sendMessage", {
                    "chat_id": chat_id,
                    "text": f"Cells × Verifix could not run: {_why(exc)}. Nothing was changed; "
                            "it tries again on the next deploy."})
            except Exception:
                pass
            raise
    chunks, cur = [], ""
    for line in text(rep).split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                              "disable_web_page_preview": "true"})
    stamp = datetime.fromisoformat(rep["at"]).strftime("%d.%m.%Y")
    _post("sendDocument", {"chat_id": chat_id,
                           "caption": "Cells × Verifix — every cell side by side, what was "
                                      "created, archived and renamed, and every other mismatch"},
          files={"document": (f"yacheykalar-verifix-{stamp}.xlsx", build_workbook(rep).getvalue(),
                              "application/vnd.openxmlformats-officedocument."
                              "spreadsheetml.sheet")})
    return len(chunks) + 1
