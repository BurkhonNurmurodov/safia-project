"""Telegram warnings to admins when a GRANTED capability is exercised.

user_capabilities hands single admin actions to ordinary accounts (the admin
«Permissions» tab). Every time such a grant is actually USED — the actor's own
role would NOT have authorized the action — every admin gets a DM naming who
acted, under which grant (and who handed it out), and exactly what changed
from what to what.

Sent per-recipient-language as a Telegram Rich Message (sendRichMessage, the
old→new diff as a bordered table) with a plain-HTML fallback so the warning
never goes silent on old clients — the same try-rich-then-degrade shape as the
/ojidaniya card. Deliberately IGNORES Ghost Mode (app.notify_ctx): that flag
rides the request, so consulting it would let the audited request silence its
own audit. Failures are logged and swallowed — an alert must never break the
action it reports on.

Call sites pass ``native=`` when native authority is per-object rather than
per-role (documents: the receiving supervisor / right-shift manager approve
natively); otherwise the module decides from _NATIVE_ROLES alone.
"""

import json
import logging
import threading
from datetime import datetime, timedelta, timezone
from html import escape as _esc_raw

from sqlalchemy.orm import Session

from app.capabilities import (
    CAP_ATTENDANCE_DELETE,
    CAP_ATTENDANCE_EDIT,
    CAP_CELLS_MANAGE,
    CAP_CLEANUP,
    CAP_DAY_REOPEN,
    CAP_DOCUMENTS_APPROVE,
    CAP_PAGE_PREFIX,
    CAP_PROFILES_MANAGE,
    CAP_REQUESTS_APPROVE,
    CAP_USERS_MANAGE,
)
from app.models import CapabilityUse, Manager, TelegramUser, UserCapability

logger = logging.getLogger(__name__)

# Roles natively authorized for each capability's actions — an actor in one of
# these roles never trips the alert. Everything not listed defaults to admin
# only. CAP_DOCUMENTS_APPROVE is absent on purpose: its native authority is
# per-DOCUMENT (receiving supervisor, right-shift manager), so those call
# sites decide and pass ``native=`` themselves.
_NATIVE_ROLES = {
    CAP_REQUESTS_APPROVE: ("admin", "shift-manager"),
}
_DEFAULT_NATIVE = ("admin",)

_TASHKENT = timezone(timedelta(hours=5))

# Diff rows shown in full; beyond this the table ends with a "+N" row (the
# plain fallback additionally re-truncates to fit Telegram's 4096-char cap).
_MAX_ROWS = 25


def unit_name(db: Session, manager_id) -> str:
    """Supervisor unit display name for alert details."""
    if not manager_id:
        return "—"
    m = db.query(Manager).filter_by(id=manager_id).first()
    return m.name if m else f"#{manager_id}"


def tv(key: str):
    """Mark a details/changes value for per-recipient translation: the renderer
    replaces ``tv("doc.people_exchange")`` with that key's _T string."""
    return ("__t__", key)


def page_grant_used(db: Session, caller: dict, page: str) -> bool:
    """True when the caller's access to ``page`` exists ONLY through a
    ``page.view.<page>`` grant — their role × page matrix alone would not open
    it. The provenance test for mutations whose sole guard is require_page
    (idle-cell entry, concern creation): those callers already passed the
    guard, so "not natively allowed" means "the grant did it"."""
    from app.permissions import get_page_access, role_can_access
    role = (caller or {}).get("role")
    if role == "admin":
        return False
    return not role_can_access(role, [page], get_page_access(db))


# ── i18n ──────────────────────────────────────────────────────────────────────
# (uz, uz_cyrl, ru, en) — same order everywhere. Capability labels mirror the
# frontend caps.<key>.label strings so the DM names the grant exactly like the
# Permissions tab that issued it.

_LANGS = ("uz", "uz_cyrl", "ru", "en")

_T = {
    "title": ("Diqqat: berilgan ruxsat ishlatildi",
              "Диққат: берилган рухсат ишлатилди",
              "Внимание: использовано выданное разрешение",
              "Warning: granted permission used"),
    "granted_by": ("Ruxsatni bergan: {name} · {date}",
                   "Рухсатни берган: {name} · {date}",
                   "Разрешение выдал: {name} · {date}",
                   "Granted by {name} · {date}"),
    "grant_gone": ("Grant hozirda bekor qilingan",
                   "Грант ҳозирда бекор қилинган",
                   "Грант уже отозван",
                   "Grant has since been revoked"),
    "scope.own": ("o'z doirasi", "ўз доираси", "своя зона", "own scope"),
    "scope.all": ("hamma ma'lumotlar", "ҳамма маълумотлар", "все данные", "all data"),
    "col.field": ("Maydon", "Майдон", "Поле", "Field"),
    "col.old": ("Eski", "Эски", "Было", "Old"),
    "col.new": ("Yangi", "Янги", "Стало", "New"),
    "more_rows": ("… yana {n} ta qator", "… яна {n} та қатор",
                  "… ещё {n} строк", "… {n} more rows"),

    # roles
    "role.admin": ("Administrator", "Администратор", "Администратор", "Admin"),
    "role.shift-manager": ("Smena boshlig'i", "Смена бошлиғи", "Начальник смены", "Shift manager"),
    "role.supervisor": ("Brigadir", "Бригадир", "Бригадир", "Supervisor"),
    "role.leader": ("Lider", "Лидер", "Лидер", "Leader"),
    "role.top-manager": ("Top-menejer", "Топ-менежер", "Топ-менеджер", "Top manager"),
    "role.guest": ("Mehmon", "Меҳмон", "Гость", "Guest"),

    # capability labels (mirror caps.<key>.label)
    "cap." + CAP_DOCUMENTS_APPROVE: ("Ko'chirish so'rovlarini ko'rib chiqish",
                                     "Кўчириш сўровларини кўриб чиқиш",
                                     "Обработка запросов на перевод",
                                     "Handle transfer requests"),
    "cap." + CAP_REQUESTS_APPROVE: ("Tahrirlash so'rovlarini ko'rib chiqish",
                                    "Таҳрирлаш сўровларини кўриб чиқиш",
                                    "Обработка запросов на правки",
                                    "Handle edit requests"),
    "cap." + CAP_ATTENDANCE_EDIT: ("Davomatni to'g'ridan-to'g'ri tahrirlash",
                                   "Давоматни тўғридан-тўғри таҳрирлаш",
                                   "Прямое редактирование табеля",
                                   "Edit attendance directly"),
    "cap." + CAP_ATTENDANCE_DELETE: ("Davomat yozuvlarini o'chirish",
                                     "Давомат ёзувларини ўчириш",
                                     "Удаление записей табеля",
                                     "Delete attendance rows"),
    "cap." + CAP_DAY_REOPEN: ("Yopilgan kunni qayta ochish",
                              "Ёпилган кунни қайта очиш",
                              "Переоткрытие закрытого дня",
                              "Re-open a closed day"),
    "cap." + CAP_CLEANUP: ("Kun ma'lumotlarini tozalash",
                           "Кун маълумотларини тозалаш",
                           "Очистка данных за день",
                           "Wipe a day's data"),
    "cap." + CAP_USERS_MANAGE: ("Foydalanuvchilarni boshqarish",
                                "Фойдаланувчиларни бошқариш",
                                "Управление пользователями",
                                "Manage users"),
    "cap." + CAP_PROFILES_MANAGE: ("Profillarni boshqarish",
                                   "Профилларни бошқариш",
                                   "Управление профилями",
                                   "Manage profiles"),
    "cap." + CAP_CELLS_MANAGE: ("Yacheykalarni boshqarish",
                                "Ячейкаларни бошқариш",
                                "Управление ячейками",
                                "Manage cells"),
    # page.view.<page> family — one template, the page key filled in
    "cap.page.view": ("Sahifa ruxsati: {page}",
                      "Саҳифа рухсати: {page}",
                      "Доступ к странице: {page}",
                      "Page access: {page}"),

    # actions
    "act.attendance.edit": ("Davomat to'g'ridan-to'g'ri o'zgartirildi",
                            "Давомат тўғридан-тўғри ўзгартирилди",
                            "Табель изменён напрямую",
                            "Attendance edited directly"),
    "act.attendance.delete": ("Davomat yozuvi o'chirildi",
                              "Давомат ёзуви ўчирилди",
                              "Запись табеля удалена",
                              "Attendance row deleted"),
    "act.attendance.bulk_delete": ("Davomat yozuvlari ommaviy o'chirildi",
                                   "Давомат ёзувлари оммавий ўчирилди",
                                   "Массовое удаление записей табеля",
                                   "Attendance rows bulk-deleted"),
    "act.request.approved": ("Tahrirlash so'rovi tasdiqlandi",
                             "Таҳрирлаш сўрови тасдиқланди",
                             "Запрос на правку одобрен",
                             "Edit request approved"),
    "act.request.rejected": ("Tahrirlash so'rovi rad etildi",
                             "Таҳрирлаш сўрови рад этилди",
                             "Запрос на правку отклонён",
                             "Edit request rejected"),
    "act.document.approved": ("HR hujjati tasdiqlandi",
                              "HR ҳужжати тасдиқланди",
                              "HR-документ проведён",
                              "HR document approved"),
    "act.document.rejected": ("HR hujjati rad etildi",
                              "HR ҳужжати рад этилди",
                              "HR-документ отклонён",
                              "HR document rejected"),
    "act.document.cancelled": ("HR hujjati bekor qilindi",
                               "HR ҳужжати бекор қилинди",
                               "HR-документ отменён",
                               "HR document cancelled"),
    "act.document.deleted": ("HR hujjati o'chirildi",
                             "HR ҳужжати ўчирилди",
                             "HR-документ удалён",
                             "HR document deleted"),
    "act.document.bulk": ("HR hujjatlari ommaviy qayta ishlandi",
                          "HR ҳужжатлари оммавий қайта ишланди",
                          "Массовая обработка HR-документов",
                          "HR documents bulk-processed"),
    "act.day.reopened": ("Yopilgan kun qayta ochildi",
                         "Ёпилган кун қайта очилди",
                         "Закрытый день переоткрыт",
                         "Closed day re-opened"),
    "act.cleanup.wipe": ("Kun ma'lumotlari butunlay o'chirildi",
                         "Кун маълумотлари бутунлай ўчирилди",
                         "Данные за день полностью стёрты",
                         "Day's data wiped"),
    "act.user.role_updated": ("Foydalanuvchi roli o'zgartirildi",
                              "Фойдаланувчи роли ўзгартирилди",
                              "Роль пользователя изменена",
                              "User role updated"),
    "act.user.role_added": ("Foydalanuvchiga rol berildi",
                            "Фойдаланувчига рол берилди",
                            "Пользователю выдана роль",
                            "Role added to user"),
    "act.user.role_removed": ("Foydalanuvchidan rol olib tashlandi",
                              "Фойдаланувчидан рол олиб ташланди",
                              "У пользователя снята роль",
                              "Role removed from user"),
    "act.user.deleted": ("Foydalanuvchi akkaunti o'chirildi",
                         "Фойдаланувчи аккаунти ўчирилди",
                         "Аккаунт пользователя удалён",
                         "User account deleted"),
    "act.profile.created": ("Profil yaratildi", "Профил яратилди",
                            "Профиль создан", "Profile created"),
    "act.profile.updated": ("Profil o'zgartirildi", "Профил ўзгартирилди",
                            "Профиль изменён", "Profile updated"),
    "act.profile.role_switched": ("Profil roli almashtirildi",
                                  "Профил роли алмаштирилди",
                                  "Роль профиля изменена",
                                  "Profile role switched"),
    "act.profile.deleted": ("Profil o'chirildi", "Профил ўчирилди",
                            "Профиль удалён", "Profile deleted"),
    "act.profile.unassigned": ("Profil egasidan ajratildi",
                               "Профил эгасидан ажратилди",
                               "Профиль отвязан от владельца",
                               "Profile unassigned from holder"),
    "act.cell.created": ("Yacheyka yaratildi", "Ячейка яратилди",
                         "Ячейка создана", "Cell created"),
    "act.cell.updated": ("Yacheyka o'zgartirildi", "Ячейка ўзгартирилди",
                         "Ячейка изменена", "Cell updated"),
    "act.cell.deleted": ("Yacheyka o'chirildi", "Ячейка ўчирилди",
                         "Ячейка удалена", "Cell deleted"),
    "act.idle_cell.saved": ("Yacheyka bo'yicha kutish kiritildi",
                            "Ячейка бўйича кутиш киритилди",
                            "Внесены данные ожидания по ячейке",
                            "Per-cell idle time entered"),
    "act.idle_cell.deleted": ("Yacheyka bo'yicha kutish yozuvi o'chirildi",
                              "Ячейка бўйича кутиш ёзуви ўчирилди",
                              "Удалена запись ожидания по ячейке",
                              "Per-cell idle entry deleted"),
    "act.concern.created": ("Xavotir yaratildi", "Хавотир яратилди",
                            "Создано замечание (Xavotir)", "Concern created"),

    # detail / field labels
    "l.unit": ("Brigada", "Бригада", "Бригада", "Unit"),
    "l.units": ("Brigadalar", "Бригадалар", "Бригады", "Units"),
    "l.date": ("Sana", "Сана", "Дата", "Date"),
    "l.worker": ("Xodim", "Ходим", "Сотрудник", "Worker"),
    "l.workers": ("Xodimlar", "Ходимлар", "Сотрудники", "Workers"),
    "l.count": ("Soni", "Сони", "Количество", "Count"),
    "l.supervisor": ("Brigadir", "Бригадир", "Бригадир", "Supervisor"),
    "l.document": ("Hujjat", "Ҳужжат", "Документ", "Document"),
    "l.request": ("So'rov", "Сўров", "Запрос", "Request"),
    "l.user": ("Foydalanuvchi", "Фойдаланувчи", "Пользователь", "User"),
    "l.account": ("Akkaunt", "Аккаунт", "Аккаунт", "Account"),
    "l.role": ("Rol", "Рол", "Роль", "Role"),
    "l.profile": ("Profil", "Профил", "Профиль", "Profile"),
    "l.cell": ("Yacheyka", "Ячейка", "Ячейка", "Cell"),
    "l.deleted_rows": ("O'chirilgan qatorlar", "Ўчирилган қаторлар",
                       "Удалено строк", "Rows deleted"),
    "l.status": ("Holat", "Ҳолат", "Статус", "Status"),
    "l.name": ("Nomi", "Номи", "Название", "Name"),
    "l.shift": ("Smena", "Смена", "Смена", "Shift"),
    "l.job_title": ("Lavozim", "Лавозим", "Должность", "Job title"),
    "l.schedule": ("Jadval", "Жадвал", "График", "Schedule"),
    "l.hours_worked": ("Soatlar", "Соатлар", "Часы", "Hours"),
    "l.archived": ("Arxivlangan", "Архивланган", "Архивирован", "Archived"),
    "l.verifix_code": ("Verifix kodi", "Verifix коди", "Код Verifix", "Verifix code"),
    "l.sap_code": ("SAP kodi", "SAP коди", "Код SAP", "SAP code"),
    "l.leader": ("Lider", "Лидер", "Лидер", "Leader"),
    "l.cells": ("Yacheykalar", "Ячейкалар", "Ячейки", "Cells"),
    "l.note": ("Izoh", "Изоҳ", "Примечание", "Note"),
    "l.category": ("Kategoriya", "Категория", "Категория", "Category"),
    "l.stopped": ("To'xtaganda", "Тўхтаганда", "Остановлена (мин)", "Stopped (min)"),
    "l.not_stopped": ("To'xtamaganda", "Тўхтамаганда",
                      "Не остановлена (мин)", "Not stopped (min)"),
    "l.text": ("Matn", "Матн", "Текст", "Text"),
    "l.deadline": ("Muddat (kun)", "Муддат (кун)", "Срок (дней)", "Deadline (days)"),

    # misc values
    "doc.people_exchange": ("Xodim ko'chirish", "Ходим кўчириш",
                            "Перевод сотрудника", "People exchange"),
    "doc.role_change": ("Lavozim o'zgarishi", "Лавозим ўзгариши",
                        "Смена должности", "Role change"),
    "v.request_delete": ("o'chirish so'rovi", "ўчириш сўрови",
                         "запрос на удаление", "deletion request"),
    "v.yes": ("ha", "ҳа", "да", "yes"),
    "v.no": ("yo'q", "йўқ", "нет", "no"),
    "v.account_deleted": ("akkaunt to'liq o'chirildi", "аккаунт тўлиқ ўчирилди",
                          "аккаунт удалён целиком", "whole account deleted"),
    "v.archived": ("arxivlandi", "архивланди", "архивирован", "archived"),
    "v.approved": ("tasdiqlangan", "тасдиқланган", "проведён", "approved"),
    "v.draft": ("qoralama", "қоралама", "черновик", "draft"),
    "v.rejected": ("rad etilgan", "рад этилган", "отклонён", "rejected"),
    "v.removed": ("o'chirildi", "ўчирилди", "удалён", "removed"),
}


def _t(lang: str, key: str) -> str:
    row = _T.get(key)
    if not row:
        return key
    try:
        return row[_LANGS.index(lang)]
    except ValueError:
        return row[3]


def _label(lang: str, key) -> str:
    """Detail/field label: known ``l.<key>`` strings translate, anything else
    (a worker name used as a diff-row key, a raw field) renders as-is."""
    if isinstance(key, tuple) and len(key) == 2 and key[0] == "__t__":
        return _t(lang, key[1])
    if ("l." + str(key)) in _T:
        return _t(lang, "l." + str(key))
    return str(key)


def _val(lang: str, v) -> str:
    if isinstance(v, tuple) and len(v) == 2 and v[0] == "__t__":
        return _t(lang, v[1])
    if v is None or v == "":
        return "—"
    if isinstance(v, bool):
        return _t(lang, "v.yes" if v else "v.no")
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def _esc(s) -> str:
    return _esc_raw(str(s), quote=False)


# ── rendering ─────────────────────────────────────────────────────────────────

def _who_line(ctx: dict, lang: str) -> str:
    role_label = _t(lang, "role." + ctx["role"]) if ("role." + ctx["role"]) in _T else ctx["role"]
    bits = [f"<b>{_esc(ctx['actor_name'])}</b> — {_esc(role_label)}"]
    if ctx.get("tg_name") and ctx["tg_name"] != ctx["actor_name"]:
        bits.append(_esc(ctx["tg_name"]))
    if ctx.get("username"):
        bits.append("@" + _esc(ctx["username"]))
    bits.append(f"<code>{ctx['telegram_id']}</code>")
    return " · ".join(bits)


def _grant_lines(ctx: dict, lang: str) -> list[str]:
    cap = ctx["capability"]
    if cap.startswith(CAP_PAGE_PREFIX):
        cap_label = _t(lang, "cap.page.view").format(page=cap[len(CAP_PAGE_PREFIX):])
    else:
        cap_label = _t(lang, "cap." + cap)
    first = f"<b>{_esc(cap_label)}</b>"
    if ctx.get("scope"):
        first += f" · {_esc(_t(lang, 'scope.' + ctx['scope']))}"
    lines = [first]
    if ctx.get("granted_by"):
        lines.append(_esc_raw(_t(lang, "granted_by")).format(
            name=_esc(ctx["granted_by"]), date=ctx.get("granted_at") or "—"))
    elif ctx.get("grant_missing"):
        lines.append(_esc(_t(lang, "grant_gone")))
    return lines


def _rich_html(ctx: dict, lang: str) -> str:
    parts = [f"<h4>⚠️ {_esc(_t(lang, 'title'))}</h4>",
             f"<p>👤 {_who_line(ctx, lang)}</p>",
             "<blockquote>🔑 " + "<br>".join(_grant_lines(ctx, lang)) + "</blockquote>",
             f"<p><b>{_esc(_t(lang, 'act.' + ctx['action']))}</b></p>"]
    if ctx.get("details"):
        parts.append("<p>" + "<br>".join(
            f"{_esc(_label(lang, k))}: <b>{_esc(_val(lang, v))}</b>"
            for k, v in ctx["details"]) + "</p>")
    changes = ctx.get("changes") or []
    if changes:
        rows = [f"<tr><th>{_esc(_t(lang, 'col.field'))}</th>"
                f"<th>{_esc(_t(lang, 'col.old'))}</th>"
                f"<th>{_esc(_t(lang, 'col.new'))}</th></tr>"]
        for k, old, new in changes[:_MAX_ROWS]:
            rows.append(f"<tr><td>{_esc(_label(lang, k))}</td>"
                        f"<td>{_esc(_val(lang, old))}</td>"
                        f"<td>{_esc(_val(lang, new))}</td></tr>")
        if len(changes) > _MAX_ROWS:
            extra = _t(lang, "more_rows").format(n=len(changes) - _MAX_ROWS)
            rows.append(f'<tr><td colspan="3">{_esc(extra)}</td></tr>')
        parts.append("<table bordered striped>" + "".join(rows) + "</table>")
    parts.append(f"<p>🕒 <i>{ctx['when']}</i></p>")
    return "".join(parts)


def _plain_html(ctx: dict, lang: str, max_rows: int = _MAX_ROWS) -> str:
    lines = [f"⚠️ <b>{_esc(_t(lang, 'title'))}</b>", "",
             "👤 " + _who_line(ctx, lang),
             "<blockquote>🔑 " + "\n".join(_grant_lines(ctx, lang)) + "</blockquote>",
             f"<b>{_esc(_t(lang, 'act.' + ctx['action']))}</b>"]
    for k, v in ctx.get("details") or []:
        lines.append(f"{_esc(_label(lang, k))}: <b>{_esc(_val(lang, v))}</b>")
    changes = ctx.get("changes") or []
    if changes:
        lines.append("")
        for k, old, new in changes[:max_rows]:
            lines.append(f"• {_esc(_label(lang, k))}: {_esc(_val(lang, old))} → {_esc(_val(lang, new))}")
        if len(changes) > max_rows:
            lines.append(_esc(_t(lang, "more_rows").format(n=len(changes) - max_rows)))
    lines.append("")
    lines.append(f"🕒 <i>{ctx['when']}</i>")
    text = "\n".join(lines)
    # Telegram caps plain messages at 4096 chars — shrink the diff, then the
    # whole body, rather than losing the warning to a length error.
    if len(text) > 4000 and max_rows > 5:
        return _plain_html(ctx, lang, max_rows=5)
    return text[:4000]


# ── persistence (the admin «Action history» tab) ─────────────────────────────

def _plain(v):
    """JSONB-safe value: tv markers become 2-elem lists, dates/decimals become
    strings, primitives pass through."""
    if isinstance(v, tuple):
        return list(v)
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def _record_use(db: Session, ctx: dict) -> None:
    """One capability_uses row per warned action — the audit trail behind the
    DMs. Its own try/rollback: a failed insert must neither break the request
    nor stop the DM fan-out."""
    try:
        db.add(CapabilityUse(
            telegram_id=ctx["telegram_id"],
            actor_name=ctx["actor_name"],
            actor_role=ctx["role"],
            capability=ctx["capability"],
            scope=ctx["scope"],
            granted_by=ctx["granted_by"],
            action=ctx["action"],
            details=[[_plain(x) for x in row] for row in ctx["details"]],
            changes=[[_plain(x) for x in row] for row in ctx["changes"]],
        ))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("capability use row failed (cap=%s act=%s)",
                       ctx["capability"], ctx["action"], exc_info=True)


def _unmark(v):
    """JSONB value back to renderer form: ["__t__", key] lists become tv
    marker tuples again."""
    if isinstance(v, list) and len(v) == 2 and v[0] == "__t__":
        return (v[0], v[1])
    return v


def render_use(row, lang: str) -> dict:
    """One capability_uses row rendered for the viewer's language — the
    /admin/capability-uses payload, translated through the same table the
    DMs use so tab and DM always read identically."""
    cap = row.capability
    if cap.startswith(CAP_PAGE_PREFIX):
        cap_label = _t(lang, "cap.page.view").format(page=cap[len(CAP_PAGE_PREFIX):])
    else:
        cap_label = _t(lang, "cap." + cap)
    role = row.actor_role or "?"
    return {
        "id": row.id,
        "at": (row.created_at.astimezone(_TASHKENT).strftime("%d.%m.%Y %H:%M")
               if row.created_at else None),
        "actor": row.actor_name,
        "role": _t(lang, "role." + role) if ("role." + role) in _T else role,
        "telegram_id": row.telegram_id,
        "capability": cap_label,
        "scope": _t(lang, "scope." + row.scope) if row.scope in SCOPES_RENDERED else None,
        "granted_by": row.granted_by,
        "action": _t(lang, "act." + row.action),
        "details": [{"label": _label(lang, k), "value": _val(lang, _unmark(v))}
                    for k, v in (row.details or [])],
        "changes": [{"field": _label(lang, k), "old": _val(lang, _unmark(o)),
                     "new": _val(lang, _unmark(n))}
                    for k, o, n in (row.changes or [])],
    }


SCOPES_RENDERED = ("own", "all")


# ── sending ───────────────────────────────────────────────────────────────────

def _fan_out(ctx: dict) -> None:
    # Deferred imports: telegram_bot/broadcast are heavyweight and this module
    # is imported by routers at startup.
    from app.routers.broadcast import _tg_api
    from app.telegram_bot import _admin_ids, _get_lang, _send_html_message

    recipients = sorted(_admin_ids() - {ctx["telegram_id"]})
    for admin_id in recipients:
        try:
            lang = _get_lang(admin_id)
            try:
                rich = {"html": _rich_html(ctx, lang), "is_rtl": False}
                _tg_api("sendRichMessage",
                        {"chat_id": admin_id, "rich_message": json.dumps(rich)})
            except Exception:
                # Old client / rich rejected → the plain body must still land.
                _send_html_message(admin_id, _plain_html(ctx, lang))
        except Exception:
            logger.warning("capability alert to admin %s failed (cap=%s act=%s)",
                           admin_id, ctx["capability"], ctx["action"], exc_info=True)


def alert_grant_use(db: Session, caller: dict, capability: str, action: str,
                    details: list | None = None,
                    changes: list | None = None,
                    native: bool | None = None) -> None:
    """Warn every admin that ``caller`` just performed ``action`` through a
    capability grant. No-op when the actor's own role already authorized it:
    by role via _NATIVE_ROLES when ``native`` is None, or per-object when the
    call site passes ``native`` explicitly (documents).

    ``details`` — [(label_key_or_text, value)] identification lines.
    ``changes`` — [(field_label_key_or_text, old, new)] rendered as the
    old→new table (rich) / bullet lines (plain). Values may be ``tv(key)``
    markers for per-recipient translation. Never raises."""
    try:
        role = (caller or {}).get("role") or "?"
        if native is None:
            native = role in _NATIVE_ROLES.get(capability, _DEFAULT_NATIVE)
        if native or role == "admin":
            return
        try:
            telegram_id = int(caller.get("sub"))
        except (TypeError, ValueError):
            return

        user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
        grant = db.query(UserCapability).filter_by(
            telegram_id=telegram_id, capability=capability).first()

        ctx = {
            "capability": capability,
            "action": action,
            "role": role,
            "telegram_id": telegram_id,
            "actor_name": caller.get("full_name")
                          or (user.tg_name if user else None) or f"#{telegram_id}",
            "tg_name": user.tg_name if user else None,
            "username": user.username if user else None,
            "scope": grant.scope if grant else None,
            "granted_by": grant.granted_by if grant else None,
            "granted_at": (grant.granted_at.astimezone(_TASHKENT).strftime("%d.%m.%Y")
                           if grant and grant.granted_at else None),
            "grant_missing": grant is None,
            "details": list(details or []),
            "changes": list(changes or []),
            "when": datetime.now(_TASHKENT).strftime("%d.%m.%Y %H:%M"),
        }
        threading.Thread(target=_fan_out, args=(ctx,), daemon=True,
                         name="cap-alert").start()
    except Exception:
        logger.warning("capability alert failed (cap=%s act=%s)",
                       capability, action, exc_info=True)
