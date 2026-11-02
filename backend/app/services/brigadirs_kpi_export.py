"""«Brigadirlar KPI» as a workbook — the month as the page shows it.

A pure formatter over `brigadirs_kpi.board`: it never re-derives a figure, so
the file and the page can never state two answers. The WORDS come from the
client in the viewer's language (`labels`), Uzbek as the floor. The house
report style is `quality_export`'s, the row helpers `leaders_kpi_export`'s.

    Reyting        one row per brigadir in the screen's order — the four HR
                   criteria (two computed, two «hali hisoblanmaydi»), passed
                   of 4, the payout place
    Qo'nimsizlik   per brigadir: cells, working, left, the figure, the verdict
    Yacheykalar    every credited cell with its rate and how it was credited
    Ketganlar      who left, by brigadir
    OKK            per brigadir: all, resolved, unresolved, repeat, %, verdict
    OKK yozuvlari  the quality-register records behind it
"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook

from app.services.leaders_kpi_export import _d, _row, _table
from app.services.quality_export import AMBER, BRAND, GREEN, RED, _banner, _kpi_cards, _section, _sheet
from app.translit import transliterate

LABELS_UZ = {
    "sheetBoard": "Reyting", "sheetTurnover": "Qo'nimsizlik", "sheetCells": "Yacheykalar",
    "sheetLeavers": "Ketganlar", "sheetOkk": "OKK", "sheetRecords": "OKK yozuvlari",
    "colBrigadir": "Brigadir", "colShift": "Smena", "colSource": "Manba",
    "kTurnover": "Qo'nimsizlik", "kOkk": "OKK tuzatuvchi choralar", "kMentoring": "Murabbiylik",
    "kKru": "KRU", "colPassed": "O'tgan mezonlar", "colPct": "Natija, %", "colPayout": "To'lov",
    "colCells": "Yacheykalar", "colWorking": "Ishlayotganlar", "colLeft": "Ketganlar",
    "colRate": "Qo'nimsizlik, %", "colVerdict": "Natija",
    "colCell": "Yacheyka", "colUnit": "Bo'linma (Verifix)", "colHow": "Kimga bog'langan",
    "colName": "F.I.Sh.", "colJob": "Lavozim", "colHired": "Ishga kirgan", "colLeftOn": "Ketgan sana",
    "colDays": "Ishlagan kuni", "colReason": "Sabab",
    "colTotal": "Jami", "colDone": "Hal bo'lgan", "colUnresolved": "Hal bo'lmagan",
    "colRepeat": "Takroriy", "colOkkPct": "Hal bo'lgan, %",
    "colDate": "Sana", "colRef": "№", "colStatus": "Holat", "colProduct": "Mahsulot",
    "colPlace": "Joy", "colDescription": "Tavsif", "colAction": "Tuzatuvchi chora",
    "pass": "O'tdi", "fail": "O'tmadi", "blank": "—", "notYet": "Hali hisoblanmaydi",
    "srcUnit": "IMS", "srcVerifix": "Verifix",
    "howRegister": "Yacheykalar reyestri", "howVerifix": "Verifix brigadiri", "howVerifixUnit": "Verifix brigadiri",
    "cardBrigadirs": "Brigadirlar", "cardTurnover": "Qo'nimsizlikdan o'tgan", "cardOkk": "OKK'dan o'tgan",
    "statuses": {}, "shift": "{n}-smena",
}


def _l(p: dict, key: str) -> Any:
    v = (p.get("labels") or {}).get(key)
    return v if v not in (None, "") else LABELS_UZ.get(key, key)


def _name(v: Optional[str]) -> str:
    return transliterate(v, "uz") if v else "—"


def _verdict(p: dict, x: Optional[dict]) -> tuple[str, Optional[str]]:
    if x is None:
        return _l(p, "notYet"), None
    if x.get("pass") is True:
        return _l(p, "pass"), GREEN
    if x.get("pass") is False:
        return _l(p, "fail"), RED
    return _l(p, "blank"), None


def _shift(p: dict, n) -> Optional[str]:
    return str(_l(p, "shift")).replace("{n}", str(n)) if n in (1, 2) else None


def _ordered(p: dict) -> list[dict]:
    rows = (p["payload"].get("rows") or [])
    order = p.get("order") or []
    if not order:
        return rows
    pos = {k: i for i, k in enumerate(order)}
    return sorted(rows, key=lambda x: pos.get(x["key"], len(pos)))


def _board(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    rows = _ordered(p)
    ws = _sheet(wb, _l(p, "sheetBoard"), {2: 34, 3: 10, 4: 10, 5: 15, 6: 15, 7: 15, 8: 15, 9: 12, 10: 11, 11: 12},
                landscape=True)
    row = _banner(ws, 2, 2, 11, p.get("title") or "", p.get("subtitle") or "")
    t = pay.get("totals") or {}
    row = _kpi_cards(ws, row, 2, [
        {"value": t.get("brigadirs", 0), "label": _l(p, "cardBrigadirs"), "color": BRAND},
        {"value": (t.get("turnover") or {}).get("passed", 0), "label": _l(p, "cardTurnover"), "color": GREEN},
        {"value": (t.get("okk") or {}).get("passed", 0), "label": _l(p, "cardOkk"), "color": AMBER},
    ])
    labels = [_l(p, k) for k in ("colBrigadir", "colShift", "colSource", "kTurnover", "kOkk", "kMentoring",
                                  "kKru", "colPassed", "colPct", "colPayout")]
    body = []
    for x in rows:
        tv, tv_tone = _verdict(p, x.get("turnover"))
        ok, ok_tone = _verdict(p, x.get("okk"))
        mn, _ = _verdict(p, x.get("mentoring"))
        kr, _ = _verdict(p, x.get("kru"))
        tvv = (x.get("turnover") or {}).get("value")
        okv = (x.get("okk") or {}).get("pct")
        body.append(([
            _name(x.get("name")), _shift(p, x.get("shift")),
            _l(p, "srcVerifix") if x.get("kind") == "verifix" else _l(p, "srcUnit"),
            f"{tvv:g}% · {tv}" if tvv is not None else tv,
            f"{okv:g}% · {ok}" if okv is not None else ok,
            mn, kr, f"{x['passed']} / {x['of']}", x.get("pct"), _l(p, "notYet"),
        ], {"tints": {3: tv_tone, 4: ok_tone}, "centers": (1, 2, 5, 6, 7, 9)}))
    _table(ws, row, 2, labels, body)


def _turnover(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    tv = pay.get("turnover") or {}
    rows = [x for x in _ordered(p) if x.get("turnover")]
    ws = _sheet(wb, _l(p, "sheetTurnover"), {2: 34, 3: 10, 4: 12, 5: 14, 6: 12, 7: 15, 8: 12})
    row = _section(ws, 2, 2, 8, _l(p, "kTurnover"), p.get("subtitle") or "")
    body = []
    for x in sorted(rows, key=lambda x: -((x["turnover"] or {}).get("value") or -1)):
        t = x["turnover"]
        v, tone = _verdict(p, t)
        body.append(([_name(x.get("name")), _shift(p, x.get("shift")), t["cells"], t["working"], t["left"],
                      t.get("value"), v], {"tints": {6: tone}, "fmts": {5: '0.0"%"'}}))
    _table(ws, row, 2, [_l(p, k) for k in ("colBrigadir", "colShift", "colCells", "colWorking", "colLeft",
                                            "colRate", "colVerdict")], body)

    names = {x["key"]: _name(x.get("name")) for x in pay.get("rows") or []}
    ws = _sheet(wb, _l(p, "sheetCells"), {2: 11, 3: 32, 4: 34, 5: 12, 6: 12, 7: 15, 8: 22})
    row = _section(ws, 2, 2, 8, _l(p, "sheetCells"), "")
    how = {"register": _l(p, "howRegister"), "verifix": _l(p, "howVerifix"), "verifix_unit": _l(p, "howVerifixUnit")}
    body = [([c.get("code"), c.get("unit") or "—", names.get(c.get("brigadir")) or "—", c["working"], c["left"],
              c.get("rate"), how.get(c.get("how"), c.get("how"))], {"fmts": {5: '0.0"%"'}})
            for c in sorted(tv.get("cells") or [], key=lambda c: (names.get(c.get("brigadir")) or "", c.get("code") or ""))]
    _table(ws, row, 2, [_l(p, k) for k in ("colCell", "colUnit", "colBrigadir", "colWorking", "colLeft",
                                            "colRate", "colHow")], body)

    ws = _sheet(wb, _l(p, "sheetLeavers"), {2: 32, 3: 30, 4: 10, 5: 26, 6: 13, 7: 13, 8: 11, 9: 26})
    row = _section(ws, 2, 2, 9, _l(p, "sheetLeavers"), "")
    body = []
    for k, people in (tv.get("leavers") or {}).items():
        for q in people:
            body.append(([names.get(k) or "—", _name(q.get("name")), q.get("code"), q.get("job") or "—",
                          _d(q.get("hired")), _d(q.get("left")), q.get("days"), q.get("reason") or "—"],
                         {"fmts": {4: "dd.mm.yyyy", 5: "dd.mm.yyyy"}}))
    body.sort(key=lambda b: (b[0][0], str(b[0][5] or "")))
    _table(ws, row, 2, [_l(p, k) for k in ("colBrigadir", "colName", "colCell", "colJob", "colHired",
                                            "colLeftOn", "colDays", "colReason")], body)


def _okk(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    ok = pay.get("okk") or {}
    rows = _ordered(p)
    ws = _sheet(wb, _l(p, "sheetOkk"), {2: 34, 3: 10, 4: 10, 5: 12, 6: 13, 7: 11, 8: 13, 9: 12})
    row = _section(ws, 2, 2, 9, _l(p, "kOkk"), p.get("subtitle") or "")
    body = []
    for x in sorted(rows, key=lambda x: ((x["okk"] or {}).get("pct") is None, (x["okk"] or {}).get("pct") or 0)):
        o = x["okk"] or {}
        v, tone = _verdict(p, o)
        body.append(([_name(x.get("name")), _shift(p, x.get("shift")), o.get("total", 0), o.get("done", 0),
                      o.get("unresolved", 0), o.get("repeat", 0), o.get("pct"), v],
                     {"tints": {7: tone}, "fmts": {6: '0.0"%"'}}))
    _table(ws, row, 2, [_l(p, k) for k in ("colBrigadir", "colShift", "colTotal", "colDone", "colUnresolved",
                                            "colRepeat", "colOkkPct", "colVerdict")], body)

    names = {x["key"]: _name(x.get("name")) for x in pay.get("rows") or []}
    st = _l(p, "statuses") or {}
    ws = _sheet(wb, _l(p, "sheetRecords"), {2: 30, 3: 12, 4: 10, 5: 15, 6: 28, 7: 24, 8: 46, 9: 46}, landscape=True)
    row = _section(ws, 2, 2, 9, _l(p, "sheetRecords"), "")
    body = []
    for k, recs in (ok.get("records") or {}).items():
        for q in recs:
            body.append(([names.get(k) or "—", _d(q.get("date")), q.get("ref") or "—",
                          st.get(q.get("status")) or q.get("status") or "—", q.get("product") or "—",
                          q.get("place") or "—", q.get("description") or "—", q.get("action") or "—"],
                         {"fmts": {1: "dd.mm.yyyy"}}))
    body.sort(key=lambda b: (b[0][0], str(b[0][1] or "")))
    _table(ws, row, 2, [_l(p, k) for k in ("colBrigadir", "colDate", "colRef", "colStatus", "colProduct",
                                            "colPlace", "colDescription", "colAction")], body)


def build_workbook(p: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    _board(wb, p)
    if (p["payload"].get("turnover") or {}).get("cells") is not None:
        _turnover(wb, p)
    _okk(wb, p)
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
