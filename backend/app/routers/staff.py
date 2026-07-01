"""
Staff (Xodimlar) — attendance editing & approval workflow.

Access:
  supervisor    → view workers, creates edit/delete requests
  shift-manager → sees requests for their shift, approves/rejects
  admin         → view/edit/delete directly, actions logged as processed requests
"""
from collections import defaultdict
from datetime import date, datetime, timezone
from io import BytesIO
from typing import Annotated, List, Optional
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy import distinct, func, or_, and_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.database import get_db
from app.notify_ctx import notifications_suppressed
from app.permissions import get_page_access, role_can_access, require_page
from app.translit import transliterate
from app.models import (
    Admin, Attendance, DayApproval, EditRequest, ExchangeTask, HrDocument,
    HrDocumentHistory, Manager, Notification, TelegramUser, TelegramUserRole,
)
from app.services.day_state import confirmed_pairs, day_state

router = APIRouter(prefix="/api/staff", tags=["staff"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

SHIFT_ROLE_IDS = {1: [1, 2], 2: [3, 4]}
STAFF_ROLES = {"admin", "supervisor", "shift-manager"}

# Roles that exist only as verifix-imported job titles and may NOT be chosen as
# the target of a Role Change document — staff can only acquire them via verifix
# uploads. This restriction applies ONLY to the role-change target picker; these
# roles still import freely and show everywhere else (staff filter, etc.).
# Bare "Кондитер" is intentionally assignable — only its "Кондитер/…"
# sub-department composites are blocked (handled by the prefix below).
VERIFIX_ONLY_TARGET_ROLES = {
    "Скульптор",
    "Фасовщик",
    "Бригадир",
    "Разработчик",
    "Оператор производственного оборудования",
    "Просеивальщик",
}
_KONDITER_COMPOSITE_PREFIX = "Кондитер/"


def is_assignable_target_role(job_title: str) -> bool:
    """True if `job_title` may be selected as the target of a Role Change document.

    Blocked: the verifix-only base roles above, plus any "Кондитер/…" composite
    (a sub-department). Bare "Кондитер" stays assignable.
    """
    jt = (job_title or "").strip()
    if not jt:
        return False
    if jt in VERIFIX_ONLY_TARGET_ROLES:
        return False
    if jt.startswith(_KONDITER_COMPOSITE_PREFIX):
        return False
    return True


# ── Auth helpers ───────────────────────────────────────────────────────────────

def _get_caller(token: Annotated[str, Depends(_oauth2)]):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _require_staff(caller=Depends(_get_caller), db: Session = Depends(get_db)):
    # Staff endpoints back both the Staff and Daily pages; allow the caller if
    # their role may access either page (admin always passes).
    if not role_can_access(caller.get("role"), ["staff", "daily"], get_page_access(db)):
        raise HTTPException(status_code=403, detail="Access denied")
    return caller


# ── Notification helpers ───────────────────────────────────────────────────────

_MONTHS = {
    "uz": ["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"],
    "uz_cyrl": ["январ","феврал","март","апрел","май","июн","июл","август","сентабр","октабр","ноябр","декабр"],
    "ru": ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],
    "en": ["January","February","March","April","May","June","July","August","September","October","November","December"],
}

_NOTIF_STRINGS: dict[str, dict[str, tuple[str, str]]] = {
    "day_closed": {
        "uz": ("Kun yopildi", "Sana: {date} | Yopdi: {closer_name}"),
        "uz_cyrl": ("Кун ёпилди", "Сана: {date} | Ёпди: {closer_name}"),
        "ru": ("День закрыт", "Дата: {date} | Закрыл(а): {closer_name}"),
        "en": ("Day closed", "Date: {date} | Closed by: {closer_name}"),
    },
    "day_reopened": {
        "uz": ("Kun qayta ochildi: {reopener_name}", "Sana: {date} — kun yana ochiq, ma'lumotlar yopilgunga qadar ko'rinmaydi"),
        "uz_cyrl": ("Кун қайта очилди: {reopener_name}", "Сана: {date} — кун яна очиқ, маълумотлар ёпилгунга қадар кўринмайди"),
        "ru": ("День переоткрыт: {reopener_name}", "Дата: {date} — день снова открыт, данные скрыты до закрытия"),
        "en": ("Day re-opened by {reopener_name}", "Date: {date} — the day is open again, data is hidden until it is closed"),
    },
    "verifix_uploaded": {
        "uz": ("Verifix ma'lumotlari yuklandi", "Sana: {date}. O'zgartirishlarni kiriting (xodim almashtirish, lavozim o'zgartirish, o'chirish) va kunni yoping."),
        "uz_cyrl": ("Verifix маълумотлари юкланди", "Сана: {date}. Ўзгартиришларни киритинг (ходим алмаштириш, лавозим ўзгартириш, ўчириш) ва кунни ёпинг."),
        "ru": ("Данные Verifix загружены", "Дата: {date}. Внесите изменения (обмен сотрудниками, смена должности, удаление) и закройте день."),
        "en": ("Verifix data uploaded", "Date: {date}. Make your changes (people exchange, role change, deletion), then close the day."),
    },
    "new_role_change": {
        "uz": ("{actor_name} lavozim o'zgarishi hujjati yubordi", "{count} xodim → {new_role} | Sana: {date}"),
        "uz_cyrl": ("{actor_name} лавозим ўзгариши ҳужжати юборди", "{count} ходим → {new_role} | Сана: {date}"),
        "ru": ("Новый документ смены должности от {actor_name}", "{count} сотр. → {new_role} | Дата: {date}"),
        "en": ("New Role Change document from {actor_name}", "{count} employee(s) → {new_role} | Date: {date}"),
    },
    "new_edit_request": {
        "uz": ("{supervisor_name} tahrirlash so'rovi yubordi", "Xodim: {worker_name} | Sana: {date}"),
        "uz_cyrl": ("{supervisor_name} таҳрирлаш сўрови юборди", "Ходим: {worker_name} | Сана: {date}"),
        "ru": ("Запрос на редактирование от {supervisor_name}", "Сотрудник: {worker_name} | Дата: {date}"),
        "en": ("New edit request from {supervisor_name}", "Worker: {worker_name} | Date: {date}"),
    },
    "new_delete_request": {
        "uz": ("{supervisor_name} o'chirish so'rovi yubordi", "Xodim: {worker_name} | Sana: {date}"),
        "uz_cyrl": ("{supervisor_name} ўчириш сўрови юборди", "Ходим: {worker_name} | Сана: {date}"),
        "ru": ("Запрос на удаление от {supervisor_name}", "Сотрудник: {worker_name} | Дата: {date}"),
        "en": ("New delete request from {supervisor_name}", "Worker: {worker_name} | Date: {date}"),
    },
    "bulk_delete_request": {
        "uz": ("{supervisor_name} ommaviy o'chirish so'rovi yubordi", "{count} xodim | Sana: {date}"),
        "uz_cyrl": ("{supervisor_name} оммавий ўчириш сўрови юборди", "{count} ходим | Сана: {date}"),
        "ru": ("Массовый запрос на удаление от {supervisor_name}", "{count} сотр. | Дата: {date}"),
        "en": ("Bulk delete request from {supervisor_name}", "{count} worker(s) | Date: {date}"),
    },
    "request_approved_supervisor": {
        "uz": ("So'rovingiz tasdiqlandi", "Xodim: {worker_name} | Sana: {date} | Tasdiqladi: {processor_name}"),
        "uz_cyrl": ("Сўровингиз тасдиқланди", "Ходим: {worker_name} | Сана: {date} | Тасдиқлади: {processor_name}"),
        "ru": ("Ваш запрос одобрен", "Сотрудник: {worker_name} | Дата: {date} | Одобрил(а): {processor_name}"),
        "en": ("Your request was approved", "Worker: {worker_name} | Date: {date} | By: {processor_name}"),
    },
    "request_rejected_supervisor": {
        "uz": ("So'rovingiz rad etildi", "Xodim: {worker_name} | Sana: {date} | Rad etdi: {processor_name}"),
        "uz_cyrl": ("Сўровингиз рад этилди", "Ходим: {worker_name} | Сана: {date} | Рад этди: {processor_name}"),
        "ru": ("Ваш запрос отклонён", "Сотрудник: {worker_name} | Дата: {date} | Отклонил(а): {processor_name}"),
        "en": ("Your request was rejected", "Worker: {worker_name} | Date: {date} | By: {processor_name}"),
    },
    "request_approved_others": {
        "uz": ("{processor_name} so'rovni tasdiqladi", "Brigadir: {supervisor_name} | Xodim: {worker_name} | Sana: {date}"),
        "uz_cyrl": ("{processor_name} сўровни тасдиқлади", "Бригадир: {supervisor_name} | Ходим: {worker_name} | Сана: {date}"),
        "ru": ("Запрос одобрен: {processor_name}", "Бригадир: {supervisor_name} | Сотрудник: {worker_name} | Дата: {date}"),
        "en": ("Request approved by {processor_name}", "Supervisor: {supervisor_name} | Worker: {worker_name} | Date: {date}"),
    },
    "request_rejected_others": {
        "uz": ("{processor_name} so'rovni rad etdi", "Brigadir: {supervisor_name} | Xodim: {worker_name} | Sana: {date}"),
        "uz_cyrl": ("{processor_name} сўровни рад этди", "Бригадир: {supervisor_name} | Ходим: {worker_name} | Сана: {date}"),
        "ru": ("Запрос отклонён: {processor_name}", "Бригадир: {supervisor_name} | Сотрудник: {worker_name} | Дата: {date}"),
        "en": ("Request rejected by {processor_name}", "Supervisor: {supervisor_name} | Worker: {worker_name} | Date: {date}"),
    },
    "request_undone": {
        "uz": ("So'rov bekor qilindi", "Xodim: {worker_name} | Sana: {date} | Bekor qildi: {undoer}"),
        "uz_cyrl": ("Сўров бекор қилинди", "Ходим: {worker_name} | Сана: {date} | Бекор қилди: {undoer}"),
        "ru": ("Запрос отменён", "Сотрудник: {worker_name} | Дата: {date} | Отменил(а): {undoer}"),
        "en": ("A request was undone", "Worker: {worker_name} | Date: {date} | By: {undoer}"),
    },
    "admin_record_edited": {
        "uz": ("Admin xodim yozuvini tahrirladi", "Xodim: {worker_name} | Sana: {date} | Kim: {admin_name}"),
        "uz_cyrl": ("Админ ходим ёзувини таҳрирлади", "Ходим: {worker_name} | Сана: {date} | Ким: {admin_name}"),
        "ru": ("Администратор отредактировал запись", "Сотрудник: {worker_name} | Дата: {date} | Кто: {admin_name}"),
        "en": ("Admin edited a worker record", "Worker: {worker_name} | Date: {date} | By: {admin_name}"),
    },
    "admin_record_deleted": {
        "uz": ("Admin xodim yozuvini o'chirdi", "Xodim: {worker_name} | Sana: {date} | Kim: {admin_name}"),
        "uz_cyrl": ("Админ ходим ёзувини ўчирди", "Ходим: {worker_name} | Сана: {date} | Ким: {admin_name}"),
        "ru": ("Администратор удалил запись", "Сотрудник: {worker_name} | Дата: {date} | Кто: {admin_name}"),
        "en": ("Admin deleted a worker record", "Worker: {worker_name} | Date: {date} | By: {admin_name}"),
    },
    "worker_exchange_created": {
        "uz": ("{actor_name} xodim almashinuvi yaratdi", "{count} xodim → {target} | Sana: {date}"),
        "uz_cyrl": ("{actor_name} ходим алмашинуви яратди", "{count} ходим → {target} | Сана: {date}"),
        "ru": ("Новый обмен сотрудниками от {actor_name}", "{count} сотр. → {target} | Дата: {date}"),
        "en": ("New worker exchange from {actor_name}", "{count} worker(s) → {target} | Date: {date}"),
    },
    "worker_exchange_approved": {
        "uz": ("Xodim almashinuvi tasdiqlandi", "{count} xodim → {target} | Sana: {date}"),
        "uz_cyrl": ("Ходим алмашинуви тасдиқланди", "{count} ходим → {target} | Сана: {date}"),
        "ru": ("Обмен сотрудниками одобрен", "{count} сотр. → {target} | Дата: {date}"),
        "en": ("Worker exchange approved", "{count} worker(s) → {target} | Date: {date}"),
    },
    "worker_exchange_cancelled": {
        "uz": ("Xodim almashinuvi bekor qilindi", "{count} xodim → {target} | Sana: {date}"),
        "uz_cyrl": ("Ходим алмашинуви бекор қилинди", "{count} ходим → {target} | Сана: {date}"),
        "ru": ("Обмен сотрудниками отменён", "{count} сотр. → {target} | Дата: {date}"),
        "en": ("Worker exchange cancelled", "{count} worker(s) → {target} | Date: {date}"),
    },
    "document_rejected": {
        "uz": ("{actor_name} hujjatingizni rad etdi", "{doc_label} | Sana: {date}"),
        "uz_cyrl": ("{actor_name} ҳужжатингизни рад этди", "{doc_label} | Сана: {date}"),
        "ru": ("{actor_name} отклонил(а) ваш документ", "{doc_label} | Дата: {date}"),
        "en": ("{actor_name} rejected your document", "{doc_label} | Date: {date}"),
    },
}


def _fmt_date(d, lang: str) -> str:
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d)
        except ValueError:
            return str(d)
    months = _MONTHS.get(lang, _MONTHS["en"])
    month_name = months[d.month - 1]
    if lang == "en":
        return f"{month_name} {d.day}, {d.year}"
    return f"{d.day} {month_name} {d.year}"


def _get_user_lang(db: Session, telegram_id: int) -> str:
    """The recipient's saved language, used to render their Telegram DM. Seeded
    admins have no telegram_users row, so fall back to the admins table."""
    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
    if user and user.language:
        return user.language
    admin = db.query(Admin).filter_by(telegram_id=telegram_id).first()
    if admin and admin.language:
        return admin.language
    return "uz"


def _mk_notif(nkey: str, params: dict, lang: str) -> tuple[str, str]:
    """Render a notification template (title, body) in ``lang``. Pure — given the
    same key + raw params it produces the same output, so the bell can call it at
    *view time* in each viewer's current language (see routers/notifications.py)."""
    params = params or {}
    strings = _NOTIF_STRINGS.get(nkey, {})
    title_tmpl, body_tmpl = strings.get(lang) or strings.get("en") or (nkey, "")
    # Latinise embedded DB values (names, job titles) for uz/en so notifications
    # match the dashboard; ru/uz_cyrl keep the original Cyrillic. No-op on the
    # already-Latin/non-string params (count, etc.).
    localized = {k: transliterate(v, lang) for k, v in params.items()}
    if "date" in params:
        localized["date"] = _fmt_date(params["date"], lang)
    # Language-derived params: resolve from the raw value so the label localises
    # to the *viewer's* language, not the creator's (doc_type → doc_label).
    if "doc_type" in params:
        localized["doc_label"] = _doc_label(params["doc_type"], lang)
    return title_tmpl.format(**localized), body_tmpl.format(**localized)


def _jsonify_params(params: dict) -> dict:
    """Make a template params dict JSON-storable: dates → ISO strings; everything
    else (names, counts, slugs) is already JSON-safe."""
    return {
        k: (v.isoformat() if isinstance(v, (date, datetime)) else v)
        for k, v in (params or {}).items()
    }


def _notify(
    db: Session, telegram_id: int, title: str | None = None, body: str | None = None,
    type: str = "info", dm: bool = True, *,
    nkey: str | None = None, params: dict | None = None, lang: str | None = None,
):
    # Ghost Mode (admin header toggle): the change still applies and is recorded
    # in the audit trail, but no bell/Telegram notification is pushed to anyone.
    if notifications_suppressed():
        return
    if nkey is not None:
        # Template row: store the key + raw params so the bell renders it in each
        # viewer's current language. title/body are also stored, rendered in the
        # recipient's language, for the Telegram DM and as a legacy fallback.
        if lang is None:
            lang = _get_user_lang(db, telegram_id)
        title, body = _mk_notif(nkey, params or {}, lang)
        db.add(Notification(
            recipient_telegram_id=telegram_id, nkey=nkey,
            params=_jsonify_params(params or {}), title=title, body=body, type=type,
        ))
    else:
        title, body = title or "", body or ""
        db.add(Notification(recipient_telegram_id=telegram_id, title=title, body=body, type=type))
    if dm:
        try:
            from app.telegram_bot import send_tg_notification
            send_tg_notification(telegram_id, title, body)
        except Exception:
            pass


def _get_shift_for_manager(db: Session, manager_id: int) -> int:
    mgr = db.query(Manager).filter_by(id=manager_id).first()
    return mgr.shift if mgr else 1


def _assert_day_open(db: Session, manager_id: int, d: date):
    """Supervisors may not submit changes once they have closed the day."""
    if db.query(DayApproval).filter_by(manager_id=manager_id, date=d).first():
        raise HTTPException(
            status_code=409,
            detail="Day is closed — changes can no longer be submitted for this date",
        )


def _find_supervisor(db: Session, manager_id: int) -> Optional[TelegramUserRole]:
    """The approved supervisor role instance for a unit. Role instances live in
    telegram_user_roles (a person may hold several roles); the returned row
    carries the telegram_id and the role-scoped full_name."""
    return db.query(TelegramUserRole).filter(
        TelegramUserRole.role == "supervisor",
        TelegramUserRole.role_id == manager_id,
        TelegramUserRole.status == "approved",
    ).first()


def _notify_all_parties(
    db: Session,
    manager_id: int,
    nkey: str,
    params: dict,
    ntype: str = "info",
    actor_tg_id: int = None,
    include_supervisor: bool = True,
    admin_dm: bool = True,
):
    """Notify admins + relevant shift-managers + optionally supervisor, excluding
    the actor. Each recipient receives the notification in their own language.

    When ``admin_dm`` is False, admins still get the in-app (bell) notification
    but NOT the plain Telegram DM — used on request-creation events where admins
    instead receive the rich approve/reject button-message (see app.approvals)."""
    admin_ids: set[int] = {a.telegram_id for a in db.query(Admin).all()}
    recipients: set[int] = set(admin_ids)

    # Shift-managers for this manager's shift — anyone holding such a role,
    # regardless of which role they are currently switched into
    shift    = _get_shift_for_manager(db, manager_id)
    role_ids = SHIFT_ROLE_IDS.get(shift, [1, 2])
    recipients.update(
        r.telegram_id
        for r in db.query(TelegramUserRole).filter(
            TelegramUserRole.role == "shift-manager",
            TelegramUserRole.role_id.in_(role_ids),
            TelegramUserRole.status == "approved",
        ).all()
    )

    # Supervisor
    if include_supervisor:
        sup = _find_supervisor(db, manager_id)
        if sup:
            recipients.add(sup.telegram_id)

    for tg_id in recipients:
        if tg_id != actor_tg_id:
            dm = admin_dm or tg_id not in admin_ids
            _notify(db, tg_id, type=ntype, dm=dm, nkey=nkey, params=params)


def notify_supervisor_verifix_upload(
    db: Session, manager_id: int, d: date, actor_tg_id: Optional[int] = None,
):
    """Tell a unit's supervisor that fresh verifix attendance data was uploaded
    for ``d``, so they can make their changes (people exchange, role change,
    deletion) and close the day. Called by the /admin/upload handler after each
    file is inserted — ONLY the supervisor is notified (no admins/shift-managers),
    and the day's close-state is left untouched. No-op when the unit has no
    registered supervisor, or the supervisor is the uploader themselves. The
    caller must commit; the bell row is added to ``db`` and the DM sent inline."""
    sup = _find_supervisor(db, manager_id)
    if not sup or sup.telegram_id == actor_tg_id:
        return
    _notify(db, sup.telegram_id, type="info", nkey="verifix_uploaded", params={"date": d})


def _log_admin_action(
    db: Session,
    manager_id: int,
    attend_date: date,
    worker_name: str,
    action: str,          # "edit" | "delete"
    changes: dict,
    original: dict,
    admin_tg_id: int,
    admin_name: str,
    batch_id: Optional[str] = None,
):
    """Create a pre-approved EditRequest to log an admin's direct action."""
    supervisor = _find_supervisor(db, manager_id)
    sup_tg_id  = supervisor.telegram_id if supervisor else 0
    sup_name   = supervisor.full_name   if supervisor else ""

    logged_changes = {"_initiated_by": "admin", **changes}
    if action == "delete":
        logged_changes["_action"] = "delete"

    now = datetime.now(timezone.utc)
    req = EditRequest(
        manager_id=manager_id,
        supervisor_telegram_id=sup_tg_id,
        supervisor_name=sup_name,
        date=attend_date,
        worker_name=worker_name,
        changes=logged_changes,
        original=original,
        status="approved",
        processed_by_telegram_id=admin_tg_id,
        processed_by_name=admin_name,
        processed_at=now,
        batch_id=batch_id,
    )
    db.add(req)

    nkey = "admin_record_deleted" if action == "delete" else "admin_record_edited"
    _notify_all_parties(
        db, manager_id,
        nkey,
        {"worker_name": worker_name, "date": attend_date, "admin_name": admin_name},
        ntype="info",
        actor_tg_id=admin_tg_id,
        include_supervisor=True,
    )


# ── Field options ──────────────────────────────────────────────────────────────

@router.get("/field-options")
def field_options(db: Session = Depends(get_db)):
    job_titles = [
        r[0] for r in db.query(distinct(Attendance.job_title))
        .filter(Attendance.job_title.isnot(None), Attendance.job_title != "nan", Attendance.job_title != "")
        .order_by(Attendance.job_title).all()
    ]
    schedules = [
        r[0] for r in db.query(distinct(Attendance.schedule))
        .filter(Attendance.schedule.isnot(None), Attendance.schedule != "nan", Attendance.schedule != "")
        .order_by(Attendance.schedule).all()
    ]
    return {
        "job_titles": job_titles,
        "schedules": schedules,
        # Subset selectable as a Role Change target (verifix-only roles removed).
        "assignable_job_titles": [j for j in job_titles if is_assignable_target_role(j)],
    }


# ── Supervisors list (admin picker) ───────────────────────────────────────────

@router.get("/supervisors")
def list_supervisors(caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Admin or shift-manager only")
    q = db.query(Manager).order_by(Manager.shift, Manager.name)
    vis = _visible_manager_ids(db, caller)  # None = all (admin); shift-managers see their shift only
    if vis is not None:
        q = q.filter(Manager.id.in_(vis))
    return [{"manager_id": m.id, "full_name": m.name, "shift": m.shift} for m in q.all()]


# ── Attendance fetch ───────────────────────────────────────────────────────────

@router.get("/attendance")
def get_attendance(
    attend_date: str,
    manager_id: Optional[int] = None,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    role    = caller.get("role")
    role_id = caller.get("role_id")

    if role == "admin":
        if not manager_id:
            raise HTTPException(status_code=400, detail="manager_id required for admin")
    elif role == "supervisor":
        manager_id = role_id
        if not manager_id:
            raise HTTPException(status_code=400, detail="Supervisor has no linked manager")
    elif role == "shift-manager":
        if not manager_id:
            raise HTTPException(status_code=400, detail="manager_id required")
        if not _can_touch_manager(db, caller, manager_id):
            raise HTTPException(status_code=403, detail="Not allowed for this manager")
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    try:
        d = date.fromisoformat(attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    rows = db.query(Attendance).filter(
        Attendance.manager_id == manager_id,
        Attendance.date == d,
        Attendance.worker_name.isnot(None),
        Attendance.worker_name.notin_(["", "nan", "NaN"]),
    ).order_by(Attendance.worker_name).all()

    pending = db.query(EditRequest).filter(
        EditRequest.manager_id == manager_id,
        EditRequest.date == d,
        EditRequest.status == "pending",
    ).all()
    pending_map = {r.worker_name: r for r in pending}

    # Workers moved onto a task (approved people-exchange) stay on this page but
    # show "not came" + a task pill. Map worker_name → task_name.
    task_map: dict[str, str] = {}
    for ex in db.query(HrDocument).filter(
        HrDocument.doc_type   == "people_exchange",
        HrDocument.manager_id == manager_id,
        HrDocument.date       == d,
        HrDocument.status     == "approved",
    ).all():
        pl = ex.payload or {}
        if pl.get("target_type") != "task":
            continue
        for emp in pl.get("employees", []):
            if emp.get("worker_name"):
                task_map[emp["worker_name"]] = pl.get("task_name")

    def _serialize(row: Attendance):
        pr = pending_map.get(row.worker_name)
        return {
            "id":                row.id,
            "worker_name":       row.worker_name,
            "job_title":         row.job_title,
            "schedule":          row.schedule,
            "clock_in_out":      row.clock_in_out,
            "hours_worked":      float(row.hours_worked)      if row.hours_worked      is not None else None,
            "early_arrival_min": float(row.early_arrival_min) if row.early_arrival_min is not None else None,
            "effective_hours":   float(row.effective_hours)   if row.effective_hours   is not None else None,
            "on_task":           task_map.get(row.worker_name),
            "pending_request":   {"id": pr.id, "changes": pr.changes, "original": pr.original} if pr else None,
        }

    # Sum of hours for rows that have no worker name (hidden from table but counted in totals)
    extra_hours = db.query(func.sum(Attendance.hours_worked)).filter(
        Attendance.manager_id == manager_id,
        Attendance.date == d,
        or_(
            Attendance.worker_name.is_(None),
            Attendance.worker_name.in_(["", "nan", "NaN"]),
        ),
        Attendance.hours_worked.isnot(None),
        Attendance.hours_worked > 0,
    ).scalar() or 0.0

    mgr = db.query(Manager).filter_by(id=manager_id).first()

    return {
        "manager_id":   manager_id,
        "manager_name": mgr.name if mgr else None,
        "date":         attend_date,
        "workers":      [_serialize(r) for r in rows],
        "extra_hours":  round(float(extra_hours), 2),
    }


# ── Admin direct update ────────────────────────────────────────────────────────

class DirectUpdateBody(BaseModel):
    manager_id:   int
    attend_date:  str
    worker_name:  str
    job_title:    Optional[str]   = None
    schedule:     Optional[str]   = None
    hours_worked: Optional[float] = None


@router.post("/attendance/update")
def admin_update(body: DirectUpdateBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    d = date.fromisoformat(body.attend_date)
    row = db.query(Attendance).filter(
        Attendance.manager_id == body.manager_id,
        Attendance.date == d,
        Attendance.worker_name == body.worker_name,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    original = {
        "job_title":    row.job_title   or "",
        "schedule":     row.schedule    or "",
        "hours_worked": float(row.hours_worked) if row.hours_worked is not None else None,
    }
    changes = {}
    if body.job_title    is not None: changes["job_title"]    = body.job_title
    if body.schedule     is not None: changes["schedule"]     = body.schedule
    if body.hours_worked is not None: changes["hours_worked"] = body.hours_worked

    if body.job_title    is not None: row.job_title    = body.job_title
    if body.schedule     is not None: row.schedule     = body.schedule
    if body.hours_worked is not None: row.hours_worked = body.hours_worked

    if changes:
        _log_admin_action(
            db, body.manager_id, d, body.worker_name,
            "edit", changes, original,
            int(caller["sub"]), caller.get("full_name", "Admin"),
        )
    db.commit()
    return {"ok": True}


# ── Admin direct delete ────────────────────────────────────────────────────────

class AdminDeleteBody(BaseModel):
    manager_id:  int
    attend_date: str
    worker_name: str


@router.post("/attendance/delete")
def admin_delete(body: AdminDeleteBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    d = date.fromisoformat(body.attend_date)
    row = db.query(Attendance).filter(
        Attendance.manager_id == body.manager_id,
        Attendance.date == d,
        Attendance.worker_name == body.worker_name,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    original = {
        "job_title":    row.job_title   or "",
        "schedule":     row.schedule    or "",
        "hours_worked": float(row.hours_worked) if row.hours_worked is not None else None,
    }

    _log_admin_action(
        db, body.manager_id, d, body.worker_name,
        "delete", {}, original,
        int(caller["sub"]), caller.get("full_name", "Admin"),
    )
    db.delete(row)
    db.commit()
    return {"ok": True}


# ── Admin / Supervisor bulk delete from attendance ────────────────────────────

class BulkDeleteBody(BaseModel):
    manager_id:       Optional[int]  = None   # required for admin
    attend_date:      str
    worker_names:     List[str]
    replace_batch_id: Optional[str]  = None   # supervisor: withdraw old batch before creating new


@router.post("/attendance/bulk-delete")
def bulk_delete_attendance(
    body: BulkDeleteBody,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    role = caller.get("role")
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Not allowed")
    if not body.worker_names:
        raise HTTPException(status_code=400, detail="No workers specified")

    if role == "admin":
        if not body.manager_id:
            raise HTTPException(status_code=400, detail="manager_id required for admin")
        manager_id = body.manager_id
    else:
        manager_id = caller.get("role_id")
        if not manager_id:
            raise HTTPException(status_code=400, detail="Supervisor has no linked manager")

    try:
        d = date.fromisoformat(body.attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    affected = 0
    pending_admin_batch = None   # (batch_id, manager_id, date, supervisor_name, names) for supervisor batches

    if role == "admin":
        # One batch_id per bulk action so the logged requests appear as a
        # single grouped row in the Requests tab.
        admin_batch_id = str(uuid4())
        for worker_name in body.worker_names:
            row = db.query(Attendance).filter(
                Attendance.manager_id  == manager_id,
                Attendance.date        == d,
                Attendance.worker_name == worker_name,
            ).first()
            if not row:
                continue
            original = {
                "job_title":    row.job_title   or "",
                "schedule":     row.schedule    or "",
                "hours_worked": float(row.hours_worked) if row.hours_worked is not None else None,
            }
            _log_admin_action(
                db, manager_id, d, worker_name,
                "delete", {}, original,
                int(caller["sub"]), caller.get("full_name", "Admin"),
                batch_id=admin_batch_id,
            )
            db.delete(row)
            affected += 1
    else:
        # Supervisor → create pending delete requests
        _assert_day_open(db, manager_id, d)
        supervisor_tg_id = int(caller["sub"])
        supervisor_name  = caller.get("full_name", "")

        # If editing an existing batch: withdraw all its pending requests first
        if body.replace_batch_id:
            old_reqs = db.query(EditRequest).filter(
                EditRequest.batch_id == body.replace_batch_id,
                EditRequest.status   == "pending",
            ).all()
            for req in old_reqs:
                req.status = "rejected"

        # Generate one batch_id for all requests created in this call
        new_batch_id = str(uuid4())
        created_names: list[str] = []

        for worker_name in body.worker_names:
            row = db.query(Attendance).filter(
                Attendance.manager_id  == manager_id,
                Attendance.date        == d,
                Attendance.worker_name == worker_name,
            ).first()
            if not row:
                continue
            # Skip if there's already an active pending request for this worker
            # (outside of the batch being replaced)
            existing = db.query(EditRequest).filter(
                EditRequest.manager_id  == manager_id,
                EditRequest.date        == d,
                EditRequest.worker_name == worker_name,
                EditRequest.status      == "pending",
            ).first()
            if existing:
                continue
            original = {
                "job_title":    row.job_title   or "",
                "schedule":     row.schedule    or "",
                "hours_worked": float(row.hours_worked) if row.hours_worked is not None else None,
            }
            db.add(EditRequest(
                manager_id=manager_id,
                supervisor_telegram_id=supervisor_tg_id,
                supervisor_name=supervisor_name,
                date=d,
                worker_name=worker_name,
                changes={"_action": "delete"},
                original=original,
                status="pending",
                batch_id=new_batch_id,
            ))
            created_names.append(worker_name)
            affected += 1

        if affected > 0:
            _notify_all_parties(
                db, manager_id,
                "bulk_delete_request",
                {"supervisor_name": supervisor_name, "count": affected, "date": body.attend_date},
                ntype="info",
                actor_tg_id=supervisor_tg_id,
                include_supervisor=False,
                admin_dm=False,        # admins get the rich approve/reject message instead
            )
            pending_admin_batch = (new_batch_id, manager_id, d, supervisor_name, created_names)

    print(f"[bulk-delete] role={role} manager_id={manager_id} date={body.attend_date} requested={len(body.worker_names)} affected={affected} — committing")
    db.commit()
    print(f"[bulk-delete] commit OK")
    # A replaced batch's old requests were just rejected — clear its admin message.
    if body.replace_batch_id:
        try:
            from app.approvals import edit_admin_notices
            edit_admin_notices("edit_batch", str(body.replace_batch_id), "rejected",
                               caller.get("full_name", ""))
        except Exception:
            pass
    # Supervisor batch → send one approve/reject button-message to admins.
    if pending_admin_batch:
        try:
            from app.approvals import send_edit_batch_to_admins
            send_edit_batch_to_admins(db, *pending_admin_batch)
        except Exception:
            pass
    return {"ok": True, "affected": affected}


# ── Deleted workers (restorable) ─────────────────────────────────────────────

@router.get("/attendance/deleted")
def get_deleted_workers(
    manager_id: Optional[int] = None,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """
    Returns all approved delete-requests that have NOT been undone yet.
    Admin: optional manager_id filter; omit to see all managers' deletions.
    Supervisor: always scoped to their own manager.
    """
    role    = caller.get("role")
    role_id = caller.get("role_id")

    if role == "admin":
        pass  # manager_id is an optional filter; None → all managers
    elif role == "supervisor":
        manager_id = role_id
        if not manager_id:
            raise HTTPException(status_code=400, detail="Supervisor has no linked manager")
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = db.query(EditRequest).filter(
        EditRequest.status == "approved",
        EditRequest.changes["_action"].astext == "delete",
    )
    if manager_id:
        q = q.filter(EditRequest.manager_id == manager_id)

    rows = q.order_by(EditRequest.processed_at.desc().nullslast()).all()

    mgr_names = {m.id: m.name for m in db.query(Manager).all()}

    return [
        {
            "id":            r.id,
            "manager_id":    r.manager_id,
            "manager_name":  mgr_names.get(r.manager_id, "—"),
            "worker_name":   r.worker_name,
            "date":          r.date.isoformat(),
            "original":      r.original or {},
            "deleted_by":    r.processed_by_name or r.supervisor_name or "—",
            "deleted_at":    r.processed_at.isoformat() if r.processed_at else None,
        }
        for r in rows
    ]


# ── Create request (supervisor — edit or delete) ───────────────────────────────

class CreateRequestBody(BaseModel):
    attend_date: str
    worker_name: str
    action:      str  = "edit"   # "edit" | "delete"
    changes:     dict = {}
    original:    dict


@router.post("/requests", status_code=201)
def create_request(body: CreateRequestBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisors only")

    manager_id       = caller.get("role_id")
    supervisor_tg_id = int(caller["sub"])
    supervisor_name  = caller.get("full_name", "")

    if not manager_id:
        raise HTTPException(status_code=400, detail="Supervisor has no linked manager")

    d = date.fromisoformat(body.attend_date)
    _assert_day_open(db, manager_id, d)

    existing = db.query(EditRequest).filter(
        EditRequest.manager_id == manager_id,
        EditRequest.date == d,
        EditRequest.worker_name == body.worker_name,
        EditRequest.status == "pending",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A pending request already exists for this row")

    changes  = {"_action": "delete"} if body.action == "delete" else body.changes
    req = EditRequest(
        manager_id=manager_id,
        supervisor_telegram_id=supervisor_tg_id,
        supervisor_name=supervisor_name,
        date=d,
        worker_name=body.worker_name,
        changes=changes,
        original=body.original,
        status="pending",
    )
    db.add(req)
    db.flush()

    req_nkey = "new_delete_request" if body.action == "delete" else "new_edit_request"
    _notify_all_parties(
        db, manager_id,
        req_nkey,
        {"supervisor_name": supervisor_name, "worker_name": body.worker_name, "date": body.attend_date},
        ntype="info",
        actor_tg_id=supervisor_tg_id,
        include_supervisor=False,  # supervisor created it, no need to notify them
        admin_dm=False,            # admins get the rich approve/reject message instead
    )

    db.commit()
    # Admins get an approve/reject button-message with the full request detail.
    try:
        from app.approvals import send_edit_request_to_admins
        send_edit_request_to_admins(db, req)
    except Exception:
        pass
    return {"id": req.id}


# ── Pending count ──────────────────────────────────────────────────────────────

@router.get("/requests/pending-count")
def pending_count(caller=Depends(_require_staff), db: Session = Depends(get_db)):
    role   = caller.get("role")
    tg_id  = int(caller["sub"])

    q = db.query(EditRequest).filter(EditRequest.status == "pending")

    if role == "supervisor":
        # Scope to the active role's unit — a multi-role user switched into one
        # of several supervisor roles only counts that unit's requests
        q = q.filter(EditRequest.supervisor_telegram_id == tg_id)
        if caller.get("role_id"):
            q = q.filter(EditRequest.manager_id == caller["role_id"])
    elif role == "shift-manager":
        sm_slot = caller.get("role_id")
        if not sm_slot:
            return {"count": 0}
        shift   = 1 if sm_slot in [1, 2] else 2
        mgr_ids = [m.id for m in db.query(Manager).filter_by(shift=shift).all()]
        q = q.filter(EditRequest.manager_id.in_(mgr_ids))

    return {"count": q.count()}


# ── List requests ──────────────────────────────────────────────────────────────

@router.get("/requests")
def list_requests(caller=Depends(_require_staff), db: Session = Depends(get_db)):
    role    = caller.get("role")
    role_id = caller.get("role_id")
    tg_id   = int(caller["sub"])

    q = db.query(EditRequest)

    if role == "supervisor":
        # Own requests + admin's logged actions on their manager's workers,
        # scoped to the active role's unit for multi-role users
        q = q.filter(or_(
            EditRequest.supervisor_telegram_id == tg_id,
            and_(
                EditRequest.manager_id == role_id,
                EditRequest.changes["_initiated_by"].astext == "admin",
            ),
        ))
        if role_id:
            q = q.filter(EditRequest.manager_id == role_id)
    elif role == "shift-manager":
        if not role_id:
            return []
        shift       = 1 if role_id in [1, 2] else 2
        mgr_ids     = [m.id for m in db.query(Manager).filter_by(shift=shift).all()]
        q = q.filter(EditRequest.manager_id.in_(mgr_ids))
    # admin sees all

    rows = q.order_by(EditRequest.created_at.desc()).all()

    def _ser(r: EditRequest):
        return {
            "id":                       r.id,
            "manager_id":               r.manager_id,
            "supervisor_name":          r.supervisor_name,
            "date":                     r.date.isoformat(),
            "worker_name":              r.worker_name,
            "changes":                  r.changes,
            "original":                 r.original,
            "status":                   r.status,
            "processed_by_name":        r.processed_by_name,
            "processed_by_telegram_id": r.processed_by_telegram_id,
            "created_at":               r.created_at.isoformat() if r.created_at else None,
            "processed_at":             r.processed_at.isoformat() if r.processed_at else None,
        }

    return [_ser(r) for r in rows]


# ── Approve / Reject ───────────────────────────────────────────────────────────

def _process_request(req_id: int, action: str, caller: dict, db: Session):
    if caller.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Not authorised")

    req = db.query(EditRequest).filter_by(id=req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="Request already processed")

    processor_tg_id = int(caller["sub"])
    processor_name  = caller.get("full_name", "")
    now = datetime.now(timezone.utc)

    req.status                   = action
    req.processed_by_telegram_id = processor_tg_id
    req.processed_by_name        = processor_name
    req.processed_at             = now

    if action == "approved":
        changes = req.changes or {}
        att_row = db.query(Attendance).filter(
            Attendance.manager_id == req.manager_id,
            Attendance.date       == req.date,
            Attendance.worker_name == req.worker_name,
        ).first()
        if att_row:
            if changes.get("_action") == "delete":
                db.delete(att_row)
            else:
                field_changes = {k: v for k, v in changes.items() if not k.startswith("_")}
                if "job_title"    in field_changes: att_row.job_title    = field_changes["job_title"]
                if "schedule"     in field_changes: att_row.schedule     = field_changes["schedule"]
                if "hours_worked" in field_changes: att_row.hours_worked = float(field_changes["hours_worked"])

    is_approved = action == "approved"
    ntype       = "success" if is_approved else "warning"
    sup_nkey    = "request_approved_supervisor" if is_approved else "request_rejected_supervisor"
    others_nkey = "request_approved_others"     if is_approved else "request_rejected_others"

    # Notify supervisor about their request result (different message)
    if req.supervisor_telegram_id:
        _notify(
            db, req.supervisor_telegram_id,
            type="success" if is_approved else "error",
            nkey=sup_nkey,
            params={"worker_name": req.worker_name, "date": req.date, "processor_name": processor_name},
        )

    # Notify admin + shift-managers (supervisor already notified above)
    _notify_all_parties(
        db, req.manager_id,
        others_nkey,
        {"processor_name": processor_name, "supervisor_name": req.supervisor_name,
         "worker_name": req.worker_name, "date": req.date},
        ntype=ntype,
        actor_tg_id=processor_tg_id,
        include_supervisor=False,
    )

    db.commit()
    # Edit every admin's Telegram approve/reject message with the outcome,
    # whoever decided (this runs for both the web app and the Telegram tap).
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("edit_request", str(req_id), action, processor_name)
    except Exception:
        pass
    return {"ok": True, "status": action}


@router.post("/requests/{req_id}/withdraw")
def withdraw_request(req_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    """Supervisor withdraws their own pending deletion request before it is confirmed."""
    role  = caller.get("role")
    tg_id = int(caller["sub"])
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Not authorised")

    req = db.query(EditRequest).filter_by(id=req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="Can only withdraw pending requests")

    # Supervisor may only withdraw their own requests
    if role == "supervisor" and req.supervisor_telegram_id != tg_id:
        raise HTTPException(status_code=403, detail="Not your request")

    req.status = "rejected"
    db.commit()
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("edit_request", str(req_id), "rejected", caller.get("full_name", ""))
    except Exception:
        pass
    return {"ok": True}


@router.post("/requests/{req_id}/approve")
def approve_request(req_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    return _process_request(req_id, "approved", caller, db)


@router.post("/requests/{req_id}/reject")
def reject_request(req_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    return _process_request(req_id, "rejected", caller, db)


@router.post("/requests/{req_id}/undo")
def undo_request(req_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    role   = caller.get("role")
    tg_id  = int(caller["sub"])
    undoer = caller.get("full_name", "")

    if role not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Not authorised")

    req = db.query(EditRequest).filter_by(id=req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "approved":
        raise HTTPException(status_code=409, detail="Can only undo approved requests")

    # Shift-manager: verify they're responsible for this manager's shift
    if role == "shift-manager":
        sm_slot = caller.get("role_id")
        if not sm_slot:
            raise HTTPException(status_code=403, detail="No shift assigned")
        sm_shift  = 1 if sm_slot in [1, 2] else 2
        mgr_shift = _get_shift_for_manager(db, req.manager_id)
        if sm_shift != mgr_shift:
            raise HTTPException(status_code=403, detail="Not responsible for this shift")

    changes  = req.changes  or {}
    original = req.original or {}
    is_delete = changes.get("_action") == "delete"

    if is_delete:
        # Recreate the deleted attendance row from original data
        exists = db.query(Attendance).filter(
            Attendance.manager_id  == req.manager_id,
            Attendance.date        == req.date,
            Attendance.worker_name == req.worker_name,
        ).first()
        if not exists:
            try:
                hw = float(original["hours_worked"]) if original.get("hours_worked") is not None else None
            except (TypeError, ValueError):
                hw = None
            db.add(Attendance(
                manager_id   = req.manager_id,
                date         = req.date,
                worker_name  = req.worker_name,
                job_title    = original.get("job_title")  or "",
                schedule     = original.get("schedule")   or "",
                hours_worked = hw,
            ))
    else:
        # Restore original field values
        att = db.query(Attendance).filter(
            Attendance.manager_id  == req.manager_id,
            Attendance.date        == req.date,
            Attendance.worker_name == req.worker_name,
        ).first()
        if att:
            field_changes = {k: v for k, v in changes.items() if not k.startswith("_")}
            if "job_title"    in field_changes: att.job_title    = original.get("job_title",    "")
            if "schedule"     in field_changes: att.schedule     = original.get("schedule",     "")
            if "hours_worked" in field_changes:
                try:
                    att.hours_worked = float(original["hours_worked"]) if original.get("hours_worked") is not None else None
                except (TypeError, ValueError):
                    pass

    req.status = "undone"

    _notify_all_parties(
        db, req.manager_id,
        "request_undone",
        {"worker_name": req.worker_name, "date": req.date, "undoer": undoer},
        ntype="warning",
        actor_tg_id=tg_id,
        include_supervisor=True,
    )

    db.commit()
    return {"ok": True}


# ── Export attendance to Excel → send to Telegram ─────────────────────────────

class ExportRow(BaseModel):
    worker_name:       Optional[str]   = None
    job_title:         Optional[str]   = None
    schedule:          Optional[str]   = None
    clock_in_out:      Optional[str]   = None
    hours_worked:      Optional[float] = None
    early_arrival_min: Optional[float] = None
    effective_hours:   Optional[float] = None


class ExportBody(BaseModel):
    manager_id:  int
    attend_date: str
    rows:        List[ExportRow]


@router.post("/attendance/export")
def export_attendance(body: ExportBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from app.telegram_bot import bot

    tg_id = int(caller["sub"])

    # Resolve manager name
    mgr = db.query(Manager).filter_by(id=body.manager_id).first()
    manager_name = mgr.name if mgr else f"Manager {body.manager_id}"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance"

    headers = ["Date", "Manager", "Worker", "Lavozim", "Jadval", "Clock In/Out", "Soat", "Early Arrival (min)", "Eff. Hours"]
    ws.append(headers)

    # Style header row
    hdr_fill = PatternFill(fill_type="solid", fgColor="1C4ED8")
    for col_i in range(1, len(headers) + 1):
        cell = ws.cell(1, col_i)
        cell.font      = Font(bold=True, color="FFFFFF", size=10)
        cell.fill      = hdr_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 22

    # Data rows with alternating shading
    even_fill = PatternFill(fill_type="solid", fgColor="F1F5F9")
    for row_i, r in enumerate(body.rows, 2):
        ws.append([
            body.attend_date,
            manager_name,
            r.worker_name        or "",
            r.job_title          or "",
            r.schedule           or "",
            r.clock_in_out       or "",
            r.hours_worked,
            r.early_arrival_min,
            r.effective_hours,
        ])
        if row_i % 2 == 0:
            for col_i in range(1, len(headers) + 1):
                ws.cell(row_i, col_i).fill = even_fill

    # Column widths: Date, Manager, Worker, Lavozim, Jadval, Clock, Soat, Early, Eff
    for col_i, width in enumerate([13, 30, 42, 26, 18, 18, 8, 18, 12], 1):
        ws.column_dimensions[ws.cell(1, col_i).column_letter].width = width

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"attendance_{body.attend_date}.xlsx"
    caption  = f"📊 Attendance — {body.attend_date}  •  {manager_name}  •  {len(body.rows)} workers"

    try:
        bot.send_document(chat_id=tg_id, document=(filename, buf.read()), caption=caption)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")

    return {"ok": True}


# ── Batch-level request endpoints ─────────────────────────────────────────────

class BatchApproveBody(BaseModel):
    ids: Optional[List[int]] = None  # subset of req_ids to approve; None/empty = all pending


def _batch_id_filter(batch_id: str):
    """Resolve a batch token to an EditRequest filter.

    Requests created via the bulk delete modal share a UUID `batch_id`.
    Single per-row requests have `batch_id = NULL` and are addressed by the
    frontend as 'solo-{request_id}'. Without this, canceling/approving a
    null-batch request hit `batch_id == 'null'` and silently matched nothing.
    """
    if batch_id.startswith("solo-"):
        try:
            return EditRequest.id == int(batch_id[len("solo-"):])
        except ValueError:
            return EditRequest.id == -1  # matches nothing → clean 404
    return EditRequest.batch_id == batch_id


def _process_batch(batch_token: str, action: str, caller: dict, db: Session, ids=None) -> int:
    """Approve/reject every pending request in a batch (or the ``ids`` subset).
    Shared by the HTTP endpoints and the Telegram callback; on approval of a
    delete-batch the attendance rows are removed. Returns the count processed
    and edits each admin's Telegram message with the outcome.

    Bulk batches are always deletions (created by bulk_delete_attendance), so
    an approval deletes the attendance row exactly like the old endpoint did."""
    if caller.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Not authorised")

    q = db.query(EditRequest).filter(
        _batch_id_filter(batch_token),
        EditRequest.status == "pending",
    )
    if ids:
        q = q.filter(EditRequest.id.in_(ids))
    reqs = q.all()
    if not reqs:
        raise HTTPException(status_code=404, detail="No pending requests found in batch")

    processor_name  = caller.get("full_name", "")
    processor_tg_id = int(caller["sub"])
    now = datetime.now(timezone.utc)

    for req in reqs:
        req.status                   = action
        req.processed_by_telegram_id = processor_tg_id
        req.processed_by_name        = processor_name
        req.processed_at             = now
        if action == "approved":
            att_row = db.query(Attendance).filter(
                Attendance.manager_id  == req.manager_id,
                Attendance.date        == req.date,
                Attendance.worker_name == req.worker_name,
            ).first()
            if att_row:
                db.delete(att_row)

    db.commit()
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("edit_batch", str(batch_token), action, processor_name)
        # A solo token addresses a single request that may instead have been
        # tracked as an "edit_request" notice (create_request path) — edit that
        # key too so the admin buttons clear whichever way the notice was filed.
        if str(batch_token).startswith("solo-"):
            edit_admin_notices("edit_request", str(batch_token)[len("solo-"):], action, processor_name)
    except Exception:
        pass
    return len(reqs)


@router.post("/requests/batch/{batch_id}/approve")
def approve_batch(
    batch_id: str,
    body: BatchApproveBody,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """Admin/shift-manager approves selected (or all) pending requests in a batch."""
    n = _process_batch(batch_id, "approved", caller, db, ids=body.ids)
    return {"ok": True, "approved": n}


@router.post("/requests/batch/{batch_id}/reject")
def reject_batch(
    batch_id: str,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """Admin/shift-manager rejects all pending requests in a batch."""
    n = _process_batch(batch_id, "rejected", caller, db)
    return {"ok": True, "rejected": n}


@router.post("/requests/batch/{batch_id}/withdraw")
def withdraw_batch(
    batch_id: str,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """Supervisor withdraws all their own pending requests in a batch."""
    role  = caller.get("role")
    tg_id = int(caller["sub"])
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Not authorised")

    q = db.query(EditRequest).filter(
        _batch_id_filter(batch_id),
        EditRequest.status   == "pending",
    )
    if role == "supervisor":
        q = q.filter(EditRequest.supervisor_telegram_id == tg_id)

    reqs = q.all()
    if not reqs:
        raise HTTPException(status_code=404, detail="No pending requests found in batch")

    for req in reqs:
        req.status = "rejected"

    db.commit()
    try:
        from app.approvals import edit_admin_notices
        name = caller.get("full_name", "")
        edit_admin_notices("edit_batch", str(batch_id), "rejected", name)
        if str(batch_id).startswith("solo-"):
            edit_admin_notices("edit_request", str(batch_id)[len("solo-"):], "rejected", name)
    except Exception:
        pass
    return {"ok": True, "withdrawn": len(reqs)}


# ════════════════════════════════════════════════════════════════════════════════
# HR Documents — document-driven change workflow (Role Change, …)
# ════════════════════════════════════════════════════════════════════════════════

DOC_TYPE_LABELS = {
    "role_change":     "Role Change",
    "people_exchange": "People Exchange",
    "graphic_change":  "Graphic Change",
}

# Per-language doc-type labels, used when the label is baked into a notification
# string sent to a specific recipient (the serialized API field above stays the
# English key — the frontend localizes it via its own t() keys).
DOC_TYPE_LABELS_I18N = {
    "role_change":     {"uz": "Lavozimni o'zgartirish", "uz_cyrl": "Лавозимни ўзгартириш", "ru": "Смена должности",   "en": "Role Change"},
    "people_exchange": {"uz": "Xodimlarni almashtirish", "uz_cyrl": "Ходимларни алмаштириш", "ru": "Обмен сотрудниками", "en": "People Exchange"},
    "graphic_change":  {"uz": "Jadvalni o'zgartirish",   "uz_cyrl": "Жадвални ўзгартириш",   "ru": "Смена графика",      "en": "Graphic Change"},
}


def _doc_label(doc_type: str, lang: str) -> str:
    """Localized doc-type label for notification text (falls back en → key)."""
    by_lang = DOC_TYPE_LABELS_I18N.get(doc_type)
    if not by_lang:
        return doc_type
    return by_lang.get(lang) or by_lang.get("en") or doc_type


def _scope_deletion_requests(caller, db: Session):
    """Return deletion EditRequests visible to the caller — the FULL history:
    pending, approved, rejected (incl. withdrawn) and undone, so processed
    requests stay visible on the Requests tab instead of disappearing."""
    role    = caller.get("role")
    role_id = caller.get("role_id")
    tg_id   = int(caller["sub"])

    q = db.query(EditRequest).filter(
        EditRequest.changes["_action"].astext == "delete",
        EditRequest.status.in_(["pending", "approved", "rejected", "undone"]),
    )
    if role == "supervisor":
        q = q.filter(or_(
            EditRequest.supervisor_telegram_id == tg_id,
            EditRequest.manager_id == role_id,
        ))
        if role_id:
            q = q.filter(EditRequest.manager_id == role_id)
    elif role == "shift-manager":
        if not role_id:
            return []
        shift   = 1 if role_id in [1, 2] else 2
        mgr_ids = [m.id for m in db.query(Manager).filter_by(shift=shift).all()]
        q = q.filter(EditRequest.manager_id.in_(mgr_ids))
    # admin → all
    return q.order_by(EditRequest.date.desc()).all()


def _scope_documents(q, caller, db: Session):
    """Restrict a HrDocument query to what the caller is allowed to see."""
    role    = caller.get("role")
    role_id = caller.get("role_id")
    tg_id   = int(caller["sub"])

    if role == "supervisor":
        if not role_id:
            return q.filter(HrDocument.created_by_telegram_id == tg_id)
        # Own unit's documents + people-exchange documents addressed TO this
        # supervisor's unit, so the receiving supervisor can see and approve
        # incoming worker moves.
        incoming = and_(
            HrDocument.doc_type == "people_exchange",
            HrDocument.payload["target_manager_id"].astext == str(role_id),
        )
        return q.filter(or_(HrDocument.manager_id == role_id, incoming))
    if role == "shift-manager":
        if not role_id:
            return q.filter(HrDocument.id < 0)   # always-empty
        shift   = 1 if role_id in [1, 2] else 2
        mgr_ids = [m.id for m in db.query(Manager).filter_by(shift=shift).all()]
        return q.filter(HrDocument.manager_id.in_(mgr_ids))
    # admin → everything
    return q


def _can_approve(caller) -> bool:
    return caller.get("role") in ("admin", "shift-manager")


def _can_approve_doc(doc: HrDocument, caller: dict, db: Session) -> bool:
    """Approval authority, per document type. One approval is always enough.

    role_change     → admin or shift-manager (the existing rule).
    people_exchange → • to a supervisor: admin OR the RECEIVING supervisor.
                      • to a task:        admin OR a shift-manager of the
                        sending unit's shift.
    """
    role = caller.get("role")
    if role == "admin":
        return True
    if doc.doc_type != "people_exchange":
        return _can_approve(caller)
    payload = doc.payload or {}
    if payload.get("target_type") == "supervisor":
        return role == "supervisor" and caller.get("role_id") == payload.get("target_manager_id")
    # task target → a shift-manager of the sending unit's shift
    if role == "shift-manager":
        shift = _get_shift_for_manager(db, doc.manager_id)
        return caller.get("role_id") in SHIFT_ROLE_IDS.get(shift, [])
    return False


def _record_history(db: Session, doc: HrDocument, action: str, caller: dict, detail: dict | None = None):
    db.add(HrDocumentHistory(
        document_id=doc.id,
        action=action,
        actor_telegram_id=int(caller["sub"]) if caller.get("sub") else None,
        actor_name=caller.get("full_name", ""),
        detail=detail,
    ))


def _apply_role_change(db: Session, doc: HrDocument):
    """Set job_title → new_role for every employee in the document's date/unit."""
    payload   = doc.payload or {}
    new_role  = payload.get("new_role")
    for emp in payload.get("employees", []):
        att = db.query(Attendance).filter(
            Attendance.manager_id  == doc.manager_id,
            Attendance.date        == doc.date,
            Attendance.worker_name == emp.get("worker_name"),
        ).first()
        if att:
            att.job_title = new_role


def _revert_role_change(db: Session, doc: HrDocument):
    """Restore each employee's job_title back to its stored old_role."""
    for emp in (doc.payload or {}).get("employees", []):
        att = db.query(Attendance).filter(
            Attendance.manager_id  == doc.manager_id,
            Attendance.date        == doc.date,
            Attendance.worker_name == emp.get("worker_name"),
        ).first()
        if att:
            att.job_title = emp.get("old_role") or ""


# ── People exchange (worker move) ────────────────────────────────────────────────

# ── Transfer-time split helpers (admin-only people-exchange feature) ─────────────
# When an admin sets a transfer time T on an exchange, each worker's day is split
# so the TOTAL worked hours are conserved:
#   part1 = (T - clock_in)/60        → before-T worked time, INCLUDES early arrival
#   part2 = total_worked - part1     → after-T remainder (the day's lunch/break
#                                       deduction therefore stays inside part2)
# The worker's NAME goes to whichever side is larger (tie → original unit); the
# smaller side keeps only a nameless "hours-only" row (folded into extra_hours).
# Early arrival belongs to the worker's REAL (named) row only:
#   → if the name STAYS (before-T side wins), the original unit keeps the early on
#     the worker's row (effective_hours nets it out, early_arrival_min preserved).
#   → if the name MOVES (after-T side wins), the before-T remainder becomes the
#     nameless leftover and is credited EFFECTIVE hours (part1_eff) — early is
#     dropped, since no real row claims it. The receiving side's early is always 0.
#   → supervisor: the receiving side is the target unit, so part2 lands there.
#   → task:       there is no receiving unit, so part2 is simply DROPPED (the worker
#                 isn't credited for on-task time); only the before-T portion
#                 survives on the sending unit. If the name stays it's her own row
#                 (clock C-T, early kept); if the name leaves she is removed from the
#                 roster and the before-T effective hours become a nameless leftover.
#                 (A → task move with NO transfer time still marks the worker X/0.)

def _parse_hhmm(s) -> Optional[int]:
    """'08:00' / '8-00' / '08.00' / '17:04 (8.43)' → minutes from midnight, else None.

    Tolerates the verifix clock format which carries a trailing ' (8.43)' worked-
    hours suffix and spaces around the dash (e.g. '07:49 - 17:04 (8.43)')."""
    if not s:
        return None
    txt = str(s).split("(")[0].strip().replace(".", ":").replace("-", ":")
    parts = txt.split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 and parts[1] != "" else 0
        return h * 60 + m
    except (ValueError, IndexError):
        return None


def _fmt_hhmm(mins) -> str:
    # Wrap to a wall-clock time so an overnight-normalised minute (e.g. 1478 for a
    # 00:38 clock-out carried past midnight) formats as "00:38", not "24:38".
    mins = int(round(mins)) % 1440
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _schedule_start_min(schedule) -> Optional[int]:
    if not schedule:
        return None
    return _parse_hhmm(str(schedule).split("до")[0])


def _clock_bounds_min(clock_in_out):
    """'08:00-19:47' → (clock_in_min, clock_out_min); (None, None) if unparseable."""
    if not clock_in_out or "-" not in str(clock_in_out):
        return None, None
    left, _, right = str(clock_in_out).strip().partition("-")
    return _parse_hhmm(left), _parse_hhmm(right)


def _normalize_transfer_time(caller: dict, ttype: Optional[str], raw) -> Optional[str]:
    """Honour a transfer time for admins and supervisors, moving to a supervisor
    OR a task. Returns a canonical 'HH:MM' string or None."""
    if not raw or ttype not in ("supervisor", "task"):
        return None
    mins = _parse_hhmm(raw)
    return _fmt_hhmm(mins) if mins is not None else None


def _normalize_return_time(ttype: Optional[str], transfer_time: Optional[str], raw) -> Optional[str]:
    """A return time R is the END of the away stint and is only meaningful when a
    transfer time T is also set (→ supervisor or task). Returns a canonical
    'HH:MM' string or None."""
    if not raw or not transfer_time or ttype not in ("supervisor", "task"):
        return None
    mins = _parse_hhmm(raw)
    return _fmt_hhmm(mins) if mins is not None else None


def _compute_split(snapshot: dict, transfer_time: str, return_time: Optional[str] = None) -> Optional[dict]:
    """Resolve how a single worker's day splits around the transfer time T, and —
    when a return time R is given — the moment they come back (the carve-out).

    TWO-WAY (no return) — the worker leaves at T and never returns:
      part1 = (T - clock_in)/60     → before-T worked time, INCLUDES early arrival
      part2 = total_worked - part1  → after-T remainder

    CARVE-OUT (return time R, C ≤ T ≤ R ≤ O) — the worker is away only for [T, R]
    and ends the day back home, so the two home slices [C,T]+[R,O] are one side:
      away = (R - T)/60             → the away stint, at clock duration
      part1 = total_worked - away   → HOME side (both slices), keeps early + break
      part2 = away                  → AWAY side
    The home named row therefore keeps its full C–O clock (two slices can't be one
    HH:MM range) while the away row, if the name moves, shows T–R.

    Either way the NAME goes to the bigger of part1/part2 (tie → original unit), and
    early arrival is only ever credited to the original unit (receiving side = 0).
    Returns None when the worker can't be split (missing/invalid times or hours) so
    the caller can fall back to a plain full move. Hours are in decimal hours.
    """
    C, O  = _clock_bounds_min(snapshot.get("clock_in_out"))
    T     = _parse_hhmm(transfer_time)
    total = snapshot.get("hours_worked")
    early = float(snapshot.get("early_arrival_min") or 0)
    if T is None or C is None or O is None or total is None:
        return None
    # Overnight shift: a clock-out at/under the clock-in crossed midnight, so carry
    # it (and a post-midnight transfer time) into the next day to keep C ≤ T ≤ O.
    if O <= C:
        O += 1440
    if T < C:
        T += 1440
    if O <= C:                                         # still degenerate → can't split
        return None
    total = float(total)
    T     = max(C, min(T, O))                          # clamp into the worked window

    R = _parse_hhmm(return_time) if return_time else None
    if R is not None:
        # ── Carve-out: the away stint is [T, R]; everything else stays home. ──
        if R < C:                                      # return crossed midnight too
            R += 1440
        R = max(T, min(R, O))                          # clamp into [T, O]
        away  = max(0.0, min((R - T) / 60.0, total))   # away stint at clock duration
        part1 = max(0.0, total - away)                 # home side (both slices), incl. break+early
        part2 = away                                   # away side
        return {
            "T":          _fmt_hhmm(T),
            "C":          _fmt_hhmm(C),
            "O":          _fmt_hhmm(O),
            "R":          _fmt_hhmm(R),
            "stay":       part1 >= part2,              # tie → stays on the original unit
            "part1":      round(part1, 4),             # home-side hours (incl. early)
            "part2":      round(part2, 4),             # away-side hours
            "part1_eff":  round(max(0.0, part1 - early / 60.0), 4),
            "home_clock": f"{_fmt_hhmm(C)}-{_fmt_hhmm(O)}",  # name stays → full C–O span
            "away_clock": f"{_fmt_hhmm(T)}-{_fmt_hhmm(R)}",  # name moves → just the [T,R] stint
            "early_min":  early,
        }

    part1 = max(0.0, min((T - C) / 60.0, total))       # before-T (incl. early), capped at total
    part2 = max(0.0, total - part1)                    # after-T remainder; total conserved
    return {
        "T":         _fmt_hhmm(T),
        "C":         _fmt_hhmm(C),
        "O":         _fmt_hhmm(O),
        "stay":      part1 >= part2,                   # tie → stays on the original unit
        "part1":     round(part1, 4),                  # original-side hours (incl. early)
        "part2":     round(part2, 4),                  # receiving-side hours (early already on orig)
        "part1_eff": round(max(0.0, part1 - early / 60.0), 4),  # original effective (early removed)
        "early_min": early,
    }


def _apply_split_exchange(db: Session, doc: HrDocument):
    """Apply an exchange that carries a transfer time, splitting each worker's day
    at T. For a → supervisor move the task/receiving side is handed to the other
    unit; for a → task move that side is simply dropped. Records what it did back
    into the payload so a later cancel/delete can revert precisely."""
    payload = doc.payload or {}
    is_task = payload.get("target_type") == "task"
    target  = payload.get("target_manager_id")
    ttime   = payload.get("transfer_time")
    rtime   = payload.get("return_time")
    for emp in payload.get("employees", []):
        att = db.query(Attendance).filter(
            Attendance.manager_id  == doc.manager_id,
            Attendance.date        == doc.date,
            Attendance.worker_name == emp.get("worker_name"),
        ).first()
        if not att:
            continue
        plan = _compute_split(emp.get("snapshot") or {}, ttime, rtime)
        if not plan or (not is_task and not target):
            # Can't split → fall back to a plain full move.
            if is_task:
                att.clock_in_out      = "X"
                att.hours_worked      = 0
                att.effective_hours   = None
                att.early_arrival_min = None
            else:
                att.manager_id = target
            emp["applied"] = {"side": "move", "leftover_id": None, "plain": True}
            continue

        leftover_id = None
        if plan["stay"]:
            # Home side wins: worker keeps their name on the sending unit. No return
            # → clock-out trimmed to T; carve-out (return) → full C–O span, since the
            # home slices [C,T]+[R,O] can't be one HH:MM range. Early stays here.
            att.clock_in_out    = plan.get("home_clock") or f'{plan["C"]}-{plan["T"]}'
            att.hours_worked    = plan["part1"]
            att.effective_hours = plan["part1_eff"]
            # early_arrival_min unchanged — early belongs to the original unit
            if not is_task and plan["part2"] > 0:
                # → supervisor: the after-T hours land on the receiving unit.
                # → task: dropped (no row).
                row = Attendance(manager_id=target, date=doc.date, worker_name=None,
                                 hours_worked=plan["part2"])
                db.add(row); db.flush()
                leftover_id = row.id
            emp["applied"] = {"side": "stay", "leftover_id": leftover_id}
        else:
            # After-T side wins: the worker's name leaves the sending unit's roster.
            if is_task:
                # → task: part2 is dropped and there is no receiving unit, so she is
                # REMOVED from the roster. Her own row is repurposed into the nameless
                # before-T leftover — blanking the name drops her from the table and
                # folds the hours into extra_hours. Value-only, exactly like a
                # supervisor leftover: effective before-T hours (part1_eff, early
                # stripped), no clock / title / early.
                att.worker_name       = None
                att.job_title         = None
                att.schedule          = None
                att.clock_in_out      = None
                att.hours_worked      = plan["part1_eff"]
                att.effective_hours   = None
                att.early_arrival_min = None
                emp["applied"] = {"side": "move", "leftover_id": att.id, "task_blanked": True}
            else:
                # → supervisor: the row moves to the target with the after-T hours,
                # and the before-T remainder stays as a nameless hours-only row on
                # the sending unit. Credited the EFFECTIVE hours (part1_eff = early
                # stripped): once the name has left, the original unit isn't credited
                # for the worker clocking in before their scheduled start.
                att.manager_id        = target
                # No return → away runs T–O; carve-out → just the [T,R] stint.
                att.clock_in_out      = plan.get("away_clock") or f'{plan["T"]}-{plan["O"]}'
                att.hours_worked      = plan["part2"]
                att.early_arrival_min = 0          # early stays on the original unit
                att.effective_hours   = plan["part2"]
                if plan["part1_eff"] > 0:
                    row = Attendance(manager_id=doc.manager_id, date=doc.date, worker_name=None,
                                     hours_worked=plan["part1_eff"])
                    db.add(row); db.flush()
                    leftover_id = row.id
                emp["applied"] = {"side": "move", "leftover_id": leftover_id}
    flag_modified(doc, "payload")


def _revert_split_exchange(db: Session, doc: HrDocument):
    """Undo an applied transfer-time split: restore the worker's full row from the
    snapshot and delete the nameless leftover row it created. For a → task move the
    worker's own row was blanked into the leftover, so it is restored in place by id
    (re-attach name + snapshot) rather than deleted."""
    payload = doc.payload or {}
    is_task = payload.get("target_type") == "task"
    target  = payload.get("target_manager_id")
    for emp in payload.get("employees", []):
        applied = emp.get("applied") or {}
        snap    = emp.get("snapshot") or {}
        wname   = emp.get("worker_name")
        side    = applied.get("side", "move")
        if applied.get("task_blanked"):
            # → task move: her own row was blanked into a nameless leftover. Restore
            # it in place by id (re-attach the name + snapshot); never delete it.
            row = db.query(Attendance).filter(Attendance.id == applied.get("leftover_id")).first()
            if row:
                row.worker_name       = wname
                row.manager_id        = emp.get("old_manager_id") or doc.manager_id
                row.job_title         = snap.get("job_title")
                row.schedule          = snap.get("schedule")
                row.clock_in_out      = snap.get("clock_in_out")
                row.hours_worked      = snap.get("hours_worked")
                row.early_arrival_min = snap.get("early_arrival_min")
                row.effective_hours   = snap.get("effective_hours")
            emp.pop("applied", None)
            continue
        # For a → supervisor move the full row lives on the target if it moved,
        # else on the sending unit. A → task move never relocates the row.
        cur_mgr = target if (side == "move" and not is_task) else doc.manager_id
        att = db.query(Attendance).filter(
            Attendance.manager_id  == cur_mgr,
            Attendance.date        == doc.date,
            Attendance.worker_name == wname,
        ).first()
        if att:
            att.manager_id        = emp.get("old_manager_id") or doc.manager_id
            att.job_title         = snap.get("job_title")
            att.schedule          = snap.get("schedule")
            att.clock_in_out      = snap.get("clock_in_out")
            att.hours_worked      = snap.get("hours_worked")
            att.early_arrival_min = snap.get("early_arrival_min")
            att.effective_hours   = snap.get("effective_hours")
        lid = applied.get("leftover_id")
        if lid:
            row = db.query(Attendance).filter(Attendance.id == lid).first()
            if row:
                db.delete(row)
        emp.pop("applied", None)
    flag_modified(doc, "payload")


def _apply_people_exchange(db: Session, doc: HrDocument):
    """Apply an approved worker move for the document's date.

    → supervisor: reassign the attendance row to the receiving unit (the worker
                  leaves the sender's grid/KPI and is counted as the receiver's).
    → task:       keep the row on the sending supervisor's page but mark the
                  worker "not came" (clock_in_out="X", hours_worked=0). The KPI
                  filter only counts hours_worked > 0, so a marked worker drops
                  out of every calculation while staying visible on the roster.
                  job_title and schedule are preserved; a snapshot in the payload
                  lets a later cancel restore the original came-state.
    """
    payload = doc.payload or {}
    ttype   = payload.get("target_type")
    target  = payload.get("target_manager_id")
    if payload.get("transfer_time") and ((ttype == "supervisor" and target) or ttype == "task"):
        _apply_split_exchange(db, doc)
        return
    for emp in payload.get("employees", []):
        att = db.query(Attendance).filter(
            Attendance.manager_id  == doc.manager_id,
            Attendance.date        == doc.date,
            Attendance.worker_name == emp.get("worker_name"),
        ).first()
        if not att:
            continue
        if ttype == "supervisor" and target:
            att.manager_id = target
        else:
            att.clock_in_out      = "X"
            att.hours_worked      = 0
            att.effective_hours   = None
            att.early_arrival_min = None


def _revert_people_exchange(db: Session, doc: HrDocument):
    """Undo an applied worker move (cancel / delete of an approved exchange)."""
    payload = doc.payload or {}
    ttype   = payload.get("target_type")
    target  = payload.get("target_manager_id")
    if payload.get("transfer_time") and ((ttype == "supervisor" and target) or ttype == "task"):
        _revert_split_exchange(db, doc)
        return
    for emp in payload.get("employees", []):
        wname = emp.get("worker_name")
        if ttype == "supervisor" and target:
            att = db.query(Attendance).filter(
                Attendance.manager_id  == target,
                Attendance.date        == doc.date,
                Attendance.worker_name == wname,
            ).first()
            if att:
                att.manager_id = emp.get("old_manager_id") or doc.manager_id
        else:
            # Restore the worker's original came-state from the snapshot.
            snap = emp.get("snapshot") or {}
            att = db.query(Attendance).filter(
                Attendance.manager_id  == doc.manager_id,
                Attendance.date        == doc.date,
                Attendance.worker_name == wname,
            ).first()
            if att:
                att.job_title         = snap.get("job_title")
                att.schedule          = snap.get("schedule")
                att.clock_in_out      = snap.get("clock_in_out")
                att.hours_worked      = snap.get("hours_worked")
                att.early_arrival_min = snap.get("early_arrival_min")
                att.effective_hours   = snap.get("effective_hours")
            else:
                # robustness: if the row is gone, recreate it from the snapshot
                db.add(Attendance(
                    manager_id        = doc.manager_id,
                    date              = doc.date,
                    worker_name       = wname,
                    job_title         = snap.get("job_title"),
                    schedule          = snap.get("schedule"),
                    clock_in_out      = snap.get("clock_in_out"),
                    hours_worked      = snap.get("hours_worked"),
                    early_arrival_min = snap.get("early_arrival_min"),
                    effective_hours   = snap.get("effective_hours"),
                ))


def _resolve_exchange_target(db: Session, sender_id: int, d: date, ttype: Optional[str],
                             target_manager_id_in: Optional[int], task_name_in: Optional[str]):
    """Validate the move target; returns (ttype, target_manager_id, target_manager_name,
    task_name). Enforces: real target unit, not the sender, and the receiving
    unit's day must still be open."""
    if ttype not in ("supervisor", "task"):
        raise HTTPException(status_code=400, detail="target_type must be 'supervisor' or 'task'")
    if ttype == "supervisor":
        if not target_manager_id_in:
            raise HTTPException(status_code=400, detail="target_manager_id is required")
        if target_manager_id_in == sender_id:
            raise HTTPException(status_code=400, detail="Cannot exchange workers to the same unit")
        target = db.query(Manager).filter_by(id=target_manager_id_in).first()
        if not target:
            raise HTTPException(status_code=404, detail="Target supervisor not found")
        _assert_day_open(db, target.id, d)   # can't move into a closed unit
        return ttype, target.id, target.name, None
    name = (task_name_in or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="task_name is required")
    return ttype, None, None, name


def _build_exchange_payload(db: Session, manager_id: int, d: date, target_type: str,
                            target_manager_id: Optional[int], target_manager_name: Optional[str],
                            task_name: Optional[str], employees: List[str],
                            transfer_time: Optional[str] = None, return_time: Optional[str] = None):
    emp_rows = []
    for wname in employees:
        att = db.query(Attendance).filter(
            Attendance.manager_id  == manager_id,
            Attendance.date        == d,
            Attendance.worker_name == wname,
        ).first()
        if not att:
            continue   # "worker must be present" — silently drop rows with no record
        row = {
            "worker_name":    wname,
            "old_manager_id": manager_id,
            "old_role":       att.job_title or "",
        }
        # A full snapshot lets a later cancel restore the original row. Needed for
        # task moves (which blank the row) and for transfer-time splits (which
        # mutate clock-out / hours and may relocate the row to the receiver).
        if target_type == "task" or transfer_time:
            row["snapshot"] = {
                "job_title":         att.job_title,
                "schedule":          att.schedule,
                "clock_in_out":      att.clock_in_out,
                "hours_worked":      float(att.hours_worked)      if att.hours_worked      is not None else None,
                "early_arrival_min": float(att.early_arrival_min) if att.early_arrival_min is not None else None,
                "effective_hours":   float(att.effective_hours)   if att.effective_hours   is not None else None,
            }
        emp_rows.append(row)
    return {
        "target_type":         target_type,
        "target_manager_id":   target_manager_id,
        "target_manager_name": target_manager_name,
        "task_name":           task_name,
        "transfer_time":       transfer_time,
        "return_time":         return_time,
        "employees":           emp_rows,
    }


def _exchange_target_label(payload: dict) -> str:
    if (payload or {}).get("target_type") == "supervisor":
        return payload.get("target_manager_name") or "—"
    return (payload or {}).get("task_name") or "—"


def _notify_exchange(db: Session, doc: HrDocument, event: str, actor_tg_id: int, admin_dm: bool = True):
    """Notify the parties for a worker-exchange action. _notify_all_parties covers
    the sending unit's admins/shift-managers/supervisor; the receiving supervisor
    sits in another unit, so notify them separately."""
    payload   = doc.payload or {}
    nkey_map  = {
        "created":   "worker_exchange_created",
        "approved":  "worker_exchange_approved",
        "cancelled": "worker_exchange_cancelled",
    }
    nkey   = nkey_map.get(event, "worker_exchange_created")
    params = {
        "actor_name": doc.created_by_name or "",
        "count":      len(payload.get("employees", [])),
        "target":     _exchange_target_label(payload),
        "date":       doc.date,
    }
    _notify_all_parties(db, doc.manager_id, nkey, params, ntype="info",
                        actor_tg_id=actor_tg_id, include_supervisor=True, admin_dm=admin_dm)
    if payload.get("target_type") == "supervisor" and payload.get("target_manager_id"):
        sup = _find_supervisor(db, payload["target_manager_id"])
        if sup and sup.telegram_id != actor_tg_id:
            # On creation the receiving supervisor also gets a rich inline
            # approve/reject message (app.approvals.send_hr_document_to_admins),
            # so skip the duplicate plain DM here — keep only the in-app bell.
            # approved/cancelled events carry no inline message, so DM as usual.
            _notify(db, sup.telegram_id, type="info", dm=event != "created",
                    nkey=nkey, params=params)


def _serialize_doc(doc: HrDocument, mgr_name: str | None = None, detailed: bool = False):
    payload   = doc.payload or {}
    employees = payload.get("employees", [])
    out = {
        "id":               doc.id,
        "doc_type":         doc.doc_type,
        "doc_type_label":   DOC_TYPE_LABELS.get(doc.doc_type, doc.doc_type),
        "manager_id":       doc.manager_id,
        "supervisor_name":  doc.supervisor_name or mgr_name,
        "date":             doc.date.isoformat() if doc.date else None,
        "status":           doc.status,                       # draft | approved
        "approved":         doc.status == "approved",         # → Да / Нет
        "new_role":         payload.get("new_role"),
        "target_type":          payload.get("target_type"),
        "target_manager_id":    payload.get("target_manager_id"),
        "target_manager_name":  payload.get("target_manager_name"),
        "task_name":            payload.get("task_name"),
        "transfer_time":        payload.get("transfer_time"),
        "return_time":          payload.get("return_time"),
        "employee_count":   len(employees),
        "created_by_telegram_id": doc.created_by_telegram_id,
        "created_by_name":  doc.created_by_name,
        "approved_by_name": doc.approved_by_name,
        "created_at":       doc.created_at.isoformat() if doc.created_at else None,
        "approved_at":      doc.approved_at.isoformat() if doc.approved_at else None,
    }
    if detailed:
        out["employees"] = employees
        out["payload"]   = payload
    return out


def _resolve_manager(caller, db: Session, manager_id: Optional[int]):
    """Determine which manager (unit) a document belongs to + its display name."""
    role = caller.get("role")
    if role == "supervisor":
        mid = caller.get("role_id")
        if not mid:
            raise HTTPException(status_code=400, detail="Supervisor has no linked manager")
    else:
        if not manager_id:
            raise HTTPException(status_code=400, detail="manager_id required")
        mid = manager_id
    mgr = db.query(Manager).filter_by(id=mid).first()
    return mid, (mgr.name if mgr else None)


# ── People-exchange option sources (targets + tasks) ─────────────────────────────

@router.get("/exchange-targets")
def exchange_targets(attend_date: str, manager_id: Optional[int] = None,
                     caller=Depends(_require_staff), db: Session = Depends(get_db)):
    """Supervisors a worker exchange may move INTO for a date — every unit except
    the sender, excluding any unit that has already closed that day."""
    if caller.get("role") not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Admin or supervisor only")
    d = date.fromisoformat(attend_date)
    sender_id = caller.get("role_id") if caller.get("role") == "supervisor" else manager_id
    closed = {
        c.manager_id for c in db.query(DayApproval).filter(DayApproval.date == d).all()
    }
    out = []
    for m in db.query(Manager).order_by(Manager.shift, Manager.name).all():
        if m.id == sender_id or m.id in closed:
            continue
        out.append({"manager_id": m.id, "full_name": m.name, "shift": m.shift})
    return out


def _ensure_exchange_task(db: Session, name: Optional[str], caller: dict) -> None:
    """Persist a task name to the permanent shared list (create, or reactivate a
    previously removed one). Called whenever a people-exchange targets a task, so
    the '＋ Yangi vazifa' name an admin types sticks around for everyone on every
    date. No-op for blank names. Caller commits.

    Adding a task to the shared list is admin-only: supervisors may target an
    existing, active task but cannot introduce a new one (nor revive a removed
    one). Referencing an already-active task is a no-op, so it stays open to all."""
    n = (name or "").strip()
    if not n:
        return
    t = db.query(ExchangeTask).filter(ExchangeTask.name == n).first()
    if t is not None and t.active:
        return
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can add a new task")
    if t is None:
        db.add(ExchangeTask(name=n, active=True, created_by_telegram_id=int(caller["sub"])))
    else:
        t.active = True


@router.get("/tasks")
def list_exchange_tasks(attend_date: Optional[str] = None,
                        caller=Depends(_require_staff), db: Session = Depends(get_db)):
    """Permanent, shared list of worker-exchange task names. Tasks persist across
    every date until an admin removes them; any supervisor or admin who creates
    one makes it an option for the rest. (attend_date is accepted but ignored —
    kept for backward compatibility with older clients.)"""
    names = [
        t.name for t in db.query(ExchangeTask)
        .filter(ExchangeTask.active.is_(True))
        .order_by(func.lower(ExchangeTask.name))
        .all()
    ]
    return {"tasks": names}


class TaskDeleteBody(BaseModel):
    name: str


@router.post("/tasks/delete")
def delete_exchange_task(body: TaskDeleteBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    """Admin-only soft removal of a task from the shared picker. The row is kept
    (active=False) so existing exchange documents that reference the name keep
    resolving — it simply stops being offered for new exchanges."""
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    t = db.query(ExchangeTask).filter(ExchangeTask.name == name).first()
    if not t or not t.active:
        raise HTTPException(status_code=404, detail="Task not found")
    t.active = False
    db.commit()
    return {"ok": True}


# ── List / Get ─────────────────────────────────────────────────────────────────

@router.get("/documents")
def list_documents(caller=Depends(_require_staff), db: Session = Depends(get_db)):
    rows = _scope_documents(db.query(HrDocument), caller, db) \
        .order_by(HrDocument.created_at.desc()).all()
    mgr_names = {m.id: m.name for m in db.query(Manager).all()}
    docs = [_serialize_doc(d, mgr_names.get(d.manager_id)) for d in rows]

    # Deletion EditRequests — group by batch_id, appear alongside role-change documents
    del_rows = _scope_deletion_requests(caller, db)

    # Group by batch_id (or solo-{id} for legacy/null batch_id requests)
    batch_map: dict = defaultdict(list)
    for r in del_rows:
        key = r.batch_id if r.batch_id else f"solo-{r.id}"
        batch_map[key].append(r)

    del_items = []
    for batch_key, reqs in batch_map.items():
        reqs.sort(key=lambda r: r.id)
        first       = reqs[0]
        has_pending = any(r.status == "pending" for r in reqs)
        # "undone" counts as applied for history purposes — the deletion WAS
        # approved, then the worker was restored. A batch is 'approved' when
        # at least one row was applied; fully-rejected batches show 'rejected'.
        any_applied  = any(r.status in ("approved", "undone") for r in reqs)
        batch_status = "pending" if has_pending else ("approved" if any_applied else "rejected")
        processed_by = next((r.processed_by_name for r in reqs if r.processed_by_name), None)

        # Use earliest created_at as the sort key for the batch
        earliest_created = min(
            (r.created_at for r in reqs if r.created_at),
            default=None,
        )

        del_items.append({
            "id":               first.id,
            "batch_id":         first.batch_id,
            "_source":          "deletion",
            "doc_type":         "deletion",
            "doc_type_label":   "Deletion request",
            "manager_id":       first.manager_id,
            "manager_name":     mgr_names.get(first.manager_id, "—"),
            "supervisor_name":  first.supervisor_name or mgr_names.get(first.manager_id, "—"),
            "supervisor_telegram_id": first.supervisor_telegram_id,
            "date":             first.date.isoformat(),
            "status":           batch_status,
            "approved":         batch_status == "approved",
            "new_role":         None,
            "employee_count":   len(reqs),
            "created_by_name":  first.supervisor_name,
            "approved_by_name": processed_by if batch_status != "pending" else None,
            "created_at":       earliest_created.isoformat() if earliest_created else first.date.isoformat(),
            "workers": [
                {
                    "id":              r.id,
                    "worker_name":     r.worker_name,
                    "status":          r.status,
                    "approved_by_name": r.processed_by_name,
                    "original":        r.original or {},
                }
                for r in reqs
            ],
        })

    combined = docs + del_items
    combined.sort(key=lambda x: x.get("created_at") or x.get("date") or "", reverse=True)
    return combined


@router.get("/documents/pending-count")
def documents_pending_count(caller=Depends(_require_staff), db: Session = Depends(get_db)):
    # Must match the "Requests" tab badge, which counts BOTH pending role-change
    # documents AND pending deletion-request batches from /documents. Counting
    # only HrDocument drafts (the old behaviour) ignored deletion requests, so
    # the sidebar badge was smaller than the tab badge.

    # 1) Pending role-change documents (HrDocument drafts)
    doc_count = _scope_documents(db.query(HrDocument), caller, db) \
        .filter(HrDocument.status == "draft").count()

    # 2) Pending deletion-request batches — grouped by batch_id exactly like
    #    /documents, counted once per batch that has any pending request.
    pending_batches = set()
    for r in _scope_deletion_requests(caller, db):
        if r.status == "pending":
            pending_batches.add(r.batch_id if r.batch_id else f"solo-{r.id}")

    return {"count": doc_count + len(pending_batches)}


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    mgr = db.query(Manager).filter_by(id=doc.manager_id).first()
    return _serialize_doc(doc, mgr.name if mgr else None, detailed=True)


@router.get("/documents/{doc_id}/history")
def document_history(doc_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    rows = db.query(HrDocumentHistory).filter_by(document_id=doc_id) \
        .order_by(HrDocumentHistory.created_at.asc()).all()
    return [{
        "id":         h.id,
        "action":     h.action,
        "actor_name": h.actor_name,
        "detail":     h.detail,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    } for h in rows]


# ── Create / Update ─────────────────────────────────────────────────────────────

class DocCreateBody(BaseModel):
    doc_type:    str            = "role_change"
    attend_date: str
    manager_id:  Optional[int]  = None      # required for admin (sending unit)
    employees:   List[str]                  # worker_name list
    # role_change
    new_role:    Optional[str]  = None
    # people_exchange
    target_type:       Optional[str] = None   # "supervisor" | "task"
    target_manager_id: Optional[int] = None
    task_name:         Optional[str] = None
    transfer_time:     Optional[str] = None   # "HH:MM" — split (→ supervisor or task)
    return_time:       Optional[str] = None   # "HH:MM" — carve-out end (the away stint is [T,R])


def _build_role_payload(db: Session, manager_id: int, d: date, new_role: str, employees: List[str]):
    emp_rows = []
    for wname in employees:
        att = db.query(Attendance).filter(
            Attendance.manager_id  == manager_id,
            Attendance.date        == d,
            Attendance.worker_name == wname,
        ).first()
        emp_rows.append({
            "worker_name": wname,
            "old_role":    (att.job_title if att else "") or "",
        })
    return {"new_role": new_role, "employees": emp_rows}


@router.post("/documents", status_code=201)
def create_document(body: DocCreateBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Not allowed to create documents")
    if body.doc_type not in ("role_change", "people_exchange"):
        raise HTTPException(status_code=400, detail="Unsupported document type")
    if not body.employees:
        raise HTTPException(status_code=400, detail="Select at least one employee")

    d = date.fromisoformat(body.attend_date)
    manager_id, mgr_name = _resolve_manager(caller, db, body.manager_id)

    if body.doc_type == "people_exchange":
        return _create_people_exchange(db, caller, body, d, manager_id, mgr_name)

    # ── role_change ──
    if not body.new_role:
        raise HTTPException(status_code=400, detail="new_role is required")
    if not is_assignable_target_role(body.new_role):
        raise HTTPException(status_code=400, detail="This role can only be set from verifix files and cannot be chosen as a role-change target")
    if caller.get("role") == "supervisor":
        _assert_day_open(db, manager_id, d)
    payload = _build_role_payload(db, manager_id, d, body.new_role, body.employees)

    doc = HrDocument(
        doc_type="role_change",
        manager_id=manager_id,
        supervisor_name=mgr_name,
        date=d,
        payload=payload,
        status="draft",
        created_by_telegram_id=int(caller["sub"]),
        created_by_name=caller.get("full_name", ""),
        created_by_role=caller.get("role"),
    )
    db.add(doc)
    db.flush()
    _record_history(db, doc, "created", caller, {
        "new_role": body.new_role, "employee_count": len(payload["employees"]),
    })
    # Ghost Mode: an admin's change applies immediately, with no approval step and
    # no notifications/approval-requests to anyone (notify + broadcast are gated).
    if notifications_suppressed():
        _approve_doc(doc, caller, db)
        db.commit()
        return {"id": doc.id, "status": doc.status}
    _notify_all_parties(
        db, manager_id,
        "new_role_change",
        {"actor_name": caller.get("full_name", ""), "count": len(payload["employees"]),
         "new_role": body.new_role, "date": body.attend_date},
        ntype="info",
        actor_tg_id=int(caller["sub"]),
        include_supervisor=False,
        admin_dm=False,            # admins get the rich approve/reject message instead
    )
    db.commit()
    try:
        from app.approvals import send_hr_document_to_admins
        send_hr_document_to_admins(db, doc)
    except Exception:
        pass
    return {"id": doc.id}


def _create_people_exchange(db: Session, caller: dict, body: "DocCreateBody",
                            d: date, manager_id: int, mgr_name: Optional[str]):
    # The sending unit's day must still be open
    _assert_day_open(db, manager_id, d)
    ttype, tgt_id, tgt_name, task_name = _resolve_exchange_target(
        db, manager_id, d, body.target_type, body.target_manager_id, body.task_name,
    )
    ttime = _normalize_transfer_time(caller, ttype, body.transfer_time)
    rtime = _normalize_return_time(ttype, ttime, body.return_time)
    payload = _build_exchange_payload(db, manager_id, d, ttype, tgt_id, tgt_name, task_name,
                                      body.employees, transfer_time=ttime, return_time=rtime)
    if not payload["employees"]:
        raise HTTPException(status_code=400, detail="None of the selected workers have a record on this date")
    if ttype == "task":
        _ensure_exchange_task(db, task_name, caller)

    doc = HrDocument(
        doc_type="people_exchange",
        manager_id=manager_id,
        supervisor_name=mgr_name,
        date=d,
        payload=payload,
        status="draft",
        created_by_telegram_id=int(caller["sub"]),
        created_by_name=caller.get("full_name", ""),
        created_by_role=caller.get("role"),
    )
    db.add(doc)
    db.flush()
    _record_history(db, doc, "created", caller, {
        "target": _exchange_target_label(payload), "employee_count": len(payload["employees"]),
    })
    # Ghost Mode: apply immediately, silently — no approval step, no pings.
    if notifications_suppressed():
        _approve_doc(doc, caller, db)
        db.commit()
        return {"id": doc.id, "status": doc.status}
    _notify_exchange(db, doc, "created", int(caller["sub"]), admin_dm=False)
    db.commit()
    try:
        from app.approvals import send_hr_document_to_admins
        send_hr_document_to_admins(db, doc)
    except Exception:
        pass
    return {"id": doc.id}


class DocUpdateBody(BaseModel):
    employees: List[str]
    new_role:  Optional[str] = None           # role_change
    target_type:       Optional[str] = None   # people_exchange
    target_manager_id: Optional[int] = None
    task_name:         Optional[str] = None
    transfer_time:     Optional[str] = None
    return_time:       Optional[str] = None


@router.put("/documents/{doc_id}")
def update_document(doc_id: int, body: DocUpdateBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft (Нет) documents can be edited")
    is_creator = doc.created_by_telegram_id == int(caller["sub"])
    if caller.get("role") not in ("admin", "shift-manager") and not is_creator:
        raise HTTPException(status_code=403, detail="Not allowed to edit this document")
    if not body.employees:
        raise HTTPException(status_code=400, detail="Select at least one employee")

    if doc.doc_type == "people_exchange":
        _assert_day_open(db, doc.manager_id, doc.date)   # sender's day must be open
        prev    = doc.payload or {}
        ttype   = body.target_type or prev.get("target_type")
        tgt_in  = body.target_manager_id if body.target_manager_id is not None else prev.get("target_manager_id")
        task_in = body.task_name if body.task_name is not None else prev.get("task_name")
        ttype, tgt_id, tgt_name, task_name = _resolve_exchange_target(db, doc.manager_id, doc.date, ttype, tgt_in, task_in)
        ttime_in = body.transfer_time if body.transfer_time is not None else prev.get("transfer_time")
        ttime    = _normalize_transfer_time(caller, ttype, ttime_in)
        rtime_in = body.return_time if body.return_time is not None else prev.get("return_time")
        rtime    = _normalize_return_time(ttype, ttime, rtime_in)
        payload = _build_exchange_payload(db, doc.manager_id, doc.date, ttype, tgt_id, tgt_name, task_name,
                                          body.employees, transfer_time=ttime, return_time=rtime)
        if not payload["employees"]:
            raise HTTPException(status_code=400, detail="None of the selected workers have a record on this date")
        if ttype == "task":
            _ensure_exchange_task(db, task_name, caller)
        doc.payload = payload
        _record_history(db, doc, "edited", caller, {
            "target": _exchange_target_label(payload), "employee_count": len(payload["employees"]),
        })
        db.commit()
        return {"ok": True}

    # ── role_change ──
    if caller.get("role") == "supervisor":
        _assert_day_open(db, doc.manager_id, doc.date)
    if not body.new_role:
        raise HTTPException(status_code=400, detail="new_role is required")
    if not is_assignable_target_role(body.new_role):
        raise HTTPException(status_code=400, detail="This role can only be set from verifix files and cannot be chosen as a role-change target")
    doc.payload = _build_role_payload(db, doc.manager_id, doc.date, body.new_role, body.employees)
    _record_history(db, doc, "edited", caller, {
        "new_role": body.new_role, "employee_count": len(body.employees),
    })
    db.commit()
    return {"ok": True}


# ── Approve (Провести) / Cancel (Отменить) / Delete (Удалить) ────────────────────

def _apply_doc_effects(db: Session, doc: HrDocument):
    if doc.doc_type == "role_change":
        _apply_role_change(db, doc)
    elif doc.doc_type == "people_exchange":
        _apply_people_exchange(db, doc)


def _revert_doc_effects(db: Session, doc: HrDocument):
    if doc.doc_type == "role_change":
        _revert_role_change(db, doc)
    elif doc.doc_type == "people_exchange":
        _revert_people_exchange(db, doc)


def _approve_doc(doc: HrDocument, caller: dict, db: Session):
    if doc.status == "approved":
        return
    _apply_doc_effects(db, doc)
    doc.status                  = "approved"
    doc.approved_by_telegram_id = int(caller["sub"])
    doc.approved_by_name        = caller.get("full_name", "")
    doc.approved_at             = datetime.now(timezone.utc)
    _record_history(db, doc, "approved", caller)


def _cancel_doc(doc: HrDocument, caller: dict, db: Session):
    if doc.status != "approved":
        return
    _revert_doc_effects(db, doc)
    doc.status                  = "draft"
    doc.approved_by_telegram_id = None
    doc.approved_by_name        = None
    doc.approved_at             = None
    _record_history(db, doc, "cancelled", caller)


def _reject_document(doc: HrDocument, caller: dict, db: Session):
    """Reject a *draft* HR document — delete it and notify its creator. This is
    the Telegram/app counterpart of approving (posting) a draft. Approved
    documents cannot be rejected; cancel or delete them instead."""
    if doc.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft documents can be rejected")
    if doc.created_by_telegram_id and doc.created_by_telegram_id != int(caller["sub"]):
        _notify(db, doc.created_by_telegram_id, type="error",
                nkey="document_rejected",
                params={
                    "actor_name": caller.get("full_name", ""),
                    "doc_type":   doc.doc_type,
                    "date":       doc.date,
                })
    db.delete(doc)


@router.post("/documents/{doc_id}/approve")
def approve_document(doc_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_approve_doc(doc, caller, db):
        raise HTTPException(status_code=403, detail="Not authorised to post this document")
    _approve_doc(doc, caller, db)
    if doc.doc_type == "people_exchange":
        _notify_exchange(db, doc, "approved", int(caller["sub"]))
    db.commit()
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("hr_document", str(doc_id), "approved", caller.get("full_name", ""))
    except Exception:
        pass
    return {"ok": True, "status": doc.status}


@router.post("/documents/{doc_id}/cancel")
def cancel_document(doc_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_approve_doc(doc, caller, db):
        raise HTTPException(status_code=403, detail="Not authorised to un-post this document")
    _cancel_doc(doc, caller, db)
    if doc.doc_type == "people_exchange":
        _notify_exchange(db, doc, "cancelled", int(caller["sub"]))
    db.commit()
    return {"ok": True, "status": doc.status}


@router.post("/documents/{doc_id}/delete")
def delete_document(doc_id: int, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    doc = _scope_documents(db.query(HrDocument), caller, db).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_creator = doc.created_by_telegram_id == int(caller["sub"])
    was_draft  = doc.status == "draft"
    # Approved docs may only be removed by an approver (reverts effects first).
    if doc.status == "approved":
        if not _can_approve_doc(doc, caller, db):
            raise HTTPException(status_code=403, detail="Approved documents can only be deleted by an approver")
        _revert_doc_effects(db, doc)
    elif caller.get("role") not in ("admin", "shift-manager") and not is_creator:
        raise HTTPException(status_code=403, detail="Not allowed to delete this document")

    db.delete(doc)
    db.commit()
    # Deleting a draft is the rejection of a pending request — clear the admins'
    # Telegram buttons. (Approved-doc deletes already dropped their notices on
    # approval, so this is a no-op for them.)
    if was_draft:
        try:
            from app.approvals import edit_admin_notices
            edit_admin_notices("hr_document", str(doc_id), "rejected", caller.get("full_name", ""))
        except Exception:
            pass
    return {"ok": True}


# ── Bulk toolbar (Провести / Отменить / Удалить on many) ─────────────────────────

class DocBulkBody(BaseModel):
    ids:    List[int]
    action: str           # approve | cancel | delete


@router.post("/documents/bulk")
def bulk_documents(body: DocBulkBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    docs = _scope_documents(db.query(HrDocument), caller, db) \
        .filter(HrDocument.id.in_(body.ids)).all()

    done = 0
    resolved: list[tuple[int, str]] = []   # (doc_id, outcome) for admin-message cross-edit
    for doc in docs:
        # Approval authority is per-document (e.g. a receiving supervisor may
        # post their own incoming exchange but not someone else's role change).
        if body.action == "approve":
            if not _can_approve_doc(doc, caller, db):
                continue
            _approve_doc(doc, caller, db)
            if doc.doc_type == "people_exchange":
                _notify_exchange(db, doc, "approved", int(caller["sub"]))
            resolved.append((doc.id, "approved"))
        elif body.action == "cancel":
            if not _can_approve_doc(doc, caller, db):
                continue
            _cancel_doc(doc, caller, db)
            if doc.doc_type == "people_exchange":
                _notify_exchange(db, doc, "cancelled", int(caller["sub"]))
        elif body.action == "delete":
            is_creator = doc.created_by_telegram_id == int(caller["sub"])
            was_draft  = doc.status == "draft"
            if doc.status == "approved":
                if not _can_approve_doc(doc, caller, db):
                    continue
                _revert_doc_effects(db, doc)
            elif caller.get("role") not in ("admin", "shift-manager") and not is_creator:
                continue
            if was_draft:
                resolved.append((doc.id, "rejected"))
            db.delete(doc)
        else:
            raise HTTPException(status_code=400, detail="Unknown action")
        done += 1

    db.commit()
    if resolved:
        try:
            from app.approvals import edit_admin_notices
            name = caller.get("full_name", "")
            for doc_id, outcome in resolved:
                edit_admin_notices("hr_document", str(doc_id), outcome, name)
        except Exception:
            pass
    return {"ok": True, "affected": done}


# ══════════════════════════════════════════════════════════════════════════════
#  DAY CLOSE — supervisors close their own day (no admin approval needed).
#  Existence of a DayApproval row = day CLOSED. The day becomes CONFIRMED once
#  every request for that date is processed (approved or rejected). Only
#  confirmed (manager, date) pairs are calculated/shown anywhere on dashboards.
#  Only an admin can re-open a closed day (deletes the row → back to OPEN).
# ══════════════════════════════════════════════════════════════════════════════

def _shift_of_slot(slot: Optional[int]) -> int:
    """shift-manager role_id (slot 1-4) → shift number (1 or 2)."""
    return 1 if slot in (1, 2) else 2


def _visible_manager_ids(db: Session, caller) -> Optional[List[int]]:
    """Manager ids a caller may see/approve. None = all (admin)."""
    role    = caller.get("role")
    role_id = caller.get("role_id")
    if role == "admin":
        return None
    if role == "supervisor":
        return [role_id] if role_id else []
    if role == "shift-manager":
        shift = _shift_of_slot(role_id)
        return [m.id for m in db.query(Manager).filter(Manager.shift == shift).all()]
    return []


def _can_touch_manager(db: Session, caller, manager_id: int) -> bool:
    vis = _visible_manager_ids(db, caller)
    return vis is None or manager_id in vis


@router.get("/approvals/calendar")
def approvals_calendar(
    year: int,
    month: int,
    manager_id: Optional[int] = None,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """
    Per-day status for one manager across a calendar month:
      confirmed → day closed and all its requests processed
      closed    → day closed but requests still await review
      open      → the day has worker data but is not closed yet
      (absent)  → no worker data that day
    """
    role = caller.get("role")
    if role == "supervisor":
        manager_id = caller.get("role_id")
    if not manager_id:
        raise HTTPException(status_code=400, detail="manager_id required")
    if not _can_touch_manager(db, caller, manager_id):
        raise HTTPException(status_code=403, detail="Not allowed for this manager")

    start = date(year, month, 1)
    end   = date(year + (month == 12), (month % 12) + 1, 1)  # first day of next month

    # Dates with real worker data
    data_dates = {
        d for (d,) in db.query(distinct(Attendance.date)).filter(
            Attendance.manager_id == manager_id,
            Attendance.date >= start, Attendance.date < end,
            Attendance.worker_name.isnot(None),
            Attendance.worker_name.notin_(["", "nan", "NaN"]),
        ).all()
    }

    closures = db.query(DayApproval).filter(
        DayApproval.manager_id == manager_id,
        DayApproval.date >= start, DayApproval.date < end,
    ).all()
    closed_map = {a.date: a for a in closures}

    # Dates still blocked by unprocessed requests / draft documents
    pending_dates = {
        d for (d,) in db.query(distinct(EditRequest.date)).filter(
            EditRequest.manager_id == manager_id,
            EditRequest.date >= start, EditRequest.date < end,
            EditRequest.status == "pending",
        ).all()
    } | {
        d for (d,) in db.query(distinct(HrDocument.date)).filter(
            HrDocument.manager_id == manager_id,
            HrDocument.date >= start, HrDocument.date < end,
            HrDocument.status == "draft",
        ).all()
    }

    all_dates = data_dates | set(closed_map.keys())
    days = {}
    for d in sorted(all_dates):
        iso = d.isoformat()
        if d in closed_map:
            a = closed_map[d]
            days[iso] = {
                "status":    "closed" if d in pending_dates else "confirmed",
                "closed_by": a.approved_by_name,
                "closed_at": a.approved_at.isoformat() if a.approved_at else None,
            }
        else:
            days[iso] = {"status": "open"}

    mgr = db.query(Manager).filter_by(id=manager_id).first()
    return {
        "manager_id": manager_id,
        "manager_name": mgr.name if mgr else None,
        "year": year, "month": month,
        "days": days,
    }


@router.get("/approvals/day")
def approval_day(
    attend_date: str,
    manager_id: Optional[int] = None,
    caller=Depends(_require_staff),
    db: Session = Depends(get_db),
):
    """Day-close state for a single (manager, date) — used by the Daily/Staff pages."""
    role = caller.get("role")
    if role == "supervisor":
        manager_id = caller.get("role_id")
    if not manager_id:
        raise HTTPException(status_code=400, detail="manager_id required")
    if not _can_touch_manager(db, caller, manager_id):
        raise HTTPException(status_code=403, detail="Not allowed for this manager")
    try:
        d = date.fromisoformat(attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    state, closure, counts = day_state(db, manager_id, d)
    return {
        "manager_id":       manager_id,
        "date":             attend_date,
        "state":            state,   # open | closed | confirmed
        "closed":           closure is not None,
        "closed_by":        closure.approved_by_name if closure else None,
        "closed_at":        closure.approved_at.isoformat() if closure and closure.approved_at else None,
        "pending_requests": counts["pending_requests"] + counts["draft_docs"],
        "can_reopen":       role == "admin",
    }


class ApprovalBody(BaseModel):
    manager_id: Optional[int] = None
    date: str


@router.post("/daily/close")
def close_day(body: ApprovalBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    """
    Supervisor closes their own day (final — no approval needed), or an admin
    closes a day on behalf of a supervisor (manager_id required in the body;
    the supervisor gets notified). After closing, the supervisor can no longer
    submit changes for this date. Data appears on dashboards once every request
    for the date is processed (the day becomes 'confirmed').
    """
    role = caller.get("role")
    if role == "supervisor":
        manager_id = caller.get("role_id")
        if not manager_id:
            raise HTTPException(status_code=400, detail="Supervisor has no assigned manager")
    elif role == "admin":
        manager_id = body.manager_id
        if not manager_id:
            raise HTTPException(status_code=400, detail="manager_id required")
    else:
        raise HTTPException(status_code=403, detail="Only supervisors or admins can close a day")
    try:
        d = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    if d > date.today():
        raise HTTPException(status_code=400, detail="Cannot close a future date")

    if db.query(DayApproval).filter_by(manager_id=manager_id, date=d).first():
        raise HTTPException(status_code=409, detail="Day is already closed")

    closer_name = caller.get("full_name", "")
    db.add(DayApproval(
        manager_id=manager_id,
        date=d,
        approved_by_telegram_id=int(caller["sub"]),
        approved_by_name=closer_name,
        approved_at=datetime.now(timezone.utc),
    ))
    _notify_all_parties(
        db, manager_id,
        "day_closed",
        {"closer_name": closer_name, "date": body.date},
        ntype="info",
        actor_tg_id=int(caller["sub"]),
        include_supervisor=(role == "admin"),
    )
    db.commit()

    state, _, counts = day_state(db, manager_id, d)
    return {
        "ok": True, "state": state, "manager_id": manager_id, "date": body.date,
        "pending_requests": counts["pending_requests"] + counts["draft_docs"],
    }


@router.post("/approvals/reopen")
def reopen_day(body: ApprovalBody, caller=Depends(_require_staff), db: Session = Depends(get_db)):
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can re-open a closed day")
    if not body.manager_id:
        raise HTTPException(status_code=400, detail="manager_id required")
    try:
        d = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    existing = db.query(DayApproval).filter_by(manager_id=body.manager_id, date=d).first()
    if existing:
        db.delete(existing)
        _notify_all_parties(
            db, body.manager_id,
            "day_reopened",
            {"reopener_name": caller.get("full_name", "admin"), "date": body.date},
            ntype="warning",
            actor_tg_id=int(caller["sub"]),
            include_supervisor=True,
        )
        db.commit()
    return {"ok": True, "state": "open", "manager_id": body.manager_id, "date": body.date}


@router.get("/approvals/cells")
def approved_cells(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("zagruzka", "staff", "daily")),
):
    """
    Open endpoint (mirrors /api/heatmap): the CONFIRMED (manager_id, date)
    pairs in a range — closed days with no unprocessed requests left. The
    dashboard treats everything else as having no data. Returns ISO dates.
    """
    def _parse(s, fallback):
        try:
            return date.fromisoformat(s) if s else fallback
        except ValueError:
            return fallback

    d_from = _parse(date_from, date(2000, 1, 1))
    d_to   = _parse(date_to,   date(2100, 1, 1))
    pairs  = confirmed_pairs(db, d_from, d_to)
    return {"cells": [{"manager_id": mid, "date": d.isoformat()} for mid, d in sorted(pairs)]}
