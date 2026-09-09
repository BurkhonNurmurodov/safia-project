"""What is still UNFILLED before a загрузка figure can be trusted.

The operator asked, on 2026-09-09, for two questions to be answered once, in
their own chat, as a file they can sort and filter:

* who did not type «Odam soni» for a work centre that HAS a plan;
* who filed ojidaniya on a cell that has no plan on the «Zagruzka fayli» page;

…and, beyond those two, for anything else that has to be filled before the
загрузка is right and is not being filled.

**Nothing is re-measured here.** Every input is read from the function the
platform itself divides by: the typed pins from `zagruzka_source.typed_people`,
the trudoyomkost from `zagruzka_source.wc_labor` — which `unit_labor`, the
загрузка's own numerator, is now a fold of, so this file and the page cannot
report different minutes — the day-close gate from `brigadirs._closed_pairs`,
the cells' waiting from `ojidaniya_cost._events` / `_union`, the weighing rule
from `zagruzka_source.cell_people`, and the counted-category set from
`sheets_reader.OJIDANIYA_ONLY_CATS`. A second spelling of any of them is how a
report about a number and the number itself start disagreeing.

**A (unit, day) is in scope only if the unit WORKED it** — attendance exists
for that pair, the same predicate `build_metrics_list` skips on and the heatmap
draws its pending markers from. Telling a brigadir they did not type the people
for a day their unit never ran is how a register teaches its reader to ignore
it.

**The window starts at `zagruzka_source.ZAGRUZKA_FROM`.** Before that floor the
two inputs came from the «Одам сони» and «Минут» sheet tabs and the production
page answered nothing, so nothing on it could have been left unfilled.

**Two severities, and they are not the same news.** ``block`` — the unit-day
has NO загрузка at all, which is the blank the operator can already see on the
heatmap; ``skew`` — the figure EXISTS and is wrong, which nothing on any page
says out loud. The second is why this report is worth sending: a load computed
against 4 of 6 typed work centres reads too HIGH and is indistinguishable on
screen from a genuinely overloaded unit.

**The two cell questions are INDEPENDENT columns, not one verdict.** Whether a
cell's waiting is WEIGHED (its work centre carries a typed pin — exactly
`cell_people`'s rule) and whether that cell had a PLAN are different facts with
different fixes, and a single «reason» column would answer one of them and hide
the other — including, on most rows, the very one the operator asked about. So
each row carries both, and the headline counts them separately.

The whole errand — collect, format, deliver — is one module on purpose: it is a
one-shot behind a flag in `startup.report_zagruzka_gaps_xlsx`, and it should be
deletable in one file once the operator has the answer. The workbook primitives
are imported from `quality_export` / `ojidaniya_export`, which are the house
report style; only the WORDS live here, the rule `ojidaniya_deck` already
follows, because a boot job has no browser in the loop to send them.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from io import BytesIO

import requests
from openpyxl import Workbook
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (Attendance, Cell, DayApproval, Factory, Manager,
                        PPProduct)
from app.services import idle_source, ojidaniya_cost, zagruzka_source
from app.services.ojidaniya_export import (CENTER, DATE_FMT, HC, INDIGO, MIN,
                                           _iso, _unp_cell, _unp_head, _xl)
from app.services.quality_export import (AMBER, BAND, BRAND_SOFT, GREEN, INK_SOFT,
                                         NUM, ORANGE, PANEL, RED, RIGHT, SLATE,
                                         _banner, _fill, _kpi_cards, _meta_strip,
                                         _section, _sheet)
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

# A week of a 22-unit plant is hundreds of rows, not thousands; the cap exists
# so a misaimed call can never try to render a year into one file.
MAX_ROWS = 5000

BLOCK = "block"      # the unit-day has NO загрузка at all
SKEW = "skew"        # it has one and it is wrong

IMPACT = {
    BLOCK: "Загрузка hisoblanmaydi",
    SKEW: "Загрузка noto'g'ri chiqadi",
}

# key -> (label, severity, what it does to the number, where it is fixed).
# Every text names the SURFACE the fix lives on: a register the reader cannot
# act on from is a list of complaints.
PROBLEMS: dict[str, tuple[str, str, str, str]] = {
    # ── unit-day: there is no figure at all ──────────────────────────────────
    "unit_not_closed": (
        "Kun yopilmagan", BLOCK,
        "Davomat yuklangan, lekin kun yopilmagan — yopilmagan kun birorta KPIga kirmaydi.",
        "/staff → «Kunni yopish»"),
    "unit_no_people": (
        "Odam soni umuman kiritilmagan", BLOCK,
        "Bu kuni birorta ham ish markaziga «Bugungi fakt» kiritilmagan. Odam soni "
        "bo'luvchi bo'lgani uchun kun bo'sh qoladi (issiqlik xaritasidagi 👥).",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    "unit_no_plan": (
        "Trudoyomkost yo'q (REJA 0)", BLOCK,
        "Odam soni kiritilgan, lekin katalog bo'yicha reja daqiqalari 0 — "
        "загрузкаning suratini hech narsa bermaydi (📄).",
        "/production → «Позиции» → ПЛАН / katalog"),
    "unit_no_actual": (
        "FAKT kiritilmagan", BLOCK,
        "Reja bor, fakt 0. Nisbat = fakt ÷ reja = 0, shuning uchun hech qanday "
        "загрузка hisoblanmaydi — bu holat issiqlik xaritasida BELGILANMAYDI ham.",
        "/production → «Позиции» → ФАКТ yoki SAP faylni yuklash"),
    # ── work centre: the figure exists and is WRONG ──────────────────────────
    "wc_no_people": (
        "Rejali ish markaziga odam soni kiritilmagan", SKEW,
        "Ish markazida reja bor, «Bugungi fakt» yo'q. Brigadirning BUTUN "
        "trudoyomkosti faqat kiritilgan odamlarga bo'linadi, shuning uchun "
        "загрузка haqiqiydan YUQORI chiqadi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    "wc_people_zero": (
        "Odam soni 0 kiritilgan", SKEW,
        "Reja bor, odam soni 0. 0 bo'luvchi bo'la olmaydi: bu ish markazidagi "
        "yacheykalar kutish o'lchoviga umuman kirmaydi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    "wc_no_plan": (
        "Odam kiritilgan, lekin reja yo'q", SKEW,
        "«Bugungi fakt» kiritilgan, bu ish markazida reja daqiqalari esa yo'q. "
        "Odamlar ΣN ga qo'shiladi, daqiqalar qo'shilmaydi — загрузка PAST chiqadi.",
        "/production → «Позиции» → ПЛАН"),
    "wc_no_actual": (
        "Ish markazida FAKT yo'q", SKEW,
        "Rejasi bor ish markazida fakt 0 — brigadirning fakt÷reja nisbati "
        "pasayadi va load bazasi (480 × nisbat) qisqaradi.",
        "/production → «Позиции» → ФАКТ"),
    # ── cell: waiting the загрузка cannot see ────────────────────────────────
    "cell_no_sap": (
        "Kutish bor, yacheykaga SAP ish markazi biriktirilmagan", SKEW,
        "Yacheyka kutish yozgan, lekin SAP kodi yo'q — u «Zagruzka fayli» "
        "sahifasiga umuman ulanmagan: na reja, na odam soni. Bu daqiqalar "
        "brigadirning o'rtachasiga HECH QACHON kirmaydi.",
        "/cells/:id → SAP kodi"),
    "cell_not_typed": (
        "Kutish bor, ish markaziga odam soni kiritilmagan", SKEW,
        "Yacheyka kutish yozgan, uning ish markaziga «Bugungi fakt» kiritilmagan. "
        "Og'irligi 0 bo'lgani uchun bu daqiqalar brigadir o'rtachasidan tushib "
        "qoladi — kutish bordek ko'rinadi, hisobga esa olinmaydi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    "cell_typed_zero": (
        "Kutish bor, odam soni 0 kiritilgan", SKEW,
        "Yacheyka kutish yozgan, ish markaziga 0 kiritilgan. 0 og'irlik — bu "
        "daqiqalar brigadir o'rtachasiga kirmaydi.",
        "/production → «Odamlar soni» → «Bugungi fakt»"),
    "cell_wc_unknown": (
        "Kutish bor, yacheykaning ish markazi katalogda yo'q", SKEW,
        "Yacheykaning SAP kodi brigadir katalogida umuman uchramaydi, shuning "
        "uchun unda hech qachon reja bo'lmaydi — yoki kod xato, yoki katalogda "
        "bu ish markazi yo'q.",
        "/cells/:id → SAP kodi yoki /production → «Позиции»"),
    "cell_no_plan": (
        "Kutish bor, o'sha kuni reja yo'q", SKEW,
        "Yacheyka kutish yozgan, lekin uning ish markazida o'sha kuni reja "
        "daqiqalari yo'q: rejasiz yacheykada kutish. Yo reja kiritilmagan, yo "
        "kutish noto'g'ri yacheykaga yozilgan.",
        "/production → «Позиции» → ПЛАН"),
}

# Config gaps with no date of their own — one row per object, not per day.
REG_PROBLEMS: dict[str, tuple[str, str, str]] = {
    "reg_cell_no_sap": (
        "Yacheykada SAP ish markazi yo'q",
        "Bu yacheyka «Zagruzka fayli» sahifasiga ulanmagan: uning odamlari "
        "sanalmaydi, kutishi esa o'lchovga kirmaydi.",
        "/cells/:id → SAP kodi"),
    "reg_cell_wc_unknown": (
        "Yacheykaning SAP ish markazi katalogda yo'q",
        "Yacheyka brigadir katalogida bo'lmagan ish markazini ko'rsatadi — unda "
        "hech qachon reja bo'lmaydi.",
        "/cells/:id → SAP kodi yoki /production → «Позиции»"),
    "reg_line_no_labor": (
        "Katalog qatorida Трудоемкость yo'q",
        "Labor_time kiritilmagan qator trudoyomkostga 0 daqiqa qo'shadi — reja "
        "jimgina kamayadi va загрузка past chiqadi.",
        "/production → «Позиции» → Трудоемкость"),
    "reg_unit_no_catalog": (
        "Brigadirda katalog yo'q",
        "Faol katalog qatorlari yo'q — bu brigadirda hech qachon trudoyomkost "
        "bo'lmaydi, demak hech qachon загрузка ham bo'lmaydi.",
        "/production → «Позиции»"),
}

VERDICT = {
    "ok": "Hisoblandi",
    "unit_not_closed": "Kun yopilmagan",
    "unit_no_people": "Odam soni yo'q",
    "unit_no_plan": "Reja yo'q",
    "unit_no_actual": "Fakt yo'q",
}


def _fmt(n: float, dec: int = 0) -> str:
    """Uzbek number formatting: space thousands, comma decimal."""
    s = f"{n:,.{dec}f}".replace(",", " ")
    return s.replace(".", ",") if dec else s


def _days(date_from: date, date_to: date) -> list[date]:
    n = (date_to - date_from).days + 1
    return [date_from + timedelta(days=i) for i in range(max(n, 0))]


def collect(db: Session, date_from: date, date_to: date) -> dict:
    """Every unfilled input that moves — or blanks — a загрузка figure.

    The scope is the whole plant with no narrowing: every non-archived unit,
    both shifts, every factory. Only days the unit actually worked, and only
    from `zagruzka_source.ZAGRUZKA_FROM`, below which the production page was
    not the source of anything.
    """
    lo = zagruzka_source.range_start(date_from, date_to)
    empty = {
        "from": date_from, "to": date_to, "floor": zagruzka_source.ZAGRUZKA_FROM,
        "rows": [], "days": [], "registry": [], "truncated": False,
        "by_problem": {}, "by_manager": {}, "totals": {
            "blockers": 0, "skews": 0, "day_rows": 0, "days_lost": 0,
            "wc_no_people": 0, "cell_no_plan": 0, "idle_lost": 0.0,
            "idle_total": 0.0, "units": 0, "problems": 0,
        },
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

    # ── the day actually RAN: attendance exists (the heatmap's own predicate) ─
    att_pairs = {(int(mid), d.isoformat()) for mid, d in db.query(
        Attendance.manager_id, Attendance.date).filter(
        Attendance.manager_id.in_(ids),
        Attendance.date >= lo, Attendance.date <= date_to).distinct().all()}
    closed = {(int(mid), d.isoformat()) for mid, d in db.query(
        DayApproval.manager_id, DayApproval.date).filter(
        DayApproval.manager_id.in_(ids),
        DayApproval.date >= lo, DayApproval.date <= date_to).all()}

    # ── the two загрузка inputs, from the functions the page divides by ──────
    pins = zagruzka_source.typed_people(db, ids, lo, date_to)
    labor = zagruzka_source.wc_labor(db, ids, lo, date_to)

    pins_by_day: dict[tuple[int, str], dict[str, float]] = defaultdict(dict)
    for (mid, day, wc), n in pins.items():
        pins_by_day[(mid, day)][wc] = n
    labor_by_day: dict[tuple[int, str], dict[str, tuple[float, float]]] = defaultdict(dict)
    for (mid, day, wc), pa in labor.items():
        labor_by_day[(mid, day)][wc] = pa

    # ── the catalog, for «this work centre is not in it at all» ──────────────
    cat_wcs: dict[int, set[str]] = defaultdict(set)
    no_labor_lines: list[dict] = []
    for p in db.query(PPProduct).filter(PPProduct.manager_id.in_(ids)).all():
        if not p.active:
            continue
        mid = int(p.manager_id)
        cat_wcs[mid].add((p.work_center or "").strip())
        if p.labor_time is None:
            no_labor_lines.append({
                "manager_id": mid, "wc": (p.work_center or "").strip(),
                "sap": (p.sap_code or "").strip(), "name": p.name or "",
            })

    # ── the cells and what they filed ────────────────────────────────────────
    cells = ojidaniya_cost._cells_of(db, ids)
    leaders = ojidaniya_cost._leader_names(db, cells)
    by_unit_cells: dict[int, list] = defaultdict(list)
    for c in cells:
        if c.manager_id is not None:
            by_unit_cells[int(c.manager_id)].append(c)

    units_src = idle_source.cell_units(db)
    wanted = [d.isoformat() for d in _days(lo, date_to)]
    # Approved + stopped, minus the categories the загрузка never counts
    # (`OJIDANIYA_ONLY_CATS` — Cat H today): a Cat H minute was never going to
    # reach the load, so listing it as lost would be a false alarm.
    per_pair: dict[tuple[int, str], list] = defaultdict(list)
    for e in ojidaniya_cost._events(db, cells, wanted):
        if (e.category or "") in OJIDANIYA_ONLY_CATS:
            continue
        per_pair[(e.cell_id, e.date)].append(e)

    rows: list[dict] = []
    day_rows: list[dict] = []
    by_problem: dict[str, dict] = defaultdict(lambda: {"rows": 0, "units": set()})
    by_manager: dict[int, dict] = defaultdict(
        lambda: {"block": 0, "skew": 0, "lost_days": 0, "days": 0,
                 "wc_no_people": 0, "cell_no_plan": 0, "idle_lost": 0.0})

    def emit(key: str, *, mid: int, day: str, level: str, wc: str = "",
             cell: str = "", leader: str = "", plan=None, actual=None,
             people=None, idle=None, weighed=None, has_plan=None,
             wc_planned=None, wc_typed=None, note: str = "") -> None:
        label, sev, why, fix = PROBLEMS[key]
        m = managers[mid]
        rows.append({
            "key": key, "problem": label, "impact": IMPACT[sev], "sev": sev,
            "why": why, "fix": fix, "level": level, "date": day,
            "shift": m.shift, "factory": factories.get(m.factory_id, ""),
            "manager": m.name or "", "manager_id": mid, "wc": wc,
            "cell": cell, "leader": leader, "plan": plan, "actual": actual,
            "people": people, "idle": idle,
            "weighed": weighed, "has_plan": has_plan,
            "wc_planned": wc_planned, "wc_typed": wc_typed,
            "closed": (mid, day) in closed, "note": note,
        })
        by_problem[key]["rows"] += 1
        by_problem[key]["units"].add(mid)
        by_manager[mid]["block" if sev == BLOCK else "skew"] += 1

    for mid in ids:
        m = managers[mid]
        for d in _days(lo, date_to):
            day = d.isoformat()
            if (mid, day) not in att_pairs:
                continue                     # the unit did not work this day

            wcp = labor_by_day.get((mid, day), {})
            wcn = pins_by_day.get((mid, day), {})
            planned = {wc for wc, (p, _a) in wcp.items() if p > 0}
            typed_planned = {wc for wc in planned if wc in wcn}
            unit_plan = sum(p for p, _a in wcp.values())
            unit_actual = sum(a for _p, a in wcp.values())
            unit_people = sum(wcn.values())
            is_closed = (mid, day) in closed

            by_manager[mid]["days"] += 1

            # ── unit level: does a figure exist at all? ──────────────────────
            verdict = "ok"
            if not is_closed:
                verdict = "unit_not_closed"
                emit("unit_not_closed", mid=mid, day=day, level="unit",
                     plan=unit_plan or None, actual=unit_actual or None,
                     people=unit_people if wcn else None,
                     wc_planned=len(planned), wc_typed=len(typed_planned))
            if not wcn:
                verdict = "unit_no_people" if verdict == "ok" else verdict
                emit("unit_no_people", mid=mid, day=day, level="unit",
                     plan=unit_plan or None, actual=unit_actual or None,
                     wc_planned=len(planned), wc_typed=0)
            elif unit_plan <= 0:
                verdict = "unit_no_plan" if verdict == "ok" else verdict
                emit("unit_no_plan", mid=mid, day=day, level="unit",
                     people=unit_people, wc_planned=0, wc_typed=0)
            elif unit_actual <= 0:
                verdict = "unit_no_actual" if verdict == "ok" else verdict
                emit("unit_no_actual", mid=mid, day=day, level="unit",
                     plan=unit_plan, actual=0, people=unit_people,
                     wc_planned=len(planned), wc_typed=len(typed_planned))
            if verdict != "ok":
                by_manager[mid]["lost_days"] += 1

            # ── work-centre level: the figure exists and is wrong ────────────
            for wc in sorted(planned):
                plan, actual = wcp[wc]
                n = wcn.get(wc)
                if n is None:
                    emit("wc_no_people", mid=mid, day=day, level="wc", wc=wc,
                         plan=plan, actual=actual,
                         wc_planned=len(planned), wc_typed=len(typed_planned))
                    by_manager[mid]["wc_no_people"] += 1
                elif n <= 0:
                    emit("wc_people_zero", mid=mid, day=day, level="wc", wc=wc,
                         plan=plan, actual=actual, people=n,
                         wc_planned=len(planned), wc_typed=len(typed_planned))
                if actual <= 0:
                    emit("wc_no_actual", mid=mid, day=day, level="wc", wc=wc,
                         plan=plan, actual=0, people=n,
                         wc_planned=len(planned), wc_typed=len(typed_planned))
            for wc in sorted(wcn):
                if wcp.get(wc, (0.0, 0.0))[0] <= 0:
                    emit("wc_no_plan", mid=mid, day=day, level="wc", wc=wc,
                         plan=0, actual=wcp.get(wc, (0.0, 0.0))[1] or None,
                         people=wcn[wc],
                         wc_planned=len(planned), wc_typed=len(typed_planned))

            # ── cell level: waiting the загрузка cannot see ──────────────────
            idle_total = 0.0
            idle_lost = 0.0
            if idle_source.uses_cells(units_src, mid, d):
                for c in by_unit_cells.get(mid, ()):
                    evs = per_pair.get((c.id, day))
                    if not evs:
                        continue
                    minutes = ojidaniya_cost._union(evs)
                    if minutes <= 0:
                        continue
                    idle_total += minutes
                    wc = (c.sap_code or "").strip()
                    n = wcn.get(wc) if wc else None
                    # EXACTLY `zagruzka_source.cell_people`'s rule: a cell is
                    # weighed only through a work centre carrying a pin above 0.
                    weighed = bool(wc) and n is not None and n > 0
                    plan = wcp.get(wc, (0.0, 0.0))[0] if wc else 0.0
                    has_plan = plan > 0
                    if not weighed:
                        idle_lost += minutes
                    if not wc:
                        key = "cell_no_sap"
                    elif n is None:
                        key = "cell_not_typed"
                    elif n <= 0:
                        key = "cell_typed_zero"
                    elif not has_plan:
                        key = ("cell_wc_unknown" if wc not in cat_wcs.get(mid, ())
                               else "cell_no_plan")
                    else:
                        continue            # weighed and planned — nothing wrong
                    emit(key, mid=mid, day=day, level="cell", wc=wc,
                         cell=c.verifix_code or "",
                         leader=leaders.get(c.leader_id) or "",
                         plan=plan or None, people=n, idle=minutes,
                         weighed=weighed, has_plan=has_plan,
                         note=f"{len(evs)} yozuv")
                    if not has_plan:
                        by_manager[mid]["cell_no_plan"] += 1
                    if not weighed:
                        by_manager[mid]["idle_lost"] += minutes

            day_rows.append({
                "date": day, "shift": m.shift, "manager": m.name or "",
                "manager_id": mid, "factory": factories.get(m.factory_id, ""),
                "closed": is_closed, "verdict": verdict,
                "wc_planned": len(planned), "wc_typed": len(typed_planned),
                "people": unit_people if wcn else None,
                "plan": unit_plan or None, "actual": unit_actual or None,
                "idle": idle_total, "idle_lost": idle_lost,
            })

    # ── the dateless config gaps ─────────────────────────────────────────────
    registry: list[dict] = []
    for c in cells:
        mid = int(c.manager_id) if c.manager_id is not None else None
        if mid is None or mid not in managers:
            continue
        wc = (c.sap_code or "").strip()
        if not wc:
            key = "reg_cell_no_sap"
        elif wc not in cat_wcs.get(mid, ()):
            key = "reg_cell_wc_unknown"
        else:
            continue
        label, why, fix = REG_PROBLEMS[key]
        registry.append({
            "key": key, "problem": label, "why": why, "fix": fix,
            "manager": managers[mid].name or "", "shift": managers[mid].shift,
            "factory": factories.get(managers[mid].factory_id, ""),
            "cell": c.verifix_code or "", "wc": wc,
            "leader": leaders.get(c.leader_id) or "", "detail": "",
        })
    for ln in no_labor_lines:
        label, why, fix = REG_PROBLEMS["reg_line_no_labor"]
        m = managers.get(ln["manager_id"])
        if m is None:
            continue
        registry.append({
            "key": "reg_line_no_labor", "problem": label, "why": why, "fix": fix,
            "manager": m.name or "", "shift": m.shift,
            "factory": factories.get(m.factory_id, ""), "cell": "",
            "wc": ln["wc"], "leader": "",
            "detail": f"{ln['sap']} · {ln['name']}".strip(" ·"),
        })
    for mid in ids:
        if cat_wcs.get(mid):
            continue
        label, why, fix = REG_PROBLEMS["reg_unit_no_catalog"]
        m = managers[mid]
        registry.append({
            "key": "reg_unit_no_catalog", "problem": label, "why": why,
            "fix": fix, "manager": m.name or "", "shift": m.shift,
            "factory": factories.get(m.factory_id, ""), "cell": "", "wc": "",
            "leader": "", "detail": "",
        })

    rows.sort(key=lambda r: (r["date"], r["manager"], r["level"],
                             r["wc"] or "", r["cell"] or ""))
    day_rows.sort(key=lambda r: (r["date"], r["manager"]))
    registry.sort(key=lambda r: (r["key"], r["manager"], r["cell"], r["wc"]))
    truncated = len(rows) > MAX_ROWS

    totals = {
        "blockers": sum(1 for r in rows if r["sev"] == BLOCK),
        "skews": sum(1 for r in rows if r["sev"] == SKEW),
        "day_rows": len(day_rows),
        "days_lost": sum(1 for r in day_rows if r["verdict"] != "ok"),
        # The two the operator asked for, counted independently of which
        # problem each row was primarily diagnosed as.
        "wc_no_people": sum(1 for r in rows if r["key"] == "wc_no_people"),
        "cell_no_plan": sum(1 for r in rows
                            if r["level"] == "cell" and r["has_plan"] is False),
        "idle_lost": sum(r["idle"] or 0 for r in rows
                         if r["level"] == "cell" and r["weighed"] is False),
        "idle_total": sum(r["idle"] or 0 for r in day_rows),
        "units": len({r["manager_id"] for r in rows}),
        "problems": len(rows),
        "registry": len(registry),
    }
    return {
        "from": date_from, "to": date_to, "floor": zagruzka_source.ZAGRUZKA_FROM,
        "start": lo,
        "rows": rows[:MAX_ROWS], "days": day_rows, "registry": registry,
        "truncated": truncated,
        "by_problem": {k: {"rows": v["rows"], "units": len(v["units"])}
                       for k, v in by_problem.items()},
        "by_manager": {managers[k].name or str(k): v
                       for k, v in by_manager.items() if v["block"] or v["skew"]},
        "totals": totals,
    }


# ── the register as a workbook ───────────────────────────────────────────────
# Four sheets, one SUBJECT each. «Muammolar» is the action list — one row per
# thing somebody has to fill, every fact about it a column, autofiltered.
# «Kunlar» is the denominator: one row per unit-day the unit worked, so «96 of
# 154 lost their figure» can be read rather than asserted. «Registr» carries
# what has no date — a cell with no SAP code is wrong today and was wrong last
# week — because dating it would invite a reader to fix it per day. «Xulosa»
# carries neither register, only the counts.

def _yn(v) -> str:
    return "—" if v is None else ("Ha" if v else "Yo'q")


def _title(rep: dict) -> tuple[str, str]:
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    return ("Загрузка uchun to'ldirilmagan ma'lumotlar",
            f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')} · "
            "barcha zavodlar · ikkala smena")


def _scope(rep: dict) -> list[dict]:
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    return [
        {"label": "Davr", "value": f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')}"},
        {"label": "Qamrov", "value": "Barcha brigadirlar · ikkala smena · barcha zavodlar"},
        {"label": "Kunlar", "value": "Faqat davomat yuklangan (ishlagan) kunlar"},
        {"label": "Manba chegarasi", "value":
            f"{rep['floor'].strftime('%d.%m.%Y')} — shu kundan загрузка "
            "«Zagruzka fayli» sahifasidan o'qiladi"},
        {"label": "Kutish", "value": "Tasdiqlangan · to'xtagan · загрузкада "
                                     "hisoblanadigan toifalar (Cat H emas)"},
        {"label": "Hisoblash", "value": "Sahifaning o'z funksiyalari — bu yerda "
                                        "hech narsa qayta o'lchanmaydi"},
    ]


def _kpis(rep: dict) -> list[dict]:
    t = rep["totals"]
    return [
        {"value": t["wc_no_people"], "label": "Odam soni yo'q (rejali IM-kun)",
         "color": RED, "hint": "reja bor, «Bugungi fakt» kiritilmagan"},
        {"value": t["cell_no_plan"], "label": "Rejasiz yacheykada kutish",
         "color": RED, "hint": "kutish yozilgan, o'sha kuni reja yo'q"},
        {"value": t["days_lost"], "label": "Загрузкаsiz kun-brigadir",
         "color": ORANGE, "hint": f"{t['day_rows']} ishlagan kun-brigadirdan"},
        {"value": t["skews"], "label": "Raqamni buzadigan muammo",
         "color": AMBER, "hint": "raqam bor, lekin noto'g'ri"},
        {"value": round(t["idle_lost"]), "label": "Yo'qolgan kutish, daq",
         "color": SLATE, "hint": f"jami {_fmt(t['idle_total'])} daqiqadan"},
        {"value": t["problems"], "label": "Jami muammo",
         "color": INDIGO, "hint": f"{t['units']} brigadir · "
                                    f"{t['registry']} registr yozuvi"},
    ]


def _summary(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    ws = _sheet(wb, L["shSummary"], {2: 44, 3: 22, 4: 12, 5: 12, 6: 12, 7: 12,
                                     8: 14, 9: 14, 10: 14, 11: 14, 12: 12, 13: 12})
    title, subtitle = p["title"], p["subtitle"]
    r = _banner(ws, 2, 2, 13, title, subtitle)
    r = _meta_strip(ws, r, 2, 13, p["scope"])
    r = _kpi_cards(ws, r, 2, p["kpis"])

    if p.get("note"):
        _unp_cell(ws, r, 2, p["note"], _fill(BRAND_SOFT), size=10)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=13)
        r += 2

    r = _section(ws, r, 2, 13, L["byProblem"], L["byProblemHint"])
    r = _unp_head(ws, r, 2, [(L["problem"], 44), (L["impact"], 22),
                             (L["rowsCol"], 12), (L["unitsCol"], 12)])
    first = r
    for i, x in enumerate(p["problems"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["label"]), bg)
        _unp_cell(ws, r, 3, x["impact"], bg, align=CENTER, size=9,
                  color=RED if x["sev"] == BLOCK else AMBER, bold=True)
        _unp_cell(ws, r, 4, x["rows"], bg, fmt=NUM, align=RIGHT, bold=True, size=10)
        _unp_cell(ws, r, 5, x["units"], bg, fmt=NUM, align=RIGHT)
        r += 1
    if r > first:
        ws.conditional_formatting.add(
            f"D{first}:D{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=RED))
    _unp_cell(ws, r, 2, L["total"], _fill(BRAND_SOFT), bold=True, size=10)
    _unp_cell(ws, r, 3, None, _fill(BRAND_SOFT))
    _unp_cell(ws, r, 4, p["totals"]["problems"], _fill(BRAND_SOFT), fmt=NUM,
              align=RIGHT, bold=True, size=10)
    _unp_cell(ws, r, 5, p["totals"]["units"], _fill(BRAND_SOFT), fmt=NUM,
              align=RIGHT, bold=True)
    r += 3

    r = _section(ws, r, 2, 13, L["byManager"], L["byManagerHint"])
    r = _unp_head(ws, r, 2, [(L["manager"], 44), (L["daysCol"], 22),
                             (L["lostDays"], 12), (L["blockCol"], 12),
                             (L["skewCol"], 12), (L["noPeopleCol"], 12),
                             (L["noPlanCol"], 14), (L["lostIdle"], 14)])
    first = r
    for i, x in enumerate(p["managers"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 3, x["days"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 4, x["lost_days"], bg, fmt=NUM, align=RIGHT, bold=True,
                  color=RED if x["lost_days"] else INK_SOFT)
        _unp_cell(ws, r, 5, x["block"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 6, x["skew"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 7, x["wc_no_people"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 8, x["cell_no_plan"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 9, round(x["idle_lost"]) or None, bg, fmt=MIN, align=RIGHT)
        r += 1
    if r > first:
        ws.conditional_formatting.add(
            f"D{first}:D{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=ORANGE))
    ws.freeze_panes = ws.cell(3, 2)


_ROW_COLS = [
    ("date", "date", 11), ("shift", "shift", 8), ("factory", "factory", 12),
    ("manager", "manager", 26), ("level", "level", 13), ("wc", "wc", 13),
    ("cell", "cell", 11), ("leader", "leader", 24),
    ("problem", "problem", 42), ("impact", "impact", 22),
    ("plan", "plan", 11), ("actual", "actual", 11), ("people", "people", 11),
    ("idle", "idle", 11), ("weighed", "weighed", 15), ("hasPlan", "hasPlan", 12),
    ("wcPlanned", "wcPlanned", 12), ("wcTyped", "wcTyped", 13),
    ("closed", "closed", 13), ("why", "why", 62), ("fix", "fix", 34),
    ("note", "note", 12),
]


def _problems_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L[k], w) for k, _f, w in _ROW_COLS]
    ws = _sheet(wb, L["shRows"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["rowsSub"])
    r = _section(ws, r, 2, last, L["shRows"],
                 f"{len(p['rows'])} {L['rowsWord']}"
                 + (f" · {L['truncated']}" if p.get("truncated") else ""))
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["rows"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        sev_color = RED if x["sev"] == BLOCK else AMBER
        _unp_cell(ws, r, 2, _iso(x["date"]), bg, fmt=DATE_FMT, align=CENTER)
        _unp_cell(ws, r, 3, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 4, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, x["levelLabel"], bg, align=CENTER, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 7, _xl(x["wc"]), bg, align=CENTER)
        _unp_cell(ws, r, 8, _xl(x["cell"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 9, _xl(x["leader"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 10, _xl(x["problem"]), bg, bold=True, color=sev_color)
        _unp_cell(ws, r, 11, x["impact"], bg, align=CENTER, size=9, color=sev_color)
        _unp_cell(ws, r, 12, x["plan"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 13, x["actual"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 14, x["people"], bg, fmt=HC, align=RIGHT)
        _unp_cell(ws, r, 15, x["idle"], bg, fmt=MIN, align=RIGHT, color=RED)
        _unp_cell(ws, r, 16, x["weighedLabel"], bg, align=CENTER, size=9,
                  color=RED if x["weighed"] is False else INK_SOFT)
        _unp_cell(ws, r, 17, x["hasPlanLabel"], bg, align=CENTER, size=9,
                  color=RED if x["has_plan"] is False else INK_SOFT)
        _unp_cell(ws, r, 18, x["wc_planned"], bg, fmt=NUM, align=RIGHT, color=INK_SOFT)
        _unp_cell(ws, r, 19, x["wc_typed"], bg, fmt=NUM, align=RIGHT, color=INK_SOFT)
        _unp_cell(ws, r, 20, x["closedLabel"], bg, align=CENTER, size=9,
                  color=RED if not x["closed"] else GREEN)
        _unp_cell(ws, r, 21, _xl(x["why"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 22, _xl(x["fix"]), bg, size=9)
        _unp_cell(ws, r, 23, _xl(x["note"]), bg, size=9, color=INK_SOFT)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 6)
    ws.print_title_rows = f"{head}:{head}"


def _days_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["date"], 11), (L["shift"], 8), (L["factory"], 12),
            (L["manager"], 26), (L["closed"], 13), (L["verdict"], 22),
            (L["wcPlanned"], 12), (L["wcTyped"], 13), (L["people"], 11),
            (L["plan"], 12), (L["actual"], 12), (L["idle"], 12),
            (L["lostIdle"], 14)]
    ws = _sheet(wb, L["shDays"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["daysSub"])
    t = p["totals"]
    r = _section(ws, r, 2, last, L["shDays"],
                 f"{t['days_lost']} / {t['day_rows']} {L['lostOf']}")
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["days"]):
        ok = x["verdict"] == "ok"
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _iso(x["date"]), bg, fmt=DATE_FMT, align=CENTER)
        _unp_cell(ws, r, 3, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 4, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, x["closedLabel"], bg, align=CENTER, size=9,
                  color=GREEN if x["closed"] else RED)
        _unp_cell(ws, r, 7, x["verdictLabel"], bg, align=CENTER, size=9,
                  bold=not ok, color=GREEN if ok else RED)
        _unp_cell(ws, r, 8, x["wc_planned"], bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 9, x["wc_typed"], bg, fmt=NUM, align=RIGHT, bold=True,
                  color=RED if x["wc_typed"] < x["wc_planned"] else INK_SOFT)
        _unp_cell(ws, r, 10, x["people"], bg, fmt=HC, align=RIGHT)
        _unp_cell(ws, r, 11, x["plan"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 12, x["actual"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 13, x["idle"] or None, bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 14, x["idle_lost"] or None, bg, fmt=MIN, align=RIGHT,
                  color=RED)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 6)
    ws.print_title_rows = f"{head}:{head}"


def _registry_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["problem"], 40), (L["factory"], 12), (L["shift"], 8),
            (L["manager"], 26), (L["cell"], 11), (L["wc"], 13),
            (L["leader"], 24), (L["detail"], 34), (L["why"], 62), (L["fix"], 34)]
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
        _unp_cell(ws, r, 9, _xl(x["detail"]), bg, size=9, color=INK_SOFT)
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
    wb = Workbook()
    wb.remove(wb.active)
    _summary(wb, p)
    _problems_sheet(wb, p)
    _days_sheet(wb, p)
    _registry_sheet(wb, p)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── the words ────────────────────────────────────────────────────────────────
# Uzbek Latin, whoever it reaches: this file is built by a boot job, so there is
# no browser in the loop to send the labels the way a page export does.
LEVELS = {"unit": "Brigadir-kun", "wc": "Ish markazi", "cell": "Yacheyka"}

XLS_LABELS = {
    "shSummary": "Xulosa", "shRows": "Muammolar", "shDays": "Kunlar",
    "shRegistry": "Registr",
    "byProblem": "Muammolar bo'yicha", "byProblemHint": "muammo turi bo'yicha qatorlar",
    "byManager": "Brigadirlar bo'yicha", "byManagerHint": "faqat muammosi borlari",
    "problem": "Muammo", "impact": "Ta'sir", "rowsCol": "Qator",
    "unitsCol": "Brigadir", "total": "JAMI", "rowsWord": "qator",
    "truncated": "ro'yxat qisqartirildi",
    "date": "Sana", "shift": "Smena", "factory": "Zavod", "manager": "Brigadir",
    "level": "Daraja", "wc": "Ish markazi", "cell": "Yacheyka", "leader": "Lider",
    "plan": "Reja, daq", "actual": "Fakt, daq", "people": "Odam soni",
    "idle": "Kutish, daq", "weighed": "O'lchovga kirdimi", "hasPlan": "Reja bormi",
    "wcPlanned": "Rejali IM", "wcTyped": "Kiritilgan IM", "closed": "Kun yopilgan",
    "why": "Raqamga ta'siri", "fix": "Qayerda to'ldiriladi", "note": "Izoh",
    "detail": "Tafsilot", "verdict": "Загрузка holati",
    "daysCol": "Ishlagan kun", "lostDays": "Загрузкаsiz kun",
    "blockCol": "Bloklovchi", "skewCol": "Buzuvchi",
    "noPeopleCol": "Odam soni yo'q", "noPlanCol": "Rejasiz kutish",
    "lostIdle": "Yo'qolgan kutish, daq",
    "lostOf": "ishlagan kun-brigadir загрузкаsiz qoldi",
    "rowsSub": "Har bir to'ldirilmagan katak — bitta qator. Ustunlar bo'yicha "
               "filtrlang: «Muammo», «Ta'sir», «Reja bormi», «O'lchovga kirdimi»",
    "daysSub": "Har bir ishlagan kun-brigadir — bitta qator. «Загрузка holati» "
               "kun nega bo'sh qolganini aytadi",
    "registrySub": "Sanasi yo'q kamchiliklar — bugun ham, o'tgan hafta ham "
                   "noto'g'ri: bir marta to'g'rilanadi",
}


def payload(rep: dict) -> dict:
    """`collect`'s output in the shape `build_workbook` reads. Pure
    re-labelling — no figure is computed or rounded here, so the file, the
    caption and the register can only ever state one set of numbers."""
    title, subtitle = _title(rep)
    problems = [
        {"key": k, "label": PROBLEMS[k][0], "sev": PROBLEMS[k][1],
         "impact": IMPACT[PROBLEMS[k][1]], "rows": v["rows"], "units": v["units"]}
        for k, v in rep["by_problem"].items()
    ]
    problems.sort(key=lambda x: (x["sev"] != BLOCK, -x["rows"]))
    managers = [{"manager": k, **v} for k, v in rep["by_manager"].items()]
    managers.sort(key=lambda x: (-x["lost_days"], -(x["block"] + x["skew"])))

    note = ""
    if not rep["rows"] and not rep["registry"]:
        note = ("Bu davrda загрузка uchun to'ldirilmagan ma'lumot topilmadi — "
                "har bir ishlagan kun-brigadirda odam soni ham, reja ham bor.")
    elif rep["truncated"]:
        note = (f"Ro'yxat {MAX_ROWS} qator bilan cheklandi — «Xulosa»dagi "
                "raqamlar to'liq davrni qamraydi.")

    return {
        "labels": XLS_LABELS, "title": title, "subtitle": subtitle,
        "scope": _scope(rep), "kpis": _kpis(rep), "note": note,
        "problems": problems, "managers": managers,
        "rows": [{**r,
                  "levelLabel": LEVELS.get(r["level"], r["level"]),
                  "weighedLabel": _yn(r["weighed"]),
                  "hasPlanLabel": _yn(r["has_plan"]),
                  "closedLabel": _yn(r["closed"])} for r in rep["rows"]],
        "days": [{**d,
                  "closedLabel": _yn(d["closed"]),
                  "verdictLabel": VERDICT.get(d["verdict"], d["verdict"])}
                 for d in rep["days"]],
        "registry": rep["registry"],
        "totals": rep["totals"], "truncated": rep["truncated"],
    }


def _caption(rep: dict) -> str:
    """Telegram caps a document caption at 1024 chars, so this is the two
    questions the operator asked and the three figures that frame them — the
    file carries the rest."""
    d1, d2 = rep.get("start") or rep["from"], rep["to"]
    t = rep["totals"]
    head = (f"📋 <b>Загрузка uchun to'ldirilmagan ma'lumotlar</b>\n"
            f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')} · "
            f"barcha brigadirlar · ikkala smena")
    if not rep["rows"] and not rep["registry"]:
        return head + "\n\nBu davrda to'ldirilmagan ma'lumot topilmadi."
    lines = [head, "",
             f"🔴 <b>{_fmt(t['wc_no_people'])}</b> — rejasi bor ish markazi-kunda "
             "«Odam soni» kiritilmagan",
             f"🔴 <b>{_fmt(t['cell_no_plan'])}</b> — yacheyka kutish yozgan, "
             "lekin o'sha kuni unda reja yo'q",
             f"⛔️ <b>{_fmt(t['days_lost'])}</b> / {_fmt(t['day_rows'])} "
             "kun-brigadir umuman загрузкаsiz qoldi",
             f"⚠️ <b>{_fmt(t['skews'])}</b> muammo raqamni buzadi — raqam bor, "
             "lekin noto'g'ri",
             f"⏱ <b>{_fmt(t['idle_lost'])}</b> daq kutish o'lchovga umuman "
             f"kirmadi ({_fmt(t['idle_total'])} daqiqadan)",
             "",
             "<i>«Muammolar» — har bir to'ldirilmagan katak alohida qator, "
             "hamma tafsilot ustunlarda. «Kunlar» — har bir ishlagan "
             "kun-brigadir. «Registr» — sanasiz sozlama kamchiliklari "
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
    name = (f"zagruzka-toldirilmagan-{date_from.strftime('%d.%m.%Y')}-"
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
