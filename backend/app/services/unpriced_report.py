"""Why «Xarajat» could not price N minutes — the register behind the KPI card.

The «Narxlanmagan, daq» card on `/downtime` → «Xarajat» states a gap and names
nothing: 598 minutes over 2–8 September that kept their MINUTES and lost their
COST. This module answers the other half — *which* waiting, on whose shopfloor,
and which missing fact made it unpriceable — as one flat table, one row per
filed event.

**The subject is the (cell, day) PAIR, not the event.** `ojidaniya_cost._Acc.add`
prices a cell's whole day at once — the union of its stopped ranges times that
day's headcount times that day's rate — so "unpriced" is a property of a pair,
never of a single interval. A pair is unpriced when its headcount is unknown or
its day sits in no wage period; every event filed on such a pair is then
unpriced with it. This module therefore finds the pairs first and lists their
events second, which is why the row count is not the thing that adds up to the
card.

**Two totals, both named, for the reason the whole tab already carries two.**
The card's figure is the UNION per pair — a minute stopped for two causes is
paid once — while the rows listed under it are events, and two overlapping
events sum to more than the union they merge into. Printing only the union
leaves a table that visibly does not add up; printing only the sum overstates
the gap. Both ride on the report and each says what it is. Same rule
`UnitOjidaniyaModal` and the cost tab itself follow.

**Nothing is re-measured here.** The events come from `ojidaniya_cost._events`
(approved + stopped, the same two fixed predicates the tab applies), the union
from `ojidaniya_cost._union`, the headcount from `idle_source.cell_headcount`
— the very weight the unit's mean divides by — and the rate from
`wage_rate.resolver`. A second spelling of any of them is how a report about a
figure and the figure itself start disagreeing.

**The reason is diagnosed, not guessed.** `cell_people` reaches a work centre
through `Cell.sap_code` and skips a pin of 0 or less, so "no headcount" has
four distinct causes that need four different actions from four different
people. They are told apart against `zagruzka_source.typed_people`, which is
the same query `_n_by_cell` weighs the day with:

* the cell names no work centre at all — a registry fix, on `/cells/:id`;
* its work centre was typed by ANOTHER unit that day — the pin is on the wrong
  brigadir, so this cell can never see it;
* «Bugungi fakt» was typed as 0 — a real answer about people that is not a
  usable divisor;
* nobody typed anything — the ordinary case, fixed on `/production` →
  «Odamlar soni» for that work centre and that day.

Sent as ONE Telegram rich message (Bot API 10.1 `sendRichMessage`), split
across several when the table outgrows the 32 768-character envelope, with a
plain `sendMessage` fallback so a client or an API that refuses rich still
delivers the numbers. Delivery is the caller's business — see
`startup.report_unpriced_ojidaniya`, which fires it once behind a flag.
"""
from __future__ import annotations

import html
import json
from collections import defaultdict
from datetime import date
from typing import Optional

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell, Factory, Manager, RoleProfile
from app.services import (idle_intervals, idle_source, ojidaniya_cost,
                          wage_rate, zagruzka_source)

# A period this size is tens of events, not thousands; the cap exists so a
# misaimed call can never try to render a year into a chat.
MAX_ROWS = 400
# Telegram's envelope is 32 768 UTF-8 chars / 500 blocks. The row cap is set
# against the BLOCK budget, not the character one: the grammar does not say
# whether a `<td>` counts as a block, so it is assumed to — 25 rows × 16 columns
# plus the header and the summary is ~430, comfortably inside 500 either way.
# Over-splitting costs one extra message; guessing the other way costs the
# report.
_MAX_ROWS_PER_MSG = 25
_MAX_CHARS = 20000

# Why a (cell, day) could not be priced. Keys are stable; the text is what the
# reader acts on, so each names the surface the fix lives on.
REASONS = {
    "no_rate": "Ish haqi stavkasi yo'q (o'sha kunga davr belgilanmagan)",
    "no_sap": "Yacheykaga SAP ish markazi biriktirilmagan (/cells)",
    "other_unit": "Ish markazi o'sha kuni BOSHQA brigadirda kiritilgan",
    "typed_zero": "«Bugungi fakt» 0 kiritilgan (bo'luvchi bo'la olmaydi)",
    "not_typed": "«Bugungi fakt» kiritilmagan (/production → Odamlar soni)",
}


def _cat_labels() -> dict:
    """Stored category name → (code, full Uzbek label).

    Imported lazily and defensively: `ojidaniya_deck` pulls in python-pptx at
    module scope, and a report about missing numbers must not be the thing that
    fails because a slide library is missing. Reused rather than re-listed —
    that module is the backend's one copy of the `downtime.cat.*` uz bundle.
    """
    try:
        from app.services.ojidaniya_deck import CATS
        return {name: (code, full) for name, code, _short, full in CATS}
    except Exception:
        return {}


def _fmt(n: float, dec: int = 0) -> str:
    """Uzbek number formatting: space thousands, comma decimal."""
    s = f"{n:,.{dec}f}".replace(",", " ")
    return s.replace(".", ",") if dec else s


def _dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}"


def collect(db: Session, date_from: date, date_to: date) -> dict:
    """Every event sitting on a (cell, day) the «Xarajat» tab could not price.

    The scope is the whole plant with no narrowing — every non-archived unit,
    both shifts, every factory and every category — i.e. exactly what
    `_cost_scope` resolves for an admin who has picked no filters, which is the
    view the KPI card was read off.
    """
    managers = {m.id: m for m in
                db.query(Manager).filter(Manager.archived.is_(False)).all()}
    factories = {f.id: (f.code or f.name_ru or f.name_uz or "")
                 for f in db.query(Factory).all()}
    cells = ojidaniya_cost._cells_of(db, managers)
    leaders = ojidaniya_cost._leader_names(db, cells)
    by_cell = {c.id: c for c in cells}

    # Per-cell pricing only reaches days the typed headcount reaches; the same
    # two gates `ojidaniya_cost.build` applies, in the same order.
    cell_from = max(date_from, zagruzka_source.ZAGRUZKA_FROM)
    units = idle_source.cell_units(db)
    all_days = ojidaniya_cost._days(cell_from, date_to)
    ok_days = {mid: {d.isoformat() for d in all_days
                     if idle_source.uses_cells(units, mid, d)}
               for mid in managers}
    wanted = sorted({d for s in ok_days.values() for d in s})

    events = [e for e in ojidaniya_cost._events(db, cells, wanted)
              if by_cell.get(e.cell_id) is not None
              and e.date in ok_days.get(by_cell[e.cell_id].manager_id, ())]

    hc = idle_source.cell_headcount(db, cells, cell_from, date_to)
    rate_for = wage_rate.resolver(wage_rate.load(db))
    # The pins themselves, to tell the four "no headcount" causes apart.
    pins = zagruzka_source.typed_people(db, list(managers), cell_from, date_to)
    # Every unit that typed this work centre on this day, whoever it was — a
    # pin on the wrong brigadir is invisible to the cell and looks like silence.
    wc_days = defaultdict(set)
    for (mid, day, wc) in pins:
        wc_days[(day, wc)].add(mid)

    per_pair = defaultdict(list)
    for e in events:
        per_pair[(e.cell_id, e.date)].append(e)

    rows: list[dict] = []
    pairs = 0
    union_total = 0
    by_reason: dict[str, dict] = defaultdict(lambda: {"minutes": 0, "pairs": 0})
    by_cat: dict[str, int] = defaultdict(int)
    labels = _cat_labels()

    for (cid, day), evs in sorted(per_pair.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        cell = by_cell[cid]
        n = hc.get((cid, day))
        rate = rate_for(date.fromisoformat(day))
        if n is not None and rate is not None:
            continue                      # priced — not this report's subject

        minutes = ojidaniya_cost._union(evs)
        if minutes <= 0:
            continue

        wc = (cell.sap_code or "").strip()
        mid = int(cell.manager_id) if cell.manager_id is not None else None
        if rate is None:
            reason = "no_rate"
        elif not wc:
            reason = "no_sap"
        elif (mid, day, wc) in pins:
            # A pin exists for this very unit and day, so `cell_people` dropped
            # it — which it only ever does for a figure of 0 or less.
            reason = "typed_zero"
        elif wc_days.get((day, wc)):
            reason = "other_unit"
        else:
            reason = "not_typed"

        pairs += 1
        union_total += minutes
        by_reason[reason]["minutes"] += minutes
        by_reason[reason]["pairs"] += 1

        m = managers.get(mid) if mid is not None else None
        for e in sorted(evs, key=lambda r: idle_intervals.to_min(r.start) or 0):
            em = idle_intervals.duration(e.start, e.end)
            by_cat[e.category or ""] += em
            code, full = labels.get(e.category or "", ("", e.category or ""))
            rows.append({
                "date": day,
                "shift": (m.shift if m else None),
                "factory": factories.get(m.factory_id, "") if m else "",
                "manager": (m.name if m else ""),
                "leader": leaders.get(cell.leader_id) or "",
                "code": cell.verifix_code or "",
                "wc": wc,
                "cat": code or (e.category or ""),
                "cat_name": full,
                "start": e.start,
                "end": e.end,
                "minutes": em,
                "day_minutes": minutes,
                # Whitespace collapsed, never truncated: a raw \n does not break
                # a line in rich HTML anyway, and a clipped note is exactly the
                # evidence somebody would open the page to read.
                "note": " ".join((e.note or "").split()),
                "reason": reason,
            })

    rows.sort(key=lambda r: (r["date"], r["manager"], r["code"],
                             idle_intervals.to_min(r["start"]) or 0))
    truncated = len(rows) > MAX_ROWS
    if truncated:
        rows = rows[:MAX_ROWS]

    return {
        "from": date_from, "to": date_to,
        "rows": rows,
        "truncated": truncated,
        "union_minutes": union_total,
        "sum_minutes": sum(r["minutes"] for r in rows),
        "pairs": pairs,
        "cells": len({(r["code"]) for r in rows}),
        "managers": len({(r["manager"]) for r in rows}),
        "days": len({r["date"] for r in rows}),
        "by_reason": dict(by_reason),
        "by_cat": dict(by_cat),
    }


# ── rendering ────────────────────────────────────────────────────────────────
# 16 columns, inside Telegram's 20-column ceiling. Every fact the register holds
# about an event is one, because the operator asked to be able to act on any of
# them without opening the page.
_HEAD = ["№", "Sana", "Smena", "Zavod", "Brigadir", "Lider", "Yacheyka",
         "Ish markazi", "Toifa", "Toifa nomi", "Boshl.", "Tug.", "Daq",
         "Kun jami", "Izoh", "Nega narxlanmadi"]


def _esc(v) -> str:
    return html.escape("" if v is None else str(v), quote=False)


def _cells_html(r: dict, no: int) -> str:
    vals = [
        no, _dmy(r["date"]), r["shift"] or "—", r["factory"] or "—",
        r["manager"] or "—", r["leader"] or "—", r["code"] or "—",
        r["wc"] or "—", r["cat"] or "—", r["cat_name"] or "—",
        r["start"], r["end"], r["minutes"], r["day_minutes"],
        r["note"] or "—", REASONS.get(r["reason"], r["reason"]),
    ]
    return "<tr>" + "".join(f"<td>{_esc(v)}</td>" for v in vals) + "</tr>"


def _summary(rep: dict) -> str:
    """The header block: what the gap is, what it is made of, and the one
    sentence that stops the two totals reading as a contradiction."""
    d1, d2 = rep["from"], rep["to"]
    period = f"{d1.strftime('%d.%m.%Y')} – {d2.strftime('%d.%m.%Y')}"
    u, s = rep["union_minutes"], rep["sum_minutes"]

    out = [
        "<h3>Narxlanmagan ojidaniya</h3>",
        f"<p><b>{_esc(period)}</b> · barcha zavodlar · ikkala smena · "
        "barcha toifalar (Cat H ham) · faqat to'xtagan holatlar</p>",
    ]
    if not rep["rows"]:
        out.append("<p>Bu davrda narxlanmagan ojidaniya <b>yo'q</b> — har bir "
                   "yacheyka-kun uchun odam soni ham, stavka ham topildi.</p>")
        return "".join(out)

    out += [
        f"<p>🔴 <b>{_esc(_fmt(u))} daq</b> ({_esc(_fmt(u / 60.0, 1))} soat) "
        "narxlanmagan — «Xarajat» varag'idagi «Narxlanmagan, daq» kartasi "
        "aynan shu raqam.</p>",
        "<ul>"
        f"<li>{_esc(rep['pairs'])} ta yacheyka-kun · "
        f"{_esc(rep['cells'])} yacheyka · {_esc(rep['managers'])} brigadir · "
        f"{_esc(rep['days'])} kun</li>"
        f"<li>{_esc(len(rep['rows']))} ta yozuv (quyidagi jadvalning qatorlari), "
        f"yig'indisi {_esc(_fmt(s))} daq</li>"
        "</ul>",
    ]
    if s != u:
        out.append(
            f"<p><i>Nega {_esc(_fmt(s))} ≠ {_esc(_fmt(u))}?</i> Kartadagi raqam "
            "— har bir yacheyka-kunning <b>birlashmasi</b> (union): bir daqiqa "
            "ikki sabab bilan yozilgan bo'lsa ham bir marta sanaladi. Jadvaldagi "
            f"qatorlar esa alohida yozuvlar, ular ustma-ust tushgani uchun "
            f"{_esc(_fmt(s - u))} daq ortiq chiqadi.</p>")

    out.append("<p><b>Sabablari</b></p><ul>")
    for key, agg in sorted(rep["by_reason"].items(),
                           key=lambda kv: -kv[1]["minutes"]):
        out.append(f"<li><b>{_esc(_fmt(agg['minutes']))} daq</b> "
                   f"({_esc(agg['pairs'])} yacheyka-kun) — "
                   f"{_esc(REASONS.get(key, key))}</li>")
    out.append("</ul>")

    if rep["by_cat"]:
        top = sorted(rep["by_cat"].items(), key=lambda kv: -kv[1])
        chips = " · ".join(f"{_esc(k or '—')} {_esc(_fmt(v))} daq" for k, v in top)
        out.append(f"<p><b>Toifalar bo'yicha</b> (yozuvlar yig'indisi): {chips}</p>")

    if rep["truncated"]:
        out.append(f"<p>⚠️ Jadval {MAX_ROWS} qator bilan cheklandi.</p>")
    return "".join(out)


def render(rep: dict) -> list[str]:
    """The report as Telegram rich-HTML messages, split to fit the envelope.

    A slice is a whole `<table>` of its own with the header row repeated, so a
    reader who scrolls to the third message is never looking at unlabelled
    columns.
    """
    head = "<tr>" + "".join(f"<th>{_esc(h)}</th>" for h in _HEAD) + "</tr>"
    rows = rep["rows"]
    if not rows:
        return [_summary(rep)]

    slices: list[list[str]] = [[]]
    size = 0
    for i, r in enumerate(rows, 1):
        cell = _cells_html(r, i)
        if slices[-1] and (len(slices[-1]) >= _MAX_ROWS_PER_MSG
                           or size + len(cell) > _MAX_CHARS):
            slices.append([])
            size = 0
        slices[-1].append(cell)
        size += len(cell)

    total = len(slices)
    out = []
    for n, part in enumerate(slices, 1):
        pre = _summary(rep) if n == 1 else (
            f"<p><b>Narxlanmagan ojidaniya — davomi {n}/{total}</b></p>")
        cap = (f"<caption>Har bir yozuv alohida qator · {n}/{total}</caption>"
               if total > 1 else "<caption>Har bir yozuv alohida qator</caption>")
        tail = ("<p><i>«Kun jami» — o'sha yacheykaning o'sha kundagi birlashgan "
                "to'xtash vaqti, ya'ni kartaga qo'shilgan raqam. «Daq» — shu "
                "yozuvning o'zi.</i></p>") if n == total else ""
        out.append(pre + f"<table bordered striped>{cap}{head}"
                   + "".join(part) + "</table>" + tail)
    return out


def _plain(rep: dict) -> list[str]:
    """Fallback for a client or an API that refuses rich messages: the same
    rows as plain HTML lines. A 16-column table cannot survive `<pre>` on a
    phone, so the fallback trades the grid for one labelled block per event —
    it must still be readable, not merely delivered."""
    lines = [f"<b>Narxlanmagan ojidaniya</b> "
             f"{rep['from'].strftime('%d.%m.%Y')} – {rep['to'].strftime('%d.%m.%Y')}",
             f"Jami: <b>{_fmt(rep['union_minutes'])} daq</b> · "
             f"{rep['pairs']} yacheyka-kun · {len(rep['rows'])} yozuv", ""]
    for i, r in enumerate(rep["rows"], 1):
        lines.append(
            f"{i}. {_dmy(r['date'])} · sm.{r['shift'] or '—'} · "
            f"{_esc(r['manager'])} / {_esc(r['leader'] or '—')} · "
            f"<b>{_esc(r['code'])}</b> (IM {_esc(r['wc'] or '—')}) · "
            f"{_esc(r['cat'])} {_esc(r['cat_name'])} · "
            f"{_esc(r['start'])}–{_esc(r['end'])} = <b>{r['minutes']} daq</b> "
            f"(kun jami {r['day_minutes']}) · {_esc(r['note'] or '—')} · "
            f"{_esc(REASONS.get(r['reason'], r['reason']))}")
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
    """Compute and DM the report. Returns how many messages landed.

    Rich first, because that is what carries a table. On the FIRST message
    failing it degrades to plain `sendMessage` for the whole report rather than
    per part — a report half rich and half plain is worse than either. A
    partial send still counts: the caller decides whether that is enough to
    stop retrying.
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
        print(f"[unpriced-report] rich send failed ({exc}); falling back to plain")

    for text in _plain(rep):
        _api("sendMessage", {"chat_id": chat_id, "text": text,
                             "parse_mode": "HTML"})
        sent += 1
    return sent
