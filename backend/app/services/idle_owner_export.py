"""«Mening toifam» as a workbook — the owner's page, formatted.

A SEPARATE file from the three ojidaniya workbooks next door, for the reason
each of those is separate from the others: it carries a different QUESTION.
The five-tab report answers «how did the fleet wait», the matrix «how do the
causes share out a month», the cost book «what does the plant owe». This one
answers «what did MY cause do, where, and to whom» — and its last sheet is the
evidence: every event, in the leader's own words.

Every figure arrives already computed (`services/idle_owner`, which reaches
them through `services/ojidaniya_cost`); this is a formatter and re-derives
nothing. The house style is the shared one — gold banner, scope strip, KPI
cards, zebra rows, no gridlines, print setup — imported from
`quality_export`/`ojidaniya_export` rather than re-spelled, so a fourth
ojidaniya file does not become a fourth look.
"""
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

from app.services.ojidaniya_export import (
    AMBER, BAND, BOX, BRAND, DATE_FMT, HC, HRS, INK, INK_FAINT, INK_SOFT,
    LEFT, MIN, PANEL, PCT1, RIGHT, SLATE, UZS, _banner, _block, _fill,
    _head_row, _hex, _iso, _kpi_cards, _meta_strip, _section, _sheet, _xl,
    FONT,
)

WRAP = Alignment(horizontal="left", vertical="top", wrap_text=True, indent=1)
CENTER = Alignment(horizontal="center", vertical="center")


def _delta(now, prev):
    """The period-over-period move as a WHOLE PERCENT, or None where it cannot
    be stated.

    A percent and not a fraction, because `quality_export._delta_text` prints
    the value with a «%» suffix — handing it 0.23 would draw «+0.23%» for a
    move of a quarter. A previous period of ZERO has no percentage at all: «up
    from nothing» is not a number, so it reads as no chip rather than as an
    infinity somebody forwards.
    """
    try:
        now, prev = float(now or 0), float(prev or 0)
    except (TypeError, ValueError):
        return None
    if not prev:
        return None
    return round((now - prev) / prev * 100)


def _row(ws, r: int, c1: int, vals: list, *, band: bool, bold: bool = False,
         fmts: list = None, aligns: list = None) -> None:
    """One zebra line. Values are written as they arrive — an unpriced cost is
    None and prints «—», never 0: a spreadsheet that blurs «nobody typed a
    headcount» into «this cost nothing» will be summed by somebody."""
    fill = _fill(BAND if band else PANEL)
    font = Font(name=FONT, size=10, bold=bold, color=INK)
    for i, v in enumerate(vals):
        c = ws.cell(r, c1 + i)
        c.value = _xl(v) if v is not None else "—"
        if fmts and i < len(fmts) and fmts[i] and v is not None:
            c.number_format = fmts[i]
        c.font = font
        c.fill = fill
        c.border = BOX
        c.alignment = (aligns[i] if aligns and i < len(aligns) and aligns[i]
                       else LEFT)


def build_owner_workbook(p: dict) -> BytesIO:
    """Four sheets: Umumiy · Kunlar · Yacheykalar · Hodisalar."""
    L = p.get("labels") or {}
    meta = p.get("cats_meta") or {}
    tot = p.get("totals") or {}
    prev = p.get("prev") or {}
    title = p.get("title") or "Ojidaniya · toifa"
    sub = p.get("subtitle") or ""

    def clabel(name: str) -> str:
        lbl = (meta.get(name) or {}).get("label") or ""
        return f"{name} — {lbl}" if lbl else (name or "")

    def ccolor(name: str) -> str:
        return _hex((meta.get(name) or {}).get("color"))

    wb = Workbook()
    wb.remove(wb.active)

    # ── Umumiy: the KPI strip, the causes, the brigadirs ─────────────────────
    ws = _sheet(wb, L.get("shOverview", "Umumiy"),
                {2: 40, 3: 12, 4: 11, 5: 11, 6: 16, 7: 10, 8: 26, 9: 12})
    r = _banner(ws, 2, 2, 9, title, sub)
    r = _meta_strip(ws, r, 2, 9, p.get("scope") or [])
    r += 1

    unpriced = tot.get("unpriced_minutes") or 0
    # Four cards, two columns each — the strip runs 2..9, exactly the width of
    # the tables under it. `deltaGood` is FALSE on both moving figures: this is
    # waiting time and the money it costs, so UP is the bad direction and the
    # chip has to be red for it.
    r = _kpi_cards(ws, r, 2, [
        {"value": tot.get("cat_minutes") or 0,
         "label": L.get("kMinutes", "Jami to'xtash, daq"),
         "hint": str(round((tot.get("cat_minutes") or 0) / 60.0, 1)) + " " + L.get("hrs", "soat"),
         "fmt": MIN, "color": BRAND,
         # The move against the equal-length window immediately before this
         # one — named on the card, because a percentage whose baseline is
         # unstated is a percentage nobody can check.
         "delta": _delta(tot.get("cat_minutes"), prev.get("cat_minutes")),
         "deltaGood": False},
        {"value": tot.get("cat_cost"), "label": L.get("kCost", "Xarajat, so'm"),
         "hint": L.get("kCostHint", ""), "fmt": UZS, "color": BRAND,
         "delta": _delta(tot.get("cat_cost"), prev.get("cat_cost")),
         "deltaGood": False},
        {"value": tot.get("events") or 0, "label": L.get("kEvents", "Hodisalar"),
         "hint": str(tot.get("days") or 0) + " " + L.get("days", "kun"), "color": SLATE},
        {"value": unpriced, "label": L.get("kUnpriced", "Narxlanmagan, daq"),
         "hint": L.get("kUnpricedHint", ""), "fmt": MIN,
         "color": AMBER if unpriced else SLATE},
    ])
    r += 1

    # Causes. One row per category, with the person answerable for it — this is
    # the sheet somebody forwards, and a cause with nobody's name on it is a
    # figure nobody owns.
    cats = p.get("cats") or []
    r = _section(ws, r, 2, 9, L.get("sByCat", "Toifalar bo'yicha"), L.get("sByCatSub", ""))
    _head_row(ws, r, 2, [
        L.get("cCat", "Toifa"), L.get("cMin", "To'xtash, daq"), L.get("cHrs", "Soat"),
        L.get("cHc", "Odam soni"), L.get("cCost", "Xarajat, so'm"),
        L.get("cShare", "Ulush"), L.get("cOwner", "Mas'ul"),
    ])
    r += 1
    first = r
    grand = sum(k.get("cost") or 0 for k in cats)
    for i, k in enumerate(cats):
        name = k.get("category")
        who = (meta.get(name) or {}).get("owner") or ""
        _row(ws, r, 2, [
            clabel(name), k.get("minutes"), k.get("hours"), None, k.get("cost"),
            ((k.get("cost") or 0) / grand) if grand else None, who or "—",
        ], band=bool(i % 2),
            fmts=[None, MIN, HRS, HC, UZS, PCT1, None],
            aligns=[LEFT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, LEFT])
        ws.cell(r, 2).font = Font(name=FONT, size=10, bold=True, color=ccolor(name))
        r += 1
    if cats:
        ws.conditional_formatting.add(
            f"C{first}:C{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=BRAND))
        ws.auto_filter.ref = f"B{first - 1}:H{r - 1}"
    _row(ws, r, 2, [L.get("total", "Jami"), tot.get("cat_minutes"),
                    round((tot.get("cat_minutes") or 0) / 60.0, 2), None,
                    tot.get("cat_cost"), None, None],
         band=False, bold=True,
         fmts=[None, MIN, HRS, HC, UZS, PCT1, None],
         aligns=[LEFT, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, LEFT])
    r += 2

    # Brigadirs — whose shopfloor carries this cause.
    mgrs = p.get("managers") or []
    r = _section(ws, r, 2, 9, L.get("sBySup", "Brigadirlar bo'yicha"), L.get("sBySupSub", ""))
    _head_row(ws, r, 2, [
        L.get("cSup", "Brigadir"), L.get("cMin", "To'xtash, daq"), L.get("cHrs", "Soat"),
        L.get("cHc", "Odam soni"), L.get("cCost", "Xarajat, so'm"),
        L.get("cShift", "Smena"), L.get("cCats", "Toifalar"),
    ])
    r += 1
    first = r
    for i, m in enumerate(mgrs):
        _row(ws, r, 2, [
            m.get("manager"), m.get("minutes"), m.get("hours"), m.get("hc"),
            m.get("cost"), m.get("shift"), ", ".join(m.get("cats") or []),
        ], band=bool(i % 2),
            fmts=[None, MIN, HRS, HC, UZS, None, None],
            aligns=[LEFT, RIGHT, RIGHT, RIGHT, RIGHT, CENTER, LEFT])
        r += 1
    if mgrs:
        ws.conditional_formatting.add(
            f"C{first}:C{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=BRAND))
        ws.auto_filter.ref = f"B{first - 1}:H{r - 1}"
    ws.freeze_panes = ws.cell(first, 2)

    # ── Kunlar: the trend, as a table and as a line ──────────────────────────
    ws2 = _sheet(wb, L.get("shDaily", "Kunlar"), {2: 14, 3: 14, 4: 16, 5: 12})
    r = _banner(ws2, 2, 2, 5, title, sub)
    r = _section(ws2, r, 2, 5, L.get("sDaily", "Kunlik"), L.get("sDailySub", ""))
    _head_row(ws2, r, 2, [L.get("cDate", "Sana"), L.get("cMin", "To'xtash, daq"),
                          L.get("cCost", "Xarajat, so'm"), L.get("cEvents", "Hodisalar")])
    r += 1
    head, first = r - 1, r
    for i, d in enumerate(p.get("daily") or []):
        _row(ws2, r, 2, [_iso(d.get("date")), d.get("minutes") or 0,
                         d.get("cost"), d.get("events") or 0],
             band=bool(i % 2), fmts=[DATE_FMT, MIN, UZS, None],
             aligns=[LEFT, RIGHT, RIGHT, CENTER])
        r += 1
    if r > first:
        ch = LineChart()
        ch.title = L.get("chTrend", "")
        ch.height, ch.width = 8.0, 26.0
        ch.y_axis.majorGridlines = None
        data = Reference(ws2, min_col=3, min_row=head, max_row=r - 1)
        cats_ref = Reference(ws2, min_col=2, min_row=first, max_row=r - 1)
        ch.add_data(data, titles_from_data=True)
        ch.set_categories(cats_ref)
        ch.series[0].graphicalProperties.line.solidFill = BRAND
        ch.series[0].graphicalProperties.line.width = 22000
        ch.series[0].smooth = False
        ws2.add_chart(ch, f"{get_column_letter(7)}{first}")
    ws2.freeze_panes = ws2.cell(first, 2)

    # ── Yacheykalar: where the cause is concentrated ─────────────────────────
    ws3 = _sheet(wb, L.get("shCells", "Yacheykalar"),
                 {2: 12, 3: 24, 4: 26, 5: 12, 6: 11, 7: 11, 8: 16, 9: 22})
    r = _banner(ws3, 2, 2, 9, title, sub)
    r = _section(ws3, r, 2, 9, L.get("sCells", "Yacheykalar"), L.get("sCellsSub", ""))
    _head_row(ws3, r, 2, [
        L.get("cCell", "Yacheyka"), L.get("cLeader", "Lider"), L.get("cSup", "Brigadir"),
        L.get("cHc", "Odam soni"), L.get("cMin", "To'xtash, daq"), L.get("cHrs", "Soat"),
        L.get("cCost", "Xarajat, so'm"), L.get("cCats", "Toifalar"),
    ])
    r += 1
    first = r
    cells = p.get("cells") or []
    for i, c in enumerate(cells):
        _row(ws3, r, 2, [
            c.get("code"), c.get("leader"), c.get("manager"), c.get("hc"),
            c.get("minutes"), c.get("hours"), c.get("cost"),
            ", ".join(c.get("cats") or []),
        ], band=bool(i % 2),
            fmts=[None, None, None, HC, MIN, HRS, UZS, None],
            aligns=[CENTER, LEFT, LEFT, RIGHT, RIGHT, RIGHT, RIGHT, LEFT])
        r += 1
    if cells:
        ws3.conditional_formatting.add(
            f"F{first}:F{r - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="max", color=BRAND))
        ws3.auto_filter.ref = f"B{first - 1}:I{r - 1}"
    ws3.freeze_panes = ws3.cell(first, 2)

    # ── Hodisalar: the evidence, in the leaders' own words ───────────────────
    ws4 = _sheet(wb, L.get("shEvents", "Hodisalar"),
                 {2: 12, 3: 14, 4: 11, 5: 22, 6: 22, 7: 8, 8: 8, 9: 10, 10: 14, 11: 70},
                 landscape=True)
    r = _banner(ws4, 2, 2, 11, title, sub)
    r = _section(ws4, r, 2, 11, L.get("sEvents", "Hodisalar"), L.get("sEventsSub", ""))
    _head_row(ws4, r, 2, [
        L.get("cDate", "Sana"), L.get("cCat", "Toifa"), L.get("cCell", "Yacheyka"),
        L.get("cLeader", "Lider"), L.get("cSup", "Brigadir"),
        L.get("cStart", "Boshi"), L.get("cEnd", "Oxiri"), L.get("cMin", "Daq"),
        L.get("cCost", "Xarajat, so'm"), L.get("cNote", "Izoh"),
    ], height=24)
    r += 1
    first = r
    events = p.get("events") or []
    for i, e in enumerate(events):
        _row(ws4, r, 2, [
            _iso(e.get("date")), e.get("category"), e.get("code"), e.get("leader"),
            e.get("manager"), e.get("start"), e.get("end"), e.get("minutes"),
            e.get("cost"), e.get("note") or "",
        ], band=bool(i % 2),
            fmts=[DATE_FMT, None, None, None, None, None, None, MIN, UZS, None],
            aligns=[LEFT, LEFT, CENTER, LEFT, LEFT, CENTER, CENTER, RIGHT, RIGHT, WRAP])
        ws4.cell(r, 3).font = Font(name=FONT, size=10, bold=True,
                                   color=ccolor(e.get("category")))
        # Two lines of note is the usual; Excel will not autofit a row whose
        # height we set, so estimate from the text instead.
        lines = max(1, (len(e.get("note") or "") + 89) // 90)
        ws4.row_dimensions[r].height = 13.5 * min(lines, 4) + 4
        r += 1
    if events:
        ws4.auto_filter.ref = f"B{first - 1}:K{r - 1}"
    ws4.freeze_panes = ws4.cell(first, 4)

    # A per-event minute is that event's OWN length, so the column adds up by
    # eye — and totals MORE than the figures on «Umumiy» wherever two events of
    # one cause overlapped, which the union counts once. Said here rather than
    # left to be discovered by whoever sums the column.
    note = L.get("sumNote")
    if note:
        r += 1
        _block(ws4, r, 2, r, 11, note,
               font=Font(name=FONT, size=8.5, italic=True, color=INK_FAINT))

    wb.properties.title = title
    wb.properties.creator = "Safia Dashboard"
    wb.properties.created = datetime.now()
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
