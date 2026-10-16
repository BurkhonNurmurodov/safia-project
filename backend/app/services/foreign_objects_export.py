"""«Yot jismlar» as a workbook — the page's month, four tabs.

A pure formatter over `foreign_objects.month_payload`: it never re-derives a
figure, so the file and the page can never state two answers. The WORDS come
from the client in the viewer's language (`labels`), with Uzbek as the floor
so a tab open on an older bundle still gets a readable file. The house report
style is `quality_export`'s, the layout `turnover_export`'s.

    Umumiy        banner · scope · KPI cards · the rule · the score bands ·
                  what counts toward nobody
    Reyting       one row per OWNED cell — the KPI itself, credited to the
                  cell's owner, in the screen's order
    Yacheykalar   one row per cell, with its owner and its manager
    Shikoyatlar   every foreign-object complaint of the month, counted or not
"""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font
from openpyxl.utils import get_column_letter

from app.services.quality_export import (
    BAND, BOX, BRAND, FONT, GREEN, INK, INK_SOFT, LEFT, NUM, PANEL, RED, AMBER, SLATE, TINT,
    _banner, _block, _fill, _head_row, _kpi_cards, _meta_strip, _section, _sheet, _side,
)
from app.translit import transliterate, transliterate_text

LABELS_UZ = {
    "sheetSummary": "Umumiy", "sheetRanking": "Reyting", "sheetCells": "Yacheykalar",
    "sheetComplaints": "Shikoyatlar",
    "kFault": "Aybli shikoyatlar", "kAll": "Barcha yot jism shikoyatlari",
    "kKind": "Eng ko'p uchragan tur", "kScored": "Baholangan yacheykalar",
    "formula": "Qanday hisoblanadi", "bands": "Ball shkalasi",
    "bandCount": "Aybli shikoyatlar", "bandScore": "Ball", "bandPoints": "KPI bali",
    "nobody": "Hech kimga hisoblanmaganlar",
    "nobodyNoOwner": "Egasi yo'q yacheykalardagi aybli shikoyatlar",
    "nobodyNoCell": "/cells'da yo'q kod",
    "nobodyNotFault": "Yacheyka aybdor emas deb belgilangan",
    "nobodyUnknown": "Ayb belgisi to'ldirilmagan",
    "rankTitle": "Yacheyka egalari reytingi", "countLine": "{o} ta egasi · {c} ta yacheyka",
    "colN": "№", "colCell": "Yacheyka", "colOwner": "Egasi", "colManager": "Boshqaruvchi",
    "colBrigadir": "Brigadir", "colShift": "Smena", "colCount": "Aybli shikoyatlar",
    "colAll": "Jami shikoyatlar", "colKinds": "Turlari", "colScore": "Ball", "colPoints": "KPI bali",
    "colDate": "Sana", "colKind": "Turi", "colSource": "Manba", "colPlace": "Joy",
    "colProduct": "Mahsulot", "colDescription": "Tavsif", "colStatus": "Holat", "colRef": "№ reyestr",
    "colFault": "Yacheyka aybi", "colCounted": "Kimga hisoblandi",
    "countedOwner": "Egasiga", "countedNoOwner": "Egasi yo'q yacheyka", "countedNoCell": "Yacheyka /cells'da yo'q",
    "countedNotFault": "Aybdor emas — hisoblanmadi", "countedUnknown": "Ayb belgisi yo'q — hisoblanmadi",
    "noOwner": "Egasi yo'q", "yes": "Ha", "no": "Yo'q", "blank": "—",
    "formulaLines": [],
    "kinds": {"hair": "Soch", "polyethylene": "Polietilen", "metal": "Metall", "plastic": "Plastik",
              "paper": "Qog'oz", "organic": "Organika", "dirt": "Ifloslik", "wood": "Yog'och",
              "raw": "Xomashyo", "insect": "Hasharot", "glass": "Shisha", "other": "Boshqa"},
    "sources": {"production": "Ishlab chiqarish", "guest": "Mehmon", "store": "Do'kon"},
    "statuses": {"done": "Bartaraf etilgan", "open": "Ochiq", "waiting": "Kutilmoqda",
                 "repeat": "Takrorlanuvchi", "not_required": "Chora talab etilmaydi"},
}

HAIR_B = Border(bottom=_side())


def _l(p: dict, key: str) -> Any:
    return (p.get("labels") or {}).get(key) or LABELS_UZ.get(key) or key


def _word(p: dict, group: str, slug: Optional[str]) -> str:
    """A kind / source / status in the viewer's words, the slug itself when
    the register carries a value nobody mapped."""
    if not slug:
        return "—"
    m = (p.get("labels") or {}).get(group) or {}
    return m.get(slug) or LABELS_UZ[group].get(slug) or transliterate_text(slug, p.get("lang") or "uz")


def _name(p: dict, v: Optional[str]) -> str:
    return transliterate(v, p.get("lang") or "uz") if v else "—"


def _text(p: dict, v: Optional[str]) -> str:
    return transliterate_text(v, p.get("lang") or "uz") if v else "—"


def _d(v: Optional[str]):
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        return v


def _score_color(score: Optional[int]) -> str:
    if score is None:
        return SLATE
    return GREEN if score >= 4 else AMBER if score == 3 else RED


def _kinds_text(p: dict, kinds: dict) -> str:
    if not kinds:
        return "—"
    return " · ".join(f"{_word(p, 'kinds', k)} {n}" for k, n in sorted(kinds.items(), key=lambda kv: -kv[1]))


def _row(ws, r: int, c1: int, values: list, *, zebra: int, fmts: Optional[dict] = None,
         tints: Optional[dict] = None, centers: tuple = (), wrap: tuple = ()) -> None:
    ws.row_dimensions[r].height = 16
    bg = _fill(PANEL if zebra % 2 == 0 else BAND)
    for j, v in enumerate(values):
        tone = (tints or {}).get(j)
        fill = _fill(TINT.get(tone, BAND)) if tone else bg
        font = Font(name=FONT, size=9.5, bold=bool(tone), color=tone or INK)
        align = Alignment(horizontal="center", vertical="center") if (j in centers or tone) else LEFT
        if j in wrap:
            align = Alignment(horizontal="left", vertical="top", wrap_text=True, indent=1)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            align = Alignment(horizontal="right", vertical="center", indent=1)
        _block(ws, r, c1 + j, r, c1 + j, "—" if v is None or v == "" else v, fill=fill, border=BOX,
               align=align, font=font, fmt=(fmts or {}).get(j))


def _table(ws, head_row: int, c1: int, labels: list[str], rows: list[tuple]) -> int:
    _head_row(ws, head_row, c1, labels, height=28)
    r = head_row + 1
    first = r
    for i, (vals, kw) in enumerate(rows):
        _row(ws, r, c1, vals, zebra=i, **kw)
        r += 1
    c2 = c1 + len(labels) - 1
    ws.auto_filter.ref = f"{get_column_letter(c1)}{head_row}:{get_column_letter(c2)}{max(first, r - 1)}"
    ws.freeze_panes = ws.cell(first, c1 + 1)
    ws.print_title_rows = f"{head_row}:{head_row}"
    return r


def _summary(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    t = pay.get("totals") or {}
    ws = _sheet(wb, _l(p, "sheetSummary"), {c: 13.0 for c in range(2, 14)})
    C1, C2 = 2, 13
    row = _banner(ws, 2, C1, C2, p.get("title") or "", p.get("subtitle") or "")
    row = _meta_strip(ws, row, C1, C2, p.get("meta") or [])
    by = t.get("by_score") or {}
    kinds = t.get("by_kind") or {}
    top = next(iter(kinds.items()), None)
    hints = p.get("hints") or {}
    kpis = [
        {"value": t.get("fault", 0), "label": _l(p, "kFault"), "color": RED, "hint": hints.get("fault", "")},
        {"value": t.get("complaints", 0), "label": _l(p, "kAll"), "color": BRAND, "hint": hints.get("all", "")},
        {"value": (f"{_word(p, 'kinds', top[0])} · {top[1]}" if top else "—"), "label": _l(p, "kKind"),
         "color": AMBER, "hint": hints.get("kind", "")},
        {"value": t.get("owned_cells", 0), "label": _l(p, "kScored"), "color": GREEN,
         "hint": " · ".join(f"{s}: {by.get(str(s), 0)}" for s in (5, 4, 3, 2, 1))},
    ]
    row = _kpi_cards(ws, row, C1, kpis)

    row = _section(ws, row, C1, C2, _l(p, "formula"))
    for line in _l(p, "formulaLines") or []:
        ws.row_dimensions[row].height = 30
        _block(ws, row, C1, row, C2, line, font=Font(name=FONT, size=10, color=INK),
               align=Alignment(horizontal="left", vertical="center", wrap_text=True, indent=1))
        row += 1
    row += 1

    row = _section(ws, row, C1, C2, _l(p, "bands"))
    _head_row(ws, row, C1, [_l(p, "bandCount"), _l(p, "bandScore"), _l(p, "bandPoints")], span=3,
              first_span=3, height=22)
    row += 1
    rule = pay.get("rule") or {}
    prev = None
    bands = sorted(rule.get("bands") or [], key=lambda b: int(b["max"]))
    steps = [(int(b["max"]), int(b["score"])) for b in bands] + [(None, int(rule.get("worst", 1)))]
    for mx, sc in steps:
        if mx is None:
            rng = f"≥ {(prev or 0) + 1}"
        elif prev is None or mx == prev + 1:
            rng = str(mx)
        else:
            rng = f"{prev + 1}–{mx}"
        tone = _score_color(sc)
        for k, (val, fmt) in enumerate(((rng, None), (sc, NUM),
                                         (round(sc * float(rule.get("weight", 0.25)), 2), "0.00"))):
            c = C1 + k * 3
            _block(ws, row, c, row, c + 2, val, fill=_fill(TINT.get(tone, BAND) if k == 1 else PANEL), border=BOX,
                   font=Font(name=FONT, size=10, bold=k == 1, color=tone if k == 1 else INK),
                   align=Alignment(horizontal="center", vertical="center"), fmt=fmt)
        if mx is not None:
            prev = mx
        row += 1
    row += 1

    nobody = []
    if t.get("fault_no_owner"):
        nobody.append((_l(p, "nobodyNoOwner"), t["fault_no_owner"]))
    for u in pay.get("unregistered") or []:
        nobody.append((f"{_l(p, 'nobodyNoCell')}: {u.get('code') or '—'} {_text(p, u.get('cell_name'))}", u.get("count", 0)))
    if t.get("not_fault"):
        nobody.append((_l(p, "nobodyNotFault"), t["not_fault"]))
    if t.get("unknown"):
        nobody.append((_l(p, "nobodyUnknown"), t["unknown"]))
    if nobody:
        row = _section(ws, row, C1, C2, _l(p, "nobody"))
        for text, n in nobody:
            ws.row_dimensions[row].height = 18
            _block(ws, row, C1, row, C2 - 2, text, border=HAIR_B, font=Font(name=FONT, size=9.5, color=INK_SOFT))
            _block(ws, row, C2 - 1, row, C2, n, border=HAIR_B, font=Font(name=FONT, size=10, bold=True, color=INK),
                   align=Alignment(horizontal="right", vertical="center", indent=1))
            row += 1


def _ranking(wb: Workbook, p: dict) -> None:
    """One row per OWNED cell, credited to its owner, in the screen's order."""
    pay = p["payload"]
    t = pay.get("totals") or {}
    rows = list(pay.get("ranking") or [])
    order = p.get("order") or []
    if order:
        pos = {str(k): i for i, k in enumerate(order)}
        rows.sort(key=lambda x: pos.get(str(x.get("key")), len(pos)))
    ws = _sheet(wb, _l(p, "sheetRanking"), {2: 6, 3: 12, 4: 34, 5: 28, 6: 14, 7: 30, 8: 9, 9: 11},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colN", "colCell", "colOwner", "colBrigadir", "colCount", "colKinds",
                                 "colScore", "colPoints")]
    C2 = C1 + len(labels) - 1
    row = _banner(ws, 2, C1, C2, p.get("title") or "", p.get("subtitle") or "")
    count = str(_l(p, "countLine")).replace("{o}", str(t.get("owners", 0))).replace(
        "{c}", str(t.get("owned_cells", len(rows))))
    row = _section(ws, row, C1, C2, _l(p, "rankTitle"), count)
    out = []
    for n, x in enumerate(rows, 1):
        out.append(([n, x.get("code"), _name(p, x.get("owner")),
                     _name(p, x.get("brigadir")) if x.get("brigadir") else None,
                     x.get("count", 0), _kinds_text(p, x.get("kinds") or {}), x.get("score"), x.get("points")],
                    {"fmts": {7: "0.00"}, "tints": {6: _score_color(x.get("score"))}, "centers": (0, 1)}))
    _table(ws, row, C1, labels, out)


def _cells(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    ws = _sheet(wb, _l(p, "sheetCells"), {2: 12, 3: 32, 4: 32, 5: 28, 6: 8, 7: 14, 8: 14, 9: 30, 10: 9},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colCell", "colOwner", "colManager", "colBrigadir", "colShift", "colCount",
                                 "colAll", "colKinds", "colScore")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    out = []
    for c in pay.get("cells") or []:
        out.append(([c.get("code"), _name(p, c.get("owner")) if c.get("owner") else _l(p, "noOwner"),
                     _name(p, c.get("leader")) if c.get("leader") else None,
                     _name(p, c.get("brigadir")) if c.get("brigadir") else None, c.get("shift"),
                     c.get("count", 0), c.get("all", 0), _kinds_text(p, c.get("kinds") or {}), c.get("score")],
                    {"tints": {8: _score_color(c.get("score"))}, "centers": (0, 4)}))
    _table(ws, row, C1, labels, out)


def _complaints(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    ws = _sheet(wb, _l(p, "sheetComplaints"), {2: 12, 3: 10, 4: 28, 5: 24, 6: 14, 7: 16, 8: 22, 9: 28,
                                              10: 60, 11: 18, 12: 12, 13: 12, 14: 26}, landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colDate", "colCell", "colOwner", "colBrigadir", "colKind", "colSource",
                                 "colPlace", "colProduct", "colDescription", "colStatus", "colRef",
                                 "colFault", "colCounted")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    counted = {"owner": _l(p, "countedOwner"), "no_owner": _l(p, "countedNoOwner"),
               "no_cell": _l(p, "countedNoCell"), "not_fault": _l(p, "countedNotFault"),
               "unknown": _l(p, "countedUnknown")}
    out = []
    for x in pay.get("complaints") or []:
        fault = _l(p, "yes") if x.get("fault") is True else _l(p, "no") if x.get("fault") is False else _l(p, "blank")
        out.append(([_d(x.get("date")), x.get("code"), _name(p, x.get("owner")) if x.get("owner") else None,
                     _name(p, x.get("brigadir")) if x.get("brigadir") else None,
                     _word(p, "kinds", x.get("kind")), _word(p, "sources", x.get("source")),
                     _text(p, x.get("place")), _text(p, x.get("product")), _text(p, x.get("description")),
                     _word(p, "statuses", x.get("status")), x.get("ref_no"), fault,
                     counted.get(x.get("counted"), x.get("counted"))],
                    {"fmts": {0: "DD.MM.YYYY"}, "centers": (0, 1, 11), "wrap": (8,),
                     "tints": {} if x.get("counted") == "owner" else {12: SLATE}}))
    _table(ws, row, C1, labels, out)


def build_foreign_workbook(p: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    _summary(wb, p)
    _ranking(wb, p)
    _cells(wb, p)
    _complaints(wb, p)
    wb.properties.title = p.get("title") or "Foreign objects"
    wb.properties.creator = "Safia IMS"
    wb.properties.created = datetime.now()
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
