"""One-off (2026-10-05): EVERY Verifix cell into the register, and a leader
profile for every Verifix leader the platform has none for — connected to its
cell and brigadir only where that is safe. Everything else is reported.

The operator, the day after the first cell and leader passes
(``verifix_cell_sync`` / ``verifix_leader_sync``): «Download every single
cell, and create leader profiles for those leaders who don't have a profile on
our platform. For connecting them, report me mismatches and do not connect not
safe ones yet.» The 4 Oct leader pass created NOBODY: it created a profile
only where it could connect it, and 57 leaders stood where it could not.

CELLS. A cell is what the 4 Oct pass called one — a subdivision with a
``code`` that nobody holds as their DEPARTMENT — PLUS the subdivisions Verifix
gives no code but whose NAME starts with a four-digit number («4711 Зона
отправки», the finished-goods freezers 1711 / 1721 / 1811 / 1821 — the rule
``turnover.unit_code`` already reads them by). Such a name-coded subdivision is
taken only when nothing else can be meant: not a department, no cell standing
under it (a workshop), its four digits are not another cell's code nor the
number another coded cell is named with («0611 Обработка яиц» IS A0061), and —
to be created — open with somebody working there. What is done:

- CREATED: every open Verifix cell the register lacks, the 4 Oct way: no
  brigadir, no leader, out of the загрузка, the Russian name only.
- RENAMED: a cell whose name is not Verifix's (the 4 Oct rule).
- RESTORED: a cell the 4 Oct pass itself archived («Verifix (avtomatik)») that
  Verifix now has open — that pass could not see name-coded cells.
- Only REPORTED: cells Verifix closed or does not have (archive candidates —
  nothing is archived), a cell archived by a PERSON that Verifix has open, codes
  on two subdivisions, name-coded subdivisions left out and why, departments,
  and every subdivision where people work that carries no code at all — those
  can never be cells here (a cell IS its code), Verifix has to give them one.

LEADERS. A Verifix leader is a WORKING employee whose job
``leader_verifix_check.is_leader_job``; profiles are tied to people by
``leader_verifix_check._match``, unchanged. A leader no profile answers for:

- is NOT created when they may already be on the platform — a leader profile
  Verifix could not find with the same surname + first name (either order), or
  with the same first name and a surname this alike, or their cell's own leader
  when Verifix could not find that profile; a brigadir unit, shift-manager,
  top-manager, admin or guest with that name (or the brigadir unit Verifix's
  check tied to this very person); two Verifix leaders with one full name; a
  one-word name. A namesake of a profile Verifix DID tie to somebody else is a
  different person and is created.
- is otherwise CREATED: the Verifix name in the register's spelling, «Lider»
  (source Verifix).
- is CONNECTED — the profile gets the cell's brigadir as its unit and the cell
  as its own — only when the cell is ours, active, has a brigadir, has no leader
  of its own, Verifix places no profile of ours in it and no second
  profileless leader. Anything else leaves the profile with no brigadir and no
  cell, which keeps it out of every roster, digest, checklist and the
  registration picker until a person connects it (the profile page: brigadir +
  cell, one Save) — and the report says, per person, what stood in the way and
  what Verifix suggests.

Existing profiles are not touched; their mismatches with Verifix are listed in
the workbook. Guards stop either half on a cut Verifix answer. The record is
kept in the ``verifix_cells_leaders_2026_10_05`` app setting.

Temporary: delete this module, ``startup.sync_cells_and_leaders_from_verifix``
/ ``_cells_leaders_job`` and the call in BOTH entrypoints once the report has
landed — BEFORE ``verifix_cell_sync``, ``verifix_leader_sync`` and
``leader_verifix_check``, whose helpers it imports. The cells and profiles it
wrote stay.
"""
from __future__ import annotations

import difflib
import html
import json
import re
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Manager, RoleProfile
from app.services import action_log, leader_kind, supervisor_kind, verifix, verifix_explore
from app.services import leader_verifix_check as lv
from app.services import verifix_cell_sync as vcs
from app.services.latin_code import latin_code
from app.services.name_map import _name_tokens
from app.services.verifix_leader_sync import MISSING, _dmy, _missing_text, _profile_name

TZ = ZoneInfo("Asia/Tashkent")
# A boot job, not a request: the employee list is ~18 pages.
READ_BUDGET_S = 420.0
SNAPSHOT_KEY = "verifix_cells_leaders_2026_10_05"

# Below these, Verifix did not hand over the whole tree / staff (1 Oct:
# 539 subdivisions, 8,531 employees, 154 leaders).
MIN_DIVISIONS = 100
MIN_EMPLOYEES = 1000
MIN_LEADERS = 50
# Most of our leader profiles must be found in Verifix (1 Oct copy: 105 of 108).
MIN_FOUND_SHARE = 0.7
# One pass creates no more than this many, unseen (dry run of 4 Oct: ~46 / ~57).
MAX_CELLS = 150
MAX_PROFILES = 150
# The same first name and a surname this alike is possibly one person typed
# twice (the 4 Oct checks' threshold — Sultonova / SULTANOVA = 0.89).
SURNAME_MIN = 0.75
# How far up the tree the brigadir over a cell is looked for.
BRIGADIR_DEPTH = 4

_NAME_CODE = re.compile(r"^\s*(\d{4})(?!\d)")


def _key(code) -> str | None:
    """THE comparison key of a code, ours or Verifix's: Latin, '0028' = '28'."""
    s = latin_code(str(code or "").strip()) or ""
    return verifix._code_key(s) if s else None


def _two_keys(toks: list[str]) -> set[str]:
    """Surname + first name, in both orders (a profile typed first-name-first)."""
    if len(toks) < 2:
        return set()
    return {f"{toks[0]} {toks[1]}", f"{toks[1]} {toks[0]}"}


def _similar(a: list[str], b: list[str]) -> bool:
    """Same first name and a surname at least SURNAME_MIN alike, either order."""
    if len(a) < 2 or len(b) < 2:
        return False
    for sur, first in ((a[0], a[1]), (a[1], a[0])):
        if first == b[1] and difflib.SequenceMatcher(None, sur, b[0]).ratio() >= SURNAME_MIN:
            return True
    return False


# ── reading Verifix ───────────────────────────────────────────────────────────

def _read(db: Session) -> tuple[dict, dict, dict]:
    c = verifix_explore.config(db)
    dl = time.monotonic() + READ_BUDGET_S
    divs, _ = verifix_explore._divisions(c, dl, force=True)
    emps, _ = verifix_explore._employees(c, dl, force=True)
    jobs, _ = verifix_explore._jobs(c, dl, force=True)
    return divs, emps, jobs


# ── which subdivisions are cells ──────────────────────────────────────────────

def cell_nodes(divs: dict, emps: dict, jobs: dict) -> dict:
    """Every Verifix cell, coded or name-coded, keyed by `_key`, and every
    subdivision that is not one — with why."""
    coded, depts, dups = vcs._classify(divs, emps)
    dept_of = Counter(e["div"] for e in emps.values() if e.get("div"))
    working = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W")
    leaders = Counter(e["unit"] for e in emps.values()
                      if e.get("unit") and (e.get("status") or "W") == "W"
                      and lv.is_leader_job((jobs.get(e.get("job") or "") or {}).get("name")))
    children: dict[str, list[str]] = defaultdict(list)
    for d in divs.values():
        if d.get("parent"):
            children[d["parent"]].append(d["id"])

    def node(d: dict, code: str, src: str) -> dict:
        parent = divs.get(d.get("parent") or "") or {}
        return {"id": d["id"], "code": code, "key": _key(code), "src": src,
                "name": d.get("name") or "", "open": (d.get("state") or "A") == "A",
                "parent": d.get("parent"), "parent_name": parent.get("name") or "",
                "closed": d.get("closed"), "workers": working.get(d["id"], 0)}

    nodes: dict[str, dict] = {}
    unsure: dict[str, str] = {}          # subdivision id → why it is no cell
    for n in coded.values():
        n = node(divs[n["id"]], n["code"], "code")
        if n["key"] in nodes:
            dups.append({"code": n["code"], "names": [nodes[n["key"]]["name"], n["name"]]})
        nodes.setdefault(n["key"], n)
    dup_keys = {_key(d["code"]) for d in dups}
    for d in divs.values():
        if d.get("raw_code") and _key(d["raw_code"]) in dup_keys:
            unsure[d["id"]] = "dup"
    for k in dup_keys:
        nodes.pop(k, None)
    # «0611 Обработка яиц» IS A0061 — the number a coded cell is NAMED with.
    named_like = {}
    for n in nodes.values():
        m = _NAME_CODE.match(n["name"])
        if m:
            named_like[m.group(1)] = n["code"]

    skipped: list[dict] = []
    cands: dict[str, list[dict]] = defaultdict(list)
    for d in divs.values():
        if d.get("raw_code"):
            continue
        m = _NAME_CODE.match(d.get("name") or "")
        if not m:
            continue
        n = node(d, m.group(1), "name")
        if dept_of.get(d["id"]):
            skipped.append({**n, "why": "department"})
            continue
        cands[n["code"]].append(n)
    cell_ids = {n["id"] for n in nodes.values()} | {n["id"] for ns in cands.values() for n in ns}
    for code, ns in sorted(cands.items()):
        keep = []
        for n in ns:
            if any(ch in cell_ids for ch in children.get(n["id"], [])):
                skipped.append({**n, "why": "workshop"})
            else:
                keep.append(n)
        if not keep:
            continue
        k = _key(code)
        if k in nodes or k in dup_keys:
            skipped += [{**n, "why": "code_taken", "other": (nodes.get(k) or {}).get("code") or code}
                        for n in keep]
            continue
        if code in named_like:
            skipped += [{**n, "why": "named_like", "other": named_like[code]} for n in keep]
            continue
        open_ = [n for n in keep if n["open"]]
        pick = (keep[0] if len(keep) == 1 else open_[0] if len(open_) == 1
                else keep[0] if not open_ else None)
        if pick is None:
            dups.append({"code": code, "names": [n["name"] for n in open_]})
            dup_keys.add(k)
            unsure.update({n["id"]: "dup" for n in keep})
            continue
        nodes[k] = pick
        unsure.update({n["id"]: "twin" for n in keep if n is not pick})
    for s in skipped:
        unsure[s["id"]] = s["why"]
    node_by_id = {n["id"]: n for n in nodes.values()}
    # Subdivisions people work in that can never be a cell here: no code at all.
    codeless = []
    for d in divs.values():
        if (d["id"] in node_by_id or d["id"] in unsure or dept_of.get(d["id"])
                or d.get("raw_code") or not working.get(d["id"])):
            continue
        parent = divs.get(d.get("parent") or "") or {}
        codeless.append({"id": d["id"], "name": d.get("name") or "",
                         "parent_name": parent.get("name") or "", "workers": working[d["id"]],
                         "leaders": leaders.get(d["id"], 0),
                         "open": (d.get("state") or "A") == "A"})
    return {"nodes": nodes, "by_id": node_by_id, "unsure": unsure, "skipped": skipped,
            "dups": dups, "dup_keys": dup_keys, "depts": depts, "codeless": codeless,
            "dept_ids": set(dept_of)}


def _brigadirs_over(divs: dict, emps: dict, jobs: dict, units_by_vfx: dict):
    """Subdivision id → the Verifix brigadir(s) standing nearest above it, with
    the unit here the 4 Oct supervisor check tied each of them to."""
    by_unit: dict[str, list[dict]] = defaultdict(list)
    for e in emps.values():
        if ((e.get("status") or "W") == "W" and e.get("unit")
                and supervisor_kind.is_supervisor_job((jobs.get(e.get("job") or "") or {}).get("name"))):
            by_unit[e["unit"]].append({"id": e["id"], "name": e.get("name") or "",
                                       "unit": units_by_vfx.get(e["id"])})
    cache: dict[str, list[dict]] = {}

    def over(nid: str | None) -> list[dict]:
        if not nid:
            return []
        if nid not in cache:
            cur, out = nid, []
            for _ in range(BRIGADIR_DEPTH + 1):
                if not cur:
                    break
                if by_unit.get(cur):
                    out = by_unit[cur]
                    break
                cur = (divs.get(cur) or {}).get("parent")
            cache[nid] = out
        return cache[nid]
    return over


def _brig_text(bs: list[dict]) -> str | None:
    if not bs:
        return None
    return "; ".join(f"{b['name']} — " + (f"here {b['unit']}" if b["unit"] else "no unit here")
                     for b in bs[:3])


# ── cells: the plan ───────────────────────────────────────────────────────────

def plan_cells(db: Session, cn: dict, divs: dict, emps: dict, brig) -> dict:
    nodes = cn["nodes"]
    ours = db.query(Cell).order_by(Cell.verifix_code).all()
    units = {m.id: m for m in db.query(Manager).all()}
    lead_ids = {c.leader_id for c in ours if c.leader_id}
    leaders = ({p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
                .filter(RoleProfile.id.in_(lead_ids)).all()} if lead_ids else {})
    our_by_key: dict[str, list[Cell]] = defaultdict(list)
    for c in ours:
        k = _key(c.verifix_code)
        if k:
            our_by_key[k].append(c)

    def uname(mid):
        return units[mid].name if mid in units else None

    # The unit holding ≥ 2/3 of the cells under one Verifix parent (4 Oct rule).
    par_units: dict[str, Counter] = defaultdict(Counter)
    for k, cs in our_by_key.items():
        n = nodes.get(k)
        for c in cs:
            if n and n["open"] and c.archived_at is None and c.manager_id and n["parent"]:
                par_units[n["parent"]][c.manager_id] += 1

    def expected(parent):
        cnt = par_units.get(parent or "")
        if not cnt:
            return None
        top, k = cnt.most_common(1)[0]
        return uname(top) if k * 3 >= sum(cnt.values()) * 2 else None

    created, renamed, restored, archived_open, gone, two_ours, not_created = [], [], [], [], [], [], []
    closed_absent, rows = [], []
    seen: set[int] = set()
    for k, n in sorted(nodes.items(), key=lambda kv: kv[1]["code"]):
        cs = our_by_key.get(k) or []
        bs = brig(n["id"])
        base = {"code": n["code"], "src": n["src"], "vx_name": n["name"],
                "vx_state": "ochiq" if n["open"] else "yopiq", "vx_parent": n["parent_name"],
                "workers": n["workers"], "vx_brigadir": _brig_text(bs)}
        if len(cs) > 1:
            two_ours.append({**base, "ours": ", ".join(c.verifix_code for c in cs)})
            seen.update(c.id for c in cs)
            rows.append({**base, "ours": "ikkita", "name": None, "unit": None, "leader": None,
                         "action": "o'zgartirilmadi (bizda ikkita yacheyka)"})
            continue
        if cs:
            c = cs[0]
            seen.add(c.id)
            action = []
            v = vcs.vx_name(n["name"], n["code"])
            after = vcs._renamed(c, v) if v else None
            before = vcs._names(c)
            if after:
                renamed.append({"id": c.id, "code": c.verifix_code, "unit": uname(c.manager_id),
                                "before": before, "after": after, "vx_name": n["name"]})
                action.append("nomi o'zgardi")
            if c.archived_at is not None and n["open"]:
                item = {"id": c.id, "code": c.verifix_code, "name": vcs._shown(before),
                        "unit": uname(c.manager_id), "workers": n["workers"],
                        "archived_at": c.archived_at.astimezone(TZ).strftime("%d.%m.%Y"),
                        "archived_by": c.archived_by, "vx_name": n["name"]}
                if (c.archived_by or "") == vcs.ARCHIVED_BY:
                    restored.append(item)
                    action.append("arxivdan qaytarildi")
                else:
                    archived_open.append(item)
            if not n["open"] and c.archived_at is None:
                gone.append({"code": c.verifix_code, "name": vcs._shown(before),
                             "unit": uname(c.manager_id), "leader": leaders.get(c.leader_id),
                             "why": "closed", "vx_closed": n["closed"]})
            rows.append({**base, "ours": "arxivda" if c.archived_at else "faol",
                         "name": vcs._shown(before), "unit": uname(c.manager_id),
                         "leader": leaders.get(c.leader_id), "action": ", ".join(action) or "—"})
            continue
        if not n["open"]:
            closed_absent.append({**base})
            rows.append({**base, "ours": "yo'q", "name": None, "unit": None, "leader": None,
                         "action": "Verifixda yopiq — yaratilmadi"})
            continue
        if n["src"] == "name" and not n["workers"]:
            not_created.append({**base, "why": "empty"})
            rows.append({**base, "ours": "yo'q", "name": None, "unit": None, "leader": None,
                         "action": "yaratilmadi (hech kim ishlamaydi)"})
            continue
        created.append({**base, "name": vcs.vx_name(n["name"], n["code"]),
                        "suggest": expected(n["parent"])})
        rows.append({**base, "ours": "yo'q edi", "name": None, "unit": None, "leader": None,
                     "action": "yaratildi"})
    for c in ours:
        if c.id in seen or c.archived_at is not None or _key(c.verifix_code) in cn["dup_keys"]:
            continue
        gone.append({"code": c.verifix_code, "name": vcs._shown(vcs._names(c)),
                     "unit": uname(c.manager_id), "leader": leaders.get(c.leader_id),
                     "why": "missing", "vx_closed": None})

    refused = None
    if len(divs) < MIN_DIVISIONS or len(emps) < MIN_EMPLOYEES:
        refused = (f"Verifix handed over only {len(divs)} subdivisions and {len(emps)} employees "
                   f"(expected at least {MIN_DIVISIONS} and {MIN_EMPLOYEES}) — a cut answer.")
    elif len(created) > MAX_CELLS:
        refused = f"it would create {len(created)} cells at once — too many to do unseen."
    rows.sort(key=lambda r: r["code"])
    return {
        "applied": False, "refused": refused,
        "vx": {"cells": len(nodes), "coded": sum(1 for n in nodes.values() if n["src"] == "code"),
               "named": sum(1 for n in nodes.values() if n["src"] == "name"),
               "open": sum(1 for n in nodes.values() if n["open"])},
        "ours_before": {"total": len(ours), "active": sum(1 for c in ours if c.archived_at is None)},
        "created": created, "renamed": renamed, "restored": restored,
        "archived_open": archived_open, "gone": gone, "two_ours": two_ours,
        "not_created": not_created, "closed_absent": closed_absent,
        "skipped": [{"code": s["code"], "vx_name": s["name"], "vx_parent": s["parent_name"],
                     "workers": s["workers"], "why": s["why"], "other": s.get("other")}
                    for s in cn["skipped"]],
        "dups": cn["dups"],
        "departments": sorted(({"code": d["code"], "name": d["name"], "people": d["people"],
                                "open": d["open"]} for d in cn["depts"]), key=lambda d: d["code"]),
        "codeless": sorted(cn["codeless"], key=lambda d: (-d["workers"], d["name"])),
        "rows": rows,
    }


def apply_cells(db: Session, rep: dict) -> None:
    ids = [r["id"] for r in rep["renamed"]] + [r["id"] for r in rep["restored"]]
    by_id = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(ids)).all()} if ids else {}
    for r in rep["renamed"]:
        c, a = by_id[r["id"]], r["after"]
        c.name_workshop_ru = a["ru"]
        c.name_workshop_uz_cyrl = a["uz_cyrl"]
        c.name_workshop_uz = a["uz"]
        c.name_workshop_en = a["en"]
    for r in rep["restored"]:
        c = by_id[r["id"]]
        if (c.archived_by or "") == vcs.ARCHIVED_BY:
            c.archived_at = None
            c.archived_by = None
    for k in rep["created"]:
        cell = Cell(verifix_code=latin_code(k["code"]), name_workshop_ru=k["name"],
                    manager_id=None, leader_id=None, in_load=False)
        db.add(cell)
        db.flush()
        k["id"] = cell.id


# ── leaders: the plan ─────────────────────────────────────────────────────────

# Why a Verifix leader got NO profile — they may already be on the platform.
SKIP = {
    "short_name": ("their Verifix name is one word — too short to be sure",
                   "Verifixdagi ism to'liq emas"),
    "other_role": ("the platform already has them, in another role",
                   "Platformada boshqa rolda bor"),
    "same_name": ("a leader profile with the same surname + first name exists and Verifix "
                  "could not tie it to anybody — may be them", "Shu familiya-ismli profil bor"),
    "similar": ("a leader profile Verifix could not find has the same first name and a "
                "surname this alike — may be them", "O'xshash ismli profil bor"),
    "cell_leader": ("their cell's leader here is a profile Verifix could not find — may be them",
                    "Yacheykaning lideri — Verifixda topilmagan profil"),
    "same_vx_name": ("two Verifix leaders with no profile share this full name",
                     "Verifixda shu ismli ikki lider"),
    "name_exists": ("a profile with this exact name already exists there",
                    "Aynan shu ismli profil bor"),
}
# Why a created profile was NOT connected — (the DM's words, the workbook's,
# what a person does about it).
HOLD = {
    "no_brigadir": ("their cell has no brigadir here", "Yacheykada brigadir yo'q",
                    "give the cell its brigadir on /cells, then the profile its brigadir + cell"),
    "has_leader": ("their cell already has another leader here", "Yacheykaning boshqa lideri bor",
                   "say which of the two leads the cell"),
    "profile_there": ("Verifix also places one of our leader profiles in that cell",
                      "Verifix shu yacheykaga bizdagi boshqa profilni ham qo'ygan",
                      "say which of them leads the cell"),
    "two_leaders": ("two leaders with no profile stand in one cell",
                    "Bitta yacheykada ikki profilsiz lider", "say which of them leads the cell"),
    "cell_archived": ("their cell is archived here", "Yacheyka arxivda",
                      "restore the cell on /cells if it works again"),
    "cell_missing": ("their cell is not on the platform (closed in Verifix, or left out — see "
                     "the cells part)", "Yacheyka platformada yo'q", "see the cells part"),
    "cell_unsure": ("their subdivision's code is ambiguous in Verifix", "Bo'lim kodi noaniq",
                    "see the cells part"),
    "department": ("they stand in a department, not a cell", "Bo'lim (departament), yacheyka emas",
                   "move them to their cell in Verifix, or pick it on the profile"),
    "no_code": ("their subdivision has no code in Verifix, so it is no cell here",
                "Verifixda bo'lim kodi yo'q", "give the subdivision a code in Verifix"),
    "no_unit": ("Verifix places them in no subdivision", "Verifixda bo'limi yo'q",
                "pick the cell on the profile"),
}
_HOLD_ORDER = list(HOLD)


def _people(divs: dict, emps: dict, jobs: dict, cn: dict) -> list[dict]:
    """Every Verifix employee, any status, placed in a cell by the rule above."""
    out = []
    for e in emps.values():
        uid = e.get("unit") or ""
        d = divs.get(uid) or {}
        n = cn["by_id"].get(uid)
        if n:
            where, cell, cell_raw = "cell", n["key"], n["code"]
        elif not uid:
            where, cell, cell_raw = "none", None, None
        elif uid in cn["dept_ids"]:
            where, cell, cell_raw = "dept", None, d.get("raw_code")
        elif uid in cn["unsure"]:
            where, cell, cell_raw = "unsure", None, d.get("raw_code")
        else:
            where, cell, cell_raw = "codeless", None, None
        toks = _name_tokens(e.get("name") or "")
        out.append({
            "id": e["id"], "name": e.get("name") or "", "status": e.get("status") or "W",
            "job": (jobs.get(e.get("job") or "") or {}).get("name") or "",
            "unit_id": uid, "unit_name": d.get("name") or "", "where": where,
            "cell": cell, "cell_raw": cell_raw, "dismissed": e.get("dismissed"),
            "hired": e.get("hired"), "toks": toks, "full": " ".join(toks),
            "two": " ".join(toks[:2]),
        })
    return out


def _who(x: dict) -> dict:
    return {"id": x["id"], "name": x["name"], "job": x["job"], "status": x["status"],
            "cell": x["cell_raw"], "unit_name": x["unit_name"], "dismissed": x["dismissed"],
            "hired": x.get("hired")}


def plan_leaders(db: Session, people: list[dict], brig) -> dict:
    working_rows = [p for p in people if p["status"] == "W"]
    working = lv._index(working_rows)
    gone = lv._index([p for p in people if p["status"] != "W"])
    vx_leaders = [p for p in working_rows if lv.is_leader_job(p["job"])]

    units = {m.id: m for m in db.query(Manager).all()}
    by_key: dict[str, Cell] = {}
    for c in db.query(Cell).all():
        k = _key(c.verifix_code)
        if k:
            by_key[k] = c
    own: dict[int, set] = defaultdict(set)
    unit_cells: dict[int, set] = defaultdict(set)
    for k, c in by_key.items():
        if c.leader_id:
            own[c.leader_id].add(k)
        if c.manager_id:
            unit_cells[c.manager_id].add(k)
    profiles = (db.query(RoleProfile).filter(RoleProfile.role == "leader")
                .order_by(RoleProfile.name).all())
    pname = {p.id: p.name for p in profiles}

    def uname(mid):
        return units[mid].name if mid in units else None

    # ── every existing profile beside its Verifix person (reported only) ──
    rows: list[dict] = []
    placed: dict[str, list[str]] = defaultdict(list)
    for prof in profiles:
        toks = _name_tokens(prof.name)
        m = lv._match(toks, own.get(prof.id, set()), unit_cells.get(prof.manager_id, set()),
                      working, gone, working_rows)
        e = m.get("emp")
        mine = own.get(prof.id, set())
        r = {"id": prof.id, "name": prof.name, "toks": toks, "unit": uname(prof.manager_id),
             "cells": sorted(by_key[k].verifix_code for k in mine),
             "archived_cells": sorted(by_key[k].verifix_code for k in mine if by_key[k].archived_at),
             "how": m.get("how"), "reason": m.get("reason"), "emp": _who(e) if e else None,
             "cands": [_who(x) for x in (m.get("cands") or [])][:4]}
        if e:
            vk = e["cell"]
            vc = by_key.get(vk) if vk else None
            r["vx_leader"] = lv.is_leader_job(e["job"])
            r["vx_cell"] = vc.verifix_code if vc else None
            r["vx_cell_unit"] = uname(vc.manager_id) if vc and vc.manager_id else None
            r["spelled"] = not (m.get("how") or "").startswith("full")
            r["cell_diff"] = (vk not in mine) if vk else bool(mine)
            r["unit_diff"] = bool(vc and vc.manager_id and vc.manager_id != prof.manager_id)
            if vk:
                placed[vk].append(prof.name)
        rows.append(r)
    matched = Counter(r["emp"]["id"] for r in rows if r["emp"])
    for r in rows:
        r["shared"] = bool(r["emp"] and matched[r["emp"]["id"]] > 1)
    unfound = [r for r in rows if not r["emp"]]
    unfound_ids = {r["id"] for r in unfound}
    unfound_two: dict[str, list[str]] = defaultdict(list)
    found_two: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        for k in _two_keys(r["toks"]):
            (found_two if r["emp"] else unfound_two)[k].append(r["name"])

    # ── who else is on the platform under that name ──
    others: dict[str, list[str]] = defaultdict(list)
    units_by_vfx: dict[str, str] = {}
    for m in units.values():
        for k in _two_keys(_name_tokens(m.name)):
            others[k].append(f"brigadir unit «{m.name}»" + (" (archived)" if m.archived else ""))
        vid = ((m.supervisor_kind_meta or {}).get("vfx") or {}).get("id")
        if vid:
            units_by_vfx[str(vid)] = m.name
    for p in (db.query(RoleProfile).filter(RoleProfile.role != "leader").all()):
        for k in _two_keys(_name_tokens(p.name)):
            others[k].append(f"{p.role} «{p.name}»")

    orphans = [p for p in vx_leaders if p["id"] not in matched]
    per_cell = Counter(p["cell"] for p in orphans if p["cell"])
    full_count = Counter(p["full"] for p in orphans if len(p["toks"]) >= 2)
    taken = {(p.name, p.manager_id) for p in profiles}

    created, skipped = [], []
    for p in sorted(orphans, key=lambda p: (p["cell_raw"] or "~", p["name"])):
        c = by_key.get(p["cell"]) if p["cell"] else None
        bs = brig(p["unit_id"])
        item = {**_who(p), "where": p["where"],
                "cell": c.verifix_code if c else p["cell_raw"],
                "unit": uname(c.manager_id) if c and c.manager_id else None,
                "cell_leader": pname.get(c.leader_id) if c and c.leader_id else None,
                "there": list(placed.get(p["cell"]) or []) if p["cell"] else [],
                "vx_brigadir": _brig_text(bs)}
        keys = _two_keys(p["toks"])
        why, who = None, None
        if len(p["toks"]) < 2:
            why = "short_name"
        elif units_by_vfx.get(p["id"]):
            why, who = "other_role", f"brigadir unit «{units_by_vfx[p['id']]}» (Verifix ties it to them)"
        elif any(others.get(k) for k in keys):
            why, who = "other_role", "; ".join(sorted({x for k in keys for x in others.get(k, [])}))
        elif any(unfound_two.get(k) for k in keys):
            why, who = "same_name", ", ".join(sorted({x for k in keys for x in unfound_two.get(k, [])}))
        elif full_count[p["full"]] > 1:
            why = "same_vx_name"
        elif c is not None and c.leader_id in unfound_ids:
            why, who = "cell_leader", pname.get(c.leader_id)
        else:
            sim = [r["name"] for r in unfound if _similar(r["toks"], p["toks"])]
            if sim:
                why, who = "similar", ", ".join(sim)
        if why:
            skipped.append({**item, "reason": why, "who": who})
            continue

        hold = None
        if p["where"] != "cell":
            hold = {"none": "no_unit", "dept": "department", "codeless": "no_code",
                    "unsure": "cell_unsure"}[p["where"]]
        elif c is None:
            hold = "cell_missing"
        elif c.archived_at:
            hold = "cell_archived"
        elif not c.manager_id or c.manager_id not in units or units[c.manager_id].archived:
            hold = "no_brigadir"
        elif c.leader_id:
            hold = "has_leader"
        elif item["there"]:
            hold = "profile_there"
        elif per_cell[p["cell"]] > 1:
            hold = "two_leaders"
        unit_id = c.manager_id if hold is None else None
        new_name = _profile_name(p["name"])
        if (new_name, unit_id) in taken:
            skipped.append({**item, "reason": "name_exists", "who": new_name})
            continue
        taken.add((new_name, unit_id))
        namesakes = sorted({x for k in keys for x in found_two.get(k, [])})
        created.append({**item, "new_name": new_name, "hold": hold, "connected": hold is None,
                        "namesake": ", ".join(namesakes) or None,
                        "unit_id": unit_id, "cell_id": c.id if c is not None and hold is None else None,
                        "unit": uname(unit_id) if hold is None else item["unit"]})

    found = sum(1 for r in rows if r["emp"])
    refused = None
    if len(people) < MIN_EMPLOYEES or len(vx_leaders) < MIN_LEADERS:
        refused = (f"Verifix handed over only {len(people)} employees and {len(vx_leaders)} "
                   f"leaders (expected at least {MIN_EMPLOYEES} and {MIN_LEADERS}) — a cut answer.")
    elif profiles and found < MIN_FOUND_SHARE * len(profiles):
        refused = (f"only {found} of our {len(profiles)} leader profiles were found in Verifix — "
                   "that reads like a broken answer.")
    elif len(created) > MAX_PROFILES:
        refused = f"it would create {len(created)} profiles at once — too many to do unseen."
    for r in rows:
        r.pop("toks", None)
    return {
        "applied": False, "refused": refused,
        "vx": {"working": len(working_rows), "leaders": len(vx_leaders),
               "with_profile": len(vx_leaders) - len(orphans), "orphans": len(orphans)},
        "profiles": len(profiles), "found": found,
        "created": created, "skipped": skipped, "rows": rows,
    }


def apply_leaders(db: Session, rep: dict) -> None:
    at = leader_kind.now_iso()
    for it in rep["created"]:
        prof = RoleProfile(
            role="leader", name=it["new_name"], manager_id=it["unit_id"], leader_kind="leader",
            leader_kind_meta={"src": "verifix", "at": at, "by": "Verifix",
                              "vfx": {"checked_at": at, "found": True, "id": it["id"],
                                      "name": it["name"], "job": it["job"] or None,
                                      "cell": it["cell"], "status": it["status"],
                                      "how": "created"}})
        db.add(prof)
        db.flush()
        it["profile_id"] = prof.id
        if it["connected"]:
            cell = db.query(Cell).filter_by(id=it["cell_id"]).first()
            if cell is not None and cell.leader_id is None:
                cell.leader_id = prof.id
            else:   # somebody got there first — never take a cell from a leader
                prof.manager_id = None
                it.update(connected=False, hold="has_leader", unit_id=None)


# ── the run ───────────────────────────────────────────────────────────────────

def run(db: Session, data: tuple | None = None) -> dict:
    """Read Verifix, plan and apply both halves (each unless its guard refuses),
    keep the record. ``data`` = (divs, emps, jobs) skips the read (a test)."""
    divs, emps, jobs = data or _read(db)
    cn = cell_nodes(divs, emps, jobs)
    units_by_vfx = {}
    for m in db.query(Manager).all():
        vid = ((m.supervisor_kind_meta or {}).get("vfx") or {}).get("id")
        if vid:
            units_by_vfx[str(vid)] = m.name
    brig = _brigadirs_over(divs, emps, jobs, units_by_vfx)
    cells = plan_cells(db, cn, divs, emps, brig)
    if not cells["refused"]:
        apply_cells(db, cells)
        db.flush()
        cells["applied"] = True
    leaders = plan_leaders(db, _people(divs, emps, jobs, cn), brig)
    if not leaders["refused"]:
        apply_leaders(db, leaders)
        leaders["applied"] = True
    rep = {"at": datetime.now(TZ).isoformat(timespec="minutes"),
           "vx": {"divisions": len(divs), "employees": len(emps),
                  "working": sum(1 for e in emps.values() if (e.get("status") or "W") == "W")},
           "cells": cells, "leaders": leaders}
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    value = json.dumps(rep, ensure_ascii=False, default=str)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SNAPSHOT_KEY, value=value))
    db.commit()
    action_log.record_system(
        "org", "org.cells_verifix_sync", db=db,
        outcome="done" if cells["applied"] else "refused",
        details=[("cells", cells["vx"]["cells"]), ("added", len(cells["created"])),
                 ("changed", len(cells["renamed"])), ("restored", len(cells["restored"]))],
        reason=cells["refused"],
    )
    action_log.record_system(
        "identity", "identity.leaders_verifix_sync", db=db,
        outcome="done" if leaders["applied"] else "refused",
        details=[("count", leaders["profiles"]), ("added", len(leaders["created"])),
                 ("connected", sum(1 for x in leaders["created"] if x["connected"])),
                 ("skipped", len(leaders["skipped"]))],
        reason=leaders["refused"],
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


_SKIPPED_CELL = {
    "department": "a department (people hold it as theirs)",
    "workshop": "a workshop — cells stand under it",
    "code_taken": "its number is already another cell's code",
    "named_like": "a coded cell is named with the same number",
}


def _src(k: dict) -> str:
    return " (code from its name)" if k.get("src") == "name" else ""


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    C, Ld = rep["cells"], rep["leaders"]
    cd, ld = C["applied"], Ld["applied"]
    L = [f"<b>Cells and leaders × Verifix</b> · {at:%d.%m.%Y %H:%M}",
         f"Read from Verifix's API: {rep['vx']['divisions']} subdivisions, "
         f"{rep['vx']['working']:,} working employees. Nothing was deleted or archived.", ""]

    # ── cells ──
    v = C["vx"]
    L.append(f"<b>🧱 Cells</b> — Verifix has <b>{v['cells']}</b> ({v['open']} open): {v['coded']} "
             f"with a code, <b>{v['named']}</b> whose code is only the number their NAME starts "
             "with (dispatch zones, freezers …) — the 4 Oct pass could not see those.")
    if not cd:
        L.append(f"⚠ Cells stopped: {_e(C['refused'])} — nothing about cells was written.")
    L.append(f"➕ {'Created' if cd else 'Would create'} — <b>{len(C['created'])}</b> (no brigadir, "
             "no leader, not in the загрузка — give each its brigadir on /cells)")
    for k in C["created"]:
        hint = []
        if k.get("vx_brigadir"):
            hint.append(f"Verifix brigadir: {k['vx_brigadir']}")
        if k.get("suggest"):
            hint.append(f"its sibling cells here are {k['suggest']}'s")
        L.append(f"  {_e(k['code'])} — {_e(k['name'] or '(no name)')}{_src(k)} — "
                 f"«{_e(k['vx_parent'] or '—')}» · {k['workers']} working"
                 + (f" · {_e('; '.join(hint))}" if hint else ""))
    if C["restored"]:
        L.append(f"♻️ Restored from the archive — {len(C['restored'])} (the 4 Oct pass archived them "
                 "as «not in Verifix»; Verifix has them open): "
                 + ", ".join(_e(r["code"]) for r in C["restored"]))
    L.append(f"✏️ {'Renamed' if cd else 'To rename'} to the Verifix name — {len(C['renamed'])}"
             + (": " + "; ".join(f"{_e(r['code'])} → {_e(r['after']['ru'])}" for r in C["renamed"][:20])
                + (" …" if len(C["renamed"]) > 20 else "") if C["renamed"] else ""))
    L.append("")
    L.append("<i>Not changed — for you to look at</i>")
    if C["gone"]:
        closed = sum(1 for g in C["gone"] if g["why"] == "closed")
        L.append(f"🗄 Active here, closed in Verifix ({closed}) or not in Verifix at all "
                 f"({len(C['gone']) - closed}) — archive candidates, NOT archived: "
                 + ", ".join(_e(g["code"]) for g in C["gone"]))
    if C["archived_open"]:
        L.append("🗃 Archived here by a person, open in Verifix: " + "; ".join(
            f"{_e(a['code'])} ({a['workers']} working)" for a in C["archived_open"]))
    if C["not_created"]:
        L.append("🚫 Name-coded, open, but nobody works there — not created: "
                 + ", ".join(f"{_e(k['code'])} «{_e(k['vx_name'])}»" for k in C["not_created"]))
    if C["skipped"]:
        L.append("🔢 Subdivisions whose name starts with a number, not taken as cells: " + "; ".join(
            f"«{_e(s['vx_name'])}» — {_SKIPPED_CELL.get(s['why'], s['why'])}"
            + (f" ({_e(s['other'])})" if s.get("other") and s["why"] in ("code_taken", "named_like") else "")
            for s in C["skipped"]))
    if C["dups"]:
        L.append("⚠ One code on two Verifix cells (left alone): " + "; ".join(
            f"{_e(d['code'])}: {_e(' / '.join(d['names']))}" for d in C["dups"]))
    if C["two_ours"]:
        L.append("⚠ Two cells here for one Verifix code (left alone): " + "; ".join(
            f"{_e(t['code'])}: {_e(t['ours'])}" for t in C["two_ours"]))
    if C["closed_absent"]:
        L.append(f"⛔ Closed in Verifix, never here — {len(C['closed_absent'])} (nothing to do)")
    if C["codeless"]:
        with_l = [d for d in C["codeless"] if d["leaders"]]
        L.append(f"❓ Subdivisions where people work that carry NO code at all — "
                 f"{len(C['codeless'])} (offices and workshops included; all in the workbook). A "
                 "cell here IS its code, so none of them can be a cell until Verifix gives it one."
                 + (" Leaders stand in: " + "; ".join(
                     f"«{_e(d['name'])}» ({d['leaders']} leader{'s' if d['leaders'] > 1 else ''}, "
                     f"{d['workers']} working)" for d in with_l) if with_l else ""))
    L.append("")

    # ── leaders ──
    lv_ = Ld["vx"]
    created, skipped = Ld["created"], Ld["skipped"]
    conn = [x for x in created if x["connected"]]
    held = [x for x in created if not x["connected"]]
    L.append(f"<b>👤 Leaders</b> — Verifix has <b>{lv_['leaders']}</b> working leaders; "
             f"{lv_['with_profile']} already have a profile here, <b>{lv_['orphans']}</b> do not.")
    if not ld:
        L.append(f"⚠ Leaders stopped: {_e(Ld['refused'])} — no profile was created.")
    L.append(f"➕ {'Created' if ld else 'Would create'} — <b>{len(created)}</b> leader profiles "
             "(«Lider», source Verifix).")
    L.append(f"🔗 {'Connected' if ld else 'Would connect'} — <b>{len(conn)}</b>: their cell is ours, "
             "has a brigadir, no leader of its own, and nobody else claims it. Each got that cell "
             "and its brigadir; they are on the brigadir's roster from now (the day digest lists "
             "them «not filed» until they register in the bot).")
    for x in conn:
        L.append(f"  {_e(x['cell'])} — <b>{_e(x['new_name'])}</b> — {_e(x['unit'])}"
                 + (f" · namesake of profile {_e(x['namesake'])} (another Verifix person)"
                    if x.get("namesake") else ""))
    L.append(f"⛔ NOT connected — <b>{len(held)}</b>: created with no brigadir and no cell, so they "
             "are on nobody's roster and not in the registration picker yet. To connect one: open "
             "the profile, pick its brigadir and cell, Save.")
    groups: dict[str, list] = defaultdict(list)
    for x in held:
        groups[x["hold"]].append(x)
    for h in sorted(groups, key=lambda k: (-len(groups[k]), _HOLD_ORDER.index(k))):
        L.append(f"<i>{HOLD[h][0]} — {len(groups[h])}</i> ({_e(HOLD[h][2])}):")
        for x in groups[h]:
            where = _e(x["cell"]) if x["cell"] else f"«{_e(x['unit_name'] or '—')}»"
            extra = []
            if h == "has_leader":
                extra.append(f"here the leader is {x['cell_leader']}")
            elif h == "profile_there":
                extra.append("Verifix also places " + ", ".join(x["there"]))
            elif x.get("unit"):
                extra.append(x["unit"])
            if h in ("no_brigadir", "cell_missing", "no_code", "department") and x.get("vx_brigadir"):
                extra.append(f"Verifix brigadir: {x['vx_brigadir']}")
            if x.get("namesake"):
                extra.append(f"namesake of profile {x['namesake']} (another Verifix person)")
            L.append(f"  {where} — {_e(x['new_name'])} «{_e(x['job'])}»"
                     + (f" · {_e(' · '.join(extra))}" if extra else ""))
    L.append("")
    if skipped:
        L.append(f"<b>🤔 NOT created — {len(skipped)}</b> (they may already be on the platform — "
                 "tell me who they are and I'll tie or create them)")
        for s in skipped:
            where = _e(s["cell"]) if s["cell"] else f"«{_e(s['unit_name'] or '—')}»"
            L.append(f"  {where} — {_e(s['name'])} «{_e(s['job'])}» — {SKIP[s['reason']][0]}"
                     + (f": {_e(s['who'])}" if s.get("who") else ""))
        L.append("")

    rows = Ld["rows"]
    missing = [r for r in rows if not r["emp"]]
    counts = [
        ("not in Verifix", len(missing)),
        ("Verifix job is not a leader's", sum(1 for r in rows if r["emp"] and not r["vx_leader"])),
        ("name spelled differently", sum(1 for r in rows if r["emp"] and r["spelled"])),
        ("Verifix places them in another cell", sum(1 for r in rows if r["emp"] and r["cell_diff"])),
        ("their Verifix cell is another brigadir's here",
         sum(1 for r in rows if r["emp"] and r["unit_diff"])),
        ("own an archived cell", sum(1 for r in rows if r["archived_cells"])),
        ("one Verifix person for two profiles", sum(1 for r in rows if r["shared"])),
    ]
    L.append(f"<b>📋 The {Ld['profiles']} existing leader profiles × Verifix</b> (nothing changed): "
             + " · ".join(f"{w} {n}" for w, n in counts if n) + ".")
    if missing:
        L.append("Not in Verifix: " + "; ".join(
            f"{_e(r['name'])} ({_e(_missing_text(r))})" for r in missing))
    L.append("Every cell and every profile side by side with Verifix is in the attached workbook.")
    return "\n".join(L).strip()


def build_workbook(rep: dict) -> BytesIO:
    C, Ld = rep["cells"], rep["leaders"]
    wb = Workbook()
    wb.remove(wb.active)
    src = {"code": "kod maydoni", "name": "nomidan"}
    lv._sheet(wb, "Yacheykalar", [
        "Kod", "Kod qayerdan", "Verifix nomi", "Verifixda", "Verifix bo'limi",
        "Verifixda ishlayotganlar", "Bizda", "Bizdagi nomi (oldin)", "Brigadir", "Lider",
        "Verifix brigadiri", "Natija"],
        [[r["code"], src.get(r["src"]), r["vx_name"], r["vx_state"], r["vx_parent"], r["workers"],
          r["ours"], r["name"], r["unit"], r["leader"], r["vx_brigadir"], r["action"]]
         for r in C["rows"]])
    lv._sheet(wb, "Yangi yacheykalar", [
        "Kod", "Kod qayerdan", "Nomi", "Verifix nomi", "Verifix bo'limi", "Ishlayotganlar",
        "Verifix brigadiri", "Shu bo'limdagi yacheykalar brigadiri"],
        [[k["code"], src.get(k["src"]), k["name"], k["vx_name"], k["vx_parent"], k["workers"],
          k["vx_brigadir"], k["suggest"]] for k in C["created"]])
    held_words = {h: HOLD[h][1] for h in HOLD}
    lv._sheet(wb, "Yangi liderlar", [
        "Profil", "Verifix ismi", "Lavozim", "Yacheyka", "Verifix bo'limi", "Ulandi",
        "Brigadir", "Ulanmadi — sabab", "Nima qilish kerak", "Yacheykaning bizdagi lideri",
        "Verifix shu yacheykaga qo'ygan profillar", "Verifix brigadiri", "Adash profil",
        "Ishga kirgan"],
        [[x["new_name"], x["name"], x["job"], x["cell"], x["unit_name"],
          "ha" if x["connected"] else "yo'q", x["unit"],
          held_words.get(x["hold"]) if x["hold"] else None,
          HOLD[x["hold"]][2] if x["hold"] else None, x["cell_leader"], ", ".join(x["there"]),
          x["vx_brigadir"], x.get("namesake"), _dmy(x["hired"])] for x in Ld["created"]])
    lv._sheet(wb, "Yaratilmagan liderlar", [
        "Verifix ismi", "Lavozim", "Yacheyka", "Verifix bo'limi", "Sabab", "Kim bo'lishi mumkin",
        "Ishga kirgan"],
        [[s["name"], s["job"], s["cell"], s["unit_name"], SKIP[s["reason"]][1], s.get("who"),
          _dmy(s["hired"])] for s in Ld["skipped"]])
    lv._sheet(wb, "Mavjud profillar", [
        "Profil", "Brigadir", "Yacheykalari", "Natija", "Verifix ismi", "Verifix lavozimi",
        "Verifix yacheykasi", "Verifix bo'limi", "Verifix holati", "Qanday topildi",
        "Lavozim lider emas", "Ism farqi", "Yacheyka farqi", "Brigadir farqi", "Arxivdagi yacheyka"],
        [[r["name"], r["unit"], ", ".join(r["cells"]),
          "topildi" if r["emp"] else MISSING.get(r["reason"], (r["reason"], r["reason"]))[1],
          (r["emp"] or {}).get("name"), (r["emp"] or {}).get("job"),
          r.get("vx_cell") or (r["emp"] or {}).get("cell"), (r["emp"] or {}).get("unit_name"),
          (r["emp"] or {}).get("status"), r["how"],
          "ha" if r["emp"] and not r["vx_leader"] else "",
          "ha" if r["emp"] and r["spelled"] else "",
          "ha" if r["emp"] and r["cell_diff"] else "",
          r["vx_cell_unit"] if r["emp"] and r["unit_diff"] else "",
          ", ".join(r["archived_cells"])] for r in Ld["rows"]])
    lv._sheet(wb, "Kodsiz bo'limlar", ["Bo'lim", "Yuqori bo'lim", "Ishlayotganlar", "Liderlar",
                                       "Ochiq"],
              [[d["name"], d["parent_name"], d["workers"], d["leaders"], "ha" if d["open"] else "yo'q"]
               for d in C["codeless"]])
    other = (
        [["Bizda faol, Verifixda yopiq" if g["why"] == "closed" else "Bizda faol, Verifixda yo'q",
          g["code"], g["name"], ", ".join(x for x in (g["unit"], g["leader"]) if x)] for g in C["gone"]]
        + [["Odam arxivlagan, Verifixda ochiq", a["code"], a["name"],
            f"{a['archived_at']} · {a['archived_by'] or '—'} · {a['workers']} kishi"]
           for a in C["archived_open"]]
        + [["Arxivdan qaytarildi", a["code"], a["name"], f"arxivlangan {a['archived_at']}"]
           for a in C["restored"]]
        + [["Nomi raqamli, hech kim ishlamaydi", k["code"], k["vx_name"], k["vx_parent"]]
           for k in C["not_created"]]
        + [["Nomi raqamli, yacheyka emas", s["code"], s["vx_name"],
            _SKIPPED_CELL.get(s["why"], s["why"]) + (f" ({s['other']})" if s.get("other") else "")]
           for s in C["skipped"]]
        + [["Verifixda bitta kod ikki yacheykada", d["code"], " / ".join(d["names"]), None]
           for d in C["dups"]]
        + [["Bizda bitta kodga ikki yacheyka", t["code"], t["vx_name"], t["ours"]]
           for t in C["two_ours"]]
        + [["Kodli bo'lim (yacheyka emas)", d["code"], d["name"],
            f"{d['people']} xodim" + ("" if d["open"] else " · yopiq")] for d in C["departments"]]
        + [["Verifixda yopiq, bizda bo'lmagan", k["code"], k["vx_name"], k["vx_parent"]]
           for k in C["closed_absent"]]
    )
    lv._sheet(wb, "Yacheyka farqlari", ["Turi", "Kod", "Nomi", "Izoh"], other)
    lv._sheet(wb, "Nomi o'zgardi", ["Kod", "Brigadir", "Eski (ru)", "Eski (uz_cyrl)", "Eski (uz)",
                                    "Eski (en)", "Yangi", "Verifix to'liq nomi"],
              [[r["code"], r["unit"], r["before"]["ru"], r["before"]["uz_cyrl"], r["before"]["uz"],
                r["before"]["en"], r["after"]["ru"], r["vx_name"]] for r in C["renamed"]])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── delivery ──────────────────────────────────────────────────────────────────

def send(db: Session, chat_id: int, *_window) -> int:
    """Run once and DM the report. A run already made by an earlier attempt
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
                lv._post("sendMessage", {
                    "chat_id": chat_id,
                    "text": f"Cells and leaders × Verifix could not run: {lv._why(exc)}. Nothing "
                            "was changed; it tries again on the next deploy."})
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
        lv._post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
    stamp = datetime.fromisoformat(rep["at"]).strftime("%d.%m.%Y")
    lv._post("sendDocument", {"chat_id": chat_id,
                              "caption": "Cells and leaders × Verifix — every cell and leader "
                                         "profile side by side with Verifix, what was created and "
                                         "connected, and every mismatch"},
             files={"document": (f"yacheykalar-liderlar-verifix-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
