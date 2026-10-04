"""One-off (2026-10-04): which supervisor units are run by a BRIGADIR on
Verifix, which by somebody in a brigadir's place, and which Verifix brigadirs
have no unit on the platform at all.

The operator, after the leaders turned out to depend on them: «check the
supervisors if they're actually supervisor or not and put a switch like on the
leaders also for them … report me if there're supervisors whose profile is not
created on our platform». The switch is ``managers.supervisor_kind``
(``services/supervisor_kind.py``); this fills it once, from Verifix's API, on
the server (the login lives only there), and DMs the operator a summary and a
workbook.

WHO is a brigadir on Verifix: a WORKING employee whose job
``supervisor_kind.is_supervisor_job`` — «Бригадир», never an assistant, a
deputy or an «и.о.».

WHICH person runs which unit. Strictly by name first —
``leader_verifix_check._match``, the leader check's rules (folded full name,
surname + first name, a first-name-first spelling). Several people with that
name are narrowed to the one standing in the unit's WORKSHOP — the Verifix
subdivision its cells hang under («Цех - 9 SULTANOVA UMIDA ABDUSALOM QIZI»),
which is where Verifix keeps the brigadir — else to the one with a brigadir's
job. A name the strict rules cannot find is looked for in that workshop alone:
the same first name and a surname at least ``SURNAME_MIN`` alike, exactly one
such person or nobody. That is what ties «Sultonova Umida» to SULTANOVA,
«Kamolova Nargiza» to KOMOLOVA and «O'razov Asqar» to O'ROZOV without ever
letting the fuzzy scorer pick a person: the workshop is the evidence, the
spelling only confirms it.

A first name may differ by a common ending only («Sanjar» / SANJARBEK).

The person's JOB decides: a brigadir's job → «Brigadir»; any other job → «Brigadir
o'rnida». Not found, ambiguous or not working → left undetermined and listed.
A value set by hand is never overwritten.

Reported besides: units whose name Verifix spells differently, one Verifix
person running two units, and every Verifix brigadir no unit answers for —
with the workshop they run, how many people work under it, and which of its
cells the platform has (and whether they have a brigadir here).

Temporary: delete this module, ``startup.check_supervisor_kinds`` /
``_supervisor_kind_job`` and the call in BOTH entrypoints once the report has
landed — and do it before (or with) ``leader_verifix_check``, whose matching and
delivery helpers it imports. ``services/supervisor_kind.py``, the columns and
the switch STAY.
"""
from __future__ import annotations

import difflib
import html
import json
import time
from collections import Counter, defaultdict
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Factory, Manager
from app.services import action_log, supervisor_kind, verifix_explore
from app.services import leader_verifix_check as lv
from app.services.name_map import _name_tokens

TZ = ZoneInfo("Asia/Tashkent")
READ_BUDGET_S = 420.0
SNAPSHOT_KEY = "supervisor_kind_verifix_check_2026_10_04"
# A surname this alike, with the same first name, inside the unit's own
# workshop, is one person typed two ways (Sultonova / SULTANOVA = 0.89).
SURNAME_MIN = 0.75
MIN_PEOPLE = 1000
# A first name with or without the common Uzbek ending is one name — «Sanjar» is
# SANJARBEK on Verifix (unit 3's brigadir, in his own workshop).
# Compared on `_name_tokens`' folding, which turns Y into I — so «oy» is «oi».
_FIRST_ENDINGS = ("bek", "jon", "xon", "oy", "oi")


def _same_first(a: str, b: str) -> bool:
    a, b = a.lower(), b.lower()
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return len(short) >= 3 and long_.startswith(short) and long_[len(short):] in _FIRST_ENDINGS

KIND_WORD = {"supervisor": "Brigadir", "acting": "Brigadir o'rnida", None: "Aniqlanmadi"}
_HOW = {"full": "to'liq ism", "two": "familiya + ism", "swap": "ism + familiya (teskari)",
        "workshop": "o'z sexida, familiya boshqacha yozilgan", "pin": "operator ko'rsatgan"}
_REASON = {
    "not_found": ("not found in Verifix", "Verifixda topilmadi"),
    "not_working": ("in Verifix but not working", "Verifixda bor, ishlamaydi"),
    "ambiguous": ("several Verifix people answer to the name", "Verifixda bir nechta odam mos"),
    "namesake": ("only a namesake with another patronymic", "Faqat otasining ismi boshqa adash"),
    "short_name": ("the unit's name is too short to match", "Brigada nomi to'liq emas"),
    "pin_not_found": ("not found in Verifix", "Verifixda topilmadi"),
}


def _how_text(how: str | None) -> str:
    return " + ".join(_HOW.get(h, h) for h in (how or "").split("+") if h)


# ── reading Verifix ───────────────────────────────────────────────────────────

def _read(db: Session) -> tuple[list[dict], dict]:
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
            "unit_id": e.get("unit") or "", "unit_name": unit.get("name") or "",
            "cell": unit.get("code"), "cell_raw": unit.get("raw_code"),
            "dismissed": e.get("dismissed"), "hired": e.get("hired"),
            "toks": toks, "full": " ".join(toks), "two": " ".join(toks[:2]),
        })
    return out, divs


def _who(x: dict | None) -> dict | None:
    if not x:
        return None
    return {"id": x["id"], "name": x["name"], "job": x["job"], "status": x["status"],
            "unit_name": x["unit_name"], "cell": x["cell_raw"] or x["cell"],
            "dismissed": x["dismissed"], "hired": x.get("hired")}


def _workshop(toks: list[str], home: set, working_rows: list[dict]) -> list[dict]:
    """The people inside the unit's own workshop(s) who could be its brigadir
    spelled another way: the same first name (or it with a common ending,
    `_same_first`), a surname at least SURNAME_MIN alike — either word order."""
    if len(toks) < 2 or not home:
        return []
    out = []
    for x in working_rows:
        if x["unit_id"] not in home or len(x["toks"]) < 2:
            continue
        for sur, first in ((toks[0], toks[1]), (toks[1], toks[0])):
            if (_same_first(first, x["toks"][1])
                    and difflib.SequenceMatcher(None, sur, x["toks"][0]).ratio() >= SURNAME_MIN):
                out.append(x)
                break
    return out


# ── the check ─────────────────────────────────────────────────────────────────

def plan(db: Session, people: list[dict], divs: dict) -> dict:
    working_rows = [p for p in people if p["status"] == "W"]
    working = lv._index(working_rows)
    gone = lv._index([p for p in people if p["status"] != "W"])
    brigadirs = [p for p in working_rows if supervisor_kind.is_supervisor_job(p["job"])]

    # Our cells by code, and the Verifix node each one is — its parent is the
    # workshop («Цех») Verifix keeps the cell's brigadir in.
    node_of_code = {d["code"]: d for d in divs.values() if d.get("code")}
    children: dict[str, list[str]] = defaultdict(list)
    for d in divs.values():
        if d.get("parent"):
            children[d["parent"]].append(d["id"])
    cells = db.query(Cell).all()
    home: dict[int, Counter] = defaultdict(Counter)
    for c in cells:
        k = lv._cell_key(c.verifix_code)
        n = node_of_code.get(k) if k else None
        if c.manager_id and n and n.get("parent") and c.archived_at is None:
            home[c.manager_id][n["parent"]] += 1

    factories = {f.id: (f.name_uz or f.code or str(f.id)) for f in db.query(Factory).all()}
    units = db.query(Manager).order_by(Manager.id).all()
    rows = []
    for m in units:
        toks = _name_tokens(m.name)
        hm = set(home.get(m.id, {}))
        r = {"id": m.id, "name": m.name, "shift": m.shift, "archived": bool(m.archived),
             "factory": factories.get(m.factory_id), "zagruzka_on": bool(m.zagruzka_on),
             "kind_before": m.supervisor_kind,
             "manual": (m.supervisor_kind_meta or {}).get("src") == "manual"
             and m.supervisor_kind in supervisor_kind.KINDS,
             "workshops": [divs[p]["name"] for p in hm if p in divs]}
        if m.archived:
            r.update(emp=None, how=None, reason="archived", cands=[])
            rows.append(r)
            continue
        res = lv._match(toks, set(), set(), working, gone, working_rows)
        emp, how, reason = res.get("emp"), res.get("how"), res.get("reason")
        cands = res.get("cands") or []
        if not emp and reason == "ambiguous":
            inside = [x for x in cands if x["unit_id"] in hm]
            by_job = [x for x in cands if supervisor_kind.is_supervisor_job(x["job"])]
            if len(inside) == 1:
                emp, how = inside[0], "two+workshop"
            elif len(by_job) == 1:
                emp, how = by_job[0], "two+job"
        if not emp and reason in ("not_found", "namesake", "not_working", "pin_not_found"):
            near = _workshop(toks, hm, working_rows)
            if len(near) == 1:
                emp, how = near[0], "workshop"
            elif len(near) > 1:
                reason, cands = "ambiguous", near
        r.update(emp=_who(emp), how=how if emp else None,
                 reason=None if emp else reason, cands=[_who(x) for x in cands][:4])
        r["kind"] = (("supervisor" if supervisor_kind.is_supervisor_job(emp["job"]) else "acting")
                     if emp else None)
        rows.append(r)

    by_emp = Counter(r["emp"]["id"] for r in rows if r.get("emp"))
    for r in rows:
        r["shared"] = bool(r.get("emp") and by_emp[r["emp"]["id"]] > 1)

    # Verifix brigadirs no unit answers for — with what they run.
    matched = set(by_emp)
    cell_by_key = {lv._cell_key(c.verifix_code): c for c in cells if lv._cell_key(c.verifix_code)}
    unit_name = {m.id: m.name for m in units}
    working_in = Counter(p["unit_id"] for p in working_rows)

    def subtree(nid: str) -> list[str]:
        out, stack = [], [nid]
        while stack:
            cur = stack.pop()
            out.append(cur)
            stack.extend(children.get(cur, []))
        return out

    missing = []
    for b in sorted((b for b in brigadirs if b["id"] not in matched), key=lambda b: b["name"]):
        nodes = subtree(b["unit_id"]) if b["unit_id"] else []
        ours, theirs = [], []
        for nid in nodes:
            d = divs.get(nid) or {}
            k = d.get("code")
            if not k or (d.get("state") or "A") != "A":
                continue
            c = cell_by_key.get(k)
            if c is not None:
                ours.append({"code": c.verifix_code, "unit": unit_name.get(c.manager_id),
                             "archived": c.archived_at is not None})
            else:
                theirs.append(d.get("raw_code") or k)
        missing.append({**_who(b), "workshop": b["unit_name"],
                        "people": sum(working_in.get(n, 0) for n in nodes),
                        "cells": sorted(ours, key=lambda x: x["code"]),
                        "other_codes": sorted(theirs)})

    refused = None
    if len(people) < MIN_PEOPLE:
        refused = f"Verifix handed over only {len(people)} employees — a cut answer."
    return {
        "at": datetime.now(TZ).isoformat(timespec="minutes"), "applied": False,
        "refused": refused,
        "vx": {"people": len(people), "working": len(working_rows), "brigadirs": len(brigadirs)},
        "rows": rows, "missing": missing,
    }


def _apply(db: Session, rep: dict) -> None:
    at = supervisor_kind.now_iso()
    by_id = {m.id: m for m in db.query(Manager).all()}
    for r in rep["rows"]:
        m = by_id.get(r["id"])
        if m is None or r["archived"]:
            continue
        e = r["emp"]
        vfx = {"checked_at": at, "found": bool(e)}
        if e:
            vfx.update(id=e["id"], name=e["name"], job=e["job"] or None, cell=e["cell"],
                       status=e["status"], how=r["how"])
        else:
            vfx["reason"] = r["reason"]
            if r["cands"]:
                vfx["count"] = len(r["cands"])
        meta = dict(m.supervisor_kind_meta or {})
        meta["vfx"] = vfx
        if r["manual"]:
            r["saved"] = "manual"
        elif r["kind"]:
            meta.update(src="verifix", at=at, by="Verifix")
            m.supervisor_kind = r["kind"]
            r["saved"] = "set"
        else:
            r["saved"] = "none"
        m.supervisor_kind_meta = meta


def run(db: Session) -> dict:
    people, divs = _read(db)
    rep = plan(db, people, divs)
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
    kinds = Counter(r.get("kind") for r in rep["rows"] if not r["archived"])
    action_log.record_system(
        "identity", "identity.supervisor_kind_verifix", db=db,
        outcome="done" if rep["applied"] else "refused",
        details=[("count", sum(1 for r in rep["rows"] if not r["archived"])),
                 ("sup_supervisor", kinds["supervisor"]), ("sup_acting", kinds["acting"]),
                 ("unresolved", kinds[None]), ("missing", len(rep["missing"]))],
        reason=rep["refused"],
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _dmy(iso) -> str:
    if not iso:
        return "—"
    try:
        return datetime.fromisoformat(str(iso)[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return str(iso)


def _reason(r: dict) -> str:
    words = _REASON.get(r["reason"], (r["reason"] or "—", ""))[0]
    if r["reason"] == "not_working" and r["cands"]:
        x = r["cands"][0]
        words += f" — {x['name']}, dismissed {_dmy(x['dismissed'])}"
    elif r["cands"]:
        words += ": " + "; ".join(f"{x['name']} «{x['job']}»" for x in r["cands"][:3])
    return words


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    rows = [r for r in rep["rows"] if not r["archived"]]
    sup = [r for r in rows if r["kind"] == "supervisor"]
    acting = [r for r in rows if r["kind"] == "acting"]
    unknown = [r for r in rows if not r["kind"]]
    done = rep["applied"]
    L = [f"<b>Supervisors × Verifix</b> · {at:%d.%m.%Y %H:%M}" + ("" if done else " — <b>NOTHING was saved</b>"),
         f"Read from Verifix's API: {rep['vx']['working']:,} working employees, <b>{rep['vx']['brigadirs']}</b> "
         "of them brigadirs by job («Бригадир»). Each unit's brigadir was found by name — strictly, "
         "or with a surname spelled differently but only inside the unit's own workshop on Verifix "
         "(the «Цех» its cells hang under) and with the same first name.",
         f"{len(rows)} active units:",
         f"✅ Brigadir — {len(sup)}",
         f"🔁 Brigadir o'rnida — {len(acting)}",
         f"❓ Not determined — {len(unknown)}", ""]
    if not done:
        L += [f"⚠ Stopped: {_e(rep['refused'])}", ""]
    if acting:
        L.append(f"<b>🔁 Brigadir o'rnida — {len(acting)}</b> (Verifix job is not a brigadir's)")
        for r in acting:
            e = r["emp"]
            L.append(f"  {_e(r['name'])} — Verifix {_e(e['name'])} «{_e(e['job'])}»"
                     + (f" · {_e(e['cell'] or e['unit_name'])}" if (e["cell"] or e["unit_name"]) else ""))
        L.append("")
    if unknown:
        L.append(f"<b>❓ Not determined — {len(unknown)}</b> (set it by hand on the profile page)")
        for r in unknown:
            L.append(f"  {_e(r['name'])} — {_e(_reason(r))}")
        L.append("")
    if sup:
        L.append(f"<b>✅ Brigadir — {len(sup)}</b>: " + "; ".join(_e(r["name"]) for r in sup))
        L.append("")
    spelled = [r for r in rows if r.get("emp") and r["how"] in ("workshop", "swap")]
    if spelled:
        L.append("Verifix spells or orders the name differently (matched in the unit's own "
                 "workshop): " + "; ".join(f"{_e(r['name'])} → {_e(r['emp']['name'])}"
                                         for r in spelled))
    shared = defaultdict(list)
    for r in rows:
        if r.get("shared"):
            shared[r["emp"]["name"]].append(r["name"])
    for person, names in shared.items():
        L.append(f"One person, two units: {_e(person)} runs {_e(' and '.join(names))}.")
    kept = [r for r in rows if r.get("saved") == "manual"]
    if kept:
        L.append("Set by hand and left as they were: " + "; ".join(_e(r["name"]) for r in kept))
    if spelled or shared or kept:
        L.append("")

    miss = rep["missing"]
    L.append(f"<b>👤 Brigadirs on Verifix with no unit here — {len(miss)}</b>")
    if not miss:
        L.append("None — every Verifix brigadir runs a unit on the platform.")
    for b in miss:
        L.append(f"<b>{_e(b['name'])}</b> — «{_e(b['workshop'] or '—')}» · {b['people']} working "
                 f"people under it · hired {_dmy(b['hired'])}")
        if b["cells"]:
            parts = []
            for c in b["cells"]:
                tag = (" archived" if c["archived"] else
                       (f" {c['unit']}" if c["unit"] else " no brigadir"))
                parts.append(f"{c['code']} ({tag.strip()})")
            L.append("  cells here: " + _e(", ".join(parts)))
        if b["other_codes"]:
            L.append("  other codes under it: " + _e(", ".join(b["other_codes"])))
    L.append("")
    L.append("The «Lavozim (Verifix)» switch («Brigadir» / «Brigadir o'rnida») and the new "
             "«Zagruzka hisoblanadi» switch are on every brigadir's profile page. Every unit that "
             "exists today is switched ON; a unit created from now on starts OFF until somebody "
             "says its загрузка counts. Every unit with its Verifix person is in the workbook.")
    return "\n".join(L).strip()


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    saved = {"set": "ha (Verifix)", "manual": "yo'q — qo'lda belgilangan", "none": "yo'q"}
    lv._sheet(wb, "Brigadirlar", [
        "ID", "Brigada", "Smena", "Zavod", "Arxivda", "Natija", "Verifix ismi", "Verifix lavozimi",
        "Verifix bo'limi", "Verifix holati", "Qanday topildi", "Sabab", "Platformadagi sexlari (Verifix)",
        "Profilga saqlandi", "Zagruzka hisoblanadi", "Bitta odam ikki brigadada"],
        [[r["id"], r["name"], r["shift"], r["factory"], "ha" if r["archived"] else "",
          KIND_WORD[r.get("kind")] if not r["archived"] else "arxivda — tekshirilmadi",
          (r.get("emp") or {}).get("name"), (r.get("emp") or {}).get("job"),
          (r.get("emp") or {}).get("unit_name"), (r.get("emp") or {}).get("status"),
          _how_text(r.get("how")),
          _REASON.get(r.get("reason"), (None, r.get("reason") if r.get("reason") != "archived" else ""))[1]
          if not r.get("emp") else "",
          "; ".join(r["workshops"]), saved.get(r.get("saved"), ""),
          "ha" if r["zagruzka_on"] else "yo'q", "ha" if r.get("shared") else ""]
         for r in rep["rows"]])
    lv._sheet(wb, "Profilsiz brigadirlar", [
        "Verifix ismi", "Lavozim", "Sex (Verifix)", "Ishlayotganlar", "Platformadagi yacheykalari",
        "Boshqa kodlar", "Ishga kirgan"],
        [[b["name"], b["job"], b["workshop"], b["people"],
          ", ".join(f"{c['code']}" + (" (arxiv)" if c["archived"] else
                                       f" ({c['unit']})" if c["unit"] else " (brigadirsiz)")
                    for c in b["cells"]),
          ", ".join(b["other_codes"]), _dmy(b["hired"])] for b in rep["missing"]])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def send(db: Session, chat_id: int, *_window) -> int:
    """Check once and DM the report. A check already saved by an earlier attempt
    whose delivery failed is never run twice — its stored record is sent."""
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
                    "text": f"Supervisors × Verifix could not run: {lv._why(exc)}. Nothing was "
                            "saved; it tries again on the next deploy."})
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
                              "caption": "Supervisors × Verifix — every unit with its Verifix "
                                         "person, and every Verifix brigadir with no unit here"},
             files={"document": (f"brigadirlar-verifix-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
