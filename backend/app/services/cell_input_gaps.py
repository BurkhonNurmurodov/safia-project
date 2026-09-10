"""Cells that HAD PEOPLE and were never answered on «Zagruzka fayli».

The operator asked, on 2026-09-10, for one question to be answered once, in
their own chat, as a file they can sort and filter:

    a supervisor has people on this cell for this date — the verifix
    attendance upload put them there — but never wrote a PLAN or an
    «Odam soni» for that cell on the «Zagruzka fayli» page.

**Why this is not the report next door.** `zagruzka_gaps` asks its cell-level
questions of the cells that FILED OJIDANIYA: its whole cell population comes
from `ojidaniya_cost._events`. A cell where twelve people stood all shift and
nothing was ever filed is invisible to it — and that is the commonest shape of
this fault, because a cell nobody typed is usually a cell nobody is looking at
at all. The subject here is the attendance file, so the population is the
attendance file.

**THE trap, and the whole reason this module counts its own headcount.** From
`zagruzka_source.ZAGRUZKA_FROM` the platform's own «how many people are in this
cell» — `idle_source.cell_headcount` / `_n_by_cell` — answers with the TYPED
«Bugungi fakt» pin, not with attendance. That is correct there and fatal here:
the pin is precisely the thing whose absence is being reported, so a population
built from it would drop every cell this file exists to name and the report
would come back empty and look like good news. So the people are read straight
off `Attendance.verifix_code`, through `idle_source._counted_hc` and the
`hc_weight` sum — the same predicate `_n_by_cell` applies on its own pre-floor
half, imported rather than re-spelled, so «people stood in this cell» means
here exactly what it means everywhere else.

**Nothing is re-measured.** The typed pins come from
`zagruzka_source.typed_people` and the plan minutes from
`zagruzka_source.wc_labor` — which `unit_labor`, the загрузка's own numerator,
is a fold of — so this file and the page cannot report different figures for one
day. The cell → work centre link is `Cell.sap_code`, exactly as
`zagruzka_source.cell_people` resolves it.

**The window starts at `ZAGRUZKA_FROM`.** Before that floor «Odam soni» and
«Трудоёмкость» came from the two sheet tabs and the production page answered
nothing, so nothing on it could have been left unfilled. Attendance-by-cell is
older than the floor; the report is not, and saying otherwise would accuse
supervisors of not filling a page that was not yet the source.

**The two questions are INDEPENDENT columns, never one verdict** — the ruling
`zagruzka_gaps` already records. «No plan» is fixed on «Позиции» and «no odam
soni» on «Odamlar soni»; a single reason column would answer one of them and
hide the other, including — on most rows — the very one the operator asked
about. So each row carries both, and the headline counts them separately.

**Two facts outrank both, because they make either answer impossible.** A cell
with no `sap_code` is not attached to the production page at all, and one whose
code is in no catalog line will never have a plan on any day. Those are fixed on
`/cells/:id`, not on «Zagruzka fayli», so they are their own verdicts and they
also get a dateless register of their own — a cell with no SAP code is wrong
today and was wrong last week, and dating it invites a reader to fix it per day.

The whole errand — collect, format, deliver — is one module on purpose: it is a
one-shot behind a flag in `startup.report_cell_input_gaps_xlsx`, and it should
be deletable in one file once the operator has the answer. The workbook
primitives come from `quality_export` / `ojidaniya_export`, the house report
style; only the WORDS live here, the rule `ojidaniya_deck` already follows,
because a boot job has no browser in the loop to send them.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from io import BytesIO

import requests
from openpyxl import Workbook
from openpyxl.formatting.rule import DataBarRule
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (Attendance, DayApproval, Factory, Manager, PPProduct)
from app.services import idle_source, ojidaniya_cost, zagruzka_source
from app.services.ojidaniya_export import (CENTER, DATE_FMT, HC, INDIGO, MIN,
                                           _iso, _unp_cell, _unp_head, _xl)
from app.services.quality_export import (AMBER, BAND, BRAND_SOFT, GREEN,
                                         INK_SOFT, NUM, ORANGE, PANEL, RED,
                                         RIGHT, SLATE, _banner, _fill,
                                         _kpi_cards, _meta_strip, _section,
                                         _sheet)

# A week of a 22-unit plant is a few hundred cell-days; the cap exists so a
# misaimed call can never try to render a year into one file.
MAX_ROWS = 5000

# Verdict keys, in the order they are DECIDED — the first two make both of the
# operator's questions unanswerable, so they outrank them.
V_NO_SAP = "no_sap"
V_WC_UNKNOWN = "wc_unknown"
V_NEITHER = "neither"
V_NO_PEOPLE = "no_people"
V_PEOPLE_ZERO = "people_zero"
V_NO_PLAN = "no_plan"
V_OK = "ok"

# key -> (label, what it does to the number, where it is fixed).
# Every text names the SURFACE the fix lives on: a register the reader cannot
# act on from is a list of complaints.
VERDICTS: dict[str, tuple[str, str, str]] = {
    V_NO_SAP: (
        "Yacheykaga SAP ish markazi biriktirilmagan",
        "Yacheykada odamlar ishlagan, lekin u «Zagruzka fayli» sahifasiga "
        "umuman ulanmagan: na reja, na odam soni kiritilishi mumkin. Bu "
        "odamlar ΣN ga hech qachon qo'shilmaydi.",
        "/cells/:id → SAP kodi"),
    V_WC_UNKNOWN: (
        "Yacheykaning ish markazi katalogda yo'q",
        "Yacheykaning SAP kodi brigadir katalogida uchramaydi — bu ish "
        "markazida hech qachon reja bo'lmaydi. Yo kod xato, yo katalogda bu "
        "ish markazi yo'q.",
        "/cells/:id → SAP kodi yoki /production → «Позиции»"),
    V_NEITHER: (
        "Odam soni ham, reja ham kiritilmagan",
        "Yacheykada odamlar ishlagan, uning ish markazida esa na «Bugungi "
        "fakt», na reja daqiqalari bor. Bu yacheyka загрузка hisobida umuman "
        "ko'rinmaydi — ishlagan odamlar ham, ular bajargan ish ham.",
        "/production → «Odamlar soni» va «Позиции»"),
    V_NO_PEOPLE: (
        "Odam soni kiritilmagan",
        "Yacheykada odamlar ishlagan, ish markaziga «Bugungi fakt» "
        "kiritilmagan. Brigadirning BUTUN trudoyomkosti faqat kiritilgan "
        "odamlarga bo'linadi, shuning uchun загрузка haqiqiydan YUQORI "
        "chiqadi; yacheykaning kutishi ham o'lchovga kirmaydi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    V_PEOPLE_ZERO: (
        "Odam soni 0 kiritilgan, lekin davomatda odam bor",
        "Verifix fayli bu yacheykaga odam yozgan, «Bugungi fakt» esa 0. Ikki "
        "manba bir-biriga zid; 0 bo'luvchi bo'la olmaydi, shuning uchun "
        "yacheyka kutish o'lchoviga umuman kirmaydi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    V_NO_PLAN: (
        "Reja kiritilmagan",
        "Yacheykada odamlar ishlagan va odam soni kiritilgan, lekin ish "
        "markazida o'sha kuni reja daqiqalari yo'q. Odamlar ΣN ga qo'shiladi, "
        "daqiqalar qo'shilmaydi — загрузка PAST chiqadi.",
        "/production → «Позиции» → ПЛАН"),
    V_OK: ("To'ldirilgan", "", ""),
}

# Dateless config gaps — one row per CELL, not per day.
REG_PROBLEMS: dict[str, tuple[str, str, str]] = {
    V_NO_SAP: (
        "Yacheykada SAP ish markazi yo'q",
        "Bu yacheyka «Zagruzka fayli» sahifasiga ulanmagan: unda ishlagan "
        "odamlar sanalmaydi, kutishi esa o'lchovga kirmaydi.",
        "/cells/:id → SAP kodi"),
    V_WC_UNKNOWN: (
        "Yacheykaning SAP ish markazi katalogda yo'q",
        "Yacheyka brigadir katalogida bo'lmagan ish markazini ko'rsatadi — "
        "unda hech qachon reja bo'lmaydi.",
        "/cells/:id → SAP kodi yoki /production → «Позиции»"),
}

# Where the gap sits, so the reader knows which page to open.
FIX_PAGE = {
    V_NO_SAP: "/cells", V_WC_UNKNOWN: "/cells",
    V_NEITHER: "/production", V_NO_PEOPLE: "/production",
    V_PEOPLE_ZERO: "/production", V_NO_PLAN: "/production",
}


def _fmt(n: float, dec: int = 0) -> str:
    """Uzbek number formatting: space thousands, comma decimal."""
    s = f"{n:,.{dec}f}".replace(",", " ")
    return s.replace(".", ",") if dec else s


def _days(date_from: date, date_to: date) -> list[date]:
    n = (date_to - date_from).days + 1
    return [date_from + timedelta(days=i) for i in range(max(n, 0))]


def collect(db: Session, date_from: date, date_to: date) -> dict:
    """Every (cell, day) the verifix file put people in, and what the
    «Zagruzka fayli» page says about it.

    The scope is the whole plant with no narrowing: every non-archived unit,
    both shifts, every factory — and only from `zagruzka_source.ZAGRUZKA_FROM`,
    below which the production page was not the source of either input.
    """
    lo = zagruzka_source.range_start(date_from, date_to)
    empty = {
        "from": date_from, "to": date_to, "floor": zagruzka_source.ZAGRUZKA_FROM,
        "start": lo, "rows": [], "all_rows": [], "registry": [],
        "truncated": False, "by_verdict": {}, "by_manager": {},
        "totals": {"gaps": 0, "pairs": 0, "no_people": 0, "no_plan": 0,
                   "unattached": 0, "people_lost": 0.0, "people_total": 0.0,
                   "units": 0, "cells": 0, "registry": 0},
    }
    if lo is None or lo > date_to:
        return empty

    managers = {m.id: m for m in
                db.query(Manager).filter(Manager.archived.is_(False)).all()}
    if not managers:
        return empty
    ids = sorted(managers)
    factories = {f.id: (f.code or f.name_ru or f.name_uz or "")
                 for f in db.query(Factory).all()}

    cells = ojidaniya_cost._cells_of(db, ids)
    if not cells:
        return empty
    leaders = ojidaniya_cost._leader_names(db, cells)
    by_code = {c.verifix_code: c for c in cells if c.verifix_code}

    # ── the PEOPLE, read straight off the verifix upload ─────────────────────
    # NOT `idle_source.cell_headcount`: from the floor that answers with the
    # typed pin, i.e. with the very thing whose absence is the subject here, so
    # every cell this report exists to name would drop out of its own
    # population. `_counted_hc` and the `hc_weight` sum are imported so «people
    # stood in this cell» means here exactly what it means to the загрузка.
    # COLUMNS, not the entity — the query must not depend on every column the
    # model has ever grown.
    people: dict[tuple[str, str], float] = defaultdict(float)
    heads: dict[tuple[str, str], int] = defaultdict(int)
    att_units: dict[tuple[str, str], set[int]] = defaultdict(set)
    if by_code:
        for r in db.query(
            Attendance.verifix_code, Attendance.date, Attendance.manager_id,
            Attendance.job_title, Attendance.hours_worked,
            Attendance.is_supervisor, Attendance.worker_name,
            Attendance.hc_weight,
        ).filter(
            Attendance.verifix_code.in_(list(by_code)),
            Attendance.date >= lo, Attendance.date <= date_to,
            Attendance.is_supervisor.is_(False),
        ).all():
            if not idle_source._counted_hc(r):
                continue
            key = (r.verifix_code, r.date.isoformat())
            people[key] += 1.0 if r.hc_weight is None else float(r.hc_weight)
            heads[key] += 1
            if r.manager_id is not None:
                att_units[key].add(int(r.manager_id))
    if not people:
        return empty

    # ── the two загрузка inputs, from the functions the page divides by ──────
    pins = zagruzka_source.typed_people(db, ids, lo, date_to)
    labor = zagruzka_source.wc_labor(db, ids, lo, date_to)
    pins_by_day: dict[tuple[int, str], dict[str, float]] = defaultdict(dict)
    for (mid, day, wc), n in pins.items():
        pins_by_day[(mid, day)][wc] = n
    labor_by_day: dict[tuple[int, str], dict[str, tuple[float, float]]] = defaultdict(dict)
    for (mid, day, wc), pa in labor.items():
        labor_by_day[(mid, day)][wc] = pa

    # The catalog, for «this work centre is not in it at all».
    cat_wcs: dict[int, set[str]] = defaultdict(set)
    for p in db.query(PPProduct.manager_id, PPProduct.work_center,
                      PPProduct.active).filter(PPProduct.manager_id.in_(ids)).all():
        if p.active:
            cat_wcs[int(p.manager_id)].add((p.work_center or "").strip())

    closed = {(int(mid), d.isoformat()) for mid, d in db.query(
        DayApproval.manager_id, DayApproval.date).filter(
        DayApproval.manager_id.in_(ids),
        DayApproval.date >= lo, DayApproval.date <= date_to).all()}

    # How many cells of one unit name one work centre: the typed pin is ONE box
    # for all of them (`zagruzka_source.cell_people` splits it evenly), so the
    # fix is one box and the row must say so rather than reading as N faults.
    share: dict[tuple[int, str], int] = defaultdict(int)
    for c in cells:
        code = (c.sap_code or "").strip()
        if code and c.manager_id is not None:
            share[(int(c.manager_id), code)] += 1

    rows: list[dict] = []
    all_rows: list[dict] = []
    by_verdict: dict[str, dict] = defaultdict(lambda: {"rows": 0, "units": set(),
                                                       "people": 0.0})
    by_manager: dict[int, dict] = defaultdict(
        lambda: {"pairs": 0, "gaps": 0, "no_people": 0, "no_plan": 0,
                 "unattached": 0, "people_lost": 0.0, "people": 0.0,
                 "cells": set()})

    for (code, day), n in people.items():
        c = by_code.get(code)
        if c is None or c.manager_id is None:
            continue
        mid = int(c.manager_id)
        m = managers.get(mid)
        if m is None:
            continue

        wc = (c.sap_code or "").strip()
        wcn = pins_by_day.get((mid, day), {})
        wcp = labor_by_day.get((mid, day), {})
        pin = wcn.get(wc) if wc else None
        plan, actual = wcp.get(wc, (0.0, 0.0)) if wc else (0.0, 0.0)

        # The two questions, answered INDEPENDENTLY. None = unanswerable,
        # because the cell reaches no work centre this unit's catalog carries.
        in_catalog = bool(wc) and wc in cat_wcs.get(mid, ())
        typed_ok = None if not wc else (pin is not None and pin > 0)
        plan_ok = None if not wc else (plan > 0)

        if not wc:
            verdict = V_NO_SAP
        elif not in_catalog:
            verdict = V_WC_UNKNOWN
        elif pin is None and plan <= 0:
            verdict = V_NEITHER
        elif pin is None:
            verdict = V_NO_PEOPLE
        elif pin <= 0:
            verdict = V_PEOPLE_ZERO
        elif plan <= 0:
            verdict = V_NO_PLAN
        else:
            verdict = V_OK

        planned = {w for w, (pp, _a) in wcp.items() if pp > 0}
        row = {
            "date": day, "shift": m.shift, "manager": m.name or "",
            "manager_id": mid, "factory": factories.get(m.factory_id, ""),
            "cell": code, "leader": leaders.get(c.leader_id) or "",
            "wc": wc, "verdict": verdict,
            "people": round(n, 2), "heads": heads[(code, day)],
            "pin": pin, "plan": plan or None, "actual": actual or None,
            "typed_ok": typed_ok, "plan_ok": plan_ok,
            "in_catalog": in_catalog if wc else None,
            "shared": share.get((mid, wc), 0) if wc else 0,
            "wc_planned": len(planned), "wc_typed": len(wcn),
            "unit_typed_any": bool(wcn),
            "closed": (mid, day) in closed,
            "fix_page": FIX_PAGE.get(verdict, ""),
            # The cell belongs to one unit; the rows carrying its code may have
            # been written under another (an exchange, a mis-typed «Код
            # подразделения»). Named, never silently resolved — the pin lives
            # on the CELL's own unit, so that is where the fix has to happen.
            "att_other": sorted(
                (managers[u].name or str(u))
                for u in att_units[(code, day)] if u != mid and u in managers),
        }
        all_rows.append(row)

        by_manager[mid]["pairs"] += 1
        by_manager[mid]["people"] += n
        by_manager[mid]["cells"].add(code)
        if verdict == V_OK:
            continue

        rows.append(row)
        by_verdict[verdict]["rows"] += 1
        by_verdict[verdict]["units"].add(mid)
        by_verdict[verdict]["people"] += n
        by_manager[mid]["gaps"] += 1
        if typed_ok is not True:
            by_manager[mid]["no_people"] += 1
            # The people the загрузка never counted: ΣN is built from the typed
            # pins alone, so a cell with none contributes nobody.
            by_manager[mid]["people_lost"] += n
        if plan_ok is not True:
            by_manager[mid]["no_plan"] += 1
        if verdict in (V_NO_SAP, V_WC_UNKNOWN):
            by_manager[mid]["unattached"] += 1

    # ── the dateless config gaps: one row per CELL ───────────────────────────
    seen_cells = {r["cell"] for r in rows}
    registry: list[dict] = []
    for c in cells:
        if c.manager_id is None or int(c.manager_id) not in managers:
            continue
        mid = int(c.manager_id)
        wc = (c.sap_code or "").strip()
        if not wc:
            key = V_NO_SAP
        elif wc not in cat_wcs.get(mid, ()):
            key = V_WC_UNKNOWN
        else:
            continue
        label, why, fix = REG_PROBLEMS[key]
        m = managers[mid]
        registry.append({
            "key": key, "problem": label, "why": why, "fix": fix,
            "manager": m.name or "", "shift": m.shift,
            "factory": factories.get(m.factory_id, ""),
            "cell": c.verifix_code or "", "wc": wc,
            "leader": leaders.get(c.leader_id) or "",
            # Whether this dateless fault actually cost anybody in the window,
            # so the reader can start with the cells people really stood in.
            "hit": (c.verifix_code or "") in seen_cells,
        })

    rows.sort(key=lambda r: (r["date"], r["manager"], r["cell"]))
    all_rows.sort(key=lambda r: (r["date"], r["manager"], r["cell"]))
    registry.sort(key=lambda r: (not r["hit"], r["key"], r["manager"], r["cell"]))
    truncated = len(rows) > MAX_ROWS

    totals = {
        "gaps": len(rows),
        "pairs": len(all_rows),
        # The two the operator asked for, counted independently of which
        # verdict each row was primarily diagnosed as.
        "no_people": sum(1 for r in rows if r["typed_ok"] is not True),
        "no_plan": sum(1 for r in rows if r["plan_ok"] is not True),
        "unattached": sum(1 for r in rows
                          if r["verdict"] in (V_NO_SAP, V_WC_UNKNOWN)),
        "people_lost": sum(r["people"] for r in rows if r["typed_ok"] is not True),
        "people_total": sum(r["people"] for r in all_rows),
        "units": len({r["manager_id"] for r in rows}),
        "cells": len({r["cell"] for r in rows}),
        "registry": len(registry),
    }
    return {
        "from": date_from, "to": date_to, "floor": zagruzka_source.ZAGRUZKA_FROM,
        "start": lo, "rows": rows[:MAX_ROWS], "all_rows": all_rows[:MAX_ROWS],
        "registry": registry, "truncated": truncated,
        "by_verdict": {k: {"rows": v["rows"], "units": len(v["units"]),
                           "people": round(v["people"], 1)}
                       for k, v in by_verdict.items()},
        "by_manager": {managers[k].name or str(k):
                       {**v, "cells": len(v["cells"])}
                       for k, v in by_manager.items() if v["gaps"]},
        "totals": totals,
    }


# ── the register as a workbook ───────────────────────────────────────────────
# Four sheets, one SUBJECT each. «Kamchiliklar» is the action list — one row
# per cell-day somebody has to fill, every fact about it a column, autofiltered.
# «Hammasi» is the DENOMINATOR: every cell-day the verifix file put people in,
# so «38 of 412» can be read rather than asserted — without it a reader cannot
# tell a plant-wide fault from a rounding error. «Registr» carries what has no
# date, because dating a cell with no SAP code invites a reader to fix it per
# day. «Xulosa» carries neither register, only the counts.

def _yn(v) -> str:
    return "—" if v is None else ("Ha" if v else "Yo'q")


def _title(rep: dict) -> tuple[str, str]:
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    return ("Odamlari bor, «Zagruzka fayli»da to'ldirilmagan yacheykalar",
            f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')} · "
            "barcha zavodlar · ikkala smena")


def _scope(rep: dict) -> list[dict]:
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    return [
        {"label": "Davr", "value":
            f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')}"},
        {"label": "Qamrov", "value":
            "Barcha brigadirlar · ikkala smena · barcha zavodlar"},
        {"label": "Savol", "value":
            "Yacheykada odam bor (verifix davomati), lekin o'sha kuni unga "
            "reja yoki «Odam soni» kiritilmagan"},
        {"label": "Odamlar", "value":
            "Verifix yuklamasidan: to'g'ridan-to'g'ri rolda, ishga chiqqan, "
            "ismi bor (brigadirning o'zi hisobga olinmaydi)"},
        {"label": "Manba chegarasi", "value":
            f"{rep['floor'].strftime('%d.%m.%Y')} — shu kundan загрузка "
            "«Zagruzka fayli» sahifasidan o'qiladi"},
        {"label": "Hisoblash", "value":
            "Sahifaning o'z funksiyalari — bu yerda hech narsa qayta "
            "o'lchanmaydi"},
    ]


def _kpis(rep: dict) -> list[dict]:
    t = rep["totals"]
    return [
        {"value": t["no_people"], "label": "«Odam soni» kiritilmagan",
         "color": RED, "hint": "yacheykada odam bor, «Bugungi fakt» yo'q"},
        {"value": t["no_plan"], "label": "Reja kiritilmagan",
         "color": RED, "hint": "yacheykada odam bor, reja daqiqalari yo'q"},
        {"value": t["gaps"], "label": "Muammoli yacheyka-kun",
         "color": ORANGE, "hint": f"{t['pairs']} odamli yacheyka-kundan"},
        {"value": t["unattached"], "label": "Sahifaga ulanmagan",
         "color": AMBER, "hint": "SAP kodi yo'q yoki katalogda yo'q"},
        {"value": round(t["people_lost"]), "label": "ΣN dan tushib qolgan odam",
         "color": SLATE, "hint": f"jami {_fmt(t['people_total'], 1)} odamdan"},
        {"value": t["cells"], "label": "Yacheyka",
         "color": INDIGO, "hint": f"{t['units']} brigadir · "
                                  f"{t['registry']} registr yozuvi"},
    ]


def _summary(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    ws = _sheet(wb, L["shSummary"], {2: 46, 3: 14, 4: 12, 5: 12, 6: 12, 7: 12,
                                     8: 14, 9: 14, 10: 14, 11: 14, 12: 12, 13: 12})
    r = _banner(ws, 2, 2, 13, p["title"], p["subtitle"])
    r = _meta_strip(ws, r, 2, 13, p["scope"])
    r = _kpi_cards(ws, r, 2, p["kpis"])

    if p.get("note"):
        _unp_cell(ws, r, 2, p["note"], _fill(BRAND_SOFT), size=10)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=13)
        r += 2

    r = _section(ws, r, 2, 13, L["byVerdict"], L["byVerdictHint"])
    r = _unp_head(ws, r, 2, [(L["verdict"], 46), (L["fixPage"], 14),
                             (L["rowsCol"], 12), (L["unitsCol"], 12),
                             (L["peopleCol"], 12)])
    first = r
    for i, x in enumerate(p["verdicts"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["label"]), bg, bold=True, color=RED)
        _unp_cell(ws, r, 3, x["page"], bg, align=CENTER, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 4, x["rows"], bg, fmt=NUM, align=RIGHT, bold=True, size=10)
        _unp_cell(ws, r, 5, x["units"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 6, x["people"], bg, fmt=HC, align=RIGHT)
        r += 1
    if r > first:
        ws.conditional_formatting.add(
            f"D{first}:D{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=RED))
    _unp_cell(ws, r, 2, L["total"], _fill(BRAND_SOFT), bold=True, size=10)
    _unp_cell(ws, r, 3, None, _fill(BRAND_SOFT))
    _unp_cell(ws, r, 4, p["totals"]["gaps"], _fill(BRAND_SOFT), fmt=NUM,
              align=RIGHT, bold=True, size=10)
    _unp_cell(ws, r, 5, p["totals"]["units"], _fill(BRAND_SOFT), fmt=NUM,
              align=RIGHT, bold=True)
    _unp_cell(ws, r, 6, None, _fill(BRAND_SOFT))
    r += 3

    r = _section(ws, r, 2, 13, L["byManager"], L["byManagerHint"])
    r = _unp_head(ws, r, 2, [(L["manager"], 46), (L["pairsCol"], 14),
                             (L["gapsCol"], 12), (L["noPeopleCol"], 14),
                             (L["noPlanCol"], 12), (L["unattachedCol"], 14),
                             (L["cellsCol"], 12), (L["lostPeople"], 16)])
    first = r
    for i, x in enumerate(p["managers"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 3, x["pairs"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 4, x["gaps"], bg, fmt=NUM, align=RIGHT, bold=True,
                  color=RED if x["gaps"] else INK_SOFT)
        _unp_cell(ws, r, 5, x["no_people"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 6, x["no_plan"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 7, x["unattached"] or None, bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 8, x["cells"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 9, round(x["people_lost"], 1) or None, bg, fmt=HC,
                  align=RIGHT, color=RED)
        r += 1
    if r > first:
        ws.conditional_formatting.add(
            f"D{first}:D{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=ORANGE))
    ws.freeze_panes = ws.cell(3, 2)


_ROW_COLS = [
    ("date", 11), ("shift", 8), ("factory", 12), ("manager", 26),
    ("cell", 11), ("leader", 24), ("wc", 13), ("verdict", 44),
    ("typedOk", 15), ("planOk", 13), ("people", 12), ("heads", 11),
    ("pin", 13), ("plan", 12), ("actual", 12), ("shared", 14),
    ("wcTyped", 13), ("wcPlanned", 12), ("closed", 13),
    ("why", 62), ("fix", 36), ("attOther", 26),
]


def _rows_sheet(wb: Workbook, p: dict, key: str, sheet: str, sub: str,
                only_gaps: bool) -> None:
    """«Kamchiliklar» and «Hammasi» are ONE table over two row sets — the
    second is the first's denominator, so a column that meant something
    different on one of them would make the pair unreadable."""
    L = p["labels"]
    cols = [(L[k], w) for k, w in _ROW_COLS]
    ws = _sheet(wb, sheet, {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], sub)
    t = p["totals"]
    hint = (f"{len(p[key])} {L['rowsWord']}"
            + (f" · {L['truncated']}" if p.get("truncated") and only_gaps else ""))
    if not only_gaps:
        hint = f"{t['gaps']} / {t['pairs']} {L['gapsOf']}"
    r = _section(ws, r, 2, last, sheet, hint)
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p[key]):
        ok = x["verdict"] == V_OK
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _iso(x["date"]), bg, fmt=DATE_FMT, align=CENTER)
        _unp_cell(ws, r, 3, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 4, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, _xl(x["cell"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 7, _xl(x["leader"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 8, _xl(x["wc"]), bg, align=CENTER)
        _unp_cell(ws, r, 9, _xl(x["verdictLabel"]), bg, bold=not ok,
                  color=GREEN if ok else RED)
        _unp_cell(ws, r, 10, x["typedLabel"], bg, align=CENTER, size=9,
                  bold=x["typed_ok"] is not True,
                  color=GREEN if x["typed_ok"] is True else RED)
        _unp_cell(ws, r, 11, x["planLabel"], bg, align=CENTER, size=9,
                  bold=x["plan_ok"] is not True,
                  color=GREEN if x["plan_ok"] is True else RED)
        _unp_cell(ws, r, 12, x["people"], bg, fmt=HC, align=RIGHT, bold=True)
        _unp_cell(ws, r, 13, x["heads"], bg, fmt=NUM, align=RIGHT, color=INK_SOFT)
        _unp_cell(ws, r, 14, x["pin"], bg, fmt=HC, align=RIGHT)
        _unp_cell(ws, r, 15, x["plan"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 16, x["actual"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 17, x["sharedLabel"], bg, align=CENTER, size=9,
                  color=INK_SOFT)
        _unp_cell(ws, r, 18, x["wc_typed"], bg, fmt=NUM, align=RIGHT, color=INK_SOFT)
        _unp_cell(ws, r, 19, x["wc_planned"], bg, fmt=NUM, align=RIGHT, color=INK_SOFT)
        _unp_cell(ws, r, 20, x["closedLabel"], bg, align=CENTER, size=9,
                  color=GREEN if x["closed"] else RED)
        _unp_cell(ws, r, 21, _xl(x["why"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 22, _xl(x["fix"]), bg, size=9)
        _unp_cell(ws, r, 23, _xl(x["attOther"]), bg, size=9, color=AMBER)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 7)
    ws.print_title_rows = f"{head}:{head}"


def _registry_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["problem"], 42), (L["factory"], 12), (L["shift"], 8),
            (L["manager"], 26), (L["cell"], 11), (L["wc"], 13),
            (L["leader"], 24), (L["hitCol"], 18), (L["why"], 62), (L["fix"], 36)]
    ws = _sheet(wb, L["shRegistry"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["registrySub"])
    r = _section(ws, r, 2, last, L["shRegistry"],
                 f"{len(p['registry'])} {L['rowsWord']}")
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["registry"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["problem"]), bg, bold=True, color=AMBER)
        _unp_cell(ws, r, 3, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 4, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, _xl(x["cell"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 7, _xl(x["wc"]), bg, align=CENTER)
        _unp_cell(ws, r, 8, _xl(x["leader"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 9, x["hitLabel"], bg, align=CENTER, size=9,
                  bold=x["hit"], color=RED if x["hit"] else INK_SOFT)
        _unp_cell(ws, r, 10, _xl(x["why"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 11, _xl(x["fix"]), bg, size=9)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 3)
    ws.print_title_rows = f"{head}:{head}"


def build_workbook(p: dict) -> BytesIO:
    """`payload()`'s output as the four-sheet file. A formatter: it re-derives
    nothing, so the file and the caption can only ever state one set of
    numbers."""
    L = p["labels"]
    wb = Workbook()
    wb.remove(wb.active)
    _summary(wb, p)
    _rows_sheet(wb, p, "rows", L["shRows"], L["rowsSub"], True)
    _rows_sheet(wb, p, "all_rows", L["shAll"], L["allSub"], False)
    _registry_sheet(wb, p)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── the words ────────────────────────────────────────────────────────────────
# Uzbek Latin, whoever it reaches: this file is built by a boot job, so there is
# no browser in the loop to send the labels the way a page export does.

XLS_LABELS = {
    "shSummary": "Xulosa", "shRows": "Kamchiliklar", "shAll": "Hammasi",
    "shRegistry": "Registr",
    "byVerdict": "Kamchilik turi bo'yicha",
    "byVerdictHint": "har bir tur bo'yicha yacheyka-kunlar",
    "byManager": "Brigadirlar bo'yicha", "byManagerHint": "faqat kamchiligi borlari",
    "verdict": "Kamchilik", "fixPage": "Qaysi sahifa", "rowsCol": "Yacheyka-kun",
    "unitsCol": "Brigadir", "peopleCol": "Odam", "total": "JAMI",
    "rowsWord": "qator", "truncated": "ro'yxat qisqartirildi",
    "date": "Sana", "shift": "Smena", "factory": "Zavod", "manager": "Brigadir",
    "cell": "Yacheyka", "leader": "Lider", "wc": "Ish markazi",
    "typedOk": "Odam soni bormi", "planOk": "Reja bormi",
    "people": "Davomatda odam", "heads": "Qator",
    "pin": "«Bugungi fakt»", "plan": "Reja, daq", "actual": "Fakt, daq",
    "shared": "IM ni bo'lishish", "wcTyped": "Kiritilgan IM",
    "wcPlanned": "Rejali IM", "closed": "Kun yopilgan",
    "why": "Raqamga ta'siri", "fix": "Qayerda to'ldiriladi",
    "attOther": "Davomat boshqa brigadirda",
    "problem": "Kamchilik", "hitCol": "Shu davrda odam bo'lgan",
    "pairsCol": "Odamli yacheyka-kun", "gapsCol": "Kamchilik",
    "noPeopleCol": "Odam soni yo'q", "noPlanCol": "Reja yo'q",
    "unattachedCol": "Ulanmagan", "cellsCol": "Yacheyka",
    "lostPeople": "ΣN dan tushgan odam",
    "gapsOf": "odamli yacheyka-kunda kamchilik bor",
    "rowsSub": "Har bir to'ldirilmagan yacheyka-kun — bitta qator. Ustunlar "
               "bo'yicha filtrlang: «Odam soni bormi», «Reja bormi», "
               "«Kamchilik», «Brigadir»",
    "allSub": "Verifix davomati odam yozgan HAR BIR yacheyka-kun — "
              "to'ldirilganlari ham. Bu «Kamchiliklar» varag'ining maxraji",
    "registrySub": "Sanasi yo'q kamchiliklar — bugun ham, o'tgan hafta ham "
                   "noto'g'ri: bir marta to'g'rilanadi",
}


def _shared_label(n: int) -> str:
    """A work centre named by several cells is ONE «Bugungi fakt» box, and the
    row has to say so or N cells read as N separate faults."""
    return "—" if n <= 1 else f"{n} ta yacheyka"


def payload(rep: dict) -> dict:
    """`collect`'s output in the shape `build_workbook` reads. Pure
    re-labelling — no figure is computed or rounded here, so the file, the
    caption and the register can only ever state one set of numbers."""
    title, subtitle = _title(rep)
    verdicts = [
        {"key": k, "label": VERDICTS[k][0], "page": FIX_PAGE.get(k, ""),
         "rows": v["rows"], "units": v["units"], "people": v["people"]}
        for k, v in rep["by_verdict"].items()
    ]
    verdicts.sort(key=lambda x: -x["rows"])
    managers = [{"manager": k, **v} for k, v in rep["by_manager"].items()]
    managers.sort(key=lambda x: (-x["gaps"], -x["people_lost"]))

    note = ""
    if not rep["rows"]:
        note = ("Bu davrda odamlari bo'lgan har bir yacheykaga «Odam soni» ham, "
                "reja ham kiritilgan — to'ldirilmagan yacheyka-kun topilmadi.")
    elif rep["truncated"]:
        note = (f"Ro'yxat {MAX_ROWS} qator bilan cheklandi — «Xulosa»dagi "
                "raqamlar to'liq davrni qamraydi.")

    def _row(r: dict) -> dict:
        label, why, fix = VERDICTS[r["verdict"]]
        return {**r, "verdictLabel": label, "why": why, "fix": fix,
                "typedLabel": _yn(r["typed_ok"]), "planLabel": _yn(r["plan_ok"]),
                "closedLabel": _yn(r["closed"]),
                "sharedLabel": _shared_label(r["shared"]),
                "attOther": ", ".join(r["att_other"])}

    return {
        "labels": XLS_LABELS, "title": title, "subtitle": subtitle,
        "scope": _scope(rep), "kpis": _kpis(rep), "note": note,
        "verdicts": verdicts, "managers": managers,
        "rows": [_row(r) for r in rep["rows"]],
        "all_rows": [_row(r) for r in rep["all_rows"]],
        "registry": [{**x, "hitLabel": "Ha" if x["hit"] else "—"}
                     for x in rep["registry"]],
        "totals": rep["totals"], "truncated": rep["truncated"],
    }


def _caption(rep: dict) -> str:
    """Telegram caps a document caption at 1024 chars, so this is the question
    the operator asked and the figures that frame it — the file carries the
    rest."""
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    t = rep["totals"]
    head = (f"📋 <b>Odamlari bor, «Zagruzka fayli»da to'ldirilmagan "
            f"yacheykalar</b>\n{d1.strftime('%d.%m.%Y')} – "
            f"{d2.strftime('%d.%m.%Y')} · barcha brigadirlar · ikkala smena")
    if not rep["rows"] and not rep["registry"]:
        return head + "\n\nBu davrda to'ldirilmagan yacheyka-kun topilmadi."
    lines = [head, "",
             f"🔴 <b>{_fmt(t['no_people'])}</b> — yacheykada odam bor, "
             "«Odam soni» kiritilmagan",
             f"🔴 <b>{_fmt(t['no_plan'])}</b> — yacheykada odam bor, "
             "reja kiritilmagan",
             f"⚠️ <b>{_fmt(t['gaps'])}</b> / {_fmt(t['pairs'])} odamli "
             f"yacheyka-kunda kamchilik ({_fmt(t['cells'])} yacheyka · "
             f"{_fmt(t['units'])} brigadir)",
             f"🔌 <b>{_fmt(t['unattached'])}</b> — yacheyka sahifaga umuman "
             "ulanmagan (SAP kodi yo'q yoki katalogda yo'q)",
             f"👥 <b>{_fmt(t['people_lost'], 1)}</b> odam ΣN dan tushib qoldi "
             f"({_fmt(t['people_total'], 1)} odamdan)",
             "",
             "<i>«Kamchiliklar» — har bir to'ldirilmagan yacheyka-kun alohida "
             "qator. «Hammasi» — o'sha davrdagi hamma odamli yacheyka-kun "
             "(maxraj). «Registr» — sanasiz sozlama kamchiliklari "
             f"({_fmt(t['registry'])}).</i>"]
    return "\n".join(lines)[:1024]


def send_xlsx(db: Session, chat_id: int, date_from: date, date_to: date) -> int:
    """Build the workbook and DM it. Returns 1 on delivery.

    Deliberately NOT `xlsx_delivery.deliver_file`: that decides between a
    browser download and a Telegram DM from the REQUEST it was called on, and
    there is no request here — a boot job has one surface and it is the chat.
    """
    rep = collect(db, date_from, date_to)
    buf = build_workbook(payload(rep))
    name = (f"yacheyka-toldirilmagan-{date_from.strftime('%d.%m.%Y')}-"
            f"{date_to.strftime('%d.%m.%Y')}.xlsx")
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
        data={"chat_id": chat_id, "caption": _caption(rep), "parse_mode": "HTML"},
        files={"document": (name, buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet")},
        timeout=180)
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(j.get("description") or f"HTTP {r.status_code}")
    return 1
