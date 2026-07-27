"""Weekly Ojidaniya svodka as a Telegram Rich Message (sendRichMessage).

Renders the report body in the Rich HTML dialect from DowntimeData — the same
numbers /api/downtime serves (stopped half, 50-min flag, kpi_only category
scope) — so the post always matches the Ojidaniya page.

    python ojidaniya_rich_post.py                        # last 7 reporting days → stdout
    python ojidaniya_rich_post.py --date-to 26.05.2026 --out post.html
    python ojidaniya_rich_post.py --image shot.png --send 123456789

--send posts straight to a chat (the embedded image rides as attach://); without
it the script only renders, and the HTML can be pasted into the Broadcast tab's
Rich mode (its sanitizer whitelists this exact dialect).
"""
import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from html import escape

from app.database import SessionLocal
from app.models import Manager, DowntimeData
from app.services.name_map import sheet_alias_map

try:
    from app.services.sheets_reader import OJIDANIYA_ONLY_CATS
except Exception:  # gspread not installed in this environment
    OJIDANIYA_ONLY_CATS = {"Cat H", "Cat I", "Cat D4"}

TZ = timezone(timedelta(hours=5))
WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"]
CAT_LABELS = {
    "Cat A": "Xoladilnikdan mahsulot kutish",
    "Cat B": "Oborudivaniya buzilishi",
    "Cat C": "List/vaganetka kutish",
    "Cat D": "Skladdan mahsulot yoki hom ashyo kutish",
    "Cat D2": "Skladdan qo'shimcha zayavka orqali hom ashyo kutish",
    "Cat D3": "Otdellardan mahsulot kutish",
    "Cat E": "Ichki logistikadan mahsulot yoki hom ashyo kutish",
    "Cat F": "Texnologlar qarorini kutish",
    "Cat G": "Plan bo'limi",
    "Cat H": "Tozalash",
    "Cat I": "Oldingi smena ishi tugashini kutish",
}
CAT_SHORT = {
    "Cat A": "Xoladilnik", "Cat B": "Oborudivaniya", "Cat C": "List/vaganetka",
    "Cat D": "Sklad", "Cat D2": "Sklad (zayavka)", "Cat D3": "Otdellar",
    "Cat E": "Ichki logistika", "Cat F": "Texnologlar", "Cat G": "Plan bo'limi",
    "Cat H": "Tozalash", "Cat I": "Oldingi smena",
}

dmy = lambda s: datetime.strptime(s, "%d.%m.%Y").date()
fmt_n = lambda v: f"{round(v):,}".replace(",", " ")
pct = lambda v, total: f"{round(v / total * 100)}%" if total else "0%"


def hours(mins: float) -> str:
    h, m = divmod(round(mins), 60)
    return f"{h} soat {m} daq" if h else f"{m} daq"


def collect(db, date_to: str | None, days: int, kpi_only: bool) -> dict:
    managers = db.query(Manager).filter(Manager.archived.is_(False)).all()
    alias = sheet_alias_map(db, (m.name for m in managers))
    shift_of = {m.name: m.shift for m in managers}
    rows = db.query(DowntimeData).filter(DowntimeData.manager_name.in_(set(alias))).all()
    dates = sorted({r.date for r in rows}, key=dmy)
    if not dates:
        sys.exit("no downtime data")
    end = dmy(date_to) if date_to else dmy(dates[-1])
    window = [d for d in dates if 0 <= (end - dmy(d)).days < days]
    if not window:
        sys.exit(f"no reports in the {days} days ending {end:%d.%m.%Y}")

    per: dict[str, dict] = {}
    cats: dict[str, float] = {}
    day_tot = {d: 0.0 for d in window}
    total_ns = 0.0
    reports = 0
    for r in rows:
        if r.date not in window:
            continue
        reports += 1
        by_cat = {c: float(v or 0) for c, v in (r.by_category or {}).items()
                  if not (kpi_only and c in OJIDANIYA_ONLY_CATS)}
        t = float(r.total_minutes or 0)
        if kpi_only:
            t = max(t - sum(float((r.by_category or {}).get(c) or 0) for c in OJIDANIYA_ONLY_CATS), 0.0)
        name = alias.get(r.manager_name, r.manager_name)
        p = per.setdefault(name, {"shift": shift_of.get(name), "total": 0.0, "flagged": 0, "by_cat": {}})
        p["total"] += t
        if t > 50:
            p["flagged"] += 1
        day_tot[r.date] += t
        total_ns += float(r.total_minutes_ns or 0)
        for c, v in by_cat.items():
            p["by_cat"][c] = p["by_cat"].get(c, 0) + v
            cats[c] = cats.get(c, 0) + v
    for p in per.values():
        bc = {c: v for c, v in p["by_cat"].items() if v > 0}
        p["worst"] = max(bc, key=bc.get) if bc else None
    return {
        "window": window, "reports": reports, "per": per, "day_tot": day_tot,
        "cats": dict(sorted(((c, v) for c, v in cats.items() if v > 0), key=lambda x: -x[1])),
        "total": sum(p["total"] for p in per.values()), "total_ns": total_ns,
        "flagged": sum(p["flagged"] for p in per.values()),
        "shift_tot": {s: sum(p["total"] for p in per.values() if p["shift"] == s) for s in (1, 2)},
    }


def brig_rows(items: list[tuple[str, dict]]) -> str:
    out = []
    for name, p in items:
        val = fmt_n(p["total"])
        cause = f'{CAT_SHORT[p["worst"]]} <code>{p["worst"].removeprefix("Cat ")}</code>' if p["worst"] else "—"
        out.append(
            f'<tr><td>{escape(name)}</td><td align="center">S{p["shift"] or "?"}</td>'
            f'<td align="right">{f"<mark>{val}</mark>" if p["flagged"] else val}</td>'
            f'<td align="center">{p["flagged"]}</td><td>{cause}</td></tr>')
    return "\n".join(out)


def render(d: dict, with_image: bool) -> str:
    total, window = d["total"], d["window"]
    first, last = dmy(window[0]), dmy(window[-1])
    unix = lambda dt: int(datetime(dt.year, dt.month, dt.day, 12, tzinfo=TZ).timestamp())
    ranked = sorted(d["per"].items(), key=lambda kv: -kv[1]["total"])
    top, rest = ranked[:6], ranked[6:]
    top_sum = sum(p["total"] for _, p in top)
    worst_day = max(d["day_tot"], key=d["day_tot"].get)
    top_cat = next(iter(d["cats"]), None)

    day_rows = "\n".join(
        f'<tr><td>{dt[:5]}</td><td>{WEEKDAYS[dmy(dt).weekday()]}</td>'
        f'<td align="right">{f"<mark>{fmt_n(v)}</mark>" if dt == worst_day else fmt_n(v)}</td>'
        f'<td align="right">{pct(v, total)}</td></tr>'
        for dt, v in d["day_tot"].items())
    cat_rows = "\n".join(
        f'<tr><td><code>{c}</code></td><td>{CAT_LABELS.get(c, c)}</td>'
        f'<td align="right">{f"<mark>{fmt_n(v)}</mark>" if c == top_cat else fmt_n(v)}</td>'
        f'<td align="right">{pct(v, total)}</td></tr>'
        for c, v in d["cats"].items())
    top3 = lambda c: ", ".join(n for n, _ in sorted(
        d["per"].items(), key=lambda kv: -kv[1]["by_cat"].get(c, 0))[:3] if _["by_cat"].get(c, 0) > 0)
    actions = "\n".join(
        f'<li><input type="checkbox"/>{CAT_SHORT[c]} (<code>{c.removeprefix("Cat ")}</code>) '
        f"bo'yicha chora — {escape(top3(c))} yacheykalari</li>"
        for c in list(d["cats"])[:2])
    ns_row = (f'<tr><td>«To\'xtamaganda» jami</td><td align="right">{fmt_n(d["total_ns"])} daq</td></tr>'
              if d["total_ns"] > 0 else "")
    figure = ('<figure><img src="tg://photo?id=scr1"/><figcaption>Ojidaniya sahifasi'
              "dagi tab'lar<cite>Safia Dashboard</cite></figcaption></figure>\n" if with_image else "")
    insight = (f'<blockquote>Eng katta yo\'qotish sababi — «{CAT_LABELS.get(top_cat, top_cat)}» '
               f'(<code>{top_cat}</code>): {fmt_n(d["cats"][top_cat])} daqiqa, jami ojidaniyaning '
               f'{pct(d["cats"][top_cat], total)}i. Eng og\'ir kun — {worst_day[:5]}, '
               f'{WEEKDAYS[dmy(worst_day).weekday()].lower()}: {fmt_n(d["day_tot"][worst_day])} daqiqa.'
               f'<cite>Ojidaniya sahifasi, {first:%d.%m}–{last:%d.%m.%Y}</cite></blockquote>' if top_cat else "")

    return f"""<h1>Ojidaniya — haftalik svodka</h1>
<p><b>Davr:</b> <tg-time unix="{unix(first)}" format="D">{first:%d.%m.%Y}</tg-time> — <tg-time unix="{unix(last)}" format="D">{last:%d.%m.%Y}</tg-time> · {len(window)} kun · {len(d["per"])} brigadir · {d["reports"]} hisobot</p>
<p><a href="#kunlar">Kunlar</a> · <a href="#kategoriyalar">Kategoriyalar</a> · <a href="#brigadirlar">Brigadirlar</a> · <a href="#metodika">Metodika</a></p>

<table bordered>
<caption>Haftaning asosiy ko'rsatkichlari</caption>
<tr><th align="left">Ko'rsatkich</th><th align="right">Qiymat</th></tr>
<tr><td>Jami ojidaniya</td><td align="right"><b>{fmt_n(total)} daq</b> <i>({hours(total)})</i></td></tr>
<tr><td>Kunlik o'rtacha</td><td align="right">{fmt_n(total / len(window))} daq</td></tr>
<tr><td>Bir hisobotga o'rtacha</td><td align="right">{fmt_n(total / d["reports"])} daq</td></tr>
<tr><td><a href="#th50">50 daq chegarasidan</a> oshgan hisobotlar</td><td align="right"><mark>{d["flagged"]} ta</mark></td></tr>
<tr><td>1-smena</td><td align="right">{fmt_n(d["shift_tot"][1])} daq <i>({pct(d["shift_tot"][1], total)})</i></td></tr>
<tr><td>2-smena</td><td align="right">{fmt_n(d["shift_tot"][2])} daq <i>({pct(d["shift_tot"][2], total)})</i></td></tr>
{ns_row}</table>

{figure}<a name="kunlar"></a>
<h3>Kunlar kesimi</h3>
<table bordered striped>
<tr><th align="left">Sana</th><th align="left">Kun</th><th align="right">Daq</th><th align="right">Ulush</th></tr>
{day_rows}
</table>

<a name="kategoriyalar"></a>
<h3>Kategoriyalar kesimi</h3>
<table bordered striped>
<tr><th align="left">Kod</th><th align="left">Ma'nosi</th><th align="right">Daq</th><th align="right">Ulush</th></tr>
{cat_rows}
</table>

{insight}

<a name="brigadirlar"></a>
<h3>Brigadirlar kesimi — Top {len(top)}</h3>
<p>Eng yuqori {len(top)} brigadirga haftalik ojidaniyaning <b>{pct(top_sum, total)}</b>i to'g'ri keladi ({fmt_n(top_sum)} daq).</p>
<table bordered striped>
<tr><th align="left">Brigadir</th><th align="center">Smena</th><th align="right">Daq</th><th align="center">50+ kun</th><th align="left">Asosiy sabab</th></tr>
{brig_rows(top)}
</table>

<details><summary>Qolgan {len(rest)} brigadir</summary>
<table bordered striped>
<tr><th align="left">Brigadir</th><th align="center">Smena</th><th align="right">Daq</th><th align="center">50+ kun</th><th align="left">Asosiy sabab</th></tr>
{brig_rows(rest)}
</table>
</details>

<h3>Keyingi hafta uchun</h3>
<ul>
{actions}
<li><input type="checkbox"/>50+ kunlari 2 va undan ko'p bo'lgan brigadirlar bilan sabablarni ko'rib chiqish</li>
<li><input type="checkbox" checked/>Haftalik svodka e'lon qilindi</li>
</ul>

<a name="metodika"></a>
<details><summary>Metodika va izohlar</summary>
<ul>
<li>Raqamlar smena hisobotining «yacheyka to'xtaganda» yarmidan olindi.</li>
<li><tg-reference name="th50">Bir kunlik jami ojidaniya 50 daqiqadan oshsa, hisobot belgilangan («50+») hisoblanadi.</tg-reference></li>
<li>Kategoriyalar — zagruzka KPI tarkibiga kiradiganlari (Ojidaniya sahifasidagi «Zagruzkada hisoblanadi» rejimi).</li>
<li>Batafsil grafiklar — Ojidaniya sahifasida; bugungi raqamlar uchun botga /ojidaniya yuboring.</li>
</ul>
</details>

<hr/>
<footer>Manba: Safia Dashboard — Ojidaniya sahifasi</footer>
"""


def send(html: str, chat_id: int, image: str | None):
    import requests
    from app.config import settings
    rich: dict = {"html": html, "is_rtl": False}
    files = None
    if image:
        rich["media"] = [{"id": "scr1", "media": {"type": "photo", "media": "attach://f0"}}]
        files = {"f0": open(image, "rb")}
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendRichMessage",
        data={"chat_id": chat_id, "rich_message": json.dumps(rich)}, files=files, timeout=180)
    j = r.json()
    if not j.get("ok"):
        sys.exit(f"sendRichMessage failed: {j.get('description')}")
    print(f"sent to {chat_id}, message_id={j['result'].get('message_id')}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date-to", help="window end, DD.MM.YYYY (default: last reporting date)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--all-cats", action="store_true",
                    help="include Ojidaniya-only categories (Cat H/I) instead of the zagruzka KPI set")
    ap.add_argument("--image", help="screenshot to embed as tg://photo?id=scr1")
    ap.add_argument("--send", type=int, metavar="CHAT_ID", help="send via sendRichMessage instead of printing")
    ap.add_argument("--out", help="write HTML to file instead of stdout")
    a = ap.parse_args()

    db = SessionLocal()
    try:
        html = render(collect(db, a.date_to, a.days, not a.all_cats),
                      with_image=bool(a.image) or not a.send)
    finally:
        db.close()
    if a.out:
        open(a.out, "w", encoding="utf-8").write(html)
        print(f"wrote {a.out} ({len(html)} chars)")
    elif not a.send:
        print(html)
    if a.send:
        send(html, a.send, a.image)
