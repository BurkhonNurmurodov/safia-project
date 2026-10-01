package uz.safiacorporate.ims;

/**
 * The app's own few words, in the language the person picked ON THE SITE
 * (localStorage "lang": uz · uz_cyrl · ru · en, sent with every bridge
 * message) rather than the phone's — the toast then speaks the language of
 * the page it appears over.
 */
final class Texts {
    static final int DOWNLOADED = 0;
    static final int SAVED_NO_APP = 1;
    static final int SAVE_FAILED = 2;
    static final int NO_APP = 3;
    static final int UPDATE_TITLE = 4;
    static final int UPDATE_TEXT = 5;
    static final int UPDATE_NOW = 6;
    static final int UPDATE_LATER = 7;
    static final int UPDATE_ALLOW = 8;
    static final int UPDATE_SETTINGS = 9;
    static final int UPDATE_LOADING = 10;
    static final int UPDATE_FAILED = 11;
    static final int CANCEL = 12;
    /** A phone notification on a locked screen: that something arrived, not what. */
    static final int PUSH_PUBLIC = 13;
    /** The nine notification categories (Push.CATS order), naming the channels. */
    static final int CAT_FIRST = 14;

    private static final String[] UZ = {
            "Yuklab olindi: %s",
            "«Yuklanmalar» papkasiga saqlandi: %s",
            "Faylni saqlab bo'lmadi",
            "Buni ochadigan ilova topilmadi",
            "Yangi versiya: Safia IMS %s",
            "Ilovaning yangi versiyasi chiqdi (%d MB). Hozir o'rnatasizmi?",
            "Yangilash",
            "Keyinroq",
            "Yangilanishni o'rnatish uchun ruxsat kerak. Keyingi oynada «Ruxsat berish»ni yoqing va orqaga qayting.",
            "Sozlamalarni ochish",
            "Yuklanmoqda… %d%%",
            "Yangilanishni yuklab bo'lmadi",
            "Bekor qilish",
            "Yangi bildirishnoma",
            "So'rovlar va hujjatlar",
            "Davomat va kun yopilishi",
            "Xavotirlar",
            "Vazifalar",
            "Chek-list va AI tekshiruvi",
            "Norozilik va kechikkan isbotlar",
            "Kutishlar (ojidaniya)",
            "Ta'lim va imtihon",
            "Boshqa xabarlar",
    };
    private static final String[] UZ_CYRL = {
            "Юклаб олинди: %s",
            "«Юкланмалар» папкасига сақланди: %s",
            "Файлни сақлаб бўлмади",
            "Буни очадиган илова топилмади",
            "Янги версия: Safia IMS %s",
            "Илованинг янги версияси чиқди (%d MB). Ҳозир ўрнатасизми?",
            "Янгилаш",
            "Кейинроқ",
            "Янгиланишни ўрнатиш учун рухсат керак. Кейинги ойнада «Рухсат бериш»ни ёқинг ва орқага қайтинг.",
            "Созламаларни очиш",
            "Юкланмоқда… %d%%",
            "Янгиланишни юклаб бўлмади",
            "Бекор қилиш",
            "Янги билдиришнома",
            "Сўровлар ва ҳужжатлар",
            "Давомат ва кун ёпилиши",
            "Хавотирлар",
            "Вазифалар",
            "Чек-лист ва AI текшируви",
            "Норозилик ва кечиккан исботлар",
            "Кутишлар (ожидания)",
            "Таълим ва имтиҳон",
            "Бошқа хабарлар",
    };
    private static final String[] RU = {
            "Загружено: %s",
            "Сохранено в «Загрузки»: %s",
            "Не удалось сохранить файл",
            "Нет приложения, чтобы открыть это",
            "Новая версия: Safia IMS %s",
            "Вышла новая версия приложения (%d МБ). Установить сейчас?",
            "Обновить",
            "Позже",
            "Чтобы установить обновление, нужно разрешение. В следующем окне включите «Разрешить» и вернитесь назад.",
            "Открыть настройки",
            "Загрузка… %d%%",
            "Не удалось загрузить обновление",
            "Отмена",
            "Новое уведомление",
            "Запросы и документы",
            "Посещаемость и закрытие дня",
            "Обеспокоенности",
            "Задачи",
            "Чек-лист и проверка ИИ",
            "Возражения и поздние доказательства",
            "Ожидания",
            "Обучение и экзамен",
            "Прочее",
    };
    private static final String[] EN = {
            "Downloaded: %s",
            "Saved to Downloads: %s",
            "Could not save the file",
            "No app on this phone can open this",
            "New version: Safia IMS %s",
            "A new version of the app is out (%d MB). Install it now?",
            "Update",
            "Later",
            "Installing the update needs your permission. On the next screen turn on «Allow» and come back.",
            "Open settings",
            "Downloading… %d%%",
            "Could not download the update",
            "Cancel",
            "New notification",
            "Requests and documents",
            "Attendance and day close",
            "Concerns",
            "Tasks",
            "Checklist and AI review",
            "Objections and late proofs",
            "Waiting time (ojidaniya)",
            "Learning and exams",
            "Other",
    };

    private Texts() {
    }

    static String get(String lang, int key, Object... args) {
        String[] set;
        if ("ru".equals(lang)) set = RU;
        else if ("en".equals(lang)) set = EN;
        else if ("uz_cyrl".equals(lang)) set = UZ_CYRL;
        else set = UZ;
        return args.length == 0 ? set[key] : String.format(set[key], args);
    }
}
