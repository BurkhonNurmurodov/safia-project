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

    private static final String[] UZ = {
            "Yuklab olindi: %s",
            "«Yuklanmalar» papkasiga saqlandi: %s",
            "Faylni saqlab bo'lmadi",
            "Buni ochadigan ilova topilmadi",
    };
    private static final String[] UZ_CYRL = {
            "Юклаб олинди: %s",
            "«Юкланмалар» папкасига сақланди: %s",
            "Файлни сақлаб бўлмади",
            "Буни очадиган илова топилмади",
    };
    private static final String[] RU = {
            "Загружено: %s",
            "Сохранено в «Загрузки»: %s",
            "Не удалось сохранить файл",
            "Нет приложения, чтобы открыть это",
    };
    private static final String[] EN = {
            "Downloaded: %s",
            "Saved to Downloads: %s",
            "Could not save the file",
            "No app on this phone can open this",
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
