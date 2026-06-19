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

logger = logging.getLogger(__name__)


class AlreadyHandled(Exception):
    """Raised when a request was already decided (race between two admins, or
    decided in the web app). The callback answers with a soft toast."""


# ── i18n ────────────────────────────────────────────────────────────────────

_KIND_CODE = {"edit_request": "er", "edit_batch": "eb", "hr_document": "hr"}
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
        "unit":          "Bo'lim",
        "date":          "Sana",
        "supervisor":    "Brigadir",
        "creator":       "Yuborgan",
        "worker":        "Xodim",
        "workers":       "Xodimlar",
        "new_role":      "Yangi lavozim",
        "target":        "Manzil",
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
        "toast_error":    "Xatolik yuz berdi",
    },
    "ru": {
        "hdr_edit":      "✏️ Запрос на редактирование",
        "hdr_delete":    "🗑 Запрос на удаление",
        "hdr_bulk":      "🗑 Массовый запрос на удаление",
        "hdr_role":      "📋 Документ смены должности",
        "hdr_exchange":  "🔄 Документ обмена сотрудниками",
        "unit":          "Бригада",
        "date":          "Дата",
        "supervisor":    "Бригадир",
        "creator":       "Отправитель",
        "worker":        "Сотрудник",
        "workers":       "Сотрудники",
        "new_role":      "Новая должность",
        "target":        "Назначение",
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
        "toast_error":    "Произошла ошибка",
    },
    "en": {
        "hdr_edit":      "✏️ Edit request",
        "hdr_delete":    "🗑 Delete request",
        "hdr_bulk":      "🗑 Bulk delete request",
        "hdr_role":      "📋 Role change document",
        "hdr_exchange":  "🔄 Worker exchange document",
        "unit":          "Unit",
        "date":          "Date",
        "supervisor":    "Supervisor",
        "creator":       "Submitted by",
        "worker":        "Worker",
        "workers":       "Workers",
        "new_role":      "New role",
        "target":        "Target",
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
    return {
        "doc_type":  doc.doc_type,
        "unit":      doc.supervisor_name or (mgr.name if mgr else f"#{doc.manager_id}"),
        "date":      doc.date,
        "creator":   doc.created_by_name or "",
        "new_role":  payload.get("new_role"),
        "target":    target or "—",
        "employees": payload.get("employees", []),
    }


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
    emps = data["employees"]
    if data["doc_type"] == "role_change":
        lines = [_L(lang, "hdr_role"), ""]
        lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
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
        lines.append(f"🏭 {_L(lang, 'unit')}: {data['unit']}")
        lines.append(f"📅 {_L(lang, 'date')}: {_fmt_date(data['date'], lang)}")
        lines.append(f"👤 {_L(lang, 'creator')}: {data['creator']}")
        lines.append(f"🎯 {_L(lang, 'target')}: {data['target']}")
        lines.append("")
        lines.append(f"{_L(lang, 'workers')} ({len(emps)}):")
        rows = [str(e.get("worker_name")) for e in emps]
        for r in _capped(rows, lang):
            lines.append(f"• {r}")
    return "\n".join(lines)


# ── Keyboards ─────────────────────────────────────────────────────────────────

def _approve_reject_kb(code: str, ref, lang: str):
    from telebot import types
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton(_L(lang, "approve"), callback_data=f"ap:{code}:a:{ref}"),
        types.InlineKeyboardButton(_L(lang, "reject"),  callback_data=f"ap:{code}:r:{ref}"),
    )
    # "Keep both" — the panel escape hatch alongside the inline actions.
    kb.add(types.InlineKeyboardButton(
        _L(lang, "open_panel"),
        web_app=types.WebAppInfo(url=f"{settings.webapp_url.rstrip('/')}/staff"),
    ))
    return kb


# ── Send to admins (records one ApprovalNotice per message) ───────────────────

def _broadcast(db, kind: str, ref, data: dict, render_fn) -> None:
    # Ghost Mode (admin header toggle): an admin testing functions must not blast
    # approve/reject button-messages at every other admin. The record is still
    # created; nobody is pinged. See app.notify_ctx.
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    from app.telegram_bot import bot, _admin_ids, _get_lang
    code = _KIND_CODE[kind]
    for admin_id in sorted(_admin_ids()):
        lang = _get_lang(admin_id)
        text = render_fn(data, lang)
        try:
            sent = bot.send_message(admin_id, text, reply_markup=_approve_reject_kb(code, ref, lang))
        except Exception:
            logger.exception("Failed to send %s notice to admin %s (ref=%s)", kind, admin_id, ref)
            continue
        db.add(ApprovalNotice(
            kind=kind, ref=str(ref), admin_telegram_id=admin_id,
            message_id=sent.message_id, text=text,
        ))
    db.commit()


def send_edit_request_to_admins(db, req) -> None:
    _broadcast(db, "edit_request", req.id, _edit_request_data(db, req), _render_edit_request)


def send_edit_batch_to_admins(db, batch_id, manager_id, attend_date, supervisor_name, worker_names) -> None:
    mgr = db.query(Manager).filter_by(id=manager_id).first()
    data = {
        "unit":       mgr.name if mgr else f"#{manager_id}",
        "date":       attend_date,
        "supervisor": supervisor_name,
        "count":      len(worker_names),
        "workers":    list(worker_names),
    }
    _broadcast(db, "edit_batch", batch_id, data, _render_edit_batch)


def send_hr_document_to_admins(db, doc) -> None:
    _broadcast(db, "hr_document", doc.id, _hr_document_data(db, doc), _render_hr_document)


# ── Cross-edit primitive — the single source of "decision happened" ───────────

def _outcome_line(lang: str, status: str, decided_by: str | None) -> str:
    label = _L(lang, "approved_by") if status == "approved" else _L(lang, "rejected_by")
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


# ── Callback handling (Telegram tap → shared staff core) ──────────────────────

def _caller_from_call(call) -> dict:
    """Synthetic admin caller for the staff cores, built from the tapping admin.
    Admins satisfy every authority check, so this flows through unchanged."""
    u = call.from_user
    name = " ".join(p for p in (u.first_name, u.last_name) if p).strip()
    if not name:
        name = f"@{u.username}" if u.username else "Admin"
    return {"sub": str(u.id), "role": "admin", "full_name": name}


def handle_approval_callback(call, code: str, status: str, ref: str) -> None:
    """Dispatch a staff/HR approval tap. ``code`` ∈ er|eb|hr, ``status`` ∈
    approved|rejected. Answers the callback with a toast in every outcome."""
    from app.telegram_bot import bot
    caller = _caller_from_call(call)
    lang = _get_caller_lang(call)
    try:
        if code == "er":
            _decide_edit_request(int(ref), status, caller)
        elif code == "eb":
            _decide_edit_batch(ref, status, caller)
        elif code == "hr":
            _decide_hr_document(int(ref), status, caller)
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


def _decide_edit_batch(batch_token: str, status: str, caller: dict) -> None:
    from fastapi import HTTPException
    from app.routers.staff import _process_batch
    with SessionLocal() as db:
        try:
            _process_batch(batch_token, status, caller, db)
        except HTTPException as e:
            if e.status_code in (404, 409):
                raise AlreadyHandled()
            raise


def _decide_hr_document(doc_id: int, status: str, caller: dict) -> None:
    from fastapi import HTTPException
    from app.models import HrDocument
    from app.routers import staff
    with SessionLocal() as db:
        doc = db.query(HrDocument).filter_by(id=doc_id).first()
        if not doc:
            raise AlreadyHandled()
        try:
            if status == "approved":
                if doc.status == "approved":
                    raise AlreadyHandled()
                staff._approve_doc(doc, caller, db)
                if doc.doc_type == "people_exchange":
                    staff._notify_exchange(db, doc, "approved", int(caller["sub"]))
            else:  # rejected → delete the draft
                staff._reject_document(doc, caller, db)
        except HTTPException as e:
            if e.status_code in (404, 409):
                raise AlreadyHandled()
            raise
        db.commit()
    edit_admin_notices("hr_document", doc_id, status, caller.get("full_name"))
