"""The brigadir's day digest as a Rich-HTML body (sendRichMessage), and the
plain lines its classic DM degrades to.

Pure: handed `leader_unit_report.build`'s payload, it computes nothing, so the
table in the chat and the page behind its button cannot disagree about a row.

Top to bottom, in the order a brigadir reading it on a phone needs it:

  1. the heading, whose icon is the worst thing in the table;
  2. four facts — whose unit, which day, the unit's result, how many checklists
     came in — in the key/value table the other rich DMs use;
  3. on an update, WHAT CHANGED, with both sides: the reason a second message
     exists at all;
  4. the leaders, one row each, worst first — a name, a score, a state in words;
  5. the rejected tasks BY NAME, in the reader's language. The per-leader DM
     could print only numbers, because one template served every reader, and
     «№3, №7» sent the brigadir off to a checklist to find out what failed;
  6. where the evidence is.

Three columns and short names are deliberate. The table is read on a phone, and
a fourth column — or a patronymic — pushes the state, the part that asks the
brigadir to do something, off the right-hand edge.
"""
from __future__ import annotations

from collections import Counter
from html import escape

from app.services.leader_unit_report import NO_SCORE
from app.translit import transliterate

# One glyph per row state — the same set in the rich table, the plain fallback
# and that fallback's legend, so the two shapes of one message read alike.
ICON = {
    "rejected": "⚠️", "missing": "🚫", "open": "✏️", "error": "⚙️",
    "checking": "⏳", "noproof": "➖", "verified": "✅", "excluded": "⏸",
}

L = {
    "uz": {
        "title": "Liderlar hisoboti",
        "title_fix": "Liderlar hisoboti yangilandi",
        "sup": "Brigadir", "day": "Sana", "shift": "{n}-smena",
        "unit": "Brigada natijasi", "filed": "Topshirildi",
        "th_leader": "Lider", "th_score": "Baho", "th_state": "Holat",
        "st_verified": "{n} ta qabul qilindi",
        "st_rejected": "{n} ta rad etildi",
        "st_checking": "tekshirilmoqda",
        "st_missing": "topshirilmadi",
        "st_open": "yopilmagan",
        "st_error": "tekshirib bo'lmadi",
        "st_noproof": "dalil yo'q",
        "st_excluded": "hisobga olinmaydi",
        "gone": "hisobdan chiqdi",
        "changed": "Nima o'zgardi",
        "rejected_head": "Qabul qilinmagan vazifalar",
        "checking_note": "{n} ta hisobot hali tekshirilmoqda — natija o'zgarishi mumkin.",
        "zero": "Topshirilmagan cheklist brigada natijasiga 0% bo'lib kiradi.",
        "quote": ("Har bir liderning vazifalari, dalil rasmlari va AI xulosasi — "
                  "quyidagi tugmadagi hisobotda. Noto'g'ri qarorga e'tiroz ham "
                  "o'sha yerdan beriladi."),
    },
    "uz_cyrl": {
        "title": "Лидерлар ҳисоботи",
        "title_fix": "Лидерлар ҳисоботи янгиланди",
        "sup": "Бригадир", "day": "Сана", "shift": "{n}-смена",
        "unit": "Бригада натижаси", "filed": "Топширилди",
        "th_leader": "Лидер", "th_score": "Баҳо", "th_state": "Ҳолат",
        "st_verified": "{n} та қабул қилинди",
        "st_rejected": "{n} та рад этилди",
        "st_checking": "текширилмоқда",
        "st_missing": "топширилмади",
        "st_open": "ёпилмаган",
        "st_error": "текшириб бўлмади",
        "st_noproof": "далил йўқ",
        "st_excluded": "ҳисобга олинмайди",
        "gone": "ҳисобдан чиқди",
        "changed": "Нима ўзгарди",
        "rejected_head": "Қабул қилинмаган вазифалар",
        "checking_note": "{n} та ҳисобот ҳали текширилмоқда — натижа ўзгариши мумкин.",
        "zero": "Топширилмаган чеклист бригада натижасига 0% бўлиб киради.",
        "quote": ("Ҳар бир лидернинг вазифалари, далил расмлари ва AI хулосаси — "
                  "қуйидаги тугмадаги ҳисоботда. Нотўғри қарорга эътироз ҳам "
                  "ўша ердан берилади."),
    },
    "ru": {
        "title": "Отчёт лидеров",
        "title_fix": "Отчёт лидеров обновлён",
        "sup": "Бригадир", "day": "Дата", "shift": "{n}-я смена",
        "unit": "Итог бригады", "filed": "Сдано",
        "th_leader": "Лидер", "th_score": "Оценка", "th_state": "Статус",
        "st_verified": "принято: {n}",
        "st_rejected": "не принято: {n}",
        "st_checking": "на проверке",
        "st_missing": "не сдан",
        "st_open": "не закрыт",
        "st_error": "не проверено",
        "st_noproof": "нет фото",
        "st_excluded": "не учитывается",
        "gone": "не учитывается",
        "changed": "Что изменилось",
        "rejected_head": "Непринятые задачи",
        "checking_note": "Ещё на проверке: {n} — итог может измениться.",
        "zero": "Несданный чек-лист входит в итог бригады как 0%.",
        "quote": ("Задачи каждого лидера, фото-подтверждения и заключение ИИ — "
                  "в отчёте по кнопке ниже. Там же подаётся возражение на "
                  "ошибочное решение."),
    },
    "en": {
        "title": "Leaders' report",
        "title_fix": "Leaders' report updated",
        "sup": "Supervisor", "day": "Date", "shift": "shift {n}",
        "unit": "Unit result", "filed": "Filed",
        "th_leader": "Leader", "th_score": "Score", "th_state": "Status",
        "st_verified": "{n} accepted",
        "st_rejected": "{n} rejected",
        "st_checking": "in review",
        "st_missing": "not filed",
        "st_open": "not closed",
        "st_error": "not checked",
        "st_noproof": "no proofs",
        "st_excluded": "not counted",
        "gone": "no longer counted",
        "changed": "What changed",
        "rejected_head": "Rejected tasks",
        "checking_note": "{n} report(s) still in review — the result may change.",
        "zero": "A checklist nobody filed enters the unit result as 0%.",
        "quote": ("Each leader's tasks, proof photos and the AI's verdict are in "
                  "the report behind the button below. An objection to a wrong "
                  "ruling is filed from there too."),
    },
}


def _esc(v) -> str:
    """Element content only. `quote=False` keeps Uzbek apostrophes (yo'q,
    o'zgardi) literal — the `forecast_rich._esc` rule — and every attribute in
    this body is a literal, so nothing needs quote-escaping."""
    return escape(str(v), quote=False)


def short_person(name: str) -> str:
    """«Ruziyeva Iqbol Jurayevna» → «R. Iqbol». THE platform's rule —
    `utils/personName.js#shortPerson` — in Python; keep the two in step. A
    single-word name is left as it is: an initial on its own names nobody."""
    parts = str(name or "").split()
    if len(parts) < 2:
        return parts[0] if parts else ""
    return f"{parts[0][0].upper()}. {parts[1]}"


def _display(p: dict, diff: list[dict] | None, lang: str) -> dict[str, str]:
    """Stored name → how this message prints it, after `transliterate` (the
    `shortPerson` order: script first, then shorten). Two people of one table
    who would collapse onto one short form keep surname and first name in full —
    «R. Iqbol» twice names nobody."""
    people = {str(r["leader"] or "") for r in p["rows"]}
    people |= {str(c["leader"] or "") for c in (diff or [])}
    full = {n: (transliterate(n, lang) or n) for n in people}
    short = {n: (short_person(v) or v) for n, v in full.items()}
    clash = Counter(short.values())
    return {n: (short[n] if clash[short[n]] < 2
                else " ".join(full[n].split()[:2]))
            for n in people}


def _pick(names: dict | None, lang: str) -> str:
    names = names or {}
    return (names.get(lang) or names.get("ru") or names.get("uz")
            or names.get("en") or "")


def _state_words(r: dict, t: dict) -> str:
    c = r.get("counts") or {}
    if r["state"] == "verified":
        return t["st_verified"].format(n=c.get("checked", 0))
    if r["state"] == "rejected":
        return t["st_rejected"].format(n=c.get("rejected", 0))
    return t[f"st_{r['state']}"]


def _side(pair, t: dict, *, after: bool = False) -> str:
    """One side of a change: the score where one was printed, else the state."""
    if pair is None:
        return t["gone"] if after else "—"
    state, score = pair[0], pair[1]
    if score is not None:
        return f"{score}%"
    return t.get(f"st_{state}", "—").replace("{n}", "").strip()


def _title_icon(counts: dict) -> str:
    if counts["rejected"] or counts["missing"] or counts["open"] or counts["error"]:
        return "⚠️"
    if counts["checking"]:
        return "⏳"
    return "✅"


def body(p: dict, lang: str = "ru", diff: list[dict] | None = None) -> str:
    """The Rich-HTML body for ONE recipient language. `diff` is the update's
    `leader_unit_report.changes`, and None on the first send."""
    from app.routers.staff import _fmt_date

    t = L.get(lang) or L["ru"]
    counts = p["counts"]
    shown = _display(p, diff, lang)
    update = diff is not None

    def who(name) -> str:
        return _esc(shown.get(str(name or ""), name or "—"))

    def code(cell) -> str:
        return f" <code>{_esc(cell)}</code>" if cell else ""

    parts = [f"<h3>{'🔄' if update else _title_icon(counts)} "
             f"{_esc(t['title_fix'] if update else t['title'])}</h3>"]

    day = _fmt_date(p["date"], lang)
    if p.get("shift") is not None:
        day = f"{day} · {t['shift'].format(n=p['shift'])}"
    unit = f"{p['unitScore']}%" if p.get("unitScore") is not None else "—"
    parts.append(
        "<table bordered striped>\n"
        f'<tr><td>👥 {_esc(t["sup"])}</td><td align="right"><b>'
        f'{_esc(transliterate(p.get("supervisor") or "—", lang))}</b></td></tr>\n'
        f'<tr><td>📅 {_esc(t["day"])}</td><td align="right">{_esc(day)}</td></tr>\n'
        f'<tr><td>🎯 {_esc(t["unit"])}</td><td align="right"><b>{unit}</b></td></tr>\n'
        f'<tr><td>📨 {_esc(t["filed"])}</td><td align="right">'
        f'{p["submitted"]} / {p["owed"]}</td></tr>\n'
        "</table>")

    # WHAT CHANGED leads an update, above the table it changed: a second copy of
    # the table with no pointer to the difference is a spot-the-difference game.
    if update and diff:
        items = "\n".join(
            f"<li><b>{who(c['leader'])}</b>{code(c.get('cell'))}: "
            f"{_esc(_side(c['before'], t))} → "
            f"<b>{_esc(_side(c['after'], t, after=True))}</b></li>"
            for c in diff)
        parts.append(f"<h4>{_esc(t['changed'])}</h4>\n<ul>\n{items}\n</ul>")

    trs = []
    for r in p["rows"]:
        score = ("—" if r["state"] in NO_SCORE or r["score"] is None
                 else f"<b>{r['score']}%</b>")
        trs.append(f"<tr><td>{ICON[r['state']]} {who(r['leader'])}"
                   f"{code(r.get('cell'))}</td>"
                   f'<td align="right">{score}</td>'
                   f"<td>{_esc(_state_words(r, t))}</td></tr>")
    parts.append(
        "<table bordered striped>\n"
        f'<tr><th align="left">{_esc(t["th_leader"])}</th>'
        f'<th align="right">{_esc(t["th_score"])}</th>'
        f'<th align="left">{_esc(t["th_state"])}</th></tr>\n'
        + "\n".join(trs) + "\n</table>")

    if counts["checking"]:
        parts.append(f"<p>⏳ {_esc(t['checking_note'].format(n=counts['checking']))}</p>")

    flagged = [r for r in p["rows"]
               if r["state"] == "rejected" and r["rejectedTasks"]]
    if flagged:
        parts.append(f"<h4>❌ {_esc(t['rejected_head'])}</h4>")
        for r in flagged:
            tasks = "\n".join(
                f"<li>№{tk['id']} · {_esc(_pick(tk.get('name'), lang) or '—')}</li>"
                for tk in r["rejectedTasks"])
            parts.append(f"<p><b>{who(r['leader'])}</b>{code(r.get('cell'))}</p>\n"
                         f"<ul>\n{tasks}\n</ul>")

    note = t["quote"]
    if counts["missing"] or counts["open"]:
        note = f"{t['zero']} {note}"
    parts.append(f"<blockquote>{_esc(note)}</blockquote>")
    return "\n".join(parts)


# ── the classic fallback ─────────────────────────────────────────────────────

def classic_lines(p: dict) -> str:
    """The table as plain lines — a glyph, the name, the score and task NUMBERS
    only, so one string reads in all four languages; the template around it
    carries the legend."""
    out = []
    for r in p["rows"]:
        where = f" · {r['cell']}" if r.get("cell") else ""
        score = ("—" if r["state"] in NO_SCORE or r["score"] is None
                 else f"{r['score']}%")
        tasks = (" (" + ", ".join(f"№{tk['id']}" for tk in r["rejectedTasks"]) + ")"
                 if r["state"] == "rejected" and r["rejectedTasks"] else "")
        out.append(f"{ICON[r['state']]} {r['leader']}{where} — {score}{tasks}")
    return "\n".join(out)


def classic_changes(diff: list[dict] | None, sep: str = "\n") -> str:
    """The update's changes as plain text — numbers and glyphs, language-neutral
    for the reason `classic_lines` gives."""
    def side(pair) -> str:
        if pair is None:
            return "—"
        return f"{pair[1]}%" if pair[1] is not None else ICON.get(pair[0], "—")

    return sep.join(
        f"{c['leader']}{' · ' + str(c['cell']) if c.get('cell') else ''}: "
        f"{side(c['before'])} → {side(c['after'])}"
        for c in (diff or []))
