"""Draws the Ojidaniya day as a PNG, for the bot's /ojidaniya command.

This is a *rendering of the data*, not a screenshot of the page — the browser
route was removed (it needed a headless Chromium the hosting couldn't run
reliably). It reads the same `/api/downtime` payload the page reads, so the
numbers are always the page's numbers, and lays them out in the app's own visual
language: dark card, brand gold, traffic-light status colours.

Because it re-implements the page's *look* rather than capturing it, it will
drift if Downtime.jsx changes shape. Keep the KPI trio here in step with the
three KPICards on the page.
"""
import glob
import logging
import os
from datetime import date
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# ── Palette — the app's dark theme (frontend/src/index.css) ───────────────────
BG        = (15, 17, 23)     # --bg-base
CARD      = (26, 29, 39)     # --bg-card
INNER     = (18, 21, 31)     # --bg-inner
BORDER    = (38, 42, 56)
TEXT_1    = (243, 244, 246)
TEXT_2    = (156, 163, 175)
TEXT_3    = (107, 114, 128)
BRAND     = (200, 151, 63)   # --brand
RED       = (239, 68, 68)
GREEN     = (34, 197, 94)
AMBER     = (234, 179, 8)
# Categorical bars follow utils/chartPalette.js order: red → green → blue → …
CATEGORY_COLORS = [
    (239, 68, 68), (34, 197, 94), (59, 130, 246), (234, 179, 8),
    (249, 115, 22), (168, 85, 247), (20, 184, 166), (236, 72, 153),
]
FOLD = (100, 116, 139)  # slate «Остальные»

W = 1000
PAD = 32

L = {
    "uz":      {"title": "Ojidaniya", "total": "Jami kutish", "flagged": "Belgilangan kunlar",
                "worst": "Eng ko'p sabab", "cats": "Sabablar bo'yicha", "brigs": "Brigadirlar bo'yicha",
                "min": "min", "none": "Bu kun uchun ma'lumot yo'q", "others": "Boshqalar"},
    "uz_cyrl": {"title": "Ожидания", "total": "Жами кутиш", "flagged": "Белгиланган кунлар",
                "worst": "Энг кўп сабаб", "cats": "Сабаблар бўйича", "brigs": "Бригадирлар бўйича",
                "min": "мин", "none": "Бу кун учун маълумот йўқ", "others": "Бошқалар"},
    "ru":      {"title": "Ожидания", "total": "Всего ожиданий", "flagged": "Отмеченные дни",
                "worst": "Главная причина", "cats": "По причинам", "brigs": "По бригадирам",
                "min": "мин", "none": "Нет данных за этот день", "others": "Остальные"},
    "en":      {"title": "Ojidaniya", "total": "Total wait", "flagged": "Flagged days",
                "worst": "Worst category", "cats": "By category", "brigs": "By brigadir",
                "min": "min", "none": "No data for this day", "others": "Others"},
}


class CardError(RuntimeError):
    """Rendering failed for a reason worth telling an admin about."""


# ── Fonts ─────────────────────────────────────────────────────────────────────
# Pillow bundles no scalable font, and its bitmap default can't draw Cyrillic —
# which every label here needs. Find a real TTF on the box.
_FONT_DIRS = [
    "/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts"),
    os.path.expanduser("~/.local/share/fonts"),
]
_FONT_PREFS = ["DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "LiberationSans-Bold.ttf",
               "LiberationSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSans-Regular.ttf"]
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _find_font(bold: bool) -> str:
    wanted = [f for f in _FONT_PREFS if ("Bold" in f) == bold] + _FONT_PREFS
    for name in wanted:
        for root in _FONT_DIRS:
            hits = glob.glob(os.path.join(root, "**", name), recursive=True)
            if hits:
                return hits[0]
    raise CardError(
        "No usable TTF font found. Install one with: dnf install dejavu-sans-fonts "
        "(or drop a DejaVuSans.ttf into ~/.fonts/)"
    )


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = ("b" if bold else "r", size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(_find_font(bold), size)
    return _font_cache[key]


def _text_w(draw: ImageDraw.ImageDraw, s: str, font) -> int:
    return int(draw.textlength(s, font=font))


def _ellipsize(draw, s: str, font, max_w: int) -> str:
    if _text_w(draw, s, font) <= max_w:
        return s
    while s and _text_w(draw, s + "…", font) > max_w:
        s = s[:-1]
    return s + "…"


def _fmt(minutes: float) -> str:
    """Minutes as the page shows them — whole numbers, thin-spaced thousands."""
    return f"{round(minutes):,}".replace(",", " ")


# ── Data ──────────────────────────────────────────────────────────────────────

def collect(db, payload: dict, day: date, shift: int | None = None) -> dict:
    """The day's Ojidaniya numbers, straight from the endpoint the page uses —
    so the card can never disagree with the page."""
    from app.routers.downtime import get_downtime

    data = get_downtime(date_from=day, date_to=day, shift=shift, manager_id=[],
                        kpi_only=False, db=db, _=payload)

    rows = data.get("rows", [])
    by_cat: dict[str, float] = {}
    for r in rows:
        for cat, val in (r.get("by_category") or {}).items():
            by_cat[cat] = by_cat.get(cat, 0.0) + float(val or 0)

    return {
        "total":    sum(float(r.get("total") or 0) for r in rows),
        "flagged":  sum(1 for r in rows if r.get("flagged")),
        "cats":     sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True),
        "brigs":    [(s["manager_name"], float(s["total"] or 0))
                     for s in data.get("summary", []) if float(s["total"] or 0) > 0],
        "reported": len(rows),
    }


# ── Drawing ───────────────────────────────────────────────────────────────────

def _panel(draw, x, y, w, h, radius=14, fill=CARD):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=BORDER)


def _bar_list(draw, x, y, w, items, total, t, max_rows=8):
    """Ranked horizontal bars — the shape the page's breakdown chart uses.
    Everything past max_rows folds into a slate «Others» row, matching the
    stacked-area convention used elsewhere in the app."""
    f_lbl, f_val = _font(16), _font(16, bold=True)
    shown = list(items[:max_rows])
    rest = sum(v for _, v in items[max_rows:])
    if rest > 0:
        shown.append((t["others"], rest))

    row_h, gap = 30, 10
    label_w = 300
    for i, (name, val) in enumerate(shown):
        ry = y + i * (row_h + gap)
        color = FOLD if name == t["others"] else CATEGORY_COLORS[i % len(CATEGORY_COLORS)]
        draw.text((x, ry + 5), _ellipsize(draw, str(name), f_lbl, label_w),
                  font=f_lbl, fill=TEXT_1)

        track_x = x + label_w + 16
        track_w = w - label_w - 16 - 110
        draw.rounded_rectangle([track_x, ry + 6, track_x + track_w, ry + 24],
                               radius=6, fill=INNER)
        if total > 0 and val > 0:
            fill_w = max(6, int(track_w * (val / total)))
            draw.rounded_rectangle([track_x, ry + 6, track_x + fill_w, ry + 24],
                                   radius=6, fill=color)

        vs = f"{_fmt(val)} {t['min']}"
        draw.text((x + w - _text_w(draw, vs, f_val), ry + 5), vs, font=f_val, fill=TEXT_2)

    return len(shown) * (row_h + gap)


def render(data: dict, day: date, lang: str = "ru", scope: str = "") -> bytes:
    t = L.get(lang, L["ru"])

    # Height depends on how many bars each section draws.
    n_cats = min(len(data["cats"]), 8) + (1 if len(data["cats"]) > 8 else 0)
    n_brigs = min(len(data["brigs"]), 8) + (1 if len(data["brigs"]) > 8 else 0)
    empty = data["reported"] == 0

    # Must track the drawing below exactly: header 150 + KPI 100 + 20 gap, then
    # per section a 30px title, 40px per bar (30 row + 10 gap) and a 30px gap.
    # The last bar carries a trailing gap, hence the -10.
    body_top = 150 + 120 + 20
    if empty:
        h = body_top + 70
    else:
        h = body_top + sum(30 + n * 40 + 30 for n in (n_cats, n_brigs)) - 10 + PAD

    img = Image.new("RGB", (W, h), BG)
    draw = ImageDraw.Draw(img)

    # ── Header
    draw.text((PAD, PAD), t["title"], font=_font(34, bold=True), fill=TEXT_1)
    sub = day.strftime("%d.%m.%Y") + (f" · {scope}" if scope else "")
    draw.text((PAD, PAD + 46), sub, font=_font(17), fill=TEXT_3)
    draw.line([PAD, PAD + 86, W - PAD, PAD + 86], fill=BORDER)

    # ── KPI trio — mirrors the three KPICards on the page
    y = 150
    tile_w = (W - PAD * 2 - 2 * 16) // 3
    worst = data["cats"][0][0] if data["cats"] else "—"
    tiles = [
        (t["total"], f"{_fmt(data['total'])} {t['min']}", BRAND),
        (t["flagged"], str(data["flagged"]), RED if data["flagged"] else GREEN),
        (t["worst"], worst, TEXT_1),
    ]
    for i, (label, value, color) in enumerate(tiles):
        tx = PAD + i * (tile_w + 16)
        _panel(draw, tx, y, tile_w, 100)
        draw.text((tx + 18, y + 18), label.upper(), font=_font(12, bold=True), fill=TEXT_3)
        f_val = _font(30, bold=True)
        draw.text((tx + 18, y + 44),
                  _ellipsize(draw, value, f_val, tile_w - 36), font=f_val, fill=color)

    y = body_top

    if empty:
        draw.text((PAD, y + 20), t["none"], font=_font(18), fill=TEXT_2)
    else:
        for title, items in ((t["cats"], data["cats"]), (t["brigs"], data["brigs"])):
            draw.text((PAD, y), title.upper(), font=_font(13, bold=True), fill=TEXT_2)
            y += 30
            y += _bar_list(draw, PAD, y, W - PAD * 2, items, data["total"], t)
            y += 30

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_downtime_card(db, payload: dict, day: date, lang: str = "ru",
                         shift: int | None = None, scope: str = "") -> bytes:
    return render(collect(db, payload, day, shift), day, lang, scope)
