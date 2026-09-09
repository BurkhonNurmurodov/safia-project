"""Draws the call forecast as a PNG — the number, and the history it came from.

The «Smenaga chaqirish» DM tells a brigadir how many workers to call for their
next shift. That number is a MOVING AVERAGE over the same weekday in the three
preceding weeks (routers/production._call_rows), and until this card the DM
carried the answer with none of its evidence: a brigadir reading «call 34» had
no way to see that the three Wednesdays behind it were 31, 35 and 36 — or that
one of them was missing entirely, which is exactly when the number is least
worth trusting.

Four rules hold this together:

* **It computes NOTHING.** ``build`` is handed one row out of ``_call_rows`` —
  the same function the modal, the 19:00/06:00 automatic send and the bot's
  own /forecast command all read — and draws it. A card that re-derived the
  mean would be a second answer to «how many workers», and the two would drift
  the first time the window changed. The row's ``samples`` (the dated worker
  counts the mean was taken over) are what the chart plots; nothing else here
  touches the database.

* **The axis is WORKERS, because that is what the message asks for.** The
  page's own «Тренд по дню недели» chart plots trudoyomkost MINUTES, and the
  curve here is that same curve — workers are the minutes divided by one
  worker's capacity, a constant — so the shape a brigadir recognises from the
  dashboard is unchanged. Only the labels differ: the worker count is printed
  on each point (the DM's own unit) with the minutes it came from underneath,
  so neither figure has to be worked out by the reader.

* **A missing week is DRAWN, never closed up.** The x axis always carries all
  three preceding same-weekday dates plus the target, so a week the source
  sheet has no plan for reads as a gap with «—» under it instead of silently
  becoming a two-point line that looks like three. That gap is the whole
  visible difference between a forecast averaged over three weeks and one
  averaged over one, and the footer names the count as well.

* **Pillow, not a browser.** Same decision, and the same font resolver, as the
  /ojidaniya card next door: the hosting cannot run a headless Chromium
  reliably, so the card is DRAWN in the app's own dark visual language. It will
  drift if the palette changes — keep it in step with downtime_card.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from io import BytesIO

from PIL import Image, ImageDraw

# One palette and one font resolver for both cards — a second copy of either is
# how the two drift into looking like they came from different products.
from app.services.downtime_card import (
    AMBER, BG, BORDER, BRAND, CARD, GREEN, RED, TEXT_1, TEXT_2, TEXT_3,
    _ellipsize, _font, _panel, _text_w,
)

logger = logging.getLogger(__name__)

W = 1000
PAD = 32

HIST = (59, 130, 246)      # the history line — chartPalette's blue, as on the page
BAND = (148, 163, 184)     # the mean ± σ band

# ONE vocabulary for the whole feature: the PNG below and the Rich-HTML body
# in services/forecast_rich both read this, so the picture and the words beside
# it can never name the same figure two different ways.
L = {
    "uz": {
        "title": "Xodim chaqirish prognozi", "rec": "Tavsiya etiladi",
        "max": "Maksimum", "load": "Zagruzka foizi", "people": "nafar",
        "chart": "Oxirgi 3 ta {wd} · odam soni", "forecast": "Prognoz",
        "fact": "Amaldagi", "sup": "Brigadir", "day": "Sana",
        "plan": "Trudoyomkost (reja)",
        "band": "Ehtimoliy oraliq", "min": "daq", "nodata": "Ma'lumot yo'q",
        "none": "Bu kun uchun yetarli tarix yo'q — prognoz hisoblanmadi.",
        "basis": "{have} ta hafta {want} tadan · o'rtacha {mean} nafar",
        "conf": {"high": "Ishonch: yuqori", "medium": "Ishonch: o'rtacha",
                 "low": "Ishonch: past", "insufficient": "Ishonch: yetarli emas"},
        "wd": ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma",
               "Shanba", "Yakshanba"],
    },
    "uz_cyrl": {
        "title": "Ходим чақириш прогнози", "rec": "Тавсия этилади",
        "max": "Максимум", "load": "Загрузка фоизи", "people": "нафар",
        "chart": "Охирги 3 та {wd} · одам сони", "forecast": "Прогноз",
        "fact": "Амалдаги", "sup": "Бригадир", "day": "Сана",
        "plan": "Трудоёмкост (режа)",
        "band": "Эҳтимолий оралиқ", "min": "дақ", "nodata": "Маълумот йўқ",
        "none": "Бу кун учун етарли тарих йўқ — прогноз ҳисобланмади.",
        "basis": "{have} та ҳафта {want} тадан · ўртача {mean} нафар",
        "conf": {"high": "Ишонч: юқори", "medium": "Ишонч: ўртача",
                 "low": "Ишонч: паст", "insufficient": "Ишонч: етарли эмас"},
        "wd": ["Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума",
               "Шанба", "Якшанба"],
    },
    "ru": {
        "title": "Прогноз по вызову сотрудников", "rec": "Рекомендуется",
        "max": "Максимум", "load": "Процент загрузки", "people": "чел.",
        "chart": "Последние 3 {wd} · количество людей", "forecast": "Прогноз",
        "fact": "Факт", "sup": "Бригадир", "day": "Дата",
        "plan": "Трудоёмкость (план)",
        "band": "Вероятный диапазон", "min": "мин", "nodata": "Нет данных",
        "none": "За этот день недостаточно истории — прогноз не рассчитан.",
        "basis": "{have} из {want} недель · среднее {mean} чел.",
        "conf": {"high": "Уверенность: высокая", "medium": "Уверенность: средняя",
                 "low": "Уверенность: низкая", "insufficient": "Уверенность: недостаточно данных"},
        "wd": ["понедельника", "вторника", "среды", "четверга", "пятницы",
               "субботы", "воскресенья"],
    },
    "en": {
        "title": "Staff call forecast", "rec": "Recommended",
        "max": "Maximum", "load": "Load percentage", "people": "workers",
        "chart": "Last 3 {wd}s · worker count", "forecast": "Forecast",
        "fact": "Actual", "sup": "Supervisor", "day": "Date",
        "plan": "Labour (plan)",
        "band": "Likely range", "min": "min", "nodata": "No data",
        "none": "Not enough history for this day — no forecast was computed.",
        "basis": "{have} of {want} weeks · mean {mean} workers",
        "conf": {"high": "Confidence: high", "medium": "Confidence: medium",
                 "low": "Confidence: low", "insufficient": "Confidence: insufficient"},
        "wd": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
               "Saturday", "Sunday"],
    },
}

# Weekday names are declined in the Russian chart title («Последние 3 среды»),
# so that language keeps a second, nominative list for anywhere the day is
# NAMED rather than counted — the card's own subtitle.
_RU_WD_NOM = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница",
              "Суббота", "Воскресенье"]


def _t(lang: str) -> dict:
    return L.get(lang, L["ru"])


def basis_line(data: dict, t: dict) -> str:
    """«N of M weeks · mean X workers» — the sentence under the chart, and under
    the rich table beside it.

    The mean is rounded to WHOLE PEOPLE using exactly the expression
    ``_call_rows`` uses to turn that same mean into the recommendation —
    ``int(round(...))`` — so this line can never name a different number from
    the «Tavsiya etiladi» figure above it. Matching the ROUNDING RULE and not
    merely the precision is the load-bearing part: on a .5 mean, Python rounds
    half to even, so any other spelling (floor(x+0.5), a format string) would
    print 59 under a KPI reading 58. A supervisor calls whole people; the raw
    58.7 was arithmetic they cannot act on and could not reconcile.
    """
    mean = data["mean"]
    return t["basis"].format(have=data["n"], want=data["weeks"],
                             mean=(int(round(mean)) if mean is not None else "—"))


def _mix(a: tuple, b: tuple, t: float) -> tuple:
    """Blend two RGB colours. The card is drawn on an RGB canvas (as the
    ojidaniya card is), so a translucent fill is mixed by hand rather than
    composited — one image, no alpha layer to keep in step."""
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _dashed(draw, x0, y0, x1, y1, fill, width=1, dash=6, gap=5):
    """A dashed straight line. Pillow has no dash support of its own."""
    dx, dy = x1 - x0, y1 - y0
    length = max(1.0, (dx * dx + dy * dy) ** 0.5)
    ux, uy = dx / length, dy / length
    pos = 0.0
    while pos < length:
        end = min(length, pos + dash)
        draw.line([x0 + ux * pos, y0 + uy * pos, x0 + ux * end, y0 + uy * end],
                  fill=fill, width=width)
        pos = end + gap


def _fmt_min(v: float) -> str:
    return f"{round(v):,}".replace(",", " ")


# ── Data ──────────────────────────────────────────────────────────────────────

def collect(row: dict, target: date, weeks: int) -> dict:
    """Fold ONE ``_call_rows`` row into the slots the chart draws.

    Every one of the ``weeks`` preceding same-weekday dates gets a slot, present
    in the row's samples or not — a week the source sheet has no plan for is a
    hole in the evidence, and closing it up would make a one-sample forecast
    look like a three-sample one.
    """
    by_date = {s["date"]: s for s in (row.get("samples") or [])}
    slots = []
    for k in range(weeks, 0, -1):
        d = target - timedelta(days=7 * k)
        s = by_date.get(d.isoformat())
        slots.append({
            "date": d,
            "workers": (s or {}).get("workers"),
            "plan_min": (s or {}).get("plan_min"),
        })
    # The forecast of the PLAN, in minutes: the mean of the same three weeks the
    # worker count is averaged over, taken over the weeks that HAVE a plan —
    # exactly the sample set behind the count.
    #
    # It is deliberately NOT ``forecast × capacity_min``. That back-derivation
    # would always divide back to the count on screen, but it is a number nobody
    # recorded — the count restated in minutes rather than the trudoyomkost the
    # sheet actually carried. **Consequence to know, and NOT a bug to fix:** the
    # count averages each week's ROUNDED worker figure, so on about a quarter of
    # the units this mean ÷ capacity lands one person away from the recommended
    # count (28 276 ÷ 432 = 65 beside a recommendation of 66). Making the two
    # agree means changing how the RECOMMENDATION is computed — which is the
    # number the automatic send DMs the plant — not how this one is displayed.
    plans = [s["plan_min"] for s in slots if s["plan_min"] is not None]
    return {
        "slots": slots,
        "plan_mean": (sum(plans) / len(plans)) if plans else None,
        "target": target,
        "forecast": row.get("forecast"),
        "band_lo": row.get("band_lo"),
        "band_hi": row.get("band_hi"),
        "confidence": row.get("confidence") or "insufficient",
        "n": row.get("n") or 0,
        "weeks": weeks,
        "mean": row.get("mean"),
        "name": row.get("name") or "",
    }


# ── Drawing ───────────────────────────────────────────────────────────────────

def _kpi_trio(draw, y, data: dict, eff: int, t: dict) -> None:
    tile_w = (W - PAD * 2 - 2 * 16) // 3
    fc, hi = data["forecast"], data["band_hi"]
    tiles = [
        (t["rec"], f"{fc} {t['people']}" if fc is not None else "—", BRAND),
        (t["max"], f"{hi} {t['people']}" if hi is not None else "—", AMBER),
        (t["load"], f"{eff}%", TEXT_1),
    ]
    for i, (label, value, color) in enumerate(tiles):
        tx = PAD + i * (tile_w + 16)
        _panel(draw, tx, y, tile_w, 100)
        draw.text((tx + 18, y + 18), label.upper(), font=_font(12, bold=True),
                  fill=TEXT_3)
        f_val = _font(30, bold=True)
        draw.text((tx + 18, y + 44),
                  _ellipsize(draw, value, f_val, tile_w - 36), font=f_val,
                  fill=color)


def _chart(draw, x, y, w, h, data: dict, t: dict) -> None:
    """The forecast's own evidence: one point per preceding same weekday, the
    band behind them and the forecast projected as the next point."""
    slots, fc = data["slots"], data["forecast"]
    lo, hi = data["band_lo"], data["band_hi"]

    vals = [s["workers"] for s in slots if s["workers"] is not None]
    domain = list(vals) + [v for v in (fc, lo, hi) if v is not None]
    v_min, v_max = min(domain), max(domain)
    # Asymmetric on purpose: each marker carries a two-line label ABOVE it, so
    # the ceiling needs the headroom and the floor does not. Without it the top
    # point's label is pushed below the marker and lands on the line itself.
    span = max(1.0, float(v_max - v_min))
    y_lo, y_hi = max(0.0, v_min - span * 0.25), v_max + span * 0.55
    if y_hi - y_lo < 2:                       # every week identical → flat line
        y_hi = y_lo + 2

    axis_w = 46                               # room for the y-axis numbers
    px0, px1 = x + axis_w, x + w
    py0, py1 = y, y + h
    n = len(slots) + 1                        # + the forecast column
    step = (px1 - px0) / n
    cx = [px0 + step * (i + 0.5) for i in range(n)]

    def py(v: float) -> float:
        return py1 - (v - y_lo) / (y_hi - y_lo) * (py1 - py0)

    # ── gridlines + y labels
    f_ax = _font(13)
    ticks = 4
    seen: set[str] = set()
    for i in range(ticks + 1):
        v = y_lo + (y_hi - y_lo) * i / ticks
        gy = py(v)
        _dashed(draw, px0, gy, px1, gy, _mix(BG, BORDER, 0.9))
        lbl = str(int(round(v)))
        # A narrow domain (a unit that ran empty every week) rounds several
        # ticks onto one number; printing it twice reads as a broken axis.
        if lbl in seen:
            continue
        seen.add(lbl)
        draw.text((px0 - 10 - _text_w(draw, lbl, f_ax), gy - 8), lbl,
                  font=f_ax, fill=TEXT_3)

    # ── the mean ± σ band, drawn first so everything else sits on top
    if lo is not None and hi is not None and hi > lo:
        draw.rectangle([px0, py(hi), px1, py(lo)], fill=_mix(BG, BAND, 0.16))

    # ── the history line. A segment BRIDGING a week the sheet has no plan for
    #    is dashed: a solid stroke across the gap would draw a value through a
    #    slot the card has just labelled «no data», which is the one reading
    #    the gap exists to prevent.
    pts = [(i, cx[i], py(s["workers"])) for i, s in enumerate(slots)
           if s["workers"] is not None]
    for (ai, ax_, ay), (bi, bx, by) in zip(pts, pts[1:]):
        if bi - ai == 1:
            draw.line([ax_, ay, bx, by], fill=HIST, width=3)
        else:
            _dashed(draw, ax_, ay, bx, by, _mix(BG, HIST, 0.7), width=3,
                    dash=8, gap=6)

    # ── the forecast: a dashed hop from the last known week, then the point
    fx = cx[-1]
    if fc is not None:
        if pts:
            _dashed(draw, pts[-1][1], pts[-1][2], fx, py(fc), BRAND, width=3,
                    dash=8, gap=6)
        _dashed(draw, px0, py(fc), px1, py(fc), _mix(BG, BRAND, 0.55),
                dash=3, gap=7)

    f_val, f_sub = _font(17, bold=True), _font(12)

    def _dot(dx, dy, color, r=6, hollow=False):
        draw.ellipse([dx - r, dy - r, dx + r, dy + r],
                     fill=(BG if hollow else color), outline=color, width=3)

    def _label(dx, dy, head, sub, color, above=True):
        # The block is two lines tall and the LINE passes through the marker,
        # so it is lifted clear of the dot rather than hung off it — a sub-label
        # 10px above a marker lands squarely on the stroke leaving it.
        hy = dy - 48 if above else dy + 16
        draw.text((dx - _text_w(draw, head, f_val) / 2, hy), head,
                  font=f_val, fill=color)
        if sub:
            draw.text((dx - _text_w(draw, sub, f_sub) / 2, hy + 21), sub,
                      font=f_sub, fill=TEXT_3)

    for i, s in enumerate(slots):
        if s["workers"] is None:
            continue
        dy = py(s["workers"])
        _dot(cx[i], dy, HIST)
        mins = (f"{_fmt_min(s['plan_min'])} {t['min']}"
                if s["plan_min"] is not None else "")
        # keep the label inside the plot when the point sits near the ceiling
        _label(cx[i], dy, str(s["workers"]), mins, TEXT_1, above=dy - 52 > py0)

    if fc is not None:
        dy = py(fc)
        _dot(fx, dy, BRAND, r=7, hollow=True)
        _label(fx, dy, str(fc), t["forecast"], BRAND, above=dy - 52 > py0)

    # ── x labels: every slot's date, present or not
    f_x = _font(13)
    for i, s in enumerate(slots):
        lbl = s["date"].strftime("%d.%m")
        color = TEXT_2 if s["workers"] is not None else TEXT_3
        draw.text((cx[i] - _text_w(draw, lbl, f_x) / 2, py1 + 12), lbl,
                  font=f_x, fill=color)
        if s["workers"] is None:
            nd = t["nodata"]
            f_nd = _font(11)
            draw.text((cx[i] - _text_w(draw, nd, f_nd) / 2, py1 + 30), nd,
                      font=f_nd, fill=TEXT_3)
    tl = data["target"].strftime("%d.%m")
    f_xb = _font(13, bold=True)
    draw.text((fx - _text_w(draw, tl, f_xb) / 2, py1 + 12), tl,
              font=f_xb, fill=BRAND)

    draw.line([px0, py1, px1, py1], fill=BORDER)


def render(data: dict, lang: str, eff: int, scope: str = "") -> bytes:
    t = _t(lang)
    wd = data["target"].weekday()
    empty = data["forecast"] is None

    # plot + its top padding + the x-label rows underneath, so the card grows
    # with the drawing rather than carrying a constant of dead space
    plot_h = 214
    panel_h = 18 + plot_h + 56
    body_top = 150 + 100 + 32
    h = body_top + 34 + (60 if empty else panel_h + 76) + PAD

    img = Image.new("RGB", (W, h), BG)
    draw = ImageDraw.Draw(img)

    # ── header
    draw.text((PAD, PAD), t["title"], font=_font(32, bold=True), fill=TEXT_1)
    wd_name = _RU_WD_NOM[wd] if lang == "ru" else t["wd"][wd]
    sub = f"{data['name']} · {wd_name}, {data['target']:%d.%m.%Y}"
    if scope:
        sub += f" · {scope}"
    draw.text((PAD, PAD + 44), _ellipsize(draw, sub, _font(17), W - PAD * 2),
              font=_font(17), fill=TEXT_3)
    draw.line([PAD, PAD + 86, W - PAD, PAD + 86], fill=BORDER)

    _kpi_trio(draw, 150, data, eff, t)

    y = body_top
    draw.text((PAD, y), t["chart"].format(wd=t["wd"][wd]).upper(),
              font=_font(13, bold=True), fill=TEXT_2)
    y += 34

    if empty:
        draw.text((PAD, y + 14), t["none"], font=_font(17), fill=TEXT_2)
        return _png(img)

    _panel(draw, PAD, y, W - PAD * 2, panel_h, fill=CARD)
    _chart(draw, PAD + 16, y + 18, W - PAD * 2 - 32, plot_h, data, t)
    y += panel_h + 20

    # ── footer: what the number was averaged over, and how much to trust it
    draw.text((PAD, y), basis_line(data, t), font=_font(14), fill=TEXT_2)
    conf = t["conf"].get(data["confidence"], data["confidence"])
    c_col = {"high": GREEN, "medium": AMBER}.get(data["confidence"], RED)
    f_c = _font(14, bold=True)
    draw.text((W - PAD - _text_w(draw, conf, f_c), y), conf, font=f_c, fill=c_col)

    # Every mark on the chart is named. The band especially: an unexplained
    # grey block behind the line is a statement the reader cannot act on, and
    # it is the one element carrying how WIDE the forecast's own spread is.
    y += 26
    f_l = _font(12)
    lo, hi = data["band_lo"], data["band_hi"]
    band_txt = t["band"] + (f" {lo}–{hi}" if lo is not None and hi is not None else "")
    lx = PAD
    for kind, color, label in (("line", HIST, t["fact"]),
                               ("ring", BRAND, t["forecast"]),
                               ("box", _mix(BG, BAND, 0.45), band_txt)):
        if kind == "line":
            draw.line([lx, y + 7, lx + 16, y + 7], fill=color, width=3)
        elif kind == "ring":
            draw.ellipse([lx + 2, y + 1, lx + 14, y + 13], fill=BG,
                         outline=color, width=3)
        else:
            draw.rectangle([lx, y + 2, lx + 16, y + 12], fill=color)
        lx += 22
        draw.text((lx, y), label, font=f_l, fill=TEXT_3)
        lx += _text_w(draw, label, f_l) + 22
    return _png(img)


def _png(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_forecast_card(row: dict, target: date, lang: str = "ru",
                         eff: int = 100, weeks: int = 3,
                         scope: str = "") -> bytes:
    """THE entry point: one ``_call_rows`` row → the card. Nothing is computed
    here, so the picture can never state a count the DM beside it does not."""
    return render(collect(row, target, weeks), lang, eff, scope)
