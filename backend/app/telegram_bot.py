"""
Telegram bot — runs inside the FastAPI process via webhook.
Updates arrive at POST /bot/webhook and are dispatched here.
"""
import hashlib
import html
import json
import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import telebot
from telebot import types
from sqlalchemy import and_, or_, text

from app.config import settings
from app.database import SessionLocal
from app.identity import find_role_row
from app.models import (
    Admin, ApprovalNotice, BroadcastDraft, LeaderLateProof, LeaderLateProofShot,
    LeaderTaskCapture, LeaderTaskDay, LeaderTaskEntry, LeaderTaskMedia, Manager,
    RegistrationNotice, RoleProfile, TelegramUser, TelegramUserRole, Translation,
)
from app.reg_token import make_reg_token
from app.services import (
    action_log, leader_ai, leader_close, leader_late_proof, leader_proof,
    leader_tasks,
)
from app.services.leader_tasks import (
    channel_chat_id, compute_completion, config_name, effective_date,
    effective_leader_config, promote_due,
)
from app.translit import transliterate as _to_uz_latin

logger = logging.getLogger(__name__)


class _BotExceptionHandler(telebot.ExceptionHandler):
    """Without this, a handler that raises is logged by telebot at DEBUG level
    into telebot's own logger and then dropped — the command reaches the user
    as pure silence and leaves NOTHING in the app log to debug from. Surface
    every handler crash at ERROR instead."""

    def handle(self, exception):
        logger.error("Unhandled error in a bot handler", exc_info=exception)
        return True


# threaded=False: handlers MUST run inside the webhook request, not on a
# telebot worker thread. With the default pool, process_new_updates() only
# enqueues and returns, so /bot/webhook answers 200 while the handler has done
# nothing yet — and under Passenger the process serving that request is reaped
# between requests (app.log shows a fresh boot every few seconds). The pool's
# threads are daemons, so they die with it: the command lands as pure silence,
# no reply and nothing in the log. The pool swallowed crashes too — WorkerThread
# logs them at DEBUG on telebot's own logger and parks them for
# raise_exceptions(), which ONLY the polling loop calls, so under webhooks
# _BotExceptionHandler below was never once reached.
# Inline execution fixes both: the reply is sent before we return 200, and every
# exception surfaces (handler → webhook route). It costs the webhook request one
# Telegram round-trip of latency (Telegram allows far more), and no handler here
# fans out to many chats — the broadcast send lives in routers/broadcast.py.
# Starvation is no longer a risk either: each update is served by its own
# Passenger worker instead of a shared 8-thread pool.
bot = telebot.TeleBot(
    settings.telegram_bot_token,
    parse_mode=None,
    threaded=False,
    exception_handler=_BotExceptionHandler(),
)

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
        "contact_typed_warning": (
            "⚠️ Telefon raqamini matn sifatida yozmang — bunday raqam qabul qilinmaydi.\n\n"
            "👇 Pastdagi «{btn}» tugmasini bosing — raqamingiz Telegram orqali "
            "avtomatik yuboriladi.\n\n"
            "Tugma ko'rinmasa, xabar maydonidagi klaviatura belgisini bosing."
        ),
        "contact_not_own": (
            "⚠️ Bu boshqa odamning raqami.\n\n"
            "👇 O'z raqamingizni yuborish uchun «{btn}» tugmasini bosing."
        ),
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
        "profile_already_yours": (
            "✅ «{name}» profili allaqachon sizda — u ilovadagi profillar "
            "ro'yxatida turadi.\n"
            "Boshqa profil qo'shish uchun /register buyrug'ini yuboring."
        ),
        "claim_failed": (
            "❌ Bu profilni topib bo'lmadi, shuning uchun so'rov "
            "yuborilmadi.\n"
            "Ro'yxat o'zgargan bo'lishi mumkin — /register buyrug'ini qayta "
            "yuboring va profilni ro'yxatdan tanlang."
        ),
        "admin_welcome":     "👑 Admin paneliga xush kelibsiz!",
        "admin_role_added":  "✅ Yangi rol qo'shildi va tasdiqlandi. Web ilovada profilni almashtirib turing.",
        "add_role_hint":     "➕ Yana bir rol qo'shmoqchimisiz? Quyidagi tugma orqali yangi rol uchun ro'yxatdan o'ting.",
        "unknown_command":   "Boshlash uchun /start ni bosing.",
        "shot_failed":       "❌ Rasmni tayyorlab bo'lmadi. Birozdan so'ng qayta urinib ko'ring.",
        "shot_bad_date":     "📅 Sanani YYYY-MM-DD ko'rinishida yuboring, masalan: /ojidaniya 2026-07-25",
        "shot_no_access":    "🚫 Sizda bu sahifaga ruxsat yo'q.",
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
        "custom_emoji_reply": "🎨 <b>Premium emoji</b>\n{list}\n\nID ni nusxalash uchun ustiga bosing.",
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
        "contact_typed_warning": (
            "⚠️ Телефон рақамини матн сифатида ёзманг — бундай рақам қабул қилинмайди.\n\n"
            "👇 Пастдаги «{btn}» тугмасини босинг — рақамингиз Телеграм орқали "
            "автоматик юборилади.\n\n"
            "Тугма кўринмаса, хабар майдонидаги клавиатура белгисини босинг."
        ),
        "contact_not_own": (
            "⚠️ Бу бошқа одамнинг рақами.\n\n"
            "👇 Ўз рақамингизни юбориш учун «{btn}» тугмасини босинг."
        ),
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
        "profile_already_yours": (
            "✅ «{name}» профили аллақачон сизда — у иловадаги профиллар "
            "рўйхатида туради.\n"
            "Бошқа профил қўшиш учун /register буйруғини юборинг."
        ),
        "claim_failed": (
            "❌ Бу профилни топиб бўлмади, шунинг учун сўров юборилмади.\n"
            "Рўйхат ўзгарган бўлиши мумкин — /register буйруғини қайта "
            "юборинг ва профилни рўйхатдан танланг."
        ),
        "admin_welcome":     "👑 Админ панелига хуш келибсиз!",
        "admin_role_added":  "✅ Янги рол қўшилди ва тасдиқланди. Web иловада профилни алмаштириб туринг.",
        "add_role_hint":     "➕ Яна бир рол қўшмоқчимисиз? Қуйидаги тугма орқали янги рол учун рўйхатдан ўтинг.",
        "unknown_command":   "Бошлаш учун /start ни босинг.",
        "shot_failed":       "❌ Расмни тайёрлаб бўлмади. Бироздан сўнг қайта уриниб кўринг.",
        "shot_bad_date":     "📅 Санани YYYY-MM-DD кўринишида юборинг, масалан: /ojidaniya 2026-07-25",
        "shot_no_access":    "🚫 Сизда бу саҳифага рухсат йўқ.",
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
        "custom_emoji_reply": "🎨 <b>Premium emoji</b>\n{list}\n\nID ни нусхалаш учун устига босинг.",
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
        "contact_typed_warning": (
            "⚠️ Не отправляйте номер текстом — так он не принимается.\n\n"
            "👇 Нажмите кнопку «{btn}» внизу — номер отправится автоматически "
            "через Telegram.\n\n"
            "Если кнопки не видно, нажмите значок клавиатуры рядом с полем ввода."
        ),
        "contact_not_own": (
            "⚠️ Это контакт другого человека.\n\n"
            "👇 Нажмите кнопку «{btn}», чтобы отправить свой номер."
        ),
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
        "profile_already_yours": (
            "✅ Профиль «{name}» уже у вас — он есть в списке профилей в "
            "приложении.\n"
            "Чтобы добавить другой профиль, отправьте команду /register."
        ),
        "claim_failed": (
            "❌ Этот профиль не найден, поэтому заявка не отправлена.\n"
            "Список мог измениться — отправьте /register снова и выберите "
            "профиль из списка."
        ),
        "admin_welcome":     "👑 Добро пожаловать в панель администратора!",
        "admin_role_added":  "✅ Новая роль добавлена и подтверждена. Переключайте профиль в веб-приложении.",
        "add_role_hint":     "➕ Хотите добавить ещё одну роль? Зарегистрируйтесь на новую роль с помощью кнопки ниже.",
        "unknown_command":   "Отправьте /start для начала.",
        "shot_failed":       "❌ Не удалось построить изображение. Попробуйте чуть позже.",
        "shot_bad_date":     "📅 Укажите дату как YYYY-MM-DD, например: /ojidaniya 2026-07-25",
        "shot_no_access":    "🚫 У вас нет доступа к этой странице.",
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
        "custom_emoji_reply": "🎨 <b>Премиум эмодзи</b>\n{list}\n\nНажмите на ID, чтобы скопировать.",
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
        "contact_typed_warning": (
            "⚠️ Please don't type your number as text — it can't be accepted that way.\n\n"
            "👇 Tap the «{btn}» button below — Telegram will send your number "
            "automatically.\n\n"
            "If you don't see the button, tap the keyboard icon next to the message field."
        ),
        "contact_not_own": (
            "⚠️ That's someone else's contact.\n\n"
            "👇 Tap «{btn}» to send your own number."
        ),
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
        "profile_already_yours": (
            "✅ The «{name}» profile is already yours — it's in the app's "
            "profile list.\n"
            "To add a different profile, send /register."
        ),
        "claim_failed": (
            "❌ That profile could not be found, so no request was filed.\n"
            "The list may have changed — send /register again and pick the "
            "profile from the list."
        ),
        "admin_welcome":     "👑 Welcome to the admin panel!",
        "admin_role_added":  "✅ New role added and approved. Switch between profiles in the web app.",
        "add_role_hint":     "➕ Want to add another role? Use the button below to register for a new role.",
        "unknown_command":   "Send /start to begin.",
        "shot_failed":       "❌ Couldn't build the image. Please try again in a moment.",
        "shot_bad_date":     "📅 Use a date like YYYY-MM-DD, e.g. /ojidaniya 2026-07-25",
        "shot_no_access":    "🚫 You don't have access to this page.",
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
        "custom_emoji_reply": "🎨 <b>Premium emoji</b>\n{list}\n\nTap an ID to copy.",
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


def _awaiting_contact(tid: int) -> bool:
    """True while a registration is parked at the "share your contact" step.
    The in-memory ref is the normal signal; the DB check keeps a user who was
    prompted before a process restart recoverable — without it, someone who
    typed their number instead of tapping the button is stuck on a pending row
    the bot will never complete."""
    if _state.get(tid, {}).get("pending_role_ref"):
        return True
    try:
        with SessionLocal() as db:
            user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
            if not user or user.phone:
                return False
            return db.query(TelegramUserRole).filter_by(
                telegram_id=tid, status="pending").first() is not None
    except Exception:
        logger.warning("awaiting-contact check failed for %s", tid, exc_info=True)
        return False


def _ask_contact(tid: int, lang: str, warn_key: str | None = None):
    """(Re-)show the share-contact button. ``warn_key`` prefixes the prompt with
    an explanation of why the last message didn't count."""
    if warn_key:
        bot.send_message(tid, _msg(lang, warn_key).format(
            btn=_msg(lang, "share_contact_btn")), reply_markup=_contact_kb(lang))
    else:
        bot.send_message(tid, _msg(lang, "share_contact_prompt"),
                         reply_markup=_contact_kb(lang))


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


_BURST_MAX_WAIT = 5  # seconds we're willing to block a pool worker for


def _send_burst(chat_id: int, text: str, reply_markup=None, attempts: int = 3):
    """send_message for the case where we push SEVERAL messages into ONE chat
    back-to-back (/pending re-listing every request). Telegram's per-chat
    ceiling is ~1 msg/s, so a burst trips 429 — and a raised 429 used to make
    the whole listing vanish with no reply at all. Honour retry_after instead
    of dropping the message; only the rate-limited path pays the wait."""
    for i in range(attempts):
        try:
            return bot.send_message(chat_id, text, reply_markup=reply_markup)
        except telebot.apihelper.ApiTelegramException as e:
            params = (getattr(e, "result_json", None) or {}).get("parameters") or {}
            wait = int(params.get("retry_after", 2) or 2)
            # Never hold a worker thread hostage: the pool is what serves EVERY
            # user's commands, so a long retry_after is reported to the caller
            # rather than slept through.
            if e.error_code != 429 or i == attempts - 1 or wait > _BURST_MAX_WAIT:
                raise
            time.sleep(wait)
    return None


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
            # A request still waiting for the contact isn't "under review" yet —
            # re-offer the button instead of removing the keyboard and leaving
            # the user with no way to finish.
            if _awaiting_contact(tid):
                _ask_contact(tid, lang)
            else:
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
            if _awaiting_contact(tid):
                _ask_contact(tid, lang)
            else:
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
    # Same action the web app records as `identity.language_changed`; the tap
    # carries no session yet, so the actor is the bare account until they
    # register.
    action_log.record_bot(None, tid, "identity", "identity.language_changed",
                          details=[("language", lang)])
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

    def _unresolved():
        """The claim named a profile that no longer resolves — the picker offers
        only real ones, so it is a stale page (a rename since it opened) or a
        forged payload. Either way SAY so: this used to `return` mutely, and a
        registration that answers with nothing reads as one that was filed."""
        bot.send_message(tid, _msg(lang, "claim_failed"))

    with SessionLocal() as db:
        user = db.query(TelegramUser).filter_by(telegram_id=tid).first()

        # Resolve role_id — registration only binds a pre-created profile now.
        role_id = None
        leader_profile_id = None
        if role == "supervisor":
            mgr = db.query(Manager).filter(Manager.name == full_name,
                                           Manager.archived.is_(False)).first()
            if not mgr:
                return _unresolved()
            role_id = mgr.id
        elif role == "leader":
            # A leader picks their supervisor's unit, then one of that unit's
            # pre-created leader profiles — role_id keeps pointing at the unit.
            mgr = db.query(Manager).filter(Manager.name == supervisor,
                                           Manager.archived.is_(False)).first()
            if not mgr:
                return _unresolved()
            lp = db.query(RoleProfile).filter_by(role="leader", manager_id=mgr.id,
                                                 name=full_name).first()
            if not lp:
                return _unresolved()
            role_id = mgr.id
            leader_profile_id = lp.id   # the claimed profile — stamped on the role row
        elif role == "shift-manager":
            p = db.query(RoleProfile).filter_by(role="shift-manager", name=full_name).first()
            if not p:
                return _unresolved()
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
                    return _unresolved()
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
                return _unresolved()
            role_id = p.id

        # A user may hold several roles, but only one instance of the exact same
        # PROFILE. A rejected instance can be re-requested. Asked through
        # find_role_row because a leader's role_id is the unit: the old
        # (telegram_id, role, role_id) lookup matched a DIFFERENT leader profile
        # of the same brigadir and turned the claim away as "already approved",
        # so nobody could hold two leader profiles under one unit.
        existing = find_role_row(
            db, tid, role, role_id,
            key=f"leader:{leader_profile_id}" if leader_profile_id else None,
            name=full_name,
        )
        if existing and existing.status == "approved":
            # Names the profile: the old generic "you are already approved" was
            # indistinguishable from a successful claim, so a refusal read as a
            # profile that had been added and then failed to appear in the app.
            bot.send_message(tid, _msg(lang, "profile_already_yours").format(name=full_name),
                             reply_markup=_dashboard_kb(lang))
            return
        if existing and existing.status == "pending" and not is_admin:
            bot.send_message(tid, _msg(lang, "already_pending"))
            return

        now = datetime.now(timezone.utc)
        if existing:  # rejected (or an admin's stale pending) → (re-)activate
            existing.full_name   = full_name
            existing.status      = new_status
            existing.approved_at = now if is_admin else None
            existing.profile_key = (
                f"leader:{leader_profile_id}" if role == "leader" and leader_profile_id
                else (f"{role}:{role_id}" if role_id else None)
            )
            role_row = existing
        else:
            role_row = TelegramUserRole(
                telegram_id=tid,
                role=role,
                role_id=role_id,
                full_name=full_name,
                # Record WHICH profile is being claimed. For leaders role_id is
                # the unit, so without this the profile could only be guessed by
                # name-matching later — and a rename broke the link silently.
                profile_key=(f"leader:{leader_profile_id}" if role == "leader" and leader_profile_id
                             else (f"{role}:{role_id}" if role_id else None)),
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
        claimed_key = role_row.profile_key
        if not is_admin and user.phone:
            # New registration → require a fresh contact. Clearing the stale
            # phone (kept from a prior registration) makes _awaiting_contact()
            # authoritative from the DB alone, so a user who TYPES their number
            # instead of tapping the button still gets the warning even when the
            # typed update lands on a different Passenger worker or after a
            # restart wiped the in-memory _state.
            user.phone = None
        db.commit()
        # A claim on a pre-created profile: the register says who asked for
        # which identity, whether or not an admin ever decides it. An admin's
        # own claim lands `approved` in the same breath, and the changes row is
        # what says which of the two happened.
        action_log.record_bot(
            db, tid, "identity", "registration.claimed",
            actor_name=full_name, actor_role=role,
            target_kind="profile", target_id=claimed_key or role_id,
            target_name=full_name,
            unit_id=role_id if role in ("supervisor", "leader") else None,
            unit_name=(full_name if role == "supervisor"
                       else supervisor if role == "leader" else None),
            details=[("role", role), ("language", lang)],
            changes=[("status", None, new_status)],
        )

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
                full_name=p.name, profile_key=f"admin:{pid}", status="pending",
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
        if user and user.phone:
            user.phone = None   # same fresh-contact reset as the web flow above
        db.flush()
        pending_ref = role_row.id
        claimed_name = p.name
        db.commit()
        action_log.record_bot(
            db, tid, "identity", "registration.claimed",
            actor_name=claimed_name,
            target_kind="profile", target_id=f"admin:{pid}",
            target_name=claimed_name,
            details=[("role", "admin")],
            changes=[("status", None, "pending")],
        )

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
        # Someone from the address book, not their own number — only Telegram's
        # own button proves the number belongs to this account.
        if _awaiting_contact(tid):
            _ask_contact(tid, _get_lang(tid), "contact_not_own")
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
        # Sharing the contact is what turns a claim into a request admins can
        # decide — the phone itself stays out of the register.
        action_log.record_bot(
            db, tid, "identity", "registration.submitted",
            actor_name=role_row.full_name, actor_role=role_row.role,
            target_kind="profile", target_id=role_row.profile_key or role_row.id,
            target_name=role_row.full_name,
            unit_id=role_row.role_id if role_row.role in ("supervisor", "leader") else None,
            unit_name=(role_row.full_name if role_row.role == "supervisor"
                       else supervisor),
            details=[("role", role_row.role)],
        )
    _state.pop(tid, None)


_TG_EMOJI_RE = re.compile(r"<tg-emoji\b[^>]*>(.*?)</tg-emoji>", re.IGNORECASE | re.DOTALL)


def strip_custom_emoji(html_text: str) -> str:
    """Replace every ``<tg-emoji …>fallback</tg-emoji>`` with just its fallback
    char. Telegram only lets bots that bought a username on Fragment send premium
    (custom) emoji; on other bots the API rejects the WHOLE message. Callers retry
    the send with this so the message still lands, degraded to plain emoji."""
    return _TG_EMOJI_RE.sub(r"\1", html_text or "")


def _send_html_message(chat_id: int, html_text: str, reply_markup=None) -> None:
    """send_message in HTML mode, retrying once with premium emoji stripped to
    their fallback chars if Telegram rejects them (see strip_custom_emoji)."""
    try:
        bot.send_message(chat_id, html_text, parse_mode="HTML",
                         reply_markup=reply_markup)
    except Exception:
        stripped = strip_custom_emoji(html_text)
        if stripped == html_text:
            raise
        bot.send_message(chat_id, stripped, parse_mode="HTML",
                         reply_markup=reply_markup)


# Telegram refusals that mean "this account can never be DMed as things stand"
# — as opposed to a rate limit, a network blip or a markup error, which say
# nothing about reachability and must not be recorded as one.
_DM_DEAD_ENDS = (
    "bot was blocked", "user is deactivated", "chat not found",
    "bot can't initiate conversation", "have no rights to send",
    "user is deleted", "peer_id_invalid", "forbidden",
)


def _record_dm_outcome(telegram_id: int, error: str | None) -> None:
    """Remember whether the bot can reach this account, for the Profiles tab's
    "DM" column. Writes only on a CHANGE (unreachable → reachable or back), so
    the common case costs one indexed read. Own session: this must never join,
    or roll back with, the request transaction that triggered the DM."""
    if error is not None and not any(s in error.lower() for s in _DM_DEAD_ENDS):
        return          # transient — leave whatever we knew before untouched
    try:
        with SessionLocal() as db:
            u = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
            if not u:
                return
            if error is None:
                if u.dm_failed_at is None:
                    return
                u.dm_failed_at, u.dm_error = None, None
            else:
                if u.dm_failed_at is not None and u.dm_error == error[:255]:
                    return
                u.dm_failed_at = datetime.now(timezone.utc)
                u.dm_error = error[:255]
            db.commit()
    except Exception:
        pass        # bookkeeping must never break the notification itself


def _send_rich_message(chat_id: int, rich_html: str, reply_markup=None) -> None:
    """sendRichMessage (Bot API 10.1+) with one Rich-HTML body. The pinned
    telebot predates the method, so this goes through the raw HTTP door the
    Broadcast tab already uses. Raises on any refusal — the caller decides what
    to fall back to."""
    from app.routers.broadcast import _tg_api
    data = {"chat_id": chat_id,
            "rich_message": json.dumps({"html": rich_html, "is_rtl": False})}
    if reply_markup is not None:
        data["reply_markup"] = (reply_markup.to_json()
                                if hasattr(reply_markup, "to_json")
                                else json.dumps(reply_markup))
    _tg_api("sendRichMessage", data)


def send_tg_notification(telegram_id: int, title: str, body: str,
                         html: str | None = None, markup=None,
                         rich: str | None = None) -> bool:
    """Send a Telegram DM mirroring an in-app notification. When ``html`` is given
    it is sent verbatim in HTML parse mode (self-contained message, e.g. bold
    labels + <blockquote>); otherwise falls back to the default Markdown layout.
    Returns True if Telegram accepted the message, False if the send failed (e.g.
    the user never started the bot, or blocked it). Failures are logged at
    WARNING — an in-app bell with no matching DM is otherwise invisible to debug.

    ``rich`` is a Rich-HTML body (headings, tables, details — the
    sendRichMessage dialect) tried FIRST. It is the try-rich-then-degrade shape
    the capability alerts and the bot's /ojidaniya card already use: a client
    that cannot render rich messages, or an API that refuses the body, still
    gets the classic ``html``/Markdown DM, so a notification never goes silent
    on an old client for the sake of a nicer one on a new one."""
    # Piggyback a menu-button refresh on every notification so the persistent
    # WebApp button picks up label changes without the user re-running /start.
    # _set_menu_button guards its own errors, so this can't block the DM.
    _set_menu_button(telegram_id, _get_lang(telegram_id))
    msg = f"🔔 *{title}*\n{body}"
    if rich is not None:
        try:
            _send_rich_message(telegram_id, rich, reply_markup=markup)
            _record_dm_outcome(telegram_id, None)
            return True
        except Exception as e:
            logger.info("Rich notification to %s not accepted, sending the "
                        "classic DM instead: %s", telegram_id, e)
    try:
        if html is not None:
            _send_html_message(telegram_id, html, reply_markup=markup)
        else:
            bot.send_message(telegram_id, msg, parse_mode="Markdown",
                             reply_markup=markup)
        _record_dm_outcome(telegram_id, None)
        return True
    except Exception as e:
        # Legacy Markdown rejects the WHOLE message over a single unbalanced
        # *, _, ` or [ — and notification bodies interpolate free text the user
        # typed (a concern's own words, an escalation reason). Losing the DM to
        # somebody's punctuation is far worse than losing the bold title, so
        # resend once unformatted. Only on a parse error: a blocked bot or an
        # unknown chat must fail on the first attempt, not be retried.
        if html is None and "parse" in str(e).lower():
            try:
                bot.send_message(telegram_id, msg, reply_markup=markup)
                logger.warning("Telegram notification to %s sent unformatted "
                               "(Markdown rejected): %s", telegram_id, e)
                _record_dm_outcome(telegram_id, None)
                return True
            except Exception as e2:
                e = e2
        logger.warning("Telegram notification to %s failed: %s", telegram_id, e)
        _record_dm_outcome(telegram_id, str(e))
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


def _reg_facts(role_ref: int) -> dict:
    """Who and what a pending role request names, for the action register.

    Taken before the decision runs: a winning admin claim DELETES its role row
    (so a stale row can never mint an admin JWT), and a log line that had to
    read the row afterwards would lose the very claim it exists to record.
    Never raises — the audit must not be able to block the decision."""
    try:
        with SessionLocal() as db:
            r = db.query(TelegramUserRole).filter_by(id=role_ref).first()
            if r is None:
                return {}
            return {"name": r.full_name, "role": r.role,
                    "user": r.telegram_id, "profile": r.profile_key}
    except Exception:
        logger.debug("action log: registration facts unavailable", exc_info=True)
        return {}


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
            who = _caller_name(call)
            # Snapshot BEFORE the decision: approving an admin claim deletes the
            # role row outright, so afterwards there is nothing left to name.
            facts = _reg_facts(int(ref))
            ok = decide_registration(int(ref), status, decided_by=who)
        except Exception:
            logger.exception("registration callback failed: %s", call.data)
            bot.answer_callback_query(call.id, "Xatolik yuz berdi", show_alert=True)
            return
        if ok:
            action_log.record_bot(
                None, call.from_user.id, "identity",
                "identity.role_approved" if status == "approved"
                else "identity.role_rejected",
                actor_name=who, actor_role="admin",
                target_kind="profile",
                target_id=facts.get("profile") or ref,
                target_name=facts.get("name"),
                details=[("role", facts.get("role")), ("user", facts.get("user"))],
                changes=[("status", "pending", status)],
            )
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

    # The whole command is guarded so the admin always gets an answer: a raise
    # here only reaches the worker pool's exception handler (a log line), never
    # the chat, so it used to read as pure silence — no listing, no error.
    try:
        _pending_list(tid)
    except Exception as e:
        logger.exception("/pending failed for admin %s", tid)
        try:
            bot.send_message(tid, f"⚠️ /pending bajarilmadi.\nXato: {e}")
        except Exception:
            logger.exception("/pending: could not report the failure to admin %s", tid)


def _pending_list(tid: int):
    with SessionLocal() as db:
        rows = (
            db.query(TelegramUserRole, TelegramUser)
            .join(TelegramUser, TelegramUser.telegram_id == TelegramUserRole.telegram_id)
            .filter(TelegramUserRole.status == "pending")
            .order_by(TelegramUserRole.id)
            .all()
        )

        if not rows:
            _send_burst(tid, "✅ Kutilayotgan so'rovlar yo'q.")
            return

        _send_burst(tid, f"⏳ {len(rows)} ta kutilayotgan so'rov:")
        sent_n, last_err = 0, None
        for role_row, user in rows:
            # Everything per-row is guarded: one unrenderable request must not
            # swallow the six behind it (building the text used to sit outside
            # the try, so a single bad row killed the whole listing).
            try:
                body = _registration_text(role_row.full_name, role_row.role, user.phone,
                                          user.telegram_id, user.username)
                sent = _send_burst(tid, body, reply_markup=_registration_kb(role_row.id))
                # Track these too, so they also get edited with the outcome.
                db.add(RegistrationNotice(
                    target_telegram_id=user.telegram_id,
                    role_ref=role_row.id,
                    admin_telegram_id=tid,
                    message_id=sent.message_id,
                    text=body,
                ))
                db.commit()  # per row — a later failure can't orphan what already went out
                sent_n += 1
            except Exception as e:
                db.rollback()
                last_err = e
                logger.exception("Failed to send /pending row %s to admin %s", role_row.id, tid)

        # Never leave the admin staring at a count with nothing under it.
        if sent_n < len(rows):
            _send_burst(tid, f"⚠️ {sent_n}/{len(rows)} ta so'rov yuborildi. "
                             f"Qolganini admin panelda ko'ring.\nXato: {last_err}")


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
            dropped = db.query(BroadcastDraft).filter_by(
                admin_telegram_id=tid).delete()
            db.commit()
            if dropped:
                action_log.record_bot(db, tid, "comms", "broadcast.draft_discarded",
                                      actor_role="admin", target_kind="broadcast")
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
        count = len(d.message_ids or [])
        db.commit()
        # The send itself is an HTTP call the middleware already records; this
        # is the composer handing the draft over to the recipient picker.
        action_log.record_bot(
            db, tid, "comms", "broadcast.draft_composed",
            actor_role="admin", target_kind="broadcast", target_id=token,
            details=[("count", count)],
            changes=[("status", "awaiting_continue", "awaiting_recipients")],
        )

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
# YOPISH». Only closed days surface on /leaders, where a shift-2 day filed here
# replaces that (leader, date)'s sheet row.
# Capture state (mid-answer photos/reason) lives in the leader_task_captures
# table — NOT process memory: Passenger dispatches consecutive updates to
# different worker processes, exactly like the broadcast_drafts flow.

_LT_MESSAGES = {
    "uz": {
        "not_leader": "Siz lider emassiz.",
        "pick_profile": "Qaysi profil bilan davom etasiz?",
        "pick_cell": "🏭 {name}\n📅 {date}\n\nWhich cell are you reporting for?",
        "no_cells": "🏭 {name}\n\nNo cell is assigned to you, so there is no checklist to fill in today.\n\nAsk your supervisor — once a cell is assigned, continue with /tasks.",
        "cell_pick_hint": "\n\nA separate checklist is filled in for each cell.",
        "pick_cell": "🏭 {name}\n📅 {date}\n\nПо какой ячейке отчитываетесь?",
        "no_cells": "🏭 {name}\n\nЗа вами не закреплена ни одна ячейка, поэтому чек-листа на сегодня нет.\n\nОбратитесь к бригадиру — после закрепления ячейки продолжите через /tasks.",
        "cell_pick_hint": "\n\nПо каждой ячейке заполняется отдельный чек-лист.",
        "pick_cell": "🏭 {name}\n📅 {date}\n\nҚайси ячейка учун ҳисобот берасиз?",
        "no_cells": "🏭 {name}\n\nСизга ячейка бириктирилмаган, шунинг учун бугун тўлдирадиган чек-лист йўқ.\n\nБригадирингизга мурожаат қилинг — ячейка бириктирилгач, /tasks орқали давом этасиз.",
        "cell_pick_hint": "\n\nҲар бир ячейка учун алоҳида чек-лист тўлдирилади.",
        "pick_cell": "🏭 {name}\n📅 {date}\n\nQaysi yacheyka uchun hisobot berasiz?",
        "no_cells": "🏭 {name}\n\nSizga yacheyka biriktirilmagan, shuning uchun bugun to‘ldiradigan chek-list yo‘q.\n\nBrigadiringizga murojaat qiling — yacheyka biriktirilgach, /tasks orqali davom etasiz.",
        "cell_pick_hint": "\n\nHar bir yacheyka uchun alohida chek-list to‘ldiriladi.",
        "menu_title": "📋 {name}\n📅 {date}\n\nVazifani tanlang:",
        "menu_closed": "📋 {name}\n📅 {date}\n\n🔒 Kun yopilgan. Natija: {score}%",
        "btn_back": "⬅️ Orqaga",
        "btn_close_day": "⚠️ KUNNI YOPISH ⚠️",
        "farewell": "Vazifalaringizni istalgan vaqtda /tasks buyrug'i orqali bajarishingiz mumkin.",
        "did_you": "Siz bu vazifani bajardingizmi?\n\n📌 {task}",
        "btn_yes": "Ha ✅",
        "btn_no": "Yo'q ❌",
        "photos_counter": "📌 {task}\n\nIsbot uchun kamida {min} ta rasm yuboring.\n\n📸 {k}/{min} rasm qabul qilindi.",
        "photo_window": "\n\n🕒 Rasm {lo} — {hi} oralig'ida olingan bo'lishi kerak.",
        "photo_date_only": "\n\n📅 Rasmda vazifa bajarilgan KUN sanasi ko'rinib turishi kerak (soat shart emas).",
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
        "pt_score": "\n\n\U0001F3AF {x}/{y} ball",
        "pt_pending": " \u00b7 \u23f3 {n} ta tekshirilmoqda",
        "pt_menu_hint": "\n\nHar bir vazifa alohida topshiriladi.",
        "btn_close_task": "\U0001F512 Vazifani yopish",
        "close_task_confirm": "\U0001F4CC {task}\n\n\u26a0\ufe0f Vazifa yopilgandan keyin rasm qo'shib ham, o'zgartirib ham BO'LMAYDI. U darhol tekshiruvga yuboriladi.\n\nYopilsinmi?",
        "task_closed_ok": "\U0001F512 Vazifa yopildi va tekshiruvga yuborildi",
        "task_locked_alert": "Bu vazifa yopilgan \u2014 o'zgartirib bo'lmaydi.",
        "pt_draft_photos": "\U0001F4CC {task}\n\n\U0001F4F8 {k}/{min} rasm saqlandi.",
        "pt_draft_reason": "\U0001F4CC {task}\n\n\U0001F4DD Sabab: {reason}",
        "pt_draft_hint": "\n\nMa'lumot saqlandi. Yopmaguningizcha o'zgartirishingiz mumkin.",
        "pt_need_more": "\n\nYopish uchun kamida {min} ta rasm kerak.",
        "pt_auto": "\n\n\u23f0 {t} da avtomatik yopiladi.",
        "pt_closed_head": "\U0001F512 {task}\n\n",
        "pt_state_pending": "\u23f3 Tekshirilmoqda\u2026",
        "pt_state_passed": "\u2705 Qabul qilindi \u00b7 {w}/{w} ball",
        "pt_state_failed": "\u26a0\ufe0f Rad etildi \u00b7 0/{w} ball",
        "pt_state_undone": "\u274c Bajarilmadi \u00b7 0/{w} ball",
        "pt_state_expired": "\u23f1 Vaqt tugadi \u00b7 0/{w} ball",
        "camera_prompt": "📌 {task}\n\n📷 Bu vazifaning rasmi ILOVADA olinadi — quyidagi tugmani bosing.\n\n📸 {k}/{min} rasm olindi.",
        "camera_ready": "📌 {task}\n\n✅ {k}/{min} rasm olindi — vazifa bajarildi.\n\nRasmni almashtirish yoki qo'shish uchun tugmani bosing.",
        "camera_hours": "\n\n🕒 Tavsiya etilgan vaqt: {lo} — {hi}. Undan tashqarida olingan rasm «kech» deb belgilanadi.",
        "btn_camera": "📷 Kamerani ochish",
        "camera_only": "📷 Bu vazifaga rasm yuborib bo'lmaydi.\n\nRasm ilovada olinadi va vaqti avtomatik yoziladi — «📷 Kamerani ochish» tugmasini bosing.",
        "camera_reset_confirm": "📌 {task}\n\n🔄 Bu vazifaning barcha rasmlari va javobi o'chiriladi — qaytadan suratga olishingiz kerak bo'ladi.\n\nTasdiqlaysizmi?",
        "reset_toast": "🔄 Tozalandi",
        "pt_state_none": "❔ Javob berilmagan.",
        "adm_menu_hint": "\n\n👑 Admin: vazifani qayta ochish yoki tozalash uchun ustiga bosing.",
        "adm_locked_hint": "\n\n👑 Admin sifatida siz bu vazifani qayta ocha olasiz.",
        "btn_adm_reopen": "🔓 Qayta ochish (admin)",
        "btn_adm_wipe": "🗑 Tozalash (admin)",
        # ── kechikib topshirish ──────────────────────────────────────────
        "btn_late_file": "\U0001F4E4 Kechikib topshirish",
        "btn_late_resume": "\U0001F4E4 Davom ettirish",
        "btn_late_cam": "\U0001F4F7 Ilovada suratga olish",
        "btn_late_upload": "\U0001F5BC Mavjud rasmni yuborish",
        "btn_late_clear": "\U0001F5D1 Rasmlarni tozalash",
        "late_have": "\n\n\U0001F4F8 {k} ta rasm tayyor.",
        "late_send_now": "Rasmni shu yerga yuboring",
        "late_awaiting": "\n\n\U0001F5BC Rasmni shu yerga yuboring \u2014 kutyapman.",
        "late_cleared": "\U0001F5D1 Rasmlar o'chirildi",
        "late_need_reason": "Avval sababni yozing.",
        "late_roll_full": "Rasmlar soni chegaraga yetdi.",
        "late_warn": ("\u23F1 {task}\n\nBu vazifa vaqti {t} da tugagan.\n\n"
                      "\u26A0\uFE0F Kechikkani uchun ball AVTOMATIK berilmaydi.\n\n"
                      "Isbot rasmlarini yuborib, nega kechikkaningizni yozishingiz mumkin. "
                      "Rasmlaringiz va sababingizni avval brigadiringiz, keyin adminlar "
                      "ko'rib chiqadi. Sabab asosli deb topilsa — ball qaytariladi.\n\n"
                      "Davom etasizmi?"),
        "btn_late_go": "\U0001F4E4 Ha, topshiraman",
        "late_photos": ("\u23F1 {task}\n\nKechikkan isbot uchun rasm yuboring.\n\n"
                        "\U0001F4F8 {k} ta rasm qabul qilindi."),
        "btn_late_send": "\u27A1\uFE0F Sababni yozish",
        "late_ask_reason": ("\U0001F4DD Nega kechikdingiz?\n\n"
                            "Sababni yozib yuboring \u2014 uni brigadiringiz va adminlar o'qiydi."),
        "late_confirm": ("\u23F1 {task}\n\n\U0001F4F8 {k} ta rasm\n"
                         "\U0001F4DD Sabab: {reason}\n\nYuboraymi?"),
        "late_sent": ("\u2705 Kechikkan isbot yuborildi.\n\n"
                      "Brigadiringiz ko'rib chiqadi. Javobni shu yerda olasiz."),
        "late_need_photo": "Kamida bitta rasm yuboring.",
        "late_gone_alert": "Bu vazifa uchun endi topshirib bo'lmaydi.",
        "late_state_supervisor": "\n\n\u23F3 Kechikkan isbot brigadirda ko'rib chiqilmoqda.",
        "late_state_admin": "\n\n\u23F3 Kechikkan isbot adminlarga yuborildi.",
        "late_state_approved": "\n\n\u2705 Kechikkan isbot tasdiqlandi \u00B7 {w}/{w} ball",
        "late_state_rejected": "\n\n\u274C Kechikkan isbot rad etildi \u00B7 0/{w} ball",
        "lp_card_sup": ("\u23F1 KECHIKKAN ISBOT\n\n\U0001F464 {leader}\n\U0001F4CC {task}\n"
                        "\U0001F4C5 {date} \u00B7 muddat {t}\n\n\U0001F4DD Sabab:\n{reason}\n\n"
                        "Rad etsangiz \u2014 ball berilmaydi. Adminlarga yuborsangiz, "
                        "nega tasdiqlash kerakligini yozishingiz so'raladi."),
        "lp_card_adm": ("\u23F1 KECHIKKAN ISBOT \u00B7 brigadir yubordi\n\n\U0001F464 {leader}\n"
                        "\U0001F4CC {task}\n\U0001F4C5 {date} \u00B7 muddat {t}\n\n"
                        "\U0001F4DD Lider sababi:\n{reason}\n\n"
                        "\U0001F464 Brigadir ({by}) izohi:\n{note}\n\n"
                        "Tasdiqlasangiz \u2014 vazifa to'liq ball oladi."),
        "btn_lp_reject": "\u274C Rad etish",
        "btn_lp_uplift": "\u2B06\uFE0F Adminlarga yuborish",
        "btn_lp_approve": "\u2705 Tasdiqlash",
        "lp_ask_note": ("\U0001F4DD Nega bu ish tasdiqlanishi kerak?\n\n"
                        "Izohingizni yozing \u2014 adminlar shuni o'qib qaror qiladi."),
        "lp_done_rejected": "\u274C Rad etildi \u00B7 ball berilmadi",
        "lp_done_uplifted": "\u2B06\uFE0F Adminlarga yuborildi",
        "lp_done_approved": "\u2705 Tasdiqlandi \u00B7 ball berildi",
        "lp_gone": "Bu ariza allaqachon hal qilingan.",
        "lp_not_yours": "Bu ariza sizga tegishli emas.",
        "ad_card_sup": ("⚖️ AI QARORIGA NOROZILIK\n\n👤 {leader}\n📌 {task}\n📅 {date}\n\n"
                        "🤖 AI xulosasi:\n{verdict}\n\n📝 Lider izohi:\n{reason}\n\n"
                        "Rad etsangiz — AI qarori kuchida qoladi. Adminlarga yuborsangiz, "
                        "nega ball berilishi kerakligini yozishingiz so'raladi."),
        "btn_ad_reject": "❌ Rad etish",
        "btn_ad_uplift": "⬆️ Adminlarga yuborish",
        "ad_ask_note": ("📝 Nega bu vazifaga ball berilishi kerak?\n\n"
                        "Izohingizni yozing — adminlar lider izohi bilan birga shuni "
                        "o'qib qaror qiladi."),
        "ad_done_rejected": "❌ Norozilik rad etildi",
        "ad_done_uplifted": "⬆️ Adminlarga yuborildi",
        "ad_gone": "Bu norozilik allaqachon hal qilingan.",
        "ad_not_yours": "Bu norozilik sizga tegishli emas.",
        "adm_reopen_confirm": "📌 {task}\n\n🔓 Vazifa qayta ochiladi. Javob va rasmlar joyida qoladi, AI xulosasi esa o'chiriladi — vazifa qaytadan topshirilishi va qaytadan tekshirilishi kerak bo'ladi.\n\nTasdiqlaysizmi?",
        "adm_wipe_confirm": "📌 {task}\n\n🗑 Vazifa butunlay tozalanadi: javob, rasmlar va AI xulosasi o'chiriladi. Vazifa boshidan boshlanadi.\n\nTasdiqlaysizmi?",
        "adm_reopened_toast": "🔓 Vazifa qayta ochildi",
        "adm_wiped_toast": "🗑 Vazifa tozalandi",
        "adm_not_locked": "Bu vazifa yopilmagan — uni tahrirlash mumkin.",
        "adm_only_alert": "Bu amal faqat adminlar uchun.",
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
        "photo_window": "\n\n🕒 Расм {lo} — {hi} оралиғида олинган бўлиши керак.",
        "photo_date_only": "\n\n📅 Расмда вазифа бажарилган КУН санаси кўриниб туриши керак (соат шарт эмас).",
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
        "pt_score": "\n\n\U0001F3AF {x}/{y} балл",
        "pt_pending": " \u00b7 \u23f3 {n} та текширилмоқда",
        "pt_menu_hint": "\n\nҲар бир вазифа алоҳида топширилади.",
        "btn_close_task": "\U0001F512 Вазифани ёпиш",
        "close_task_confirm": "\U0001F4CC {task}\n\n\u26a0\ufe0f Вазифа ёпилгандан кейин расм қўшиб ҳам, ўзгартириб ҳам БЎЛМАЙДИ. У дарҳол текширувга юборилади.\n\nЁпилсинми?",
        "task_closed_ok": "\U0001F512 Вазифа ёпилди ва текширувга юборилди",
        "task_locked_alert": "Бу вазифа ёпилган \u2014 ўзгартириб бўлмайди.",
        "pt_draft_photos": "\U0001F4CC {task}\n\n\U0001F4F8 {k}/{min} расм сақланди.",
        "pt_draft_reason": "\U0001F4CC {task}\n\n\U0001F4DD Сабаб: {reason}",
        "pt_draft_hint": "\n\nМаълумот сақланди. Ёпмагунингизча ўзгартиришингиз мумкин.",
        "pt_need_more": "\n\nЁпиш учун камида {min} та расм керак.",
        "pt_auto": "\n\n\u23f0 {t} да автоматик ёпилади.",
        "pt_closed_head": "\U0001F512 {task}\n\n",
        "pt_state_pending": "\u23f3 Текширилмоқда\u2026",
        "pt_state_passed": "\u2705 Қабул қилинди \u00b7 {w}/{w} балл",
        "pt_state_failed": "\u26a0\ufe0f Рад этилди \u00b7 0/{w} балл",
        "pt_state_undone": "\u274c Бажарилмади \u00b7 0/{w} балл",
        "pt_state_expired": "\u23f1 Вақт тугади \u00b7 0/{w} балл",
        "camera_prompt": "📌 {task}\n\n📷 Бу вазифанинг расми ИЛОВАДА олинади — қуйидаги тугмани босинг.\n\n📸 {k}/{min} расм олинди.",
        "camera_ready": "📌 {task}\n\n✅ {k}/{min} расм олинди — вазифа бажарилди.\n\nРасмни алмаштириш ёки қўшиш учун тугмани босинг.",
        "camera_hours": "\n\n🕒 Тавсия этилган вақт: {lo} — {hi}. Ундан ташқарида олинган расм «кеч» деб белгиланади.",
        "btn_camera": "📷 Камерани очиш",
        "camera_only": "📷 Бу вазифага расм юбориб бўлмайди.\n\nРасм иловада олинади ва вақти автоматик ёзилади — «📷 Камерани очиш» тугмасини босинг.",
        "camera_reset_confirm": "📌 {task}\n\n🔄 Бу вазифанинг барча расмлари ва жавоби ўчирилади — қайтадан суратга олишингиз керак бўлади.\n\nТасдиқлайсизми?",
        "reset_toast": "🔄 Тозаланди",
        "pt_state_none": "❔ Жавоб берилмаган.",
        "adm_menu_hint": "\n\n👑 Админ: вазифани қайта очиш ёки тозалаш учун устига босинг.",
        "adm_locked_hint": "\n\n👑 Админ сифатида сиз бу вазифани қайта оча оласиз.",
        "btn_adm_reopen": "🔓 Қайта очиш (админ)",
        "btn_adm_wipe": "🗑 Тозалаш (админ)",
        "btn_late_file": "\U0001F4E4 Кечикиб топшириш",
        "btn_late_resume": "\U0001F4E4 Давом эттириш",
        "btn_late_cam": "\U0001F4F7 Иловада суратга олиш",
        "btn_late_upload": "\U0001F5BC Мавжуд расмни юбориш",
        "btn_late_clear": "\U0001F5D1 Расмларни тозалаш",
        "late_have": "\n\n\U0001F4F8 {k} та расм тайёр.",
        "late_send_now": "Расмни шу ерга юборинг",
        "late_awaiting": "\n\n\U0001F5BC Расмни шу ерга юборинг \u2014 кутяпман.",
        "late_cleared": "\U0001F5D1 Расмлар ўчирилди",
        "late_need_reason": "Аввал сабабни ёзинг.",
        "late_roll_full": "Расмлар сони чегарага етди.",
        "late_warn": ("\u23F1 {task}\n\nБу вазифа вақти {t} да тугаган.\n\n"
                      "\u26A0\uFE0F Кечиккани учун балл АВТОМАТИК берилмайди.\n\n"
                      "Исбот расмларини юбориб, нега кечикканингизни ёзишингиз мумкин. "
                      "Расмларингиз ва сабабингизни аввал бригадирингиз, кейин админлар "
                      "кўриб чиқади. Сабаб асосли деб топилса \u2014 балл қайтарилади.\n\n"
                      "Давом этасизми?"),
        "btn_late_go": "\U0001F4E4 Ҳа, топшираман",
        "late_photos": ("\u23F1 {task}\n\nКечиккан исбот учун расм юборинг.\n\n"
                        "\U0001F4F8 {k} та расм қабул қилинди."),
        "btn_late_send": "\u27A1\uFE0F Сабабни ёзиш",
        "late_ask_reason": ("\U0001F4DD Нега кечикдингиз?\n\n"
                            "Сабабни ёзиб юборинг \u2014 уни бригадирингиз ва админлар ўқийди."),
        "late_confirm": ("\u23F1 {task}\n\n\U0001F4F8 {k} та расм\n"
                         "\U0001F4DD Сабаб: {reason}\n\nЮборайми?"),
        "late_sent": ("\u2705 Кечиккан исбот юборилди.\n\n"
                      "Бригадирингиз кўриб чиқади. Жавобни шу ерда оласиз."),
        "late_need_photo": "Камида битта расм юборинг.",
        "late_gone_alert": "Бу вазифа учун энди топшириб бўлмайди.",
        "late_state_supervisor": "\n\n\u23F3 Кечиккан исбот бригадирда кўриб чиқилмоқда.",
        "late_state_admin": "\n\n\u23F3 Кечиккан исбот админларга юборилди.",
        "late_state_approved": "\n\n\u2705 Кечиккан исбот тасдиқланди \u00B7 {w}/{w} балл",
        "late_state_rejected": "\n\n\u274C Кечиккан исбот рад этилди \u00B7 0/{w} балл",
        "lp_card_sup": ("\u23F1 КЕЧИККАН ИСБОТ\n\n\U0001F464 {leader}\n\U0001F4CC {task}\n"
                        "\U0001F4C5 {date} \u00B7 муддат {t}\n\n\U0001F4DD Сабаб:\n{reason}\n\n"
                        "Рад этсангиз \u2014 балл берилмайди. Админларга юборсангиз, "
                        "нега тасдиқлаш кераклигини ёзишингиз сўралади."),
        "lp_card_adm": ("\u23F1 КЕЧИККАН ИСБОТ \u00B7 бригадир юборди\n\n\U0001F464 {leader}\n"
                        "\U0001F4CC {task}\n\U0001F4C5 {date} \u00B7 муддат {t}\n\n"
                        "\U0001F4DD Лидер сабаби:\n{reason}\n\n"
                        "\U0001F464 Бригадир ({by}) изоҳи:\n{note}\n\n"
                        "Тасдиқласангиз \u2014 вазифа тўлиқ балл олади."),
        "btn_lp_reject": "\u274C Рад этиш",
        "btn_lp_uplift": "\u2B06\uFE0F Админларга юбориш",
        "btn_lp_approve": "\u2705 Тасдиқлаш",
        "lp_ask_note": ("\U0001F4DD Нега бу иш тасдиқланиши керак?\n\n"
                        "Изоҳингизни ёзинг \u2014 админлар шуни ўқиб қарор қилади."),
        "lp_done_rejected": "\u274C Рад этилди \u00B7 балл берилмади",
        "lp_done_uplifted": "\u2B06\uFE0F Админларга юборилди",
        "lp_done_approved": "\u2705 Тасдиқланди \u00B7 балл берилди",
        "lp_gone": "Бу ариза аллақачон ҳал қилинган.",
        "lp_not_yours": "Бу ариза сизга тегишли эмас.",
        "ad_card_sup": ("⚖️ AI ҚАРОРИГА НОРОЗИЛИК\n\n👤 {leader}\n📌 {task}\n📅 {date}\n\n"
                        "🤖 AI хулосаси:\n{verdict}\n\n📝 Лидер изоҳи:\n{reason}\n\n"
                        "Рад этсангиз — AI қарори кучида қолади. Админларга юборсангиз, "
                        "нега балл берилиши кераклигини ёзишингиз сўралади."),
        "btn_ad_reject": "❌ Рад этиш",
        "btn_ad_uplift": "⬆️ Админларга юбориш",
        "ad_ask_note": ("📝 Нега бу вазифага балл берилиши керак?\n\n"
                        "Изоҳингизни ёзинг — админлар лидер изоҳи билан бирга шуни "
                        "ўқиб қарор қилади."),
        "ad_done_rejected": "❌ Норозилик рад этилди",
        "ad_done_uplifted": "⬆️ Админларга юборилди",
        "ad_gone": "Бу норозилик аллақачон ҳал қилинган.",
        "ad_not_yours": "Бу норозилик сизга тегишли эмас.",
        "adm_reopen_confirm": "📌 {task}\n\n🔓 Вазифа қайта очилади. Жавоб ва расмлар жойида қолади, AI хулосаси эса ўчирилади — вазифа қайтадан топширилиши ва қайтадан текширилиши керак бўлади.\n\nТасдиқлайсизми?",
        "adm_wipe_confirm": "📌 {task}\n\n🗑 Вазифа бутунлай тозаланади: жавоб, расмлар ва AI хулосаси ўчирилади. Вазифа бошидан бошланади.\n\nТасдиқлайсизми?",
        "adm_reopened_toast": "🔓 Вазифа қайта очилди",
        "adm_wiped_toast": "🗑 Вазифа тозаланди",
        "adm_not_locked": "Бу вазифа ёпилмаган — уни таҳрирлаш мумкин.",
        "adm_only_alert": "Бу амал фақат админлар учун.",
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
        "photo_window": "\n\n🕒 Фото должно быть снято между {lo} и {hi}.",
        "photo_date_only": "\n\n📅 На фото должна быть видна ДАТА дня выполнения (время не обязательно).",
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
        "pt_score": "\n\n\U0001F3AF {x}/{y} баллов",
        "pt_pending": " \u00b7 \u23f3 проверяется: {n}",
        "pt_menu_hint": "\n\nКаждая задача сдаётся отдельно.",
        "btn_close_task": "\U0001F512 Закрыть задачу",
        "close_task_confirm": "\U0001F4CC {task}\n\n\u26a0\ufe0f После закрытия добавить или изменить фото БУДЕТ НЕЛЬЗЯ. Задача сразу уйдёт на проверку.\n\nЗакрыть?",
        "task_closed_ok": "\U0001F512 Задача закрыта и отправлена на проверку",
        "task_locked_alert": "Задача закрыта \u2014 изменить нельзя.",
        "pt_draft_photos": "\U0001F4CC {task}\n\n\U0001F4F8 Сохранено {k}/{min} фото.",
        "pt_draft_reason": "\U0001F4CC {task}\n\n\U0001F4DD Причина: {reason}",
        "pt_draft_hint": "\n\nДанные сохранены. Пока не закроете \u2014 можно менять.",
        "pt_need_more": "\n\nДля закрытия нужно минимум {min} фото.",
        "pt_auto": "\n\n\u23f0 Автоматически закроется в {t}.",
        "pt_closed_head": "\U0001F512 {task}\n\n",
        "pt_state_pending": "\u23f3 Проверяется\u2026",
        "pt_state_passed": "\u2705 Принято \u00b7 {w}/{w} баллов",
        "pt_state_failed": "\u26a0\ufe0f Отклонено \u00b7 0/{w} баллов",
        "pt_state_undone": "\u274c Не выполнено \u00b7 0/{w} баллов",
        "pt_state_expired": "\u23f1 Время вышло \u00b7 0/{w} баллов",
        "camera_prompt": "📌 {task}\n\n📷 Фото для этой задачи снимается В ПРИЛОЖЕНИИ — нажмите кнопку ниже.\n\n📸 Снято {k}/{min} фото.",
        "camera_ready": "📌 {task}\n\n✅ Снято {k}/{min} фото — задача выполнена.\n\nЧтобы заменить или добавить фото, нажмите кнопку.",
        "camera_hours": "\n\n🕒 Рекомендуемое время: {lo} — {hi}. Снимок вне этого промежутка помечается как «поздний».",
        "btn_camera": "📷 Открыть камеру",
        "camera_only": "📷 Для этой задачи фото отправить нельзя.\n\nСнимок делается в приложении, и время записывается автоматически — нажмите «📷 Открыть камеру».",
        "camera_reset_confirm": "📌 {task}\n\n🔄 Все фото и ответ по этой задаче будут удалены — снимать придётся заново.\n\nПодтверждаете?",
        "reset_toast": "🔄 Сброшено",
        "pt_state_none": "❔ Ответ не дан.",
        "adm_menu_hint": "\n\n👑 Админ: нажмите на задачу, чтобы открыть её заново или очистить.",
        "adm_locked_hint": "\n\n👑 Как администратор вы можете открыть эту задачу заново.",
        "btn_adm_reopen": "🔓 Открыть заново (админ)",
        "btn_adm_wipe": "🗑 Очистить (админ)",
        "btn_late_file": "\U0001F4E4 Сдать с опозданием",
        "btn_late_resume": "\U0001F4E4 Продолжить",
        "btn_late_cam": "\U0001F4F7 Снять в приложении",
        "btn_late_upload": "\U0001F5BC Прислать готовое фото",
        "btn_late_clear": "\U0001F5D1 Очистить фото",
        "late_have": "\n\n\U0001F4F8 Готово фото: {k}.",
        "late_send_now": "Пришлите фото сюда",
        "late_awaiting": "\n\n\U0001F5BC Пришлите фото сюда \u2014 жду.",
        "late_cleared": "\U0001F5D1 Фото удалены",
        "late_need_reason": "Сначала напишите причину.",
        "late_roll_full": "Достигнут предел числа фото.",
        "late_warn": ("\u23F1 {task}\n\nВремя этой задачи истекло в {t}.\n\n"
                      "\u26A0\uFE0F За опоздание балл АВТОМАТИЧЕСКИ не начисляется.\n\n"
                      "Вы можете прислать фото-подтверждение и написать, почему опоздали. "
                      "Ваши фото и причину сначала посмотрит бригадир, затем администраторы. "
                      "Если причина будет признана уважительной \u2014 балл вернут.\n\n"
                      "Продолжить?"),
        "btn_late_go": "\U0001F4E4 Да, сдать",
        "late_photos": ("\u23F1 {task}\n\nПришлите фото для позднего подтверждения.\n\n"
                        "\U0001F4F8 Принято фото: {k}."),
        "btn_late_send": "\u27A1\uFE0F Написать причину",
        "late_ask_reason": ("\U0001F4DD Почему вы опоздали?\n\n"
                            "Напишите причину \u2014 её прочитают бригадир и администраторы."),
        "late_confirm": ("\u23F1 {task}\n\n\U0001F4F8 Фото: {k}\n"
                         "\U0001F4DD Причина: {reason}\n\nОтправить?"),
        "late_sent": ("\u2705 Позднее подтверждение отправлено.\n\n"
                      "Бригадир его рассмотрит. Ответ придёт сюда."),
        "late_need_photo": "Пришлите хотя бы одно фото.",
        "late_gone_alert": "По этой задаче сдать уже нельзя.",
        "late_state_supervisor": "\n\n\u23F3 Позднее подтверждение на рассмотрении у бригадира.",
        "late_state_admin": "\n\n\u23F3 Позднее подтверждение передано администраторам.",
        "late_state_approved": "\n\n\u2705 Позднее подтверждение принято \u00B7 {w}/{w} баллов",
        "late_state_rejected": "\n\n\u274C Позднее подтверждение отклонено \u00B7 0/{w} баллов",
        "lp_card_sup": ("\u23F1 ПОЗДНЕЕ ПОДТВЕРЖДЕНИЕ\n\n\U0001F464 {leader}\n\U0001F4CC {task}\n"
                        "\U0001F4C5 {date} \u00B7 срок {t}\n\n\U0001F4DD Причина:\n{reason}\n\n"
                        "Если отклоните \u2014 балл не начислят. Если передадите админам, "
                        "нужно будет написать, почему это стоит принять."),
        "lp_card_adm": ("\u23F1 ПОЗДНЕЕ ПОДТВЕРЖДЕНИЕ \u00B7 передал бригадир\n\n\U0001F464 {leader}\n"
                        "\U0001F4CC {task}\n\U0001F4C5 {date} \u00B7 срок {t}\n\n"
                        "\U0001F4DD Причина лидера:\n{reason}\n\n"
                        "\U0001F464 Комментарий бригадира ({by}):\n{note}\n\n"
                        "Если примете \u2014 задача получит полный балл."),
        "btn_lp_reject": "\u274C Отклонить",
        "btn_lp_uplift": "\u2B06\uFE0F Передать администраторам",
        "btn_lp_approve": "\u2705 Принять",
        "lp_ask_note": ("\U0001F4DD Почему эту работу стоит принять?\n\n"
                        "Напишите комментарий \u2014 администраторы решают по нему."),
        "lp_done_rejected": "\u274C Отклонено \u00B7 балл не начислен",
        "lp_done_uplifted": "\u2B06\uFE0F Передано администраторам",
        "lp_done_approved": "\u2705 Принято \u00B7 балл начислен",
        "lp_gone": "Эта заявка уже рассмотрена.",
        "lp_not_yours": "Эта заявка не для вас.",
        "ad_card_sup": ("⚖️ ВОЗРАЖЕНИЕ НА РЕШЕНИЕ ИИ\n\n👤 {leader}\n📌 {task}\n📅 {date}\n\n"
                        "🤖 Заключение ИИ:\n{verdict}\n\n📝 Комментарий лидера:\n{reason}\n\n"
                        "Если отклоните — решение ИИ останется в силе. Если передадите "
                        "администраторам, нужно будет объяснить, почему балл должен быть начислен."),
        "btn_ad_reject": "❌ Отклонить",
        "btn_ad_uplift": "⬆️ Передать администраторам",
        "ad_ask_note": ("📝 Почему за эту задачу нужно начислить балл?\n\n"
                        "Напишите свой комментарий — администраторы прочитают его "
                        "вместе с комментарием лидера и примут решение."),
        "ad_done_rejected": "❌ Возражение отклонено",
        "ad_done_uplifted": "⬆️ Передано администраторам",
        "ad_gone": "Это возражение уже рассмотрено.",
        "ad_not_yours": "Это возражение не для вас.",
        "adm_reopen_confirm": "📌 {task}\n\n🔓 Задача будет открыта заново. Ответ и фото останутся, но заключение ИИ удалится — задачу нужно будет сдать и проверить ещё раз.\n\nПодтверждаете?",
        "adm_wipe_confirm": "📌 {task}\n\n🗑 Задача будет полностью очищена: ответ, фото и заключение ИИ удаляются. Задача начнётся с нуля.\n\nПодтверждаете?",
        "adm_reopened_toast": "🔓 Задача открыта заново",
        "adm_wiped_toast": "🗑 Задача очищена",
        "adm_not_locked": "Эта задача не закрыта — её можно редактировать.",
        "adm_only_alert": "Действие доступно только администраторам.",
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
        "photo_window": "\n\n🕒 The photo must be taken between {lo} and {hi}.",
        "photo_date_only": "\n\n📅 The photo must show the DATE of the day it was done (the time is not required).",
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
        "pt_score": "\n\n\U0001F3AF {x}/{y} points",
        "pt_pending": " \u00b7 \u23f3 {n} being checked",
        "pt_menu_hint": "\n\nEach task is submitted on its own.",
        "btn_close_task": "\U0001F512 Close the task",
        "close_task_confirm": "\U0001F4CC {task}\n\n\u26a0\ufe0f Once closed you CANNOT add or change a photo. It goes straight to review.\n\nClose it?",
        "task_closed_ok": "\U0001F512 Task closed and sent for review",
        "task_locked_alert": "This task is closed \u2014 it cannot be changed.",
        "pt_draft_photos": "\U0001F4CC {task}\n\n\U0001F4F8 {k}/{min} photo(s) saved.",
        "pt_draft_reason": "\U0001F4CC {task}\n\n\U0001F4DD Reason: {reason}",
        "pt_draft_hint": "\n\nSaved. You can change it until you close it.",
        "pt_need_more": "\n\nAt least {min} photo(s) are needed before closing.",
        "pt_auto": "\n\n\u23f0 Closes automatically at {t}.",
        "pt_closed_head": "\U0001F512 {task}\n\n",
        "pt_state_pending": "\u23f3 Being checked\u2026",
        "pt_state_passed": "\u2705 Accepted \u00b7 {w}/{w} points",
        "pt_state_failed": "\u26a0\ufe0f Rejected \u00b7 0/{w} points",
        "pt_state_undone": "\u274c Not done \u00b7 0/{w} points",
        "pt_state_expired": "\u23f1 Time ran out \u00b7 0/{w} points",
        "camera_prompt": "📌 {task}\n\n📷 This task's photo is taken IN THE APP — tap the button below.\n\n📸 {k}/{min} photos taken.",
        "camera_ready": "📌 {task}\n\n✅ {k}/{min} photos taken — task done.\n\nTap the button to replace or add a photo.",
        "camera_hours": "\n\n🕒 Expected hours: {lo} — {hi}. A shot taken outside them is marked «late».",
        "btn_camera": "📷 Open the camera",
        "camera_only": "📷 You cannot send a photo for this task.\n\nThe shot is taken in the app and its time is recorded automatically — tap «📷 Open the camera».",
        "camera_reset_confirm": "📌 {task}\n\n🔄 Every photo and the answer for this task will be deleted — you'll have to shoot them again.\n\nConfirm?",
        "reset_toast": "🔄 Reset",
        "pt_state_none": "❔ No answer was given.",
        "adm_menu_hint": "\n\n👑 Admin: tap a task to reopen or clear it.",
        "adm_locked_hint": "\n\n👑 As an admin you can reopen this task.",
        "btn_adm_reopen": "🔓 Reopen (admin)",
        "btn_adm_wipe": "🗑 Clear (admin)",
        "btn_late_file": "\U0001F4E4 Submit late",
        "btn_late_resume": "\U0001F4E4 Continue",
        "btn_late_cam": "\U0001F4F7 Take it in the app",
        "btn_late_upload": "\U0001F5BC Send an existing photo",
        "btn_late_clear": "\U0001F5D1 Clear the photos",
        "late_have": "\n\n\U0001F4F8 {k} photo(s) ready.",
        "late_send_now": "Send the photo here",
        "late_awaiting": "\n\n\U0001F5BC Send the photo here \u2014 waiting for it.",
        "late_cleared": "\U0001F5D1 Photos removed",
        "late_need_reason": "Write the reason first.",
        "late_roll_full": "The photo limit is reached.",
        "late_warn": ("\u23F1 {task}\n\nThis task's time ran out at {t}.\n\n"
                      "\u26A0\uFE0F No point is awarded AUTOMATICALLY for a late submission.\n\n"
                      "You can still send proof photos and write why you were late. "
                      "Your photos and your reason go first to your brigadir, then to the "
                      "admins. If the reason is accepted, the point is given back.\n\n"
                      "Continue?"),
        "btn_late_go": "\U0001F4E4 Yes, submit",
        "late_photos": ("\u23F1 {task}\n\nSend the photos for your late proof.\n\n"
                        "\U0001F4F8 {k} photo(s) received."),
        "btn_late_send": "\u27A1\uFE0F Write the reason",
        "late_ask_reason": ("\U0001F4DD Why were you late?\n\n"
                            "Write the reason \u2014 your brigadir and the admins will read it."),
        "late_confirm": ("\u23F1 {task}\n\n\U0001F4F8 {k} photo(s)\n"
                         "\U0001F4DD Reason: {reason}\n\nSend it?"),
        "late_sent": ("\u2705 Late proof sent.\n\n"
                      "Your brigadir will review it. The answer arrives here."),
        "late_need_photo": "Send at least one photo.",
        "late_gone_alert": "This task can no longer be submitted.",
        "late_state_supervisor": "\n\n\u23F3 Late proof is with your brigadir.",
        "late_state_admin": "\n\n\u23F3 Late proof was passed to the admins.",
        "late_state_approved": "\n\n\u2705 Late proof accepted \u00B7 {w}/{w} points",
        "late_state_rejected": "\n\n\u274C Late proof rejected \u00B7 0/{w} points",
        "lp_card_sup": ("\u23F1 LATE PROOF\n\n\U0001F464 {leader}\n\U0001F4CC {task}\n"
                        "\U0001F4C5 {date} \u00B7 due {t}\n\n\U0001F4DD Reason:\n{reason}\n\n"
                        "Reject and no point is given. Pass it to the admins and you will be "
                        "asked why it should be accepted."),
        "lp_card_adm": ("\u23F1 LATE PROOF \u00B7 passed up by the brigadir\n\n\U0001F464 {leader}\n"
                        "\U0001F4CC {task}\n\U0001F4C5 {date} \u00B7 due {t}\n\n"
                        "\U0001F4DD Leader's reason:\n{reason}\n\n"
                        "\U0001F464 Brigadir ({by}) says:\n{note}\n\n"
                        "Approve and the task gets its full weight."),
        "btn_lp_reject": "\u274C Reject",
        "btn_lp_uplift": "\u2B06\uFE0F Pass to the admins",
        "btn_lp_approve": "\u2705 Approve",
        "lp_ask_note": ("\U0001F4DD Why should this work be accepted?\n\n"
                        "Write your comment \u2014 the admins decide on it."),
        "lp_done_rejected": "\u274C Rejected \u00B7 no point given",
        "lp_done_uplifted": "\u2B06\uFE0F Passed to the admins",
        "lp_done_approved": "\u2705 Approved \u00B7 point given",
        "lp_gone": "This request has already been decided.",
        "lp_not_yours": "This request is not yours to decide.",
        "ad_card_sup": ("⚖️ OBJECTION TO AN AI RULING\n\n👤 {leader}\n📌 {task}\n📅 {date}\n\n"
                        "🤖 AI verdict:\n{verdict}\n\n📝 The leader's note:\n{reason}\n\n"
                        "Refuse it and the AI ruling stands. Pass it to the admins and "
                        "you will be asked to write why the task should be pointed."),
        "btn_ad_reject": "❌ Refuse",
        "btn_ad_uplift": "⬆️ Pass to the admins",
        "ad_ask_note": ("📝 Why should this task be pointed?\n\n"
                        "Write your comment — the admins read it beside the leader's "
                        "and decide."),
        "ad_done_rejected": "❌ Objection refused",
        "ad_done_uplifted": "⬆️ Passed to the admins",
        "ad_gone": "This objection has already been settled.",
        "ad_not_yours": "This objection is not yours to decide.",
        "adm_reopen_confirm": "📌 {task}\n\n🔓 The task will be reopened. The answer and its photos stay, but the AI verdict is dropped — the task has to be submitted and reviewed again.\n\nConfirm?",
        "adm_wipe_confirm": "📌 {task}\n\n🗑 The task will be cleared completely: the answer, the photos and the AI verdict are deleted. It starts from scratch.\n\nConfirm?",
        "adm_reopened_toast": "🔓 Task reopened",
        "adm_wiped_toast": "🗑 Task cleared",
        "adm_not_locked": "This task isn't closed — it can still be edited.",
        "adm_only_alert": "Admins only.",
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


def _lt_ref(pid: int, cid: int | None) -> str:
    """The `pid` SEGMENT of an `lt:` callback — "192", or "192c108" per cell.

    The cell rides INSIDE the segment that already carries the profile id, so
    no callback grows a field and no handler's `parts[…]` indexing moves: there
    are forty emitters and one parser, and re-indexing the emitters is how a
    button silently starts meaning something else. The longest shape this makes
    (`lt:tcconf:192c108:13`) is 21 bytes against Telegram's 64-byte cap.
    """
    return f"{pid}c{cid}" if cid else str(pid)


def _lt_who(seg: str) -> tuple[int, int | None]:
    """The inverse of `_lt_ref` — (profile id, cell id or None).

    A segment with no "c" is a pre-switch button, or a unit that files one
    checklist a day: both mean "the cell-less day", which is what None selects.
    """
    s = str(seg or "")
    pid, _, cell = s.partition("c")
    return int(pid), (int(cell) if cell else None)


def _lt_day(db, pid: int, date: str, cid: int | None = None) -> LeaderTaskDay | None:
    """This leader's checklist day — for ONE cell on a per-cell unit.

    `cell_id` must be matched with `IS NULL` and not `== None`: on a unit that
    files per cell, a leader holds several days for one date and an equality
    test against NULL matches nothing, so the pre-switch day would come back as
    "not started" and the leader would file a second one.
    """
    q = db.query(LeaderTaskDay).filter_by(leader_id=pid, date=date)
    q = q.filter(LeaderTaskDay.cell_id == cid) if cid \
        else q.filter(LeaderTaskDay.cell_id.is_(None))
    return q.first()


def _lt_counter_text(lang: str, entry: dict | None, task: str, need: int, k: int) -> str:
    """The "k/N photos" prompt, plus the hours the photo must carry.

    The window is stated because it is ENFORCED: the AI reviewer flags a proof
    whose clock falls outside it, and a leader flagged for a rule nobody told
    them is the complaint that creates. Appended rather than folded into
    `photos_counter` so the two send sites keep one format call each.

    The converse holds too, which is why `date_check` is read here: a task
    exempted from the date question has no enforced hours, and printing them
    anyway would make the bot demand something no verdict measures — leaders
    reshooting proofs to satisfy a rule that is not applied.

    `time_check` False is the middle case and gets its OWN line rather than
    silence: the hours are not a rule there, but the DAY still is, and the day is
    read off whatever the proof shows — so what the leader needs to be told is
    "make sure the date is visible", not a window nothing measures.
    """
    text = _lt(lang, "photos_counter").format(task=task, min=need, k=k)
    win = (entry or {}).get("window")
    if (entry or {}).get("date_check", True):
        if (entry or {}).get("time_check", True):
            if win:
                text += _lt(lang, "photo_window").format(lo=win[0], hi=win[1])
        else:
            text += _lt(lang, "photo_date_only")
    return text


def _lt_camera_text(lang: str, entry: dict | None, task: str, need: int, k: int) -> str:
    """The camera task's prompt — the message the leader comes back to.

    Two states, not one: below `need` it asks for shots, at or above it says the
    task is DONE. That second sentence is what makes the flow finishable without
    a Save button — the leader has to be able to read, in the chat they started
    from, that nothing further is expected of them.

    The hours are printed as a RECOMMENDATION, never as a gate: a shot taken
    outside them is accepted and marked late (the page says so before the
    shutter, too). Printing them as a rule would be a lie about what happens,
    and printing nothing would let a leader shoot at 21:00 believing it counted.
    They are omitted entirely where the chain does not judge hours at all —
    same rule as `_lt_counter_text`.
    """
    key = "camera_ready" if k >= need else "camera_prompt"
    text = _lt(lang, key).format(task=task, min=need, k=k)
    win = (entry or {}).get("window")
    if (win and (entry or {}).get("date_check", True)
            and (entry or {}).get("time_check", True)):
        text += _lt(lang, "camera_hours").format(lo=win[0], hi=win[1])
    return text


def _lt_camera_kb(lang: str, pid: int, task_id: int,
                  can_reset: bool = False, cid: int | None = None) -> types.InlineKeyboardMarkup:
    """The ONE way into a camera task: a web_app button, a reset, and a way back.

    Deliberately no «send photos» affordance anywhere near it — the whole point
    of the mode is that no file the leader produced is accepted, so the keyboard
    must not offer a second door that looks like it might work.

    «Qayta topshirish» appears only once there is something to reset (a shot on
    the roll, or an answer already recorded). A destructive button on an empty
    task is a dead control, and this one is the leader's ONLY way out of a roll
    they want to start over: the app can retake a required slot and drop an
    extra, but nothing there empties a task, so a leader who shot the wrong
    thing for a done task had no route back except an admin. It confirms first
    (`lt:crst`) because it deletes evidence.
    """
    url = (f"{settings.webapp_url.rstrip('/')}/proof/camera"
           f"?leader={pid}&task={task_id}")
    kb = types.InlineKeyboardMarkup(row_width=1)
    kb.add(types.InlineKeyboardButton(_lt(lang, "btn_camera"),
                                      web_app=types.WebAppInfo(url=url)))
    if can_reset:
        kb.add(_lt_btn(_lt(lang, "btn_reset"), f"lt:crst:{_lt_ref(pid, cid)}:{task_id}"))
    kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"))
    return kb


def _lt_camera_state(db, prof, task_id: int, cid: int | None = None) -> tuple[int, bool]:
    """(shots on the roll, an answer already recorded) for one camera task —
    the two facts the prompt needs: the counter, and whether a reset has
    anything to delete."""
    day = leader_proof.open_day(db, prof, create=False, cell_id=cid)
    if not day:
        return 0, False
    k = len(leader_proof.roll(db, day.id, task_id))
    answered = bool(db.query(LeaderTaskEntry)
                    .filter_by(day_id=day.id, task_id=task_id).first())
    return k, answered


def _lt_roll_count(db, prof, task_id: int, cid: int | None = None) -> int:
    return _lt_camera_state(db, prof, task_id, cid)[0]


def _lt_open_camera(db, tid: int, pid: int, lang: str, chat_id: int,
                    msg_id: int | None, task_id: int, entry: dict, prof,
                    cid: int | None = None) -> None:
    """Show (or re-show) a camera task's prompt and mark this account as being
    on it.

    The capture row carries no media here — it exists so a photo sent to the
    CHAT can be answered with "not this way, tap the button" instead of being
    silently ignored, and so the API can find this message to re-draw its
    counter when a shot lands. Same table as the upload flow on purpose: one
    account is on one task at a time, whichever mode that task uses.
    """
    need = int(entry.get("min_media") or 1)
    k, answered = _lt_camera_state(db, prof, task_id, cid)
    db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
    db.add(LeaderTaskCapture(
        telegram_id=tid, stage="camera", leader_id=pid, task_id=task_id,
        chat_id=chat_id, message_id=msg_id, min_media=need, media=[],
        cell_id=cid,
    ))
    db.commit()
    text = _lt_camera_text(lang, entry, config_name(entry, lang), need, k)
    kb = _lt_camera_kb(lang, pid, task_id, can_reset=bool(k or answered), cid=cid)
    if msg_id:
        try:
            bot.edit_message_text(text, chat_id=chat_id, message_id=msg_id,
                                  reply_markup=kb)
            return
        except Exception:
            pass
    sent = bot.send_message(chat_id, text, reply_markup=kb)
    cap = db.query(LeaderTaskCapture).filter_by(telegram_id=tid).first()
    if cap:
        cap.message_id = sent.message_id
        db.commit()


def _lt_pt_close_btn(lang: str, pid: int, task_id: int, ready: bool,
                     cid: int | None = None):
    """The submit button — offered ONLY when the task is finished.

    Not offered-and-disabled: Telegram has no disabled button, so an unusable
    one is a button that silently does nothing, and the leader is left deciding
    whether they pressed it wrong or the bot is broken. Absent means "not yet",
    and the line above it says what is still missing.
    """
    return _lt_btn(_lt(lang, "btn_close_task"), f"lt:tclose:{_lt_ref(pid, cid)}:{task_id}") if ready else None


def _lt_pt_task_view(db, tid: int, pid: int, lang: str, chat_id: int,
                     msg_id: int | None, task_id: int, entry_cfg: dict,
                     prof, day, shift: int | None, cid: int | None = None) -> None:
    """One task's own screen: draft, or locked.

    This is where per-task submission lives for the leader — the menu only
    lists tasks, and everything they do to one happens here. The buttons tell
    the shapes apart: a DRAFT offers the way to add or redo its proof plus the
    close button once it is complete; a LOCKED task offers nothing but the way
    back, because for the leader there is nothing left that can be done to it.

    It is also the ADMIN's screen for a locked task, in either mode — which is
    why the lock test is `locked()` and not the entry's own `closed_at`: on a
    unit that closes whole DAYS the entry never carries one, and on a per-task
    unit the day's own lock lands the moment the last task closes. Both mean
    the same sentence to the reader, and both are what an admin reopens.
    """
    entry = (db.query(LeaderTaskEntry)
             .filter_by(day_id=day.id, task_id=task_id).first()) if day else None
    name = config_name(entry_cfg, lang)
    need = int(entry_cfg.get("min_media") or 0)
    weight = int(entry_cfg.get("weight") or 0)
    kb = types.InlineKeyboardMarkup(row_width=1)

    # ── past the deadline, the LATE door is the only door ────────────────────
    # Checked before the lock, because a task can be past its deadline and not
    # locked: `autoclose_due` only walks days that EXIST, and a leader who
    # filed nothing all day has no day row at all. That is the commonest way
    # into this screen and it used to fall through to the ordinary camera —
    # which then produced an out-of-window proof the AI rejects, i.e. exactly
    # the 0 this feature exists to give the leader a way out of.
    #
    # It REPLACES the ordinary flow rather than sitting beside it. Filing
    # normally after the hour has gone is not a better outcome the leader is
    # being denied: the photo is out of window, the verdict is `date_mismatch`,
    # and the task scores 0 with nobody to appeal to.
    if not leader_close.locked(entry, day) and leader_late_proof.eligible(
            db, day=day, task_id=task_id, cfg_entry=entry_cfg, shift=shift,
            per_task=leader_tasks_per_task(db, prof)):
        _lt_late_open(db, tid, pid, lang, chat_id, msg_id, task_id,
                      entry_cfg, shift, day, cid=cid)
        return

    # `locked()` rather than the entry's own lock, because this screen is also
    # where an admin lands on a CLOSED DAY — in day mode the entry never carries
    # a `closed_at` of its own, and the two locks mean the same thing to the
    # reader: nothing more can be done to this task.
    if leader_close.locked(entry, day):
        text = _lt(lang, "pt_closed_head").format(task=name)
        if entry is None:
            # The day shut with this task unanswered: there is no submission to
            # describe, only the lock the day put on it.
            text += _lt(lang, "pt_state_none")
        else:
            rev = leader_ai.verdicts_for(db, day).get(task_id)
            has_media = bool(db.query(LeaderTaskMedia).filter_by(entry_id=entry.id).first())
            state = leader_close.task_state(entry, rev, has_media, day)
            # `rejected` is the AI's verdict and reads as one; the two
            # not-done states read as themselves — a leader who chose «Yo'q»
            # and one the clock caught are not in the same position.
            key = {"pending": "pt_state_pending", "passed": "pt_state_passed",
                   "rejected": "pt_state_failed", "expired": "pt_state_expired",
                   "notdone": "pt_state_undone"}.get(state, "pt_state_undone")
            text += _lt(lang, key).format(w=weight)
            # The AI's own words, when it has any — the leader is entitled to read
            # the reason a task they cannot change any more was rejected.
            if rev is not None and getattr(rev, f"reason_{lang}", None):
                text += "\n\n" + getattr(rev, f"reason_{lang}")[:400]
            elif not entry.done and entry.reason:
                text += "\n\n" + entry.reason[:400]
        # ── the late door ────────────────────────────────────────────────
        # A task whose hour has gone by is over for scoring and NOT over for
        # the leader: they may still show the work and say why it is late. The
        # two shapes are mutually exclusive and both belong here, because this
        # is the screen a leader lands on when they open a task they missed —
        # either what became of a filing they already made, or the way to make
        # one.
        late = leader_late_proof.existing(db, day.id, task_id) if day else None
        if late is not None:
            key = {leader_late_proof.SUPERVISOR: "late_state_supervisor",
                   leader_late_proof.ADMIN: "late_state_admin",
                   leader_late_proof.APPROVED: "late_state_approved",
                   leader_late_proof.REJECTED: "late_state_rejected"}.get(late.status)
            if key:
                text += _lt(lang, key).format(w=weight)
        elif leader_late_proof.eligible(
                db, day=day, task_id=task_id, cfg_entry=entry_cfg, shift=shift,
                per_task=leader_tasks_per_task(db, prof)):
            # A draft roll OUTLIVES the screen that made it — that is what the
            # table is for. The capture row expires after 30 minutes and any
            # /tasks clears it, so a leader who shot three photos and came back
            # an hour later must be told the photos are still there rather than
            # be offered «file late» as if nothing existed.
            staged = leader_late_proof.draft_count(db, day.id if day else None,
                                                   task_id)
            if staged:
                text += _lt(lang, "late_have").format(k=staged)
            kb.add(_lt_btn(_lt(lang, "btn_late_resume" if staged else "btn_late_file"),
                           f"lt:late:{_lt_ref(pid, cid)}:{task_id}"))

        # The one way back out of a submission, and it belongs to admins alone.
        # Both buttons say so in their own label: this screen is the leader's
        # too, and a control they must never press is a control that has to
        # name whose it is.
        if tid in _admin_ids():
            text += _lt(lang, "adm_locked_hint")
            kb.add(_lt_btn(_lt(lang, "btn_adm_reopen"), f"lt:aop:{_lt_ref(pid, cid)}:{task_id}"))
            if entry is not None or _lt_roll_count(db, prof, task_id, cid):
                kb.add(_lt_btn(_lt(lang, "btn_adm_wipe"), f"lt:awp:{_lt_ref(pid, cid)}:{task_id}"))
        kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"))
        _lt_edit(chat_id, msg_id, text, kb)
        return

    # ── still a draft ───────────────────────────────────────────────────────
    k = _lt_roll_count(db, prof, task_id, cid) if entry_cfg.get("proof_kind") == "camera" \
        else (db.query(LeaderTaskMedia).filter_by(entry_id=entry.id).count()
              if entry is not None else 0)
    if entry is not None and not entry.done:
        text = _lt(lang, "pt_draft_reason").format(task=name, reason=entry.reason or "")
        ready = True
    else:
        text = _lt(lang, "pt_draft_photos").format(task=name, min=need or 1, k=k)
        ready = entry is not None and k >= max(1, need)
        if not ready:
            text += _lt(lang, "pt_need_more").format(min=max(1, need))
    text += _lt(lang, "pt_draft_hint")
    # A task an admin reopened is on the DAY's filing deadline now, not on the
    # one that already fired — this line has to name the hour that will
    # actually close it, or the leader reads a time that is already past.
    text += _lt(lang, "pt_auto").format(
        t=leader_close.task_deadline(
            {} if task_id in leader_close.reopened_tasks(day) else entry_cfg,
            shift))

    if entry_cfg.get("proof_kind") == "camera":
        url = (f"{settings.webapp_url.rstrip('/')}/proof/camera"
               f"?leader={pid}&task={task_id}")
        kb.add(types.InlineKeyboardButton(_lt(lang, "btn_camera"),
                                          web_app=types.WebAppInfo(url=url)))
        # The camera page refuses a closed task, and a chat photo for a camera
        # task is refused too — the capture row is what carries that refusal.
        db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
        db.add(LeaderTaskCapture(
            telegram_id=tid, stage="camera", leader_id=pid, task_id=task_id,
            chat_id=chat_id, message_id=msg_id, min_media=max(1, need), media=[],
        cell_id=cid,
        ))
        db.commit()
    else:
        kb.add(_lt_btn(_lt(lang, "btn_reset"), f"lt:rconf:{_lt_ref(pid, cid)}:{task_id}"))
    if btn := _lt_pt_close_btn(lang, pid, task_id, ready, cid):
        kb.add(btn)
    kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"))
    _lt_edit(chat_id, msg_id, text, kb)


def _lt_edit(chat_id: int, msg_id: int | None, text: str, kb) -> None:
    """Edit in place when we own a message, else send a fresh one.

    «Message is not modified» is a SUCCESS, not a failure: Telegram refuses an
    edit whose text and keyboard already match what is on screen, which means
    the screen is exactly what we wanted to draw. Treating it as a failure and
    falling through sent a second identical copy of the screen — which is what
    a leader saw when they pressed a button that re-renders the same state
    (reported from production, 2026-08-30: two identical late screens).
    """
    if msg_id:
        try:
            bot.edit_message_text(text, chat_id=chat_id, message_id=msg_id,
                                  reply_markup=kb)
            return
        except Exception as exc:
            if "not modified" in str(exc).lower():
                return
    bot.send_message(chat_id, text, reply_markup=kb)


def refresh_camera_prompt(db, leader_id: int, task_id: int,
                          cid: int | None = None) -> None:
    """Re-draw the waiting camera prompt after the app saved or dropped a shot.

    Called from the camera API (routers/leader_proof), which is why it takes a
    session rather than opening one. The leader's eyes are in the mini-app, but
    the message behind it is what they read the moment they close the camera —
    leaving it at «0/3» after three shots is the most confusing thing this flow
    could do. Every holder of the profile that has the prompt open is updated,
    because one profile may be held by several accounts.
    """
    caps = (db.query(LeaderTaskCapture)
            .filter_by(stage="camera", leader_id=leader_id, task_id=task_id,
                       cell_id=cid).all())
    if not caps:
        return
    prof = db.query(RoleProfile).filter_by(id=leader_id).first()
    if not prof:
        return
    entry = effective_leader_config(db, prof, _lt_shift(db, prof)).get(task_id)
    if not entry:
        return
    need = int(entry.get("min_media") or 1)
    k, answered = _lt_camera_state(db, prof, task_id, cid)
    shift = _lt_shift(db, prof)
    # On a per-task unit the message behind the camera is the TASK's screen, so
    # the «Vazifani yopish» button has to appear on it the moment the roll is
    # complete. Re-rendering the plain camera prompt instead would leave the
    # leader with a finished task and no way to submit it without going back to
    # the menu first — the one step this mode exists to remove.
    per_task = leader_tasks_per_task(db, prof)
    day = leader_proof.open_day(db, prof, create=False, cell_id=cid) if per_task else None
    for cap in caps:
        if not cap.message_id:
            continue
        lang = _get_lang(cap.telegram_id)
        try:
            if per_task and day is not None:
                _lt_pt_task_view(db, cap.telegram_id, leader_id, lang, cap.chat_id,
                                 cap.message_id, task_id, entry, prof, day, shift,
                                 cid)
                continue
            bot.edit_message_text(
                _lt_camera_text(lang, entry, config_name(entry, lang), need, k),
                chat_id=cap.chat_id, message_id=cap.message_id,
                reply_markup=_lt_camera_kb(lang, leader_id, task_id,
                                           can_reset=bool(k or answered),
                                           cid=cid))
        except Exception:
            pass  # the message was deleted, or nothing changed — neither matters


def leader_tasks_per_task(db, prof) -> bool:
    """Is this leader's unit on per-task submission? One lookup, one name, so
    every surface asks the question the same way."""
    return leader_tasks.per_task_close(db, prof.manager_id if prof else None)


def _lt_shift(db, prof) -> int:
    """The leader's shift (1 or 2) — their supervisor unit's shift. Drives the
    checklist day boundary; falls back to shift 1 (calendar day) when unset."""
    mgr = db.query(Manager).filter_by(id=prof.manager_id).first()
    return mgr.shift if (mgr and mgr.shift in (1, 2)) else 1


def _lt_entries(db, day: LeaderTaskDay | None) -> dict[int, LeaderTaskEntry]:
    if not day:
        return {}
    return {e.task_id: e for e in db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}


def _lt_autoclose(db, prof, shift: int) -> None:
    """Finalize this leader's expired open days on their way into the menu.

    The body moved to `leader_close.close_expired_days` on 2026-08-22, when the
    scheduler gained a sweep that does the same thing for a leader who never
    comes back (shift 2, whose window shuts at 09:00 long after the crew has
    gone home). Two spellings of "close a bygone day" would mean a leader's
    score depended on which door reached the day first — so there is one, and
    this is the door that runs while somebody is waiting on the menu.
    """
    if leader_close.close_expired_days(db, prof, shift):
        # Daemon thread: the leader is one line away from seeing their tasks.
        leader_ai.run_async(discover_first=False)


def _lt_menu(db, tid: int, pid: int, lang: str, chat_id: int, msg_id: int | None,
             cid: int | None = None):
    """Render the task list (or the closed-day view) — edit msg_id in place
    when given, else send a fresh message."""
    prof = db.query(RoleProfile).filter_by(id=pid).first()
    if not prof:
        bot.send_message(chat_id, _lt(lang, "expired"))
        return
    shift = _lt_shift(db, prof)
    date = effective_date(shift)
    promote_due(db, shift, date)  # apply staged config due at this boundary
    day = _lt_day(db, pid, date)
    entries = _lt_entries(db, day)
    cfg = effective_leader_config(db, prof, shift)

    kb = types.InlineKeyboardMarkup(row_width=1)
    if day and day.closed_at:
        # A closed day is dead for the leader — every row is a noop, and that
        # is the point. For an ADMIN the rows stay live: the way back into a
        # submission is through the task itself, and on a per-task unit the day
        # is closed precisely BECAUSE the tasks are, so a dead menu would put
        # every locked task out of reach of the one person allowed to reopen it.
        adm = tid in _admin_ids()
        text = _lt(lang, "menu_closed").format(
            name=prof.name, date=date,
            score=round(float(day.completion or 0)),
        )
        if adm:
            text += _lt(lang, "adm_menu_hint")
        for td_id, s in cfg.items():
            if not s["enabled"]:
                continue
            e = entries.get(td_id)
            mark = "✅ " if (e and e.done) else ("❌ " if e else "")
            kb.add(_lt_btn(f"{mark}{config_name(s, lang)}",
                           f"lt:task:{_lt_ref(pid, cid)}:{td_id}" if adm else f"lt:noop:{_lt_ref(pid, cid)}"))
        kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:back:{_lt_ref(pid, cid)}"))
    else:
        text = _lt(lang, "menu_title").format(name=prof.name, date=date)
        # Camera tasks say how far along their roll is, right in the menu. A
        # task collected in the app has a state the chat cannot otherwise show —
        # "two of three shot" looks exactly like "not started" — and that is the
        # one state a leader must not be able to walk away from unaware.
        cams = [t for t, c in cfg.items()
                if c["enabled"] and c.get("proof_kind") == "camera"]
        shot = leader_proof.counts(db, day.id if day else None, cams)
        per_task = leader_tasks_per_task(db, prof)
        if per_task:
            # The running score, and it is the only place the leader sees one
            # before the day is over. Pending tasks are in NEITHER number and
            # counted beside it: a verdict that has not arrived is not a zero,
            # and a score that fell while the day went well would teach them to
            # stop reading it.
            x, y, waiting = leader_close.score_line(db, day, cfg)
            text += _lt(lang, "pt_score").format(x=x, y=y)
            if waiting:
                text += _lt(lang, "pt_pending").format(n=waiting)
            text += _lt(lang, "pt_menu_hint")
            revs = leader_ai.verdicts_for(db, day) if day else {}
            with_media = {r[0] for r in db.query(LeaderTaskMedia.entry_id)
                          .filter(LeaderTaskMedia.entry_id.in_(
                              [e.id for e in entries.values()] or [0]))
                          .distinct().all()}
        for td_id, s in cfg.items():
            if not s["enabled"]:
                continue
            e = entries.get(td_id)
            if per_task:
                st = leader_close.task_state(
                    e, revs.get(td_id), bool(e and e.id in with_media), day)
                # One mark per MEANING. ⚠️ used to carry all three bad
                # endings at once, so a leader who simply ran out of time read
                # the same warning as one whose proof was refused — and the
                # triangle made every unfinished row look like an accusation
                # (the operator's report, 2026-08-27). ⚠️ now means exactly one
                # thing: somebody looked at your proof and refused it.
                mark = {"open": "", "draft": "✏️ ", "pending": "⏳ ",
                        "passed": "✅ ", "notdone": "✖️ ",
                        "expired": "⏱ ", "rejected": "⚠️ "}.get(st, "")
                if st == "open" and s.get("proof_kind") == "camera":
                    k = shot.get(td_id, 0)
                    mark = f"📷 {k}/{s['min_media']} · " if k else "📷 "
                # An untouched task whose hour has gone reads as ⏱, not as one
                # still waiting to be done. Both were "open" and both showed
                # 📷, so a leader scanning thirteen rows could not tell which
                # ones they had already lost — and the late door is behind
                # exactly those. Asked only for a row that is still open, so
                # the menu costs no extra query for anything already answered.
                if st == "open" and leader_late_proof.eligible(
                        db, day=day, task_id=td_id, cfg_entry=s, shift=shift,
                        per_task=True):
                    mark = "⏱ "
                label = f"{mark}{config_name(s, lang)}"
            elif e:
                label = f"{'✅ ' if e.done else '❌ '}{config_name(s, lang)}"
            elif s.get("proof_kind") == "camera":
                k = shot.get(td_id, 0)
                label = (f"📷 {k}/{s['min_media']} · {config_name(s, lang)}"
                         if k else f"📷 {config_name(s, lang)}")
            else:
                label = config_name(s, lang)
            kb.add(_lt_btn(label, f"lt:task:{_lt_ref(pid, cid)}:{td_id}"))
        kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:back:{_lt_ref(pid, cid)}"))
        # No «KUNNI YOPISH» in per-task mode: the day closes itself when the
        # last task is submitted, so a button for it would be a second, weaker
        # way to end a day that is already ending correctly.
        if not per_task:
            kb.add(_lt_btn(_lt(lang, "btn_close_day"), f"lt:close:{_lt_ref(pid, cid)}"))

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
                   reason: str | None, media: list[tuple[str, int]],
                   cid: int | None = None) -> bool:
    """Persist one task's answer. False when the day is already closed."""
    prof = db.query(RoleProfile).filter_by(id=pid).first()
    if not prof:
        return False
    shift = _lt_shift(db, prof)
    date = effective_date(shift)
    promote_due(db, shift, date)  # apply staged config due at this boundary
    day = _lt_day(db, pid, date, cid)
    if day and day.closed_at:
        return False
    if not day:
        day = LeaderTaskDay(leader_id=pid, manager_id=prof.manager_id, date=date,
                            cell_id=cid)
        db.add(day)
        db.flush()
    old = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=task_id).first()
    if leader_close.locked(old, day):
        return False          # submitted on a per-task unit — nothing may edit it
    if old:
        db.query(LeaderTaskMedia).filter_by(entry_id=old.id).delete()
        db.delete(old)
        db.flush()
    if not done:
        # «Yo'q» retires whatever the camera collected for this task: the answer
        # is now "not done", and a roll left behind would show up as progress on
        # a task recorded as failed the next time the menu counted it.
        leader_proof.clear_roll(db, day.id, task_id)
    entry = LeaderTaskEntry(day_id=day.id, task_id=task_id, done=done, reason=reason)
    db.add(entry)
    db.flush()
    for i, (fid, mid) in enumerate(media):
        db.add(LeaderTaskMedia(entry_id=entry.id, file_id=fid, message_id=mid, pos=i))
    db.commit()
    return True


def _lt_reset_task(db, day: LeaderTaskDay | None, task_id: int) -> None:
    """Empty ONE task — the bot's two «Qayta topshirish» buttons.

    A thin call into `leader_close.reset_task`, which is THE reset core: the
    admin panel empties a task through the same function, so «empty» means one
    thing wherever it is pressed.
    """
    leader_close.reset_task(db, day, task_id)


def _lt_log(db, tid: int, prof, date: str, action: str, **kw) -> None:
    """One action-register row for what a leader just did in the checklist bot.

    The checklist is the one place a leader changes the record from Telegram,
    and none of it passes an HTTP route the action-log middleware can see — so
    it records itself. The unit is named by ID alone: the menu never loads the
    brigadir's name, and an audit row must not buy one with an extra query on
    the path a leader is waiting on.

    Never raises. A closed day that failed to log is a gap in the register; a
    close that failed because of the register is a lost shift.
    """
    try:
        action_log.record_bot(db, tid, "leader_review", action,
                              actor_name=prof.name, actor_role="leader",
                              unit_id=prof.manager_id, day=date, **kw)
    except Exception:
        logger.debug("action log: checklist row failed (%s)", action, exc_info=True)


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
        try:
            # Per-task units have per-task deadlines, and a deadline that only
            # bites when a scheduler happens to run is not one. The timer job
            # does this too; whichever gets there first wins.
            leader_close.autoclose_due(db)
        except Exception:
            logger.exception("per-task auto-close failed")
            db.rollback()
        for p in profs:  # finalize any bygone open days before showing the menu
            _lt_autoclose(db, p, _lt_shift(db, p))
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
            pid, cid = _lt_who(parts[2])
        except (IndexError, ValueError):
            bot.answer_callback_query(call.id)
            return
        prof = profs.get(pid)
        if not prof:  # stale button / re-claimed profile
            bot.answer_callback_query(call.id, _lt(lang, "expired"), show_alert=True)
            return

        shift = _lt_shift(db, prof)
        date = effective_date(shift)
        # On a per-cell unit `cid` selects WHICH of this leader's checklists the
        # button belongs to; everywhere else it is None and this is the one
        # cell-less day the platform has always had.
        day = _lt_day(db, pid, date, cid)
        closed = bool(day and day.closed_at)
        cfg = effective_leader_config(db, prof, shift)

        def tname(tid_):
            entry = cfg.get(tid_)
            return config_name(entry, lang) if entry else f"T{tid_}"

        if action == "prof":
            _lt_clear(tid)
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        if action == "menu":
            _lt_clear(tid)
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        # ── filing a proof after the task's own deadline ─────────────────────
        # Four steps, and the eligibility rule is re-checked at the two that
        # WRITE something: a button lives in a chat for as long as the leader
        # leaves the message there, so «was this still allowed when it was
        # pressed» cannot be answered by the fact that it was offered.
        if action in ("late", "lgo", "lrsn", "lsend", "lclr", "lback"):
            try:
                task_id = int(parts[3])
            except (IndexError, ValueError):
                bot.answer_callback_query(call.id)
                return
            s_cfg = cfg.get(task_id) or {}
            per_task = leader_tasks_per_task(db, prof)
            live = leader_late_proof.eligible(
                db, day=day, task_id=task_id, cfg_entry=s_cfg,
                shift=shift, per_task=per_task)

            # «Orqaga» from the late screen retires the staging row. A dangling
            # `late_photos` capture would silently swallow any photo the leader
            # sent to the chat afterwards, for a filing they had walked away
            # from. The draft roll itself SURVIVES — it is a durable roll, and
            # coming back to the shots you already took is the whole reason it
            # is a table.
            if action == "lback":
                _lt_clear(tid)
                db.commit()
                bot.answer_callback_query(call.id)
                _lt_pt_task_view(db, tid, pid, lang, chat_id, msg_id, task_id,
                                 s_cfg, prof, day, shift)
                return

            if not live:
                bot.answer_callback_query(call.id, _lt(lang, "late_gone_alert"),
                                          show_alert=True)
                return

            # «late» opens the screen; «lgo» is the upload door, which on a
            # camera task means «send an existing photo» and on every other task
            # is simply the way forward. Both land on the same screen, because
            # the screen IS the staging area.
            if action in ("late", "lgo"):
                bot.answer_callback_query(
                    call.id, _lt(lang, "late_send_now") if action == "lgo" else None)
                _lt_late_open(db, tid, pid, lang, chat_id, msg_id, task_id,
                              s_cfg, shift, day, awaiting=(action == "lgo"))
                return

            if action == "lclr":
                leader_late_proof.clear_draft(db, day.id if day else None, task_id)
                db.commit()
                bot.answer_callback_query(call.id, _lt(lang, "late_cleared"))
                _lt_late_open(db, tid, pid, lang, chat_id, msg_id, task_id,
                              s_cfg, shift, day)
                return

            shots = leader_late_proof.draft_shots(db, day.id, task_id) if day else []
            if not shots:
                bot.answer_callback_query(call.id, _lt(lang, "late_need_photo"),
                                          show_alert=True)
                return

            if action == "lrsn":
                sent = bot.send_message(chat_id, _lt(lang, "late_ask_reason"))
                cap = _lt_capture(db, tid)
                if cap and cap.stage == "late_photos" and cap.task_id == task_id:
                    cap.stage = "late_reason"
                    cap.message_id = sent.message_id
                    cap.chat_id = chat_id
                else:
                    _lt_clear(tid)
                    db.add(LeaderTaskCapture(
                        telegram_id=tid, stage="late_reason", leader_id=pid,
                        task_id=task_id, chat_id=chat_id, cell_id=cid,
                        message_id=sent.message_id, min_media=1, media=[]))
                db.commit()
                bot.answer_callback_query(call.id)
                return

            # lsend — the write. Everything before this was a draft; this is the
            # moment it becomes a filing somebody must answer.
            #
            # The capture is BOUND to this task before its reason is used, and
            # that check is load-bearing: `LeaderTaskCapture` is keyed by
            # telegram_id, so one account has exactly one row and it belongs to
            # whatever the leader touched LAST — while this «Saqlash» button
            # stays in the chat forever. Without the binding a leader who wrote
            # a reason for task A, then went and answered task C, and then
            # scrolled back and pressed A's Save would file A's photos under
            # C's excuse. The reason is the entire basis on which the brigadir
            # and then an admin rule, so a filing decided on somebody else's
            # sentence is decided on nothing.
            cap = _lt_capture(db, tid, lock=True)
            if (not cap or cap.stage != "late_confirm"
                    or cap.leader_id != pid or cap.task_id != task_id):
                bot.answer_callback_query(call.id, _lt(lang, "late_need_reason"),
                                          show_alert=True)
                return
            reason = (cap.reason or "").strip()
            if not reason:
                bot.answer_callback_query(call.id, _lt(lang, "late_need_reason"),
                                          show_alert=True)
                return
            try:
                row = leader_late_proof.create(
                    db, day=day, task_id=task_id, prof=prof, shift=shift,
                    cfg_entry=s_cfg, reason=reason, actor_telegram=tid)
            except leader_late_proof.ShotError:
                bot.answer_callback_query(call.id, _lt(lang, "late_need_photo"),
                                          show_alert=True)
                return
            if cap:
                db.delete(cap)
            db.commit()
            _lp_send_to_supervisor(db, row)
            try:
                bot.edit_message_text(_lt(lang, "late_sent"), chat_id=chat_id,
                                      message_id=msg_id)
            except Exception:
                bot.send_message(chat_id, _lt(lang, "late_sent"))
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, None, cid)
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
            if closed and tid not in _admin_ids():
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            if task_id not in cfg or not cfg[task_id]["enabled"]:
                bot.answer_callback_query(call.id)
                _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
                return
            if closed:  # admin, guarded above → the locked-task screen
                bot.answer_callback_query(call.id)
                _lt_pt_task_view(db, tid, pid, lang, chat_id, msg_id, task_id,
                                 cfg[task_id], prof, day, shift)
                return
            entries = _lt_entries(db, day)
            bot.answer_callback_query(call.id)
            # A task past its deadline goes to its own screen FIRST, whatever
            # state it is in, because that screen is where the late door lives.
            # Without this an untouched task — no entry, no roll, which is the
            # commonest way a deadline gets missed — fell through to the Ha/Yo'q
            # question below and then to the ordinary camera, so the late door
            # was unreachable for exactly the leader it exists for (found in
            # production, 2026-08-30). The DECISION stays in `_lt_pt_task_view`;
            # this only stops the router from routing around it.
            if leader_late_proof.eligible(
                    db, day=day, task_id=task_id, cfg_entry=cfg[task_id],
                    shift=shift, per_task=leader_tasks_per_task(db, prof)):
                _lt_pt_task_view(db, tid, pid, lang, chat_id, msg_id, task_id,
                                 cfg[task_id], prof, day, shift)
                return
            # On a per-task unit every task has a screen of its own — draft or
            # submitted — and that screen is the only place work happens. It
            # takes precedence over both branches below: the reset confirm is
            # not a thing here (a draft is edited in place, a closed task is
            # not edited at all), and the Ha/Yo'q question only survives for a
            # task nobody has touched yet.
            if leader_tasks_per_task(db, prof) and (
                    task_id in entries
                    or (cfg[task_id].get("proof_kind") == "camera"
                        and _lt_roll_count(db, prof, task_id, cid))):
                _lt_pt_task_view(db, tid, pid, lang, chat_id, msg_id, task_id,
                                 cfg[task_id], prof, day, shift)
                return
            # Re-opening a camera task — answered or half-shot — lands on the
            # camera, which is also where the leader already is in their head.
            # Its «Qayta topshirish» lives on that prompt (`lt:crst`) rather
            # than here, so the reset sits beside the counter it empties.
            if cfg[task_id].get("proof_kind") == "camera" and (
                    task_id in entries or _lt_roll_count(db, prof, task_id, cid)):
                _lt_open_camera(db, tid, pid, lang, chat_id, msg_id, task_id,
                                cfg[task_id], prof)
                return
            if task_id in entries:
                # already answered → confirm reset-for-resubmission
                kb = types.InlineKeyboardMarkup()
                kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"),
                       _lt_btn(_lt(lang, "btn_reset"), f"lt:rconf:{_lt_ref(pid, cid)}:{task_id}"))
                try:
                    bot.edit_message_text(_lt(lang, "reset_confirm").format(task=tname(task_id)),
                                          chat_id=chat_id, message_id=msg_id, reply_markup=kb)
                except Exception:
                    pass
            else:
                kb = types.InlineKeyboardMarkup()
                kb.row(_lt_btn(_lt(lang, "btn_yes"), f"lt:yes:{_lt_ref(pid, cid)}:{task_id}"),
                       _lt_btn(_lt(lang, "btn_no"), f"lt:no:{_lt_ref(pid, cid)}:{task_id}"))
                kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"))
                try:
                    bot.edit_message_text(_lt(lang, "did_you").format(task=tname(task_id)),
                                          chat_id=chat_id, message_id=msg_id, reply_markup=kb)
                except Exception:
                    pass
            return

        if action == "tclose":
            # The confirm is not ceremony: this is the only irreversible thing a
            # leader can do in the bot, and the sentence on it is what makes the
            # difference between a submission and an accident.
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            e = _lt_entries(db, day).get(task_id)
            if leader_close.locked(e, day):
                bot.answer_callback_query(call.id, _lt(lang, "task_locked_alert"),
                                          show_alert=True)
                return
            kb = types.InlineKeyboardMarkup()
            kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:task:{_lt_ref(pid, cid)}:{task_id}"),
                   _lt_btn(_lt(lang, "btn_confirm"), f"lt:tcconf:{_lt_ref(pid, cid)}:{task_id}"))
            bot.answer_callback_query(call.id)
            _lt_edit(chat_id, msg_id,
                     _lt(lang, "close_task_confirm").format(task=config_name(cfg[task_id], lang)),
                     kb)
            return

        if action == "tcconf":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            e = _lt_entries(db, day).get(task_id)
            if e is None or leader_close.locked(e, day):
                bot.answer_callback_query(call.id, _lt(lang, "task_locked_alert"),
                                          show_alert=True)
                _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
                return
            leader_close.close_task(db, day=day, entry=e, cfg=cfg, actor=prof.name)
            _lt_log(db, tid, prof, date, "checklist.task_closed",
                    target_kind="task", target_id=task_id,
                    target_name=tname(task_id),
                    details=[("leader", prof.name)],
                    changes=[("status", "draft", "closed")])
            # The queue is worked by a daemon thread, exactly as the day close
            # does it: the leader is holding an open callback and a review
            # round-trip is seconds per photo.
            leader_ai.run_async(discover_first=False)
            _lt_clear(tid)
            bot.answer_callback_query(call.id, _lt(lang, "task_closed_ok"))
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        if action in ("aop", "awp", "aopok", "awpok"):
            # Reopening a submission, and emptying one. Admin-only, checked
            # HERE and not merely by hiding the buttons: a callback is a string
            # the leader's own client already holds once the screen has been
            # rendered for anyone, and «closing is final» is a rule, not a
            # layout. Deliberately NOT gated on `closed` like every other
            # action above — these two exist to act on a closed thing.
            task_id = int(parts[3])
            if tid not in _admin_ids():
                bot.answer_callback_query(call.id, _lt(lang, "adm_only_alert"),
                                          show_alert=True)
                return
            wipe = action in ("awp", "awpok")
            if action in ("aop", "awp"):
                # The confirm names which of the two it is: one keeps the
                # photos and one deletes them, and they sit next to each other.
                kb = types.InlineKeyboardMarkup()
                kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:task:{_lt_ref(pid, cid)}:{task_id}"),
                       _lt_btn(_lt(lang, "btn_confirm"),
                               f"lt:{'awpok' if wipe else 'aopok'}:{_lt_ref(pid, cid)}:{task_id}"))
                bot.answer_callback_query(call.id)
                _lt_edit(chat_id, msg_id,
                         _lt(lang, "adm_wipe_confirm" if wipe
                             else "adm_reopen_confirm").format(task=tname(task_id)),
                         kb)
                return
            e = _lt_entries(db, day).get(task_id)
            if not leader_close.locked(e, day):
                bot.answer_callback_query(call.id, _lt(lang, "adm_not_locked"),
                                          show_alert=True)
                _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
                return
            lifted = leader_close.reopen_task(db, day=day, task_id=task_id,
                                              entry=e, actor=prof.name)
            # Emptying is reopening PLUS the ordinary reset — the same
            # `_lt_reset_task` the leader's own «Qayta topshirish» runs, so
            # «empty» goes on meaning exactly one thing.
            if wipe:
                _lt_reset_task(db, day, task_id)
            _lt_log(db, tid, prof, date,
                    "checklist.task_reset" if wipe else "checklist.task_reopened",
                    target_kind="task", target_id=task_id,
                    target_name=tname(task_id),
                    details=[("leader", prof.name), ("by", "admin"),
                             ("day_reopened", bool(lifted["day"])),
                             ("verdict_dropped", bool(lifted["verdict"])),
                             ("disputes_cancelled", lifted["disputes"])],
                    changes=[("status", "closed", "empty" if wipe else "draft")])
            _lt_clear(tid)
            bot.answer_callback_query(
                call.id, _lt(lang, "adm_wiped_toast" if wipe
                             else "adm_reopened_toast"))
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        if action == "rconf":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            _lt_reset_task(db, day, task_id)
            if day:  # no day ⇒ nothing existed ⇒ nothing was emptied
                _lt_log(db, tid, prof, date, "checklist.task_reset",
                        target_kind="task", target_id=task_id,
                        target_name=tname(task_id))
            bot.answer_callback_query(call.id)
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        if action == "crst":  # camera task → confirm before emptying it
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            kb = types.InlineKeyboardMarkup()
            kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:task:{_lt_ref(pid, cid)}:{task_id}"),
                   _lt_btn(_lt(lang, "btn_reset"), f"lt:crok:{_lt_ref(pid, cid)}:{task_id}"))
            bot.answer_callback_query(call.id)
            try:
                bot.edit_message_text(
                    _lt(lang, "camera_reset_confirm").format(task=tname(task_id)),
                    chat_id=chat_id, message_id=msg_id, reply_markup=kb)
            except Exception:
                pass
            return

        if action == "crok":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            _lt_reset_task(db, day, task_id)
            if day:
                _lt_log(db, tid, prof, date, "checklist.task_reset",
                        target_kind="task", target_id=task_id,
                        target_name=tname(task_id),
                        details=[("proof_kind", "camera")])
            bot.answer_callback_query(call.id, _lt(lang, "reset_toast"))
            # Land back ON the emptied camera, not on the menu: a leader resets
            # a camera task in order to shoot it again, and the menu would make
            # them find the same task a second time to do it.
            tcfg = cfg.get(task_id)
            if tcfg and tcfg["enabled"]:
                _lt_open_camera(db, tid, pid, lang, chat_id, msg_id, task_id,
                                tcfg, prof)
            else:
                _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
            return

        if action == "yes":
            task_id = int(parts[3])
            if closed:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            need = cfg.get(task_id, {}).get("min_media", 1)
            if need <= 0:  # no proof required — save instantly
                if _lt_save_entry(db, pid, task_id, True, None, [], cid):
                    _lt_log(db, tid, prof, date, "checklist.task_answered",
                            target_kind="task", target_id=task_id,
                            target_name=tname(task_id),
                            details=[("status", "done"), ("photos", 0)])
                bot.answer_callback_query(call.id, _lt(lang, "saved_toast"))
                _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
                return
            if cfg[task_id].get("proof_kind") == "camera":
                bot.answer_callback_query(call.id)
                _lt_open_camera(db, tid, pid, lang, chat_id, msg_id, task_id,
                                cfg[task_id], prof)
                return
            db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
            db.add(LeaderTaskCapture(
                telegram_id=tid, stage="photos", leader_id=pid, task_id=task_id,
                chat_id=chat_id, message_id=msg_id, min_media=need, media=[],
                cell_id=cid,
            ))
            db.commit()
            kb = types.InlineKeyboardMarkup(row_width=1)
            kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{_lt_ref(pid, cid)}"))
            bot.answer_callback_query(call.id)
            try:
                bot.edit_message_text(
                    _lt_counter_text(lang, cfg.get(task_id), tname(task_id), need, 0),
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
                chat_id=chat_id, message_id=msg_id, cell_id=cid,
            ))
            db.commit()
            kb = types.InlineKeyboardMarkup(row_width=1)
            kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{_lt_ref(pid, cid)}"))
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
            # The answer's shape is read off the capture BEFORE it is deleted
            # below — the audit row is written after the save, by which time
            # this row is gone.
            if cap.stage == "photos":
                media = [(p[0], p[1]) for p in (cap.media or [])]
                if len(media) < cap.min_media:
                    bot.answer_callback_query(call.id)
                    return
                done, why, shots = True, None, len(media)
                ok = _lt_save_entry(db, pid, task_id, True, None, media, cid)
            elif cap.stage == "confirm_reason":
                done, why, shots = False, cap.reason or "", 0
                ok = _lt_save_entry(db, pid, task_id, False, cap.reason or "", [], cid)
            else:
                bot.answer_callback_query(call.id)
                return
            db.query(LeaderTaskCapture).filter_by(telegram_id=tid).delete()
            db.commit()
            if not ok:
                bot.answer_callback_query(call.id, _lt(lang, "day_closed_alert"), show_alert=True)
                return
            _lt_log(db, tid, prof, date, "checklist.task_answered",
                    target_kind="task", target_id=task_id,
                    target_name=tname(task_id),
                    details=[("status", "done" if done else "not_done"),
                             ("photos", shots)],
                    reason=why or None)
            bot.answer_callback_query(call.id, _lt(lang, "saved_toast"))
            # Per-task: saving is only half the job, so the leader lands back on
            # the task with the close button in front of them rather than on a
            # menu that looks finished.
            if leader_tasks_per_task(db, prof):
                _lt_pt_task_view(db, tid, pid, lang, chat_id, msg_id, task_id,
                                 cfg[task_id], prof, _lt_day(db, pid, date), shift)
                return
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
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
            kb.row(_lt_btn(_lt(lang, "btn_back"), f"lt:menu:{_lt_ref(pid, cid)}"),
                   _lt_btn(_lt(lang, "btn_confirm"), f"lt:cconf:{_lt_ref(pid, cid)}"))
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
            # The third door that closes a day, beside `maybe_close_day` and
            # `close_expired_days`. The late door shuts with the day, so a
            # draft still staged could never be submitted by anybody again.
            leader_late_proof.drop_drafts(db, day.id)
            day.closed_at = datetime.now(timezone.utc)
            day.completion = compute_completion(cfg, list(entries.values()))
            db.commit()
            # The single most consequential thing a leader does in Telegram:
            # the day is now the record, and nothing reopens it.
            _lt_log(db, tid, prof, date, "checklist.day_closed",
                    target_kind="day", target_id=day.id, target_name=prof.name,
                    details=[("leader", prof.name), ("shift", shift),
                             ("tasks", len(entries)),
                             ("score", round(float(day.completion or 0)))],
                    changes=[("status", "open", "closed")])
            # ── the bot's automatic review door ───────────────────────────────
            # PAUSED FOR SHIFT 2 (user, 2026-08-14). This is where a bot-filed
            # day used to become reviewable — there is no sheet Refresh behind
            # these proofs and nothing else in the system marks the submission —
            # and shift 2 is what files through the bot, so in practice this was
            # the whole of shift 2's AI review. `queue_report` now returns 0 for
            # a paused shift (`leader_ai.REVIEW_PAUSED_SHIFTS`), so the close
            # writes no queue rows and spends no quota; `n` is 0 and nothing
            # below fires. The call is left in place deliberately: un-pausing is
            # one tuple in leader_ai.py, not a hunt for the doors.
            #
            # THIS day is queued directly rather than through a full discovery
            # pass: `queue_report` matches one report (and honours the review
            # floor), where `discover()` walks every report ever filed. The
            # leader is holding an open callback, and the difference is a scan
            # of the corpus against a handful of inserts.
            #
            # Wrapped: an AI hiccup must never leave the day looking unclosed to
            # the person who just closed it. The 20-minute drain picks up
            # anything this misses.
            try:
                n = leader_ai.queue_report(db, day=day)
                if n:
                    # Same record the re-check modal writes, so the admin page
                    # shows this hand-off with a bar, an ETA and the detail
                    # view instead of a queue that silently grew. Named after
                    # the leader — «started by Aripova M.» is what a shift-2
                    # close looks like from the page.
                    leader_ai.note_auto_run(db, n, prof.name)
            except Exception:
                logger.exception("leader-tasks: could not queue day %s for AI review",
                                 day.id)
                db.rollback()
            # Daemon thread: the leader is waiting on this callback, and a
            # review round-trip is seconds per photo.
            leader_ai.run_async(discover_first=False)
            bot.answer_callback_query(call.id, _lt(lang, "closed_done").format(
                score=round(float(day.completion))))
            _lt_menu(db, tid, pid, lang, chat_id, msg_id, cid)
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
        k, need = len(cap.media), cap.min_media
        pid, task_id = cap.leader_id, cap.task_id
        cid = cap.cell_id
        chat, old_counter = cap.chat_id, cap.message_id
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        cfg = effective_leader_config(db, prof, _lt_shift(db, prof)) if prof else {}
        entry = cfg.get(task_id)
        tname = config_name(entry, lang) if entry else f"T{task_id}"
        kb = types.InlineKeyboardMarkup(row_width=1)
        if k >= need:
            kb.add(_lt_btn(_lt(lang, "btn_save"), f"lt:save:{_lt_ref(pid, cid)}:{task_id}"))
        kb.add(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{_lt_ref(pid, cid)}"))
        # The counter FOLLOWS the chat: delete the old counter message and send
        # a fresh one below the uploads — editing in place left the Save button
        # stranded above the photos. Album items are serialized by the row lock,
        # so each delete/send/update sees the previous one's message id.
        try:
            bot.delete_message(chat, old_counter)
        except Exception:
            pass
        try:
            sent = bot.send_message(
                chat, _lt_counter_text(lang, entry, tname, need, k), reply_markup=kb)
            cap.message_id = sent.message_id
        except Exception:
            logger.warning("Leader-task counter re-send failed", exc_info=True)
        db.commit()


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "photos",
                     content_types=["video", "document", "audio", "voice",
                                    "animation", "video_note", "sticker"])
def _lt_wrong_media(message: types.Message):
    bot.send_message(message.chat.id, _lt(_get_lang(message.from_user.id), "photos_only"))


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "camera",
                     content_types=["photo", "video", "document", "audio",
                                    "voice", "animation", "video_note", "sticker"])
def _lt_camera_no_upload(message: types.Message):
    """A camera task refuses every file, and SAYS SO.

    This is the load-bearing half of the whole feature: the reason it exists is
    that a photo the leader hands us can carry any timestamp they like, so there
    must be no path — not even a forgiving one "just this once" — from a file in
    the chat to a proof on the register. Silence would read as "sent, probably
    fine"; the refusal names the button that does work.
    """
    bot.send_message(message.chat.id,
                     _lt(_get_lang(message.from_user.id), "camera_only"))


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
        cid = cap.cell_id
        old_chat, old_mid = cap.chat_id, cap.message_id
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        cfg = effective_leader_config(db, prof) if prof else {}
        entry = cfg.get(task_id)
        tname = config_name(entry, lang) if entry else f"T{task_id}"
        # Per spec: the prompt is DELETED and a fresh save/reset message is sent
        # so it lands below the leader's answer.
        try:
            bot.delete_message(old_chat, old_mid)
        except Exception:
            pass
        kb = types.InlineKeyboardMarkup()
        kb.row(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{_lt_ref(pid, cid)}"),
               _lt_btn(_lt(lang, "btn_save"), f"lt:save:{_lt_ref(pid, cid)}:{task_id}"))
        sent = bot.send_message(
            message.chat.id,
            _lt(lang, "reason_confirm").format(task=tname, reason=text[:800]),
            reply_markup=kb)
        cap.stage = "confirm_reason"
        cap.reason = text[:800]
        cap.message_id = sent.message_id
        db.commit()


# ── Late proofs: filing after the task's own deadline ─────────────────────────
# The leader half of services/leader_late_proof.py. The task is already locked
# and already scores 0 — nothing here changes that. What it adds is the door the
# platform had no way to open: a leader who did the work and missed the hour can
# still show it and say why, and two people decide whether that is worth the
# point. The AI is never in the loop; it judges photographs, and this is a
# question about a person.

_LP_STAGES = ("late_photos", "late_reason", "late_confirm", "lp_note")


def _lp_media(db, row) -> list:
    return leader_late_proof.photos(db, row.id)


def _lp_kb(lang: str, row, stage: str):
    """The two buttons for one stage — and only ever the two that stage has.

    The supervisor cannot approve and the admin cannot uplift: the asymmetry is
    the whole design, so it is expressed by the keyboard rather than by a check
    that fires after somebody has already pressed something.
    """
    kb = types.InlineKeyboardMarkup(row_width=1)
    if stage == "sup":
        kb.row(_lt_btn(_lt(lang, "btn_lp_reject"), f"lp:sr:{row.id}"),
               _lt_btn(_lt(lang, "btn_lp_uplift"), f"lp:su:{row.id}"))
    else:
        kb.row(_lt_btn(_lt(lang, "btn_lp_reject"), f"lp:ar:{row.id}"),
               _lt_btn(_lt(lang, "btn_lp_approve"), f"lp:aa:{row.id}"))
    kb.add(types.InlineKeyboardButton(
        _lt(lang, "btn_open_panel") if _lt(lang, "btn_open_panel") != "btn_open_panel"
        else "\U0001F4CB /leaders",
        web_app=types.WebAppInfo(
            url=f"{settings.webapp_url.rstrip('/')}/leaders?tab=late")))
    return kb


def _lp_card(db, row, lang: str, stage: str) -> str:
    key = "lp_card_sup" if stage == "sup" else "lp_card_adm"
    return _lt(lang, key).format(
        leader=row.leader_name or "—",
        task=leader_late_proof.task_name(db, row, lang),
        date=row.date, t=row.deadline or "—",
        reason=(row.reason or "—")[:800],
        by=row.sup_by_name or "—",
        note=(row.sup_note or "—")[:800],
    )


def _lp_deliver(db, row, recipients: set[int], stage: str) -> None:
    """Send one late-proof card, with its photos, to a set of accounts.

    The photos travel WITH the card rather than behind a link: a brigadir
    deciding on a phone in a workshop is exactly the reader who will not open a
    dashboard first, and a decision made without looking at the proof is the one
    outcome this flow cannot afford.

    Every message sent is recorded as an `ApprovalNotice`, which is what lets
    the card be retired in everybody's chat the moment one person decides — an
    approve button that still works after the ruling is how one late proof gets
    decided twice.
    """
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    kind = f"leader_lateproof_{stage}"
    media = _lp_media(db, row)
    for rid in sorted(recipients):
        lang = _get_lang(rid)
        if media:
            try:
                bot.send_media_group(rid, [types.InputMediaPhoto(m.file_id)
                                           for m in media[:10]])
            except Exception:
                logger.warning("late-proof photos to %s failed", rid, exc_info=True)
        text = _lp_card(db, row, lang, stage)
        try:
            sent = bot.send_message(rid, text, reply_markup=_lp_kb(lang, row, stage))
        except Exception:
            logger.warning("late-proof card to %s failed", rid, exc_info=True)
            continue
        db.add(ApprovalNotice(kind=kind, ref=str(row.id), admin_telegram_id=rid,
                              message_id=sent.message_id, text=text))
    db.commit()


def _lp_retire(db, row, stage: str, outcome_key: str) -> None:
    """Strip the buttons off every copy of a card that has now been decided.

    Takes a MESSAGE KEY, not a rendered string: the card sits in several
    people's chats and each of them reads it in their own language, so a
    pre-rendered outcome would stamp the decider's language onto everybody
    else's copy. It is also why the outcome cannot be `row.status` — that is a
    storage word ("admin"), not a sentence anybody should be shown.
    """
    kind = f"leader_lateproof_{stage}"
    notes = (db.query(ApprovalNotice)
             .filter(ApprovalNotice.kind == kind,
                     ApprovalNotice.ref == str(row.id)).all())
    for n in notes:
        try:
            bot.edit_message_text(
                (n.text or "") + "\n\n" + _lt(_get_lang(n.admin_telegram_id), outcome_key),
                chat_id=n.admin_telegram_id,
                message_id=n.message_id, reply_markup=None)
        except Exception:
            pass
        db.delete(n)
    db.commit()


def _lp_supervisor_ids(db, row) -> set[int]:
    """Every account holding the unit's brigadir profile — the person, not a row."""
    from app.identity import profile_holders, profile_key
    if not row.manager_id:
        return set()
    try:
        return set(profile_holders(db, profile_key("supervisor", int(row.manager_id))))
    except Exception:
        return set()


def _lp_send_to_supervisor(db, row) -> None:
    ids = _lp_supervisor_ids(db, row)
    if not ids:
        # No claimed brigadir account — an ordinary state, not an error. The
        # decision still has to reach somebody, so it goes to the people who
        # can always make it; silently parking it would leave the leader
        # waiting on a card nobody was ever sent.
        #
        # It goes with the STAGE-1 keyboard, because that is the stage the row
        # is actually at. Sending admins the approve/reject pair here produced
        # buttons that answered «this is already decided» to the only people
        # who had been told about it, and left those cards live-looking
        # forever. Admins outrank stage 1 (`_lp_can_supervise`), so reject and
        # pass-up both work for them.
        _lp_deliver(db, row, set(_admin_ids()), "sup")
        return
    _lp_deliver(db, row, ids, "sup")


def _lp_send_to_admins(db, row) -> None:
    _lp_deliver(db, row, set(_admin_ids()), "adm")


def _lp_can_supervise(db, tid: int, row) -> bool:
    """Admins outrank the stage; the unit's own brigadir owns it."""
    return tid in _admin_ids() or tid in _lp_supervisor_ids(db, row)


def _lt_late_screen(db, lang: str, pid: int, task_id: int, cfg_entry: dict,
                    shift: int | None, k: int, awaiting: bool = False,
                    cid: int | None = None):
    """THE late screen — warning and photo counter in ONE evolving message.

    They were two renderers and that was wrong: the warning is what the leader
    reads before deciding, the counter is the same message once they have, and
    the camera's own nudge has to be able to redraw whichever is on screen. One
    function means it can.

    It stays a SCREEN rather than a line on the task view, because this is the
    moment the leader decides: it names the hour that passed, states plainly
    that no point comes automatically, and says who will read the reason. A
    warning folded into a button label is a warning nobody reads.

    A CAMERA task gets BOTH doors, side by side. The in-app camera is first —
    its clock is the server's, so it is the stronger evidence and the one a
    reviewer can trust — and «send an existing photo» sits beside it, which is
    what already ships and is what a leader with a photo already taken needs.
    """
    camera = (cfg_entry or {}).get("proof_kind") == "camera"
    text = _lt(lang, "late_warn").format(
        task=config_name(cfg_entry, lang),
        t=leader_close.task_deadline(cfg_entry, shift))
    if k:
        text += _lt(lang, "late_have").format(k=k)
    # The upload door has nothing to open — the chat is already listening, and
    # the capture was armed when this screen was drawn. So pressing it changes
    # the SCREEN: without that it re-rendered an identical message and read as
    # a dead button. The state is what says the bot is waiting for a file.
    if awaiting:
        text += _lt(lang, "late_awaiting")
    kb = types.InlineKeyboardMarkup(row_width=1)
    if camera:
        url = (f"{settings.webapp_url.rstrip('/')}/proof/camera"
               f"?leader={pid}&task={task_id}&late=1")
        kb.add(types.InlineKeyboardButton(_lt(lang, "btn_late_cam"),
                                          web_app=types.WebAppInfo(url=url)))
        kb.add(_lt_btn(_lt(lang, "btn_late_upload"), f"lt:lgo:{_lt_ref(pid, cid)}:{task_id}"))
    else:
        kb.add(_lt_btn(_lt(lang, "btn_late_go"), f"lt:lgo:{_lt_ref(pid, cid)}:{task_id}"))
    if k:
        kb.add(_lt_btn(_lt(lang, "btn_late_send"), f"lt:lrsn:{_lt_ref(pid, cid)}:{task_id}"))
        kb.add(_lt_btn(_lt(lang, "btn_late_clear"), f"lt:lclr:{_lt_ref(pid, cid)}:{task_id}"))
    kb.add(_lt_btn(_lt(lang, "btn_back"), f"lt:lback:{_lt_ref(pid, cid)}:{task_id}"))
    return text, kb


def _lt_late_open(db, tid: int, pid: int, lang: str, chat_id: int,
                  msg_id: int | None, task_id: int, cfg_entry: dict,
                  shift: int | None, day, awaiting: bool = False,
                  cid: int | None = None) -> None:
    """Show the late screen and arm the staging row that photos land in.

    The capture is created HERE rather than after a second tap, because a
    camera task's forward button is a `web_app` — Telegram opens it directly
    and there is no callback in between to arm anything. It carries the
    `late_photos` stage, which is what keeps the ordinary camera refusal
    (`_lt_camera_no_upload`, bound to stage «camera») entirely untouched while
    the chat-upload door on this screen stays open.
    """
    # The day row is created HERE and nowhere else in this flow. A leader who
    # filed nothing all day has none, and the draft roll, the filing and the
    # camera's own `open_day(create=False)` all need one — so it is materialised
    # at the moment the leader chooses to file late, exactly as the ordinary
    # flow materialises it on the first saved task. Never by a sweep: an
    # untouched day must not sprout a row just because a deadline passed.
    if day is None:
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        if prof is not None:
            day = leader_proof.open_day(db, prof, create=True, cell_id=cid)
            db.commit()
    k = leader_late_proof.draft_count(db, day.id if day else None, task_id)
    text, kb = _lt_late_screen(db, lang, pid, task_id, cfg_entry, shift, k,
                               awaiting=awaiting)
    cap = _lt_capture(db, tid)
    if not (cap and cap.stage == "late_photos"
            and cap.leader_id == pid and cap.task_id == task_id):
        _lt_clear(tid)
        db.add(LeaderTaskCapture(
            telegram_id=tid, stage="late_photos", leader_id=pid,
            task_id=task_id, chat_id=chat_id, message_id=msg_id,
            cell_id=cid, min_media=1, media=[]))
    else:
        cap.message_id = msg_id
        cap.chat_id = chat_id
    db.commit()
    _lt_edit(chat_id, msg_id, text, kb)


def refresh_late_screen(db, leader_id: int, task_id: int,
                        cid: int | None = None) -> None:
    """Re-draw the late screen after the mini-app saved or dropped a shot.

    The twin of `refresh_camera_prompt`, and deliberately NOT a widening of it:
    that one re-renders the ordinary task view, which for a LOCKED task takes
    the early-return locked branch and would paint the outcome screen over the
    late one the leader is working in.
    """
    caps = (db.query(LeaderTaskCapture)
            .filter_by(stage="late_photos", leader_id=leader_id,
                       task_id=task_id, cell_id=cid).all())
    if not caps:
        return
    prof = db.query(RoleProfile).filter_by(id=leader_id).first()
    if not prof:
        return
    shift = _lt_shift(db, prof)
    entry = effective_leader_config(db, prof, shift).get(task_id)
    if not entry:
        return
    day = leader_proof.open_day(db, prof, create=False, cell_id=cid)
    k = leader_late_proof.draft_count(db, day.id if day else None, task_id)
    for cap in caps:
        if not cap.message_id:
            continue
        lang = _get_lang(cap.telegram_id)
        text, kb = _lt_late_screen(db, lang, cap.leader_id, task_id, entry,
                                   shift, k, cid=cid)
        try:
            bot.edit_message_text(text, chat_id=cap.chat_id,
                                  message_id=cap.message_id, reply_markup=kb)
        except Exception:
            pass


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "late_photos",
                     content_types=["photo"])
def _lt_late_photo(message: types.Message):
    """A photo sent to the chat for a late filing — the upload door.

    It lands on the same DRAFT ROLL the in-app camera writes to, so the count
    on screen, the durability and the submit all read one store. It carries
    `source="upload"` and no `captured_at`: a file the leader chose has no
    instant this platform can vouch for, and inventing one is exactly what the
    camera exists to stop.

    This handler is bound to stage `late_photos`, which is why the ordinary
    camera's refusal (`_lt_camera_no_upload`, bound to stage «camera») needed
    no relaxing at all — it is untouched, and a camera task outside the late
    flow still accepts no file whatsoever.
    """
    tid = message.from_user.id
    lang = _get_lang(tid)
    with SessionLocal() as db:
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "late_photos":
            return
        pid, task_id = cap.leader_id, cap.task_id
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        if not prof:
            db.commit()
            return
        shift = _lt_shift(db, prof)
        cfg = effective_leader_config(db, prof, shift)
        s_cfg = cfg.get(task_id) or {}
        day = _lt_day(db, pid, effective_date(shift))
        # Re-checked on every shot, not just when the screen opened: the day can
        # close, or an admin can reopen the task, while the leader is mid-roll.
        if not leader_late_proof.eligible(
                db, day=day, task_id=task_id, cfg_entry=s_cfg, shift=shift,
                per_task=leader_tasks_per_task(db, prof)):
            db.delete(cap)
            db.commit()
            bot.send_message(message.chat.id, _lt(lang, "late_gone_alert"))
            return
        relayed = _lt_relay_photo(db, message)
        if not relayed:
            db.commit()
            bot.send_message(message.chat.id, _lt(lang, "relay_fail"))
            return
        try:
            leader_late_proof.save_shot(
                db, prof=prof, day=day, task_id=task_id,
                cap=leader_proof.max_slots(int(s_cfg.get("min_media") or 1)),
                data=None, captured_at=None, slot=None, skew_s=None,
                relay=None, source="upload", relayed=relayed)
        except leader_late_proof.ShotError as exc:
            db.commit()
            bot.send_message(message.chat.id,
                             _lt(lang, "late_roll_full") if str(exc) == "roll_full"
                             else _lt(lang, "relay_fail"))
            return
        k = leader_late_proof.draft_count(db, day.id, task_id)
        chat, old_mid = cap.chat_id, cap.message_id
        text, kb = _lt_late_screen(db, lang, pid, task_id, s_cfg, shift, k)
        # The screen FOLLOWS the chat: the old one is deleted and a fresh copy
        # sent below the uploads, so «Sababni yozish» is never stranded above
        # the photos it belongs to.
        try:
            bot.delete_message(chat, old_mid)
        except Exception:
            pass
        try:
            sent = bot.send_message(chat, text, reply_markup=kb)
            cap.message_id = sent.message_id
        except Exception:
            logger.warning("late screen re-send failed", exc_info=True)
        db.commit()


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "late_photos",
                     content_types=["video", "document", "audio", "voice",
                                    "animation", "video_note", "sticker"])
def _lt_late_wrong_media(message: types.Message):
    """A late filing takes photos, and says so when handed anything else.

    The twin of `_lt_wrong_media` for the ordinary photo stage — without it a
    leader who sent a video to a late screen got total silence, which reads as
    «accepted».
    """
    bot.send_message(message.chat.id, _lt(_get_lang(message.from_user.id), "photos_only"))


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "late_reason",
                     content_types=["text"])
def _lt_late_reason(message: types.Message):
    """The mandatory explanation. Nothing is filed until this exists."""
    tid = message.from_user.id
    lang = _get_lang(tid)
    text = (message.text or "").strip()
    with SessionLocal() as db:
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "late_reason":
            return
        if not text or text.startswith("/"):
            db.delete(cap)
            db.commit()
            bot.send_message(message.chat.id, _msg(lang, "unknown_command"))
            return
        pid, task_id = cap.leader_id, cap.task_id
        prof = db.query(RoleProfile).filter_by(id=pid).first()
        shift = _lt_shift(db, prof) if prof else None
        cfg = effective_leader_config(db, prof, shift) if prof else {}
        cid = cap.cell_id
        day = _lt_day(db, pid, effective_date(shift), cid) if prof else None
        k = leader_late_proof.draft_count(db, day.id if day else None, task_id)
        try:
            bot.delete_message(cap.chat_id, cap.message_id)
        except Exception:
            pass
        kb = types.InlineKeyboardMarkup()
        kb.row(_lt_btn(_lt(lang, "btn_discard"), f"lt:menu:{_lt_ref(pid, cid)}"),
               _lt_btn(_lt(lang, "btn_save"), f"lt:lsend:{_lt_ref(pid, cid)}:{task_id}"))
        sent = bot.send_message(
            message.chat.id,
            _lt(lang, "late_confirm").format(
                task=config_name(cfg.get(task_id) or {}, lang),
                k=k, reason=text[:800]),
            reply_markup=kb)
        cap.stage = "late_confirm"
        cap.reason = text[:800]
        cap.message_id = sent.message_id
        db.commit()


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "lp_note",
                     content_types=["text"])
def _lp_note(message: types.Message):
    """The brigadir's case for a late proof, on the way up to the admins.

    Required, and that is the point: an admin ruling on a reason they have no
    context for is a coin toss, and the one person who does have that context is
    exactly the one passing it up.

    The capture row is the ordinary `LeaderTaskCapture`; `task_id` carries the
    LATE PROOF's id here, not a task's. A transient text prompt does not earn a
    table of its own, and the stage name is what says which it is.
    """
    tid = message.from_user.id
    lang = _get_lang(tid)
    text = (message.text or "").strip()
    with SessionLocal() as db:
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "lp_note":
            return
        if not text or text.startswith("/"):
            db.delete(cap)
            db.commit()
            bot.send_message(message.chat.id, _msg(lang, "unknown_command"))
            return
        row = db.query(LeaderLateProof).filter_by(id=cap.task_id).first()
        db.delete(cap)
        if row is None or row.status != leader_late_proof.SUPERVISOR:
            db.commit()
            bot.send_message(message.chat.id, _lt(lang, "lp_gone"))
            return
        who = _display_name_for(db, tid)
        leader_late_proof.decide_supervisor(
            db, row, action="uplifted", note=text, actor_name=who,
            actor_telegram=tid)
        db.commit()
        _lp_retire(db, row, "sup", "lp_done_uplifted")
        _lp_send_to_admins(db, row)
        leader_late_proof.notify_decided(db, row, stage="supervisor")
        db.commit()
        bot.send_message(message.chat.id, _lt(lang, "lp_done_uplifted"))


def _display_name_for(db, tid: int) -> str:
    """The actor's display name for the audit trail — never a bare id."""
    try:
        u = db.query(TelegramUser).filter_by(telegram_id=tid).first()
        if u is not None:
            for attr in ("full_name", "name", "first_name", "username"):
                v = getattr(u, attr, None)
                if v:
                    return str(v)
    except Exception:
        pass
    return str(tid)


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("lp:"))
def _lp_callback(call: types.CallbackQuery):
    """The two rulings, from the card in the chat.

    Authority is checked HERE and not merely by which card somebody was sent: a
    callback payload is typeable, and the whole value of the flow is that the
    point can only come back through an admin.
    """
    tid = call.from_user.id
    lang = _get_lang(tid)
    parts = call.data.split(":")
    act = parts[1] if len(parts) > 1 else ""
    try:
        late_id = int(parts[2])
    except (IndexError, ValueError):
        bot.answer_callback_query(call.id)
        return

    with SessionLocal() as db:
        row = db.query(LeaderLateProof).filter_by(id=late_id).first()
        if row is None:
            bot.answer_callback_query(call.id, _lt(lang, "lp_gone"), show_alert=True)
            return

        # ── stage 1: the brigadir ────────────────────────────────────────────
        if act in ("sr", "su"):
            if row.status != leader_late_proof.SUPERVISOR:
                bot.answer_callback_query(call.id, _lt(lang, "lp_gone"), show_alert=True)
                return
            if not _lp_can_supervise(db, tid, row):
                bot.answer_callback_query(call.id, _lt(lang, "lp_not_yours"),
                                          show_alert=True)
                return
            if act == "su":
                # Uplift needs the case for it, so the ruling is not made until
                # the text arrives — the capture is the pause, not a draft.
                _lt_clear(tid)
                sent = bot.send_message(call.message.chat.id, _lt(lang, "lp_ask_note"))
                db.add(LeaderTaskCapture(
                    telegram_id=tid, stage="lp_note", leader_id=int(row.leader_id),
                    task_id=row.id, chat_id=call.message.chat.id,
                    message_id=sent.message_id, min_media=0, media=[]))
                db.commit()
                bot.answer_callback_query(call.id)
                return
            leader_late_proof.decide_supervisor(
                db, row, action="rejected", note=None,
                actor_name=_display_name_for(db, tid), actor_telegram=tid)
            db.commit()
            _lp_retire(db, row, "sup", "lp_done_rejected")
            leader_late_proof.notify_decided(db, row, stage="supervisor")
            db.commit()
            bot.answer_callback_query(call.id, _lt(lang, "lp_done_rejected"))
            return

        # ── stage 2: the admins ──────────────────────────────────────────────
        if act in ("aa", "ar"):
            if tid not in _admin_ids():
                bot.answer_callback_query(call.id, _lt(lang, "lp_not_yours"),
                                          show_alert=True)
                return
            if row.status != leader_late_proof.ADMIN:
                bot.answer_callback_query(call.id, _lt(lang, "lp_gone"), show_alert=True)
                return
            action = (leader_late_proof.APPROVED if act == "aa"
                      else leader_late_proof.REJECTED)
            leader_late_proof.decide_admin(
                db, row, action=action, note=None,
                actor_name=_display_name_for(db, tid), actor_telegram=tid)
            db.commit()
            key = "lp_done_approved" if act == "aa" else "lp_done_rejected"
            done = _lt(lang, key)
            _lp_retire(db, row, "adm", key)
            leader_late_proof.notify_decided(db, row, stage="admin")
            db.commit()
            if act == "aa":
                # The score moved, so the day's report says so — the same door
                # a re-review or an upheld dispute uses.
                leader_late_proof.rescore(db, row)
            bot.answer_callback_query(call.id, done)
            return

    bot.answer_callback_query(call.id)


# ── AI objections: stage 1, in the brigadir's own chat ────────────────────────
# The middle stage of services/leader_dispute.py. A leader who was refused by
# the machine files their account of the shift on their day report; it lands
# HERE, with the verdict beside it, because the person who can say whether that
# account is true is a brigadir standing in a workshop and not somebody who was
# going to open a dashboard. They refuse it, or they make the case for it and it
# goes up — the admin card is `approvals.send_leader_dispute_to_admins`, which
# has served that stage since before this chain existed and still does, so a
# card already sitting in an admin's chat goes on working.


def _ad_kb(lang: str, d):
    """The two buttons stage 1 has — and only those two.

    A brigadir cannot restore the weight and an admin cannot uplift: the
    asymmetry is the whole design, so it is expressed by the keyboard rather
    than by a check that fires after somebody has already pressed something.
    """
    kb = types.InlineKeyboardMarkup(row_width=1)
    kb.row(_lt_btn(_lt(lang, "btn_ad_reject"), f"ad:sr:{d.id}"),
           _lt_btn(_lt(lang, "btn_ad_uplift"), f"ad:su:{d.id}"))
    kb.add(types.InlineKeyboardButton(
        "\U0001F4CB /leaders",
        web_app=types.WebAppInfo(
            url=f"{settings.webapp_url.rstrip('/')}/leaders?tab=disputes")))
    return kb


def _ad_card(db, d, lang: str) -> str:
    """The objection as the brigadir reads it: the leader, the task, the AI's
    own words, and the leader's answer to them.

    The verdict travels WITH it. A brigadir asked «was the machine wrong» who
    has not been shown what the machine said will rule on the wording of the
    objection, which is how a correct rejection gets overturned and a wrong one
    survives.
    """
    from app.models import LeaderAiReview
    from app.services import leader_dispute

    rev = (db.query(LeaderAiReview).filter_by(id=d.review_id).first()
           if d.review_id else None) \
        or db.query(LeaderAiReview).filter_by(ref=d.ref).first()
    verdict = "—"
    if rev is not None:
        flags = ", ".join(rev.flags or []) or "—"
        prose = (getattr(rev, f"reason_{lang}", None) or rev.reason_ru
                 or rev.reason_uz or rev.reason_en or "").strip()
        verdict = f"[{flags}] {prose}".strip()[:600]
    return _lt(lang, "ad_card_sup").format(
        leader=d.leader_name or "—",
        task=leader_dispute.task_label(db, d),
        date=d.date, verdict=verdict,
        reason=(d.reason or "—")[:800],
    )


def _ad_supervisor_ids(db, d) -> set:
    """Every account holding the unit's brigadir profile — the person, not a row."""
    from app.identity import profile_holders, profile_key
    if not d.manager_id:
        return set()
    try:
        return set(profile_holders(db, profile_key("supervisor", int(d.manager_id))))
    except Exception:
        return set()


def _ad_send_to_supervisor(db, d) -> None:
    """Put a leader's objection in front of the brigadir who has to read it.

    With no claimed brigadir account it goes to the admins instead — an
    ordinary state, not an error — and it goes with the STAGE-1 keyboard,
    because that is the stage the row is actually at. Admins outrank stage 1
    (`_ad_can_supervise`), so both buttons work for them; sending them the
    approve/refuse pair here would produce buttons answering «already decided»
    to the only people who had been told about it.
    """
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    ids = _ad_supervisor_ids(db, d) or set(_admin_ids())
    for rid in sorted(ids):
        lang = _get_lang(rid)
        text = _ad_card(db, d, lang)
        try:
            sent = bot.send_message(rid, text, reply_markup=_ad_kb(lang, d))
        except Exception:
            logger.warning("dispute card to %s failed", rid, exc_info=True)
            continue
        db.add(ApprovalNotice(kind="leader_dispute_sup", ref=str(d.id),
                              admin_telegram_id=rid,
                              message_id=sent.message_id, text=text))
    db.commit()


def _ad_send_to_admins(db, d) -> None:
    """Stage 2 is the card that already existed. One admin card, not two."""
    from app.approvals import send_leader_dispute_to_admins
    send_leader_dispute_to_admins(db, d)


def _ad_retire(db, d, outcome_key: str) -> None:
    """Strip the buttons off every copy of a stage-1 card that is now decided.

    Takes a message KEY, never a rendered string: the card sits in several
    chats and each reader has their own language, so a pre-rendered outcome
    would stamp the decider's language onto everybody else's copy.
    """
    notes = (db.query(ApprovalNotice)
             .filter(ApprovalNotice.kind == "leader_dispute_sup",
                     ApprovalNotice.ref == str(d.id)).all())
    for n in notes:
        try:
            bot.edit_message_text(
                (n.text or "") + "\n\n" + _lt(_get_lang(n.admin_telegram_id), outcome_key),
                chat_id=n.admin_telegram_id,
                message_id=n.message_id, reply_markup=None)
        except Exception:
            pass
        db.delete(n)
    db.commit()


def _ad_can_supervise(db, tid: int, d) -> bool:
    """Admins outrank the stage; the unit's own brigadir owns it."""
    return tid in _admin_ids() or tid in _ad_supervisor_ids(db, d)


def _ad_log(db, d, tid: int, who: str, *, action: str, note: str | None,
            was: str) -> None:
    """Record a bot-side ruling in the action register.

    The web endpoints call `action_log.enrich`, which fills the row the
    middleware already opened for the request — but a Telegram tap goes through
    no HTTP route of ours, so without this a brigadir's ruling (which ENDS the
    objection) leaves no trace at all in the append-only register, while the
    same ruling made on the page is fully recorded. `record_bot` is the door for
    exactly that, and the late-proof twin uses it for the same reason.
    """
    try:
        action_log.record_bot(
            db, tid, "leader_review", "checklist.dispute_decided",
            actor_name=who, target_kind="dispute", target_id=d.id,
            target_name=d.leader_name, unit_id=d.manager_id, day=d.date,
            details=[("leader", d.leader_name), ("task", d.task_id),
                     ("stage", was), ("action", action)],
            reason=(note or d.reason or None),
        )
        db.commit()
    except Exception:
        logger.warning("dispute action-log failed", exc_info=True)


def _ad_settled(db, d, *, stage: str, uplifted: bool) -> None:
    """What a stage-1 ruling owes the outside world, and NONE of it fatal.

    The ruling is already committed by the time this runs. A Telegram outage
    while forwarding the card must not skip the leader's notification, and must
    not raise into the caller — re-pressing would then find the objection
    already settled and tell nobody at all, which is strictly worse than a
    missing message. Each side effect therefore stands on its own.
    """
    from app.services import leader_dispute
    try:
        _ad_retire(db, d, "ad_done_uplifted" if uplifted else "ad_done_rejected")
        if uplifted:
            _ad_send_to_admins(db, d)
    except Exception:
        logger.warning("dispute card retire/forward failed", exc_info=True)
    try:
        leader_dispute.notify_decided(db, d, stage=stage)
        db.commit()
    except Exception:
        logger.warning("dispute leader notice failed", exc_info=True)
    if not uplifted:
        # A refusal leaves the score where it already was, so nothing re-sends;
        # the day report still re-reads, which the leader's own notice points at.
        try:
            from app.routers.leaders import _report_after_ruling
            _report_after_ruling(db, d)
        except Exception:
            logger.warning("dispute rescore failed", exc_info=True)


@bot.message_handler(func=lambda m: _lt_stage(m.from_user.id) == "ad_note",
                     content_types=["text"])
def _ad_note(message: types.Message):
    """The brigadir's case for an objection, on the way up to the admins.

    Required, and that is the point: an admin ruling on an account of a shift
    they were not on is a coin toss, and the one person who was there is
    exactly the one passing it up.

    The capture row is the ordinary `LeaderTaskCapture`; `task_id` carries the
    DISPUTE's id here, not a task's. A transient text prompt does not earn a
    table of its own, and the stage name is what says which it is.
    """
    from app.models import LeaderAiDispute
    from app.services import leader_dispute

    tid = message.from_user.id
    lang = _get_lang(tid)
    text = (message.text or "").strip()
    with SessionLocal() as db:
        cap = _lt_capture(db, tid, lock=True)
        if not cap or cap.stage != "ad_note":
            return
        if not text or text.startswith("/"):
            db.delete(cap)
            db.commit()
            bot.send_message(message.chat.id, _msg(lang, "unknown_command"))
            return
        d = db.query(LeaderAiDispute).filter_by(id=cap.task_id).first()
        db.delete(cap)
        if d is None or d.status != leader_dispute.SUPERVISOR:
            db.commit()
            bot.send_message(message.chat.id, _lt(lang, "ad_gone"))
            return
        who = _display_name_for(db, tid)
        leader_dispute.decide_supervisor(
            db, d, action="uplifted", note=text,
            actor_name=who, actor_telegram=tid)
        db.commit()
        _ad_log(db, d, tid, who, action="uplifted", note=text,
                was=leader_dispute.SUPERVISOR)
        _ad_settled(db, d, stage="supervisor", uplifted=True)
        bot.send_message(message.chat.id, _lt(lang, "ad_done_uplifted"))


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("ad:"))
def _ad_callback(call: types.CallbackQuery):
    """Stage 1, from the card in the chat.

    Authority is checked HERE and not merely by which card somebody was sent: a
    callback payload is typeable, and the whole value of the chain is that the
    point can only come back through an admin.
    """
    from app.models import LeaderAiDispute
    from app.services import leader_dispute

    tid = call.from_user.id
    lang = _get_lang(tid)
    parts = call.data.split(":")
    act = parts[1] if len(parts) > 1 else ""
    try:
        d_id = int(parts[2])
    except (IndexError, ValueError):
        bot.answer_callback_query(call.id)
        return
    if act not in ("sr", "su"):
        bot.answer_callback_query(call.id)
        return

    with SessionLocal() as db:
        d = db.query(LeaderAiDispute).filter_by(id=d_id).first()
        if d is None or d.status != leader_dispute.SUPERVISOR:
            bot.answer_callback_query(call.id, _lt(lang, "ad_gone"), show_alert=True)
            return
        if not _ad_can_supervise(db, tid, d):
            bot.answer_callback_query(call.id, _lt(lang, "ad_not_yours"),
                                      show_alert=True)
            return
        if act == "su":
            # An uplift needs the case for it, so the ruling is not made until
            # the text arrives — the capture is the pause, not a draft.
            _lt_clear(tid)
            sent = bot.send_message(call.message.chat.id, _lt(lang, "ad_ask_note"))
            db.add(LeaderTaskCapture(
                telegram_id=tid, stage="ad_note",
                leader_id=int(d.leader_id or 0), task_id=d.id,
                chat_id=call.message.chat.id, message_id=sent.message_id,
                min_media=0, media=[]))
            db.commit()
            bot.answer_callback_query(call.id)
            return
        who = _display_name_for(db, tid)
        leader_dispute.decide_supervisor(
            db, d, action="rejected", note=None,
            actor_name=who, actor_telegram=tid)
        db.commit()
        _ad_log(db, d, tid, who, action="rejected", note=None,
                was=leader_dispute.SUPERVISOR)
        _ad_settled(db, d, stage="supervisor", uplifted=False)
        bot.answer_callback_query(call.id, _lt(lang, "ad_done_rejected"))


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


def _custom_emoji_entities(message: types.Message) -> list:
    """custom_emoji entities in a message's text or caption, in offset order."""
    ents = list(message.entities or []) + list(message.caption_entities or [])
    return sorted((e for e in ents if getattr(e, "type", None) == "custom_emoji"),
                  key=lambda e: e.offset)


def _entity_text(source: str, entity) -> str:
    """The substring an entity covers. Telegram offsets/lengths are in UTF-16
    code units, so slice in UTF-16 space to keep surrogate-pair emojis intact."""
    u16 = (source or "").encode("utf-16-le")
    return u16[entity.offset * 2: (entity.offset + entity.length) * 2].decode("utf-16-le", "ignore")


@bot.message_handler(
    func=lambda m: m.from_user.id in _admin_ids()
    and not (m.text or "").startswith("/")
    and bool(_custom_emoji_entities(m)),
    content_types=["text"],
)
def _custom_emoji_echo(message: types.Message):
    """Admin sends/forwards a message containing premium (custom) emojis → reply
    with each custom_emoji_id + its fallback char, ready to paste into the
    Broadcast composer's saved-emoji palette. Registered after the /broadcast
    capture handler, so an emoji typed while composing a broadcast is claimed by
    that flow, not echoed here."""
    lang = _get_lang(message.from_user.id)
    source = message.text or message.caption or ""
    seen: set[str] = set()
    lines: list[str] = []
    for e in _custom_emoji_entities(message):
        eid = str(getattr(e, "custom_emoji_id", "") or "")
        if not eid or eid in seen:
            continue
        seen.add(eid)
        fallback = html.escape(_entity_text(source, e))
        lines.append(f"{fallback} → <code>{html.escape(eid)}</code>")
    if not lines:
        return
    txt = _msg(lang, "custom_emoji_reply").format(list="\n".join(lines))
    try:
        bot.send_message(message.chat.id, txt, parse_mode="HTML",
                         reply_to_message_id=message.message_id)
    except Exception:
        logger.warning("Failed to echo custom_emoji to %s", message.from_user.id, exc_info=True)


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


# ── Dashboard cards ───────────────────────────────────────────────────────────
# `/ojidaniya` answers with a PNG of yesterday's Ojidaniya numbers (today's are
# always still mid-collection), drawn server-side from the same /api/downtime
# payload the page reads (app/services/downtime_card). A date argument overrides.
# Scoped to the caller's own profile — their role, their shift, their brigadirs.


def _card_active_role(db, tid: int) -> dict | None:
    """A JWT-shaped payload for the caller's ACTIVE profile — the same identity
    /api/auth/webapp would issue, so the page-access check and the endpoint's own
    scoping behave exactly as they do in the web app. None if the user holds no
    approved profile."""
    if tid in _admin_ids():
        return {"sub": str(tid), "role": "admin", "role_id": None, "role_ref": None}

    user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
    if not user:
        return None
    approved = (db.query(TelegramUserRole)
                  .filter_by(telegram_id=tid, status="approved")
                  .order_by(TelegramUserRole.id).all())
    if not approved:
        return None
    active = next((r for r in approved if r.id == user.active_role_ref), approved[0])
    return {"sub": str(tid), "role": active.role, "role_id": active.role_id,
            "role_ref": active.id}


def _caller_shift(db, payload: dict) -> int | None:
    """The caller's own shift, mirroring the web app's scoping. The JWT carries
    no shift field, so derive it from the profile (see the shift-scoping note
    on /api/summary & friends). role_id points at DIFFERENT tables per role
    (see RoleProfile's docstring): managers.id for supervisor/leader,
    role_profiles.id for shift-manager — reading the wrong one would scope to
    an unrelated brigadir's shift. Admins and top-managers see every shift."""
    role, rid = payload.get("role"), payload.get("role_id")
    if role == "admin" or not rid:
        return None
    if role == "shift-manager":
        prof = db.query(RoleProfile).filter_by(id=rid, role="shift-manager").first()
        return prof.shift if prof else None
    if role in ("supervisor", "leader"):
        mgr = db.query(Manager).filter_by(id=rid).first()
        return mgr.shift if mgr else None
    return None


@bot.message_handler(commands=["ojidaniya"])
def _ojidaniya_cmd(message: types.Message):
    from app.capabilities import capability_pages, caller_denied_pages
    from app.permissions import get_page_access, role_can_access
    from app.services.downtime_card import CardError, render_downtime_card

    tid = message.from_user.id
    lang = _get_lang(tid)

    # Default to yesterday: today's Ojidaniya numbers are still mid-collection
    # and always incomplete, so the caller wants the last complete day.
    # Optional date argument: /ojidaniya 2026-07-25 (also accepts 25.07.2026)
    # overrides this and shows exactly the requested day.
    day = datetime.now().date() - timedelta(days=1)
    parts = (message.text or "").split()
    if len(parts) > 1:
        for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
            try:
                day = datetime.strptime(parts[1], fmt).date()
                break
            except ValueError:
                continue
        else:
            bot.send_message(message.chat.id, _msg(lang, "shot_bad_date"))
            return

    try:
        with SessionLocal() as db:
            payload = _card_active_role(db, tid)
            if not payload:
                bot.send_message(message.chat.id, _msg(lang, "shot_no_access"))
                return
            if not role_can_access(payload["role"], ["downtime"],
                                   get_page_access(db), capability_pages(db, payload),
                                   caller_denied_pages(db, payload)):
                bot.send_message(message.chat.id, _msg(lang, "shot_no_access"))
                return
            shift = _caller_shift(db, payload)
            png = render_downtime_card(db, payload, day, lang, shift=shift)
            # The week's svodka around the same day, same scoping. Built inside
            # the session but sent after it; kpi_only=False so its tables agree
            # with the card, which also shows every category.
            svodka = None
            try:
                from app.services.ojidaniya_svodka import build_svodka
                svodka = build_svodka(db, payload, day, lang=lang, shift=shift)
            except Exception as exc:
                logger.warning("Ojidaniya svodka build failed for %s: %s", tid, exc)
    except CardError as exc:
        logger.error("Ojidaniya card failed for %s: %s", tid, exc)
        bot.send_message(message.chat.id, _msg(lang, "shot_failed"))
        return
    except Exception:
        # Anything else (DB down, font gone, permission-matrix read) must still
        # answer the user, not vanish into the webhook's catch-all.
        logger.exception("Ojidaniya command failed for %s", tid)
        bot.send_message(message.chat.id, _msg(lang, "shot_failed"))
        return

    # Rich mode first: the weekly tables with the day card embedded as the
    # figure. Any sendRichMessage failure falls through to the plain document
    # send so the command never goes silent (mirrors Broadcast's rich mode).
    if svodka:
        try:
            from app.routers.broadcast import _tg_api
            rich = {"html": svodka, "is_rtl": False,
                    "media": [{"id": "scr1",
                               "media": {"type": "photo", "media": "attach://f0"}}]}
            _tg_api("sendRichMessage",
                    {"chat_id": message.chat.id, "rich_message": json.dumps(rich)},
                    {"f0": (f"ojidaniya-{day:%Y%m%d}.png", png)})
            return
        except Exception as exc:
            logger.warning("sendRichMessage failed for %s, falling back to the "
                           "document card: %s", tid, exc)

    # send_document, not send_photo: Telegram re-compresses photos and caps them
    # at 1280px, which turns the numbers to mush. As a document the PNG arrives
    # pixel-for-pixel and still previews inline.
    bot.send_document(message.chat.id,
                      document=(f"ojidaniya-{day:%Y%m%d}.png", png),
                      caption=f"Ojidaniya · {day:%d.%m.%Y}")


@bot.message_handler(func=lambda m: _awaiting_contact(m.from_user.id),
                     content_types=["text"])
def _typed_instead_of_contact(message: types.Message):
    """Registration is waiting for the contact and the user typed instead —
    usually the phone number itself. A typed number can't be trusted as the
    account's own, so warn, re-show the button and keep waiting. Registered
    last (before the fallback) so every other stateful flow gets first claim
    on the message."""
    tid = message.from_user.id
    _ask_contact(tid, _get_lang(tid), "contact_typed_warning")


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
            types.BotCommand("ojidaniya", "Ojidaniya sahifasi rasmi"),
        ],
        "ru": [
            types.BotCommand("start", "Запуск / дашборд"),
            types.BotCommand("register", "Регистрация / добавить роль"),
            types.BotCommand("tasks", "Ежедневные задачи (лидеры)"),
            types.BotCommand("ojidaniya", "Снимок страницы «Ожидания»"),
        ],
        "en": [
            types.BotCommand("start", "Start / dashboard"),
            types.BotCommand("register", "Register / add a role"),
            types.BotCommand("tasks", "Daily tasks (leaders)"),
            types.BotCommand("ojidaniya", "Snapshot of the Ojidaniya page"),
        ],
    }
    admin_menu = [
        types.BotCommand("start", "Boshlash / dashboard"),
        types.BotCommand("pending", "Kutilayotgan ro'yxatdan o'tishlar"),
        types.BotCommand("tasks", "Kunlik vazifalar (liderlar)"),
        types.BotCommand("ojidaniya", "Ojidaniya sahifasi rasmi"),
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
                # A digest (not the raw value) so rotating the secret re-registers
                # the webhook, without persisting the secret into app_meta.
                "webhook_secret": hashlib.sha256(settings.webhook_secret.encode()).hexdigest(),
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

    webhook_ok = False
    try:
        # secret_token is echoed back in X-Telegram-Bot-Api-Secret-Token on every
        # update so the /bot/webhook handler can reject forged posts.
        bot.set_webhook(url=webhook_url, secret_token=settings.webhook_secret)
        webhook_ok = True
        logger.info("Webhook set to %s (with secret token)", webhook_url)
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

    # Persist the signature even if the menu calls 429'd: a rate-limit response
    # means Telegram already holds these commands from an earlier boot, so
    # retrying on every future boot only deepens the throttle. A real content
    # change yields a new signature and re-runs this block once.
    #
    # The webhook registration is the exception: if it did NOT succeed, do not
    # persist — otherwise a transient failure would mark setup "done" while the
    # secret token was never registered with Telegram, and every real update
    # would then be rejected (403) by the secret check until the next content
    # change. Leaving the signature unset simply retries on the next boot.
    if webhook_ok:
        _meta_set("bot_setup_sig", signature)
    else:
        logger.warning("Skipping bot_setup_sig persist — webhook not registered; will retry next boot")
