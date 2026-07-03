"""
Telegram bot — runs inside the FastAPI process via webhook.
Updates arrive at POST /bot/webhook and are dispatched here.
"""
import json
import logging
from datetime import datetime, timezone

import telebot
from telebot import types
from sqlalchemy import and_, or_

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Admin, Manager, RegistrationNotice, RoleProfile, TelegramUser, TelegramUserRole,
)

logger = logging.getLogger(__name__)

bot = telebot.TeleBot(settings.telegram_bot_token, parse_mode=None)

# In-memory state: { telegram_id: { "language": "uz"|"uz_cyrl"|"ru"|"en" } }
_state: dict[int, dict] = {}

# ── i18n ──────────────────────────────────────────────────────────────────────

_MESSAGES = {
    "uz": {
        "choose_language":   "🌐 Tilni tanlang:",
        "welcome_new":       "👋 Xush kelibsiz! Ro'yxatdan o'tish uchun quyidagi tugmani bosing.",
        "register_btn":      "📝 Ro'yxatdan o'tish",
        "share_contact_prompt": (
            "✅ Ma'lumotlaringiz qabul qilindi!\n\n"
            "📱 Iltimos, telefon raqamingizni ulashing:"
        ),
        "share_contact_btn": "📱 Raqamni ulashish",
        "waiting_approval":  (
            "⏳ So'rovingiz adminga yuborildi.\n"
            "Tasdiqlangach sizga xabar yuboriladi."
        ),
        "approved": (
            "✅ Tabriklaymiz! So'rovingiz tasdiqlandi.\n"
            "Dashboardni ochish uchun quyidagi tugmani bosing:"
        ),
        "rejected": (
            "❌ Afsuski, so'rovingiz rad etildi.\n"
            "Qo'shimcha ma'lumot uchun admin bilan bog'laning."
        ),
        "open_dashboard":    "Ochish",
        "already_pending":   "⏳ Sizning so'rovingiz allaqachon ko'rib chiqilmoqda.",
        "already_approved":  (
            "✅ Siz allaqachon tasdiqlangansiz!\n"
            "Dashboardni ochish uchun tugmani bosing:"
        ),
        "admin_welcome":     "👑 Admin paneliga xush kelibsiz!",
        "admin_role_added":  "✅ Yangi rol qo'shildi va tasdiqlandi. Web ilovada profilni almashtirib turing.",
        "add_role_hint":     "➕ Yana bir rol qo'shmoqchimisiz? Quyidagi tugma orqali yangi rol uchun ro'yxatdan o'ting.",
        "unknown_command":   "Boshlash uchun /start ni bosing.",
        "adminreg_choose":   "👤 Admin profilini tanlang:",
        "adminreg_none":     "Bo'sh admin profillari yo'q.",
        "adminreg_already":  "Siz allaqachon adminsiz.",
    },
    "uz_cyrl": {
        "choose_language":   "🌐 Тилни танланг:",
        "welcome_new":       "👋 Хуш келибсиз! Рўйхатдан ўтиш учун қуйидаги тугмани босинг.",
        "register_btn":      "📝 Рўйхатдан ўтиш",
        "share_contact_prompt": (
            "✅ Маълумотларингиз қабул қилинди!\n\n"
            "📱 Илтимос, телефон рақамингизни улашинг:"
        ),
        "share_contact_btn": "📱 Рақамни улашиш",
        "waiting_approval":  (
            "⏳ Сўровингиз админга юборилди.\n"
            "Тасдиқлангач сизга хабар юборилади."
        ),
        "approved": (
            "✅ Табриклаймиз! Сўровингиз тасдиқланди.\n"
            "Дашбордни очиш учун қуйидаги тугмани босинг:"
        ),
        "rejected": (
            "❌ Афсуски, сўровингиз рад этилди.\n"
            "Қўшимча маълумот учун админ билан боғланинг."
        ),
        "open_dashboard":    "Очиш",
        "already_pending":   "⏳ Сизнинг сўровингиз аллақачон кўриб чиқилмоқда.",
        "already_approved":  (
            "✅ Сиз аллақачон тасдиқлангансиз!\n"
            "Дашбордни очиш учун тугмани босинг:"
        ),
        "admin_welcome":     "👑 Админ панелига хуш келибсиз!",
        "admin_role_added":  "✅ Янги рол қўшилди ва тасдиқланди. Web иловада профилни алмаштириб туринг.",
        "add_role_hint":     "➕ Яна бир рол қўшмоқчимисиз? Қуйидаги тугма орқали янги рол учун рўйхатдан ўтинг.",
        "unknown_command":   "Бошлаш учун /start ни босинг.",
        "adminreg_choose":   "👤 Админ профилини танланг:",
        "adminreg_none":     "Бўш админ профиллари йўқ.",
        "adminreg_already":  "Сиз аллақачон админсиз.",
    },
    "ru": {
        "choose_language":   "🌐 Выберите язык:",
        "welcome_new":       "👋 Добро пожаловать! Нажмите кнопку ниже для регистрации.",
        "register_btn":      "📝 Зарегистрироваться",
        "share_contact_prompt": (
            "✅ Данные приняты!\n\n"
            "📱 Пожалуйста, поделитесь номером телефона:"
        ),
        "share_contact_btn": "📱 Поделиться номером",
        "waiting_approval":  (
            "⏳ Ваш запрос отправлен администратору.\n"
            "После подтверждения вы получите уведомление."
        ),
        "approved": (
            "✅ Поздравляем! Ваш запрос одобрен.\n"
            "Нажмите кнопку для открытия дашборда:"
        ),
        "rejected": (
            "❌ К сожалению, ваш запрос отклонён.\n"
            "Обратитесь к администратору за дополнительной информацией."
        ),
        "open_dashboard":    "Открыть",
        "already_pending":   "⏳ Ваша заявка уже рассматривается.",
        "already_approved":  (
            "✅ Вы уже подтверждены!\n"
            "Нажмите кнопку для открытия дашборда:"
        ),
        "admin_welcome":     "👑 Добро пожаловать в панель администратора!",
        "admin_role_added":  "✅ Новая роль добавлена и подтверждена. Переключайте профиль в веб-приложении.",
        "add_role_hint":     "➕ Хотите добавить ещё одну роль? Зарегистрируйтесь на новую роль с помощью кнопки ниже.",
        "unknown_command":   "Отправьте /start для начала.",
        "adminreg_choose":   "👤 Выберите админ-профиль:",
        "adminreg_none":     "Нет свободных админ-профилей.",
        "adminreg_already":  "Вы уже администратор.",
    },
    "en": {
        "choose_language":   "🌐 Choose your language:",
        "welcome_new":       "👋 Welcome! Press the button below to register.",
        "register_btn":      "📝 Register",
        "share_contact_prompt": (
            "✅ Details received!\n\n"
            "📱 Please share your phone number:"
        ),
        "share_contact_btn": "📱 Share Contact",
        "waiting_approval":  (
            "⏳ Your request has been sent to the admin.\n"
            "You'll be notified once it's reviewed."
        ),
        "approved": (
            "✅ Congratulations! Your request has been approved.\n"
            "Press the button to open the dashboard:"
        ),
        "rejected": (
            "❌ Unfortunately, your request was rejected.\n"
            "Please contact the admin for more information."
        ),
        "open_dashboard":    "Open",
        "already_pending":   "⏳ Your registration is already under review.",
        "already_approved":  (
            "✅ You're already approved!\n"
            "Press the button to open the dashboard:"
        ),
        "admin_welcome":     "👑 Welcome to the admin panel!",
        "admin_role_added":  "✅ New role added and approved. Switch between profiles in the web app.",
        "add_role_hint":     "➕ Want to add another role? Use the button below to register for a new role.",
        "unknown_command":   "Send /start to begin.",
        "adminreg_choose":   "👤 Select an admin profile:",
        "adminreg_none":     "No available admin profiles.",
        "adminreg_already":  "You are already an admin.",
    },
}

_ROLE_LABELS = {
    "uz":      {"top-manager": "Top-menejer", "shift-manager": "Smena menejeri", "supervisor": "Brigadir", "leader": "Lider", "admin": "Admin"},
    "uz_cyrl": {"top-manager": "Топ-менежер", "shift-manager": "Смена менежери", "supervisor": "Бригадир", "leader": "Лидер", "admin": "Админ"},
    "ru":      {"top-manager": "Топ-менеджер", "shift-manager": "Сменный менеджер", "supervisor": "Бригадир", "leader": "Лидер", "admin": "Администратор"},
    "en":      {"top-manager": "Top Manager", "shift-manager": "Shift Manager", "supervisor": "Supervisor", "leader": "Leader", "admin": "Admin"},
}


def _msg(lang: str, key: str) -> str:
    return _MESSAGES.get(lang, _MESSAGES["uz"]).get(key, _MESSAGES["uz"].get(key, key))


def _role(lang: str, role: str) -> str:
    return _ROLE_LABELS.get(lang, _ROLE_LABELS["uz"]).get(role, role)


# ── Keyboards ─────────────────────────────────────────────────────────────────

def _lang_kb() -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton("🇺🇿 O'zbekcha", callback_data="lang:uz"),
        types.InlineKeyboardButton("🇺🇿 Ўзбекча",   callback_data="lang:uz_cyrl"),
    )
    kb.row(
        types.InlineKeyboardButton("🇷🇺 Русский",   callback_data="lang:ru"),
        types.InlineKeyboardButton("🇬🇧 English",   callback_data="lang:en"),
    )
    return kb


def _webapp_register_kb(lang: str) -> types.ReplyKeyboardMarkup:
    """
    MUST be a ReplyKeyboardMarkup / KeyboardButton — sendData() only works
    when the WebApp is opened from a keyboard button, not an inline button.
    """
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add(types.KeyboardButton(
        _msg(lang, "register_btn"),
        web_app=types.WebAppInfo(url=f"{settings.webapp_url.rstrip('/')}/login"),
    ))
    return kb


def _contact_kb(lang: str) -> types.ReplyKeyboardMarkup:
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add(types.KeyboardButton(_msg(lang, "share_contact_btn"), request_contact=True))
    return kb


def _admin_panel_kb() -> types.InlineKeyboardMarkup:
    """Single button that opens the admin panel's Users tab pre-filtered to
    pending requests — the panel escape hatch / legacy fallback."""
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        "👥 Admin panelda ko'rish",
        web_app=types.WebAppInfo(
            url=f"{settings.webapp_url.rstrip('/')}/admin/upload?tab=users&status=pending"
        ),
    ))
    return kb


def _registration_kb(role_ref: int) -> types.InlineKeyboardMarkup:
    """Inline Approve/Reject for a registration request, plus the original
    'open panel' button kept alongside (per the 'keep both' decision)."""
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton("✅ Tasdiqlash", callback_data=f"ap:reg:a:{role_ref}"),
        types.InlineKeyboardButton("❌ Rad etish",  callback_data=f"ap:reg:r:{role_ref}"),
    )
    kb.add(types.InlineKeyboardButton(
        "👥 Admin panelda ko'rish",
        web_app=types.WebAppInfo(
            url=f"{settings.webapp_url.rstrip('/')}/admin/upload?tab=users&status=pending"
        ),
    ))
    return kb


def _dashboard_kb(lang: str) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        _msg(lang, "open_dashboard"),
        web_app=types.WebAppInfo(url=settings.webapp_url.rstrip("/")),
    ))
    return kb


# ── Helpers ───────────────────────────────────────────────────────────────────

def _admin_ids() -> set[int]:
    with SessionLocal() as db:
        return {a.telegram_id for a in db.query(Admin).all()}


def _registration_text(full_name: str, role: str, phone: str | None,
                       target_id: int, username: str | None,
                       supervisor: str | None = None) -> str:
    text = (
        f"🆕 Yangi ro'yxatdan o'tish:\n\n"
        f"👤 Ism: {full_name}\n"
        f"💼 Lavozim: {_role('uz', role)}\n"
    )
    if supervisor:
        text += f"👥 Brigadir: {supervisor}\n"
    text += (
        f"📱 Telefon: {phone or '—'}\n"
        f"🆔 Telegram ID: {target_id}"
    )
    if username:
        text += f"\n🔗 @{username}"
    return text


def _notify_admins_of_registration(db, target_id: int, text: str, role_ref: int | None = None):
    """Send the registration notification to every admin and record each sent
    message so it can be edited with the outcome later. Per-admin failures are
    swallowed — one unreachable admin must not block the others."""
    sent_any = False
    kb = _registration_kb(role_ref) if role_ref else _admin_panel_kb()
    for admin_id in sorted(_admin_ids()):
        try:
            sent = bot.send_message(admin_id, text, reply_markup=kb)
        except Exception:
            logger.exception("Failed to notify admin %s of registration (tid=%s)", admin_id, target_id)
            continue
        db.add(RegistrationNotice(
            target_telegram_id=target_id,
            role_ref=role_ref,
            admin_telegram_id=admin_id,
            message_id=sent.message_id,
            text=text,
        ))
        sent_any = True
    db.commit()
    return sent_any


def _get_lang(tid: int) -> str:
    if tid in _state and "language" in _state[tid]:
        return _state[tid]["language"]
    with SessionLocal() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        return user.language if user else "uz"


def _set_menu_button(tid: int, lang: str):
    try:
        bot.set_chat_menu_button(
            chat_id=tid,
            menu_button=types.MenuButtonWebApp(
                type="web_app",
                text=_msg(lang, "open_dashboard"),
                web_app=types.WebAppInfo(url=settings.webapp_url.rstrip("/")),
            ),
        )
    except Exception as e:
        logger.warning("set_chat_menu_button failed for %s: %s", tid, e)


def _send_dashboard(tid: int, lang: str, text: str):
    """Send ``text`` with the inline dashboard button while also clearing any
    lingering reply keyboard (e.g. the register button). A message carries a
    single reply_markup, so the keyboard is removed first and the inline
    button attached by edit."""
    sent = bot.send_message(tid, text, reply_markup=types.ReplyKeyboardRemove())
    try:
        bot.edit_message_reply_markup(
            chat_id=tid,
            message_id=sent.message_id,
            reply_markup=_dashboard_kb(lang),
        )
    except Exception:
        bot.send_message(tid, _msg(lang, "open_dashboard"), reply_markup=_dashboard_kb(lang))


# ── Handlers ──────────────────────────────────────────────────────────────────

@bot.message_handler(commands=["start"])
def _start(message: types.Message):
    tid = message.from_user.id

    # Old deep links (t.me/<bot>?start=register) still lead to registration
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) > 1 and parts[1].strip() == "register":
        _begin_registration(tid)
        return

    if tid in _admin_ids():
        _set_menu_button(tid, "uz")
        _send_dashboard(tid, "uz", _msg("uz", "admin_welcome"))
        with SessionLocal() as db:
            pending_count = db.query(TelegramUserRole).filter_by(status="pending").count()
        if pending_count:
            bot.send_message(tid, f"⏳ {pending_count} ta kutilayotgan so'rov bor. Ko'rish uchun /pending")
        return

    with SessionLocal() as db:
        user  = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        roles = db.query(TelegramUserRole).filter_by(telegram_id=tid).all() if user else []

    if user and roles:
        lang     = user.language
        statuses = {r.status for r in roles}
        if "approved" in statuses:
            _set_menu_button(tid, lang)
            # Adding another role moved to /register — only the dashboard here
            _send_dashboard(tid, lang, _msg(lang, "already_approved"))
        elif "pending" in statuses:
            bot.send_message(tid, _msg(lang, "already_pending"),
                             reply_markup=types.ReplyKeyboardRemove())
        else:
            _state.pop(tid, None)
            bot.send_message(tid, _msg("uz", "choose_language"), reply_markup=_lang_kb())
        return

    bot.send_message(tid, _msg("uz", "choose_language"), reply_markup=_lang_kb())


def _begin_registration(tid: int):
    """Registration entry point — /register command and ?start=register links.
    New users start the language → register flow, approved users get the
    add-another-role button, a pending request blocks until it is decided.
    Admins may register too: they keep their admin profile and can add regular
    roles to switch between in the web app (/start still opens the panel)."""
    with SessionLocal() as db:
        user  = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        roles = db.query(TelegramUserRole).filter_by(telegram_id=tid).all() if user else []

    if user and roles:
        lang     = user.language
        statuses = {r.status for r in roles}
        if "pending" in statuses:
            bot.send_message(tid, _msg(lang, "already_pending"))
            return
        if "approved" in statuses:
            bot.send_message(tid, _msg(lang, "add_role_hint"), reply_markup=_webapp_register_kb(lang))
            return

    # New user, or every previous request was rejected — fresh start
    _state.pop(tid, None)
    bot.send_message(tid, _msg("uz", "choose_language"), reply_markup=_lang_kb())


@bot.message_handler(commands=["register"])
def _register(message: types.Message):
    _begin_registration(message.from_user.id)


@bot.callback_query_handler(func=lambda c: c.data.startswith("lang:"))
def _language(call: types.CallbackQuery):
    tid  = call.from_user.id
    lang = call.data.split(":", 1)[1]
    if lang not in ("uz", "uz_cyrl", "ru", "en"):
        bot.answer_callback_query(call.id)
        return

    _state.setdefault(tid, {})["language"] = lang
    bot.answer_callback_query(call.id)

    # Edit the language-selection message to remove its buttons
    try:
        bot.edit_message_reply_markup(
            chat_id=tid,
            message_id=call.message.message_id,
            reply_markup=None,
        )
    except Exception:
        pass

    # Send register button as a ReplyKeyboard (required for sendData() to work)
    bot.send_message(tid, _msg(lang, "welcome_new"), reply_markup=_webapp_register_kb(lang))


@bot.message_handler(content_types=["web_app_data"])
def _webapp_data(message: types.Message):
    tid = message.from_user.id
    try:
        data       = json.loads(message.web_app_data.data)
        full_name  = str(data.get("full_name", "")).strip()
        role       = str(data.get("role", ""))
        supervisor = str(data.get("supervisor", "")).strip()  # leader → chosen brigadir/unit
    except Exception:
        return

    if not full_name or role not in ("top-manager", "shift-manager", "supervisor", "leader"):
        return
    # A leader must pick their supervisor (unit); without it we can't file the request.
    if role == "leader" and not supervisor:
        return

    lang = _get_lang(tid)
    # Admins are trusted: their role is approved on the spot — no phone/contact
    # step and no admin notification. Everyone else stays pending until decided.
    is_admin = tid in _admin_ids()
    new_status = "approved" if is_admin else "pending"

    with SessionLocal() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()

        # Resolve role_id — registration only binds a pre-created profile now.
        # A name that matches no profile is dropped silently: the pickers only
        # offer real profiles, so this can only be a stale/forged payload.
        role_id = None
        if role == "supervisor":
            mgr = db.query(Manager).filter(Manager.name == full_name,
                                           Manager.archived.is_(False)).first()
            if not mgr:
                return
            role_id = mgr.id
        elif role == "leader":
            # A leader picks their supervisor's unit, then one of that unit's
            # pre-created leader profiles — role_id keeps pointing at the unit.
            mgr = db.query(Manager).filter(Manager.name == supervisor,
                                           Manager.archived.is_(False)).first()
            if not mgr:
                return
            if not db.query(RoleProfile).filter_by(role="leader", manager_id=mgr.id,
                                                   name=full_name).first():
                return
            role_id = mgr.id
        elif role == "shift-manager":
            p = db.query(RoleProfile).filter_by(role="shift-manager", name=full_name).first()
            if not p:
                return
            role_id = p.id
        else:  # top-manager — also a pre-created profile now
            p = db.query(RoleProfile).filter_by(role="top-manager", name=full_name).first()
            if not p:
                return
            role_id = p.id

        # A user may hold several roles, but only one instance of the exact
        # same (role, role_id). A rejected instance can be re-requested.
        existing = db.query(TelegramUserRole).filter_by(
            telegram_id=tid, role=role, role_id=role_id,
        ).first()
        if existing and existing.status == "approved":
            bot.send_message(tid, _msg(lang, "already_approved"), reply_markup=_dashboard_kb(lang))
            return
        if existing and existing.status == "pending" and not is_admin:
            bot.send_message(tid, _msg(lang, "already_pending"))
            return

        now = datetime.now(timezone.utc)
        if existing:  # rejected (or an admin's stale pending) → (re-)activate
            existing.full_name   = full_name
            existing.status      = new_status
            existing.approved_at = now if is_admin else None
            role_row = existing
        else:
            role_row = TelegramUserRole(
                telegram_id=tid,
                role=role,
                role_id=role_id,
                full_name=full_name,
                status=new_status,
                approved_at=now if is_admin else None,
            )
            db.add(role_row)

        if user:
            user.username  = message.from_user.username or user.username
            user.full_name = full_name   # legacy mirror — latest registration
            user.role      = role
            user.role_id   = role_id
            user.language  = lang
        else:
            user = TelegramUser(
                telegram_id=tid,
                username=message.from_user.username,
                full_name=full_name,
                role=role,
                role_id=role_id,
                language=lang,
                status=new_status,
            )
            db.add(user)
        db.flush()
        pending_role_ref = role_row.id
        db.commit()

    if is_admin:
        bot.send_message(tid, _msg(lang, "admin_role_added"), reply_markup=_dashboard_kb(lang))
        return

    _state.setdefault(tid, {})["pending_role_ref"] = pending_role_ref
    bot.send_message(tid, _msg(lang, "share_contact_prompt"), reply_markup=_contact_kb(lang))


@bot.message_handler(commands=["adminreg"])
def _adminreg(message: types.Message):
    """Admin-profile claiming. Never part of the web registration flow: admins
    pre-create named admin profiles in the panel, and this command offers the
    UNASSIGNED ones as inline buttons (a pending claim keeps the button visible
    for others — first approval wins). One admin profile — one user: existing
    admins are turned away."""
    tid  = message.from_user.id
    lang = _get_lang(tid)
    if tid in _admin_ids():
        bot.send_message(tid, _msg(lang, "adminreg_already"))
        return
    with SessionLocal() as db:
        assigned = {a.profile_id for a in db.query(Admin).all() if a.profile_id}
        free = [
            p for p in db.query(RoleProfile).filter_by(role="admin")
            .order_by(RoleProfile.name).all()
            if p.id not in assigned
        ]
    if not free:
        bot.send_message(tid, _msg(lang, "adminreg_none"))
        return
    kb = types.InlineKeyboardMarkup()
    for p in free:
        kb.add(types.InlineKeyboardButton(p.name, callback_data=f"areg:{p.id}"))
    bot.send_message(tid, _msg(lang, "adminreg_choose"), reply_markup=kb)


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("areg:"))
def _adminreg_pick(call: types.CallbackQuery):
    """A user tapped an admin profile in /adminreg → file a pending
    role='admin' request and ask for their contact; the existing contact
    handler then notifies every admin with approve/reject buttons."""
    tid  = call.from_user.id
    lang = _get_lang(tid)
    try:
        pid = int(call.data.split(":", 1)[1])
    except (ValueError, IndexError):
        bot.answer_callback_query(call.id)
        return
    if tid in _admin_ids():
        bot.answer_callback_query(call.id, _msg(lang, "adminreg_already"), show_alert=True)
        return

    with SessionLocal() as db:
        p = db.query(RoleProfile).filter_by(id=pid, role="admin").first()
        taken = db.query(Admin).filter_by(profile_id=pid).first() if p else None
        if not p or taken:
            bot.answer_callback_query(call.id, _msg(lang, "adminreg_none"), show_alert=True)
            return

        existing = db.query(TelegramUserRole).filter_by(
            telegram_id=tid, role="admin", role_id=pid,
        ).first()
        if existing:  # pending → re-ask contact; rejected → fresh request
            existing.full_name   = p.name
            existing.status      = "pending"
            existing.approved_at = None
            role_row = existing
        else:
            role_row = TelegramUserRole(
                telegram_id=tid, role="admin", role_id=pid,
                full_name=p.name, status="pending",
            )
            db.add(role_row)

        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        if user:
            user.username = call.from_user.username or user.username
        else:
            db.add(TelegramUser(
                telegram_id=tid,
                username=call.from_user.username,
                full_name=p.name,
                role="admin",
                role_id=pid,
                language=lang,
                status="pending",
            ))
        db.flush()
        pending_ref = role_row.id
        db.commit()

    _state.setdefault(tid, {})["pending_role_ref"] = pending_ref
    bot.answer_callback_query(call.id)
    try:
        bot.edit_message_reply_markup(chat_id=tid, message_id=call.message.message_id,
                                      reply_markup=None)
    except Exception:
        pass
    bot.send_message(tid, _msg(lang, "share_contact_prompt"), reply_markup=_contact_kb(lang))


@bot.message_handler(content_types=["contact"])
def _contact(message: types.Message):
    tid = message.from_user.id
    if message.contact.user_id != tid:
        return

    phone = message.contact.phone_number
    if not phone.startswith("+"):
        phone = "+" + phone
    lang  = _get_lang(tid)

    with SessionLocal() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        if not user:
            return
        user.phone = phone
        db.commit()

        # The registration this contact belongs to: the role row created in
        # _webapp_data (in-memory state), falling back to the latest pending
        # role if the process restarted in between.
        role_ref = _state.get(tid, {}).get("pending_role_ref")
        role_row = None
        if role_ref:
            role_row = db.query(TelegramUserRole).filter_by(id=role_ref, telegram_id=tid).first()
        if not role_row:
            role_row = (
                db.query(TelegramUserRole)
                .filter_by(telegram_id=tid, status="pending")
                .order_by(TelegramUserRole.id.desc())
                .first()
            )
        if not role_row:
            return

        # For leaders, resolve the chosen supervisor's unit name so admins see it.
        supervisor = None
        if role_row.role == "leader" and role_row.role_id:
            mgr = db.query(Manager).filter(Manager.id == role_row.role_id).first()
            supervisor = mgr.name if mgr else None

        admin_text = _registration_text(role_row.full_name, role_row.role, phone, tid,
                                        message.from_user.username, supervisor=supervisor)

        bot.send_message(tid, _msg(lang, "waiting_approval"), reply_markup=types.ReplyKeyboardRemove())
        # Resilient admin notification — a failure here must NOT swallow the
        # request. The pending record is already committed above, so even if
        # every send fails the admins can recover it later via /pending.
        # A fresh attempt supersedes notices for this same role request only —
        # notices for the user's other pending roles stay untouched.
        db.query(RegistrationNotice).filter_by(role_ref=role_row.id).delete()
        _notify_admins_of_registration(db, tid, admin_text, role_ref=role_row.id)
    _state.pop(tid, None)


def send_tg_notification(telegram_id: int, title: str, body: str) -> None:
    """Send a plain-text Telegram DM mirroring an in-app notification.
    Silently ignores any Telegram API errors (e.g. user hasn't started the bot)."""
    # Piggyback a menu-button refresh on every notification so the persistent
    # WebApp button picks up label changes without the user re-running /start.
    # _set_menu_button guards its own errors, so this can't block the DM.
    _set_menu_button(telegram_id, _get_lang(telegram_id))
    try:
        bot.send_message(telegram_id, f"🔔 *{title}*\n{body}", parse_mode="Markdown")
    except Exception as e:
        logger.debug("Telegram notification to %s failed: %s", telegram_id, e)


def notify_status_change(telegram_id: int, status: str, lang: str = "uz", role: str | None = None):
    """Notify the registrant of the approval/rejection decision.
    Called by the admin panel — the only place decisions are made now.
    ``role`` names which of the user's role requests was decided (multi-role)."""
    # Ghost Mode (admin header toggle): a decision made while testing must not
    # ping the registrant. Telegram-button decisions carry no request context so
    # this is False there — only the web panel under Ghost Mode suppresses.
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    lang = lang or "uz"
    suffix = f"\n\n💼 {_role(lang, role)}" if role else ""
    try:
        if status == "approved":
            _set_menu_button(telegram_id, lang)
            bot.send_message(telegram_id, _msg(lang, "approved") + suffix, reply_markup=_dashboard_kb(lang))
        elif status == "rejected":
            bot.send_message(telegram_id, _msg(lang, "rejected") + suffix)
    except Exception:
        pass


def notify_admins_of_decision(target_telegram_id: int, status: str, decided_by: str | None = None,
                              role_ref: int | None = None):
    """Edit every admin's registration notification for this role request with
    the outcome and drop its button, then forget the notices. Called by the
    admin panel after a decision. Notices written before the multi-role
    rollout have no role_ref and are matched by user instead."""
    outcome = "✅ Tasdiqlandi" if status == "approved" else "❌ Rad etildi"
    if decided_by:
        outcome += f" — {decided_by}"
    with SessionLocal() as db:
        q = db.query(RegistrationNotice)
        if role_ref:
            q = q.filter(or_(
                RegistrationNotice.role_ref == role_ref,
                and_(RegistrationNotice.role_ref.is_(None),
                     RegistrationNotice.target_telegram_id == target_telegram_id),
            ))
        else:
            q = q.filter_by(target_telegram_id=target_telegram_id)
        notices = q.all()
        for n in notices:
            try:
                bot.edit_message_text(
                    f"{n.text}\n\n{outcome}",
                    chat_id=n.admin_telegram_id,
                    message_id=n.message_id,
                    reply_markup=None,
                )
            except Exception:
                logger.warning("Could not edit notice msg %s for admin %s",
                               n.message_id, n.admin_telegram_id)
            db.delete(n)
        db.commit()


def forget_registration_notices(target_telegram_id: int):
    """Drop tracked notices for a user without editing the messages.
    Called when the user record is deleted from the panel."""
    with SessionLocal() as db:
        db.query(RegistrationNotice).filter_by(target_telegram_id=target_telegram_id).delete()
        db.commit()


def decide_registration(role_ref: int, status: str, decided_by: str | None = None) -> bool:
    """Apply an approve/reject decision to a single role request, then fan out:
    tell the registrant, and edit every admin's notification with the outcome.

    The single source of truth for registration decisions — called by BOTH the
    admin panel (routers/admin.py) and the Telegram approve/reject buttons.
    Returns False if the request is gone or already at this status, so a race
    between two admins (or panel + Telegram) resolves to a no-op for the loser."""
    with SessionLocal() as db:
        role_row = db.query(TelegramUserRole).filter_by(id=role_ref).first()
        if not role_row or role_row.status == status:
            return False
        user = db.query(TelegramUser).filter_by(telegram_id=role_row.telegram_id).first()
        role_row.status = status
        if status == "approved":
            role_row.approved_at = datetime.now(timezone.utc)
        telegram_id  = role_row.telegram_id
        decided_role = role_row.role
        lang = (user.language if user else "uz") or "uz"
        db.commit()

    notify_status_change(telegram_id, status, lang, role=decided_role)
    notify_admins_of_decision(telegram_id, status, decided_by=decided_by, role_ref=role_ref)
    return True


def _caller_name(call: types.CallbackQuery) -> str:
    """Display name for the admin who tapped a button (admins may have no
    TelegramUser row, so derive from the callback's from_user)."""
    u = call.from_user
    name = " ".join(p for p in (u.first_name, u.last_name) if p).strip()
    if not name:
        name = f"@{u.username}" if u.username else "Admin"
    return name


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("ap:"))
def _approval_callback(call: types.CallbackQuery):
    """Inline approve/reject. callback_data: ``ap:<kind>:<a|r>:<ref>`` where kind
    ∈ reg|er|eb|hr. Admins may act on every kind; a non-admin (the receiving
    supervisor of a people-exchange) may act only on a request we explicitly
    sent them a confirm button for. reg/er/eb are never sent to supervisors, so
    the notice check keeps those admin-only."""
    try:
        _, code, act, ref = call.data.split(":", 3)
    except ValueError:
        bot.answer_callback_query(call.id)
        return
    if call.from_user.id not in _admin_ids():
        from app.approvals import recipient_has_notice_for_code
        if not recipient_has_notice_for_code(code, ref, call.from_user.id):
            bot.answer_callback_query(call.id, "⛔️ Ruxsat yo'q", show_alert=True)
            return
    status = "approved" if act == "a" else "rejected"

    if code == "reg":
        try:
            ok = decide_registration(int(ref), status, decided_by=_caller_name(call))
        except Exception:
            logger.exception("registration callback failed: %s", call.data)
            bot.answer_callback_query(call.id, "Xatolik yuz berdi", show_alert=True)
            return
        if ok:
            bot.answer_callback_query(call.id, "✅ Tasdiqlandi" if status == "approved" else "❌ Rad etildi")
        else:
            bot.answer_callback_query(call.id, "Bu so'rov allaqachon ko'rib chiqilgan", show_alert=True)
        return

    # Staff / HR kinds → app.approvals (lazy import to avoid a load-time cycle).
    from app.approvals import handle_approval_callback
    handle_approval_callback(call, code, status, ref)


@bot.message_handler(commands=["pending"])
def _pending(message: types.Message):
    """Admin-only recovery: re-list every pending registration with the admin
    panel button. This is the safety net for any registration whose original
    notification to an admin was lost."""
    tid = message.from_user.id
    if tid not in _admin_ids():
        lang = _get_lang(tid)
        bot.send_message(tid, _msg(lang, "unknown_command"))
        return

    with SessionLocal() as db:
        rows = (
            db.query(TelegramUserRole, TelegramUser)
            .join(TelegramUser, TelegramUser.telegram_id == TelegramUserRole.telegram_id)
            .filter(TelegramUserRole.status == "pending")
            .order_by(TelegramUserRole.id)
            .all()
        )

        if not rows:
            bot.send_message(tid, "✅ Kutilayotgan so'rovlar yo'q.")
            return

        bot.send_message(tid, f"⏳ {len(rows)} ta kutilayotgan so'rov:")
        for role_row, user in rows:
            text = _registration_text(role_row.full_name, role_row.role, user.phone,
                                      user.telegram_id, user.username)
            try:
                sent = bot.send_message(tid, text, reply_markup=_registration_kb(role_row.id))
            except Exception:
                logger.exception("Failed to send /pending row to admin %s", tid)
                continue
            # Track these too, so they also get edited with the outcome.
            db.add(RegistrationNotice(
                target_telegram_id=user.telegram_id,
                role_ref=role_row.id,
                admin_telegram_id=tid,
                message_id=sent.message_id,
                text=text,
            ))
        db.commit()


@bot.message_handler(func=lambda m: True)
def _fallback(message: types.Message):
    lang = _get_lang(message.from_user.id)
    bot.send_message(message.from_user.id, _msg(lang, "unknown_command"))


# ── Webhook setup ─────────────────────────────────────────────────────────────

def setup_webhook():
    if not settings.telegram_bot_token or not settings.backend_url:
        logger.warning("Bot token or backend_url not set — skipping webhook registration")
        return
    if not settings.backend_url.startswith("https://"):
        logger.info("backend_url is not HTTPS (%s) — skipping webhook registration (local dev mode)", settings.backend_url)
        return
    webhook_url = f"{settings.backend_url.rstrip('/')}/bot/webhook"
    try:
        bot.set_webhook(url=webhook_url)
        logger.info("Webhook set to %s", webhook_url)
    except Exception as e:
        logger.warning("Failed to set webhook (Telegram unreachable?): %s", e)

    # Default command menu for every user — Uzbek default plus ru/en variants
    # (Telegram has no uz-Cyrillic language code; the default covers it).
    menus = {
        None: [
            types.BotCommand("start", "Boshlash / dashboard"),
            types.BotCommand("register", "Ro'yxatdan o'tish / yangi rol qo'shish"),
        ],
        "ru": [
            types.BotCommand("start", "Запуск / дашборд"),
            types.BotCommand("register", "Регистрация / добавить роль"),
        ],
        "en": [
            types.BotCommand("start", "Start / dashboard"),
            types.BotCommand("register", "Register / add a role"),
        ],
    }
    for code, cmds in menus.items():
        try:
            bot.set_my_commands(cmds, language_code=code)
        except Exception as e:
            logger.warning("Failed to set default commands (%s): %s", code, e)

    # Admins get their own menu (a chat scope replaces the default entirely).
    for admin_id in _admin_ids():
        try:
            bot.set_my_commands(
                [
                    types.BotCommand("start", "Boshlash / dashboard"),
                    types.BotCommand("pending", "Kutilayotgan ro'yxatdan o'tishlar"),
                ],
                scope=types.BotCommandScopeChat(admin_id),
            )
        except Exception as e:
            logger.warning("Failed to set admin commands for %s: %s", admin_id, e)
