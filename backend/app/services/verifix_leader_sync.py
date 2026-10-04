"""One-off (2026-10-04): leaders × Verifix — create the leader profiles the
platform is missing and report every other difference. Nothing is deleted,
archived or renamed (the operator: «don't delete or archive yet. Report me»).

An hour earlier the cells register was made Verifix's (``verifix_cell_sync``);
this is the same comparison for the people who lead the cells. Production's
Verifix login lives only on the server, so it runs there once, at boot, and
DMs the operator a summary and a workbook.

WHO is a leader on Verifix: a WORKING employee whose job names a leader —
``leader_verifix_check.is_leader_job`` («Лидер», «Лидер АХО», «Лидер/отправка»;
never an assistant, a deputy or an «и.о.»). Where they stand: the cell whose
code their org unit («отдел») carries.

WHICH profile is which person: ``leader_verifix_check._match``, unchanged —
the strict rules the morning's leader check used (full folded name, then
surname + first name with no clashing patronymic, narrowed by the profile's
own cells and unit, the operator's pins). A fuzzy match is never acted on.

CREATED — a Verifix leader no profile answers for, when their cell gives them
one unambiguous place here: an active cell of ours with a brigadir, no leader
of its own, no leader profile that Verifix places in it, no second profileless
Verifix leader in it, and no profile anywhere with the same surname + first
name (a likely duplicate the strict matcher could not tie). The profile takes
the cell's brigadir as its unit and the cell as its own — so no cell changes
unit — the Verifix name in the register's spelling (Latin, Title Case) and
«Lider» as its kind, source Verifix. Consequence to know: from that moment the
leader is on the unit's roster, so the brigadir's day digest lists them «not
filed» until they register in the bot and file.

REPORTED, never acted on: Verifix leaders who could not be placed (their cell
has no brigadir here, already has a leader, is archived, is a department, or
has no code in Verifix at all), profiles Verifix does not have (not working
there, not found, ambiguous), profiles whose Verifix job is not a leader's,
names spelled differently, a person Verifix places in another cell or under
another brigadir, profiles owning an archived cell, and one Verifix person
answering for two profiles.

Nothing is created when Verifix answers with too little, and the report says
why. The record is kept in the ``verifix_leader_sync_2026_10_04`` app setting.

Temporary: delete this module, ``startup.sync_leaders_from_verifix`` /
``_leader_sync_job`` and the call in BOTH entrypoints once the report has
landed — and do it before (or with) ``leader_verifix_check``, whose matching
and delivery helpers it imports. The profiles it created stay.
"""
from __future__ import annotations

import html
import json
import re
import time
from collections import Counter, defaultdict
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Manager, RoleProfile
from app.services import action_log, leader_kind, verifix_explore
from app.services import leader_verifix_check as lv
from app.services.name_map import _name_tokens
from app.translit import transliterate

TZ = ZoneInfo("Asia/Tashkent")
# A boot job, not a request: the employee list is ~18 pages.
READ_BUDGET_S = 420.0
SNAPSHOT_KEY = "verifix_leader_sync_2026_10_04"

# Below these, Verifix did not hand over the whole staff (1 Oct: 8,531 / 154).
MIN_PEOPLE = 1000
MIN_LEADERS = 50
# Most of our leader profiles must be found in Verifix (1 Oct copy: 105 of 108)…
MIN_FOUND_SHARE = 0.7
# …and one pass creates no more than this many profiles unseen.
MAX_CREATE = 40

_TWIN = str.maketrans({"А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
                       "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "а": "a", "е": "e",
                       "о": "o", "р": "p", "с": "c", "х": "x", "у": "y"})
_APOS = str.maketrans({"’": "'", "‘": "'", "ʻ": "'", "ʼ": "'", "`": "'"})
_LAT = re.compile(r"[A-Za-z]")
_CYR = re.compile(r"[А-Яа-яЁёЎўҚқҒғҲҳ]")

# Why a Verifix leader got no profile — (the DM's words, the workbook's).
REASON = {
    "no_brigadir": ("their cell has no brigadir here", "Yacheykada brigadir yo'q"),
    "has_leader": ("their cell already has a leader here", "Yacheykaning lideri bor"),
    "profile_there": ("Verifix also places one of our leader profiles in that cell",
                      "Verifix shu yacheykaga bizdagi boshqa lider profilini qo'ygan"),
    "two_leaders": ("two leaders with no profile in one cell", "Bitta yacheykada ikki profilsiz lider"),
    "cell_archived": ("their cell is archived here", "Yacheyka arxivda"),
    "no_code": ("their subdivision has no code in Verifix, so it is no cell here",
                "Verifixda bo'limning kodi yo'q — bizda yacheyka emas"),
    "not_cell": ("their subdivision is not one of our cells (a department)",
                 "Bo'lim bizda yacheyka emas (bo'lim/departament)"),
    "similar_profile": ("a profile with the same surname and first name exists — a possible duplicate",
                        "Shu familiya va ismli profil bor — takror bo'lishi mumkin"),
    "short_name": ("their name in Verifix is too short to be sure", "Verifixdagi ism to'liq emas"),
    "name_exists": ("a profile with this exact name already exists in that unit",
                    "Shu brigadada shu ismli profil bor"),
}
# What would let a person act on each group — printed under its heading.
NEXT = {
    "no_brigadir": "give the cell a brigadir on /cells, and the leader can get a profile",
    "has_leader": "decide which of the two leads the cell",
    "profile_there": "give the cell to the profile Verifix places there, or say otherwise",
    "no_code": "Verifix gives the subdivision no code; with one, the cell sync can create the cell",
    "two_leaders": "say which of them leads the cell",
}
# Why a profile has no Verifix person.
MISSING = {
    "not_working": ("not working in Verifix", "Verifixda ishlamaydi"),
    "not_found": ("not found in Verifix", "Verifixda topilmadi"),
    "ambiguous": ("several Verifix people match the name", "Verifixda bir nechta odam mos keladi"),
    "namesake": ("only a namesake with another patronymic", "Faqat otasining ismi boshqa adash"),
    "pin_not_found": ("the name you pinned is not in Verifix", "Ko'rsatilgan ism Verifixda yo'q"),
    "short_name": ("the profile's name is too short to match", "Profil ismi to'liq emas"),
}


def _profile_name(raw: str) -> str:
    """Verifix's «QANOATOV DAVRONBEK SHERMAMAT O'G'LI» the way the register
    spells a leader: Latin, Title Case — «Qanoatov Davronbek Shermamat O'g'li».
    A Latin name with a stray Cyrillic twin («MAХMUDOVA») gets the Latin
    letter; a Cyrillic name is transliterated."""
    s = " ".join((raw or "").split()).translate(_APOS)
    if len(_LAT.findall(s)) >= len(_CYR.findall(s)):
        s = s.translate(_TWIN)
    else:
        s = transliterate(s, "uz")
    return " ".join("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-"))
                    for w in s.split(" "))


# ── reading Verifix ───────────────────────────────────────────────────────────

def _people(db: Session) -> list[dict]:
    """Every Verifix employee, any status — `leader_verifix_check._people`'s
    shape, plus the hiring date the report prints."""
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
            "hired": e.get("hired"),
            "toks": toks, "full": " ".join(toks), "two": " ".join(toks[:2]),
        })
    return out


def _who(x: dict) -> dict:
    return {"id": x["id"], "name": x["name"], "job": x["job"], "status": x["status"],
            "cell": x["cell_raw"] or x["cell"], "unit_name": x["unit_name"],
            "dismissed": x["dismissed"], "hired": x.get("hired")}


# ── the comparison ────────────────────────────────────────────────────────────

def plan(db: Session, people: list[dict]) -> dict:
    """Compare every leader profile with Verifix and decide what to create.
    Writes nothing."""
    working_rows = [p for p in people if p["status"] == "W"]
    working = lv._index(working_rows)
    gone = lv._index([p for p in people if p["status"] != "W"])
    vx_leaders = [p for p in working_rows if lv.is_leader_job(p["job"])]

    units = {m.id: m for m in db.query(Manager).all()}
    by_key: dict[str, Cell] = {}
    for c in db.query(Cell).all():
        k = lv._cell_key(c.verifix_code)
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

    def uname(mid) -> str | None:
        return units[mid].name if mid in units else None

    def cell_out(k) -> str | None:
        return by_key[k].verifix_code if k in by_key else None

    rows: list[dict] = []
    placed: dict[str, list[str]] = defaultdict(list)   # cell key → profiles Verifix puts there
    for prof in profiles:
        m = lv._match(_name_tokens(prof.name), own.get(prof.id, set()),
                      unit_cells.get(prof.manager_id, set()), working, gone, working_rows)
        e = m.get("emp")
        mine = own.get(prof.id, set())
        r = {"id": prof.id, "name": prof.name, "unit": uname(prof.manager_id),
             "cells": sorted(cell_out(k) for k in mine),
             "archived_cells": sorted(by_key[k].verifix_code for k in mine if by_key[k].archived_at),
             "kind": prof.leader_kind, "how": m.get("how"), "reason": m.get("reason"),
             "emp": _who(e) if e else None,
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
    two_keys = {" ".join(_name_tokens(p.name)[:2]) for p in profiles}

    orphans = [p for p in vx_leaders if p["id"] not in matched]
    per_cell = Counter(p["cell"] for p in orphans if p["cell"])
    created: list[dict] = []
    skipped: list[dict] = []
    for p in sorted(orphans, key=lambda p: (p["cell_raw"] or "~", p["name"])):
        c = by_key.get(p["cell"]) if p["cell"] else None
        item = {**_who(p), "cell": c.verifix_code if c else (p["cell_raw"] or None),
                "unit": uname(c.manager_id) if c and c.manager_id else None,
                "cell_leader": pname.get(c.leader_id) if c and c.leader_id else None,
                "there": placed.get(p["cell"]) or [] if p["cell"] else []}
        if not p["cell"]:
            reason = "no_code"
        elif c is None:
            reason = "not_cell"
        elif c.archived_at:
            reason = "cell_archived"
        elif not c.manager_id or c.manager_id not in units or units[c.manager_id].archived:
            reason = "no_brigadir"
        elif c.leader_id:
            reason = "has_leader"
        elif item["there"]:
            reason = "profile_there"
        elif per_cell[p["cell"]] > 1:
            reason = "two_leaders"
        elif len(p["toks"]) < 2:
            reason = "short_name"
        elif " ".join(p["toks"][:2]) in two_keys:
            reason = "similar_profile"
        else:
            reason = None
        if reason:
            skipped.append({**item, "reason": reason})
            continue
        created.append({**item, "new_name": _profile_name(p["name"]),
                        "unit_id": c.manager_id, "cell_id": c.id})

    # A profile is unique per (name, unit) — never a second one by that name.
    taken = {(p.name, p.manager_id) for p in profiles}
    keep = []
    for it in created:
        if (it["new_name"], it["unit_id"]) in taken:
            skipped.append({**it, "reason": "name_exists"})
        else:
            taken.add((it["new_name"], it["unit_id"]))
            keep.append(it)
    created = keep

    found = sum(1 for r in rows if r["emp"])
    refused = None
    if len(people) < MIN_PEOPLE or len(vx_leaders) < MIN_LEADERS:
        refused = (f"Verifix handed over only {len(people)} employees and {len(vx_leaders)} "
                   f"leaders (expected at least {MIN_PEOPLE} and {MIN_LEADERS}) — a cut answer.")
    elif profiles and found < MIN_FOUND_SHARE * len(profiles):
        refused = (f"only {found} of our {len(profiles)} leader profiles were found in Verifix — "
                   "that reads like a broken answer.")
    elif len(created) > MAX_CREATE:
        refused = f"it would create {len(created)} profiles at once — too many to do unseen."

    jobs = Counter(p["job"] for p in vx_leaders)
    return {
        "at": datetime.now(TZ).isoformat(timespec="minutes"),
        "applied": False, "refused": refused,
        "vx": {"people": len(people), "working": len(working_rows), "leaders": len(vx_leaders),
               "jobs": jobs.most_common()},
        "profiles": len(profiles), "found": found,
        "created": created, "skipped": skipped, "rows": rows,
    }


def _apply(db: Session, rep: dict) -> None:
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
        cell = db.query(Cell).filter_by(id=it["cell_id"]).first()
        if cell is not None and cell.leader_id is None:
            cell.leader_id = prof.id
        it["profile_id"] = prof.id


def run(db: Session) -> dict:
    """Read Verifix, compare, create (unless a guard refuses) and keep the record."""
    rep = plan(db, _people(db))
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
        "identity", "identity.leaders_verifix_sync", db=db,
        outcome="done" if rep["applied"] else "refused",
        details=[("count", rep["profiles"]), ("added", len(rep["created"])),
                 ("skipped", len(rep["skipped"]))],
        reason=rep["refused"],
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _dmy(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(str(iso)[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return str(iso)


def _missing_text(r: dict) -> str:
    words = MISSING.get(r["reason"], (r["reason"] or "—", ""))[0]
    if r["reason"] == "not_working" and r["cands"]:
        x = r["cands"][0]
        words += f" — {x['name']}, " + (f"dismissed {_dmy(x['dismissed'])}" if x["dismissed"]
                                         else f"status «{x['status']}»")
    elif r["cands"]:
        words += ": " + "; ".join(x["name"] for x in r["cands"][:3])
    return words


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    vx, rows = rep["vx"], rep["rows"]
    done = rep["applied"]
    jobs = " · ".join(f"{_e(j)} {n}" for j, n in vx["jobs"])
    L = [f"<b>Leaders × Verifix</b> · {at:%d.%m.%Y %H:%M}" + ("" if done else " — <b>NOTHING was created</b>"),
         f"Read from Verifix's API: {vx['working']:,} working employees, <b>{vx['leaders']}</b> of "
         f"them leaders by job ({jobs}). The platform has {rep['profiles']} leader profiles; "
         f"{rep['found']} of them were found in Verifix by name.",
         "Nothing was deleted, archived or renamed.", ""]
    if not done:
        L += [f"⚠ Stopped: {_e(rep['refused'])}", ""]

    created, skipped = rep["created"], rep["skipped"]
    L.append(f"<b>➕ {'Created' if done else 'Would create'} — {len(created)} leader profiles</b>")
    if created:
        L.append("Verifix leaders standing in one of our cells that has a brigadir and no leader; "
                 "each got that cell. They are on their brigadir's roster from now — the day digest "
                 "lists them «not filed» until they register in the bot and file.")
        for it in created:
            L.append(f"{_e(it['cell'])} — <b>{_e(it['new_name'])}</b> — {_e(it['unit'])} · "
                     f"«{_e(it['job'])}», hired {_dmy(it['hired'])}")
    else:
        L.append("None — no profileless Verifix leader stands in a cell that gives them a clean "
                 "place here (see below).")
    L.append("")

    if skipped:
        L.append(f"<b>👤 Verifix leaders with no profile, not created — {len(skipped)}</b>")
        groups: dict[str, list] = defaultdict(list)
        for s in skipped:
            groups[s["reason"]].append(s)
        for reason in sorted(groups, key=lambda k: -len(groups[k])):
            hint = f" ({NEXT[reason]})" if reason in NEXT else ""
            L.append(f"<i>{REASON[reason][0]} — {len(groups[reason])}</i>{_e(hint)}:")
            for s in groups[reason]:
                where = _e(s["cell"]) if s["cell"] else f"«{_e(s['unit_name'] or '—')}»"
                extra = ""
                if reason == "has_leader":
                    extra = f" · here the leader is {_e(s['cell_leader'])}"
                elif reason == "profile_there":
                    extra = " · Verifix also places " + _e(", ".join(s["there"])) + " there"
                elif s["unit"]:
                    extra = f" · {_e(s['unit'])}"
                L.append(f"  {where} — {_e(s['name'])} «{_e(s['job'])}»{extra}")
        L.append("")

    missing = [r for r in rows if not r["emp"]]
    if missing:
        L.append(f"<b>🗃 Profiles Verifix does not have — {len(missing)}</b> "
                 "(archive / delete candidates — nothing done)")
        for r in missing:
            L.append(f"  {_e(r['name'])} — {_e(r['unit'] or '—')} · cells "
                     f"{_e(', '.join(r['cells']) or '—')} — {_e(_missing_text(r))}")
        L.append("")

    acting = [r for r in rows if r["emp"] and not r["vx_leader"]]
    if acting:
        L.append(f"<b>🔁 Verifix job is not a leader's — {len(acting)}</b> (Lider o'rnida)")
        for r in acting:
            L.append(f"  {_e(r['name'])} — {_e(r['unit'] or '—')} · Verifix «{_e(r['emp']['job'])}»")
        L.append("")

    spelled = [r for r in rows if r["emp"] and r["spelled"]]
    if spelled:
        L.append(f"<b>🔤 Name spelled differently — {len(spelled)}</b> (not renamed)")
        for r in spelled:
            L.append(f"  {_e(r['name'])} → Verifix {_e(r['emp']['name'])}")
        L.append("")

    cell_diff = [r for r in rows if r["emp"] and r["cell_diff"]]
    if cell_diff:
        L.append(f"<b>🧩 Verifix places them in another cell — {len(cell_diff)}</b>")
        for r in cell_diff:
            vx_where = r["vx_cell"] or r["emp"]["cell"] or f"«{r['emp']['unit_name'] or '—'}»"
            L.append(f"  {_e(r['name'])} — here {_e(', '.join(r['cells']) or 'no cell')} · "
                     f"Verifix {_e(vx_where)}")
        L.append("")

    unit_diff = [r for r in rows if r["emp"] and r["unit_diff"]]
    if unit_diff:
        L.append(f"<b>👥 Their Verifix cell is another brigadir's here — {len(unit_diff)}</b>")
        for r in unit_diff:
            L.append(f"  {_e(r['name'])} — profile under {_e(r['unit'] or '—')} · cell "
                     f"{_e(r['vx_cell'])} is {_e(r['vx_cell_unit'])}'s")
        L.append("")

    arch = [r for r in rows if r["archived_cells"]]
    if arch:
        L.append(f"<b>🗄 Own an archived cell — {len(arch)}</b>: " + "; ".join(
            f"{_e(r['name'])} ({_e(', '.join(r['archived_cells']))})" for r in arch))
        L.append("")
    shared = [r for r in rows if r["shared"]]
    if shared:
        L.append("⚠ One Verifix person answers for two profiles: " + "; ".join(
            f"{_e(r['name'])} → {_e(r['emp']['name'])}" for r in shared))
        L.append("")
    L.append("Every profile side by side with Verifix, and every leader above, is in the "
             "attached workbook.")
    return "\n".join(L).strip()


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    rows = rep["rows"]
    lv._sheet(wb, "Barcha profillar", [
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
          f"{r['vx_cell_unit']}" if r["emp"] and r["unit_diff"] else "",
          ", ".join(r["archived_cells"])] for r in rows])
    lv._sheet(wb, "Yaratildi", ["Yacheyka", "Profil", "Brigadir", "Verifix ismi", "Lavozim",
                                "Ishga kirgan"],
              [[it["cell"], it["new_name"], it["unit"], it["name"], it["job"], _dmy(it["hired"])]
               for it in rep["created"]])
    lv._sheet(wb, "Profilsiz liderlar", [
        "Verifix ismi", "Lavozim", "Yacheyka", "Verifix bo'limi", "Bizdagi brigadir",
        "Yacheykaning bizdagi lideri", "Verifix shu yacheykaga qo'ygan profillar", "Sabab",
        "Ishga kirgan"],
        [[s["name"], s["job"], s["cell"], s["unit_name"], s["unit"], s["cell_leader"],
          ", ".join(s["there"]), REASON[s["reason"]][1], _dmy(s["hired"])] for s in rep["skipped"]])
    lv._sheet(wb, "Verifixda yo'q", ["Profil", "Brigadir", "Yacheykalari", "Sabab",
                                    "Verifixdagi nomzodlar"],
              [[r["name"], r["unit"], ", ".join(r["cells"]),
                MISSING.get(r["reason"], (r["reason"], r["reason"]))[1],
                "; ".join(f"{x['name']} ({x['status']}"
                          + (f", {_dmy(x['dismissed'])}" if x["dismissed"] else "") + ")"
                          for x in r["cands"])] for r in rows if not r["emp"]])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── delivery ──────────────────────────────────────────────────────────────────

def send(db: Session, chat_id: int, *_window) -> int:
    """Sync once and DM the report. Profiles already created by an earlier
    attempt whose delivery failed are never created twice — its stored record
    is sent."""
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
                    "text": f"Leaders × Verifix could not run: {lv._why(exc)}. Nothing was "
                            "changed; it tries again on the next deploy."})
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
                              "caption": "Leaders × Verifix — every leader profile beside its "
                                         "Verifix person, the profiles created, and every "
                                         "Verifix leader still without one"},
             files={"document": (f"liderlar-verifix-sync-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
