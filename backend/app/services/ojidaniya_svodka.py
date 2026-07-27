"""The weekly Ojidaniya svodka as a Rich HTML body (sendRichMessage).

Reads the same `/api/downtime` response the page reads — same access check,
same caller scoping, same 50-min flag — and lays the week out as rich-message
tables: KPI block, day/category splits, ranked brigadirs, an action checklist
and a methodology footnote. The bot's /ojidaniya embeds the day card PNG as
the figure (tg://photo?id=scr1); the standalone CLI can render without it.

The dialect used here is the subset broadcast.py's sanitizer whitelists, so
the same body can be pasted into the Broadcast tab's Rich mode unchanged.
"""
from datetime import date, datetime, timedelta, timezone
from html import escape

TZ = timezone(timedelta(hours=5))

CAT_LABELS = {
    "uz": {
        "Cat A": "Xoladilnikdan mahsulot kutish", "Cat B": "Oborudivaniya buzilishi",
        "Cat C": "List/vaganetka kutish", "Cat D": "Skladdan mahsulot yoki hom ashyo kutish",
        "Cat D2": "Skladdan qo'shimcha zayavka orqali hom ashyo kutish",
        "Cat D3": "Otdellardan mahsulot kutish",
        "Cat E": "Ichki logistikadan mahsulot yoki hom ashyo kutish",
        "Cat F": "Texnologlar qarorini kutish", "Cat G": "Plan bo'limi",
        "Cat H": "Tozalash", "Cat I": "Oldingi smena ishi tugashini kutish",
    },
    "uz_cyrl": {
        "Cat A": "Холодильникдан маҳсулот кутиш", "Cat B": "Ускуна бузилиши",
        "Cat C": "Лист/вагонетка кутиш", "Cat D": "Складдан маҳсулот ёки хом ашё кутиш",
        "Cat D2": "Складдан қўшимча заявка орқали хом ашё кутиш",
        "Cat D3": "Бўлимлардан маҳсулот кутиш",
        "Cat E": "Ички логистикадан маҳсулот ёки хом ашё кутиш",
        "Cat F": "Технологлар қарорини кутиш", "Cat G": "Режа бўлими",
        "Cat H": "Тозалаш", "Cat I": "Олдинги смена иши тугашини кутиш",
    },
    "ru": {
        "Cat A": "Ожидание продукции из холодильника", "Cat B": "Поломка оборудования",
        "Cat C": "Ожидание листов/вагонеток", "Cat D": "Ожидание продукции или сырья со склада",
        "Cat D2": "Ожидание сырья по дополнительной заявке со склада",
        "Cat D3": "Ожидание продукции из других отделов",
        "Cat E": "Ожидание продукции или сырья от внутренней логистики",
        "Cat F": "Ожидание решения технолога", "Cat G": "Плановый отдел",
        "Cat H": "Уборка", "Cat I": "Ожидание окончания работы предыдущей смены",
    },
    "en": {
        "Cat A": "Waiting for product from the cooler", "Cat B": "Equipment breakdown",
        "Cat C": "Waiting for trays/trolleys", "Cat D": "Waiting for goods or raw material from the warehouse",
        "Cat D2": "Waiting for raw material via an extra warehouse request",
        "Cat D3": "Waiting for product from other departments",
        "Cat E": "Waiting for goods or raw material from internal logistics",
        "Cat F": "Waiting for the technologist's decision", "Cat G": "Planning department",
        "Cat H": "Cleaning", "Cat I": "Waiting for the previous shift to finish",
    },
}

WEEKDAYS = {
    "uz":      ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"],
    "uz_cyrl": ["Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба", "Якшанба"],
    "ru":      ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
    "en":      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
}

L = {
    "uz": {
        "title": "Ojidaniya — haftalik svodka", "period": "Davr",
        "d_days": "kun", "d_brigs": "brigadir", "d_reps": "hisobot",
        "nav_days": "Kunlar", "nav_cats": "Kategoriyalar", "nav_brigs": "Brigadirlar", "nav_meth": "Metodika",
        "kpi_caption": "Haftaning asosiy ko'rsatkichlari",
        "th_metric": "Ko'rsatkich", "th_value": "Qiymat",
        "k_total": "Jami ojidaniya", "k_daily": "Kunlik o'rtacha", "k_per_rep": "Bir hisobotga o'rtacha",
        "k_flagged": '<a href="#th50">50 daq chegarasidan</a> oshgan hisobotlar',
        "cnt_suffix": " ta", "shift1": "1-smena", "shift2": "2-smena",
        "ns_total": "«To'xtamaganda» jami",
        "soat": "soat", "daq": "daq",
        "sec_days": "Kunlar kesimi", "th_date": "Sana", "th_day": "Kun", "th_min": "Daq", "th_share": "Ulush",
        "sec_cats": "Kategoriyalar kesimi", "th_code": "Kod", "th_meaning": "Ma'nosi",
        "sec_brigs": "Brigadirlar kesimi — Top {n}",
        "top_share": "Eng yuqori {n} brigadirga haftalik ojidaniyaning <b>{p}</b>i to'g'ri keladi ({v} daq).",
        "th_brig": "Brigadir", "th_shift": "Smena", "th_flag": "50+ kun", "th_cause": "Asosiy sabab",
        "rest_summary": "Qolgan {n} brigadir",
        "insight": "Eng katta yo'qotish sababi — «{label}» (<code>{code}</code>): {v} daqiqa, jami ojidaniyaning {p}i. Eng og'ir kun — {d}, {wd}: {dv} daqiqa.",
        "cite": "Ojidaniya sahifasi, {range}",
        "sec_actions": "Keyingi hafta uchun",
        "act_cat": "«{label}» (<code>{code}</code>) bo'yicha chora — {names}",
        "act_review": "50+ kunlari 2 va undan ko'p bo'lgan brigadirlar bilan sabablarni ko'rib chiqish",
        "act_done": "Haftalik svodka e'lon qilindi",
        "sec_meth": "Metodika va izohlar",
        "m1": "Raqamlar smena hisobotining «yacheyka to'xtaganda» yarmidan olindi.",
        "m2": "Bir kunlik jami ojidaniya 50 daqiqadan oshsa, hisobot belgilangan («50+») hisoblanadi.",
        "m3_kpi": "Kategoriyalar — zagruzka KPI tarkibiga kiradiganlari («Zagruzkada hisoblanadi» rejimi).",
        "m3_all": "Smena hisobotining barcha kategoriyalari hisobga olindi («Barchasi» rejimi).",
        "m4": "Batafsil grafiklar — Ojidaniya sahifasida; bugungi raqamlar uchun botga /ojidaniya yuboring.",
        "footer": "Manba: Safia Dashboard — Ojidaniya sahifasi",
    },
    "uz_cyrl": {
        "title": "Ожидания — ҳафталик сводка", "period": "Давр",
        "d_days": "кун", "d_brigs": "бригадир", "d_reps": "ҳисобот",
        "nav_days": "Кунлар", "nav_cats": "Категориялар", "nav_brigs": "Бригадирлар", "nav_meth": "Методика",
        "kpi_caption": "Ҳафтанинг асосий кўрсаткичлари",
        "th_metric": "Кўрсаткич", "th_value": "Қиймат",
        "k_total": "Жами ожидания", "k_daily": "Кунлик ўртача", "k_per_rep": "Бир ҳисоботга ўртача",
        "k_flagged": '<a href="#th50">50 дақ чегарасидан</a> ошган ҳисоботлар',
        "cnt_suffix": " та", "shift1": "1-смена", "shift2": "2-смена",
        "ns_total": "«Тўхтамаганда» жами",
        "soat": "соат", "daq": "дақ",
        "sec_days": "Кунлар кесими", "th_date": "Сана", "th_day": "Кун", "th_min": "Дақ", "th_share": "Улуш",
        "sec_cats": "Категориялар кесими", "th_code": "Код", "th_meaning": "Маъноси",
        "sec_brigs": "Бригадирлар кесими — Топ {n}",
        "top_share": "Энг юқори {n} бригадирга ҳафталик ожиданиянинг <b>{p}</b>и тўғри келади ({v} дақ).",
        "th_brig": "Бригадир", "th_shift": "Смена", "th_flag": "50+ кун", "th_cause": "Асосий сабаб",
        "rest_summary": "Қолган {n} бригадир",
        "insight": "Энг катта йўқотиш сабаби — «{label}» (<code>{code}</code>): {v} дақиқа, жами ожиданиянинг {p}и. Энг оғир кун — {d}, {wd}: {dv} дақиқа.",
        "cite": "Ожидания саҳифаси, {range}",
        "sec_actions": "Кейинги ҳафта учун",
        "act_cat": "«{label}» (<code>{code}</code>) бўйича чора — {names}",
        "act_review": "50+ кунлари 2 ва ундан кўп бўлган бригадирлар билан сабабларни кўриб чиқиш",
        "act_done": "Ҳафталик сводка эълон қилинди",
        "sec_meth": "Методика ва изоҳлар",
        "m1": "Рақамлар смена ҳисоботининг «ячейка тўхтаганда» ярмидан олинди.",
        "m2": "Бир кунлик жами ожидания 50 дақиқадан ошса, ҳисобот белгиланган («50+») ҳисобланади.",
        "m3_kpi": "Категориялар — загрузка KPI таркибига кирадиганлари («Загрузкада ҳисобланади» режими).",
        "m3_all": "Смена ҳисоботининг барча категориялари ҳисобга олинди («Барчаси» режими).",
        "m4": "Батафсил графиклар — Ожидания саҳифасида; бугунги рақамлар учун ботга /ojidaniya юборинг.",
        "footer": "Манба: Safia Dashboard — Ожидания саҳифаси",
    },
    "ru": {
        "title": "Ожидания — недельная сводка", "period": "Период",
        "d_days": "дн.", "d_brigs": "бриг.", "d_reps": "отч.",
        "nav_days": "Дни", "nav_cats": "Категории", "nav_brigs": "Бригадиры", "nav_meth": "Методика",
        "kpi_caption": "Основные показатели недели",
        "th_metric": "Показатель", "th_value": "Значение",
        "k_total": "Всего ожиданий", "k_daily": "В среднем за день", "k_per_rep": "В среднем на отчёт",
        "k_flagged": 'Отчёты сверх <a href="#th50">порога 50 мин</a>',
        "cnt_suffix": "", "shift1": "1-я смена", "shift2": "2-я смена",
        "ns_total": "Итого «не остановлена»",
        "soat": "ч", "daq": "мин",
        "sec_days": "Разрез по дням", "th_date": "Дата", "th_day": "День", "th_min": "Мин", "th_share": "Доля",
        "sec_cats": "Разрез по категориям", "th_code": "Код", "th_meaning": "Расшифровка",
        "sec_brigs": "Разрез по бригадирам — Топ {n}",
        "top_share": "На топ-{n} бригадиров приходится <b>{p}</b> недельных ожиданий ({v} мин).",
        "th_brig": "Бригадир", "th_shift": "Смена", "th_flag": "Дней 50+", "th_cause": "Главная причина",
        "rest_summary": "Остальные бригадиры ({n})",
        "insight": "Главная причина потерь — «{label}» (<code>{code}</code>): {v} мин, {p} всех ожиданий. Самый тяжёлый день — {d}, {wd}: {dv} мин.",
        "cite": "Страница «Ожидания», {range}",
        "sec_actions": "На следующую неделю",
        "act_cat": "«{label}» (<code>{code}</code>) — меры: {names}",
        "act_review": "Разобрать причины с бригадирами, у которых 2 и более дней 50+",
        "act_done": "Недельная сводка опубликована",
        "sec_meth": "Методика и примечания",
        "m1": "Цифры взяты из половины сменного отчёта «ячейка остановлена».",
        "m2": "Если суммарное ожидание за день превышает 50 минут, отчёт считается отмеченным («50+»).",
        "m3_kpi": "Категории — входящие в KPI загрузки (режим «Учитывается в загрузке»).",
        "m3_all": "Учтены все категории сменного отчёта (режим «Все»).",
        "m4": "Подробные графики — на странице «Ожидания»; за сегодняшними числами отправьте боту /ojidaniya.",
        "footer": "Источник: Safia Dashboard — страница «Ожидания»",
    },
    "en": {
        "title": "Ojidaniya — weekly summary", "period": "Period",
        "d_days": "days", "d_brigs": "brigadirs", "d_reps": "reports",
        "nav_days": "Days", "nav_cats": "Categories", "nav_brigs": "Brigadirs", "nav_meth": "Method",
        "kpi_caption": "Key figures of the week",
        "th_metric": "Metric", "th_value": "Value",
        "k_total": "Total waiting", "k_daily": "Daily average", "k_per_rep": "Average per report",
        "k_flagged": 'Reports over the <a href="#th50">50-min threshold</a>',
        "cnt_suffix": "", "shift1": "Shift 1", "shift2": "Shift 2",
        "ns_total": "Not-stopped total",
        "soat": "h", "daq": "min",
        "sec_days": "By day", "th_date": "Date", "th_day": "Day", "th_min": "Min", "th_share": "Share",
        "sec_cats": "By category", "th_code": "Code", "th_meaning": "Meaning",
        "sec_brigs": "By brigadir — top {n}",
        "top_share": "The top {n} brigadirs account for <b>{p}</b> of the week's waiting ({v} min).",
        "th_brig": "Brigadir", "th_shift": "Shift", "th_flag": "50+ days", "th_cause": "Main cause",
        "rest_summary": "Remaining {n} brigadirs",
        "insight": "The biggest loss driver is “{label}” (<code>{code}</code>): {v} minutes, {p} of all waiting. The heaviest day was {d}, {wd}: {dv} minutes.",
        "cite": "Ojidaniya page, {range}",
        "sec_actions": "For next week",
        "act_cat": "Action on “{label}” (<code>{code}</code>) — {names}",
        "act_review": "Review causes with brigadirs having 2 or more 50+ days",
        "act_done": "Weekly summary published",
        "sec_meth": "Method & notes",
        "m1": "Numbers come from the “cell stopped” half of the shift report.",
        "m2": "A report is flagged (“50+”) when the day's total waiting exceeds 50 minutes.",
        "m3_kpi": "Categories are those counted by the zagruzka KPIs (the “Counted on zagruzka” mode).",
        "m3_all": "Every category of the shift report is included (the “All” mode).",
        "m4": "Detailed charts live on the Ojidaniya page; send /ojidaniya to the bot for today's numbers.",
        "footer": "Source: Safia Dashboard — Ojidaniya page",
    },
}

dmy = lambda s: datetime.strptime(s, "%d.%m.%Y").date()
fmt_n = lambda v: f"{round(v):,}".replace(",", " ")


def _pct(v: float, total: float) -> str:
    return f"{round(v / total * 100)}%" if total else "0%"


def _hours(mins: float, t: dict) -> str:
    h, m = divmod(round(mins), 60)
    return f"{h} {t['soat']} {m} {t['daq']}" if h else f"{m} {t['daq']}"


def _unix_noon(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, 12, tzinfo=TZ).timestamp())


def _brig_rows(items: list[dict], t: dict, labels: dict) -> str:
    out = []
    for s in items:
        val = fmt_n(s["total"])
        cause = (f'{escape(labels.get(s["worst"], s["worst"]))} '
                 f'<code>{s["worst"].removeprefix("Cat ")}</code>') if s["worst"] else "—"
        out.append(
            f'<tr><td>{escape(s["manager_name"])}</td><td align="center">S{s["shift"] or "?"}</td>'
            f'<td align="right">{f"<mark>{val}</mark>" if s["flagged_days"] else val}</td>'
            f'<td align="center">{s["flagged_days"]}</td><td>{cause}</td></tr>')
    return "\n".join(out)


def build_svodka(db, payload: dict, day_to: date, lang: str = "uz",
                 shift: int | None = None, days: int = 7, kpi_only: bool = False,
                 with_image: bool = True, top_n: int = 6) -> str | None:
    """None when the window holds no reports — callers keep their fallback."""
    from app.routers.downtime import get_downtime

    t = L.get(lang, L["uz"])
    labels = CAT_LABELS.get(lang, CAT_LABELS["uz"])
    wd = WEEKDAYS.get(lang, WEEKDAYS["uz"])
    day_from = day_to - timedelta(days=days - 1)
    data = get_downtime(date_from=day_from, date_to=day_to, shift=shift, manager_id=[],
                        kpi_only=kpi_only, db=db, _=payload)
    rows = data.get("rows", [])
    if not rows:
        return None

    total = sum(float(r["total"] or 0) for r in rows)
    total_ns = sum(float(r.get("total_ns") or 0) for r in rows)
    day_tot = {d: 0.0 for d in data["dates"]}
    cats: dict[str, float] = {}
    per_cat_brigs: dict[str, dict[str, float]] = {}
    for r in rows:
        day_tot[r["date"]] += float(r["total"] or 0)
        for c, v in (r["by_category"] or {}).items():
            v = float(v or 0)
            if v > 0:
                cats[c] = cats.get(c, 0) + v
                per_cat_brigs.setdefault(c, {})[r["manager_name"]] = \
                    per_cat_brigs.get(c, {}).get(r["manager_name"], 0) + v
    cats = dict(sorted(cats.items(), key=lambda kv: -kv[1]))

    summary = data.get("summary", [])
    for s in summary:
        bc = {c: v for c, v in per_cat_brigs.items() if s["manager_name"] in v}
        s["worst"] = max(bc, key=lambda c: bc[c][s["manager_name"]]) if bc else None
    top, rest = summary[:top_n], summary[top_n:]
    top_sum = sum(s["total"] for s in top)
    flagged = sum(s["flagged_days"] for s in summary)
    worst_day = max(day_tot, key=day_tot.get)
    top_cat = next(iter(cats), None)
    shift_tot = {n: sum(s["total"] for s in summary if s["shift"] == n) for n in (1, 2)}

    day_rows = "\n".join(
        f'<tr><td>{d[:5]}</td><td>{wd[dmy(d).weekday()]}</td>'
        f'<td align="right">{f"<mark>{fmt_n(v)}</mark>" if d == worst_day and v > 0 else fmt_n(v)}</td>'
        f'<td align="right">{_pct(v, total)}</td></tr>'
        for d, v in day_tot.items())
    cat_rows = "\n".join(
        f'<tr><td><code>{c}</code></td><td>{escape(labels.get(c, c))}</td>'
        f'<td align="right">{f"<mark>{fmt_n(v)}</mark>" if c == top_cat else fmt_n(v)}</td>'
        f'<td align="right">{_pct(v, total)}</td></tr>'
        for c, v in cats.items())

    actions = []
    for c in list(cats)[:2]:
        worst_brigs = sorted(per_cat_brigs[c], key=lambda n: -per_cat_brigs[c][n])[:3]
        actions.append('<li><input type="checkbox"/>' + t["act_cat"].format(
            label=escape(labels.get(c, c)), code=c.removeprefix("Cat "),
            names=escape(", ".join(worst_brigs))) + "</li>")
    actions.append(f'<li><input type="checkbox"/>{t["act_review"]}</li>')
    actions.append(f'<li><input type="checkbox" checked/>{t["act_done"]}</li>')

    rng = f"{day_from:%d.%m}–{day_to:%d.%m.%Y}"
    insight = ""
    if top_cat:
        insight = ("<blockquote>" + t["insight"].format(
            label=escape(labels.get(top_cat, top_cat)), code=top_cat,
            v=fmt_n(cats[top_cat]), p=_pct(cats[top_cat], total),
            d=worst_day[:5], wd=wd[dmy(worst_day).weekday()],
            dv=fmt_n(day_tot[worst_day]))
            + f"<cite>{t['cite'].format(range=rng)}</cite></blockquote>\n")
    figure = ('<figure><img src="tg://photo?id=scr1"/>'
              f'<figcaption>Ojidaniya · {day_to:%d.%m.%Y}<cite>Safia Dashboard</cite></figcaption></figure>\n'
              if with_image else "")
    ns_row = (f'<tr><td>{t["ns_total"]}</td><td align="right">{fmt_n(total_ns)} {t["daq"]}</td></tr>\n'
              if total_ns > 0 else "")
    rest_block = ""
    if rest:
        rest_block = (f'<details><summary>{t["rest_summary"].format(n=len(rest))}</summary>\n'
                      '<table bordered striped>\n'
                      f'<tr><th align="left">{t["th_brig"]}</th><th align="center">{t["th_shift"]}</th>'
                      f'<th align="right">{t["th_min"]}</th><th align="center">{t["th_flag"]}</th>'
                      f'<th align="left">{t["th_cause"]}</th></tr>\n'
                      + _brig_rows(rest, t, labels) + "\n</table>\n</details>\n")

    return f"""<h1>{t["title"]}</h1>
<p><b>{t["period"]}:</b> <tg-time unix="{_unix_noon(day_from)}" format="D">{day_from:%d.%m.%Y}</tg-time> — <tg-time unix="{_unix_noon(day_to)}" format="D">{day_to:%d.%m.%Y}</tg-time> · {len(day_tot)} {t["d_days"]} · {len(summary)} {t["d_brigs"]} · {len(rows)} {t["d_reps"]}</p>
<p><a href="#kunlar">{t["nav_days"]}</a> · <a href="#kategoriyalar">{t["nav_cats"]}</a> · <a href="#brigadirlar">{t["nav_brigs"]}</a> · <a href="#metodika">{t["nav_meth"]}</a></p>

<table bordered>
<caption>{t["kpi_caption"]}</caption>
<tr><th align="left">{t["th_metric"]}</th><th align="right">{t["th_value"]}</th></tr>
<tr><td>{t["k_total"]}</td><td align="right"><b>{fmt_n(total)} {t["daq"]}</b> <i>({_hours(total, t)})</i></td></tr>
<tr><td>{t["k_daily"]}</td><td align="right">{fmt_n(total / max(len(day_tot), 1))} {t["daq"]}</td></tr>
<tr><td>{t["k_per_rep"]}</td><td align="right">{fmt_n(total / max(len(rows), 1))} {t["daq"]}</td></tr>
<tr><td>{t["k_flagged"]}</td><td align="right"><mark>{flagged}{t["cnt_suffix"]}</mark></td></tr>
<tr><td>{t["shift1"]}</td><td align="right">{fmt_n(shift_tot[1])} {t["daq"]} <i>({_pct(shift_tot[1], total)})</i></td></tr>
<tr><td>{t["shift2"]}</td><td align="right">{fmt_n(shift_tot[2])} {t["daq"]} <i>({_pct(shift_tot[2], total)})</i></td></tr>
{ns_row}</table>

{figure}<a name="kunlar"></a>
<h3>{t["sec_days"]}</h3>
<table bordered striped>
<tr><th align="left">{t["th_date"]}</th><th align="left">{t["th_day"]}</th><th align="right">{t["th_min"]}</th><th align="right">{t["th_share"]}</th></tr>
{day_rows}
</table>

<a name="kategoriyalar"></a>
<h3>{t["sec_cats"]}</h3>
<table bordered striped>
<tr><th align="left">{t["th_code"]}</th><th align="left">{t["th_meaning"]}</th><th align="right">{t["th_min"]}</th><th align="right">{t["th_share"]}</th></tr>
{cat_rows}
</table>

{insight}<a name="brigadirlar"></a>
<h3>{t["sec_brigs"].format(n=len(top))}</h3>
<p>{t["top_share"].format(n=len(top), p=_pct(top_sum, total), v=fmt_n(top_sum))}</p>
<table bordered striped>
<tr><th align="left">{t["th_brig"]}</th><th align="center">{t["th_shift"]}</th><th align="right">{t["th_min"]}</th><th align="center">{t["th_flag"]}</th><th align="left">{t["th_cause"]}</th></tr>
{_brig_rows(top, t, labels)}
</table>

{rest_block}<h3>{t["sec_actions"]}</h3>
<ul>
{chr(10).join(actions)}
</ul>

<a name="metodika"></a>
<details><summary>{t["sec_meth"]}</summary>
<ul>
<li>{t["m1"]}</li>
<li><tg-reference name="th50">{t["m2"]}</tg-reference></li>
<li>{t["m3_kpi"] if kpi_only else t["m3_all"]}</li>
<li>{t["m4"]}</li>
</ul>
</details>

<hr/>
<footer>{t["footer"]}</footer>
"""
