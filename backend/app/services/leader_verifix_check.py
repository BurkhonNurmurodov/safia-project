"""One-off (2026-10-04): which leader profiles ARE leaders on Verifix, and which
do a leader's work while Verifix lists them under another job.

The operator asked for a switch on every leader profile («Lider» / «Lider
o'rnida» — ``role_profiles.leader_kind``, see ``services/leader_kind.py``), for
it to be filled from Verifix's API — explicitly the API, not the attendance
files — and for the result to be reported to them in Telegram. Production's
Verifix login lives only on the server, so this runs there once, at boot.

It reads ``core/employee$list`` (every status), ``core/job$list`` and
``core/division$list`` through ``verifix_explore``'s own loaders, so a person
reads here exactly as on the «Verifix (test)» pages. A profile is matched to ONE
Verifix employee by NAME, strictly:

1. the folded full name (``name_map._name_tokens``), among WORKING employees;
2. else surname + first name, among working employees — refused when both
   sides carry a patronymic and the two plainly differ (a namesake);
3. several hits → the one standing in one of the leader's own cells (a Verifix
   org unit's ``code`` IS our cell code), then in a cell of the leader's unit;
   still several → ambiguous, nothing saved.

No fuzzy match is ever SAVED: on the 11 Sep copy the scorer paired «Inomova
Saydora» with «Inomova Dildora». Near names are only listed as hints.

The matched employee's JOB decides: a title naming a leader («Лидер»,
«Лидер/крем-тесто», «Старший лидер») → ``leader``; any other job, an assistant
or an «и.о.» included → ``acting``. Not found, ambiguous or not working →
left undetermined and listed for a person to set by hand on the profile page.

A value already set by hand is never overwritten — what Verifix says is still
recorded beside it, and a disagreement is named in the report.

Temporary: delete this module, ``startup.check_leader_kinds`` /
``_leader_kind_job`` and the call in BOTH entrypoints once it has been sent.
``services/leader_kind.py`` and the two columns STAY — they are the feature.
"""
from __future__ import annotations

import difflib
import html
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

import requests
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Font
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell, Manager, RoleProfile
from app.services import action_log, leader_kind, verifix, verifix_explore
from app.services.name_map import _name_tokens, _pair_score

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
# A boot job, not a request: the whole employee list is ~18 pages.
READ_BUDGET_S = 420.0
HINT_MIN_SCORE = 0.8
HINTS = 3
# Below this the two patronymics are different names, not two spellings.
PATRONYMIC_MIN = 0.6
# A surname this alike, in the leader's own cell, with the same first name, is
# one person typed two ways (see `_near`).
SURNAME_MIN = 0.75

_LEADER_RE = re.compile(r"лидер|lider|leader", re.I)
# An assistant or a deputy is not the leader; «и.о.» literally means «in place of».
_NOT_LEADER_RE = re.compile(
    r"помощ|ассист|замест|\bзам\b|\bи\.?\s*о\b|yordamchi|o['’ʻ‘`]?rinbosar|"
    r"assistant|deputy|acting", re.I)

KIND_WORD = {"leader": "Lider", "acting": "Lider o'rnida", None: "Aniqlanmadi"}

# Profile → Verifix employee, as the OPERATOR named them after the first report
# (2026-10-04): people the strict matcher could not tie and a person could. A
# pin wins over every rule above — it is a human saying these two are one
# person. Folded on both sides (`_name_tokens`), so spelling or alphabet drift
# still lands. Adding one re-runs the pin pass by itself: its flag is derived
# from this dict (`startup.check_leader_kind_pins`).
PINS = {
    "Sarimsoqova Arapat Qosimjonovna": "SARIMSAQOVA ARAPATXON QOSIMJONOVNA",
}
_PIN_KEYS = {" ".join(_name_tokens(k)): " ".join(_name_tokens(v)) for k, v in PINS.items()}


def is_leader_job(job: str) -> bool:
    j = job or ""
    return bool(_LEADER_RE.search(j)) and not _NOT_LEADER_RE.search(j)


# ── reading Verifix ───────────────────────────────────────────────────────────

def _people(db: Session) -> list[dict]:
    """Every Verifix employee, any status, with the job's NAME and the org
    unit's cell code beside them."""
    c = verifix_explore.config(db)
    dl = time.monotonic() + READ_BUDGET_S
    emps, _ = verifix_explore._employees(c, dl, force=True)
    divs, _ = verifix_explore._divisions(c, dl, force=True)
    jobs, _ = verifix_explore._jobs(c, dl, force=True)
    out = []
    for e in emps.values():
        unit = divs.get(e.get("unit") or "") or {}
        toks = _name_tokens(e.get("name") or "")
        out.append({
            "id": e["id"], "name": e.get("name") or "", "status": e.get("status") or "W",
            "job": (jobs.get(e.get("job") or "") or {}).get("name") or "",
            "cell": unit.get("code"), "cell_raw": unit.get("raw_code"),
            "unit_name": unit.get("name") or "", "dismissed": e.get("dismissed"),
            "toks": toks, "full": " ".join(toks), "two": " ".join(toks[:2]),
        })
    return out


def _index(rows: list[dict]) -> tuple[dict, dict]:
    full: dict[str, list] = defaultdict(list)
    two: dict[str, list] = defaultdict(list)
    for r in rows:
        if len(r["toks"]) >= 2:
            full[r["full"]].append(r)
            two[r["two"]].append(r)
    return full, two


def _narrow(cands: list[dict], own: set, unit: set) -> tuple[dict | None, str | None]:
    if len(cands) == 1:
        return cands[0], None
    for pool, by in ((own, "cell"), (unit, "unit")):
        hits = [c for c in cands if c["cell"] and c["cell"] in pool]
        if len(hits) == 1:
            return hits[0], by
    return None, None


def _patronymic_clash(a: list[str], b: list[str]) -> bool:
    if len(a) < 3 or len(b) < 3:
        return False
    return difflib.SequenceMatcher(None, a[2], b[2]).ratio() < PATRONYMIC_MIN


def _near(toks: list[str], own: set, working_rows: list[dict]) -> dict | None:
    """A slip in the SURNAME only («Jonizoqoqv» for «JONIZOQOV»): the person
    stands in one of the leader's OWN cells, carries exactly the same first
    name, no clashing patronymic, and a surname at least SURNAME_MIN alike.
    One such person or none — a different first name («Saydora» / «Dildora»)
    is never one of them."""
    if not own:
        return None
    hits = [x for x in working_rows
            if x["cell"] in own and len(x["toks"]) >= 2 and x["toks"][1] == toks[1]
            and not _patronymic_clash(toks, x["toks"])
            and difflib.SequenceMatcher(None, toks[0], x["toks"][0]).ratio() >= SURNAME_MIN]
    return hits[0] if len(hits) == 1 else None


def _match(toks: list[str], own: set, unit: set, working: tuple, gone: tuple,
           working_rows: list[dict]) -> dict:
    if len(toks) < 2:
        return {"reason": "short_name"}
    full, two = " ".join(toks), " ".join(toks[:2])
    pinned = _PIN_KEYS.get(full)
    if pinned:
        hits = working[0].get(pinned) or []
        if len(hits) == 1:
            return {"emp": hits[0], "how": "pin"}
        if hits:
            return {"reason": "ambiguous", "cands": hits}
        gone_hits = gone[0].get(pinned) or []
        if gone_hits:
            return {"reason": "not_working", "cands": gone_hits}
        return {"reason": "pin_not_found"}
    cands = working[0].get(full) or []
    if cands:
        hit, by = _narrow(cands, own, unit)
        if hit:
            return {"emp": hit, "how": "full" + (f"+{by}" if by else "")}
        return {"reason": "ambiguous", "cands": cands}
    cands = [c for c in (working[1].get(two) or []) if not _patronymic_clash(toks, c["toks"])]
    if cands:
        hit, by = _narrow(cands, own, unit)
        if hit:
            return {"emp": hit, "how": "two" + (f"+{by}" if by else "")}
        return {"reason": "ambiguous", "cands": cands}
    clash = working[1].get(two) or []
    if clash:
        return {"reason": "namesake", "cands": clash}
    # A profile typed first-name-first («Nodirjon Turdimurodov»): the same two
    # words the other way round, and only when exactly one person answers.
    swapped = working[1].get(f"{toks[1]} {toks[0]}") or []
    if len(swapped) == 1:
        return {"emp": swapped[0], "how": "swap"}
    near = _near(toks, own, working_rows)
    if near:
        return {"emp": near, "how": "near"}
    cands = (gone[0].get(full) or []) or [c for c in (gone[1].get(two) or [])
                                          if not _patronymic_clash(toks, c["toks"])]
    if cands:
        return {"reason": "not_working", "cands": cands}
    return {"reason": "not_found"}


# ── the check ─────────────────────────────────────────────────────────────────

def _cell_key(code) -> str | None:
    s = str(code or "").strip()
    return verifix._code_key(s) if s else None


def pinned_profiles(db: Session) -> list[RoleProfile]:
    return [p for p in db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
            if " ".join(_name_tokens(p.name)) in _PIN_KEYS]


def run(db: Session, only: set[int] | None = None) -> dict:
    """Read Verifix, decide every leader profile (or just ``only``), SAVE, and
    return the report."""
    people = _people(db)
    working_rows = [p for p in people if p["status"] == "W"]
    working, gone = _index(working_rows), _index([p for p in people if p["status"] != "W"])

    units = {m.id: m for m in db.query(Manager).all()}
    cells = db.query(Cell).all()
    own_cells: dict[int, list[Cell]] = defaultdict(list)
    unit_cells: dict[int, set] = defaultdict(set)
    cell_owner: dict[str, int] = {}
    for c in cells:
        k = _cell_key(c.verifix_code)
        if not k:
            continue
        if c.leader_id:
            own_cells[c.leader_id].append(c)
            cell_owner[k] = c.leader_id
        if c.manager_id:
            unit_cells[c.manager_id].add(k)
    our_cells = {_cell_key(c.verifix_code) for c in cells} - {None}

    # Verifix leaders standing in each of OUR cells — who a replacement stands
    # in for, and the hint for a profile Verifix does not know by its name.
    vfx_leaders: dict[str, list] = defaultdict(list)
    for p in working_rows:
        if p["cell"] in our_cells and is_leader_job(p["job"]):
            vfx_leaders[p["cell"]].append(p)

    profiles = (db.query(RoleProfile).filter(RoleProfile.role == "leader")
                .order_by(RoleProfile.name).all())
    if only is not None:
        profiles = [p for p in profiles if p.id in only]
    checked_at = leader_kind.now_iso()
    results = []
    for prof in profiles:
        toks = _name_tokens(prof.name)
        own = {_cell_key(c.verifix_code) for c in own_cells.get(prof.id, [])} - {None}
        m = _match(toks, own, unit_cells.get(prof.manager_id, set()), working, gone,
                   working_rows)
        unit = units.get(prof.manager_id)
        r = {
            "p": prof, "unit": unit.name if unit else None,
            "shift": unit.shift if unit else None,
            "unit_archived": bool(unit.archived) if unit else False,
            "cells": sorted(c.verifix_code for c in own_cells.get(prof.id, [])),
            "emp": m.get("emp"), "how": m.get("how"), "reason": m.get("reason"),
            "cands": m.get("cands") or [],
        }
        e = r["emp"]
        r["kind"] = ("leader" if is_leader_job(e["job"]) else "acting") if e else None
        # Who the cells' Verifix leaders are — the person a replacement stands in
        # for, and a hint for a profile Verifix does not know by its name.
        r["cell_leaders"] = [x for k in sorted(own) for x in vfx_leaders.get(k, [])
                             if not e or x["id"] != e["id"]]
        r["hints"] = []
        if not e and len(toks) >= 2:
            scored = sorted(((s, x) for x in working_rows
                             if (s := _pair_score(toks, x["toks"])) >= HINT_MIN_SCORE),
                            key=lambda t: -t[0])
            r["hints"] = [x for _, x in scored[:HINTS]]
        results.append(r)

    # One Verifix person answering for two profiles is worth saying out loud.
    by_emp = Counter(r["emp"]["id"] for r in results if r["emp"])
    for r in results:
        r["shared"] = bool(r["emp"] and by_emp[r["emp"]["id"]] > 1)

    matched_ids = {r["emp"]["id"] for r in results if r["emp"]}
    # Leaders with no profile mean something only when every profile was read.
    orphans = [] if only is not None else sorted(
        (x for k in vfx_leaders for x in vfx_leaders[k] if x["id"] not in matched_ids),
        key=lambda x: (x["cell"] or "", x["name"]))
    names = {p.id: p.name for p in profiles}
    for x in orphans:
        owner = cell_owner.get(x["cell"])
        x["cell_leader"] = names.get(owner) if owner else None
        unit_id = next((c.manager_id for c in cells if _cell_key(c.verifix_code) == x["cell"]), None)
        x["cell_unit"] = units[unit_id].name if unit_id in units else None

    jobs = Counter(r["emp"]["job"] or "—" for r in results if r["emp"])
    rep = {
        "at": datetime.now(TZ), "results": results, "orphans": orphans,
        "jobs": jobs, "people": len(people), "working": len(working_rows),
    }
    # Saved LAST: everything above may still fail, and the failure DM promises
    # that nothing was saved.
    _apply(db, results, checked_at)
    kinds = Counter(r["kind"] for r in results)
    action_log.record_system(
        "identity", "identity.leader_kind_verifix", db=db,
        details=[("count", len(results)), ("leader", kinds["leader"]),
                 ("acting", kinds["acting"]), ("unresolved", kinds[None])],
    )
    return rep


def _apply(db: Session, results: list[dict], checked_at: str) -> None:
    for r in results:
        p, e = r["p"], r["emp"]
        vfx = {"checked_at": checked_at, "found": bool(e)}
        if e:
            vfx.update(id=e["id"], name=e["name"], job=e["job"] or None,
                       cell=e["cell_raw"] or e["cell"], status=e["status"], how=r["how"])
        else:
            vfx["reason"] = r["reason"]
            if r["cands"]:
                vfx["count"] = len(r["cands"])
        meta = dict(p.leader_kind_meta or {})
        meta["vfx"] = vfx
        manual = meta.get("src") == "manual" and p.leader_kind in leader_kind.KINDS
        r["before"] = p.leader_kind
        if manual:
            r["saved"] = "manual"
        elif r["kind"]:
            if p.leader_kind != r["kind"] or meta.get("src") != "verifix":
                meta.update(src="verifix", at=checked_at, by="Verifix")
            p.leader_kind = r["kind"]
            r["saved"] = "set"
        else:
            r["saved"] = "none"
        p.leader_kind_meta = meta
    db.commit()


# ── the report ────────────────────────────────────────────────────────────────

def _short(name: str | None) -> str:
    toks = (name or "").split()
    return " ".join(toks[:2]) if toks else "—"


def _who(x: dict) -> str:
    cell = x.get("cell_raw") or x.get("cell")
    bits = [x["job"] or "lavozimsiz"] + ([cell] if cell else [])
    return f"{x['name']} ({', '.join(bits)})"


def _reason_text(r: dict) -> str:
    why = r["reason"]
    if why == "short_name":
        return "the profile name has fewer than two words"
    if why == "ambiguous":
        return (f"{len(r['cands'])} working employees answer to this name: "
                + "; ".join(_who(x) for x in r["cands"][:4]))
    if why == "namesake":
        return ("Verifix has the same surname and first name with ANOTHER patronymic: "
                + "; ".join(_who(x) for x in r["cands"][:3]))
    if why == "pin_not_found":
        return "no working or former employee carries exactly the pinned Verifix name"
    if why == "not_working":
        x = r["cands"][0]
        gone = f", dismissed {date.fromisoformat(x['dismissed']):%d.%m.%Y}" if x.get("dismissed") else ""
        return f"in Verifix but not working (status {x['status']}{gone}): {_who(x)}"
    return "no employee with this name in Verifix"


def _line_place(r: dict) -> str:
    bits = [f"brigadir {r['unit']}" if r["unit"] else "no unit"]
    if r["cells"]:
        bits.append("cell " + ", ".join(r["cells"]))
    return " · ".join(bits)


def text(rep: dict) -> str:
    res = rep["results"]
    acting = [r for r in res if r["kind"] == "acting"]
    leaders = [r for r in res if r["kind"] == "leader"]
    unknown = [r for r in res if not r["kind"]]
    manual_clash = [r for r in res if r["saved"] == "manual" and r["kind"]
                    and r["kind"] != r["p"].leader_kind]
    def e(v) -> str:
        return html.escape(str(v), quote=False)
    L = [f"<b>Leaders on Verifix</b> · {rep['at']:%d.%m.%Y %H:%M}",
         f"Read from Verifix's API: {rep['working']} working employees and their job titles. "
         "Each leader profile was matched to one employee by name (strictly — no guessing), "
         "and the Verifix JOB decides: «Лидер» → <b>Lider</b>, any other job → "
         "<b>Lider o'rnida</b>.",
         "",
         f"{len(res)} leader profiles:",
         f"✅ Lider (leader on Verifix) — {len(leaders)}",
         f"🔁 Lider o'rnida (replacement) — {len(acting)}",
         f"❓ Not determined — {len(unknown)}",
         ""]

    L.append(f"<b>🔁 Lider o'rnida — {len(acting)}</b>")
    for i, r in enumerate(sorted(acting, key=lambda r: (r["unit"] or "", r["p"].name)), 1):
        x = r["emp"]
        cell = x["cell_raw"] or x["cell"]
        L.append(f"{i}. <b>{e(r['p'].name)}</b> — {e(_line_place(r))}")
        where = (f" · Verifix cell {e(cell)}" if cell
                 else f" · Verifix unit «{e(x['unit_name'])}»" if x["unit_name"] else "")
        L.append(f"    Verifix job: «{e(x['job'] or '—')}»{where}")
        if r["cell_leaders"]:
            L.append("    Verifix leader of the cell: "
                     + "; ".join(e(_who(y)) for y in r["cell_leaders"][:3]))
    if not acting:
        L.append("—")
    L.append("")

    L.append(f"<b>❓ Not determined — {len(unknown)}</b> (set them by hand on the profile page)")
    for i, r in enumerate(sorted(unknown, key=lambda r: (r["unit"] or "", r["p"].name)), 1):
        L.append(f"{i}. <b>{e(r['p'].name)}</b> — {e(_line_place(r))}")
        L.append(f"    {e(_reason_text(r))}")
        if r["hints"]:
            L.append("    closest names: " + "; ".join(e(_who(y)) for y in r["hints"]))
        if r["cell_leaders"]:
            L.append("    Verifix leader of the cell: "
                     + "; ".join(e(_who(y)) for y in r["cell_leaders"][:3]))
    if not unknown:
        L.append("—")
    L.append("")

    if manual_clash:
        L.append(f"<b>✋ Set by hand, Verifix says otherwise — {len(manual_clash)}</b> (left as set)")
        for r in manual_clash:
            L.append(f"• {e(r['p'].name)}: profile «{KIND_WORD[r['p'].leader_kind]}», "
                     f"Verifix «{e(r['emp']['job'] or '—')}»")
        L.append("")

    L.append(f"<b>✅ Lider — {len(leaders)}</b> (by brigadir)")
    groups: dict[str, list] = defaultdict(list)
    for r in leaders:
        groups[r["unit"] or "—"].append(r)
    for unit in sorted(groups):
        names = ", ".join(e(_short(r["p"].name)) for r in sorted(groups[unit], key=lambda r: r["p"].name))
        L.append(f"<b>{e(unit)}</b> ({len(groups[unit])}): {names}")
    if not leaders:
        L.append("—")
    L.append("")

    spelled = [r for r in res if r["how"] in ("near", "swap")]
    if spelled:
        L.append("Matched although Verifix spells the name differently (please glance): "
                 + "; ".join(e(f"{r['p'].name} → {r['emp']['name']}") for r in spelled))
    shared = [r for r in res if r["shared"]]
    if shared:
        L.append("⚠ One Verifix employee answers for two profiles: "
                 + "; ".join(e(f"{r['p'].name} → {r['emp']['name']}") for r in shared))
    titles = [f"{e(j)} {n}" for j, n in rep["jobs"].most_common()]
    L.append("Verifix jobs of the matched profiles: " + ", ".join(titles) + ".")
    if rep["orphans"]:
        L.append(f"Verifix also lists {len(rep['orphans'])} working «Лидер» employees in our cells "
                 "with no leader profile on the platform — sheet «Profilsiz liderlar».")
    L.append("")
    saved = sum(1 for r in res if r["saved"] == "set")
    kept = sum(1 for r in res if r["saved"] == "manual")
    L.append(f"Saved on {saved} profiles (source: Verifix)"
             + (f"; {kept} set by hand were left as they were" if kept else "")
             + ". Change any of them with the «Lavozim (Verifix)» switch on the leader's "
               "profile page. Every profile with its Verifix name, job and cell is in the "
               "attached workbook.")
    return "\n".join(L)


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


_HOW = {"full": "to'liq ism", "two": "familiya + ism", "cell": "yacheyka bo'yicha",
        "unit": "brigada yacheykalari bo'yicha", "swap": "ism + familiya (teskari)",
        "near": "familiya boshqacha yozilgan, o'z yacheykasida",
        "pin": "operator ko'rsatgan"}
_SAVED = {"set": "ha (Verifix)", "manual": "yo'q — qo'lda belgilangan", "none": "yo'q"}


def _how(how: str | None) -> str:
    return " + ".join(_HOW.get(h, h) for h in (how or "").split("+") if h) or ""


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    rows = []
    for i, r in enumerate(sorted(rep["results"], key=lambda r: (r["unit"] or "", r["p"].name)), 1):
        x = r["emp"] or {}
        rows.append([
            i, r["p"].name, r["unit"], r["shift"], ", ".join(r["cells"]),
            KIND_WORD[r["kind"]], x.get("name"), x.get("job"),
            x.get("cell_raw") or x.get("cell"), x.get("unit_name"), x.get("status"),
            _how(r["how"]), _reason_text(r) if not r["emp"] else "",
            "; ".join(_who(y) for y in r["cell_leaders"][:3]),
            "; ".join(_who(y) for y in r["hints"]),
            _SAVED[r["saved"]] + (f": {KIND_WORD[r['p'].leader_kind]}" if r["saved"] == "manual" else ""),
            "ha" if r["shared"] else "", "ha" if r["unit_archived"] else "",
        ])
    _sheet(wb, "Liderlar", [
        "№", "Profil", "Brigadir", "Smena", "Profil yacheykalari", "Natija",
        "Verifix ismi", "Verifix lavozimi", "Verifix yacheyka (otdel kodi)", "Verifix otdel",
        "Verifix holati", "Qanday topildi", "Sabab", "Yacheykaning Verifixdagi lideri",
        "Yaqin ismlar", "Profilga saqlandi", "Bitta xodim ikki profilda", "Brigada arxivda"], rows)
    _sheet(wb, "Profilsiz liderlar", [
        "Verifix ismi", "Lavozim", "Yacheyka", "Brigadir", "Platformadagi yacheyka lideri"],
        [[x["name"], x["job"], x["cell_raw"] or x["cell"], x.get("cell_unit"), x.get("cell_leader")]
         for x in rep["orphans"]])
    _sheet(wb, "Lavozimlar", ["Verifix lavozimi", "Profillar", "Lider deb hisoblandi"],
           [[j, n, "ha" if is_leader_job(j) else "yo'q"] for j, n in rep["jobs"].most_common()])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


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


def pins_text(rep: dict) -> str:
    def e(v) -> str:
        return html.escape(str(v), quote=False)
    L = [f"<b>Leaders on Verifix — your corrections applied</b> · {rep['at']:%d.%m.%Y %H:%M}", ""]
    for r in rep["results"]:
        L.append(f"<b>{e(r['p'].name)}</b> — {e(_line_place(r))}")
        x = r["emp"]
        if x:
            cell = x["cell_raw"] or x["cell"]
            L.append(f"→ Verifix: {e(x['name'])} · «{e(x['job'] or '—')}»"
                     + (f" · cell {e(cell)}" if cell else ""))
        else:
            L.append(f"→ {e(_reason_text(r))}")
        if r["saved"] == "set":
            L.append(f"Saved: <b>{KIND_WORD[r['kind']]}</b>")
        elif r["saved"] == "manual":
            L.append(f"Left as set by hand: <b>{KIND_WORD[r['p'].leader_kind]}</b>")
        else:
            L.append("Nothing saved — set it by hand on the profile page.")
        L.append("")
    return "\n".join(L).strip()


def send_pins(db: Session, chat_id: int, *_window) -> int:
    """Apply ``PINS`` — only the pinned profiles — and DM what each became."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    ids = {p.id for p in pinned_profiles(db)}
    if not ids:
        _post("sendMessage", {"chat_id": chat_id, "text":
              "Leaders on Verifix: no leader profile carries the corrected names "
              + "; ".join(PINS) + " — nothing was changed."})
        return 1
    try:
        rep = run(db, only=ids)
    except Exception as exc:
        db.rollback()
        try:
            _post("sendMessage", {
                "chat_id": chat_id,
                "text": f"Leader corrections on Verifix could not run: {_why(exc)}. "
                        "Nothing was saved; it tries again on the next deploy."})
        except Exception:
            pass
        raise
    _post("sendMessage", {"chat_id": chat_id, "text": pins_text(rep), "parse_mode": "HTML"})
    return 1


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    try:
        rep = run(db)
    except Exception as exc:
        db.rollback()
        try:
            _post("sendMessage", {
                "chat_id": chat_id,
                "text": f"Leader check on Verifix could not run: {_why(exc)}. "
                        "Nothing was saved; it tries again on the next deploy."})
        except Exception:
            pass
        raise
    body = text(rep)
    book = build_workbook(rep).getvalue()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                              "disable_web_page_preview": "true"})
    stamp = rep["at"].strftime("%d.%m.%Y")
    _post("sendDocument", {"chat_id": chat_id,
                           "caption": "Leader profiles × Verifix — every profile, its Verifix "
                                      "name, job and cell"},
          files={"document": (f"liderlar-verifix-{stamp}.xlsx", book,
                              "application/vnd.openxmlformats-officedocument."
                              "spreadsheetml.sheet")})
    return len(chunks) + 1
