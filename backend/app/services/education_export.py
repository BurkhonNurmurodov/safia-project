"""«Ta'lim» watch register → a workbook.

Three sheets, ONE question each, and they are separate sheets because they are
three different subjects: the LESSONS (how did each one land), the PEOPLE (every
person against every lesson they were given), and the ones still OWED. Putting
the per-lesson summary and the per-person rows in one table is how a reader
comes to compare a mean against a count.

Every figure is handed in by ``routers/education._report`` — the same function
the page reads — so the file and the screen cannot state different numbers about
one lesson. Nothing is computed here beyond formatting, and this module queries
nothing. The WORDS come from the client, so the file speaks the language the
person who pressed the button was reading.

**Only 100% is watched** (``services/education_progress``), so «Tugatgan» here
means every second played. The percentage sits beside every such flag on purpose:
without it a 99% watch and a never-opened lesson are the same red mark, and they
are not the same fact about a person.
"""
from __future__ import annotations

from io import BytesIO
from typing import Optional

from openpyxl import Workbook
from openpyxl.formatting.rule import DataBarRule
from openpyxl.styles import Alignment, Border, Font
from openpyxl.utils import get_column_letter

from app.services.education_progress import fmt_clock
from app.services.quality_export import (
    BAND, BOX, BRAND, CENTER, FONT, GREEN, INK, INK_FAINT, INK_SOFT, LEFT,
    LINE, NUM, PANEL, RED, SLATE, TINT, _banner, _block, _fill, _head_row,
    _kpi_cards, _meta_strip, _section, _sheet, _side,
)

PCT_FMT = '0"%"'


def _w(labels: dict, key: str, fallback: str) -> str:
    v = (labels or {}).get(key)
    return v if isinstance(v, str) and v.strip() else fallback


def _iso_day(value: Optional[str]) -> str:
    """``2026-09-10T14:22:31+00:00`` → ``10.09.2026 14:22``. A cell nobody has to
    decode. An absent instant is «—», never a blank that reads as a zero."""
    if not value or not isinstance(value, str):
        return "—"
    try:
        date, _, rest = value.partition("T")
        y, m, d = date.split("-")
        return f"{d}.{m}.{y} {rest[:5]}" if rest else f"{d}.{m}.{y}"
    except Exception:                                   # noqa: BLE001
        return value[:16]


def _lessons_sheet(wb: Workbook, data: dict, L: dict) -> None:
    lessons = data.get("lessons") or []
    ws = _sheet(wb, _w(L, "tab.lessons", "Darslar"),
                {2: 44, 3: 12, 4: 11, 5: 11, 6: 11, 7: 11, 8: 13, 9: 15},
                landscape=True)
    c1, c2 = 2, 9
    row = _banner(ws, 1, c1, c2, _w(L, "title", "Ta'lim — ko'rish hisoboti"),
                  _w(L, "subtitle", "Kim ko'rdi, qancha qismini ko'rdi"))

    audience = sum(int(x.get("audience") or 0) for x in lessons)
    opened = sum(int(x.get("opened") or 0) for x in lessons)
    done = sum(int(x.get("completed") or 0) for x in lessons)
    row = _meta_strip(ws, row, c1, c2, [
        {"label": _w(L, "m.lessons", "Darslar"), "value": str(len(lessons))},
        {"label": _w(L, "m.assignments", "Tayinlovlar"), "value": str(audience)},
        {"label": _w(L, "m.rule", "Qoida"),
         "value": _w(L, "m.rule.v", "Faqat 100% — ko'rilgan")},
        {"label": _w(L, "m.generated", "Fayl sanasi"),
         "value": _iso_day(data.get("generated_at"))},
    ])

    pct_all = round(100 * done / audience) if audience else 0
    row = _kpi_cards(ws, row, c1, [
        {"value": len(lessons), "label": _w(L, "k.lessons", "Darslar"),
         "hint": _w(L, "k.lessons.h", "arxivlanmagan"), "color": BRAND},
        {"value": audience, "label": _w(L, "k.assigned", "Tayinlangan"),
         "hint": _w(L, "k.assigned.h", "dars × kishi"), "color": SLATE},
        {"value": opened, "label": _w(L, "k.opened", "Ochgan"),
         "hint": _w(L, "k.opened.h", "hech bo'lmasa ochgan"), "color": BRAND},
        {"value": done, "label": _w(L, "k.done", "To'liq ko'rgan"),
         "hint": _w(L, "k.done.h", "100%"), "color": GREEN},
        {"value": audience - done, "label": _w(L, "k.owed", "Qolgan"),
         "hint": _w(L, "k.owed.h", "tugatmagan"), "color": RED},
        {"value": pct_all, "fmt": PCT_FMT, "label": _w(L, "k.rate", "Bajarilish"),
         "hint": _w(L, "k.rate.h", "to'liq ko'rganlar ulushi"), "color": GREEN},
    ])

    row = _section(ws, row, c1, c2, _w(L, "s.lessons", "Darslar bo'yicha"),
                   _w(L, "s.lessons.sub", "eng yangisi birinchi"))
    heads = [_w(L, "h.lesson", "Dars"), _w(L, "h.provider", "Manba"),
             _w(L, "h.duration", "Davomiyligi"), _w(L, "h.audience", "Tayinlangan"),
             _w(L, "h.opened", "Ochgan"), _w(L, "h.done", "To'liq"),
             _w(L, "h.owed", "Qolgan"), _w(L, "h.mean", "O'rtacha %")]
    _head_row(ws, row, c1, heads)
    ws.freeze_panes = ws.cell(row + 1, c1)
    row += 1
    first = row
    for i, x in enumerate(lessons):
        fill = _fill(PANEL if i % 2 == 0 else BAND)
        n_aud = int(x.get("audience") or 0)
        n_done = int(x.get("completed") or 0)
        vals = [
            x.get("title") or "—",
            (x.get("provider") or "").title(),
            fmt_clock(x.get("duration_s")) if x.get("duration_s") else "—",
            n_aud, int(x.get("opened") or 0), n_done, n_aud - n_done,
            round(100 * float(x.get("mean_pct") or 0)),
        ]
        for j, v in enumerate(vals):
            cell = ws.cell(row, c1 + j)
            cell.value = v
            cell.fill = fill
            cell.border = BOX
            cell.font = Font(name=FONT, size=9.5,
                             color=INK if j == 0 else INK_SOFT,
                             bold=(j == 0))
            cell.alignment = LEFT if j <= 2 else CENTER
            if j >= 3:
                cell.number_format = PCT_FMT if j == 7 else NUM
        # Green where the whole class finished, red where nobody has — the page's
        # own traffic light, and nothing in between gets a colour, because a
        # part-finished class is neither good nor bad news on its own.
        done_cell = ws.cell(row, c1 + 5)
        if n_aud:
            if n_done == n_aud:
                done_cell.fill = _fill(TINT[GREEN])
                done_cell.font = Font(name=FONT, size=9.5, bold=True, color=GREEN)
            elif n_done == 0:
                done_cell.fill = _fill(TINT[RED])
                done_cell.font = Font(name=FONT, size=9.5, bold=True, color=RED)
        row += 1
    if lessons:
        col = get_column_letter(c1 + 7)
        ws.conditional_formatting.add(
            f"{col}{first}:{col}{row - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="num",
                        end_value=100, color=BRAND, showValue=True))


def _people_sheet(wb: Workbook, data: dict, L: dict, *, only_owed: bool) -> None:
    """Every person against every lesson (or only the ones still owed).

    The roster is the AUDIENCE, so somebody who never opened a lesson is a row
    reading 0% — the whole reason this file exists. A sheet built from what was
    watched could only ever list the people who watched.
    """
    rows = [r for r in (data.get("rows") or [])
            if not only_owed or not r.get("complete")]
    title = _w(L, "tab.owed", "Tugatmaganlar") if only_owed else \
        _w(L, "tab.people", "Kishilar")
    ws = _sheet(wb, title,
                {2: 34, 3: 26, 4: 14, 5: 20, 6: 8, 7: 16, 8: 10, 9: 12,
                 10: 12, 11: 16, 12: 9},
                landscape=True)
    c1, c2 = 2, 12
    sub = _w(L, "s.owed.sub", "100% ko'rmaganlar") if only_owed else \
        _w(L, "s.people.sub", "har bir dars × har bir kishi")
    row = _banner(ws, 1, c1, c2, _w(L, "title", "Ta'lim — ko'rish hisoboti"), sub)
    row = _section(ws, row, c1, c2, title, f"{len(rows)}")

    heads = [_w(L, "h.lesson", "Dars"), _w(L, "h.name", "Ism"),
             _w(L, "h.role", "Rol"), _w(L, "h.unit", "Brigada"),
             _w(L, "h.shift", "Smena"), _w(L, "h.opened_at", "Ochgan vaqti"),
             _w(L, "h.pct", "Ko'rgan %"), _w(L, "h.watched", "Ko'rgan vaqt"),
             _w(L, "h.status", "Holat"), _w(L, "h.last", "Oxirgi faollik"),
             _w(L, "h.flags", "Shubha")]
    _head_row(ws, row, c1, heads)
    ws.freeze_panes = ws.cell(row + 1, c1)
    head_row = row
    row += 1
    first = row
    for i, r in enumerate(rows):
        fill = _fill(PANEL if i % 2 == 0 else BAND)
        complete = bool(r.get("complete"))
        opened = bool(r.get("opened_at"))
        vals = [
            r.get("lesson") or "—",
            r.get("name") or "—",
            (r.get("role") or "").replace("_", " ").title() or "—",
            r.get("unit") or "—",
            r.get("shift") if r.get("shift") is not None else "—",
            _iso_day(r.get("opened_at")),
            round(100 * float(r.get("pct") or 0)),
            fmt_clock(r.get("covered_s")),
            (_w(L, "v.done", "To'liq ko'rgan") if complete
             else _w(L, "v.partial", "Qisman") if opened
             else _w(L, "v.never", "Ochmagan")),
            _iso_day(r.get("last_at")),
            int(r.get("anomalies") or 0) or "—",
        ]
        for j, v in enumerate(vals):
            cell = ws.cell(row, c1 + j)
            cell.value = v
            cell.fill = fill
            cell.border = BOX
            cell.font = Font(name=FONT, size=9.5,
                             color=INK if j <= 1 else INK_SOFT, bold=(j == 1))
            cell.alignment = LEFT if j <= 3 or j == 5 else CENTER
            if j == 6:
                cell.number_format = PCT_FMT
        status = ws.cell(row, c1 + 8)
        colour = GREEN if complete else (BRAND if opened else RED)
        status.fill = _fill(TINT[colour])
        status.font = Font(name=FONT, size=9.5, bold=True, color=colour)
        row += 1

    if rows:
        ws.auto_filter.ref = (f"{get_column_letter(c1)}{head_row}:"
                              f"{get_column_letter(c2 - 1)}{row - 1}")
        col = get_column_letter(c1 + 6)
        ws.conditional_formatting.add(
            f"{col}{first}:{col}{row - 1}",
            DataBarRule(start_type="num", start_value=0, end_type="num",
                        end_value=100, color=BRAND, showValue=True))
    else:
        _block(ws, row, c1, row, c2 - 1, _w(L, "empty", "Ma'lumot yo'q"),
               fill=_fill(PANEL), border=BOX,
               font=Font(name=FONT, size=9.5, color=INK_FAINT),
               align=Alignment(horizontal="center", vertical="center"))
        row += 1

    # The rule the «Holat» column is written under, spelled out. A reader who
    # forwards this file is not in the conversation the threshold was set in.
    ws.cell(row + 1, c1).value = _w(
        L, "note", "«To'liq ko'rgan» — videoning har bir soniyasi ko'rilgan. "
                   "O'tkazib yuborilgan qism ko'rilgan hisoblanmaydi.")
    ws.cell(row + 1, c1).font = Font(name=FONT, size=8.5, color=INK_FAINT)


def build_workbook(data: dict, labels: Optional[dict] = None) -> BytesIO:
    L = labels or {}
    wb = Workbook()
    wb.remove(wb.active)
    _lessons_sheet(wb, data, L)
    _people_sheet(wb, data, L, only_owed=False)
    _people_sheet(wb, data, L, only_owed=True)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
