"""ONE-SHOT REPORT (2026-10-08): the cells Verifix seats MORE THAN ONE leader in.

The operator asked: «Report me the cells with multiple leaders on Verifix».
The 8 Oct owner pass (``cell_owner_pass``) left such cells without an Egasi
until the operator says which leader is the cell's (0111, 0822 and 0912 on its
dry run), but its report names only OUR cells. This one reads Verifix afresh and
lists EVERY Verifix cell with two or more working leaders — ours or not — and,
for each leader, the profile here Verifix ties them to and what that profile
runs and owns.

The rules are the owner pass's, never a second spelling:

* a Verifix cell = ``verifix_cells_leaders_sync.cell_nodes`` (coded and
  name-coded subdivisions), a person's place = their ORG UNIT (``_people``);
* a leader = a WORKING employee whose job ``leader_verifix_check.is_leader_job``
  («Лидер», «Лидер АХО», «Лидер/отправка» — never an assistant or deputy);
* profile ↔ Verifix person = ``cell_owner_pass._ties`` (strict names, the
  operator's pins, the 4–5 Oct stored tie), sure or not.

Subdivisions that are not cells (departments, codeless, a doubled code) with two
or more leaders are listed on a sheet of their own, so nothing is missed.

READ-ONLY: it changes nothing in Verifix or here. Its one write is its record
(app setting ``multi_leader_cells_2026_10_08``), so a delivery that fails is
re-sent from it.

Temporary: delete this module, ``startup.report_multi_leader_cells`` and its job
pair, and the call in BOTH entrypoints once the report has landed — BEFORE
``cell_owner_pass``, ``verifix_cells_leaders_sync`` and ``leader_verifix_check``,
whose helpers it imports.
"""
from __future__ import annotations

import html
import json
from collections import Counter, defaultdict
from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Manager, RoleProfile
from app.services import cell_owner_pass as cop
from app.services import leader_verifix_check as lv
from app.services import verifix_cells_leaders_sync as vcl

TZ = ZoneInfo("Asia/Tashkent")
SNAPSHOT_KEY = "multi_leader_cells_2026_10_08"

# Where a subdivision that is not a cell stands, in the workbook's words.
WHERE_UZ = {
    "dept": "bo'lim (departament)",
    "unsure": "kodi ikki marta / yacheyka emas",
    "codeless": "kodsiz bo'linma",
    "none": "bo'linmasiz",
}


def _d(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return date.fromisoformat(str(iso)[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return str(iso)


def collect(db: Session, data: tuple | None = None) -> dict:
    """Read Verifix (or take ``data`` = (divs, emps, jobs) — a test) and build
    the report. Raises when the read looks cut: half a list must not read as
    the whole one."""
    divs, emps, jobs = data or vcl._read(db)
    if len(divs) < vcl.MIN_DIVISIONS or len(emps) < vcl.MIN_EMPLOYEES:
        raise RuntimeError(f"Verifix handed over only {len(divs)} subdivisions and {len(emps)} "
                           f"employees (expected at least {vcl.MIN_DIVISIONS} and "
                           f"{vcl.MIN_EMPLOYEES})")
    cn = vcl.cell_nodes(divs, emps, jobs)
    people = vcl._people(divs, emps, jobs, cn)
    working = [p for p in people if p["status"] == "W"]
    vx_leaders = [p for p in working if lv.is_leader_job(p["job"])]
    if len(vx_leaders) < vcl.MIN_LEADERS:
        raise RuntimeError(f"Verifix handed over only {len(vx_leaders)} working leaders "
                           f"(expected at least {vcl.MIN_LEADERS})")

    units = {m.id: m for m in db.query(Manager).all()}
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    profs = {p.id: p for p in db.query(RoleProfile).all()}
    leader_profs = sorted((p for p in profs.values() if p.role == "leader"), key=lambda p: p.name)

    def uname(mid):
        return units[mid].name if mid in units else None

    # Verifix person → the leader profile(s) here tied to them.
    ties = cop._ties(people, cells, leader_profs)
    tied: dict[str, list[dict]] = defaultdict(list)
    for pid, t in ties.items():
        if t["emp"]:
            tied[t["emp"]["id"]].append({
                "id": pid, "name": profs[pid].name, "unit": uname(profs[pid].manager_id),
                "sure": bool(t["sure"] and not t.get("shared")),
                "why": t.get("why"), "how": t.get("how")})

    # What each profile runs (Boshqaruvchi) and owns (Egasi) here.
    runs: dict[int, list[str]] = defaultdict(list)
    owns: dict[int, list[str]] = defaultdict(list)
    ours: dict[str, list[Cell]] = defaultdict(list)
    for c in cells:
        k = vcl._key(c.verifix_code)
        if k:
            ours[k].append(c)
        if c.archived_at is not None:
            continue
        if c.leader_id:
            runs[c.leader_id].append(c.verifix_code)
        if c.owner_id:
            owns[c.owner_id].append(c.verifix_code)

    # The Verifix brigadir over a subdivision, with the unit here tied to them.
    unit_of_vx: dict[str, tuple] = defaultdict(tuple)
    by_emp = {p["id"]: p for p in people}
    for m in units.values():
        v = (m.supervisor_kind_meta or {}).get("vfx") or {}
        vid = str(v["id"]) if v.get("id") else None
        e = by_emp.get(vid) if vid else None
        if e and not m.archived and cop._same_person(m.name, e["name"]):
            unit_of_vx[vid] = unit_of_vx[vid] + (m.name,)
    over = vcl._brigadirs_over(divs, emps, jobs, dict(unit_of_vx))

    working_in = Counter(p["unit_id"] for p in working)

    def leader(p: dict, cell_rows: list[Cell]) -> dict:
        tp = tied.get(p["id"], [])
        mine_ids = {x["id"] for x in tp}
        return {
            "id": p["id"], "name": p["name"], "job": p["job"], "hired": p.get("hired"),
            "profiles": [{**x, "runs": sorted(runs.get(x["id"], [])),
                          "owns": sorted(owns.get(x["id"], []))} for x in tp],
            # Is this person the one running / owning THIS cell here?
            "is_manager": any(c.leader_id in mine_ids for c in cell_rows),
            "is_owner": any(c.owner_id in mine_ids for c in cell_rows),
        }

    # ── cells ──
    seated: dict[str, list[dict]] = defaultdict(list)
    for p in vx_leaders:
        if p["where"] == "cell" and p["cell"]:
            seated[p["cell"]].append(p)
    rows = []
    for k, ps in seated.items():
        if len(ps) < 2:
            continue
        n = cn["nodes"].get(k) or {}
        mine = ours.get(k, [])
        live = [c for c in mine if c.archived_at is None]
        c0 = (live or mine or [None])[0]
        lrows = [leader(p, mine) for p in sorted(ps, key=lambda p: (p.get("hired") or "", p["name"]))]
        mgr = profs.get(c0.leader_id) if c0 and c0.leader_id else None
        own = profs.get(c0.owner_id) if c0 and c0.owner_id else None
        rows.append({
            "code": n.get("code") or (c0.verifix_code if c0 else k),
            "vx_name": n.get("name"), "vx_open": n.get("open"), "parent": n.get("parent_name"),
            "workers": working_in.get(n.get("id"), 0),
            "vx_brigadirs": [{"name": b["name"], "units": list(b["unit"] or ())}
                             for b in over(n.get("id"))],
            "ours": c0 is not None, "archived": bool(c0 and c0.archived_at is not None),
            "unit": uname(c0.manager_id) if c0 else None,
            "manager": mgr.name if mgr else None, "owner": own.name if own else None,
            "owner_src": ((c0.owner_meta or {}).get("src") if c0 and c0.owner_id else None),
            "leaders": lrows,
        })
    rows.sort(key=lambda r: r["code"] or "")

    # ── subdivisions that are not cells ──
    elsewhere: dict[str, list[dict]] = defaultdict(list)
    for p in vx_leaders:
        if p["where"] != "cell":
            elsewhere[p["unit_id"] or ""].append(p)
    other = []
    for uid, ps in elsewhere.items():
        if len(ps) < 2 or not uid:
            continue
        d = divs.get(uid) or {}
        parent = divs.get(d.get("parent") or "") or {}
        lrows = [leader(p, []) for p in sorted(ps, key=lambda p: (p.get("hired") or "", p["name"]))]
        other.append({"name": d.get("name") or uid, "code": d.get("raw_code"),
                      "parent": parent.get("name") or "", "where": ps[0]["where"],
                      "workers": working_in.get(uid, 0), "leaders": lrows})
    other.sort(key=lambda r: (r["parent"], r["name"]))

    return {
        "at": datetime.now(TZ).isoformat(timespec="minutes"),
        "vx": {"divisions": len(divs), "employees": len(emps), "working": len(working),
               "cells": len(cn["nodes"]), "leaders": len(vx_leaders),
               "seated": sum(len(v) for v in seated.values()),
               "seated_cells": len(seated)},
        "cells": rows, "other": other,
    }


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _profile_text(x: dict) -> str:
    s = f"profile «{_e(x['name'])}»" + (f" ({_e(x['unit'])})" if x["unit"] else " (no brigadir)")
    if not x["sure"]:
        s += " — <i>tie not sure</i>"
    bits = []
    if x["runs"]:
        bits.append("runs " + ", ".join(x["runs"]))
    if x["owns"]:
        bits.append("owns " + ", ".join(x["owns"]))
    return s + (" — " + "; ".join(bits) if bits else "")


def _leader_line(i: int, x: dict) -> str:
    marks = []
    if x["is_manager"]:
        marks.append("Boshqaruvchi")
    if x["is_owner"]:
        marks.append("Egasi")
    s = f"  {i}. <b>{_e(x['name'])}</b> «{_e(x['job'])}»"
    if x["hired"]:
        s += f" · since {_d(x['hired'])}"
    if marks:
        s += " · ⭐ " + " + ".join(marks)
    s += " · " + ("; ".join(_profile_text(p) for p in x["profiles"])
                  if x["profiles"] else "no profile here")
    return s


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    v = rep["vx"]
    rows = rep["cells"]
    n_leaders = sum(len(r["leaders"]) for r in rows)
    L = [f"<b>Cells with more than one leader on Verifix</b> · {at:%d.%m.%Y %H:%M}", "",
         f"Verifix: {v['divisions']} subdivisions · {v['working']:,} working · "
         f"{v['leaders']} working leaders, {v['seated']} of them seated in {v['seated_cells']} "
         "cells. A leader = a working employee whose job is «Лидер» (not an assistant or deputy); "
         "their cell = their org unit.", ""]
    if not rows:
        L.append("✅ <b>No cell</b> seats more than one leader.")
    else:
        L.append(f"<b>{len(rows)} cells</b> seat two or more leaders ({n_leaders} leaders "
                 "between them). ⭐ marks the one who runs (Boshqaruvchi) / owns (Egasi) the "
                 "cell here; leaders are listed oldest hire first.")
        for r in rows:
            L.append("")
            head = f"<b>{_e(r['code'])}</b>"
            if r["vx_name"]:
                head += f" «{_e(r['vx_name'])}»"
            if r["vx_open"] is False:
                head += " (closed on Verifix)"
            head += f" · {len(r['leaders'])} leaders · {r['workers']} working"
            L.append(head)
            if not r["ours"]:
                L.append("  not on /cells")
            else:
                L.append("  here: " + ("archived · " if r["archived"] else "")
                         + f"brigadir {_e(r['unit']) if r['unit'] else '—'} · "
                         + f"Boshqaruvchi {_e(r['manager']) if r['manager'] else '—'} · "
                         + f"Egasi {_e(r['owner']) if r['owner'] else '—'}"
                         + (" (set by hand)" if r["owner_src"] == "manual" else ""))
            if r["vx_brigadirs"]:
                L.append("  Verifix brigadir: " + "; ".join(
                    _e(b["name"]) + (f" (unit {_e(', '.join(b['units']))})" if b["units"]
                                     else " (no unit here)") for b in r["vx_brigadirs"]))
            for i, x in enumerate(r["leaders"], 1):
                L.append(_leader_line(i, x))
    if rep["other"]:
        n = len(rep["other"])
        L += ["", f"Also {n} subdivision{'s' if n != 1 else ''} that {'are' if n != 1 else 'is'} "
              "NOT a cell seat" + ("" if n != 1 else "s") + " two or more leaders — on the "
              "workbook's second sheet."]
    L += ["", "Nothing was changed. To name a cell's Egasi, pick it on /cells (the cell form's "
          "«Egasi» field)."]
    return "\n".join(L)


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)

    def prof(x: dict) -> str:
        return "; ".join(
            p["name"] + (f" ({p['unit']})" if p["unit"] else " (brigadirsiz)")
            + ("" if p["sure"] else " — aniq emas") for p in x["profiles"])

    def runs(x: dict, key: str) -> str:
        return "; ".join(", ".join(p[key]) for p in x["profiles"] if p[key])

    rows = []
    for r in rep["cells"]:
        for i, x in enumerate(r["leaders"], 1):
            rows.append([
                r["code"], r["vx_name"], "ha" if r["vx_open"] else "yo'q", r["parent"],
                r["workers"], len(r["leaders"]), i, x["name"], x["job"], _d(x["hired"]),
                "ha" if x["is_manager"] else "", "ha" if x["is_owner"] else "",
                prof(x) or "profil yo'q", runs(x, "runs"), runs(x, "owns"),
                ("ha" if r["ours"] else "yo'q") + (" (arxivda)" if r["archived"] else ""),
                r["unit"], r["manager"], r["owner"],
                "; ".join(b["name"] + (f" ({', '.join(b['units'])})" if b["units"]
                                       else " (brigadasi yo'q)") for b in r["vx_brigadirs"]),
            ])
    lv._sheet(wb, "Yacheykalar", [
        "Kod", "Verifix nomi", "Verifixda ochiq", "Sex (Verifix)", "Ishlayotganlar",
        "Liderlar soni", "№", "Lider (Verifix)", "Lavozim", "Ishga kirgan",
        "Boshqaruvchi shu", "Egasi shu", "Profil (bizda)", "Profil boshqaradi",
        "Profil egasi", "/cells da", "Brigadir (bizda)", "Boshqaruvchi (bizda)",
        "Egasi (bizda)", "Verifix brigadiri"], rows)

    orows = []
    for r in rep["other"]:
        for i, x in enumerate(r["leaders"], 1):
            orows.append([r["name"], r["code"], WHERE_UZ.get(r["where"], r["where"]),
                          r["parent"], r["workers"], len(r["leaders"]), i, x["name"], x["job"],
                          _d(x["hired"]), prof(x) or "profil yo'q", runs(x, "runs"),
                          runs(x, "owns")])
    lv._sheet(wb, "Boshqa bo'linmalar", [
        "Bo'linma (Verifix)", "Kod", "Nima", "Yuqori bo'linma", "Ishlayotganlar",
        "Liderlar soni", "№", "Lider (Verifix)", "Lavozim", "Ishga kirgan",
        "Profil (bizda)", "Profil boshqaradi", "Profil egasi"], orows)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def send(db: Session, chat_id: int, *_window) -> int:
    """Build once and DM it. A report built by an earlier attempt whose delivery
    failed is sent from its stored record."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    if row:
        rep = json.loads(row.value)
    else:
        try:
            rep = collect(db)
        except Exception as exc:
            db.rollback()
            try:
                lv._post("sendMessage", {
                    "chat_id": chat_id,
                    "text": f"Cells with several Verifix leaders — could not be read: "
                            f"{lv._why(exc)}. It tries again on the next deploy."})
            except Exception:
                pass
            raise
        db.add(AppSetting(key=SNAPSHOT_KEY,
                          value=json.dumps(rep, ensure_ascii=False, default=str)))
        db.commit()
    chunks = cop._chunks(text(rep))
    for c in chunks:
        lv._post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
    stamp = datetime.fromisoformat(rep["at"]).strftime("%d.%m.%Y")
    lv._post("sendDocument", {"chat_id": chat_id,
                              "caption": "Cells with more than one leader on Verifix — one row "
                                         "per leader, with the profile here and what it runs"},
             files={"document": (f"kop-liderli-yacheykalar-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
