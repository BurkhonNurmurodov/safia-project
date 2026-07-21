"""
Telegram bot — runs inside the FastAPI process via webhook.
Updates arrive at POST /bot/webhook and are dispatched here.
"""
import hashlib
import html
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

import telebot
from telebot import types
from sqlalchemy import and_, or_, text

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Admin, BroadcastDraft, LeaderTaskCapture, LeaderTaskDay, LeaderTaskEntry,
    LeaderTaskMedia, Manager, RegistrationNotice, RoleProfile, TelegramUser,
    TelegramUserRole, Translation,
)
from app.reg_token import make_reg_token
from app.services.leader_tasks import (
    channel_chat_id, compute_completion, effective_date, effective_settings,
    ensure_task_defs, task_name,
)
from app.translit import transliterate as _to_uz_latin

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
        "guest_name_taken":  (
            "❌ Bu ism allaqachon band.\n"
            "Boshqa ism bilan qayta ro'yxatdan o'ting: /start"
        ),
        "bc_prompt":         "📢 Tarqatiladigan xabarni yuboring — matn, media yoki albom bo'lishi mumkin.",
        "bc_warn": (
            "⚠️ Xabarni diqqat bilan tekshiring. Xatolar bo'lsa, davom etishdan "
            "oldin uni tahrirlang (yoki qayta yuboring).\n\n"
            "Tayyor bo'lsa «Davom etish» tugmasini bosing."
        ),
        "bc_album_note":     "📎 {n} ta element yig'ildi",
        "bc_continue_btn":   "Davom etish ›",
        "bc_cancel_btn":     "✕ Bekor qilish",
        "bc_cancelled":      "✕ Xabarnoma bekor qilindi.",
        "bc_choose":         "👥 Endi qabul qiluvchilarni tanlang:",
        "bc_choose_btn":     "👥 Qabul qiluvchilarni tanlash",
        "bc_empty":          "Avval xabar yuboring.",
        "bc_result":         "✅ Xabar yuborildi: {sent}/{total}",
        "bc_result_failed":  "❌ {failed} ta qabul qiluvchiga yetkazilmadi.",
        "bc_rich_unsupported": (
            "⚠️ Kengaytirilgan (jadval/sarlavhali) xabarlarni bot orqali "
            "tarqatib bo'lmaydi. Buning uchun web-paneldagi «Broadcast» "
            "bo'limining «Kengaytirilgan» rejimidan foydalaning.\n\n"
            "Oddiy matn, media yoki albom yuborishingiz mumkin."
        ),
        "file_id_reply":     "📎 <b>{kind}</b>{size}\n<code>{fid}</code>\n\nNusxalash uchun bosing.",
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
        "guest_name_taken":  (
            "❌ Бу исм аллақачон банд.\n"
            "Бошқа исм билан қайта рўйхатдан ўтинг: /start"
        ),
        "bc_prompt":         "📢 Тарқатиладиган хабарни юборинг — матн, медиа ёки альбом бўлиши мумкин.",
        "bc_warn": (
            "⚠️ Хабарни диққат билан текширинг. Хатолар бўлса, давом этишдан "
            "олдин уни таҳрирланг (ёки қайта юборинг).\n\n"
            "Тайёр бўлса «Давом этиш» тугмасини босинг."
        ),
        "bc_album_note":     "📎 {n} та элемент йиғилди",
        "bc_continue_btn":   "Давом этиш ›",
        "bc_cancel_btn":     "✕ Бекор қилиш",
        "bc_cancelled":      "✕ Хабарнома бекор қилинди.",
        "bc_choose":         "👥 Энди қабул қилувчиларни танланг:",
        "bc_choose_btn":     "👥 Қабул қилувчиларни танлаш",
        "bc_empty":          "Аввал хабар юборинг.",
        "bc_result":         "✅ Хабар юборилди: {sent}/{total}",
        "bc_result_failed":  "❌ {failed} та қабул қилувчига етказилмади.",
        "bc_rich_unsupported": (
            "⚠️ Кенгайтирилган (жадвал/сарлавҳали) хабарларни бот орқали "
            "тарқатиб бўлмайди. Бунинг учун веб-панелдаги «Broadcast» "
            "бўлимининг «Кенгайтирилган» режимидан фойдаланинг.\n\n"
            "Оддий матн, медиа ёки альбом юборишингиз мумкин."
        ),
        "file_id_reply":     "📎 <b>{kind}</b>{size}\n<code>{fid}</code>\n\nНусхалаш учун босинг.",
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
        "guest_name_taken":  (
            "❌ Это имя уже занято.\n"
            "Зарегистрируйтесь заново с другим именем: /start"
        ),
        "bc_prompt":         "📢 Отправьте сообщение для рассылки — текст, медиа или альбом.",
        "bc_warn": (
            "⚠️ Внимательно проверьте сообщение. Если есть ошибки, отредактируйте "
            "его (или отправьте заново) перед продолжением.\n\n"
            "Когда всё готово, нажмите «Продолжить»."
        ),
        "bc_album_note":     "📎 Собрано элементов: {n}",
        "bc_continue_btn":   "Продолжить ›",
        "bc_cancel_btn":     "✕ Отменить",
        "bc_cancelled":      "✕ Рассылка отменена.",
        "bc_choose":         "👥 Теперь выберите получателей:",
        "bc_choose_btn":     "👥 Выбрать получателей",
        "bc_empty":          "Сначала отправьте сообщение.",
        "bc_result":         "✅ Сообщение отправлено: {sent}/{total}",
        "bc_result_failed":  "❌ Не доставлено получателям: {failed}.",
        "bc_rich_unsupported": (
            "⚠️ Расширенные сообщения (с таблицами/заголовками) нельзя "
            "рассылать через бота. Для этого используйте режим «Расширенный» "
            "в разделе «Broadcast» веб-панели.\n\n"
            "Вы можете отправить обычный текст, медиа или альбом."
        ),
        "file_id_reply":     "📎 <b>{kind}</b>{size}\n<code>{fid}</code>\n\nНажмите, чтобы скопировать.",
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
        "guest_name_taken":  (
            "❌ This name is already taken.\n"
            "Please register again with a different name: /start"
        ),
        "bc_prompt":         "📢 Send the message to broadcast — text, media, or an album.",
        "bc_warn": (
            "⚠️ Review the message carefully. If there are mistakes, edit it "
            "(or resend) before continuing.\n\n"
            "When it's ready, press «Continue»."
        ),
        "bc_album_note":     "📎 {n} item(s) collected",
        "bc_continue_btn":   "Continue ›",
        "bc_cancel_btn":     "✕ Cancel",
        "bc_cancelled":      "✕ Broadcast cancelled.",
        "bc_choose":         "👥 Now choose the recipients:",
        "bc_choose_btn":     "👥 Choose recipients",
        "bc_empty":          "Send a message first.",
        "bc_result":         "✅ Message sent: {sent}/{total}",
        "bc_result_failed":  "❌ Not delivered to {failed} recipient(s).",
        "bc_rich_unsupported": (
            "⚠️ Rich messages (tables/headings) can't be broadcast via the bot. "
            "Use the web panel's Broadcast → Rich mode for that.\n\n"
            "You can send plain text, media, or an album."
        ),
        "file_id_reply":     "📎 <b>{kind}</b>{size}\n<code>{fid}</code>\n\nTap to copy.",
    },
}

_ROLE_LABELS = {
    "uz":      {"top-manager": "Top-menejer", "shift-manager": "Smena menejeri", "supervisor": "Brigadir", "leader": "Lider", "admin": "Admin", "guest": "Mehmon"},
    "uz_cyrl": {"top-manager": "Топ-менежер", "shift-manager": "Смена менежери", "supervisor": "Бригадир", "leader": "Лидер", "admin": "Админ", "guest": "Меҳмон"},
    "ru":      {"top-manager": "Топ-менеджер", "shift-manager": "Сменный менеджер", "supervisor": "Бригадир", "leader": "Лидер", "admin": "Администратор", "guest": "Гость"},
    "en":      {"top-manager": "Top Manager", "shift-manager": "Shift Manager", "supervisor": "Supervisor", "leader": "Leader", "admin": "Admin", "guest": "Guest"},
}


_MEDIA_LABELS = {
    "uz":      {"photo": "Rasm", "video": "Video", "document": "Hujjat", "audio": "Audio", "voice": "Ovozli xabar", "animation": "GIF", "video_note": "Video-xabar", "sticker": "Stiker"},
    "uz_cyrl": {"photo": "Расм", "video": "Видео", "document": "Ҳужжат", "audio": "Аудио", "voice": "Овозли хабар", "animation": "GIF", "video_note": "Видео-хабар", "sticker": "Стикер"},
    "ru":      {"photo": "Фото", "video": "Видео", "document": "Документ", "audio": "Аудио", "voice": "Голосовое", "animation": "GIF", "video_note": "Видеосообщение", "sticker": "Стикер"},
    "en":      {"photo": "Photo", "video": "Video", "document": "Document", "audio": "Audio", "voice": "Voice message", "animation": "GIF", "video_note": "Video note", "sticker": "Sticker"},
}


def _msg(lang: str, key: str) -> str:
    return _MESSAGES.get(lang, _MESSAGES["uz"]).get(key, _MESSAGES["uz"].get(key, key))


def _media_label(lang: str, kind: str) -> str:
    return _MEDIA_LABELS.get(lang, _MEDIA_LABELS["uz"]).get(kind, kind)


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


def _webapp_register_kb(lang: str, tid: int) -> types.ReplyKeyboardMarkup:
    """
    MUST be a ReplyKeyboardMarkup / KeyboardButton — sendData() only works
    when the WebApp is opened from a keyboard button, not an inline button.
    Keyboard-button launches never receive initData (Telegram platform rule),
    so the URL carries a bot-signed ?rt= token that unlocks the name lists
    at /api/profiles/registration-options.
    """
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add(types.KeyboardButton(
        _msg(lang, "register_btn"),
        web_app=types.WebAppInfo(
            url=f"{settings.webapp_url.rstrip('/')}/login?rt={make_reg_token(tid)}"
        ),
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

def _tg_account_name(u) -> str | None:
    """The Telegram account's own name (first+last) — distinct from the claimed
    profile name that full_name mirrors. Stored as telegram_users.tg_name."""
    return " ".join(p for p in (u.first_name, u.last_name) if p).strip() or None


def _admin_ids() -> set[int]:
    with SessionLocal() as db:
        return {a.telegram_id for a in db.query(Admin).all()}


def admin_profile_name(telegram_id: int) -> str | None:
    """Canonical name of an admin's claimed profile (admins.profile_id →
    role_profiles) — what the app shows instead of the Telegram account name."""
    with SessionLocal() as db:
        row = db.query(Admin).filter_by(telegram_id=telegram_id).first()
        if not row or not row.profile_id:
            return None
        p = db.query(RoleProfile).filter_by(id=row.profile_id, role="admin").first()
        return p.name if p else None


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
            bot.send_message(tid, _msg(lang, "add_role_hint"), reply_markup=_webapp_register_kb(lang, tid))
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
    bot.send_message(tid, _msg(lang, "welcome_new"), reply_markup=_webapp_register_kb(lang, tid))


@bot.message_handler(content_types=["web_app_data"])
def _webapp_data(message: types.Message):
    tid = message.from_user.id
    try:
        data       = json.loads(message.web_app_data.data)
        full_name  = str(data.get("full_name", "")).strip()
        role       = str(data.get("role", ""))
        supervisor = str(data.get("supervisor", "")).strip()  # leader → chosen brigadir/unit
        guest_pid  = data.get("guest_profile_id")             # guest → re-claimed profile
        guest_ovr  = data.get("guest_overrides") or {}        # guest → lang → typed/derived name
    except Exception:
        return

    if not full_name or role not in ("top-manager", "shift-manager", "supervisor", "leader", "guest"):
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
        elif role == "guest":
            # Guests are the one self-created identity: the profile row is made
            # here at registration (typed name) or re-claimed from the picker
            # (guest_profile_id). Strictly one guest profile per Telegram user.
            other = (
                db.query(TelegramUserRole)
                .filter(TelegramUserRole.telegram_id == tid,
                        TelegramUserRole.role == "guest",
                        TelegramUserRole.status.in_(("pending", "approved")))
                .first()
            )
            if other and not is_admin:
                if other.status == "approved":
                    bot.send_message(tid, _msg(lang, "already_approved"),
                                     reply_markup=_dashboard_kb(lang))
                else:
                    bot.send_message(tid, _msg(lang, "already_pending"))
                return

            def _held_by_other(profile_id: int):
                return (
                    db.query(TelegramUserRole)
                    .filter(TelegramUserRole.role == "guest",
                            TelegramUserRole.role_id == profile_id,
                            TelegramUserRole.status == "approved",
                            TelegramUserRole.telegram_id != tid)
                    .first()
                )

            if guest_pid:
                try:
                    p = db.query(RoleProfile).filter_by(id=int(guest_pid), role="guest").first()
                except (TypeError, ValueError):
                    p = None
                if not p:
                    return
                # The picker only offers unassigned profiles, but the profile
                # may have been approved for someone else in the meantime —
                # pending claims race and the first approval wins
                # (see decide_registration).
                if _held_by_other(p.id):
                    bot.send_message(tid, _msg(lang, "guest_name_taken"))
                    return
            else:
                # Canonical name is Uzbek Latin — a name typed in ru/uz_cyrl
                # arrives Cyrillic and is alphabet-switched here. The webapp
                # validates script and word count before sendData; anything
                # that fails here is a stale/forged payload and is dropped.
                canonical = " ".join(_to_uz_latin(full_name, "uz").split())
                if len(canonical.split()) < 2:
                    return
                # Guest names are NOT unique — two real people may share one.
                # A typed name only re-uses a profile the caller already has a
                # claim on (retry after rejection); anything else gets a fresh
                # profile row. Deliberate re-claims go through the picker.
                p = None
                for r in db.query(TelegramUserRole).filter_by(
                        telegram_id=tid, role="guest").all():
                    rp = db.query(RoleProfile).filter_by(id=r.role_id, role="guest").first()
                    if rp and rp.name == canonical and not _held_by_other(rp.id):
                        p = rp
                        break
                if not p:
                    p = RoleProfile(role="guest", name=canonical)
                    db.add(p)
                    db.flush()
                    # Silent per-language variants: the exact typed form for the
                    # typed language + alphabet-switched forms for the rest.
                    # Overrides are keyed by the raw name, so same-named guests
                    # share them — never overwrite an existing row.
                    for ov_lang, ov_val in guest_ovr.items():
                        ov_val = str(ov_val or "").strip()
                        if ov_lang not in ("uz_cyrl", "ru", "en") or not ov_val:
                            continue
                        if not db.query(Translation).filter_by(
                                lang=ov_lang, key=f"name.{canonical}").first():
                            db.add(Translation(lang=ov_lang, key=f"name.{canonical}",
                                               value=ov_val))
            role_id = p.id
            full_name = p.name
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
            user.tg_name   = _tg_account_name(message.from_user) or user.tg_name
            user.role      = role
            user.role_id   = role_id
            user.language  = lang
        else:
            user = TelegramUser(
                telegram_id=tid,
                username=message.from_user.username,
                full_name=full_name,
                tg_name=_tg_account_name(message.from_user),
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
            user.tg_name = _tg_account_name(call.from_user) or user.tg_name
        else:
            db.add(TelegramUser(
                telegram_id=tid,
                username=call.from_user.username,
                full_name=p.name,
                tg_name=_tg_account_name(call.from_user),
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


def send_tg_notification(telegram_id: int, title: str, body: str, html: str | None = None) -> bool:
    """Send a Telegram DM mirroring an in-app notification. When ``html`` is given
    it is sent verbatim in HTML parse mode (self-contained message, e.g. bold
    labels + <blockquote>); otherwise falls back to the default Markdown layout.
    Returns True if Telegram accepted the message, False if the send failed (e.g.
    the user never started the bot, or blocked it). Failures are logged at
    WARNING — an in-app bell with no matching DM is otherwise invisible to debug."""
    # Piggyback a menu-button refresh on every notification so the persistent
    # WebApp button picks up label changes without the user re-running /start.
    # _set_menu_button guards its own errors, so this can't block the DM.
    _set_menu_button(telegram_id, _get_lang(telegram_id))
    try:
        if html is not None:
            bot.send_message(telegram_id, html, parse_mode="HTML")
        else:
            bot.send_message(telegram_id, f"🔔 *{title}*\n{body}", parse_mode="Markdown")
        return True
    except Exception as e:
        logger.warning("Telegram notification to %s failed: %s", telegram_id, e)
        return False


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
    between two admins (or panel + Telegram) resolves to a no-op for the loser.

    Admin-profile requests (/adminreg) add a layer: approval inserts the
    admins-table row (that table is what grants rights — admins.profile_id is
    the binding), the profile races on first-approval-wins, and the losers'
    pending requests are auto-rejected. The winning role row is deleted
    outright so a stale role='admin' row can never mint an admin JWT after a
    later unassign.

    Guest profiles race the same way: one guest profile — one user, so
    approving a claim auto-rejects every other pending claim on that profile."""
    losers: list[tuple[int, int | None, str, str]] = []  # (role_ref, telegram_id|None→no DM, lang, role)
    with SessionLocal() as db:
        role_row = db.query(TelegramUserRole).filter_by(id=role_ref).first()
        if not role_row or role_row.status == status:
            return False
        user = db.query(TelegramUser).filter_by(telegram_id=role_row.telegram_id).first()
        telegram_id  = role_row.telegram_id
        decided_role = role_row.role
        decided_role_id = role_row.role_id
        lang = (user.language if user else "uz") or "uz"

        if decided_role == "admin" and status == "approved":
            profile_taken = db.query(Admin).filter_by(profile_id=role_row.role_id).first()
            already_admin = db.query(Admin).filter_by(telegram_id=telegram_id).first()
            if profile_taken or already_admin:
                status = "rejected"   # lost the race (or became admin meanwhile)
                role_row.status = status
            else:
                db.add(Admin(telegram_id=telegram_id, profile_id=role_row.role_id,
                             language=lang))
                pending_admin = (
                    db.query(TelegramUserRole)
                    .filter(TelegramUserRole.role == "admin",
                            TelegramUserRole.status == "pending",
                            TelegramUserRole.id != role_row.id)
                    .all()
                )
                for l in pending_admin:
                    if l.role_id == role_row.role_id:      # same profile → lost the race
                        l.status = "rejected"
                        lu = db.query(TelegramUser).filter_by(telegram_id=l.telegram_id).first()
                        losers.append((l.id, l.telegram_id, (lu.language if lu else "uz") or "uz", "admin"))
                    elif l.telegram_id == telegram_id:      # winner's other claims → withdrawn
                        l.status = "rejected"
                        losers.append((l.id, None, lang, "admin"))  # no DM — they just got approved
                db.delete(role_row)
        elif decided_role == "guest" and status == "approved":
            role_row.status = status
            role_row.approved_at = datetime.now(timezone.utc)
            # One guest profile — one user: the first approval takes the
            # profile, every other pending claim on it is auto-rejected.
            for l in (
                db.query(TelegramUserRole)
                .filter(TelegramUserRole.role == "guest",
                        TelegramUserRole.role_id == role_row.role_id,
                        TelegramUserRole.status == "pending",
                        TelegramUserRole.id != role_row.id)
                .all()
            ):
                l.status = "rejected"
                lu = db.query(TelegramUser).filter_by(telegram_id=l.telegram_id).first()
                losers.append((l.id, l.telegram_id, (lu.language if lu else "uz") or "uz", "guest"))
        else:
            role_row.status = status
            if status == "approved":
                role_row.approved_at = datetime.now(timezone.utc)
        db.commit()

        # A newly approved brigadir may have call-to-shift bell rows that were
        # queued to their unit's supervisor profile while it was unclaimed — those
        # never got a Telegram DM. Deliver them now (best-effort, never blocks the
        # approval). Same session, already past the status commit above.
        if status == "approved" and decided_role == "supervisor" and decided_role_id:
            try:
                from app.routers.staff import flush_queued_supervisor_dms
                flush_queued_supervisor_dms(db, telegram_id, decided_role_id)
            except Exception:
                logger.warning("Queued supervisor-DM flush failed for %s", telegram_id, exc_info=True)

    notify_status_change(telegram_id, status, lang, role=decided_role)
    notify_admins_of_decision(telegram_id, status, decided_by=decided_by, role_ref=role_ref)
    for loser_ref, loser_tid, loser_lang, loser_role in losers:
        if loser_tid:
            notify_status_change(loser_tid, "rejected", loser_lang, role=loser_role)
        notify_admins_of_decision(loser_tid or telegram_id, "rejected",
                                  decided_by=decided_by, role_ref=loser_ref)
    return True


def _caller_name(call: types.CallbackQuery) -> str:
    """Display name for the admin who tapped a button — their claimed profile
    name; the Telegram account name only covers unbound legacy admins."""
    u = call.from_user
    name = admin_profile_name(u.id) \
        or " ".join(p for p in (u.first_name, u.last_name) if p).strip()
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


# ── /broadcast: admin free-form broadcast (copy-to-recipients) ────────────────
# The admin sends any message (text / media / album); we remember its message
# id(s) and, after a review step, copy them to the recipients they pick in a
# mini-app. State lives in the broadcast_drafts table, one row per admin.

_BC_CONTENT = ["text", "photo", "video", "document", "audio", "voice",
               "animation", "video_note"]


def notify_broadcast_result(admin_tid: int, message_id: int, sent: int, total: int, failed: int):
    """Edit the /broadcast picker message into a final 'sent X/Y' summary —
    called from routers/broadcast.py once a draft send finishes."""
    lang = _get_lang(admin_tid)
    txt = _msg(lang, "bc_result").format(sent=sent, total=total)
    if failed:
        txt += "\n" + _msg(lang, "bc_result_failed").format(failed=failed)
    try:
        bot.edit_message_text(txt, chat_id=admin_tid, message_id=message_id)
    except Exception:
        try:
            bot.send_message(admin_tid, txt)
        except Exception:
            pass


# How long a /broadcast stays in compose mode. Past this the draft is dead: an
# abandoned compose (the admin ran /broadcast and never tapped «Davom etish»)
# used to capture EVERY attachment they sent afterwards, forever — so a photo
# meant for the file_id echo landed in the draft instead.
_BC_COMPOSE_TTL = timedelta(minutes=30)


def _bc_active(tid: int) -> bool:
    """True while the admin is mid-compose (before they pick recipients) — the
    filter that routes their next message into the draft-capture handler.
    A compose older than _BC_COMPOSE_TTL is dropped rather than honoured; only
    the pre-picker statuses expire, so a draft already showing the recipient
    picker (awaiting_recipients) is untouched and stays sendable."""
    with SessionLocal() as db:
        d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
        if not d or d.status not in ("awaiting_message", "awaiting_continue"):
            return False
        stamp = d.updated_at or d.created_at
        if stamp is not None:
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - stamp >= _BC_COMPOSE_TTL:
                # Clear it so the stale «Davom etish» button can't resurrect it.
                db.delete(d)
                db.commit()
                return False
        return True


def handle_incoming_rich_message(msg: dict) -> bool:
    """Called from the webhook (raw update) when a message carries a
    ``rich_message`` field (Bot API 10.1+). The pinned telebot can't parse that
    field, so such a message gets content_type=None and matches no handler —
    it would be silently dropped. We can't re-broadcast a rich message anyway
    (copyMessage doesn't carry the rich layer, and a received RichMessage has
    no html/markdown to re-send), so if the sender is an admin mid-/broadcast
    we reply that rich isn't supported here and point them at the web tab.

    Returns True when it has fully handled the update (the webhook then skips
    normal dispatch); False to let telebot process it as usual."""
    try:
        tid = int((msg.get("from") or {}).get("id") or 0)
        chat_id = int((msg.get("chat") or {}).get("id") or 0)
    except (TypeError, ValueError):
        return False
    if not tid or not chat_id:
        return False
    # Log the raw shape once so we can confirm on prod what a rich update
    # actually contains (e.g. whether it ships a plain-text fallback).
    logger.info("Rich message received (tid=%s): fields=%s", tid, sorted(msg.keys()))
    if not _bc_active(tid):
        return False  # not composing a broadcast — leave it to normal dispatch
    lang = _get_lang(tid)
    try:
        bot.send_message(chat_id, _msg(lang, "bc_rich_unsupported"))
    except Exception:
        logger.warning("Failed to send rich-unsupported notice to %s", tid, exc_info=True)
    return True


@bot.message_handler(commands=["broadcast"])
def _broadcast_start(message: types.Message):
    tid = message.from_user.id
    lang = _get_lang(tid)
    if tid not in _admin_ids():
        bot.send_message(tid, _msg(lang, "unknown_command"))
        return
    # One active draft per admin — a fresh /broadcast replaces any old one.
    with SessionLocal() as db:
        db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).delete()
        db.add(BroadcastDraft(
            admin_telegram_id=tid,
            token=secrets.token_urlsafe(18),
            from_chat_id=message.chat.id,
            message_ids=[],
            status="awaiting_message",
        ))
        db.commit()
    bot.send_message(tid, _msg(lang, "bc_prompt"))


def _bc_warn_text(lang: str, count: int) -> str:
    txt = _msg(lang, "bc_warn")
    if count > 1:
        txt += "\n\n" + _msg(lang, "bc_album_note").format(n=count)
    return txt


def _bc_count(tid: int) -> int:
    with SessionLocal() as db:
        d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
        return len(d.message_ids or []) if d else 0


@bot.message_handler(func=lambda m: _bc_active(m.from_user.id), content_types=_BC_CONTENT)
def _broadcast_capture(message: types.Message):
    """Capture the message(s) to broadcast. Items sharing a media_group_id are
    collected into one album; any other message replaces the draft (latest
    wins). There is exactly ONE review warning per draft — telebot dispatches
    each album item to a worker thread, so the right to POST the warning is
    claimed atomically (NULL→0, row-locked, one winner across threads AND
    processes); every other item just edits it with the new collected count."""
    tid = message.from_user.id
    lang = _get_lang(tid)
    mgid = message.media_group_id

    with SessionLocal() as db:
        d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
        if not d:
            return
        if mgid and d.media_group_id == mgid and d.message_ids:
            d.message_ids = list(d.message_ids) + [message.message_id]  # same album → append
        else:
            d.message_ids = [message.message_id]                        # new message/album → replace
            d.media_group_id = mgid
        d.from_chat_id = message.chat.id
        cap = (message.text or message.caption or "").strip()
        if cap:
            d.preview_text = cap[:200]
        d.status = "awaiting_continue"
        db.commit()

    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(_msg(lang, "bc_continue_btn"), callback_data="bc:cont"))
    kb.add(types.InlineKeyboardButton(_msg(lang, "bc_cancel_btn"), callback_data="bc:cancel"))

    # Claim the warning: only the transaction that flips warn_message_id from
    # NULL to the 0 sentinel wins the right to send it.
    with SessionLocal() as db:
        claimed = db.query(BroadcastDraft).filter(
            BroadcastDraft.admin_telegram_id == tid,
            BroadcastDraft.warn_message_id.is_(None),
        ).update({BroadcastDraft.warn_message_id: 0}, synchronize_session=False) == 1
        db.commit()

    if claimed:
        try:
            sent = bot.send_message(tid, _bc_warn_text(lang, _bc_count(tid)), reply_markup=kb)
        except Exception:
            # Roll the claim back so a later item can retry the send.
            with SessionLocal() as db:
                db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).update(
                    {BroadcastDraft.warn_message_id: None}, synchronize_session=False)
                db.commit()
            return
        with SessionLocal() as db:
            db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).update(
                {BroadcastDraft.warn_message_id: sent.message_id}, synchronize_session=False)
            db.commit()
    else:
        with SessionLocal() as db:
            d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
            wid = d.warn_message_id if d else None
        if wid and wid > 0:  # a real message exists (0 = another item is still sending it)
            try:
                bot.edit_message_text(_bc_warn_text(lang, _bc_count(tid)), chat_id=tid,
                                      message_id=wid, reply_markup=kb)
            except Exception:
                pass  # unchanged text / pending winner — harmless


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("bc:"))
def _broadcast_callback(call: types.CallbackQuery):
    """'Continue' → swap the warning for the recipient-picker mini-app button;
    'Cancel' → drop the draft, so the bot stops capturing the admin's messages
    into it (otherwise they wait out _BC_COMPOSE_TTL)."""
    tid = call.from_user.id
    lang = _get_lang(tid)
    if call.data == "bc:cancel":
        with SessionLocal() as db:
            db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).delete()
            db.commit()
        try:
            bot.edit_message_text(_msg(lang, "bc_cancelled"), chat_id=call.message.chat.id,
                                  message_id=call.message.message_id)
        except Exception:
            bot.send_message(tid, _msg(lang, "bc_cancelled"))
        bot.answer_callback_query(call.id)
        return
    if call.data != "bc:cont":
        bot.answer_callback_query(call.id)
        return
    with SessionLocal() as db:
        d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
        if not d or not d.message_ids:
            bot.answer_callback_query(call.id, _msg(lang, "bc_empty"), show_alert=True)
            return
        d.status = "awaiting_recipients"
        d.warn_message_id = call.message.message_id
        token = d.token
        db.commit()

    url = f"{settings.webapp_url.rstrip('/')}/broadcast-receivers?d={token}"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        _msg(lang, "bc_choose_btn"),
        web_app=types.WebAppInfo(url=url),
    ))
    try:
        bot.edit_message_text(_msg(lang, "bc_choose"), chat_id=call.message.chat.id,
                              message_id=call.message.message_id, reply_markup=kb)
    except Exception:
        sent = bot.send_message(tid, _msg(lang, "bc_choose"), reply_markup=kb)
        with SessionLocal() as db:
            d = db.query(BroadcastDraft).filter_by(admin_telegram_id=tid).first()
            if d:
                d.warn_message_id = sent.message_id
                db.commit()
    bot.answer_callback_query(call.id)


# ── Leader daily checklist (/tasks) ───────────────────────────────────────────
# In-bot replacement of the Google-Form collection layer of /leaders: a leader
# marks each enabled task done (with proof photos, relayed as BYTES to the
# archive channel) or not done (with a reason), then locks the day with «KUNNI
# YOPISH». Only closed days surface on the admin-only /leaders-bot page.
# Capture state (mid-answer photos/reason) lives in the leader_task_captures
# table — NOT process memory: Passenger dispatches consecutive updates to
# different worker processes, exactly like the broadcast_drafts flow.

_LT_MESSAGES = {
    "uz": {
        "not_leader": "Siz lider emassiz.",
        "pick_profile": "Qaysi profil bilan davom etasiz?",
        "menu_title": "📋 {name}\n📅 {date}\n\nVazifani tanlang:",
        "menu_closed": "📋 {name}\n📅 {date}\n\n🔒 Kun yopilgan. Natija: {score}%",
        "btn_back": "⬅️ Orqaga",
        "btn_close_day": "⚠️ KUNNI YOPISH ⚠️",
        "farewell": "Vazifalaringizni istalgan vaqtda /tasks buyrug'i orqali bajarishingiz mumkin.",
        "did_you": "Siz bu vazifani bajardingizmi?\n\n📌 {task}",
        "btn_yes": "Ha ✅",
        "btn_no": "Yo'q ❌",
        "photos_counter": "📌 {task}\n\nIsbot uchun kamida {min} ta rasm yuboring.\n\n📸 {k}/{min} rasm qabul qilindi.",
        "btn_save": "💾 Saqlash",
        "btn_discard": "🔄 Bekor qilish",
        "reason_prompt": "📌 {task}\n\n✍️ Nega bajarilmadi? Sababini yozib yuboring.",
        "reason_confirm": "📌 {task}\n\n📝 Sabab: {reason}\n\nSaqlaysizmi?",
        "reset_confirm": "Bu vazifaning oldingi ma'lumotlari o'chirilib, qaytadan topshirishingizni tasdiqlaysizmi?\n\n📌 {task}",
        "btn_reset": "🔄 Qayta topshirish",
        "close_confirm": "Kunni yopishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi va vazifalarni boshqa tahrirlay olmaysiz!",
        "btn_confirm": "✅ Tasdiqlash",
        "closed_done": "🔒 Kun yopildi! Natija: {score}%",
        "incomplete": "Avval barcha vazifalarni belgilang! Qolgan: {n}",
        "day_closed_alert": "Bu kun yopilgan — tahrirlash mumkin emas.",
        "photos_only": "Faqat rasm yuboring 📸",
        "relay_fail": "❌ Rasm qabul qilinmadi (arxiv kanaliga yuborib bo'lmadi). Keyinroq qayta urinib ko'ring yoki administratorga xabar bering.",
        "expired": "Sessiya eskirgan. /tasks buyrug'ini qaytadan yuboring.",
        "saved_toast": "✅ Saqlandi",
    },
    "uz_cyrl": {
        "not_leader": "Сиз лидер эмассиз.",
        "pick_profile": "Қайси профил билан давом этасиз?",
        "menu_title": "📋 {name}\n📅 {date}\n\nВазифани танланг:",
        "menu_closed": "📋 {name}\n📅 {date}\n\n🔒 Кун ёпилган. Натижа: {score}%",
        "btn_back": "⬅️ Орқага",
        "btn_close_day": "⚠️ КУННИ ЁПИШ ⚠️",
        "farewell": "Вазифаларингизни исталган вақтда /tasks буйруғи орқали бажаришингиз мумкин.",
        "did_you": "Сиз бу вазифани бажардингизми?\n\n📌 {task}",
        "btn_yes": "Ҳа ✅",
        "btn_no": "Йўқ ❌",
        "photos_counter": "📌 {task}\n\nИсбот учун камида {min} та расм юборинг.\n\n📸 {k}/{min} расм қабул қилинди.",
        "btn_save": "💾 Сақлаш",
        "btn_discard": "🔄 Бекор қилиш",
        "reason_prompt": "📌 {task}\n\n✍️ Нега бажарилмади? Сабабини ёзиб юборинг.",
        "reason_confirm": "📌 {task}\n\n📝 Сабаб: {reason}\n\nСақлайсизми?",
        "reset_confirm": "Бу вазифанинг олдинги маълумотлари ўчирилиб, қайтадан топширишингизни тасдиқлайсизми?\n\n📌 {task}",
        "btn_reset": "🔄 Қайта топшириш",
        "close_confirm": "Кунни ёпишни тасдиқлайсизми? Бу амални ортга қайтариб бўлмайди ва вазифаларни бошқа таҳрирлай олмайсиз!",
        "btn_confirm": "✅ Тасдиқлаш",
        "closed_done": "🔒 Кун ёпилди! Натижа: {score}%",
        "incomplete": "Аввал барча вазифаларни белгиланг! Қолган: {n}",
        "day_closed_alert": "Бу кун ёпилган — таҳрирлаш мумкин эмас.",
        "photos_only": "Фақат расм юборинг 📸",
        "relay_fail": "❌ Расм қабул қилинмади (архив каналига юбориб бўлмади). Кейинроқ қайта уриниб кўринг ёки администраторга хабар беринг.",
        "expired": "Сессия эскирган. /tasks буйруғини қайтадан юборинг.",
        "saved_toast": "✅ Сақланди",
    },
    "ru": {
        "not_leader": "Вы не лидер.",
        "pick_profile": "С каким профилем продолжить?",
        "menu_title": "📋 {name}\n📅 {date}\n\nВыберите задачу:",
        "menu_closed": "📋 {name}\n📅 {date}\n\n🔒 День закрыт. Результат: {score}%",
        "btn_back": "⬅️ Назад",
        "btn_close_day": "⚠️ ЗАКРЫТЬ ДЕНЬ ⚠️",
        "farewell": "Вы можете выполнять свои задачи в любое время командой /tasks.",
        "did_you": "Вы выполнили эту задачу?\n\n📌 {task}",
        "btn_yes": "Да ✅",
        "btn_no": "Нет ❌",
        "photos_counter": "📌 {task}\n\nОтправьте минимум {min} фото как подтверждение.\n\n📸 Принято {k}/{min} фото.",
        "btn_save": "💾 Сохранить",
        "btn_discard": "🔄 Сбросить",
        "reason_prompt": "📌 {task}\n\n✍️ Почему не выполнено? Напишите причину.",
        "reason_confirm": "📌 {task}\n\n📝 Причина: {reason}\n\nСохранить?",
        "reset_confirm": "Подтверждаете сброс прежних данных этой задачи для повторной сдачи?\n\n📌 {task}",
        "btn_reset": "🔄 Пересдать",
        "close_confirm": "Подтверждаете закрытие дня? Это действие нельзя отменить, и вы больше не сможете редактировать задачи!",
        "btn_confirm": "✅ Подтвердить",
        "closed_done": "🔒 День закрыт! Результат: {score}%",
        "incomplete": "Сначала отметьте все задачи! Осталось: {n}",
        "day_closed_alert": "Этот день закрыт — редактирование невозможно.",
        "photos_only": "Отправьте именно фото 📸",
        "relay_fail": "❌ Фото не принято (не удалось отправить в архивный канал). Попробуйте позже или сообщите администратору.",
        "expired": "Сессия устарела. Отправьте команду /tasks заново.",
        "saved_toast": "✅ Сохранено",
    },
    "en": {
        "not_leader": "You're not a leader.",
        "pick_profile": "Which profile do you want to continue with?",
        "menu_title": "📋 {name}\n📅 {date}\n\nPick a task:",
        "menu_closed": "📋 {name}\n📅 {date}\n\n🔒 Day closed. Score: {score}%",
        "btn_back": "⬅️ Back",
        "btn_close_day": "⚠️ CLOSE THE DAY ⚠️",
        "farewell": "You can complete your tasks anytime by sending the /tasks command.",
        "did_you": "Did you complete this task?\n\n📌 {task}",
        "btn_yes": "Yes ✅",
        "btn_no": "No ❌",
        "photos_counter": "📌 {task}\n\nSend at least {min} photo(s) as proof.\n\n📸 {k}/{min} photos received.",
        "btn_save": "💾 Save",
        "btn_discard": "🔄 Reset",
        "reason_prompt": "📌 {task}\n\n✍️ Why wasn't it done? Send the reason.",
        "reason_confirm": "📌 {task}\n\n📝 Reason: {reason}\n\nSave it?",
        "reset_confirm": "Do you confirm resetting this task's previous data so you can re-submit it?\n\n📌 {task}",
        "btn_reset": "🔄 Re-submit",
        "close_confirm": "Do you confirm closing this day? This can't be undone and you won't be able to edit your tasks anymore!",
        "btn_confirm": "✅ Confirm",
        "closed_done": "🔒 Day closed! Score: {score}%",
        "incomplete": "Mark all tasks first! Remaining: {n}",
        "day_closed_alert": "This day is closed — editing is not possible.",
        "photos_only": "Photos only, please 📸",
        "relay_fail": "❌ Photo not accepted (couldn't relay it to the archive channel). Try again later or tell an administrator.",
        "expired": "Session expired. Send /tasks again.",
        "saved_toast": "✅ Saved",
    },
}


def _lt(lang: str, key: str) -> str:
    return _LT_MESSAGES.get(lang, _LT_MESSAGES["uz"]).get(key, _LT_MESSAGES["uz"].get(key, key))


_LT_CAPTURE_TTL = timedelta(minutes=30)


def _lt_capture(db, tid: int, lock: bool = False) -> LeaderTaskCapture | None:
    """The account's in-flight capture row, or None. Stale rows (abandoned
    flows) are deleted on touch. lock=True takes FOR UPDATE so concurrent
    album photos landing on different workers serialize their appends."""
    q = db.query(LeaderTaskCapture).filter_by(telegram_id=tid)
    if lock:
        q = q.with_for_update()
    cap = q.first()
    if not cap:
        return None
    ts = cap.updated_at
    if ts is not None and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    if ts is not None and datetime.now(timezone.utc) - ts > _LT_CAPTURE_TTL:
        db.delete(cap)
        db.commit()
        return None
    return cap


def _lt_stage(tid: int) -> str | None:
    """Handler-filter probe — its own short session, like _bc_active."""
    with SessionLocal() as db:
        cap = _lt_capture(db, tid)
        return cap.stage if cap else None


def _lt_clear(tid: int):
    with SessionLocal() as db:
        db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
        db.commit()


def _lt_leader_profiles(db, tid: int) -> list[RoleProfile]:
    """Leader RoleProfiles this account holds (approved role rows bind to a
    profile via (manager_id, name) — the same mapping staff.py uses)."""
    rows = (
        db.query(TelegramUserRole)
        .filter_by(telegram_id=tid, role="leader", status="approved")
        .all()
    )
    out, seen = [], set()
    for r in rows:
        p = (
            db.query(RoleProfile)
            .filter_by(role="leader", manager_id=r.role_id, name=r.full_name)
            .first()
        )
        if p and p.id not in seen:
            seen.add(p.id)
            out.append(p)
    return out


def _lt_btn(text: str, data: str) -> types.InlineKeyboardButton:
    return types.InlineKeyboardButton(text[:60], callback_data=data)


def _lt_profile_kb(db, profs: list[RoleProfile]) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup(row_width=1)
    for p in profs:
        mgr = db.query(Manager).filter_by(id=p.manager_id).first()
        label = f"{p.name} · {mgr.name}" if mgr else p.name
        kb.add(_lt_btn(label, f"lt:prof:{p.id}"))
    return kb


def _lt_day(db, pid: int, date: str) -> LeaderTaskDay | None:
    return db.query(LeaderTaskDay).filter_by(leader_id=pid, date=date).first()


def _lt_entries(db, day: LeaderTaskDay | None) -> dict[int, LeaderTaskEntry]:
    if not day:
        return {}
    return {e.task_id: e for e in db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}


def _lt_menu(db, tid: int, pid: int, lang: str, chat_id: int, msg_id: int | None):
    """Render the task list (or the closed-day view) — edit msg_id in place
    when given, else send a fresh message."""
    prof = db.query(RoleProfile).filter_by(id=pid).first()
    if not prof:
        bot.send_message(chat_id, _lt(lang, "expired"))
        return
    date = effective_date()
    day = _lt_day(db, pid, date)
    entries = _lt_entries(db, day)
    cfg = effective_settings(db, prof.manager_id)
    defs = {td.id: td for td in ensure_task_defs(db)}

    kb = types.InlineKeyboardMarkup(row_width=1)
    if day and day.closed_at:
        text = _lt(lang, "menu_closed").format(
            name=prof.name, date=date,
            score=round(float(day.completion or 0)),
        )
        for td_id, s in cfg.items():
            if not s["enabled"]:
                continue
            e = entries.get(td_id)
            mark = "✅ " if (e and e.done) else ("❌ " if e else "")
            kb.add(_lt_btn(f"{mark}{task_name(defs[td_id], lang)}", f"lt:noop:{pid}"))
        kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:back:{pid}"))
    else:
        text = _lt(lang, "menu_title").format(name=prof.name, date=date)
        for td_id, s in cfg.items():
            if not s["enabled"]:
                continue
            e = entries.get(td_id)
            mark = "✅ " if (e and e.done) else ("❌ " if e else "")
            kb.add(_lt_btn(f"{mark}{task_name(defs[td_id], lang)}", f"lt:task:{pid}:{td_id}"))
        kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:back:{pid}"))
        kb.add(_lt_btn(_lt(lang, "btn_close_day"), f"lt:close:{pid}"))

    if msg_id:
        try:
            bot.edit_message_text(text, chat_id=chat_id, message_id=msg_id, reply_markup=kb)
            return
        except Exception:
            pass
    bot.send_message(chat_id, text, reply_markup=kb)


def _lt_relay_photo(db, message: types.Message) -> tuple[str, int] | None:
    """Bytes round-trip: download the photo into RAM, upload it to the archive
    channel, return the CHANNEL copy's (file_id, message_id). None = relay
    unavailable/failed — per spec the upload is then rejected."""
    chan = channel_chat_id(db)
    if not chan:
        return None
    try:
        best = max(message.photo, key=lambda p: p.file_size or 0)
        tf = bot.get_file(best.file_id)
        data = bot.download_file(tf.file_path)  # kept in memory, never on disk
        sent = bot.send_photo(chan, data)
        fid = max(sent.photo, key=lambda p: p.file_size or 0).file_id
        return fid, sent.message_id
    except Exception:
        logger.warning("Leader-task photo relay failed", exc_info=True)
        return None


def _lt_save_entry(db, pid: int, task_id: int, done: bool,
                   reason: str | None, media: list[tuple[str, int]]) -> bool:
    """Persist one task's answer. False when the day is already closed."""
    prof = db.query(RoleProfile).filter_by(id=pid).first()
    if not prof:
        return False
    date = effective_date()
    day = _lt_day(db, pid, date)
    if day and day.closed_at:
        return False
    if not day:
        day = LeaderTaskDay(leader_id=pid, manager_id=prof.manager_id, date=date)
        db.add(day)
        db.flush()
    old = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=task_id).first()
    if old:
        db.query(LeaderTaskMedia).filter_by(entry_id=old.id).delete()
        db.delete(old)
        db.flush()
    entry = LeaderTaskEntry(day_id=day.id, task_id=task_id, done=done, reason=reason)
    db.add(entry)
    db.flush()
    for i, (fid, mid) in enumerate(media):
        db.add(LeaderTaskMedia(entry_id=entry.id, file_id=fid, message_id=mid, pos=i))
    db.commit()
    return True


@bot.message_handler(commands=["tasks"])
def _lt_cmd(message: types.Message):
    tid = message.from_user.id
    lang = _get_lang(tid)
    _lt_clear(tid)  # a fresh /tasks abandons any half-done capture
    with SessionLocal() as db:
        profs = _lt_leader_profiles(db, tid)
        if not profs:
            bot.send_message(message.chat.id, _lt(lang, "not_leader"))
            return
        if len(profs) == 1:
            _lt_menu(db, tid, profs[0].id, lang, message.chat.id, None)
        else:
            bot.send_message(message.chat.id, _lt(lang, "pick_profile"),
                             reply_markup=_lt_profile_kb(db, profs))


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("lt:"))
def _lt_callback(call: types.CallbackQuery):
    tid = call.from_user.id
    lang = _get_lang(tid)
    parts = call.data.split(":")
    action = parts[1] if len(parts) > 1 else ""
    chat_id = call.message.chat.id
    msg_id = call.message.message_id

    with SessionLocal() as db:
        profs = {p.id: p for p in _lt_leader_profiles(db, tid)}

        if action == "noop":
            bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"))
            return

        try:
            pid = int(parts[2])
        except (IndexError, ValueError):
            bot.answer_callback_query(call.id)
            return
        prof = profs.get(pid)
        if not prof:  # stale button / re-claimed profile
            bot.answer_callback_query(call.id, _lt(lang, "expired"), show_alert=True)
            return

        date = effective_date()
        day = _lt_day(db, pid, date)
        closed = bool(day and day.closed_at)
        defs = {td.id: td for td in ensure_task_defs(db)}
        cfg = effective_settings(db, prof.manager_id)

        def tname(tid_):
            td = defs.get(tid_)
            return task_name(td, lang) if td else f"T{tid_}"

        if action == "prof":
            _lt_clear(tid)
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id)
            return

        if action == "menu":
            _lt_clear(tid)
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id)
            return

        if action == "back":
            _lt_clear(tid)
            bot.answer_callback_query(call.id)
            if len(profs) > 1:
                try:
                    bot.edit_message_text(_lt(lang, "pick_profile"), chat_id=chat_id,
                                          message_id=msg_id,
                                          reply_markup=_lt_profile_kb(db, list(profs.values())))
                except Exception:
                    pass
            else:
                try:
                    bot.edit_message_text(_lt(lang, "farewell"), chat_id=chat_id,
                                          message_id=msg_id)
                except Exception:
                    pass
            return

        if action == "task":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            if task_id not in cfg or not cfg[task_id]["enabled"]:
                bot.answer_callback_query(call.id)
                _lt_menu(db, tid, pid, lang, chat_id, msg_id)
                return
            entries = _lt_entries(db, day)
            bot.answer_callback_query(call.id)
            if task_id in entries:
                # already answered → confirm reset-for-resubmission
                kb = types.InlineKeyboardMarkup()
                kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{pid}"),
                       _lt_btn(_lt(lang, "btn_reset"), f"lt:rconf:{pid}:{task_id}"))
                try:
                    bot.edit_message_text(_lt(lang, "reset_confirm").format(task=tname(task_id)),
                                          chat_id=chat_id, message_id=msg_id, reply_markup=kb)
                except Exception:
                    pass
            else:
                kb = types.InlineKeyboardMarkup()
                kb.row(_lt_btn(_lt(lang, "btn_yes"), f"lt:yes:{pid}:{task_id}"),
                       _lt_btn(_lt(lang, "btn_no"), f"lt:no:{pid}:{task_id}"))
                kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{pid}"))
                try:
                    bot.edit_message_text(_lt(lang, "did_you").format(task=tname(task_id)),
                                          chat_id=chat_id, message_id=msg_id, reply_markup=kb)
                except Exception:
                    pass
            return

        if action == "rconf":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            entries = _lt_entries(db, day)
            e = entries.get(task_id)
            if e:  # channel posts stay (audit trail); only our rows go
                db.query(LeaderTaskMedia).filter_by(entry_id=e.id).delete()
                db.delete(e)
                db.commit()
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id)
            return

        if action == "yes":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            need = cfg.get(task_id, {}).get("min_media", 1)
            if need <= 0:  # no proof required — save instantly
                _lt_save_entry(db, pid, task_id, True, None, [])
                bot.answer_callback_query(call.id, _lt(lang, "saved_toast"))
                _lt_menu(db, tid, pid, lang, chat_id, msg_id)
                return
            db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
            db.add(LeaderTaskCapture(
                telegram_id=tid, stage="photos", leader_id=pid, task_id=task_id,
                chat_id=chat_id, message_id=msg_id, min_media=need, media=[],
            ))
            db.commit()
            kb = types.InlineKeyboardMarkup(row_width=1)
            kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{pid}"))
            bot.answer_callback_query(call.id)
            try:
                bot.edit_message_text(
                    _lt(lang, "photos_counter").format(task=tname(task_id), min=need, k=0),
                    chat_id=chat_id, message_id=msg_id, reply_markup=kb)
            except Exception:
                pass
            return

        if action == "no":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
            db.add(LeaderTaskCapture(
                telegram_id=tid, stage="reason", leader_id=pid, task_id=task_id,
                chat_id=chat_id, message_id=msg_id,
            ))
            db.commit()
            kb = types.InlineKeyboardMarkup(row_width=1)
            kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{pid}"))
            bot.answer_callback_query(call.id)
            try:
                bot.edit_message_text(_lt(lang, "reason_prompt").format(task=tname(task_id)),
                                      chat_id=chat_id, message_id=msg_id, reply_markup=kb)
            except Exception:
                pass
            return

        if action == "save":
            task_id = int(parts[3])
            cap = _lt_capture(db, tid, lock=True)
            if not cap or cap.leader_id != pid or cap.task_id != task_id:
                bot.answer_callback_query(call.id, _lt(lang, "expired"), show_alert=True)
                return
            if cap.stage == "photos":
                media = [(p[0], p[1]) for p in (cap.media or [])]
                if len(media) < cap.min_media:
                    bot.answer_callback_query(call.id)
                    return
                ok = _lt_save_entry(db, pid, task_id, True, None, media)
            elif cap.stage == "confirm_reason":
                ok = _lt_save_entry(db, pid, task_id, False, cap.reason or "", [])
            else:
                bot.answer_callback_query(call.id)
                return
            db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
            db.commit()
            if not ok:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            bot.answer_callback_query(call.id, _lt(lang, "saved_toast"))
            _lt_menu(db, tid, pid, lang, chat_id, msg_id)
            return

        if action == "close":
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            entries = _lt_entries(db, day)
            missing = [t for t, s in cfg.items() if s["enabled"] and t not in entries]
            if missing:
                bot.answer_callback_query(
                    call.id, _lt(lang, "incomplete").format(n=len(missing)), show_alert=True)
                return
            kb = types.InlineKeyboardMarkup()
            kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{pid}"),
                   _lt_btn(_lt(lang, "btn_confirm"), f"lt:cconf:{pid}"))
            bot.answer_callback_query(call.id)
            try:
                bot.edit_message_text(_lt(lang, "close_confirm"),
                                      chat_id=chat_id, message_id=msg_id, reply_markup=kb)
            except Exception:
                pass
            return

        if action == "cconf":
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            entries = _lt_entries(db, day)
            missing = [t for t, s in cfg.items() if s["enabled"] and t not in entries]
            if missing or not day:
                bot.answer_callback_query(
                    call.id, _lt(lang, "incomplete").format(n=len(missing) or 1), show_alert=True)
                return
            day.closed_at = datetime.now(timezone.utc)
            day.completion = compute_completion(cfg, list(entries.values()))
            db.commit()
            bot.answer_callback_query(call.id, _lt(lang, "closed_done").format(
                score=round(float(day.completion))))
            _lt_menu(db, tid, pid, lang, chat_id, msg_id)
            return

    bot.answer_callback_query(call.id)


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "photos",
                     content_types=["photo"])
def _lt_photo(message: types.Message):
    tid = message.from_user.id
    lang = _get_lang(tid)
    with SessionLocal() as db:
        # FOR UPDATE serializes album items that Passenger spread across
        # workers — each append sees the previous one's committed count.
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "photos":
            return
        relayed = _lt_relay_photo(db, message)
        if not relayed:
            db.commit()  # release the row lock before messaging
            bot.send_message(message.chat.id, _lt(lang, "relay_fail"))
            return
        cap.media = (cap.media or []) + [list(relayed)]  # reassign → JSONB change tracked
        db.commit()
        k, need = len(cap.media), cap.min_media
        pid, task_id = cap.leader_id, cap.task_id
        chat, counter_id = cap.chat_id, cap.message_id
        defs = {td.id: td for td in ensure_task_defs(db)}
        td = defs.get(task_id)
        tname = task_name(td, lang) if td else f"T{task_id}"
    kb = types.InlineKeyboardMarkup(row_width=1)
    if k >= need:
        kb.add(_lt_btn(_lt(lang, "btn_save"), f"lt:save:{pid}:{task_id}"))
    kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{pid}"))
    try:  # counter edits in place; concurrent album items re-render the latest k
        bot.edit_message_text(
            _lt(lang, "photos_counter").format(task=tname, min=need, k=k),
            chat_id=chat, message_id=counter_id, reply_markup=kb)
    except Exception:
        pass


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "photos",
                     content_types=["video", "document", "audio", "voice",
                                    "animation", "video_note", "sticker"])
def _lt_wrong_media(message: types.Message):
    bot.send_message(message.chat.id, _lt(_get_lang(message.from_user.id), "photos_only"))


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "reason",
                     content_types=["text"])
def _lt_reason(message: types.Message):
    tid = message.from_user.id
    lang = _get_lang(tid)
    text = (message.text or "").strip()
    with SessionLocal() as db:
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "reason":
            return
        if not text or text.startswith("/"):  # unknown command mid-capture → abandon
            db.delete(cap)
            db.commit()
            bot.send_message(message.chat.id, _msg(lang, "unknown_command"))
            return
        pid, task_id = cap.leader_id, cap.task_id
        old_chat, old_mid = cap.chat_id, cap.message_id
        defs = {td.id: td for td in ensure_task_defs(db)}
        td = defs.get(task_id)
        tname = task_name(td, lang) if td else f"T{task_id}"
        # Per spec: the prompt is DELETED and a fresh save/reset message is sent
        # so it lands below the leader's answer.
        try:
            bot.delete_message(old_chat, old_mid)
        except Exception:
            pass
        kb = types.InlineKeyboardMarkup()
        kb.row(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{pid}"),
               _lt_btn(_lt(lang, "btn_save"), f"lt:save:{pid}:{task_id}"))
        sent = bot.send_message(
            message.chat.id,
            _lt(lang, "reason_confirm").format(task=tname, reason=text[:800]),
            reply_markup=kb)
        cap.stage = "confirm_reason"
        cap.reason = text[:800]
        cap.message_id = sent.message_id
        db.commit()


# ── Media → file_id echo (admins only) ────────────────────────────────────────
# Any attachment an admin sends outside a /broadcast draft is answered with its
# file_id in a tap-to-copy <code> block, so it can be pasted into the admin
# panel's «Media» tab or reused as a bot attachment. Registered AFTER
# _broadcast_capture so a draft in progress still wins, and BEFORE _fallback so
# non-admins keep getting the usual "unknown command" reply.

_FILE_ID_CONTENT = ["photo", "video", "document", "audio", "voice",
                    "animation", "video_note", "sticker"]


def _message_file_id(message: types.Message) -> tuple[str, int | None] | None:
    """(file_id, size) of the message's attachment, or None if it carries none.
    Photos arrive as a size ladder — the largest one is the useful id."""
    if message.content_type == "photo" and message.photo:
        best = max(message.photo, key=lambda p: p.file_size or 0)
        return best.file_id, best.file_size
    obj = getattr(message, message.content_type, None)
    fid = getattr(obj, "file_id", None)
    return (fid, getattr(obj, "file_size", None)) if fid else None


def _human_size(size: int | None) -> str:
    if not size:
        return ""
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f" · {size:.0f} {unit}" if unit == "B" else f" · {size:.1f} {unit}"
        size /= 1024.0
    return ""


@bot.message_handler(func=lambda m: m.from_user.id in _admin_ids(),
                     content_types=_FILE_ID_CONTENT)
def _file_id_echo(message: types.Message):
    lang = _get_lang(message.from_user.id)
    found = _message_file_id(message)
    if not found:
        bot.send_message(message.chat.id, _msg(lang, "unknown_command"))
        return
    fid, size = found
    txt = _msg(lang, "file_id_reply").format(
        kind=html.escape(_media_label(lang, message.content_type)),
        size=_human_size(size),
        fid=html.escape(fid),
    )
    try:
        bot.send_message(message.chat.id, txt, parse_mode="HTML",
                         reply_to_message_id=message.message_id)
    except Exception:
        logger.warning("Failed to echo file_id to %s", message.from_user.id, exc_info=True)


@bot.message_handler(func=lambda m: True)
def _fallback(message: types.Message):
    lang = _get_lang(message.from_user.id)
    bot.send_message(message.from_user.id, _msg(lang, "unknown_command"))


# ── Webhook setup ─────────────────────────────────────────────────────────────

def _meta_get(key: str) -> str | None:
    """Read a value from the tiny app_meta key/value table (created on demand)."""
    try:
        with SessionLocal() as db:
            db.execute(text(
                "CREATE TABLE IF NOT EXISTS app_meta (key VARCHAR PRIMARY KEY, value TEXT)"
            ))
            db.commit()
            row = db.execute(
                text("SELECT value FROM app_meta WHERE key = :k"), {"k": key}
            ).first()
            return row[0] if row else None
    except Exception as e:
        logger.warning("app_meta read failed (%s): %s", key, e)
        return None


def _meta_set(key: str, value: str) -> None:
    try:
        with SessionLocal() as db:
            db.execute(text(
                "CREATE TABLE IF NOT EXISTS app_meta (key VARCHAR PRIMARY KEY, value TEXT)"
            ))
            db.execute(
                text(
                    "INSERT INTO app_meta (key, value) VALUES (:k, :v) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
                ),
                {"k": key, "v": value},
            )
            db.commit()
    except Exception as e:
        logger.warning("app_meta write failed (%s): %s", key, e)


def setup_webhook():
    if not settings.telegram_bot_token or not settings.backend_url:
        logger.warning("Bot token or backend_url not set — skipping webhook registration")
        return
    if not settings.backend_url.startswith("https://"):
        logger.info("backend_url is not HTTPS (%s) — skipping webhook registration (local dev mode)", settings.backend_url)
        return
    webhook_url = f"{settings.backend_url.rstrip('/')}/bot/webhook"

    # Default command menu for every user — Uzbek default plus ru/en variants
    # (Telegram has no uz-Cyrillic language code; the default covers it).
    menus = {
        None: [
            types.BotCommand("start", "Boshlash / dashboard"),
            types.BotCommand("register", "Ro'yxatdan o'tish / yangi rol qo'shish"),
            types.BotCommand("tasks", "Kunlik vazifalar (liderlar)"),
        ],
        "ru": [
            types.BotCommand("start", "Запуск / дашборд"),
            types.BotCommand("register", "Регистрация / добавить роль"),
            types.BotCommand("tasks", "Ежедневные задачи (лидеры)"),
        ],
        "en": [
            types.BotCommand("start", "Start / dashboard"),
            types.BotCommand("register", "Register / add a role"),
            types.BotCommand("tasks", "Daily tasks (leaders)"),
        ],
    }
    admin_menu = [
        types.BotCommand("start", "Boshlash / dashboard"),
        types.BotCommand("pending", "Kutilayotgan ro'yxatdan o'tishlar"),
        types.BotCommand("tasks", "Kunlik vazifalar (liderlar)"),
    ]
    admin_ids = sorted(_admin_ids())

    # Webhook + command registration are GLOBAL, idempotent Telegram settings
    # that only need updating when their CONTENT changes. But this runs on every
    # Passenger worker boot, and workers respawn constantly — re-pushing the same
    # setMyCommands on each boot got the bot rate-limited (HTTP 429 "retry after
    # ~2000s"). Gate the Telegram calls behind a content signature persisted in
    # app_meta so they fire once per change, not once per boot.
    signature = hashlib.sha256(
        json.dumps(
            {
                "webhook_url": webhook_url,
                "menus": {
                    str(code): [(c.command, c.description) for c in cmds]
                    for code, cmds in menus.items()
                },
                "admin_menu": [(c.command, c.description) for c in admin_menu],
                "admin_ids": admin_ids,
            },
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()

    if _meta_get("bot_setup_sig") == signature:
        logger.info(
            "Bot webhook/commands unchanged (sig %s…) — skipping Telegram setup",
            signature[:8],
        )
        return

    try:
        bot.set_webhook(url=webhook_url)
        logger.info("Webhook set to %s", webhook_url)
    except Exception as e:
        logger.warning("Failed to set webhook (Telegram unreachable?): %s", e)

    for code, cmds in menus.items():
        try:
            bot.set_my_commands(cmds, language_code=code)
        except Exception as e:
            logger.warning("Failed to set default commands (%s): %s", code, e)

    # Admins get their own menu (a chat scope replaces the default entirely).
    for admin_id in admin_ids:
        try:
            bot.set_my_commands(admin_menu, scope=types.BotCommandScopeChat(admin_id))
        except Exception as e:
            logger.warning("Failed to set admin commands for %s: %s", admin_id, e)

    # Persist the signature even if some calls 429'd: a rate-limit response means
    # Telegram already holds these commands from an earlier boot, so retrying on
    # every future boot only deepens the throttle. A real content change yields a
    # new signature and re-runs this block once.
    _meta_set("bot_setup_sig", signature)
