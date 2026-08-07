import os
import sys
import json
import logging
from datetime import datetime, timezone

# Add backend to Python path so we can reuse models and DB config
_BOT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.join(_BOT_DIR, "..", "backend")
sys.path.insert(0, _BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

import telebot
from telebot import types
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, TelegramUser
from messages import msg, role_label
from keyboards import (
    language_keyboard,
    webapp_register_keyboard,
    share_contact_keyboard,
    remove_keyboard,
    admin_approval_keyboard,
    open_dashboard_keyboard,
)

# ── Config ────────────────────────────────────────────────────────────────────

BOT_TOKEN        = os.environ["TELEGRAM_BOT_TOKEN"]
# Comma-separated list of admin Telegram IDs
ADMIN_TELEGRAM_IDS = [int(x) for x in os.environ["ADMIN_TELEGRAM_ID"].replace(" ", "").split(",") if x]
DATABASE_URL     = os.environ["DATABASE_URL"]
WEBAPP_URL       = os.environ.get("WEBAPP_URL", "http://localhost:5173")

# ── Database ──────────────────────────────────────────────────────────────────

engine  = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(engine)

# ── Bot ───────────────────────────────────────────────────────────────────────

bot = telebot.TeleBot(BOT_TOKEN, parse_mode=None)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# In-memory state keyed by telegram_id
# { telegram_id: { "language": "uz"|"ru"|"en", "state": "..." } }
_state: dict[int, dict] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_lang(telegram_id: int) -> str:
    if telegram_id in _state and "language" in _state[telegram_id]:
        return _state[telegram_id]["language"]
    with Session() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
        return user.language if user else "uz"


def _set_menu_button(telegram_id: int):
    lang = _get_lang(telegram_id)
    try:
        bot.set_chat_menu_button(
            chat_id=telegram_id,
            menu_button=types.MenuButtonWebApp(
                text=msg(lang, "open_dashboard"),
                web_app=types.WebAppInfo(url=WEBAPP_URL.rstrip("/")),
            ),
        )
    except Exception as e:
        logger.warning("Could not set menu button for %s: %s", telegram_id, e)


def _get_or_init_state(telegram_id: int) -> dict:
    if telegram_id not in _state:
        _state[telegram_id] = {}
    return _state[telegram_id]


# ── /start ────────────────────────────────────────────────────────────────────

@bot.message_handler(commands=["start"])
def handle_start(message: types.Message):
    tid = message.from_user.id

    # Admin fast-path
    if tid in ADMIN_TELEGRAM_IDS:
        _set_menu_button(tid)
        bot.send_message(
            tid,
            msg("uz", "admin_welcome"),
            reply_markup=open_dashboard_keyboard(WEBAPP_URL, msg("uz", "open_dashboard")),
        )
        return

    with Session() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()

    if user:
        lang = user.language
        if user.status == "approved":
            _set_menu_button(tid)
            bot.send_message(
                tid,
                msg(lang, "already_approved"),
                reply_markup=open_dashboard_keyboard(WEBAPP_URL, msg(lang, "open_dashboard")),
            )
        elif user.status == "pending":
            bot.send_message(tid, msg(lang, "already_pending"))
        else:
            # rejected — allow fresh start
            _state.pop(tid, None)
            bot.send_message(tid, msg("uz", "choose_language"), reply_markup=language_keyboard())
        return

    # New user
    bot.send_message(tid, msg("uz", "choose_language"), reply_markup=language_keyboard())


# ── Language selection ────────────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: c.data.startswith("lang:"))
def handle_language(call: types.CallbackQuery):
    tid = call.from_user.id
    lang = call.data.split(":", 1)[1]
    if lang not in ("uz", "uz_cyrl", "ru", "en"):
        bot.answer_callback_query(call.id)
        return

    st = _get_or_init_state(tid)
    st["language"] = lang

    bot.answer_callback_query(call.id)
    bot.edit_message_text(
        chat_id=tid,
        message_id=call.message.message_id,
        text=msg(lang, "welcome_new"),
        reply_markup=webapp_register_keyboard(WEBAPP_URL, msg(lang, "register_btn")),
    )


# ── WebApp registration form submitted ────────────────────────────────────────

@bot.message_handler(content_types=["web_app_data"])
def handle_webapp_data(message: types.Message):
    tid = message.from_user.id

    try:
        data = json.loads(message.web_app_data.data)
        full_name = str(data.get("full_name", "")).strip()
        role = str(data.get("role", ""))
    except Exception:
        return

    if not full_name or role not in ("top-manager", "shift-manager", "supervisor"):
        return

    lang = _get_lang(tid)

    with Session() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()

        if user and user.status in ("pending", "approved"):
            bot.send_message(tid, msg(lang, "already_pending"))
            return

        if user:
            user.full_name = full_name
            user.role      = role
            user.language  = lang
            user.status    = "pending"
        else:
            user = TelegramUser(
                telegram_id=tid,
                username=message.from_user.username,
                full_name=full_name,
                role=role,
                language=lang,
                status="pending",
            )
            db.add(user)

        db.commit()

    st = _get_or_init_state(tid)
    st["state"] = "waiting_contact"

    bot.send_message(
        tid,
        msg(lang, "share_contact_prompt"),
        reply_markup=share_contact_keyboard(msg(lang, "share_contact_btn")),
    )


# ── Contact shared ────────────────────────────────────────────────────────────

@bot.message_handler(content_types=["contact"])
def handle_contact(message: types.Message):
    tid = message.from_user.id

    # Only accept the user's own contact
    if message.contact.user_id != tid:
        return

    phone = message.contact.phone_number
    lang  = _get_lang(tid)

    with Session() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        if not user:
            return
        user.phone = phone
        db.commit()

        role_name = role_label("uz", user.role)
        admin_text = (
            f"🆕 Yangi ro'yxatdan o'tish:\n\n"
            f"👤 Ism: {user.full_name}\n"
            f"💼 Lavozim: {role_name}\n"
            f"📱 Telefon: {phone}\n"
            f"🆔 Telegram ID: {tid}"
        )
        if message.from_user.username:
            admin_text += f"\n🔗 @{message.from_user.username}"

    # Remove contact keyboard from user's chat
    bot.send_message(tid, msg(lang, "waiting_approval"), reply_markup=remove_keyboard())

    # Notify admins
    for admin_id in ADMIN_TELEGRAM_IDS:
        try:
            bot.send_message(admin_id, admin_text, reply_markup=admin_approval_keyboard(tid))
        except Exception:
            logger.exception("Failed to notify admin %s", admin_id)

    # Clear local state
    _state.pop(tid, None)


# ── Admin: approve / reject ───────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: c.data.startswith(("approve:", "reject:")))
def handle_approval(call: types.CallbackQuery):
    if call.from_user.id not in ADMIN_TELEGRAM_IDS:
        bot.answer_callback_query(call.id, "⛔ Ruxsat yo'q")
        return

    action, raw_id = call.data.split(":", 1)
    target_id = int(raw_id)

    with Session() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=target_id).first()
        if not user:
            bot.answer_callback_query(call.id, "Foydalanuvchi topilmadi")
            return

        user.status = "approved" if action == "approve" else "rejected"
        if action == "approve":
            user.approved_at = datetime.now(timezone.utc)
        db.commit()

        lang      = user.language
        full_name = user.full_name
        role_name = role_label("uz", user.role)

    # Remove inline buttons from admin's message
    try:
        bot.edit_message_reply_markup(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            reply_markup=None,
        )
    except Exception:
        pass

    if action == "approve":
        _set_menu_button(target_id)
        bot.send_message(
            target_id,
            msg(lang, "approved"),
            reply_markup=open_dashboard_keyboard(WEBAPP_URL, msg(lang, "open_dashboard")),
        )
        bot.answer_callback_query(call.id, f"✅ {full_name} tasdiqlandi")
        bot.send_message(
            call.message.chat.id,
            f"✅ Tasdiqlandi: {full_name} ({role_name})",
        )
    else:
        bot.send_message(target_id, msg(lang, "rejected"))
        bot.answer_callback_query(call.id, f"❌ {full_name} rad etildi")
        bot.send_message(
            call.message.chat.id,
            f"❌ Rad etildi: {full_name} ({role_name})",
        )


# ── Fallback ──────────────────────────────────────────────────────────────────

@bot.message_handler(func=lambda m: True)
def handle_unknown(message: types.Message):
    lang = _get_lang(message.from_user.id)
    bot.send_message(message.from_user.id, msg(lang, "unknown_command"))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("Bot started (long polling)")
    bot.infinity_polling(timeout=10, long_polling_timeout=5)
