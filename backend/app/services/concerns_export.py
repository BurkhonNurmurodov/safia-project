"""
Excel export of /concerns — the register and its analysis board as one report.

The page loads the viewer's whole scope once and computes every figure it shows
in the browser: the three headline insights, the four status buckets, the daily
trend, the category / responsible / level splits and the age histogram. That is
the Quality page's shape, so this follows the Quality export's model — the page
posts its OWN finished figures, already labelled in the viewer's language, and
this module is a pure formatter that never re-derives a number. A second
implementation here would disagree with the screen the first time a filter
changed.

The register mirrors the ColumnsPicker: the page sends the visible column keys
in on-screen order and the rows in the on-screen sort order, and every cell is
formatted keyed per column (``_REG``). Where the screen stacks two facts in one
cell — the filing date over the minute it was raised, a cell code over its
leader, an owner over their position — the file writes two real columns,
because a stacked text cell can be neither sorted nor filtered.

It speaks the platform's one workbook language: the primitives are imported
from quality_export rather than copied, so the reports cannot drift apart.

Workbook, in the page's reading order:

    Overview   letterhead · scope · the four status buckets as KPI cards · the
               three headline insights · status split (+ doughnut) · the open
               pool by escalation level (+ bars)
    Trend      one row per day: opened · closed · open at end of day (+ area and
               column charts) · resolution time vs waiting time (+ columns)
    Analysis   status stacks by category (+ stacked bars) · by responsible
               holder, every one of them (data bars, auto-filter)
    Register   every filtered row, visible columns only, auto-filter, frozen head
"""
import re
from datetime import date, datetime, time
from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.chart import AreaChart, BarChart, DoughnutChart, Reference
from openpyxl.chart.marker import DataPoint
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Alignment, Border, Font
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.services.quality_export import (
    BAND, BOX, BRAND, BRAND_SOFT, FONT, GREEN, INK, INK_FAINT, INK_SOFT, NUM,
    PANEL, PCT1, RED, RIGHT, SLATE,
    _banner, _block, _fill, _head_row, _kpi_cards, _meta_strip, _section,
    _sheet, _side,
)

DATE_FMT = "DD.MM.YYYY"
MID = Alignment(horizontal="center", vertical="center")
LEFT_IN = Alignment(horizontal="left", vertical="center", indent=1)
WRAP_TOP = Alignment(horizontal="left", vertical="top", wrap_text=True, indent=1)

# Overview grid — twelve equal columns, the KPI strip's two per card.
C1, C2 = 2, 13
# The wide sheets' letterhead runs past the tables to cover the charts parked
# beside them.
WIDE = 17


# ── small helpers ────────────────────────────────────────────────────────────

def _hex(value: Any, default: str = SLATE) -> str:
    """A page colour ("#22c55e") as openpyxl wants it ("22C55E"). Anything that
    is not six hex digits falls back rather than corrupting the file."""
    s = str(value or "").strip().lstrip("#").upper()
    return s if re.fullmatch(r"[0-9A-F]{6}", s) else default


def _mix(color: str, over: str, alpha: float) -> str:
    """`color` at `alpha` laid over `over` — the page's translucent chips,
    flattened onto the sheet."""
    a = [int(color[i:i + 2], 16) for i in (0, 2, 4)]
    b = [int(over[i:i + 2], 16) for i in (0, 2, 4)]
    return "".join(f"{round(x * alpha + y * (1 - alpha)):02X}" for x, y in zip(a, b))


def _tint(color: str) -> str:
    return _mix(color, "FFFFFF", 0.14)


def _ink(color: str) -> str:
    """A hue used as TEXT, on white or on its own tint: darkened, so the yellow
    and the slate of the status palette stay legible."""
    return _mix(color, "000000", 0.72)


def _int(value: Any) -> Optional[int]:
    try:
        return None if value is None or value == "" else int(value)
    except (TypeError, ValueError):
        return None


def _num(value: Any) -> Optional[float]:
    try:
        return None if value is None or value == "" else float(value)
    except (TypeError, ValueError):
        return None


def _day(value: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def _clock(value: Any) -> Optional[time]:
    try:
        return time.fromisoformat(str(value)[:5]) if value else None
    except ValueError:
        return None


def _clip(text: Any, limit: int) -> str:
    s = " ".join(str(text or "").split())
    return s if len(s) <= limit else s[:limit - 1].rstrip() + "…"


def _zebra(i: int):
    return _fill(PANEL if i % 2 == 0 else BAND)


def _tab(name: Any, fallback: str) -> str:
    """A sheet name Excel accepts: none of []:*?/\\ and no apostrophe at either
    end — a translated word must never be what makes the file unopenable."""
    s = " ".join(re.sub(r"[\[\]:*?/\\]+", " ", str(name or "")).split()).strip("'").strip()
    return s[:31] or fallback


def _show_axes(chart) -> None:
    # openpyxl 3.1 writes axes as deleted unless told otherwise (the same fix
    # ojidaniya_export carries); without it Excel draws a chart with no scale.
    chart.x_axis.delete = False
    chart.y_axis.delete = False


def _points(chart, rows: list[dict]) -> None:
    """One data point per row, so every slice or bar keeps its page colour."""
    pts = []
    for i, r in enumerate(rows):
        dp = DataPoint(idx=i)
        dp.graphicalProperties.solidFill = _hex(r.get("color"))
        dp.graphicalProperties.line.solidFill = "FFFFFF"
        pts.append(dp)
    chart.series[0].data_points = pts


def _rows_for(chart) -> int:
    """How many ~15pt rows a chart covers — the next block starts below it."""
    return int(chart.height * 1.95) + 2


# ── Overview ─────────────────────────────────────────────────────────────────

def _insights(ws: Worksheet, row: int, p: dict) -> int:
    """The page's three headline cards side by side: what the card asks, WHO or
    WHAT answers it, and the figure — kept a number, its unit beside it."""
    items = (p.get("insights") or [])[:3]
    if not items:
        return row
    lbl = p.get("labels") or {}
    row = _section(ws, row, C1, C2, lbl.get("insights", ""), "")
    span = (C2 - C1 + 1) // len(items)
    ws.row_dimensions[row].height = 18
    ws.row_dimensions[row + 1].height = 46
    ws.row_dimensions[row + 2].height = 26
    for i, it in enumerate(items):
        a = C1 + i * span
        b = C2 if i == len(items) - 1 else a + span - 1
        accent = _hex(it.get("color"), BRAND)
        subject = it.get("subject")
        value = _num(it.get("value"))
        _block(ws, row, a, row, b, str(it.get("label") or "").upper(), fill=_fill(PANEL),
               border=Border(left=_side(), right=_side(), top=_side(accent, "medium")),
               font=Font(name=FONT, size=8, bold=True, color=INK_FAINT))
        _block(ws, row + 1, a, row + 1, b,
               _clip(subject, 160) if subject else (it.get("empty") or "—"),
               fill=_fill(PANEL), border=Border(left=_side(), right=_side()), align=WRAP_TOP,
               font=Font(name=FONT, size=10.5, bold=bool(subject),
                         color=INK if subject else INK_SOFT))
        if value is None:
            _block(ws, row + 2, a, row + 2, b, " ", fill=_fill(PANEL),
                   border=Border(left=_side(), right=_side(), bottom=_side()))
            continue
        _block(ws, row + 2, a, row + 2, a, int(value) if value.is_integer() else value,
               fill=_fill(PANEL), border=Border(left=_side(), bottom=_side()), align=LEFT_IN,
               fmt=NUM if value.is_integer() else "0.0",
               font=Font(name=FONT, size=15, bold=True, color=_ink(accent)))
        _block(ws, row + 2, a + 1, row + 2, b, it.get("unit") or " ", fill=_fill(PANEL),
               border=Border(right=_side(), bottom=_side()),
               font=Font(name=FONT, size=9, color=INK_SOFT))
    return row + 4


def _split(ws: Worksheet, row: int, block: Optional[dict], lbl: dict, *, doughnut: bool) -> int:
    """A small split — label · count · share, with a totals row — and its picture
    parked beside it: the page's doughnut for the status buckets, bars for where
    the open pool sits on the escalation chain."""
    rows = (block or {}).get("rows") or []
    if not rows:
        return row
    start = row
    row = _section(ws, row, C1, C2, block.get("title") or "", block.get("subtitle") or "")
    _head_row(ws, row, C1, [block.get("colLabel") or "", lbl.get("count", ""), lbl.get("share", "")],
              first_span=3, height=22)
    row += 1
    first = row
    total = sum(_int(r.get("n")) or 0 for r in rows)
    for i, r in enumerate(rows):
        color = _hex(r.get("color"))
        n = _int(r.get("n")) or 0
        bg = _zebra(i)
        ws.row_dimensions[row].height = 18
        _block(ws, row, C1, row, C1 + 2, r.get("label") or "—", fill=bg,
               border=Border(left=_side(color, "thick"), right=_side(), top=_side(), bottom=_side()),
               font=Font(name=FONT, size=10, color=INK))
        _block(ws, row, C1 + 3, row, C1 + 3, n, fill=bg, border=BOX, align=RIGHT, fmt=NUM,
               font=Font(name=FONT, size=10, bold=True, color=_ink(color) if n else INK_FAINT))
        _block(ws, row, C1 + 4, row, C1 + 4, round(n * 100 / total, 1) if total else 0,
               fill=bg, border=BOX, align=RIGHT, fmt=PCT1,
               font=Font(name=FONT, size=9.5, color=INK_SOFT))
        row += 1
    last = row - 1
    top = Border(left=_side(), right=_side(), top=_side(BRAND, "medium"), bottom=_side())
    bold = Font(name=FONT, size=10, bold=True, color=INK)
    _block(ws, row, C1, row, C1 + 2, lbl.get("total", ""), fill=_fill(BRAND_SOFT), border=top,
           font=bold)
    _block(ws, row, C1 + 3, row, C1 + 3, total, fill=_fill(BRAND_SOFT), border=top, align=RIGHT,
           fmt=NUM, font=bold)
    _block(ws, row, C1 + 4, row, C1 + 4, 100 if total else 0, fill=_fill(BRAND_SOFT), border=top,
           align=RIGHT, fmt=PCT1, font=bold)
    row += 1

    if doughnut:
        chart = DoughnutChart(holeSize=62)
        chart.legend.position = "r"
    else:
        chart = BarChart()
        chart.type = "bar"
        chart.legend = None
        chart.y_axis.majorGridlines = None
        _show_axes(chart)
        chart.gapWidth = 60
    chart.height, chart.width = 6.6, 12.5
    chart.add_data(Reference(ws, min_col=C1 + 3, min_row=first, max_row=last),
                   titles_from_data=False)
    chart.set_categories(Reference(ws, min_col=C1, min_row=first, max_row=last))
    _points(chart, rows)
    ws.add_chart(chart, f"{get_column_letter(C1 + 6)}{start + 2}")
    return max(row + 1, start + 2 + _rows_for(chart))


def _overview(wb: Workbook, p: dict) -> None:
    """Tab 1 — letterhead, the scope the report was taken under, the status
    buckets, the three insights and the two splits."""
    tabs = p.get("sheets") or {}
    lbl = p.get("labels") or {}
    ws = _sheet(wb, _tab(tabs.get("overview"), "Overview"),
                {c: 13.0 for c in range(C1, C2 + 1)}, landscape=True)

    row = _banner(ws, 2, C1, C2, p.get("title") or "", p.get("subtitle") or "")
    row = _meta_strip(ws, row, C1, C2, p.get("meta") or [])

    kpis = p.get("kpis") or []
    if kpis:
        row = _section(ws, row, C1, C2, lbl.get("kpi", ""), "")
        row = _kpi_cards(ws, row, C1, kpis)

    row = _insights(ws, row, p)
    row = _split(ws, row, p.get("status"), lbl, doughnut=True)
    _split(ws, row, p.get("levels"), lbl, doughnut=False)
    ws.print_title_rows = "1:3"


# ── Trend ────────────────────────────────────────────────────────────────────

def _days(ws: Worksheet, row: int, tr: dict) -> int:
    """The page's two day-axis charts share one axis, so they are one table here:
    opened · closed · open at end of day, with both pictures beside it."""
    days = tr.get("rows") or []
    start = row
    row = _section(ws, row, 2, WIDE, tr.get("title") or "", tr.get("subtitle") or "")
    _head_row(ws, row, 2, [tr.get("colDate") or "", tr.get("colOpened") or "",
                           tr.get("colClosed") or "", tr.get("colOpen") or ""], height=26)
    head_row = row
    row += 1
    first = row
    for i, d in enumerate(days):
        bg = _zebra(i)
        ws.row_dimensions[row].height = 15
        day = _day(d.get("d"))
        _block(ws, row, 2, row, 2, day or d.get("d") or "—", fill=bg, border=BOX, align=MID,
               fmt=DATE_FMT if day else None, font=Font(name=FONT, size=9.5, color=INK))
        for j, (key, color) in enumerate((("opened", RED), ("closed", GREEN), ("open", BRAND))):
            v = _int(d.get(key)) or 0
            _block(ws, row, 3 + j, row, 3 + j, v, fill=bg, border=BOX, align=RIGHT, fmt=NUM,
                   font=Font(name=FONT, size=9.5, bold=key == "open",
                             color=_ink(color) if v else INK_FAINT))
        row += 1
    last = row - 1

    area = AreaChart()
    area.title = tr.get("title") or None
    area.legend = None
    area.y_axis.majorGridlines = None
    _show_axes(area)
    area.height, area.width = 7.0, 17.0
    area.add_data(Reference(ws, min_col=5, min_row=head_row, max_row=last), titles_from_data=True)
    area.set_categories(Reference(ws, min_col=2, min_row=first, max_row=last))
    area.x_axis.number_format = "DD.MM"
    s = area.series[0]
    s.graphicalProperties.solidFill = _mix(BRAND, "FFFFFF", 0.35)
    s.graphicalProperties.line.solidFill = BRAND
    s.graphicalProperties.line.width = 22225
    ws.add_chart(area, f"G{start + 2}")

    flow = BarChart()
    flow.type = "col"
    flow.grouping = "clustered"
    flow.title = tr.get("flowTitle") or None
    flow.legend.position = "t"
    flow.y_axis.majorGridlines = None
    _show_axes(flow)
    flow.height, flow.width = 7.0, 17.0
    flow.gapWidth = 40
    flow.add_data(Reference(ws, min_col=3, max_col=4, min_row=head_row, max_row=last),
                  titles_from_data=True)
    flow.set_categories(Reference(ws, min_col=2, min_row=first, max_row=last))
    flow.x_axis.number_format = "DD.MM"
    flow.series[0].graphicalProperties.solidFill = RED
    flow.series[1].graphicalProperties.solidFill = GREEN
    ws.add_chart(flow, f"G{start + 2 + _rows_for(area)}")

    return max(row + 1, start + 2 + _rows_for(area) + _rows_for(flow))


def _age(ws: Worksheet, row: int, age: dict) -> int:
    """How long things take: resolution spans of the done rows against the wait
    of the open ones, over the page's shared day buckets."""
    buckets = age.get("buckets") or []
    series = (age.get("series") or [])[:2]
    start = row
    row = _section(ws, row, 2, WIDE, age.get("title") or "", age.get("subtitle") or "")
    _head_row(ws, row, 2, [age.get("colBucket") or ""] + [s.get("name") or "" for s in series],
              height=26)
    head_row = row
    row += 1
    first = row
    for i, b in enumerate(buckets):
        bg = _zebra(i)
        ws.row_dimensions[row].height = 17
        _block(ws, row, 2, row, 2, str(b), fill=bg, border=BOX, align=MID,
               font=Font(name=FONT, size=10, color=INK))
        for j, s in enumerate(series):
            data = s.get("data") or []
            v = (_int(data[i]) if i < len(data) else 0) or 0
            color = _hex(s.get("color"))
            _block(ws, row, 3 + j, row, 3 + j, v, fill=bg, border=BOX, align=RIGHT, fmt=NUM,
                   font=Font(name=FONT, size=10, bold=bool(v),
                             color=_ink(color) if v else INK_FAINT))
        row += 1
    last = row - 1

    chart = BarChart()
    chart.type = "col"
    chart.grouping = "clustered"
    chart.title = age.get("title") or None
    chart.legend.position = "t"
    chart.y_axis.majorGridlines = None
    _show_axes(chart)
    chart.height, chart.width = 7.0, 17.0
    chart.add_data(Reference(ws, min_col=3, max_col=2 + len(series), min_row=head_row, max_row=last),
                   titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=2, min_row=first, max_row=last))
    for j, s in enumerate(series):
        chart.series[j].graphicalProperties.solidFill = _hex(s.get("color"))
    ws.add_chart(chart, f"G{start + 2}")
    return max(row + 1, start + 2 + _rows_for(chart))


def _trend(wb: Workbook, p: dict) -> None:
    """Tab 2 — the dynamics. Its day axis is the page's own padded window (never
    fewer than seven days), exactly as the charts draw it."""
    tr = p.get("trend") or {}
    age = p.get("age") or {}
    if not tr.get("rows") and not age.get("series"):
        return
    tabs = p.get("sheets") or {}
    ws = _sheet(wb, _tab(tabs.get("trend"), "Trend"),
                {2: 15.0, 3: 14.0, 4: 14.0, 5: 15.0, 6: 2.5}, landscape=True)
    row = _banner(ws, 2, 2, WIDE, p.get("title") or "", p.get("subtitle") or "")
    if tr.get("rows"):
        row = _days(ws, row, tr)
    if age.get("series") and age.get("buckets"):
        _age(ws, row, age)
    ws.print_title_rows = "1:3"


# ── Analysis ─────────────────────────────────────────────────────────────────

def _categories(ws: Worksheet, row: int, block: dict, lbl: dict) -> int:
    """Status stacks per department — the same four disjoint buckets as the
    doughnut, a totals row, and the page's stacked bars beside the table."""
    parts = (block.get("parts") or [])[:4]
    rows = block.get("rows") or []
    start = row
    row = _section(ws, row, 2, WIDE, block.get("title") or "", block.get("subtitle") or "")
    _head_row(ws, row, 2, [block.get("colLabel") or ""] + [pt.get("label") or "" for pt in parts]
              + [lbl.get("total", "")], first_span=2, height=26)
    head_row = row
    row += 1
    first = row
    tot_col = 4 + len(parts)
    for i, r in enumerate(rows):
        bg = _zebra(i)
        ws.row_dimensions[row].height = 18
        _block(ws, row, 2, row, 3, r.get("label") or "—", fill=bg,
               border=Border(left=_side(_hex(r.get("color")), "thick"), right=_side(),
                             top=_side(), bottom=_side()),
               font=Font(name=FONT, size=10, color=INK))
        for j, pt in enumerate(parts):
            v = _int(r.get(pt.get("key"))) or 0
            _block(ws, row, 4 + j, row, 4 + j, v, fill=bg, border=BOX, align=RIGHT, fmt=NUM,
                   font=Font(name=FONT, size=10, bold=bool(v),
                             color=_ink(_hex(pt.get("color"))) if v else INK_FAINT))
        _block(ws, row, tot_col, row, tot_col, _int(r.get("total")) or 0, fill=bg, border=BOX,
               align=RIGHT, fmt=NUM, font=Font(name=FONT, size=10, bold=True, color=INK))
        row += 1
    last = row - 1
    col = get_column_letter(tot_col)
    ws.conditional_formatting.add(
        f"{col}{first}:{col}{last}",
        DataBarRule(start_type="num", start_value=0, end_type="max", color=BRAND, showValue=True))

    # One concern carries ONE category, so the columns genuinely add up.
    top = Border(left=_side(), right=_side(), top=_side(BRAND, "medium"), bottom=_side())
    bold = Font(name=FONT, size=10, bold=True, color=INK)
    _block(ws, row, 2, row, 3, lbl.get("total", ""), fill=_fill(BRAND_SOFT), border=top, font=bold)
    for j, pt in enumerate(parts):
        _block(ws, row, 4 + j, row, 4 + j, sum(_int(r.get(pt.get("key"))) or 0 for r in rows),
               fill=_fill(BRAND_SOFT), border=top, align=RIGHT, fmt=NUM, font=bold)
    _block(ws, row, tot_col, row, tot_col, sum(_int(r.get("total")) or 0 for r in rows),
           fill=_fill(BRAND_SOFT), border=top, align=RIGHT, fmt=NUM, font=bold)
    row += 1

    chart = BarChart()
    chart.type = "bar"
    chart.grouping = "stacked"
    chart.overlap = 100
    chart.title = block.get("title") or None
    chart.legend.position = "t"
    chart.y_axis.majorGridlines = None
    _show_axes(chart)
    chart.height, chart.width = max(6.5, 0.55 * len(rows) + 2.5), 16.0
    chart.gapWidth = 50
    for j, pt in enumerate(parts):
        chart.add_data(Reference(ws, min_col=4 + j, min_row=head_row, max_row=last),
                       titles_from_data=True)
        chart.series[-1].graphicalProperties.solidFill = _hex(pt.get("color"))
    chart.set_categories(Reference(ws, min_col=2, min_row=first, max_row=last))
    chart.x_axis.scaling.orientation = "maxMin"      # biggest on top, as the table reads
    ws.add_chart(chart, f"J{start + 2}")
    return max(row + 1, start + 2 + _rows_for(chart))


def _responsible(ws: Worksheet, row: int, block: dict, lbl: dict) -> None:
    """The same stacks per responsible HOLDER, and every one of them — the page
    cuts its board to what fits beside the categories, the file does not. Each
    name carries the chain step it answers on. No totals row: a legacy row naming
    two holders counts under both, so the column sums are not a row count."""
    parts = (block.get("parts") or [])[:4]
    rows = block.get("rows") or []
    row = _section(ws, row, 2, WIDE, block.get("title") or "", block.get("subtitle") or "")
    _head_row(ws, row, 2, [block.get("colName") or "", block.get("colLevel") or ""]
              + [pt.get("label") or "" for pt in parts] + [lbl.get("total", "")], height=26)
    head_row = row
    row += 1
    first = row
    tot_col = 4 + len(parts)
    for i, r in enumerate(rows):
        bg = _zebra(i)
        none = bool(r.get("none"))
        _block(ws, row, 2, row, 2, r.get("name") or "—", fill=bg, border=BOX, align=LEFT_IN,
               font=Font(name=FONT, size=10, italic=none, color=INK_SOFT if none else INK))
        level = r.get("level") or ""
        lc = _hex(r.get("levelColor")) if level else None
        _block(ws, row, 3, row, 3, level or "—", fill=_fill(_tint(lc)) if lc else bg, border=BOX,
               align=MID, font=Font(name=FONT, size=9, bold=bool(level),
                                    color=_ink(lc) if lc else INK_FAINT))
        for j, pt in enumerate(parts):
            v = _int(r.get(pt.get("key"))) or 0
            _block(ws, row, 4 + j, row, 4 + j, v, fill=bg, border=BOX, align=RIGHT, fmt=NUM,
                   font=Font(name=FONT, size=10, bold=bool(v),
                             color=_ink(_hex(pt.get("color"))) if v else INK_FAINT))
        _block(ws, row, tot_col, row, tot_col, _int(r.get("total")) or 0, fill=bg, border=BOX,
               align=RIGHT, fmt=NUM, font=Font(name=FONT, size=10, bold=True, color=INK))
        row += 1
    last = row - 1
    col = get_column_letter(tot_col)
    ws.conditional_formatting.add(
        f"{col}{first}:{col}{last}",
        DataBarRule(start_type="num", start_value=0, end_type="max", color=BRAND, showValue=True))
    # The one table on this sheet long enough to want Excel's own filter.
    ws.auto_filter.ref = f"B{head_row}:{col}{last}"


def _analysis(wb: Workbook, p: dict) -> None:
    """Tab 3 — the analysis board's two stacked boards, in on-screen order."""
    cats = p.get("categories") or {}
    resp = p.get("responsible") or {}
    if not cats.get("rows") and not resp.get("rows"):
        return
    tabs = p.get("sheets") or {}
    lbl = p.get("labels") or {}
    widths = {2: 32.0, 3: 17.0, 4: 12.0, 5: 12.0, 6: 12.0, 7: 12.0, 8: 12.0, 9: 2.5}
    ws = _sheet(wb, _tab(tabs.get("analysis"), "Analysis"), widths, landscape=True)
    row = _banner(ws, 2, 2, WIDE, p.get("title") or "", p.get("subtitle") or "")
    if cats.get("rows"):
        row = _categories(ws, row, cats, lbl)
    if resp.get("rows"):
        _responsible(ws, row, resp, lbl)
    ws.print_title_rows = "1:3"


# ── Register ─────────────────────────────────────────────────────────────────

# Column key → the physical columns it writes: (row field, header, width, kind).
# A header of None is the column's own label; anything else is a key into
# register.labels — the second half of a cell the screen stacks.
_REG: dict[str, tuple[tuple[str, Optional[str], float, str], ...]] = {
    "num":         (("num", None, 8.0, "int"),),
    "date":        (("d", None, 12.5, "date"), ("time", "time", 8.5, "time")),
    "cell":        (("cell", None, 10.0, "code"), ("cellLeader", "leader", 24.0, "text")),
    "category":    (("category", None, 17.0, "chip"),),
    "owner":       (("owner", None, 26.0, "text"), ("ownerRole", "role", 16.0, "muted")),
    "concern":     (("text", None, 62.0, "wrap"),),
    "status":      (("status", None, 17.0, "chip"),),
    "level":       (("level", None, 17.0, "chip"),),
    "responsible": (("responsible", None, 26.0, "text"),),
    "deadline":    (("deadline", None, 11.0, "deadline"),),
    "resolution":  (("minutes", "duration", 14.0, "duration"),),
    "comments":    (("comments", None, 10.0, "int"),),
}


def _reg_cell(ws: Worksheet, row: int, col: int, kind: str, field: str, r: dict, bg) -> None:
    v = r.get(field)

    def put(value, *, align=MID, fmt=None, font=None, fill=bg):
        _block(ws, row, col, row, col, value, fill=fill, border=BOX, align=align, fmt=fmt,
               font=font or Font(name=FONT, size=9.5, color=INK))

    faint = Font(name=FONT, size=9.5, color=INK_FAINT)
    if kind == "int":
        n = _int(v)
        put(n if n is not None else "—", fmt=NUM if n is not None else None,
            font=Font(name=FONT, size=9.5, color=INK_SOFT) if n else faint)
    elif kind == "date":
        d = _day(v)
        put(d or "—", fmt=DATE_FMT if d else None, font=None if d else faint)
    elif kind == "time":
        t = _clock(v)
        put(t or "—", fmt="HH:MM" if t else None,
            font=Font(name=FONT, size=9.5, color=INK_SOFT) if t else faint)
    elif kind == "code":
        put(v or "—", font=Font(name=FONT, size=9.5, bold=True, color=INK) if v else faint)
    elif kind == "chip":
        color = r.get(f"{field}Color")
        if v and color:
            c = _hex(color)
            put(v, fill=_fill(_tint(c)), font=Font(name=FONT, size=9, bold=True, color=_ink(c)))
        else:
            put(v or "—", font=None if v else faint)
    elif kind == "wrap":
        put(v or "—", align=WRAP_TOP)
    elif kind == "deadline":
        n = _int(v)
        late = n is not None and bool(r.get("overdue"))
        put(n if n is not None else "—", fmt=NUM if n is not None else None,
            font=Font(name=FONT, size=9.5, bold=late, color=RED if late else INK_SOFT)
            if n is not None else faint)
    elif kind == "duration":
        # A real duration, not the screen's «3 kun 22 soat» text: it sorts and
        # sums, and [h]:mm keeps a span longer than a day readable.
        m = _int(v)
        if m is None:
            put("—", font=faint)
        else:
            put(m / 1440, align=RIGHT, fmt="[h]:mm", font=Font(name=FONT, size=9.5, color=INK_SOFT))
    elif kind == "muted":
        put(v or "—", align=LEFT_IN, font=Font(name=FONT, size=9, color=INK_SOFT) if v else faint)
    else:
        put(v or "—", align=LEFT_IN, font=None if v else faint)


def _register(wb: Workbook, p: dict) -> None:
    """Tab 4 — every row under the page's filters, in its sort order, through the
    columns the viewer has visible, in the order they arranged them."""
    tabs = p.get("sheets") or {}
    lbl = p.get("labels") or {}
    reg = p.get("register") or {}
    heads = reg.get("labels") or {}
    cols = []
    for c in reg.get("columns") or []:
        for field, head, width, kind in _REG.get(str(c.get("key")), ()):
            label = (heads.get(head) if head else None) or c.get("label") or field
            cols.append((field, label, width, kind))
    if not cols:
        return
    rows = reg.get("rows") or []
    CR1 = 2
    CR2 = CR1 + len(cols) - 1
    edge = max(CR2, CR1 + 5)
    ws = _sheet(wb, _tab(tabs.get("register"), "Register"),
                {CR1 + i: w for i, (_, _, w, _) in enumerate(cols)}, landscape=True)

    row = _banner(ws, 2, CR1, edge, p.get("title") or "", p.get("subtitle") or "")
    row = _section(ws, row, CR1, edge, reg.get("title") or "", reg.get("countLabel") or "")
    _head_row(ws, row, CR1, [label for _, label, _, _ in cols], height=30)
    head_row = row
    row += 1
    first = row

    if not rows:
        _block(ws, row, CR1, row, edge, lbl.get("empty") or "—", border=BOX, align=MID,
               font=Font(name=FONT, size=10, color=INK_FAINT))
        row += 1
    for i, r in enumerate(rows):
        bg = _zebra(i)
        for j, (field, _, _, kind) in enumerate(cols):
            _reg_cell(ws, row, CR1 + j, kind, field, r, bg)
        row += 1

    if rows:
        ws.auto_filter.ref = f"{get_column_letter(CR1)}{head_row}:{get_column_letter(CR2)}{row - 1}"
    # A coordinate string, not ws.cell(): on an empty register that cell sits
    # inside the merged «empty» row and a MergedCell cannot anchor a freeze.
    ws.freeze_panes = f"{get_column_letter(CR1)}{first}"
    ws.print_title_rows = f"{head_row}:{head_row}"


def build_concerns_workbook(p: dict) -> BytesIO:
    """Assemble the four tabs and hand back the saved workbook. The overview is
    always written, so the file always opens."""
    wb = Workbook()
    wb.remove(wb.active)
    _overview(wb, p)
    _trend(wb, p)
    _analysis(wb, p)
    _register(wb, p)
    wb.properties.title = p.get("title") or "Concerns"
    wb.properties.creator = "Safia Dashboard"
    wb.properties.created = datetime.now()
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio
