"""«Liderlar KPI» as a workbook — the page's month, the leaderboard and the
three live KPIs with their registers.

A pure formatter over `leaders_kpi.board` (+ `leaders_kpi.concerns_register`):
it never re-derives a figure, so the file and the page can never state two
answers. The WORDS come from the client in the viewer's language (`labels`),
with Uzbek as the floor so a tab open on an older bundle still gets a readable
file. The house report style is `quality_export`'s.

    Umumiy          banner · scope · KPI cards · the five KPIs (weight, max,
                    on the platform or not, the bands)
    Reyting         the leaderboard — one row per OWNED cell in the screen's
                    order: the five scores, the total out of 5 and its %
    Havotirlar      the concerns KPI per cell · Havotirlar ro'yxati (the filings)
    Qo'nimsizlik    the turnover KPI per cell · Ketganlar (who left)
    Yot jismlar     the foreign-objects KPI per cell · Shikoyatlar (the complaints)
"""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

from app.services.quality_export import (
    AMBER, BAND, BOX, BRAND, FONT, GREEN, INK, INK_SOFT, LEFT, NUM, PANEL, RED, SLATE, TINT,
    _banner, _block, _fill, _head_row, _kpi_cards, _meta_strip, _section, _sheet,
)
from app.translit import transliterate, transliterate_text

LABELS_UZ = {
    "sheetSummary": "Umumiy", "sheetBoard": "Reyting", "sheetConcerns": "Havotirlar",
    "sheetTurnover": "Qo'nimsizlik", "sheetForeign": "Yot jismlar", "sheetLeavers": "Ketganlar",
    "sheetComplaints": "Shikoyatlar", "sheetRegister": "Havotirlar ro'yxati",
    "kConcerns": "Ishchi havotirlari", "kTurnover": "Kadrlar qo'nimsizligi", "kForeign": "Yot jismlar",
    "kCompliance": "Kategoriya muvofiqligi", "kAudit": "Texnologlar auditi",
    "cardOwners": "Egalari", "cardCells": "Yacheykalar", "cardAvg": "O'rtacha jami", "cardBest": "Eng yuqori jami",
    "rules": "Beshta KPI qoidasi", "formula": "Jami = Σ ball × vazn · eng ko'pi 5,0 · platformada yo'q KPI 0 ball",
    "colKpi": "KPI", "colWeight": "Vazn", "colMax": "Eng ko'p ball", "colLive": "Platformada", "colBands": "Shkala",
    "yes": "Ha", "no": "Hali yo'q",
    "boardTitle": "Liderlar reytingi", "countLine": "{o} ta egasi · {c} ta yacheyka",
    "colRank": "O'rin", "colCell": "Yacheyka", "colOwner": "Egasi", "colBrigadir": "Brigadir",
    "colTotal": "Jami", "colPct": "Foiz", "colScore": "Ball", "colPoints": "KPI bali", "colN": "№",
    "colFiled": "Yuborilgan", "colDone": "Hal bo'lgan", "colUplifted": "Ko'tarilgan", "colOpen": "Ochiq",
    "colShare": "Hal bo'lgan, %", "colWorking": "Ishlayotganlar", "colLeft": "Ketganlar", "colRate": "Qo'nimsizlik, %",
    "colCount": "Aybli shikoyatlar", "colKinds": "Turlari",
    "colName": "F.I.Sh.", "colJob": "Lavozim", "colHired": "Ishga kirgan", "colLeftOn": "Ketgan sana",
    "colDays": "Ishlagan kuni", "colReason": "Sabab", "colCounted": "Kimga hisoblandi",
    "colDate": "Sana", "colKind": "Turi", "colSource": "Manba", "colProduct": "Mahsulot", "colPlace": "Joy",
    "colFault": "Yacheyka aybi", "colStatus": "Holat", "colDescription": "Tavsif",
    "colNo": "№", "colWorker": "Ishchi", "colText": "Havotir",
    "countedOwner": "Egasiga", "countedNoOwner": "Egasi yo'q yacheyka", "countedNoCell": "Yacheyka /cells'da yo'q",
    "countedNotFault": "Aybdor emas — hisoblanmadi", "countedUnknown": "Ayb belgisi yo'q — hisoblanmadi",
    "statuses": {"done": "Hal bo'lgan", "doing": "Jarayonda", "todo": "Yangi", "uplifted": "Ko'tarilgan"},
    "kinds": {}, "sources": {}, "qstatuses": {},
    "faultYes": "Ha", "faultNo": "Yo'q", "faultBlank": "—",
}

KPI_KEYS = ("concerns", "turnover", "foreign", "compliance", "audit")
KPI_LABEL = {"concerns": "kConcerns", "turnover": "kTurnover", "foreign": "kForeign",
             "compliance": "kCompliance", "audit": "kAudit"}


def _l(p: dict, key: str) -> Any:
    v = (p.get("labels") or {}).get(key)
    return v if v not in (None, "") else LABELS_UZ.get(key, key)


def _word(p: dict, group: str, slug: Optional[str]) -> str:
    if not slug:
        return "—"
    words = (p.get("labels") or {}).get(group) or LABELS_UZ.get(group) or {}
    return words.get(slug) or transliterate_text(slug, p.get("lang") or "uz")


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


def _score_color(score: Optional[int]) -> Optional[str]:
    if score is None:
        return None
    return GREEN if score >= 4 else AMBER if score == 3 else RED


def _row(ws, r: int, c1: int, values: list, *, zebra: int, fmts: Optional[dict] = None,
         tints: Optional[dict] = None, centers: tuple = ()) -> None:
    ws.row_dimensions[r].height = 16
    bg = _fill(PANEL if zebra % 2 == 0 else BAND)
    for j, v in enumerate(values):
        tone = (tints or {}).get(j)
        fill = _fill(TINT.get(tone, BAND)) if tone else bg
        font = Font(name=FONT, size=9.5, bold=bool(tone), color=tone or INK)
        align = Alignment(horizontal="center", vertical="center") if (j in centers or tone) else LEFT
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


def _bands_text(key: str, rule: dict) -> str:
    """The rule's scale as one line, in the order the reader scans it."""
    if key == "concerns":
        parts = [f"> {float(b['over']):g}% → {b['score']}" for b in sorted(rule.get("bands") or [], key=lambda b: -float(b["over"]))]
        parts.append(f"→ {rule.get('worst', 1)}")
        return " · ".join(parts)
    if key == "turnover":
        parts, prev = [], None
        for b in sorted(rule.get("bands") or [], key=lambda b: float(b["max"])):
            rng = f"≤ {float(b['max']):g}%" if prev is None else f"{float(prev) + 0.1:g}–{float(b['max']):g}%"
            parts.append(f"{rng} → {b['score']}")
            prev = float(b["max"])
        parts.append(f"> {prev:g}% → {rule.get('worst', 1)}" if prev is not None else f"→ {rule.get('worst', 1)}")
        return " · ".join(parts)
    if key == "foreign":
        parts, prev = [], None
        for b in sorted(rule.get("bands") or [], key=lambda b: int(b["max"])):
            lo = 0 if prev is None else prev + 1
            rng = str(b["max"]) if lo == int(b["max"]) else f"{lo}–{b['max']}"
            parts.append(f"{rng} → {b['score']}")
            prev = int(b["max"])
        parts.append(f"{(prev or 0) + 1}+ → {rule.get('worst', 1)}")
        return " · ".join(parts)
    return " · ".join(f"{rng} → {sc}" for rng, sc in (rule.get("bands") or []))


def _summary(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    t = pay.get("totals") or {}
    ws = _sheet(wb, _l(p, "sheetSummary"), {c: 13.0 for c in range(2, 14)})
    C1, C2 = 2, 13
    row = _banner(ws, 2, C1, C2, p.get("title") or "", p.get("subtitle") or "")
    row = _meta_strip(ws, row, C1, C2, p.get("meta") or [])
    kpis = [
        {"value": t.get("owners", 0), "label": _l(p, "cardOwners"), "color": BRAND},
        {"value": t.get("cells", 0), "label": _l(p, "cardCells"), "color": BRAND},
        {"value": t.get("avg_total"), "label": _l(p, "cardAvg"), "color": GREEN, "fmt": "0.00"},
        {"value": t.get("best"), "label": _l(p, "cardBest"), "color": AMBER, "fmt": "0.00"},
    ]
    row = _kpi_cards(ws, row, C1, kpis)
    row = _section(ws, row, C1, C2, _l(p, "rules"), _l(p, "formula"))
    labels = [_l(p, k) for k in ("colKpi", "colWeight", "colMax", "colLive", "colBands")]
    spans = [3, 1, 1, 1, 6]
    _head_row(ws, row, C1, labels, height=22)
    # The head row above spans one column per label; the body lines below
    # merge the KPI name and the bands wider by hand.
    row += 1
    rules = pay.get("rules") or {}
    live = {k["key"]: k for k in pay.get("kpis") or []}
    for key in KPI_KEYS:
        rule = rules.get(key) or {}
        k = live.get(key) or {}
        vals = [_l(p, KPI_LABEL[key]), f"{int(round(float(rule.get('weight', 0)) * 100))}%",
                k.get("max_points"), _l(p, "yes") if k.get("live") else _l(p, "no"), _bands_text(key, rule)]
        ws.row_dimensions[row].height = 18
        c = C1
        for j, (v, span) in enumerate(zip(vals, spans)):
            _block(ws, row, c, row, c + span - 1, v, fill=_fill(PANEL if key in ("concerns", "foreign") else BAND),
                   border=BOX, font=Font(name=FONT, size=9.5, bold=j == 0, color=INK if k.get("live") or j == 0 else INK_SOFT),
                   align=Alignment(horizontal="left" if j in (0, 4) else "center", vertical="center", indent=1 if j in (0, 4) else 0),
                   fmt="0.00" if j == 2 else None)
            c += span
        row += 1


def _board(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    t = pay.get("totals") or {}
    rows = list(pay.get("rows") or [])
    order = p.get("order") or []
    if order:
        pos = {str(k): i for i, k in enumerate(order)}
        rows.sort(key=lambda x: (pos.get(str(x.get("key")), len(pos)), x.get("rank") or 0))
    ws = _sheet(wb, _l(p, "sheetBoard"), {2: 7, 3: 12, 4: 34, 5: 28, 6: 13, 7: 13, 8: 13, 9: 13, 10: 13, 11: 10, 12: 9},
                landscape=True)
    C1 = 2
    labels = [_l(p, "colRank"), _l(p, "colCell"), _l(p, "colOwner"), _l(p, "colBrigadir")] + \
        [_l(p, KPI_LABEL[k]) for k in KPI_KEYS] + [_l(p, "colTotal"), _l(p, "colPct")]
    C2 = C1 + len(labels) - 1
    row = _banner(ws, 2, C1, C2, p.get("title") or "", p.get("subtitle") or "")
    count = str(_l(p, "countLine")).replace("{o}", str(t.get("owners", 0))).replace("{c}", str(t.get("cells", len(rows))))
    row = _section(ws, row, C1, C2, _l(p, "boardTitle"), count)
    out = []
    for x in rows:
        scores = [(x.get(k) or {}).get("score") if k in ("concerns", "turnover", "foreign") else None for k in KPI_KEYS]
        tints = {4 + i: _score_color(s) for i, s in enumerate(scores) if s is not None}
        out.append(([x.get("rank"), x.get("code"), _name(p, x.get("owner")),
                     _name(p, x.get("brigadir")) if x.get("brigadir") else None, *scores,
                     x.get("total"), x.get("pct")],
                    {"fmts": {9: "0.00", 10: '0"%"'}, "tints": tints, "centers": (0, 1, 4, 5, 6, 7, 8)}))
    _table(ws, row, C1, labels, out)


def _concerns(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    rows = sorted(pay.get("rows") or [], key=lambda r: (
        r["concerns"].get("pct0") is None, r["concerns"].get("pct0") if r["concerns"].get("pct0") is not None else 0,
        -(r["concerns"].get("total") or 0), r.get("code") or ""))
    ws = _sheet(wb, _l(p, "sheetConcerns"), {2: 6, 3: 12, 4: 34, 5: 28, 6: 12, 7: 12, 8: 12, 9: 10, 10: 13, 11: 9, 12: 11},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colN", "colCell", "colOwner", "colBrigadir", "colFiled", "colDone", "colUplifted",
                                 "colOpen", "colShare", "colScore", "colPoints")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    row = _section(ws, row, C1, C1 + len(labels) - 1, _l(p, "kConcerns"), _bands_text("concerns", (pay.get("rules") or {}).get("concerns") or {}))
    out = []
    for n, x in enumerate(rows, 1):
        c = x["concerns"]
        tone = _score_color(c.get("score"))
        out.append(([n, x.get("code"), _name(p, x.get("owner")), _name(p, x.get("brigadir")) if x.get("brigadir") else None,
                     c.get("total", 0), c.get("done", 0), c.get("uplifted", 0), c.get("open", 0), c.get("pct0"),
                     c.get("score"), c.get("points")],
                    {"fmts": {8: '0"%"', 10: "0.00"}, "tints": {9: tone} if tone else {}, "centers": (0, 1)}))
    _table(ws, row, C1, labels, out)


def _turnover(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    rows = [r for r in pay.get("rows") or [] if r.get("turnover")]
    rows.sort(key=lambda r: (r["turnover"].get("rate") is None, -(r["turnover"].get("rate") or 0), r.get("code") or ""))
    ws = _sheet(wb, _l(p, "sheetTurnover"), {2: 6, 3: 12, 4: 34, 5: 28, 6: 14, 7: 12, 8: 14, 9: 9, 10: 11},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colN", "colCell", "colOwner", "colBrigadir", "colWorking", "colLeft",
                                 "colRate", "colScore", "colPoints")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    row = _section(ws, row, C1, C1 + len(labels) - 1, _l(p, "kTurnover"), _bands_text("turnover", (pay.get("rules") or {}).get("turnover") or {}))
    out = []
    for n, x in enumerate(rows, 1):
        tv = x["turnover"]
        tone = _score_color(tv.get("score"))
        out.append(([n, x.get("code"), _name(p, x.get("owner")), _name(p, x.get("brigadir")) if x.get("brigadir") else None,
                     tv.get("working", 0), tv.get("left", 0), tv.get("rate"), tv.get("score"), tv.get("points")],
                    {"fmts": {6: '0.0"%"', 8: "0.00"}, "tints": {7: tone} if tone else {}, "centers": (0, 1)}))
    _table(ws, row, C1, labels, out)


def _foreign(wb: Workbook, p: dict) -> None:
    pay = p["payload"]
    rows = [r for r in pay.get("rows") or [] if r.get("foreign")]
    rows.sort(key=lambda r: (-(r["foreign"].get("count") or 0), r.get("code") or ""))
    ws = _sheet(wb, _l(p, "sheetForeign"), {2: 6, 3: 12, 4: 34, 5: 28, 6: 14, 7: 30, 8: 9, 9: 11}, landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colN", "colCell", "colOwner", "colBrigadir", "colCount", "colKinds", "colScore", "colPoints")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    row = _section(ws, row, C1, C1 + len(labels) - 1, _l(p, "kForeign"), _bands_text("foreign", (pay.get("rules") or {}).get("foreign") or {}))
    out = []
    for n, x in enumerate(rows, 1):
        f = x["foreign"]
        tone = _score_color(f.get("score"))
        kinds = " · ".join(f"{_word(p, 'kinds', k)} {v}" for k, v in sorted((f.get("kinds") or {}).items(), key=lambda kv: -kv[1]))
        out.append(([n, x.get("code"), _name(p, x.get("owner")), _name(p, x.get("brigadir")) if x.get("brigadir") else None,
                     f.get("count", 0), kinds or None, f.get("score"), f.get("points")],
                    {"fmts": {7: "0.00"}, "tints": {6: tone} if tone else {}, "centers": (0, 1)}))
    _table(ws, row, C1, labels, out)


def _leavers(wb: Workbook, p: dict) -> None:
    pay = (p["payload"].get("turnover") or {})
    ws = _sheet(wb, _l(p, "sheetLeavers"), {2: 34, 3: 10, 4: 28, 5: 24, 6: 22, 7: 12, 8: 12, 9: 10, 10: 30, 11: 22},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colName", "colCell", "colOwner", "colBrigadir", "colJob", "colHired",
                                 "colLeftOn", "colDays", "colReason", "colCounted")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    counted = {"owner": _l(p, "countedOwner"), "no_owner": _l(p, "countedNoOwner"), "no_cell": _l(p, "countedNoCell")}
    out = []
    for x in pay.get("leavers") or []:
        out.append(([_name(p, x.get("name")), x.get("code"), _name(p, x.get("owner")) if x.get("owner") else None,
                     _name(p, x.get("brigadir")) if x.get("brigadir") else None, _text(p, x.get("job")),
                     _d(x.get("hired")), _d(x.get("left")), x.get("days"), _text(p, x.get("reason")),
                     counted.get(x.get("counted"), x.get("counted"))],
                    {"fmts": {5: "DD.MM.YYYY", 6: "DD.MM.YYYY"}, "centers": (1, 5, 6),
                     "tints": {} if x.get("counted") == "owner" else {9: SLATE}}))
    _table(ws, row, C1, labels, out)


def _complaints(wb: Workbook, p: dict) -> None:
    pay = (p["payload"].get("foreign") or {})
    ws = _sheet(wb, _l(p, "sheetComplaints"), {2: 12, 3: 10, 4: 28, 5: 14, 6: 14, 7: 24, 8: 18, 9: 12, 10: 24, 11: 16, 12: 60},
                landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colDate", "colCell", "colOwner", "colKind", "colSource", "colProduct", "colPlace",
                                 "colFault", "colCounted", "colStatus", "colDescription")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    counted = {"owner": _l(p, "countedOwner"), "no_owner": _l(p, "countedNoOwner"), "no_cell": _l(p, "countedNoCell"),
               "not_fault": _l(p, "countedNotFault"), "unknown": _l(p, "countedUnknown")}
    out = []
    for c in pay.get("complaints") or []:
        fault = _l(p, "faultYes") if c.get("fault") is True else _l(p, "faultNo") if c.get("fault") is False else _l(p, "faultBlank")
        out.append(([_d(c.get("date")), c.get("code"), _name(p, c.get("owner")) if c.get("owner") else None,
                     _word(p, "kinds", c.get("kind")), _word(p, "sources", c.get("source")), _text(p, c.get("product")),
                     _text(p, c.get("place")), fault, counted.get(c.get("counted"), c.get("counted")),
                     _word(p, "qstatuses", c.get("status")) if c.get("status") else None, _text(p, c.get("description"))],
                    {"fmts": {0: "DD.MM.YYYY"}, "centers": (0, 1, 7),
                     "tints": {} if c.get("counted") == "owner" else {8: SLATE}}))
    _table(ws, row, C1, labels, out)


def _register(wb: Workbook, p: dict) -> None:
    ws = _sheet(wb, _l(p, "sheetRegister"), {2: 8, 3: 12, 4: 10, 5: 28, 6: 26, 7: 60, 8: 16, 9: 26}, landscape=True)
    C1 = 2
    labels = [_l(p, k) for k in ("colNo", "colDate", "colCell", "colOwner", "colWorker", "colText", "colStatus", "colBrigadir")]
    row = _banner(ws, 2, C1, C1 + len(labels) - 1, p.get("title") or "", p.get("subtitle") or "")
    words = (p.get("labels") or {}).get("statuses") or LABELS_UZ["statuses"]
    color = {"done": GREEN, "doing": AMBER, "todo": SLATE, "uplifted": "64748B"}
    out = []
    for r in p.get("register") or []:
        out.append(([r.get("no"), _d(r.get("d")), r.get("cell"), _name(p, r.get("leader")) if r.get("leader") else None,
                     _name(p, r.get("owner")) if r.get("owner") else None, _text(p, r.get("text")),
                     words.get(r.get("st"), r.get("st")), _name(p, r.get("brigadir")) if r.get("brigadir") else None],
                    {"fmts": {1: "DD.MM.YYYY"}, "centers": (0, 1, 2), "tints": {6: color.get(r.get("st"), SLATE)}}))
    _table(ws, row, C1, labels, out)


def build_leaders_kpi_workbook(p: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    _summary(wb, p)
    _board(wb, p)
    _concerns(wb, p)
    _turnover(wb, p)
    _foreign(wb, p)
    _leavers(wb, p)
    _complaints(wb, p)
    _register(wb, p)
    wb.properties.title = p.get("title") or "Leaders KPI"
    wb.properties.creator = "Safia IMS"
    wb.properties.created = datetime.now()
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
