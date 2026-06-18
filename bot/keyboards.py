from telebot import types


def language_keyboard() -> types.InlineKeyboardMarkup:
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


def webapp_register_keyboard(webapp_url: str, btn_text: str) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        btn_text,
        web_app=types.WebAppInfo(url=f"{webapp_url.rstrip('/')}/login"),
    ))
    return kb


def share_contact_keyboard(btn_text: str) -> types.ReplyKeyboardMarkup:
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    kb.add(types.KeyboardButton(btn_text, request_contact=True))
    return kb


def remove_keyboard() -> types.ReplyKeyboardRemove:
    return types.ReplyKeyboardRemove()


def admin_approval_keyboard(target_telegram_id: int) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton("✅ Tasdiqlash",  callback_data=f"approve:{target_telegram_id}"),
        types.InlineKeyboardButton("❌ Rad etish", callback_data=f"reject:{target_telegram_id}"),
    )
    return kb


def open_dashboard_keyboard(webapp_url: str, btn_text: str) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        btn_text,
        web_app=types.WebAppInfo(url=webapp_url.rstrip("/")),
    ))
    return kb
