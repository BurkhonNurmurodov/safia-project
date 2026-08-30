"""
Telegram-native approval for staff/HR admin requests.

Every staff edit/delete request, bulk-delete batch and HR document is sent to
each admin as a Telegram message carrying inline ✅/❌ buttons plus the full
request detail in the body. A people-exchange addressed to a unit is also sent
to its RECEIVING supervisor — they confirm the incoming transfer inline exactly
like an admin. When ANY approval path runs — a Telegram tap here, or an
admin/shift-manager/supervisor deciding in the web app — the shared decision
core calls :func:`edit_admin_notices`, which edits every recipient's message
with the outcome and drops its buttons, so the buttons can never go stale.

Registrations keep their own machinery in ``telegram_bot`` (RegistrationNotice
+ notify_admins_of_decision); this module covers the kinds that previously had
no Telegram message tracking at all.

Import discipline: this module imports ``bot``/helpers from ``telegram_bot`` at
load time, but staff cores only lazily inside functions — ``telegram_bot`` and
``routers.staff`` never import this module at load time, so there is no cycle.
"""
import logging
from datetime import date

from app.config import settings
from app.database import SessionLocal
from app.models import ApprovalNotice, Attendance, Manager, TelegramUserRole
from app.services import action_log, cell_exchange

logger = logging.getLogger(__name__)


class AlreadyHandled(Exception):
    """Raised when a request was already decided (race between two admins, or
    decided in the web app). The callback answers with a soft toast."""


# ── i18n ────────────────────────────────────────────────────────────────────

_KIND_CODE = {"edit_request": "er", "edit_batch": "eb", "hr_document": "hr",
              "leader_late": "ll", "leader_dispute": "ld"}
_CODE_KIND = {v: k for k, v in _KIND_CODE.items()}

_MONTHS = {
    "uz": ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul",
           "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
    "ru": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
           "августа", "сентября", "октября", "ноября", "декабря"],
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
}

_LABELS = {
    "uz": {
        "hdr_edit":      "✏️ Tahrirlash so'rovi",
        "hdr_delete":    "🗑 O'chirish so'rovi",
        "hdr_bulk":      "🗑 Ommaviy o'chirish so'rovi",
        "hdr_role":      "📋 Lavozim o'zgarishi hujjati",
        "hdr_exchange":  "🔄 Xodim almashinuvi hujjati",
        # Cell-level exchange: the two identity blocks, the shift label, the
        # «no leader» word and the sandbox chip. Each of them is resolved HERE,
        # at render time, in the reader's own language — never baked into a
        # payload, or the filer's language would be frozen onto the card.
        "from_block":    "Kimdan",
        "to_block":      "Kimga",
        "shift":         "Smena",
        "no_leader":     "Biriktirilmagan",
        "test_chip":     "🧪 TEST — hech qanday davomat yozuvi ko'chirilmaydi",
        "hdr_late":      "⏰ Kechikkan hisobotni ochish so'rovi",
        "hdr_dispute":   "⚖️ AI qaroriga norozilik",
        "task":          "Vazifa",
        "ai_verdict":    "AI xulosasi",
        "dispute_note":  "Tasdiqlansa, vazifa yana bajarilgan deb hisoblanadi va kun bahosi qayta hisoblanadi. Rad etilsa, AI qarori kuchida qoladi.",
        "leader":        "Lider",
        "filed_at":      "Yuborilgan",
        "score":         "Natija",
        "reason":        "Sabab",
        "late_note":     "Bu kun ayni paytda 0% bilan hisoblanmoqda. Tasdiqlansa, o'z natijasi bilan hisoblanadi va kechikkan deb belgilanib qoladi.",
        "cancelled_by":  "↩️ So'rov qaytarib olindi",
        "unit":          "Bo'lim",
        "date":          "Sana",
        "supervisor":    "Brigadir",
        "creator":       "Yuborgan",
        "sup_case":      "Brigadir izohi",
        "worker":        "Xodim",
        "workers":       "Xodimlar",
        "new_role":      "Yangi lavozim",
        "target":        "Manzil",
        "time":          "Vaqt",
        "count":         "Soni",
        "delete_marker": "❗️ Yozuv o'chiriladi. Joriy ma'lumotlar:",
        "changes":       "O'zgarishlar",
        "f_job_title":   "Lavozim",
        "f_schedule":    "Jadval",
        "f_hours_worked": "Soatlar",
        "approve":       "✅ Tasdiqlash",
        "reject":        "❌ Rad etish",
        "open_panel":    "👥 Panelda ochish",
        "approved_by":   "✅ Tasdiqlandi",
        "rejected_by":   "❌ Rad etildi",
        "more":          "yana {n} ta",
        "toast_approved": "✅ Tasdiqlandi",
        "toast_rejected": "❌ Rad etildi",
        "toast_already":  "Bu so'rov allaqachon ko'rib chiqilgan",
        "toast_no_rights": "Sizda bu so'rovni ko'rib chiqish huquqi yo'q",
        "toast_error":    "Xatolik yuz berdi",
    },
    "ru": {
        "hdr_edit":      "✏️ Запрос на редактирование",
        "hdr_delete":    "🗑 Запрос на удаление",
        "hdr_bulk":      "🗑 Массовый запрос на удаление",
        "hdr_role":      "📋 Документ смены должности",
        "hdr_exchange":  "🔄 Документ обмена сотрудниками",
        "from_block":    "Откуда",
        "to_block":      "Куда",
        "shift":         "Смена",
        "no_leader":     "Не назначен",
        "test_chip":     "🧪 ТЕСТ — ни одна запись посещаемости не переносится",
        "hdr_late":      "⏰ Запрос на открытие опоздавшего отчёта",
        "hdr_dispute":   "⚖️ Возражение на решение ИИ",
        "task":          "Задача",
        "ai_verdict":    "Заключение ИИ",
        "dispute_note":  "При одобрении задача снова засчитывается и оценка дня пересчитывается. При отклонении решение ИИ остаётся в силе.",
        "leader":        "Лидер",
        "filed_at":      "Отправлено",
        "score":         "Результат",
        "reason":        "Причина",
        "late_note":     "Сейчас этот день считается как 0%. После одобрения он засчитается со своим результатом и останется отмеченным как опоздавший.",
        "cancelled_by":  "↩️ Запрос отозван",
        "unit":          "Бригада",
        "date":          "Дата",
        "supervisor":    "Бригадир",
        "creator":       "Отправитель",
        "sup_case":      "Комментарий бригадира",
        "worker":        "Сотрудник",
        "workers":       "Сотрудники",
        "new_role":      "Новая должность",
        "target":        "Назначение",
        "time":          "Время",
        "count":         "Кол-во",
        "delete_marker": "❗️ Запись будет удалена. Текущие данные:",
        "changes":       "Изменения",
        "f_job_title":   "Должность",
        "f_schedule":    "График",
        "f_hours_worked": "Часы",
        "approve":       "✅ Одобрить",
        "reject":        "❌ Отклонить",
        "open_panel":    "👥 Открыть в панели",
        "approved_by":   "✅ Одобрено",
        "rejected_by":   "❌ Отклонено",
        "more":          "ещё {n}",
        "toast_approved": "✅ Одобрено",
        "toast_rejected": "❌ Отклонено",
        "toast_already":  "Этот запрос уже обработан",
        "toast_no_rights": "У вас нет прав обрабатывать этот запрос",
        "toast_error":    "Произошла ошибка",
    },
    "en": {
        "hdr_edit":      "✏️ Edit request",
        "hdr_delete":    "🗑 Delete request",
        "hdr_bulk":      "🗑 Bulk delete request",
        "hdr_role":      "📋 Role change document",
        "hdr_exchange":  "🔄 Worker exchange document",
        "from_block":    "From",
        "to_block":      "To",
        "shift":         "Shift",
        "no_leader":     "Unassigned",
        "test_chip":     "🧪 TEST — no attendance row is moved",
        "hdr_late":      "⏰ Request to open a late report",
        "hdr_dispute":   "⚖️ Objection to an AI ruling",
        "task":          "Task",
        "ai_verdict":    "AI verdict",
        "dispute_note":  "Approving counts the task as done again and re-scores the day. Refusing leaves the AI ruling in force.",
        "leader":        "Leader",
        "filed_at":      "Filed",
        "score":         "Score",
        "reason":        "Reason",
        "late_note":     "This day currently counts as 0%. Once approved it counts at its own score and stays flagged as late.",
        "cancelled_by":  "↩️ Request withdrawn",
        "unit":          "Unit",
        "date":          "Date",
        "supervisor":    "Supervisor",
        "creator":       "Submitted by",
        "sup_case":      "The brigadir's case",
        "worker":        "Worker",
        "workers":       "Workers",
        "new_role":      "New role",
        "target":        "Target",
        "time":          "Time",
        "count":         "Count",
        "delete_marker": "❗️ Record will be deleted. Current data:",
        "changes":       "Changes",
        "f_job_title":   "Job title",
        "f_schedule":    "Schedule",
        "f_hours_worked": "Hours",
        "approve":       "✅ Approve",
        "reject":        "❌ Reject",
        "open_panel":    "👥 Open in panel",
        "approved_by":   "✅ Approved",
        "rejected_by":   "❌ Rejected",
        "more":          "{n} more",
        "toast_approved": "✅ Approved",
        "toast_rejected": "❌ Rejected",
        "toast_already":  "This request was already handled",
        "toast_no_rights": "You are not allowed to handle this request",
        "toast_error":    "Something went wrong",
    },
}

_MAX_LIST = 30  # cap long worker lists so the message stays under Telegram's 4096-char limit


def _norm(lang: str) -> str:
    if lang in ("uz", "uz_cyrl"):
        return "uz"
    return lang if lang in _LABELS else "uz"


def _L(lang: str, key: str) -> str:
    nl = _norm(lang)
    return _LABELS[nl].get(key) or _LABELS["uz"].get(key, key)


def _fmt_date(d, lang: str) -> str:
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d)
        except ValueError:
            return str(d)
    nl = _norm(lang)
    month = _MONTHS[nl][d.month - 1]
    return f"{month} {d.day}, {d.year}" if nl == "en" else f"{d.day} {month} {d.year}"


def _v(value) -> str:
    """Render a field value, blank/None → em dash."""
    if value is None or value == "":
        return "—"
    return str(value)


def _capped(items: list, lang: str) -> list[str]:
    """Render a list with a '+N more' tail when it is too long for one message."""
    if len(items) <= _MAX_LIST:
        return list(items)
    head = items[:_MAX_LIST]
    head.append("… " + _L(lang, "more").format(n=len(items) - _MAX_LIST))
    return head


# ── Data builders (no localisation — pure request facts) ──────────────────────

def _edit_request_data(db, req) -> dict:
    mgr = db.query(Manager).filter_by(id=req.manager_id).first()
    changes  = req.changes or {}
    original = req.original or {}
    is_delete = changes.get("_action") == "delete"
    diffs = []
    if not is_delete:
        for f in ("job_title", "schedule", "hours_worked"):
            if f in changes:
                diffs.append((f, original.get(f), changes.get(f)))
    return {
        "action":     "delete" if is_delete else "edit",
        "unit":       mgr.name if mgr else f"#{req.manager_id}",
        "date":       req.date,
        "supervisor": req.supervisor_name,
        "worker":     req.worker_name,
        "diffs":      diffs,
        "original":   original,
    }


def _hr_document_data(db, doc) -> dict:
    mgr = db.query(Manager).filter_by(id=doc.manager_id).first()
    payload = doc.payload or {}
    target = (payload.get("target_manager_name")
              if payload.get("target_type") == "supervisor"
              else payload.get("task_name"))
    # → supervisor moves carry a destination cell — show it beside the receiver,
    # by its CODE. A cell is never written out by its workshop name (frontend
    # `utils/cellName.js`), and this card is read beside the page that files it.
    if payload.get("target_type") == "supervisor" and payload.get("target_cell"):
        target = f"{target or '—'} · {payload['target_cell']}"
    unit = doc.supervisor_name or (mgr.name if mgr else f"#{doc.manager_id}")
    return {
        "doc_type":  doc.doc_type,
        # The type this document STANDS FOR. A sandbox document is a worker
        # exchange that moves nothing, not a fourth kind of document, so the
        # renderer branches on this and the chip below says the rest.
        "kind":      cell_exchange.REAL_OF.get(doc.doc_type, doc.doc_type),
        "is_test":   cell_exchange.is_test(doc.doc_type),
        "unit":      unit,
        "date":      doc.date,
        "creator":   doc.created_by_name or "",
        "new_role":  payload.get("new_role"),
        "target":    target or "—",
        "transfer_time": payload.get("transfer_time"),
        "employees": payload.get("employees", []),
        # The two ENDS of a cell-level move, as raw facts. Both are None on a
        # unit-level /staff document, which carries no cell at all — the
        # renderer then prints exactly what it always printed.
        "from_block": _identity_block(
            unit, payload.get("shift"), payload.get("sender_cell"),
            payload.get("sender_leader_name")),
        "to_block": _identity_block(
            payload.get("target_manager_name"), payload.get("shift"),
            payload.get("target_cell"), payload.get("target_leader_name"),
        ) if payload.get("target_type") == "supervisor" and payload.get("sender_cell") else None,
    }


def _identity_block(who, shift, cell, leader) -> dict | None:
    """One end of a cell-level move, as RAW values — never as a sentence.

    Returned as a dict rather than a formatted string because every part of it
    is language-dependent at RENDER time: «Smena» / «Смена» / «Shift» and the
    «Biriktirilmagan» that stands in for a cell nobody owns are resolved per
    recipient in `_fmt_block`, and each recipient gets the card in their own
    language. A block is None — and prints nothing — when the document names no
    cell, which is every /staff document ever filed.
    """
    if not cell:
        return None
    return {"who": who or "—", "shift": shift, "cell": cell, "leader": leader}


def _fmt_block(block: dict, lang: str) -> str:
    """«Rustamov A. · Smena 1 · 0028 · Lider: Karimov B.» in one line.

    ONE line per block, and each block on a line of ITS OWN: an identity that
    shares a line with the other end is an identity a reader has to take apart,
    and a leader half that could vanish would leave a trailing separator with
    nothing after it. A cell with nobody assigned says so — the translated
    «unassigned», resolved here, so a blank never reads as a missing name.
    """
    parts = [_v(block.get("who"))]
    if block.get("shift") in (1, 2):
        parts.append(f"{_L(lang, 'shift')} {block['shift']}")
    parts.append(str(block.get("cell")))
    parts.append(f"{_L(lang, 'leader')}: "
                 f"{block.get('leader') or _L(lang, 'no_leader')}")
    return " · ".join(parts)


# ── Renderers (data dict + admin language → message body) ─────────────────────

def _render_edit_request(data, lang) -> str:
    is_del = data["action"] == "delete"
    lines = [_L(lang, "hdr_delete") if is_del else _L(lang, "hdr_edit"), ""]
    lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
    lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
    lines.append(f"👤 {_L(lang, 'supervisor')}: {data['supervisor']}")
    lines.append(f"🧑‍🏭 {_L(lang, 'worker')}: {data['worker']}")
    if is_del:
        lines.append("")
        lines.append(_L(lang, "delete_marker"))
        orig = data["original"] or {}
        for f in ("job_title", "schedule", "hours_worked"):
            if orig.get(f) not in (None, ""):
                lines.append(f"• {_L(lang, 'f_' + f)}: {_v(orig.get(f))}")
    else:
        lines.append("")
        lines.append(f"{_L(lang, 'changes')}:")
        for f, old, new in data["diffs"]:
            lines.append(f"• {_L(lang, 'f_' + f)}: {_v(old)} → {_v(new)}")
    return "\n".join(lines)


def _render_edit_batch(data, lang) -> str:
    lines = [_L(lang, "hdr_bulk"), ""]
    lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
    lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
    lines.append(f"👤 {_L(lang, 'supervisor')}: {data['supervisor']}")
    lines.append(f"🔢 {_L(lang, 'count')}: {data['count']}")
    lines.append("")
    lines.append(f"{_L(lang, 'workers')}:")
    for w in _capped(list(data["workers"]), lang):
        lines.append(f"• {w}")
    return "\n".join(lines)


def _render_hr_document(data, lang) -> str:
    """The inline card, in the recipient's own language.

    A cell-level document adds two things and changes nothing else. The **TEST
    chip**, once, at the top — the decision this card asks for is real (it is
    filed, recorded and announced), only its EFFECT is withheld, and a reader
    who cannot tell those apart is a reader who will approve a rehearsal
    thinking they moved somebody. And the two **identity blocks**, each on a
    line of its own, naming both ends of the move down to the cell and its
    leader; without them the card said «Manzil: Suvonov E. · Bolshaya moyka»
    and left the origin — the fact this whole page is about — unstated.

    `_MAX_LIST` is untouched. The blocks and the chip cost about five lines,
    and raising the worker cap to make room is how a forty-worker card starts
    exceeding Telegram's 4096-character limit and silently fails to send.
    """
    emps = data["employees"]
    kind = data.get("kind") or data["doc_type"]
    from_block = data.get("from_block")
    to_block = data.get("to_block")

    if kind == "role_change":
        lines = [_L(lang, "hdr_role"), ""]
        if data.get("is_test"):
            lines += [_L(lang, "test_chip"), ""]
        lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
        if from_block:
            lines.append(f"📦 {_L(lang, 'from_block')}: {_fmt_block(from_block, lang)}")
        lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
        lines.append(f"👤 {_L(lang, 'creator')}: {data['creator']}")
        lines.append(f"🎯 {_L(lang, 'new_role')}: {_v(data['new_role'])}")
        lines.append("")
        lines.append(f"{_L(lang, 'workers')} ({len(emps)}):")
        rows = [f"{e.get('worker_name')}: {_v(e.get('old_role'))} → {_v(data['new_role'])}" for e in emps]
        for r in _capped(rows, lang):
            lines.append(f"• {r}")
    else:  # people_exchange
        lines = [_L(lang, "hdr_exchange"), ""]
        if data.get("is_test"):
            lines += [_L(lang, "test_chip"), ""]
        if from_block:
            # Both ends, each on its OWN line. A → task move renders only the
            # origin plus the task name below: there is no receiving cell, and
            # inventing a second block would name one.
            lines.append(f"📦 {_L(lang, 'from_block')}: {_fmt_block(from_block, lang)}")
            if to_block:
                lines.append(f"📥 {_L(lang, 'to_block')}: {_fmt_block(to_block, lang)}")
        else:
            lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
        lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
        lines.append(f"👤 {_L(lang, 'creator')}: {data['creator']}")
        if not to_block:
            lines.append(f"🎯 {_L(lang, 'target')}: {data['target']}")
        if data.get("transfer_time"):
            lines.append(f"🕐 {_L(lang, 'time')}: {data['transfer_time']}")
        lines.append("")
        lines.append(f"{_L(lang, 'workers')} ({len(emps)}):")
        rows = [str(e.get("worker_name")) for e in emps]
        for r in _capped(rows, lang):
            lines.append(f"• {r}")
    return "\n".join(lines)


def _leader_late_data(db, req) -> dict:
    """Facts of a request to open a voided leader-day. The score is the mean of
    the day's checklist rows — what the day will actually count for if opened,
    so the admin decides against the number, not a description of it."""
    from app.routers.leaders import _day_facts
    mgr = db.query(Manager).filter_by(id=req.manager_id).first() if req.manager_id else None
    facts = _day_facts(db, req)
    return {
        "unit":       mgr.name if mgr else "—",
        "date":       req.date,
        "leader":     req.leader_name,
        "supervisor": req.requested_by_name,
        # when the LEADER filed the checklist — not when the request was sent
        "filed_at":   facts["filed_at"],
        "score":      facts["score"],
        "reason":     req.reason,
    }


def _render_leader_late(data, lang) -> str:
    lines = [_L(lang, "hdr_late"), ""]
    lines.append(f"🏭 {_L(lang, 'unit')}: {_v(data['unit'])}")
    lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
    lines.append(f"👤 {_L(lang, 'leader')}: {_v(data['leader'])}")
    lines.append(f"🕐 {_L(lang, 'filed_at')}: {_v(data['filed_at'])}")
    lines.append(f"📊 {_L(lang, 'score')}: {data['score']}%")
    lines.append(f"✍️ {_L(lang, 'creator')}: {_v(data['supervisor'])}")
    lines.append("")
    lines.append(f"💬 {_L(lang, 'reason')}: {_v(data['reason'])}")
    lines.append("")
    lines.append(_L(lang, "late_note"))
    return "\n".join(lines)


# ── Keyboards ─────────────────────────────────────────────────────────────────

def _approve_reject_kb(code: str, ref, lang: str, panel: str = "/staff"):
    from telebot import types
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton(_L(lang, "approve"), callback_data=f"ap:{code}:a:{ref}"),
        types.InlineKeyboardButton(_L(lang, "reject"),  callback_data=f"ap:{code}:r:{ref}"),
    )
    # "Keep both" — the panel escape hatch alongside the inline actions. It lands
    # on the page the request belongs to, so an admin who would rather see the
    # full picture before deciding is one tap from it.
    kb.add(types.InlineKeyboardButton(
        _L(lang, "open_panel"),
        web_app=types.WebAppInfo(url=f"{settings.webapp_url.rstrip('/')}{panel}"),
    ))
    return kb


# ── Send to admins (records one ApprovalNotice per message) ───────────────────

def _broadcast(db, kind: str, ref, data: dict, render_fn,
               extra_recipients: set[int] | None = None,
               panel: str = "/staff") -> None:
    # Ghost Mode (admin header toggle): an admin testing functions must not blast
    # approve/reject button-messages at every other admin. The record is still
    # created; nobody is pinged. See app.notify_ctx.
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    from app.telegram_bot import bot, _admin_ids, _get_lang
    code = _KIND_CODE[kind]
    # Admins always receive the message; ``extra_recipients`` are the non-admin
    # confirmers (e.g. a people-exchange's receiving supervisor). The set dedups
    # anyone who is both. ApprovalNotice.admin_telegram_id holds the recipient id
    # for either kind, so the shared cross-edit reaches all of them.
    recipients = set(_admin_ids()) | set(extra_recipients or ())
    for recipient_id in sorted(recipients):
        lang = _get_lang(recipient_id)
        text = render_fn(data, lang)
        try:
            sent = bot.send_message(recipient_id, text,
                                    reply_markup=_approve_reject_kb(code, ref, lang, panel))
        except Exception:
            logger.exception("Failed to send %s notice to %s (ref=%s)", kind, recipient_id, ref)
            continue
        db.add(ApprovalNotice(
            kind=kind, ref=str(ref), admin_telegram_id=recipient_id,
            message_id=sent.message_id, text=text,
        ))
    db.commit()


def _exchange_supervisor_recipients(db, doc) -> set[int]:
    """Telegram id of the receiving supervisor for a people-exchange addressed to
    a unit — they confirm the incoming transfer inline just like an admin. Empty
    for every other document kind/target. The creator (e.g. an admin who also
    supervises the target unit) is never re-pinged for their own document."""
    # The SEMANTIC type, not the stored one: a sandbox document is a worker
    # exchange whose effect is withheld, and the receiving supervisor is still
    # the person being asked. Comparing the raw doc_type here left every
    # cell-level document with no non-admin recipient — and since an
    # ApprovalNotice IS the permission to tap, that silently removed the
    # receiving brigadir's authority over their own incoming transfer.
    if cell_exchange.REAL_OF.get(doc.doc_type, doc.doc_type) != "people_exchange":
        return set()
    payload = doc.payload or {}
    if payload.get("target_type") != "supervisor":
        return set()
    target_mid = payload.get("target_manager_id")
    if not target_mid:
        return set()
    from app.routers.staff import _find_supervisor
    sup = _find_supervisor(db, target_mid)
    if not sup or sup.telegram_id == doc.created_by_telegram_id:
        return set()
    return {sup.telegram_id}


def _grantee_recipients(db, capability: str, *manager_ids,
                        skip_telegram_id: int | None = None) -> set[int]:
    """Holders of a capability that reaches these units — the inline card goes
    to them too, so someone granted "handle transfers" is told a transfer
    arrived instead of having to go looking for it.

    Admins are NOT replaced here: ``_broadcast`` always unions this with
    ``_admin_ids()``, so oversight stays intact and a grantee is purely an extra
    pair of hands. The requester never gets their own request back."""
    from app.capabilities import cap_recipients
    ids = cap_recipients(db, capability, *manager_ids)
    ids.discard(skip_telegram_id)
    return ids


def send_edit_request_to_admins(db, req) -> None:
    from app.capabilities import CAP_REQUESTS_APPROVE
    _broadcast(db, "edit_request", req.id, _edit_request_data(db, req), _render_edit_request,
               extra_recipients=_grantee_recipients(
                   db, CAP_REQUESTS_APPROVE, req.manager_id,
                   skip_telegram_id=req.supervisor_telegram_id))


def send_edit_batch_to_admins(db, batch_id, manager_id, attend_date, supervisor_name, worker_names) -> None:
    from app.capabilities import CAP_REQUESTS_APPROVE
    mgr = db.query(Manager).filter_by(id=manager_id).first()
    data = {
        "unit":       mgr.name if mgr else f"#{manager_id}",
        "date":       attend_date,
        "supervisor": supervisor_name,
        "count":      len(worker_names),
        "workers":    list(worker_names),
    }
    _broadcast(db, "edit_batch", batch_id, data, _render_edit_batch,
               extra_recipients=_grantee_recipients(db, CAP_REQUESTS_APPROVE, manager_id))


def _cell_doc_shifts(db, doc) -> set[int]:
    """The shift(s) a cell-level document touches — the sender unit's and the
    receiving unit's. Both, because an admin may file across shifts; this is
    the exact set `staff_cells._native_can_approve_cell_doc` measures a
    shift-manager against."""
    from app.routers.staff_cells import _shift_of_unit
    payload = doc.payload or {}
    return {s for s in (_shift_of_unit(db, doc.manager_id),
                        _shift_of_unit(db, payload.get("target_manager_id")))
            if s in (1, 2)}


def _cell_doc_shift_manager_recipients(db, doc) -> set[int]:
    """Telegram ids of the shift-managers who may decide a CELL document.

    The API has granted them approve authority since the page shipped
    (`staff_cells._native_can_approve_cell_doc`), and the Telegram card never
    reached them — so the button and the endpoint disagreed about the same
    person over the same document. It was not a theoretical gap: a cell → cell
    move inside ONE brigade names no receiving supervisor other than the
    sender, and a `→ task` move names none at all, so those documents had no
    non-admin card recipient and the shift-manager who was supposed to decide
    them got «⛔️ Ruxsat yo'q» on a card nobody had sent.

    Bounded to CELL documents. A /staff document's authority ladder is
    `staff._native_can_approve_doc`'s, and widening its fan-out is not this
    page's business.
    """
    # CUT-OVER: `is_test` stands in for «is this a CELL document» — after the
    # flip this returns an empty set for every new cell document and the
    # shift-manager loses the card again. Re-key it with the two branches in
    # `send_hr_document_to_admins` and `_decide_hr_document`.
    if not cell_exchange.is_test(doc.doc_type):
        return set()
    from app.identity import profile_key, profile_holders
    from app.routers.staff import _sm_role_ids_for_shift
    out: set[int] = set()
    for shift in sorted(_cell_doc_shifts(db, doc)):
        for rid in _sm_role_ids_for_shift(db, shift):
            out.update(profile_holders(db, profile_key("shift-manager", rid)))
    out.discard(doc.created_by_telegram_id)
    return out


def _hr_doc_grantee_recipients(db, doc) -> set[int]:
    """`staff.documents.approve` holders the card may go to for THIS document.

    For a /staff document this is `_grantee_recipients` unchanged.

    For a CELL document it drops every account whose approve reach comes from a
    LEADER profile, and that is a security fix rather than tidying.
    `cap_recipients` resolves an "own" grant through
    `capabilities.account_unit_ids`, which answers ``None`` — «no restriction»
    — for any account holding a leader profile, so an own-scoped grant made a
    LEADER a card recipient for every hr_document on the platform. On this
    platform **an ApprovalNotice IS the permission to tap**
    (`recipient_has_notice_for_code` is the whole non-admin gate), and the
    operator's ruling is that the receiving leader cannot approve — they are
    notified only, through `staff_cells._notify_cell_doc`'s bell row and plain
    DM. A card in their chat would have been the authority itself.

    An account is kept when it holds at least one NON-leader approved profile
    whose own units reach this document — so a brigadir who also holds a leader
    record is unaffected, while a pure leader is out. Admins are unaffected
    either way: `_broadcast` unions `_admin_ids()` on top of this.
    """
    from app.capabilities import (
        CAP_DOCUMENTS_APPROVE, account_cap_scope, account_profile_keys,
        profile_unit_ids, users_with_cap,
    )
    payload = doc.payload or {}
    # CUT-OVER: same substitution — after the flip a cell document takes the
    # /staff branch below and the leader exclusion is silently lost.
    if not cell_exchange.is_test(doc.doc_type):
        return _grantee_recipients(
            db, CAP_DOCUMENTS_APPROVE, doc.manager_id,
            payload.get("target_manager_id"),
            skip_telegram_id=doc.created_by_telegram_id)

    wanted = {m for m in (doc.manager_id, payload.get("target_manager_id")) if m}
    out: set[int] = set()
    for tg in users_with_cap(db, CAP_DOCUMENTS_APPROVE):
        if tg == doc.created_by_telegram_id:
            continue
        # Leader profiles are skipped outright — they widen nothing here, and
        # letting one answer «no restriction» is the bug this closes.
        keys = [k for k in account_profile_keys(db, tg)
                if not str(k).startswith("leader:")]
        if not keys:
            continue
        if account_cap_scope(db, tg, CAP_DOCUMENTS_APPROVE) == "all":
            out.add(tg)
            continue
        units: set[int] = set()
        for key in keys:
            u = profile_unit_ids(db, key)
            if u is None:                  # admin / top-manager profile
                units = None
                break
            units.update(u)
        if units is None or (wanted & units):
            out.add(tg)
    return out


def send_hr_document_to_admins(db, doc) -> None:
    # «Panelda ochish» must land on the page the document actually lives on: a
    # cell-level document does not appear on /staff at all, and a button onto a
    # register that cannot show the row is worse than no button.
    #
    # CUT-OVER: `is_test` stands in for «is this a CELL document», and the two
    # stop being the same question the moment `cell_exchange.SANDBOX` is
    # False — a new cell document then carries the REAL doc_type, answers
    # False here, and every card it sends points at /staff, a register that
    # cannot show the row. This branch must be re-keyed off a fact that
    # survives the flip (the payload's `sender_cell`), not off the type.
    panel = "/staff-cells" if cell_exchange.is_test(doc.doc_type) else "/staff"
    # The card goes to exactly the people who may decide the document: admins
    # (unioned in by `_broadcast`), the receiving supervisor, the shift-manager
    # of a shift the move touches, and a documents-approve grantee — never a
    # leader. See `_hr_doc_grantee_recipients`.
    _broadcast(db, "hr_document", doc.id, _hr_document_data(db, doc), _render_hr_document,
               extra_recipients=(_exchange_supervisor_recipients(db, doc)
                                 | _cell_doc_shift_manager_recipients(db, doc)
                                 | _hr_doc_grantee_recipients(db, doc)),
               panel=panel)


def _leader_dispute_data(db, d) -> dict:
    """Facts of a brigadir's objection to an automatic rejection. The AI's own
    verdict travels with it: an admin ruling on "was the machine wrong" needs
    to read what the machine actually said, and asking them to open the panel
    first would make the inline buttons decoration."""
    from app.services import leader_ai, leader_reports
    from app.models import LeaderAiReview

    mgr = db.query(Manager).filter_by(id=d.manager_id).first() if d.manager_id else None
    rev = (db.query(LeaderAiReview).filter_by(id=d.review_id).first()
           or db.query(LeaderAiReview).filter_by(ref=d.ref).first())
    verdict = ""
    if rev is not None:
        flags = ", ".join(rev.flags or []) or "—"
        prose = (rev.reason_ru or rev.reason_uz or rev.reason_en or "").strip()
        verdict = f"[{flags}] {prose}".strip()
    return {
        "unit":       mgr.name if mgr else "—",
        "date":       d.date,
        "leader":     d.leader_name or "—",
        "task":       leader_ai.task_label(db, d.task_id, d.manager_id, d.leader_id),
        "verdict":    verdict[:600],
        # WHOSE words the first note is. A brigadir may still file for a leader
        # who resolves to no profile, and printing that as the leader's own
        # account of their shift would be a fabrication on the card an admin
        # rules from.
        "author":     d.requested_by_name,
        "author_role": (str(d.requested_by_profile or "").split(":")[0] or ""),
        "reason":     d.reason,
        # The brigadir's case for passing it up — the middle stage, and the one
        # an admin card that showed only the first and the last note left
        # invisible. Absent when the brigadir IS the filer, where the two would
        # be the same sentence twice.
        "supervisor": d.sup_by_name if d.sup_action == "uplifted" else None,
        "sup_note":   d.sup_note,
        "uid":        leader_reports.uid_of_ref(db, d.ref) or "",
    }


def _render_leader_dispute(data, lang) -> str:
    """The admin's card — the verdict, then EVERY note the chain has collected.

    Both stages are printed because the admin is the only reader who has both:
    the account of the shift from whoever was there, and the brigadir's own
    reason for believing it. A card showing one of them asks for a ruling on
    half the evidence, which is the flow this chain replaced.
    """
    lines = [_L(lang, "hdr_dispute"), ""]
    lines.append(f"🏭 {_L(lang, 'unit')}: {_v(data['unit'])}")
    lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
    lines.append(f"👤 {_L(lang, 'leader')}: {_v(data['leader'])}")
    lines.append(f"📋 {_L(lang, 'task')}: {_v(data['task'])}")
    lines.append("")
    lines.append(f"🤖 {_L(lang, 'ai_verdict')}: {_v(data['verdict'])}")
    lines.append(f"✍️ {_L(lang, 'creator')}: {_v(data.get('author'))}")
    lines.append(f"💬 {_L(lang, 'reason')}: {_v(data['reason'])}")
    if data.get("supervisor"):
        lines.append("")
        lines.append(f"👷 {_L(lang, 'sup_case')} ({_v(data['supervisor'])}): "
                     f"{_v(data.get('sup_note'))}")
    lines.append("")
    lines.append(_L(lang, "dispute_note"))
    return "\n".join(lines)


def send_leader_dispute_to_admins(db, d) -> None:
    """A brigadir's objection to an automatic rejection. Admins only, by the
    same rule as opening a late day: the person who wants the deduction undone
    is not the person who undoes it. The panel button lands on the day report
    itself, which is where the photo and the verdict sit side by side."""
    data = _leader_dispute_data(db, d)
    panel = f"/leaders/report/{data['uid']}" if data.get("uid") else "/leaders"
    _broadcast(db, "leader_dispute", d.id, data, _render_leader_dispute, panel=panel)


def send_leader_late_to_admins(db, req) -> None:
    """A supervisor's request to open a voided leader-day. Admins only — the flow
    exists so that the person who wants the day open is not the person who opens
    it, which a capability grant would quietly undo."""
    _broadcast(db, "leader_late", req.id, _leader_late_data(db, req),
               _render_leader_late, panel="/leaders?tab=late")


# ── Cross-edit primitive — the single source of "decision happened" ───────────

def _outcome_line(lang: str, status: str, decided_by: str | None) -> str:
    key = {"approved": "approved_by", "rejected": "rejected_by"}.get(status, "cancelled_by")
    label = _L(lang, key)
    return f"{label} — {decided_by}" if decided_by else label


def edit_admin_notices(kind: str, ref, status: str, decided_by: str | None = None) -> None:
    """Edit every admin's tracked message for (kind, ref) with the outcome (in
    each admin's own language), drop the buttons, and forget the notices.
    Best-effort per message — a single unreachable admin must not block others.

    Called from BOTH the Telegram callbacks and the web-app decision endpoints,
    so any decision keeps all admin messages consistent."""
    from app.telegram_bot import bot, _get_lang
    with SessionLocal() as db:
        notices = db.query(ApprovalNotice).filter_by(kind=kind, ref=str(ref)).all()
        for n in notices:
            lang = _get_lang(n.admin_telegram_id)
            try:
                bot.edit_message_text(
                    f"{n.text}\n\n{_outcome_line(lang, status, decided_by)}",
                    chat_id=n.admin_telegram_id, message_id=n.message_id, reply_markup=None,
                )
            except Exception:
                logger.warning("Could not edit %s notice msg %s for admin %s",
                               kind, n.message_id, n.admin_telegram_id)
            db.delete(n)
        db.commit()


def forget_notices(kind: str, ref) -> None:
    """Drop tracked notices without editing the messages (e.g. the underlying
    record was deleted outright)."""
    with SessionLocal() as db:
        db.query(ApprovalNotice).filter_by(kind=kind, ref=str(ref)).delete()
        db.commit()


# ── The action register ───────────────────────────────────────────────────────
# An inline tap decides a real request and passes no HTTP route the action-log
# middleware can see, so every decision records itself here — under the SAME
# action key the web endpoint carries, so "who approved this, and what did it
# say" reads identically whether it was settled in a DM or in the panel.
#
# Best-effort throughout: each helper wraps its own body, because a decision
# that has already committed must never fail on the row that describes it.

def _tid(caller: dict) -> int | None:
    """The tapping account's Telegram id off a staff caller dict."""
    try:
        return int(caller.get("sub"))
    except (TypeError, ValueError):
        return None


def _unit_name(db, manager_id) -> str | None:
    """Snapshot of the unit's name for an audit row. Never raises."""
    try:
        mgr = db.query(Manager).filter_by(id=manager_id).first() if manager_id else None
        return mgr.name if mgr else None
    except Exception:
        return None


def _log_edit_request(db, caller: dict, req_id: int, status: str) -> None:
    try:
        from app.models import EditRequest
        req = db.query(EditRequest).filter_by(id=req_id).first()
        unit_id = req.manager_id if req else None
        action_log.record_bot(
            db, _tid(caller), "attendance",
            "attendance.request_approved" if status == "approved"
            else "attendance.request_rejected",
            actor_name=caller.get("full_name"), actor_role=caller.get("role"),
            target_kind="request", target_id=req_id,
            target_name=req.worker_name if req else None,
            unit_id=unit_id, unit_name=_unit_name(db, unit_id),
            day=req.date if req else None,
            details=[("worker", req.worker_name), ("brigadir", req.supervisor_name)]
            if req else None,
            changes=[("status", "pending", status)],
        )
    except Exception:
        logger.debug("action log: edit-request decision not recorded", exc_info=True)


def _log_edit_batch(db, caller: dict, batch_token, status: str, count: int) -> None:
    try:
        from app.models import EditRequest
        from app.routers.staff import _batch_id_filter
        # Any row of the batch names the unit and the day — they are the same
        # for every request in it, which is what makes it a batch.
        req = db.query(EditRequest).filter(_batch_id_filter(batch_token)).first()
        unit_id = req.manager_id if req else None
        action_log.record_bot(
            db, _tid(caller), "attendance",
            "attendance.request_batch_approved" if status == "approved"
            else "attendance.request_batch_rejected",
            actor_name=caller.get("full_name"), actor_role=caller.get("role"),
            target_kind="batch", target_id=batch_token,
            unit_id=unit_id, unit_name=_unit_name(db, unit_id),
            day=req.date if req else None,
            details=[("count", count),
                     ("brigadir", req.supervisor_name if req else None)],
            changes=[("status", "pending", status)],
        )
    except Exception:
        logger.debug("action log: edit-batch decision not recorded", exc_info=True)


def _log_hr_document(db, caller: dict, doc, status: str) -> None:
    try:
        employees = (doc.payload or {}).get("employees") or []
        action_log.record_bot(
            db, _tid(caller), "documents",
            "document.approved" if status == "approved" else "document.rejected",
            actor_name=caller.get("full_name"), actor_role=caller.get("role"),
            target_kind="document", target_id=doc.id,
            unit_id=doc.manager_id,
            unit_name=doc.supervisor_name or _unit_name(db, doc.manager_id),
            day=doc.date,
            details=[("doc_type", doc.doc_type), ("workers", len(employees))],
            changes=[("status", "draft", status)],
        )
    except Exception:
        logger.debug("action log: HR-document decision not recorded", exc_info=True)


def _log_leader_late(db, call, req, status: str, decided_by: str) -> None:
    try:
        action_log.record_bot(
            db, call.from_user.id, "leader_review", "lateday.decided",
            actor_name=decided_by, actor_role="admin",
            target_kind="lateday", target_id=req.id, target_name=req.leader_name,
            unit_id=req.manager_id, unit_name=_unit_name(db, req.manager_id),
            day=req.date,
            details=[("leader", req.leader_name)],
            changes=[("status", "pending", status)],
            reason=req.reason,
        )
    except Exception:
        logger.debug("action log: late-day decision not recorded", exc_info=True)


def _log_leader_dispute(db, call, d, status: str, decided_by: str) -> None:
    try:
        action_log.record_bot(
            db, call.from_user.id, "leader_review", "dispute.decided",
            actor_name=decided_by, actor_role="admin",
            target_kind="dispute", target_id=d.id, target_name=d.leader_name,
            unit_id=d.manager_id, unit_name=_unit_name(db, d.manager_id),
            day=d.date,
            details=[("leader", d.leader_name), ("task_id", d.task_id)],
            changes=[("status", "pending", status)],
            reason=d.reason,
        )
    except Exception:
        logger.debug("action log: dispute ruling not recorded", exc_info=True)


# ── Callback handling (Telegram tap → shared staff core) ──────────────────────

def _display_name(u) -> str:
    """Admin tapper's display name — their claimed profile name; the Telegram
    account name only covers unbound legacy admins."""
    from app.telegram_bot import admin_profile_name
    name = admin_profile_name(u.id) \
        or " ".join(p for p in (u.first_name, u.last_name) if p).strip()
    if not name:
        name = f"@{u.username}" if u.username else "Admin"
    return name


def _caller_from_call(call) -> dict:
    """Synthetic admin caller for the staff cores, built from the tapping admin.
    Admins satisfy every authority check, so this flows through unchanged. Used
    for the admin-only er/eb kinds."""
    return {"sub": str(call.from_user.id), "role": "admin", "full_name": _display_name(call.from_user)}


def _grantee_caller(call, capability: str) -> dict | None:
    """The tapping account as a staff caller, when it holds ``capability``.

    A non-admin only ever reaches an er/eb button by holding an ApprovalNotice
    addressed to them, which we only create for a grant whose scope covered the
    unit. Even so, build their REAL caller rather than borrowing the admin one:
    the staff core then re-checks the grant server-side (defence in depth, in
    case a grant was revoked between the send and the tap) and the audit trail
    records the role they actually acted as.

    A capability reaches this account through either axis — handed to the login
    itself, or attached to a POSITION it holds — so both are checked, and the
    profile that actually carries it is the one attached as the caller's role.
    Picking any approved row instead would scope "own" against a position that
    never held the grant, and the staff core's own re-check would then refuse a
    tap the notification correctly offered."""
    from app.capabilities import account_cap_scope, caps_for_profile
    u = call.from_user
    with SessionLocal() as db:
        if account_cap_scope(db, u.id, capability) is None:
            return None
        rows = db.query(TelegramUserRole).filter_by(
            telegram_id=u.id, status="approved").order_by(TelegramUserRole.id).all()
        r = next((x for x in rows if x.profile_key
                  and capability in caps_for_profile(db, x.profile_key)), None)
        r = r or (rows[0] if rows else None)
        if r is None:
            return None
        return {"sub": str(u.id), "role": r.role, "role_id": r.role_id,
                "full_name": r.full_name or _display_name(u)}


def _caller_for_request(call) -> dict | None:
    """Caller for an er/eb tap: the admin path, else a requests-approve grantee."""
    from app.capabilities import CAP_REQUESTS_APPROVE
    from app.telegram_bot import _admin_ids
    if call.from_user.id in _admin_ids():
        return _caller_from_call(call)
    return _grantee_caller(call, CAP_REQUESTS_APPROVE)


def _caller_for_doc(call, doc, db) -> dict | None:
    """Build the staff caller for whoever tapped an hr_document button.

    Admins get an admin caller. A non-admin is whichever approver the document
    actually has, in the order authority narrows:

      * the **receiving supervisor** — they must hold the approved supervisor
        role for the document's target unit;
      * a **shift-manager of a shift the move touches**, for a cell-level
        document. This second rung is not cosmetic: a cell → cell move inside
        one brigade names no receiving supervisor other than the sender, and a
        `→ task` move names none at all, so without it those documents were
        decidable by an admin and by nobody else.

        It is only half the rung, and the other half is the CARD. This function
        runs after `telegram_bot._approval_callback` has already gated the tap
        on `recipient_has_notice_for_code`, so a shift-manager who is never
        sent a notice never reaches here at all — the rung sat unreachable
        while the router granted the same person approve authority through the
        API, which is the two doors disagreeing about one person. Both halves
        moved together: `_cell_doc_shift_manager_recipients` sends them the
        card, and this builds the caller for the tap.

        The SHIFT is checked here rather than left to the router's re-check.
        An account may hold two shift-manager profiles; picking whichever row
        the database returned first would build a caller for the wrong shift
        and `staff_cells._can_approve_cell_doc` would then refuse the tap as
        «already handled» — the least debuggable failure this area can produce.

    The receiving **LEADER is deliberately not here**, and it is enforced
    twice: no leader is ever sent a card (`_hr_doc_grantee_recipients`, and on
    this platform the notice IS the permission to tap), and
    `staff_cells._can_approve_cell_doc` refuses the role outright at the API
    door.

    The role-scoped name is used so the audit trail and the outcome line read
    like a web-app decision.
    """
    from app.telegram_bot import _admin_ids
    u = call.from_user
    if u.id in _admin_ids():
        return {"sub": str(u.id), "role": "admin", "full_name": _display_name(u)}

    target_mid = (doc.payload or {}).get("target_manager_id")
    if target_mid:
        role_row = db.query(TelegramUserRole).filter_by(
            telegram_id=u.id, role="supervisor", role_id=target_mid, status="approved",
        ).first()
        if role_row:
            return {"sub": str(u.id), "role": "supervisor", "role_id": target_mid,
                    "full_name": role_row.full_name}

    # CUT-OVER: same substitution — after the flip this rung stops firing for
    # new cell documents and a shift-manager's tap is refused again.
    if cell_exchange.is_test(doc.doc_type):
        from app.routers.staff import _sm_shift
        rows = db.query(TelegramUserRole).filter_by(
            telegram_id=u.id, role="shift-manager", status="approved",
        ).order_by(TelegramUserRole.id).all()
        shifts = _cell_doc_shifts(db, doc)
        # The profile whose SHIFT actually touches this move, never «the first
        # shift-manager row this account holds» — see the docstring.
        sm = next((r for r in rows if _sm_shift(db, r.role_id) in shifts), None)
        if sm:
            return {"sub": str(u.id), "role": "shift-manager", "role_id": sm.role_id,
                    "full_name": sm.full_name}
    return None


def recipient_has_notice_for_code(code: str, ref, telegram_id: int) -> bool:
    """True when ``telegram_id`` has a tracked confirm button (an ApprovalNotice
    addressed to them) for this request. The callback gate uses this to let the
    receiving supervisor act while keeping every kind we never send them out of
    reach — we only ever create a non-admin notice for a legitimate confirmer."""
    kind = _CODE_KIND.get(code)
    if not kind:
        return False
    with SessionLocal() as db:
        return db.query(ApprovalNotice).filter_by(
            kind=kind, ref=str(ref), admin_telegram_id=telegram_id,
        ).first() is not None


def handle_approval_callback(call, code: str, status: str, ref: str) -> None:
    """Dispatch a staff/HR approval tap. ``code`` ∈ er|eb|hr, ``status`` ∈
    approved|rejected. Answers the callback with a toast in every outcome."""
    from app.telegram_bot import bot
    lang = _get_caller_lang(call)
    try:
        if code in ("er", "eb"):
            caller = _caller_for_request(call)
            if caller is None:
                bot.answer_callback_query(call.id, _L(lang, "toast_no_rights"), show_alert=True)
                return
            if code == "er":
                _decide_edit_request(int(ref), status, caller)
            else:
                _decide_edit_batch(ref, status, caller)
        elif code == "hr":
            _decide_hr_document(int(ref), status, call)
        elif code == "ll":
            _decide_leader_late(int(ref), status, call)
        elif code == "ld":
            _decide_leader_dispute(int(ref), status, call)
        else:
            bot.answer_callback_query(call.id)
            return
        toast = _L(lang, "toast_approved") if status == "approved" else _L(lang, "toast_rejected")
        bot.answer_callback_query(call.id, toast)
    except AlreadyHandled:
        bot.answer_callback_query(call.id, _L(lang, "toast_already"), show_alert=True)
    except Exception:
        logger.exception("approval callback failed (code=%s ref=%s status=%s)", code, ref, status)
        try:
            bot.answer_callback_query(call.id, _L(lang, "toast_error"), show_alert=True)
        except Exception:
            pass


def _get_caller_lang(call) -> str:
    from app.telegram_bot import _get_lang
    return _get_lang(call.from_user.id)


def _decide_edit_request(req_id: int, status: str, caller: dict) -> None:
    from fastapi import HTTPException
    from app.routers.staff import _process_request
    with SessionLocal() as db:
        try:
            _process_request(req_id, status, caller, db)
        except HTTPException as e:
            if e.status_code in (404, 409):
                raise AlreadyHandled()
            raise
        _log_edit_request(db, caller, req_id, status)


def _decide_edit_batch(batch_token: str, status: str, caller: dict) -> None:
    from fastapi import HTTPException
    from app.routers.staff import _process_batch
    with SessionLocal() as db:
        try:
            n = _process_batch(batch_token, status, caller, db)
        except HTTPException as e:
            if e.status_code in (404, 409):
                raise AlreadyHandled()
            raise
        _log_edit_batch(db, caller, batch_token, status, n)


def _decide_leader_late(req_id: int, status: str, call) -> None:
    """Open (or refuse) a voided leader-day from the inline card. Admin-only and
    re-checked here: notices for this kind are only ever sent to admins, but the
    check is cheap and the alternative is a day opened by whoever holds a
    forwarded message. Runs the SAME core as the web app, so an approval from a
    DM notifies the leader exactly like one from the panel."""
    from app.models import LeaderLateRequest
    from app.routers.leaders import decide_late_request
    from app.telegram_bot import _admin_ids

    if call.from_user.id not in _admin_ids():
        raise AlreadyHandled()
    with SessionLocal() as db:
        req = db.query(LeaderLateRequest).filter_by(id=req_id).first()
        if req is None or req.status != "pending":
            raise AlreadyHandled()   # withdrawn, or another admin got there first
        decided_by = _display_name(call.from_user)
        decide_late_request(db, req, status, decided_by, call.from_user.id)
        _log_leader_late(db, call, req, status, decided_by)
    edit_admin_notices("leader_late", req_id, status, decided_by)


def _decide_leader_dispute(dispute_id: int, status: str, call) -> None:
    """Rule on an objection from the inline card. Admin-only and re-checked
    here — notices for this kind only ever go to admins, but a forwarded
    message must not be able to restore a leader's points.

    Runs the SAME core as the web endpoint, so a dispute settled from a DM
    re-scores the day and re-sends its report exactly like one settled in the
    panel."""
    from app.models import LeaderAiDispute
    from app.routers.leaders import _report_after_ruling, _settle_dispute
    from app.services import leader_dispute
    from app.telegram_bot import _admin_ids

    if call.from_user.id not in _admin_ids():
        raise AlreadyHandled()
    with SessionLocal() as db:
        d = db.query(LeaderAiDispute).filter_by(id=dispute_id).first()
        # Stage 2 is the only one this card rules on — a row still sitting with
        # its brigadir, or already settled, is "somebody got there first".
        if d is None or d.status != leader_dispute.ADMIN:
            raise AlreadyHandled()   # withdrawn, or another admin got there first
        decided_by = _display_name(call.from_user)
        _settle_dispute(db, d, status, decided_by, call.from_user.id)
        _log_leader_dispute(db, call, d, status, decided_by)
        leader_dispute.notify_decided(db, d, stage="admin")
        db.commit()
        _report_after_ruling(db, d)
    edit_admin_notices("leader_dispute", dispute_id, status, decided_by)


def _decide_hr_document(doc_id: int, status: str, call) -> None:
    """Settle an hr_document from its inline card.

    A CELL-level document is decided through the cell router's OWN core —
    `staff_cells._can_approve_cell_doc`, `_approve_cell_doc`,
    `_reject_cell_doc`, `_notify_cell_doc` — and not through `routers.staff`'s.
    Two reasons, and both are correctness rather than tidiness. The authority
    ladders differ: `staff._native_can_approve_doc` tests
    ``doc_type == "people_exchange"`` literally, so for a sandbox type it falls
    through to «admin or shift-manager» and would refuse the RECEIVING
    SUPERVISOR the button was sent to — the exact Telegram-versus-API
    disagreement this file is meant not to have. And the approve path differs:
    `staff._approve_doc` ends in `_apply_doc_effects`, while the sandbox's one
    invariant is that no attendance row is written on any path a test document
    can reach. One core per document kind, both doors.
    """
    from fastapi import HTTPException
    from app.models import HrDocument
    from app.routers import staff, staff_cells
    with SessionLocal() as db:
        doc = db.query(HrDocument).filter_by(id=doc_id).first()
        if not doc:
            raise AlreadyHandled()
        # CUT-OVER: this is the OTHER place `is_test` stands in for «is this a
        # CELL document», and it is the consequential one. Flip
        # `cell_exchange.SANDBOX` and every new cell document answers False
        # here, so an inline tap on it is settled through `routers.staff`'s
        # ladder instead of this page's: the shift-manager rung disappears, the
        # leader refusal disappears, and `_notify_cell_doc` is never called, so
        # the sending brigadir and the receiving leader are told nothing. Both
        # this line and the `panel` line above must be re-keyed off a fact that
        # survives the flip before SANDBOX moves.
        cell_doc = cell_exchange.is_test(doc.doc_type)
        caller = _caller_for_doc(call, doc, db)
        may = (staff_cells._can_approve_cell_doc if cell_doc
               else staff._can_approve_doc)
        # No caller, or a non-admin who no longer holds authority over this
        # document → they may not decide it (role changed, or a stale tap).
        if caller is None or (caller["role"] != "admin" and not may(doc, caller, db)):
            raise AlreadyHandled()
        try:
            if status == "approved":
                if doc.status == "approved":
                    raise AlreadyHandled()
                if cell_doc:
                    staff_cells._approve_cell_doc(doc, caller, db)
                    staff_cells._notify_cell_doc(db, doc, "approved", int(caller["sub"]))
                else:
                    staff._approve_doc(doc, caller, db)
                    if doc.doc_type == "people_exchange":
                        staff._notify_exchange(db, doc, "approved", int(caller["sub"]))
            else:  # rejected → keep the draft as a rejected record
                if cell_doc:
                    staff_cells._reject_cell_doc(doc, caller, db)
                else:
                    staff._reject_document(doc, caller, db)
        except staff.ExchangeTargetNoData:
            # Not a stale tap: the target unit's verifix data isn't uploaded yet.
            # Let it reach the generic handler so the tapper sees an error toast
            # rather than the "already handled" one.
            raise
        except HTTPException as e:
            if e.status_code in (404, 409):
                raise AlreadyHandled()
            raise
        db.commit()
        _log_hr_document(db, caller, doc, status)
    edit_admin_notices("hr_document", doc_id, status, caller.get("full_name"))
