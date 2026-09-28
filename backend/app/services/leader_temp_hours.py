"""Temporary task hours — cells whose shift is moved for a few nights.

From **2026-09-28** (the operator's request): nine cells of Akbarov Tursunali's
and O'razov Asqar's units work 20:00–05:00 and two work 19:00–04:00 instead of
17:00–02:00 on the nights of 28.09 → 01.10 — shift 1 is not freeing the floor
before the 1 October holiday. Their leaders' checklist hours move with them, by
exactly as much as their start moved, and only on those nights:

* every task's photo window — and so, on these per-task units, the hour each
  task closes (`leader_close.closing_time` reads the window's end);
* every task's own `deadline`, where one is set;
* the hour of each AUTOMATIC check (tasks 1, 8, 9) — per LEADER, by the
  operator's explicit call, although that hour is otherwise a unit decision
  (`leader_auto._unit_due`).

**This is a dated rule, never a config edit, and that is the whole point.** A
window edit re-judges EVERY stored verdict of the task against the new hours
(`leader_ai.sync_date_flags` takes no date bound), so writing the moved hours
onto the chain for four nights would have re-scored every earlier night against
them, and taking them back afterwards would have re-scored these four against
the old ones. Here the move is a function of the NIGHT, so each night is judged
by the hours it was worked in, at every re-derive, forever.

Rules:

* **The request names CELLS; a checklist belongs to a LEADER.** Which leader
  owns each cell is FROZEN the first time a boot sees the request (`freeze`,
  one `AppSetting` row per request) — so a leader reassigned later can neither
  carry these nights onto somebody else nor take them away from whoever worked
  them. A cell with no leader then has no checklist to move and is only named.
* **NEVER delete a request whose nights have passed.** Every boot re-derives
  every verdict (`sync_leader_ai_dates`); without the entry those nights would
  be judged against the ordinary hours and lose points they earned.
* Hours move INSIDE the shift and never past its end: a window pushed beyond
  09:00 closes at 09:00 — the rule the 3 Sep leader overrides for cells 6821 and
  6822 follow — and a check hour stops there too.
* On an `accept_old` night (the first one: the leaders learned of the change
  that evening) a window runs from its OLD start to its NEW end, so a proof sent
  at either hour counts; the task still closes at the new end and a check still
  fires at the new hour — a later hour only ever gives more time.

Readers: `leader_tasks.effective_leader_config` (the bot, the camera, the web
checklist, «Vazifalar», every closing sweep), `leader_ai.date_rule_for` (the AI
reviewer), `leader_ai.sync_date_flags` and `routers/leader_ai._window` (every
verdict card), `leader_auto` (check hours and their warnings).
"""
from __future__ import annotations

import html
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models import AppSetting, Cell, Manager, RoleProfile

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Request:
    key: str                      # the AppSetting row the frozen leaders live in
    first: str                    # first night (ISO — the evening it opens)
    last: str                     # last night, inclusive
    cells: dict = field(default_factory=dict)   # code → (new start, new end, minutes later)
    accept_old: tuple = ()        # nights on which the old hours count as well
    reason: str = ""


_PLUS3 = ("20:00", "05:00", 180)
_PLUS2 = ("19:00", "04:00", 120)

REQUESTS: tuple[Request, ...] = (
    Request(
        key="leader_temp_hours_2026_09_28_v1",
        first="2026-09-28", last="2026-10-01",
        cells={"4321": _PLUS3, "4322": _PLUS3, "4323": _PLUS3, "4325": _PLUS3,
               "4326": _PLUS3, "4121": _PLUS3, "4122": _PLUS3, "4123": _PLUS3,
               "4124": _PLUS3, "4521": _PLUS2, "4221": _PLUS2},
        accept_old=("2026-09-28",),
        reason=("1 oktyabr bayrami: ish ko'pligi va birinchi smena ish joyini "
                "bo'shatmagani uchun kechki smena kechroq boshlanadi"),
    ),
)


class Moved(NamedTuple):
    minutes: int
    accept_old: bool


class _Rule(NamedTuple):
    first: str
    last: str
    minutes: int
    accept_old: frozenset


# ── reading ──────────────────────────────────────────────────────────────────

_TTL_S = 60.0
_cache: dict = {"at": float("-inf"), "rules": {}}


def _parse(value: str | None) -> dict:
    try:
        got = json.loads(value or "{}")
        return got if isinstance(got, dict) else {}
    except ValueError:
        return {}


def load(db: Session | None = None) -> dict[int, list[_Rule]]:
    """leader profile id → the dated moves frozen for them. One small query a
    minute at most; a failed read keeps serving the last answer."""
    now = time.monotonic()
    if now - _cache["at"] < _TTL_S:
        return _cache["rules"]
    own = db is None
    if own:
        from app.database import SessionLocal
        db = SessionLocal()
    try:
        rows = (db.query(AppSetting)
                .filter(AppSetting.key.in_([r.key for r in REQUESTS])).all())
    except Exception:
        logger.exception("temp hours: could not read the frozen requests")
        return _cache["rules"]
    finally:
        if own:
            db.close()
    rules: dict[int, list[_Rule]] = {}
    for row in rows:
        got = _parse(row.value)
        first, last = str(got.get("first") or ""), str(got.get("last") or "")
        old = frozenset(got.get("accept_old") or ())
        for lid, spec in (got.get("leaders") or {}).items():
            try:
                rules.setdefault(int(lid), []).append(
                    _Rule(first, last, int(spec.get("minutes") or 0), old))
            except (TypeError, ValueError, AttributeError):
                continue
    _cache.update(at=now, rules=rules)
    return rules


def for_leader(db: Session | None, leader_id: int | None, date) -> Moved | None:
    """How far this leader's checklist night is moved, or None — THE question."""
    if not leader_id or not date or not REQUESTS:
        return None
    d = str(date)[:10]
    for r in load(db).get(int(leader_id), ()):
        if r.minutes and r.first <= d <= r.last:
            return Moved(r.minutes, d in r.accept_old)
    return None


# ── moving hours inside a shift ──────────────────────────────────────────────

def _clock(shift: int | None, pos: int) -> str:
    """Minutes from the shift's opening → "HH:MM"."""
    from app.services import leader_ai
    m = (leader_ai._mins(leader_ai.shift_window(shift)[0]) + pos) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def move_window(shift: int | None, win, moved: Moved | None):
    """The window `moved.minutes` later, closing no later than the shift does.

    Measured in minutes from the shift's own opening (`leader_ai.window_span`),
    never on raw clocks — on a night shift «08:00» is fifteen hours in while
    «18:00» is one. A window that cannot move (already ending at the shift's
    close) is returned as it was."""
    from app.services import leader_ai
    if not moved or shift is None or not win or len(win) != 2:
        return win
    lo, hi = leader_ai.hhmm(win[0]), leader_ai.hhmm(win[1])
    if not lo or not hi:
        return win
    start, end = leader_ai.window_span(shift, (lo, hi))
    frame = leader_ai.shift_span_min(shift)
    new_end = min(end + moved.minutes, frame)
    if new_end <= end:
        return win
    new_start = start if moved.accept_old else start + moved.minutes
    if new_start >= new_end:
        new_start = start
    return _clock(shift, new_start), _clock(shift, new_end)


def move_clock(shift: int | None, clock: str | None, minutes: int) -> str | None:
    """A bare hour (a deadline, a check hour) `minutes` later, stopping at the
    shift's close. Seated like every other hour here, by `window_offset`."""
    from app.services import leader_ai
    c = leader_ai.hhmm(clock)
    if not c or not minutes or shift is None:
        return clock
    days = leader_ai.window_offset(shift, (c, c))
    pos = leader_ai._mins(c) + days * 1440 - leader_ai._mins(
        leader_ai.shift_window(shift)[0])
    frame = leader_ai.shift_span_min(shift)
    if pos < 0 or pos >= frame:
        return clock
    return _clock(shift, min(pos + minutes, frame))


def window_on(db: Session | None, leader_id, date, shift, win):
    """`win` as it stands for this leader's night — the one-line form for a
    reader holding a single row."""
    return move_window(shift, win, for_leader(db, leader_id, date))


def apply_to_config(db: Session, prof, shift: int | None, day, out: dict) -> None:
    """Move a resolved checklist (`effective_leader_config`'s answer) in place."""
    if shift is None or prof is None:
        return
    moved = for_leader(db, getattr(prof, "id", None), day)
    if not moved:
        return
    for entry in out.values():
        entry["window"] = move_window(shift, entry.get("window"), moved)
        if entry.get("deadline"):
            entry["deadline"] = move_clock(shift, entry["deadline"], moved.minutes)


# ── freezing the request onto leaders (boot) ─────────────────────────────────

def freeze(db: Session) -> list[dict]:
    """Resolve each not-yet-frozen request's cells to their leaders NOW and store
    it. Insert-only: a request already frozen is never re-resolved."""
    out = []
    for req in REQUESTS:
        if db.query(AppSetting).filter_by(key=req.key).first():
            continue
        cells = (db.query(Cell)
                 .filter(Cell.verifix_code.in_(list(req.cells))).all())
        found = {c.verifix_code for c in cells}
        leaders: dict[int, dict] = {}
        no_leader: list[str] = []
        for c in sorted(cells, key=lambda c: c.verifix_code):
            start, end, minutes = req.cells[c.verifix_code]
            if not c.leader_id:
                no_leader.append(c.verifix_code)
                continue
            spec = leaders.setdefault(int(c.leader_id), {
                "minutes": minutes, "start": start, "end": end, "cells": []})
            spec["cells"].append(c.verifix_code)
            if minutes > spec["minutes"]:       # two listed cells, two hours
                spec.update(minutes=minutes, start=start, end=end)
        for lid, spec in leaders.items():
            other = sorted(code for (code,) in db.query(Cell.verifix_code).filter(
                Cell.leader_id == lid,
                Cell.verifix_code.notin_(list(req.cells))).all())
            if other:
                spec["other_cells"] = other
            prof = db.query(RoleProfile).filter_by(id=lid).first()
            spec["name"] = prof.name if prof else ""
            spec["manager_id"] = prof.manager_id if prof else None
        value = {
            "first": req.first, "last": req.last,
            "accept_old": list(req.accept_old),
            "leaders": {str(k): v for k, v in leaders.items()},
            "no_leader": no_leader,
            "missing": sorted(set(req.cells) - found),
            "cell_units": {c.verifix_code: c.manager_id for c in cells},
            "frozen_at": datetime.now(timezone.utc).isoformat(),
        }
        db.add(AppSetting(key=req.key, value=json.dumps(value, ensure_ascii=False)))
        db.commit()
        _cache["at"] = float("-inf")
        out.append({"key": req.key, **value})
    return out


# ── telling people (boot, once) ──────────────────────────────────────────────

def _dm(date: str) -> str:
    return f"{date[8:10]}.{date[5:7]}"


def _next_night(date: str) -> str:
    return (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")


def _strict_night(req: Request) -> str:
    """A night judged by the NEW hours alone — what the leader is told."""
    d = req.first
    while d <= req.last:
        if d not in req.accept_old:
            return d
        d = _next_night(d)
    return req.first


_TXT = {
    "uz": {
        "title": "🕗 <b>Ish vaqtingiz vaqtincha o'zgardi</b>",
        "cell": "📍 <b>Yacheyka:</b> {cell}",
        "nights": "🌙 <b>Kechalar:</b> {first} – {last}",
        "hours": "⏰ <b>Ish vaqti:</b> {start} – {end}",
        "lead": "Chek-list vazifalaringiz vaqti ham {h} soatga surildi:",
        "auto": "avtomatik tekshiruv {t}",
        "old": "{first} kechasi eski vaqtda yuborilgan isbot ham hisoblanadi.",
        "late": "Ish boshlanishidan oldin yopilgan vazifani «Kechikkan isbot» orqali yuborishingiz mumkin.",
        "back": "{back} kechasidan boshlab vaqtlar odatdagidek.",
        "u_title": "🕗 <b>Liderlar ish vaqti vaqtincha o'zgardi</b>",
        "u_lead": "Shu liderlarning chek-list vazifalari va avtomatik tekshiruvlari vaqti ularning yangi ish vaqtiga qarab surildi:",
        "u_line": "{cell} · {name} — {start}–{end} (+{h} soat)",
        "u_none": "{cell} — lider biriktirilmagan",
        "u_rest": "Qolgan liderlaringiz odatdagi vaqtda.",
    },
    "uz_cyrl": {
        "title": "🕗 <b>Иш вақтингиз вақтинча ўзгарди</b>",
        "cell": "📍 <b>Ячейка:</b> {cell}",
        "nights": "🌙 <b>Кечалар:</b> {first} – {last}",
        "hours": "⏰ <b>Иш вақти:</b> {start} – {end}",
        "lead": "Чек-лист вазифаларингиз вақти ҳам {h} соатга сурилди:",
        "auto": "автоматик текширув {t}",
        "old": "{first} кечаси эски вақтда юборилган исбот ҳам ҳисобланади.",
        "late": "Иш бошланишидан олдин ёпилган вазифани «Кечиккан исбот» орқали юборишингиз мумкин.",
        "back": "{back} кечасидан бошлаб вақтлар одатдагидек.",
        "u_title": "🕗 <b>Лидерлар иш вақти вақтинча ўзгарди</b>",
        "u_lead": "Шу лидерларнинг чек-лист вазифалари ва автоматик текширувлари вақти уларнинг янги иш вақтига қараб сурилди:",
        "u_line": "{cell} · {name} — {start}–{end} (+{h} соат)",
        "u_none": "{cell} — лидер бириктирилмаган",
        "u_rest": "Қолган лидерларингиз одатдаги вақтда.",
    },
    "ru": {
        "title": "🕗 <b>Ваше рабочее время временно изменено</b>",
        "cell": "📍 <b>Ячейка:</b> {cell}",
        "nights": "🌙 <b>Ночи:</b> {first} – {last}",
        "hours": "⏰ <b>Рабочее время:</b> {start} – {end}",
        "lead": "Время задач вашего чек-листа тоже сдвинуто на {h} часа:",
        "auto": "автоматическая проверка в {t}",
        "old": "В ночь {first} засчитывается и подтверждение, отправленное в прежнее время.",
        "late": "Задачу, закрывшуюся до начала вашей смены, можно отправить через «Кечиккан исбот».",
        "back": "С ночи {back} время снова обычное.",
        "u_title": "🕗 <b>Рабочее время лидеров временно изменено</b>",
        "u_lead": "Время задач чек-листа и автоматических проверок этих лидеров сдвинуто под их новое рабочее время:",
        "u_line": "{cell} · {name} — {start}–{end} (+{h} ч)",
        "u_none": "{cell} — лидер не назначен",
        "u_rest": "Остальные лидеры работают в обычное время.",
    },
    "en": {
        "title": "🕗 <b>Your working hours have changed for a few nights</b>",
        "cell": "📍 <b>Cell:</b> {cell}",
        "nights": "🌙 <b>Nights:</b> {first} – {last}",
        "hours": "⏰ <b>Working hours:</b> {start} – {end}",
        "lead": "Your checklist task hours have moved {h} hours later too:",
        "auto": "automatic check at {t}",
        "old": "On the night of {first}, a proof sent at the old time counts as well.",
        "late": "A task that closed before your shift began can still be sent as a late proof («Kechikkan isbot»).",
        "back": "From the night of {back} the hours are back to normal.",
        "u_title": "🕗 <b>Leaders' working hours changed for a few nights</b>",
        "u_lead": "These leaders' checklist task hours and automatic checks moved with their new working hours:",
        "u_line": "{cell} · {name} — {start}–{end} (+{h} h)",
        "u_none": "{cell} — no leader assigned",
        "u_rest": "Your other leaders keep their usual hours.",
    },
}


def _t(lang: str) -> dict:
    return _TXT.get(lang) or _TXT["uz"]


def _task_lines(db: Session, prof, shift: int, night: str, lang: str) -> list[str]:
    """One line per enabled task of this leader, on a night of the NEW hours."""
    from app.services import leader_auto, leader_tasks
    cfg = leader_tasks.effective_leader_config(db, prof, shift, day=night)
    lines = []
    for tid, e in cfg.items():
        if not e.get("enabled"):
            continue
        name = html.escape(leader_tasks.config_name(e, lang) or f"#{tid}", quote=False)
        if leader_auto.is_auto(e):
            hour = leader_auto.check_hour(db, prof.manager_id, shift, tid, e,
                                          leader_id=prof.id, date=night)
            lines.append(f"• {name} — {_t(lang)['auto'].format(t=hour)}")
        else:
            lo, hi = (e.get("window") or ("", ""))[:2]
            lines.append(f"• {name} — {lo}–{hi}")
    return lines


def leader_html(db: Session, prof, shift: int, req: Request, spec: dict,
                lang: str) -> str:
    t = _t(lang)
    h = int(spec.get("minutes") or 0) // 60
    parts = [
        t["title"], "",
        t["cell"].format(cell=html.escape(", ".join(spec.get("cells") or []))),
        t["nights"].format(first=_dm(req.first), last=_dm(req.last)),
        t["hours"].format(start=spec.get("start"), end=spec.get("end")), "",
        t["lead"].format(h=h),
        *_task_lines(db, prof, shift, _strict_night(req), lang), "",
    ]
    notes = []
    if req.accept_old:
        notes.append(t["old"].format(first=_dm(req.accept_old[0])))
        notes.append(t["late"])
    notes.append(t["back"].format(back=_dm(_next_night(req.last))))
    parts.append("<blockquote>" + " ".join(notes) + "</blockquote>")
    return "\n".join(parts)


def _unit_lines(frozen: dict, mid: int, lang: str) -> list[str]:
    from app.translit import transliterate
    t = _t(lang)
    rows = []
    for spec in frozen.get("leaders", {}).values():
        if spec.get("manager_id") != mid:
            continue
        for code in spec.get("cells") or []:
            rows.append((code, t["u_line"].format(
                cell=code, name=html.escape(transliterate(spec.get("name") or "", lang) or "", quote=False),
                start=spec.get("start"), end=spec.get("end"),
                h=int(spec.get("minutes") or 0) // 60)))
    for code in frozen.get("no_leader") or []:
        if (frozen.get("cell_units") or {}).get(code) == mid:
            rows.append((code, t["u_none"].format(cell=code)))
    return ["• " + line for _, line in sorted(rows)]


def unit_html(frozen: dict, req: Request, mid: int, lang: str) -> str:
    t = _t(lang)
    notes = []
    if req.accept_old:
        notes.append(t["old"].format(first=_dm(req.accept_old[0])))
    notes.append(t["u_rest"])
    notes.append(t["back"].format(back=_dm(_next_night(req.last))))
    return "\n".join([
        t["u_title"], "",
        t["nights"].format(first=_dm(req.first), last=_dm(req.last)), "",
        t["u_lead"], *_unit_lines(frozen, mid, lang), "",
        "<blockquote>" + " ".join(notes) + "</blockquote>",
    ])


def notify(db: Session, req: Request) -> dict:
    """DM each frozen leader their new hours and each unit's brigadir who moved.
    Returns what was sent, for the admins' summary and the register."""
    from app import identity
    from app.routers import staff

    row = db.query(AppSetting).filter_by(key=req.key).first()
    frozen = _parse(row.value if row else None)
    sent = {"leaders": [], "units": [], "failed": []}
    first, last = _dm(req.first), _dm(req.last)
    back = _dm(_next_night(req.last))
    units: set[int] = set()
    for lid, spec in (frozen.get("leaders") or {}).items():
        prof = db.query(RoleProfile).filter_by(id=int(lid)).first()
        mgr = db.query(Manager).filter_by(id=prof.manager_id).first() if prof else None
        if prof is None or mgr is None:
            sent["failed"].append(spec.get("name") or lid)
            continue
        units.add(mgr.id)
        try:
            staff.notify_profile(
                db, identity.profile_key("leader", prof.id), "leader_temp_hours",
                {"cell": ", ".join(spec.get("cells") or []),
                 "start": spec.get("start"), "end": spec.get("end"),
                 "first": first, "last": last, "back": back,
                 "hours": int(spec.get("minutes") or 0) // 60},
                html_fn=lambda lang, p=prof, s=spec, sh=mgr.shift: leader_html(
                    db, p, sh, req, s, lang))
            sent["leaders"].append(spec.get("name") or lid)
        except Exception:
            logger.exception("temp hours: leader %s not told", lid)
            sent["failed"].append(spec.get("name") or lid)
    for code, mid in (frozen.get("cell_units") or {}).items():
        if mid:
            units.add(int(mid))
    for mid in sorted(units):
        mgr = db.query(Manager).filter_by(id=mid).first()
        try:
            staff.notify_profile(
                db, identity.profile_key("supervisor", mid), "leader_temp_hours_unit",
                {"first": first, "last": last,
                 "lines": "; ".join(line[2:] for line in _unit_lines(frozen, mid, "uz"))},
                html_fn=lambda lang, m=mid: unit_html(frozen, req, m, lang))
            sent["units"].append(mgr.name if mgr else str(mid))
        except Exception:
            logger.exception("temp hours: brigadir of unit %s not told", mid)
            sent["failed"].append(mgr.name if mgr else str(mid))
    return sent


def admin_summary(frozen: dict, req: Request, sent: dict) -> str:
    """What the admins are told once the request is frozen and announced."""
    esc = lambda v: html.escape(str(v), quote=False)
    lines = [f"🕗 <b>Vaqtincha ish vaqti: {_dm(req.first)} – {_dm(req.last)} kechalari</b>",
             ""]
    for spec in sorted((frozen.get("leaders") or {}).values(),
                       key=lambda s: (s.get("cells") or [""])[0]):
        h = int(spec.get("minutes") or 0) // 60
        extra = (f" (boshqa yacheykalari ham surildi: {', '.join(spec['other_cells'])})"
                 if spec.get("other_cells") else "")
        lines.append(esc(f"• {', '.join(spec.get('cells') or [])} · {spec.get('name')} "
                         f"— {spec.get('start')}–{spec.get('end')} (+{h} soat){extra}"))
    if frozen.get("no_leader"):
        lines.append(esc(f"Lider biriktirilmagan (chek-list yo'q): "
                         f"{', '.join(frozen['no_leader'])}"))
    if frozen.get("missing"):
        lines.append(esc(f"Reyestrda topilmadi: {', '.join(frozen['missing'])}"))
    lines += ["",
              esc(f"Vazifa oynalari, avtomatik tekshiruv soatlari va vazifalar yopilish "
                  f"vaqti faqat shu kechalar uchun surildi; 09:00 dan o'tmaydi. "
                  f"{_dm(req.accept_old[0]) + ' kechasi eski vaqt ham qabul qilinadi. ' if req.accept_old else ''}"
                  f"Oldingi kechalar o'z baholarida qoladi."),
              esc(f"Xabar yuborildi: {len(sent.get('leaders') or [])} lider, "
                  f"{len(sent.get('units') or [])} brigadir"
                  + (f"; yuborilmadi: {', '.join(map(str, sent['failed']))}"
                     if sent.get("failed") else ""))]
    return "\n".join(lines)
