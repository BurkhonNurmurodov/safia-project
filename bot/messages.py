MESSAGES = {
    "uz": {
        "choose_language": "🌐 Tilni tanlang:",
        "welcome_new": "👋 Xush kelibsiz! Ro'yxatdan o'tish uchun quyidagi tugmani bosing.",
        "register_btn": "📝 Ro'yxatdan o'tish",
        "share_contact_prompt": (
            "✅ Ma'lumotlaringiz qabul qilindi!\n\n"
            "📱 Iltimos, telefon raqamingizni ulashing:"
        ),
        "share_contact_btn": "📱 Raqamni ulashish",
        "waiting_approval": (
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
        "open_dashboard": "Ochish",
        "already_pending": "⏳ Sizning so'rovingiz allaqachon ko'rib chiqilmoqda.",
        "already_approved": (
            "✅ Siz allaqachon tasdiqlangansiz!\n"
            "Dashboardni ochish uchun tugmani bosing:"
        ),
        "admin_welcome": "👑 Admin paneliga xush kelibsiz!",
        "unknown_command": "Boshlash uchun /start ni bosing.",
    },
    "uz_cyrl": {
        "choose_language": "🌐 Тилни танланг:",
        "welcome_new": "👋 Хуш келибсиз! Рўйхатдан ўтиш учун қуйидаги тугмани босинг.",
        "register_btn": "📝 Рўйхатдан ўтиш",
        "share_contact_prompt": (
            "✅ Маълумотларингиз қабул қилинди!\n\n"
            "📱 Илтимос, телефон рақамингизни улашинг:"
        ),
        "share_contact_btn": "📱 Рақамни улашиш",
        "waiting_approval": (
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
        "open_dashboard": "Очиш",
        "already_pending": "⏳ Сизнинг сўровингиз аллақачон кўриб чиқилмоқда.",
        "already_approved": (
            "✅ Сиз аллақачон тасдиқлангансиз!\n"
            "Дашбордни очиш учун тугмани босинг:"
        ),
        "admin_welcome": "👑 Админ панелига хуш келибсиз!",
        "unknown_command": "Бошлаш учун /start ни босинг.",
    },
    "ru": {
        "choose_language": "🌐 Выберите язык:",
        "welcome_new": "👋 Добро пожаловать! Нажмите кнопку ниже для регистрации.",
        "register_btn": "📝 Зарегистрироваться",
        "share_contact_prompt": (
            "✅ Данные приняты!\n\n"
            "📱 Пожалуйста, поделитесь номером телефона:"
        ),
        "share_contact_btn": "📱 Поделиться номером",
        "waiting_approval": (
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
        "open_dashboard": "Открыть",
        "already_pending": "⏳ Ваша заявка уже рассматривается.",
        "already_approved": (
            "✅ Вы уже подтверждены!\n"
            "Нажмите кнопку для открытия дашборда:"
        ),
        "admin_welcome": "👑 Добро пожаловать в панель администратора!",
        "unknown_command": "Отправьте /start для начала.",
    },
    "en": {
        "choose_language": "🌐 Choose your language:",
        "welcome_new": "👋 Welcome! Press the button below to register.",
        "register_btn": "📝 Register",
        "share_contact_prompt": (
            "✅ Details received!\n\n"
            "📱 Please share your phone number:"
        ),
        "share_contact_btn": "📱 Share Contact",
        "waiting_approval": (
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
        "open_dashboard": "Open",
        "already_pending": "⏳ Your registration is already under review.",
        "already_approved": (
            "✅ You're already approved!\n"
            "Press the button to open the dashboard:"
        ),
        "admin_welcome": "👑 Welcome to the admin panel!",
        "unknown_command": "Send /start to begin.",
    },
}

ROLE_LABELS = {
    "uz": {
        "top-manager": "Top-menejer",
        "shift-manager": "Smena menejeri",
        "supervisor": "Brigadir",
    },
    "uz_cyrl": {
        "top-manager": "Топ-менежер",
        "shift-manager": "Смена менежери",
        "supervisor": "Бригадир",
    },
    "ru": {
        "top-manager": "Топ-менеджер",
        "shift-manager": "Сменный менеджер",
        "supervisor": "Бригадир",
    },
    "en": {
        "top-manager": "Top Manager",
        "shift-manager": "Shift Manager",
        "supervisor": "Supervisor",
    },
}


def msg(lang: str, key: str) -> str:
    return MESSAGES.get(lang, MESSAGES["uz"]).get(key, MESSAGES["uz"].get(key, key))


def role_label(lang: str, role: str) -> str:
    return ROLE_LABELS.get(lang, ROLE_LABELS["uz"]).get(role, role)
