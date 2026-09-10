"""Which SAP work centres are claimed by MORE THAN ONE unit — the register.

**Why this exists.** A verifix code identifies ONE cell. A SAP work centre does
not: two shifts routinely stand at the same one, so several cells — in different
units, on different shifts — legitimately carry one `cells.sap_code`. The
platform had two separate consequences of that and neither was visible anywhere:

* **The LABEL was wrong** (fixed in v4.92.0). `cell_lookup.by_sap` was keyed by
  the code alone and kept whichever cell sorted first by verifix code, so a work
  centre on one brigadir's page was named after — and linked to — ANOTHER
  SHIFT's cell and leader. It is keyed by `(manager_id, code)` now.
* **The QUANTITY is written twice** (open, and it moves a number). The SAP
  upload cuts the фаза file by each unit's own work centres and catalog SKUs
  (`production._scoped_faza`), so a work centre in two units' catalogs has the
  day's WHOLE ПЛАН/ФАКТ written to BOTH. Each unit's trudoyomkost — and so its
  загрузка — then counts the other shift's output.

The file cannot resolve it. A фаза row is `Заказ · Опер. · Команда · SKU ·
Наименование · План · Статус · Дата · Подтв.`: no person, no brigade, no shift,
and no TIME (`pp_parser._to_date` keeps the date alone), so the shift cannot be
derived from the clock either. `pp_products.op` is empty on every line on the
platform, so operations cannot separate them. Splitting the quantity — evenly,
or by the typed «Odam soni» — is a GUESS about who produced what, which is why
this module REPORTS and changes nothing.

**Nothing is re-measured.** The minutes come from `zagruzka_source.wc_labor`,
which `unit_labor` — the загрузка's own numerator — is a fold of, so this report
and the page cannot state different trudoyomkost for one day. The catalog, the
cells and the stored quantities are read as they are.

**Two registers, kept apart, because they have two different fixes.** The CELLS
that share a code are a registry fact and are mostly harmless now that the label
is scoped; the CATALOG lines that share one are what writes a quantity twice.
A single table would answer one of them and hide the other.

Sent as Telegram rich messages (Bot API 10.1 `sendRichMessage`) with a plain
`sendMessage` fallback, exactly as `unpriced_report` does. Delivery is the
caller's business — see `startup.report_shared_work_centers`, which fires it
once behind a flag. Always Uzbek Latin: a boot job has no browser in the loop to
send the words, the rule `ojidaniya_deck` already follows.
"""
from __future__ import annotations

import html
import json
from collections import defaultdict
from datetime import date
from io import BytesIO

import requests
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell, Factory, Manager, PPDaily, PPProduct, RoleProfile
from app.services import zagruzka_source
from app.services.ojidaniya_export import (CENTER, DATE_FMT, INDIGO, MIN,
                                           _iso, _unp_cell, _unp_head, _xl)
from app.services.quality_export import (AMBER, BAND, BRAND_SOFT, GREEN, INK_SOFT,
                                         NUM, ORANGE, PANEL, RED, RIGHT, SLATE,
                                         _banner, _fill, _kpi_cards, _meta_strip,
                                         _section, _sheet)

# Telegram's envelope is 32 768 UTF-8 chars / 500 blocks; the row cap is set
# against the BLOCK budget, as `unpriced_report` explains — over-splitting costs
# one extra message, guessing the other way costs the report.
_MAX_ROWS_PER_MSG = 25
_MAX_CHARS = 20000
# The evidence sheet is one row per stored pp_daily row that was written to more
# than one unit — 468 of them today. Capped so a workbook cannot become
# unopenable if the overlap ever grows; the summary counts the whole history
# either way, and the file says when it was trimmed.
MAX_DAY_ROWS = 5000


def _esc(v) -> str:
    return html.escape("" if v is None else str(v), quote=False)


def _yn(v) -> str:
    """ha / yo'q / «—» for None — a helper rather than an inline conditional,
    because the apostrophe in «yo'q» cannot live inside an f-string expression.
    None is a THIRD answer and must not collapse into either of the other two:
    a unit holding no catalog line at that work centre has no auto-fill setting
    to report, and printing «ha» there would claim the upload is filling a line
    that does not exist."""
    return "—" if v is None else ("ha" if v else "yo'q")


def _fmt(n: float, dec: int = 0) -> str:
    """Uzbek number formatting: space thousands, comma decimal."""
    s = f"{n:,.{dec}f}".replace(",", " ")
    return s.replace(".", ",") if dec else s


def _dmy(iso: str) -> str:
    y, m, d = str(iso).split("-")
    return f"{d}.{m}.{y}"


def _norm(code) -> str:
    return "".join(str(code or "").split()).upper()


def collect(db: Session, date_from: date, date_to: date) -> dict:
    """Everything about every work centre more than one unit claims.

    ``date_from``/``date_to`` bound the DETAIL — the stored quantities and the
    trudoyomkost each unit draws from a shared work centre. The extent of the
    duplication is reported over the WHOLE stored history beside it, because a
    window that happens to miss it would read as "this is not happening".
    """
    mgrs = {int(m.id): m for m in db.query(Manager).all()}
    factories = {int(f.id): (f.name_uz or f.name_ru or f.code or str(f.id))
                 for f in db.query(Factory).all()}
    leaders = {int(r.id): r.name for r in
               db.query(RoleProfile).filter(RoleProfile.role == "leader").all()}

    # ── register 1: CELLS that name one work centre from several units ───────
    by_code: dict[str, list] = defaultdict(list)
    for c in db.query(Cell).filter(Cell.sap_code.isnot(None),
                                   Cell.manager_id.isnot(None)).all():
        code = _norm(c.sap_code)
        if code:
            by_code[code].append(c)
    shared_cells = {code: rows for code, rows in by_code.items()
                    if len({int(c.manager_id) for c in rows}) > 1}

    # ── register 2: CATALOG lines — which units carry which work centre ──────
    cat: dict[tuple[int, str], list] = defaultdict(list)
    for p in db.query(PPProduct).all():
        cat[(int(p.manager_id), _norm(p.work_center))].append(p)
    wc_units: dict[str, set] = defaultdict(set)
    for (mid, wc) in cat:
        if wc:
            wc_units[wc].add(mid)
    shared_cat = {wc: ids for wc, ids in wc_units.items() if len(ids) > 1}

    # ── what the upload actually WROTE to more than one unit ─────────────────
    # The effect, not the intention: a SKU reaches the join through
    # `_unit_sap_scope`, which reads every catalog line of the unit — INACTIVE
    # ones included — so more SKUs are written twice than the active catalogs
    # of two units have in common. Read the stored rows rather than predicting
    # them from the catalog.
    dup_keys: dict[tuple[str, str], set] = defaultdict(set)
    all_days: dict[tuple[str, str], set] = defaultdict(set)
    for r in db.query(PPDaily.work_center, PPDaily.sap_code, PPDaily.date,
                      PPDaily.manager_id).all():
        key = (_norm(r.work_center), r.sap_code or "")
        dup_keys[key].add(int(r.manager_id))
        all_days[key].add(r.date)
    dup_keys = {k: v for k, v in dup_keys.items() if len(v) > 1}

    hist_days: set = set()
    hist_keys = 0          # (work centre, SKU, date) triples written to >1 unit
    hist_rows = 0          # the stored pp_daily rows those triples occupy
    for k in dup_keys:
        hist_days |= all_days[k]
        hist_keys += len(all_days[k])
        hist_rows += len(all_days[k]) * len(dup_keys[k])
    # The work centres where a quantity really WAS written twice — a subset of
    # the shared catalogs, and not the same fact: two units can both carry a
    # work centre and hold no SKU in common, in which case nothing is doubled.
    dup_wcs = {wc for (wc, _sku) in dup_keys}

    # ── the stored quantities ────────────────────────────────────────────────
    # Aggregated per (work centre, SKU, unit) for the summary, and kept ROW BY
    # ROW for the evidence sheet. Deliberately over the WHOLE stored history,
    # not the window: the window bounds the загрузка IMPACT — minutes only mean
    # something from `zagruzka_source.ZAGRUZKA_FROM` — while a quantity written
    # twice is worth listing wherever it sits, and a day sheet that went empty
    # because the duplication predates the window would read as "this is not
    # happening".
    qty: dict[tuple[str, str, int], dict] = {}
    dup_days: list[dict] = []
    for d in db.query(PPDaily).order_by(PPDaily.date.desc()).all():
        key = (_norm(d.work_center), d.sap_code or "")
        if key not in dup_keys:
            continue
        mid = int(d.manager_id)
        plan = float(
            (d.plan_override if d.plan_override is not None else d.plan_qty) or 0)
        actual = float(
            (d.actual_override if d.actual_override is not None else d.actual_qty) or 0)
        slot = qty.setdefault((key[0], key[1], mid),
                              {"days": 0, "plan": 0.0, "actual": 0.0})
        slot["days"] += 1
        slot["plan"] += plan
        slot["actual"] += actual
        if len(dup_days) < MAX_DAY_ROWS:
            m = mgrs.get(mid)
            dup_days.append({
                "date": d.date.isoformat(), "wc": key[0], "sku": key[1],
                "manager": (m.name if m else f"#{mid}"),
                "shift": (m.shift if m else None),
                "factory": factories.get(m.factory_id) if m else None,
                "plan": plan, "actual": actual,
                # A hand-typed value outranks the file, so a row carrying one is
                # NOT the upload's doing and must not be read as evidence of it.
                "typed": (d.plan_override is not None
                          or d.actual_override is not None),
            })
    dup_days.sort(key=lambda x: (x["date"], x["wc"], x["sku"], x["manager"]),
                  reverse=True)

    # ── the rows: one per (work centre, SKU, unit) written twice ─────────────
    dupes: list[dict] = []
    for (wc, sku), ids in sorted(dup_keys.items()):
        for mid in sorted(ids):
            m = mgrs.get(mid)
            lines = [p for p in cat.get((mid, wc), ()) if (p.sap_code or "") == sku]
            live = [p for p in lines if p.active] or lines
            q = qty.get((wc, sku, mid), {"days": 0, "plan": 0.0, "actual": 0.0})
            dupes.append({
                "wc": wc, "sku": sku,
                "name": (live[0].name if live else "") or "",
                "manager": (m.name if m else f"#{mid}"), "manager_id": mid,
                "shift": (m.shift if m else None),
                "factory": factories.get(m.factory_id) if m else None,
                "lines": len(lines),
                "labor": (float(live[0].labor_time)
                          if live and live[0].labor_time is not None else None),
                "op": (live[0].op if live else None) or "",
                # `auto_fill` is the switch that already answers this by hand:
                # off ⇒ the upload leaves the line alone and the brigadir types
                # the half their own shift made.
                # None = this unit has NO catalog line for this SKU at this
                # work centre, yet the upload still wrote it a quantity: the
                # фаза cut passes a row whose SKU appears ANYWHERE in the unit's
                # catalog (`_unit_sap_scope` collects every line's sap_code,
                # inactive ones included) as long as the work centre is one of
                # the unit's own. Worth seeing — the row is production the unit
                # cannot even price, since it has no labor_time to apply.
                # `is not False`, never `bool(...)`: the column is NOT NULL
                # with server_default TRUE, and absent/True is the behaviour
                # every line has always had — `pp_calc.takes_sap` reads it the
                # same way, so a row predating the column can never read as
                # "switched off" here and "on" there.
                "auto_fill": (all(getattr(p, "auto_fill", True) is not False
                                  for p in lines) if lines else None),
                "active": any(p.active for p in lines),
                "days": q["days"], "plan": q["plan"], "actual": q["actual"],
            })

    # ── the cells register ───────────────────────────────────────────────────
    cells: list[dict] = []
    for code, rows in sorted(shared_cells.items()):
        for c in sorted(rows, key=lambda x: (x.verifix_code or "")):
            mid = int(c.manager_id)
            m = mgrs.get(mid)
            cells.append({
                "wc": code, "code": c.verifix_code or "", "cell_id": c.id,
                "manager": (m.name if m else f"#{mid}"), "manager_id": mid,
                "shift": (m.shift if m else None),
                "factory": factories.get(m.factory_id) if m else None,
                "leader": leaders.get(c.leader_id) if c.leader_id else None,
                "in_catalog": bool(cat.get((mid, code))),
                "units": len({int(x.manager_id) for x in rows}),
                "shifts": len({(mgrs[int(x.manager_id)].shift
                                if int(x.manager_id) in mgrs else None)
                               for x in rows}),
            })

    # ── the impact: how much of a unit's trudoyomkost is a shared work centre ─
    # `zagruzka_source.wc_labor` IS the загрузка's numerator, one work centre at
    # a time — never a second spelling of it.
    labor = zagruzka_source.wc_labor(db, list(mgrs), date_from, date_to)
    tot: dict[int, float] = defaultdict(float)
    shared_min: dict[int, float] = defaultdict(float)
    dup_min: dict[int, float] = defaultdict(float)
    for (mid, _day, wc), (plan, _actual) in labor.items():
        tot[mid] += plan
        if _norm(wc) in shared_cat:
            shared_min[mid] += plan
        if _norm(wc) in dup_wcs:
            dup_min[mid] += plan
    impact = []
    for mid, sm in sorted(shared_min.items(), key=lambda kv: -kv[1]):
        if sm <= 0:
            continue
        m = mgrs.get(mid)
        impact.append({
            "manager": (m.name if m else f"#{mid}"), "shift": (m.shift if m else None),
            "shared": sm, "dup": dup_min.get(mid, 0.0), "total": tot.get(mid, 0.0),
            "pct": (100.0 * sm / tot[mid]) if tot.get(mid) else None,
            "dup_pct": (100.0 * dup_min[mid] / tot[mid])
                       if tot.get(mid) and dup_min.get(mid) else None,
            "wcs": sorted({_norm(wc) for (mm, _d, wc) in labor
                           if mm == mid and _norm(wc) in shared_cat}),
            "dup_wcs": sorted({_norm(wc) for (mm, _d, wc) in labor
                               if mm == mid and _norm(wc) in dup_wcs}),
        })

    return {
        "from": date_from, "to": date_to,
        "cells": cells, "dupes": dupes, "impact": impact,
        "dup_days": dup_days,
        "day_rows_capped": len(dup_days) >= MAX_DAY_ROWS,
        "shared_cat": {wc: sorted(ids) for wc, ids in shared_cat.items()},
        "managers": {int(k): (v.name, v.shift) for k, v in mgrs.items()},
        "counts": {
            "cell_codes": len(shared_cells),
            "cell_codes_cross_shift": sum(
                1 for code, rows in shared_cells.items()
                if len({(mgrs[int(x.manager_id)].shift
                         if int(x.manager_id) in mgrs else None) for x in rows}) > 1),
            "cat_wcs": len(shared_cat),
            "dup_pairs": len(dup_keys),
            "dup_wcs": sorted(dup_wcs),
            "hist_keys": hist_keys,
            "hist_rows": hist_rows,
            "hist_days": len(hist_days),
            "first": min(hist_days).isoformat() if hist_days else None,
            "last": max(hist_days).isoformat() if hist_days else None,
        },
    }


# ── rendering ────────────────────────────────────────────────────────────────
_CELL_HEAD = ["№", "Ish markazi", "Yacheyka", "Brigadir", "Smena", "Zavod",
              "Lider", "Katalogda"]
_DUP_HEAD = ["№", "Ish markazi", "SKU", "Nomi", "Brigadir", "Smena",
             "Trudoyomkost", "Op", "Avto", "Kun", "ПЛАН", "ФАКТ"]


def _row(vals) -> str:
    return "<tr>" + "".join(f"<td>{_esc(v)}</td>" for v in vals) + "</tr>"


def _summary(rep: dict) -> str:
    c = rep["counts"]
    out = [
        "<p><b>SAP ish markazi yagona EMAS — yacheyka yagona</b></p>",
        f"<p>{_dmy(rep['from'].isoformat())} – {_dmy(rep['to'].isoformat())}</p>",
        "<p>Verifix kod bitta yacheykani bildiradi. <b>SAP ish markazi esa "
        "bildirmaydi</b>: ikki smena bir ish markazida ishlaydi, shuning uchun "
        "turli brigadirlarning yacheykalari bitta <code>sap_code</code> ni "
        "olib yurishi mumkin — bu xato emas, shunday.</p>",
        "<ul>"
        f"<li><b>{_esc(c['cell_codes'])}</b> ta ish markazi bir nechta "
        f"brigadirning yacheykalarida ({_esc(c['cell_codes_cross_shift'])} tasi "
        "ikki SMENA orasida)</li>"
        f"<li><b>{_esc(c['cat_wcs'])}</b> ta ish markazi bir nechta "
        "brigadirning KATALOGIDA</li>"
        f"<li><b>{_esc(c['dup_pairs'])}</b> ta (ish markazi + SKU) juftligi "
        f"ikki brigadirga <b>qo'sh yozilgan</b> — "
        f"{_esc(_fmt(c['hist_keys']))} ta (ish markazi + SKU + sana), jami "
        f"{_esc(_fmt(c['hist_rows']))} qator, {_esc(c['hist_days'])} kun"
        + (f" ({_dmy(c['first'])} – {_dmy(c['last'])})" if c["first"] else "")
        + f" · ish markazlari: {_esc(', '.join(c['dup_wcs']) or '—')}"
        + "</li></ul>",
        "<p><b>Tuzatildi (v4.92.0).</b> Ish markazi endi O'Z brigadirining "
        "yacheykasiga bog'lanadi. Ilgari <code>cell_lookup.by_sap</code> faqat "
        "kod bo'yicha kalitlangan edi va verifix bo'yicha birinchi yacheykani "
        "qaytarardi — masalan Raximova Kamola (1-smena) sahifasida B2911 "
        "Yogmirov Feruzning 2-smena yacheykasi 9121 ni ko'rsatardi. "
        "<code>/live</code> da esa ikki smenaning REJA daqiqalari bitta "
        "yacheykaga qo'shilib ketardi.</p>",
        "<p><b>Ochiq qolgani: ПЛАН/ФАКТ ikki marta yoziladi.</b> SAP yuklamasi "
        "фаза faylni har bir brigadirning o'z ish markazlari va katalog SKU'lari "
        "bo'yicha kesadi (<code>production._scoped_faza</code>), shuning uchun "
        "ikki katalogda turgan ish markazining KUNLIK BUTUN ПЛАН/ФАКТ i "
        "IKKALASIGA ham yoziladi. Natijada har ikki brigadirning trudoyomkosti "
        "— va demak загрузка si — boshqa smenaning ishini ham sanaydi.</p>",
        "<p><b>Fayl bu savolga javob bera olmaydi.</b> фаза qatori: "
        "<code>Заказ · Опер. · Команда · SKU · Наименование · План · Статус · "
        "Дата · Подтв.</code> — odam yo'q, brigada yo'q, smena yo'q, VAQT ham "
        "yo'q (faqat sana). Platformadagi hech bir katalog qatorida "
        "<code>Опер.</code> to'ldirilmagan, shuning uchun operatsiya bo'yicha "
        "ham ajratib bo'lmaydi.</p>",
    ]
    if rep["impact"]:
        out.append(
            "<p><b>Ta'sir</b> — REJA trudoyomkost (daqiqa). Ikki raqam, chunki "
            "ular ikki xil narsani aytadi:</p><ul>"
            "<li><b>Ulashilgan</b> — boshqa brigadirning katalogida ham turgan "
            "ish markazidan kelayotgan daqiqalar. Bu <i>xavf maydoni</i>: agar "
            "SKU'lar kesishmasa, hech narsa ikkilanmaydi.</li>"
            "<li><b>Qo'sh yozilgan</b> — miqdori haqiqatan ikkala brigadirga "
            "yozilgan ish markazidan kelayotgan daqiqalar. Bugun <i>noto'g'ri</i> "
            "bo'lgan qism shu.</li></ul><ul>")
        for r in rep["impact"]:
            pct = f" ({_fmt(r['pct'], 1)}%)" if r["pct"] is not None else ""
            dup = (f" · <b>qo'sh yozilgan {_fmt(r['dup'])} daq"
                   + (f" ({_fmt(r['dup_pct'], 1)}%)" if r["dup_pct"] is not None else "")
                   + f"</b> — {', '.join(r['dup_wcs'])}") if r["dup"] else ""
            out.append(
                f"<li>{_esc(r['manager'])} (sm.{_esc(r['shift'] or '—')}): "
                f"ulashilgan <b>{_esc(_fmt(r['shared']))}</b> / "
                f"{_esc(_fmt(r['total']))} daq{_esc(pct)} · "
                f"{_esc(', '.join(r['wcs']))}" + dup + "</li>")
        out.append("</ul>")
    out.append(
        "<p><b>Nima qilish kerak.</b> Buning uchun tayyor vosita allaqachon bor "
        "va yangi qoida kerak emas: ulashilgan katalog qatorlarida "
        "<b>«SAP avto-to'ldirish» ni O'CHIRING</b> "
        "(<code>pp_products.auto_fill = false</code>, /production «Позиции» "
        "jadvalidagi qator yoki tanlov). Shunda yuklama u qatorlarga tegmaydi "
        "va har bir brigadir O'Z smenasi qilgan qismini qo'lda kiritadi — bu "
        "kimdir BILADIGAN fakt. Miqdorni avtomatik bo'lish (teng yoki "
        "«Odam soni» bo'yicha) — kim nima ishlab chiqarganini TAXMIN qilish, "
        "shuning uchun bu hisobot hech narsani o'zgartirmaydi.</p>")
    return "".join(out)


def _table(head: list, rows: list, title: str, caption: str,
           first_pre: str = "") -> list[str]:
    """One table, split across messages with the header repeated on each slice —
    a reader who scrolls to the third message must never meet unlabelled
    columns."""
    if not rows:
        return [first_pre] if first_pre else []
    hd = "<tr>" + "".join(f"<th>{_esc(h)}</th>" for h in head) + "</tr>"
    slices: list[list[str]] = [[]]
    size = 0
    for cell in rows:
        if slices[-1] and (len(slices[-1]) >= _MAX_ROWS_PER_MSG
                           or size + len(cell) > _MAX_CHARS):
            slices.append([])
            size = 0
        slices[-1].append(cell)
        size += len(cell)
    total = len(slices)
    out = []
    for n, part in enumerate(slices, 1):
        pre = (first_pre if n == 1 else "") + (
            f"<p><b>{_esc(title)}</b></p>" if n == 1
            else f"<p><b>{_esc(title)} — davomi {n}/{total}</b></p>")
        cap = f"<caption>{_esc(caption)}{f' · {n}/{total}' if total > 1 else ''}</caption>"
        out.append(pre + f"<table bordered striped>{cap}{hd}"
                   + "".join(part) + "</table>")
    return out


def render(rep: dict) -> list[str]:
    msgs = [_summary(rep)]
    msgs += _table(
        _CELL_HEAD,
        [_row([i, r["wc"], r["code"], r["manager"], r["shift"] or "—",
               r["factory"] or "—", r["leader"] or "—",
               _yn(r["in_catalog"])])
         for i, r in enumerate(rep["cells"], 1)],
        "Yacheykalar reyestri",
        "Bitta SAP kodini olib yurgan yacheykalar · «Katalogda» = shu "
        "brigadirning katalogida bu ish markazi bormi")
    msgs += _table(
        _DUP_HEAD,
        [_row([i, r["wc"], r["sku"] or "—", (r["name"] or "—")[:38],
               r["manager"], r["shift"] or "—",
               _fmt(r["labor"], 1) if r["labor"] is not None else "—",
               r["op"] or "—", _yn(r["auto_fill"]),
               r["days"], _fmt(r["plan"], 1), _fmt(r["actual"], 1)])
         for i, r in enumerate(rep["dupes"], 1)],
        "Qo'sh yozilgan miqdorlar",
        "Har bir (ish markazi + SKU + brigadir) alohida qator · «Kun» va "
        "ПЛАН/ФАКТ — saqlangan BUTUN tarix bo'yicha (yuqoridagi davr emas: "
        "davr faqat trudoyomkostni chegaralaydi) · "
        "«Avto» = SAP avto-to'ldirish yoniqmi · "
        "«Nomi» va «Trudoyomkost» bo'sh bo'lsa — bu brigadirning shu ish "
        "markazida bunday katalog qatori YO'Q, lekin yuklama unga baribir "
        "miqdor yozgan (SKU uning katalogining boshqa joyida bor)")
    return msgs


def _plain(rep: dict) -> list[str]:
    """Fallback for a client or an API that refuses rich messages: the same
    facts as labelled lines. A 12-column table cannot survive `<pre>` on a
    phone, so the fallback trades the grid for one block per row — it must
    still be readable, not merely delivered."""
    c = rep["counts"]
    lines = [
        "<b>SAP ish markazi yagona EMAS — yacheyka yagona</b>",
        f"{_dmy(rep['from'].isoformat())} – {_dmy(rep['to'].isoformat())}", "",
        f"{c['cell_codes']} ish markazi bir nechta brigadirning yacheykalarida "
        f"({c['cell_codes_cross_shift']} tasi ikki smena orasida); "
        f"{c['cat_wcs']} tasi bir nechta katalogda; "
        f"{c['dup_pairs']} juftlik qo'sh yozilgan ({', '.join(c['dup_wcs']) or '—'}) "
        f"— {_fmt(c['hist_keys'])} ta sana-juftlik, {_fmt(c['hist_rows'])} qator, "
        f"{c['hist_days']} kun"
        + (f" ({_dmy(c['first'])} – {_dmy(c['last'])})" if c["first"] else ""), "",
        "<b>Yacheykalar</b>",
    ]
    for i, r in enumerate(rep["cells"], 1):
        lines.append(
            f"{i}. <b>{_esc(r['wc'])}</b> → yacheyka {_esc(r['code'])} · "
            f"{_esc(r['manager'])} (sm.{_esc(r['shift'] or '—')}) · "
            f"lider {_esc(r['leader'] or '—')} · "
            f"katalogda: {_yn(r['in_catalog'])}")
    lines += ["", "<b>Qo'sh yozilgan miqdorlar</b> (kun va miqdorlar — "
              "saqlangan butun tarix bo'yicha)"]
    for i, r in enumerate(rep["dupes"], 1):
        lines.append(
            f"{i}. <b>{_esc(r['wc'])}</b> · {_esc(r['sku'] or '—')} "
            f"{_esc(r['name'] or '')} · {_esc(r['manager'])} "
            f"(sm.{_esc(r['shift'] or '—')}) · trud. "
            f"{_esc(_fmt(r['labor'], 1) if r['labor'] is not None else '—')} · "
            f"avto: {_yn(r['auto_fill'])} · "
            f"{r['days']} kun · ПЛАН {_esc(_fmt(r['plan'], 1))} · "
            f"ФАКТ {_esc(_fmt(r['actual'], 1))}")
    if rep["impact"]:
        lines += ["", "<b>Ta'sir</b>"]
        for r in rep["impact"]:
            pct = f" ({_fmt(r['pct'], 1)}%)" if r["pct"] is not None else ""
            dup = (f" · qo'sh yozilgan {_fmt(r['dup'])} daq") if r["dup"] else ""
            lines.append(f"· {_esc(r['manager'])} (sm.{_esc(r['shift'] or '—')}): "
                         f"ulashilgan {_esc(_fmt(r['shared']))} / "
                         f"{_esc(_fmt(r['total']))} daq{_esc(pct)}{_esc(dup)}")
    lines += ["", "<b>Nima qilish kerak:</b> ulashilgan katalog qatorlarida "
              "«SAP avto-to'ldirish» ni o'chiring — yuklama u qatorlarga "
              "tegmaydi va har bir brigadir o'z smenasi qilgan qismini qo'lda "
              "kiritadi."]
    chunks, buf = [], []
    for ln in lines:
        if sum(len(x) + 1 for x in buf) + len(ln) > 3500:
            chunks.append("\n".join(buf))
            buf = []
        buf.append(ln)
    if buf:
        chunks.append("\n".join(buf))
    return chunks


def _api(method: str, data: dict) -> dict:
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
        data=data, timeout=120)
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(j.get("description") or f"HTTP {r.status_code}")
    return j["result"]


def send(db: Session, chat_id: int, date_from: date, date_to: date) -> int:
    """Compute and DM the register. Returns how many messages landed.

    Rich first, because that is what carries a table. On the FIRST message
    failing it degrades to plain `sendMessage` for the WHOLE report rather than
    per part — a report half rich and half plain is worse than either.
    """
    rep = collect(db, date_from, date_to)
    sent = 0
    try:
        for h in render(rep):
            # is_rtl pinned False, the broadcast tab's own finding: mixed
            # direction content otherwise mirrors table columns.
            _api("sendRichMessage", {
                "chat_id": chat_id,
                "rich_message": json.dumps({"html": h, "is_rtl": False}),
            })
            sent += 1
        return sent
    except Exception as exc:
        if sent:
            raise
        print(f"[shared-wc-report] rich send failed ({exc}); falling back to plain")

    for text in _plain(rep):
        _api("sendMessage", {"chat_id": chat_id, "text": text,
                             "parse_mode": "HTML"})
        sent += 1
    return sent


# ── the same register as a workbook ──────────────────────────────────────────
# The words live here, not on a client, for the reason `ojidaniya_deck` states
# for its own: this file is built by a boot job and there is no browser in the
# loop to send them. Uzbek Latin, whoever it reaches. The primitives come from
# `quality_export` / `ojidaniya_export`, which are the house report style.
XLS_LABELS = {
    "shSummary": "Xulosa", "shCells": "Yacheykalar",
    "shDupes": "Qo'sh yozilgan", "shDays": "Kunlik dalil",
    "impact": "Brigadirlarga ta'siri",
    "impactHint": "REJA trudoyomkost, daqiqa · «ulashilgan» = xavf maydoni, "
                  "«qo'sh yozilgan» = bugun noto'g'ri bo'lgan qism",
    "manager": "Brigadir", "shift": "Smena", "factory": "Zavod",
    "leader": "Lider", "cell": "Yacheyka", "wc": "Ish markazi",
    "sku": "SKU", "name": "Nomi", "labor": "Trudoyomkost", "op": "Опер.",
    "auto": "Avto-to'ldirish", "days": "Kun", "plan": "ПЛАН", "actual": "ФАКТ",
    "date": "Sana", "typed": "Qo'lda kiritilgan",
    "inCatalog": "Katalogda", "units": "Brigadirlar", "shifts": "Smenalar",
    "shared": "Ulashilgan", "dup": "Qo'sh yozilgan", "total": "Jami",
    "pct": "Ulushi", "wcs": "Ish markazlari",
    "cellsSub": "Bitta SAP kodini olib yurgan yacheykalar — brigadiri va smenasi bilan",
    "dupesSub": "Miqdori ikki brigadirga yozilgan (ish markazi + SKU) juftliklari "
                "— «Kun», ПЛАН va ФАКТ saqlangan butun tarix bo'yicha",
    "daysSub": "Har bir qo'sh yozilgan pp_daily qatori — xom dalil",
    "rowsWord": "qator",
}


def _title(rep: dict) -> tuple[str, str]:
    return ("SAP ish markazi yagona EMAS — yacheyka yagona",
            f"{_dmy(rep['from'].isoformat())} – {_dmy(rep['to'].isoformat())} · "
            "barcha zavodlar · ikkala smena")


def _scope(rep: dict) -> list[dict]:
    c = rep["counts"]
    return [
        {"label": "Ta'sir davri", "value":
            f"{_dmy(rep['from'].isoformat())} – {_dmy(rep['to'].isoformat())} — "
            "trudoyomkost shu davr uchun o'lchandi"},
        {"label": "Qo'sh yozish tarixi", "value":
            (f"{_dmy(c['first'])} – {_dmy(c['last'])} — saqlangan barcha kunlar"
             if c["first"] else "yo'q")},
        {"label": "Qamrov", "value": "Barcha brigadirlar · ikkala smena · barcha zavodlar"},
        {"label": "Hisoblash", "value":
            "Daqiqalar — zagruzka_source.wc_labor (загрузкаning o'z numeratori); "
            "bu yerda hech narsa qayta o'lchanmaydi"},
        {"label": "Bu hisobot", "value":
            "Faqat XABAR beradi — hech qanday raqamni o'zgartirmaydi"},
    ]


def _kpis(rep: dict) -> list[dict]:
    c = rep["counts"]
    return [
        {"value": c["cell_codes"], "label": "Ulashilgan ish markazi (yacheyka)",
         "color": INDIGO, "hint": f"{c['cell_codes_cross_shift']} tasi ikki smena orasida"},
        {"value": c["cat_wcs"], "label": "Ulashilgan ish markazi (katalog)",
         "color": AMBER, "hint": "ikki brigadirning katalogida"},
        {"value": c["dup_pairs"], "label": "Qo'sh yozilgan juftlik",
         "color": RED, "hint": "ish markazi + SKU"},
        {"value": c["hist_keys"], "label": "Qo'sh yozilgan kun-juftlik",
         "color": RED, "hint": f"jami {_fmt(c['hist_rows'])} qator"},
        {"value": c["hist_days"], "label": "Ta'sirlangan kun",
         "color": ORANGE, "hint": (f"{_dmy(c['first'])} – {_dmy(c['last'])}"
                                   if c["first"] else "—")},
        {"value": len(rep["cells"]), "label": "Ulashilgan yacheyka",
         "color": SLATE, "hint": f"{c['cat_wcs']} ish markazi katalogda ham"},
    ]


_WHY = (
    "Verifix kod bitta yacheykani bildiradi, SAP ish markazi esa bildirmaydi: "
    "ikki smena bir ish markazida ishlaydi. TUZATILDI (v4.92.0): ish markazi "
    "endi O'Z brigadirining yacheykasiga bog'lanadi — ilgari verifix bo'yicha "
    "birinchi yacheyka qaytardi (Raximova sahifasida B2911 → Yogmirovning "
    "2-smena yacheykasi 9121), /live da esa ikki smenaning REJA daqiqalari "
    "bitta yacheykaga qo'shilib ketardi. OCHIQ: SAP yuklamasi фаза faylni har "
    "bir brigadirning o'z ish markazlari va katalog SKU'lari bo'yicha kesadi, "
    "shuning uchun ikki katalogda turgan ish markazining KUNLIK BUTUN "
    "ПЛАН/ФАКТ i IKKALASIGA yoziladi. Fayl javob bera olmaydi: фаза qatorida "
    "odam, brigada, smena va VAQT yo'q (faqat sana), «Опер.» esa hech qayerda "
    "to'ldirilmagan. YECHIM: ulashilgan katalog qatorlarida «SAP "
    "avto-to'ldirish» ni o'chiring — yuklama u qatorlarga tegmaydi va har bir "
    "brigadir o'z smenasi qilgan qismini kiritadi."
)


def _summary_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    ws = _sheet(wb, L["shSummary"], {2: 34, 3: 12, 4: 16, 5: 16, 6: 16, 7: 12,
                                     8: 30, 9: 14, 10: 14, 11: 14, 12: 12, 13: 12})
    r = _banner(ws, 2, 2, 13, p["title"], p["subtitle"])
    r = _meta_strip(ws, r, 2, 13, p["scope"])
    r = _kpi_cards(ws, r, 2, p["kpis"])

    _unp_cell(ws, r, 2, _WHY, _fill(BRAND_SOFT), size=10)
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=13)
    ws.row_dimensions[r].height = 92
    r += 2

    if p["impact"]:
        r = _section(ws, r, 2, 13, L["impact"], L["impactHint"])
        head = r
        r = _unp_head(ws, r, 2, [(L["manager"], 34), (L["shift"], 12),
                                 (L["shared"], 16), (L["dup"], 16),
                                 (L["total"], 16), (L["pct"], 12),
                                 (L["wcs"], 30)])
        first = r
        for i, x in enumerate(p["impact"]):
            bg = _fill(PANEL if i % 2 == 0 else BAND)
            _unp_cell(ws, r, 2, _xl(x["manager"]), bg)
            _unp_cell(ws, r, 3, x["shift"], bg, align=CENTER)
            _unp_cell(ws, r, 4, x["shared"], bg, fmt=MIN, align=RIGHT)
            # The only figure on this sheet that is WRONG today, so it is the
            # only one wearing the alarm colour.
            _unp_cell(ws, r, 5, x["dup"] or None, bg, fmt=MIN, align=RIGHT,
                      bold=bool(x["dup"]), color=RED if x["dup"] else INK_SOFT)
            _unp_cell(ws, r, 6, x["total"], bg, fmt=MIN, align=RIGHT,
                      color=INK_SOFT)
            _unp_cell(ws, r, 7, (x["pct"] / 100.0) if x["pct"] is not None else None,
                      bg, fmt="0.0%", align=RIGHT)
            _unp_cell(ws, r, 8, _xl(", ".join(x["wcs"])), bg, size=9,
                      color=INK_SOFT)
            r += 1
        ws.print_title_rows = f"{head}:{head}"
        ws.freeze_panes = ws.cell(first, 2)


def _cells_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["wc"], 14), (L["cell"], 12), (L["manager"], 30), (L["shift"], 10),
            (L["factory"], 14), (L["leader"], 34), (L["inCatalog"], 13),
            (L["units"], 13), (L["shifts"], 12)]
    ws = _sheet(wb, L["shCells"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["cellsSub"])
    r = _section(ws, r, 2, last, L["shCells"],
                 f"{len(p['cells'])} {L['rowsWord']}")
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["cells"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["wc"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 3, _xl(x["code"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 4, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 5, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 6, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 7, _xl(x["leader"]), bg, size=9, color=INK_SOFT)
        _unp_cell(ws, r, 8, x["inCatalogLabel"], bg, align=CENTER, size=9,
                  color=GREEN if x["in_catalog"] else INK_SOFT)
        _unp_cell(ws, r, 9, x["units"], bg, fmt=NUM, align=RIGHT)
        # More than one SHIFT is the case this whole report is about, so it is
        # the one that is marked.
        _unp_cell(ws, r, 10, x["shifts"], bg, fmt=NUM, align=RIGHT,
                  bold=x["shifts"] > 1, color=AMBER if x["shifts"] > 1 else INK_SOFT)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 4)
    ws.print_title_rows = f"{head}:{head}"


def _dupes_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["wc"], 14), (L["sku"], 14), (L["name"], 34), (L["manager"], 30),
            (L["shift"], 10), (L["labor"], 14), (L["op"], 10), (L["auto"], 16),
            (L["days"], 10), (L["plan"], 14), (L["actual"], 14)]
    ws = _sheet(wb, L["shDupes"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["dupesSub"])
    r = _section(ws, r, 2, last, L["shDupes"],
                 f"{len(p['dupes'])} {L['rowsWord']} · "
                 "«Nomi» va «Trudoyomkost» bo'sh = bu brigadirda shu ish "
                 "markazida katalog qatori YO'Q, lekin miqdor yozilgan")
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["dupes"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _xl(x["wc"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 3, _xl(x["sku"]), bg, align=CENTER)
        _unp_cell(ws, r, 4, _xl(x["name"]), bg,
                  color=INK_SOFT if x["name"] else RED)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 7, x["labor"], bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 8, _xl(x["op"]), bg, align=CENTER, size=9,
                  color=INK_SOFT)
        # «Yo'q» here is the FIX already applied to that line, so it reads green.
        _unp_cell(ws, r, 9, x["autoLabel"], bg, align=CENTER, size=9,
                  color=(INK_SOFT if x["auto_fill"] is None
                         else (RED if x["auto_fill"] else GREEN)))
        _unp_cell(ws, r, 10, x["days"] or None, bg, fmt=NUM, align=RIGHT)
        _unp_cell(ws, r, 11, x["plan"] or None, bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 12, x["actual"] or None, bg, fmt=MIN, align=RIGHT)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 4)
    ws.print_title_rows = f"{head}:{head}"


def _days_sheet(wb: Workbook, p: dict) -> None:
    L = p["labels"]
    cols = [(L["date"], 12), (L["wc"], 14), (L["sku"], 14), (L["manager"], 30),
            (L["shift"], 10), (L["factory"], 14), (L["plan"], 14),
            (L["actual"], 14), (L["typed"], 16)]
    ws = _sheet(wb, L["shDays"], {}, landscape=True)
    last = 1 + len(cols)
    r = _banner(ws, 2, 2, last, p["title"], L["daysSub"])
    sub = f"{len(p['days'])} {L['rowsWord']}"
    if p.get("day_rows_capped"):
        sub += f" · {MAX_DAY_ROWS} qator bilan cheklandi"
    r = _section(ws, r, 2, last, L["shDays"], sub)
    head = r
    r = _unp_head(ws, r, 2, cols)
    first = r
    for i, x in enumerate(p["days"]):
        bg = _fill(PANEL if i % 2 == 0 else BAND)
        _unp_cell(ws, r, 2, _iso(x["date"]), bg, fmt=DATE_FMT, align=CENTER)
        _unp_cell(ws, r, 3, _xl(x["wc"]), bg, align=CENTER, bold=True)
        _unp_cell(ws, r, 4, _xl(x["sku"]), bg, align=CENTER)
        _unp_cell(ws, r, 5, _xl(x["manager"]), bg)
        _unp_cell(ws, r, 6, x["shift"], bg, align=CENTER)
        _unp_cell(ws, r, 7, _xl(x["factory"]), bg, align=CENTER)
        _unp_cell(ws, r, 8, x["plan"] or None, bg, fmt=MIN, align=RIGHT)
        _unp_cell(ws, r, 9, x["actual"] or None, bg, fmt=MIN, align=RIGHT)
        # A hand-typed value outranks the file, so such a row is NOT the
        # upload's doing and must not be read as evidence of it.
        _unp_cell(ws, r, 10, x["typedLabel"], bg, align=CENTER, size=9,
                  color=AMBER if x["typed"] else INK_SOFT)
        r += 1
    if r > first:
        ws.auto_filter.ref = f"B{head}:{get_column_letter(last)}{r - 1}"
    ws.freeze_panes = ws.cell(first, 5)
    ws.print_title_rows = f"{head}:{head}"


def build_workbook(p: dict) -> BytesIO:
    """`payload()`'s output as the four-sheet file. A formatter: it re-derives
    nothing, so the file, the caption and the DM can only ever state one set of
    numbers."""
    wb = Workbook()
    wb.remove(wb.active)
    _summary_sheet(wb, p)
    _cells_sheet(wb, p)
    _dupes_sheet(wb, p)
    _days_sheet(wb, p)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def payload(rep: dict) -> dict:
    """`collect`'s output in the shape `build_workbook` reads. Pure
    re-labelling — no figure is computed or rounded here, so the file, the
    caption and the register can only ever state one set of numbers."""
    title, subtitle = _title(rep)
    return {
        "labels": XLS_LABELS, "title": title, "subtitle": subtitle,
        "scope": _scope(rep), "kpis": _kpis(rep),
        "cells": [{**c, "inCatalogLabel": _yn(c["in_catalog"])}
                  for c in rep["cells"]],
        "dupes": [{**d, "autoLabel": _yn(d["auto_fill"])} for d in rep["dupes"]],
        "days": [{**d, "typedLabel": _yn(d["typed"])} for d in rep["dup_days"]],
        "impact": rep["impact"], "counts": rep["counts"],
        "day_rows_capped": rep["day_rows_capped"],
    }


def _caption(rep: dict) -> str:
    """Telegram caps a document caption at 1024 chars, so this is the finding
    and the figures that frame it — the file carries the rest."""
    c = rep["counts"]
    head = ("📊 <b>SAP ish markazi yagona EMAS — yacheyka yagona</b>\n"
            f"{_dmy(rep['from'].isoformat())} – {_dmy(rep['to'].isoformat())} · "
            "barcha brigadirlar · ikkala smena")
    lines = [
        head, "",
        f"🔵 <b>{c['cell_codes']}</b> ish markazi bir nechta brigadirning "
        f"yacheykasida ({c['cell_codes_cross_shift']} tasi ikki SMENA orasida)",
        f"🟠 <b>{c['cat_wcs']}</b> ish markazi bir nechta KATALOGDA",
        f"🔴 <b>{c['dup_pairs']}</b> (ish markazi + SKU) juftligi ikki "
        f"brigadirga qo'sh yozilgan — {_fmt(c['hist_keys'])} kun-juftlik, "
        f"{_fmt(c['hist_rows'])} qator, {c['hist_days']} kun"
        + (f" ({_dmy(c['first'])} – {_dmy(c['last'])})" if c["first"] else ""),
        "",
        "<i>«Xulosa» — nima bo'lgani va brigadirlarga ta'siri. «Yacheykalar» — "
        "bitta SAP kodini olib yurgan yacheykalar. «Qo'sh yozilgan» — miqdori "
        "ikki marta yozilgan juftliklar. «Kunlik dalil» — har bir qator "
        "alohida.</i>",
    ]
    return "\n".join(lines)[:1024]


def send_xlsx(db: Session, chat_id: int, date_from: date, date_to: date) -> int:
    """Build the workbook and DM it. Returns 1 on delivery.

    Deliberately NOT `xlsx_delivery.deliver_file`: that decides between a
    browser download and a Telegram DM from the REQUEST it was called on, and
    there is no request here — a boot job has one surface and it is the chat.
    """
    rep = collect(db, date_from, date_to)
    buf = build_workbook(payload(rep))
    name = (f"ulashilgan-ish-markazlari-{date_from.strftime('%d.%m.%Y')}-"
            f"{date_to.strftime('%d.%m.%Y')}.xlsx")
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
        data={"chat_id": chat_id, "caption": _caption(rep), "parse_mode": "HTML"},
        files={"document": (name, buf.getvalue(),
                            "application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet")},
        timeout=180)
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(j.get("description") or f"HTTP {r.status_code}")
    return 1
