/**
 * Safia Dashboard — foydalanuvchilar so'rovnomasi
 * Google Apps Script generator for a Google Form + linked response sheet.
 *
 * HOW TO RUN
 *   1. Open https://script.google.com  →  New project
 *   2. Paste this whole file over Code.gs, save
 *   3. Select the function  createSafiaFeedbackForm  →  Run
 *   4. Approve the OAuth prompt (Forms + Sheets + Drive on your own account)
 *   5. The Execution log prints the EDIT url, the PUBLIC url and the responses
 *      spreadsheet url. The form lands in the root of your Google Drive.
 *
 * Re-running creates a NEW form each time (nothing is overwritten).
 */

function createSafiaFeedbackForm() {
  var TITLE = "Safia Dashboard — foydalanuvchilar so’rovnomasi";

  var form = FormApp.create(TITLE);
  form.setTitle(TITLE);
  form.setDescription(
    "Bu so’rovnoma Safia ichki boshqaruv sistemasini yaxshilash uchun.\n" +
    "Javoblaringiz ochiq e’lon qilinmaydi — faqat tizimni rivojlantirish uchun ishlatiladi.\n" +
    "To’ldirish uchun ~5 daqiqa ketadi. Rahmat!"
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(true);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage("Javobingiz qabul qilindi. Vaqtingiz uchun rahmat!");

  // ── 1-bo'lim — Siz haqingizda ──────────────────────────────────────────
  form.addSectionHeaderItem()
      .setTitle("1-bo’lim — Siz haqingizda");

  form.addTextItem()
      .setTitle("Ism-familiya")
      .setRequired(true);

  form.addMultipleChoiceItem()
      .setTitle("Rolingiz")
      .setChoiceValues(["Lider", "Brigadir", "Menejer", "Top Menejer", "Admin", "Mehmon"])
      .showOtherOption(true)
      .setRequired(true);

  form.addTextItem()
      .setTitle("Zavod / bo’lim")
      .setHelpText("Masalan: 1-zavod, tikuv sexi")
      .setRequired(true);

  form.addMultipleChoiceItem()
      .setTitle("Sistemadan asosan qayerda foydalanasiz?")
      .setChoiceValues([
        "Telegram ilovasi (telefon)",
        "Brauzer (kompyuter)",
        "Ikkalasi ham"
      ])
      .setRequired(true);

  // ── 2-bo'lim — Foydalanish ─────────────────────────────────────────────
  form.addPageBreakItem()
      .setTitle("2-bo’lim — Qanchalik foydalanasiz");

  form.addMultipleChoiceItem()
      .setTitle("Sistemaga qanchalik tez-tez kirasiz?")
      .setChoiceValues([
        "Kuniga bir necha marta",
        "Kuniga bir marta",
        "Haftasiga bir necha marta",
        "Haftasiga bir marta yoki kamroq",
        "Deyarli kirmayman"
      ])
      .setRequired(true);

  form.addCheckboxItem()
      .setTitle("Qaysi sahifalardan haqiqatda foydalanasiz?")
      .setHelpText("Bir nechtasini belgilashingiz mumkin")
      .setChoiceValues([
        "Umumiy ko’rinish",
        "Zagruzka foizi",
        "Odam Soni",
        "Plan Bajarish",
        "Ojidaniya (kutish vaqti)",
        "Sifat va shikoyatlar",
        "Vazifalar",
        "Xavotirlar",
        "Liderlar / Lider nazorati",
        "Kaizen loyihalari",
        "Safia Honors",
        "Admin sahifalari"
      ])
      .showOtherOption(true)
      .setRequired(true);

  form.addMultipleChoiceItem()
      .setTitle("Sistemasiz ishingizni qanday bajarardingiz?")
      .setChoiceValues([
        "Qo’lda daftar / Excel bilan",
        "Telefon orqali so’rab",
        "Hech qanday hisob yuritmasdim",
        "Bilmayman"
      ])
      .showOtherOption(true);

  // ── 3-bo'lim — Sahifalarga baho ────────────────────────────────────────
  form.addPageBreakItem()
      .setTitle("3-bo’lim — Sahifalarga baho")
      .setHelpText("1 = umuman foydasiz, 5 = ishimda juda kerak. Ishlatmagan sahifani bo’sh qoldiring.");

  form.addGridItem()
      .setTitle("Har bir sahifa ishingizga qanchalik foyda beryapti?")
      .setRows([
        "Umumiy ko’rinish",
        "Zagruzka foizi",
        "Odam Soni",
        "Plan Bajarish",
        "Ojidaniya (kutish vaqti)",
        "Sifat va shikoyatlar",
        "Vazifalar",
        "Xavotirlar"
      ])
      .setColumns(["1", "2", "3", "4", "5"]);

  form.addScaleItem()
      .setTitle("Sistemadagi raqamlarga qanchalik ishonasiz?")
      .setBounds(1, 5)
      .setLabels("Umuman ishonmayman", "To’liq ishonaman")
      .setRequired(true);

  form.addParagraphTextItem()
      .setTitle("Agar raqamlarga ishonmasangiz — qaysi raqam va nega?")
      .setHelpText("Aniq misol yozing: sahifa, sana, qanday ko’rsatgan va aslida qanday bo’lgan.");

  // ── 4-bo'lim — Vazifalar, xavotirlar, kamera ───────────────────────────
  form.addPageBreakItem()
      .setTitle("4-bo’lim — Kundalik ish oqimi");

  form.addScaleItem()
      .setTitle("Vazifalarni (checklist) belgilash qanchalik qulay?")
      .setBounds(1, 5)
      .setLabels("Juda noqulay", "Juda qulay");

  form.addCheckboxItem()
      .setTitle("Vazifa yoki kamera bilan qanday muammolarga duch keldingiz?")
      .setChoiceValues([
        "Kamera ochilmaydi yoki sekin ishlaydi",
        "Surat yuklanmaydi / internet uzilib qoladi",
        "Vazifa vaqti ish smenamga to’g’ri kelmaydi",
        "Vazifa matni tushunarsiz",
        "Belgilaganim saqlanmay qoladi",
        "Hech qanday muammo bo’lmagan"
      ])
      .showOtherOption(true);

  form.addMultipleChoiceItem()
      .setTitle("Xavotir (concern) yozganmisiz?")
      .setChoiceValues(["Ha, yozganman", "Yo’q, yozmaganman", "Bilmadim, qanday yozishni bilmayman"])
      .setRequired(true);

  form.addScaleItem()
      .setTitle("Yozgan xavotiringiz bo’yicha javob/yechim qanchalik tez keldi?")
      .setBounds(1, 5)
      .setLabels("Umuman javob yo’q", "Juda tez hal bo’ldi");

  // ── 5-bo'lim — Takliflar ───────────────────────────────────────────────
  form.addPageBreakItem()
      .setTitle("5-bo’lim — Takliflaringiz");

  form.addParagraphTextItem()
      .setTitle("Sistemada eng ko’p bezovta qiladigan narsa nima?")
      .setRequired(true);

  form.addParagraphTextItem()
      .setTitle("Qanday ma’lumot yoki imkoniyat yetishmaydi?")
      .setHelpText("“Shu raqamni ko’rsam ishim osonlashardi” degan narsa bo’lsa yozing.");

  form.addScaleItem()
      .setTitle("Sistemani hamkasbingizga tavsiya qilarmidingiz?")
      .setBounds(0, 10)
      .setLabels("Umuman tavsiya qilmayman", "Albatta tavsiya qilaman")
      .setRequired(true);

  form.addMultipleChoiceItem()
      .setTitle("Kerak bo’lsa siz bilan bog’lansak bo’ladimi?")
      .setChoiceValues(["Ha, bog’lansangiz bo’ladi", "Yo’q, rahmat"])
      .setRequired(true);

  form.addTextItem()
      .setTitle("Telegram username yoki telefon raqam")
      .setHelpText("Faqat yuqorida “Ha” desangiz to’ldiring.");

  // ── Javoblar jadvali ───────────────────────────────────────────────────
  var ss = SpreadsheetApp.create(TITLE + " (javoblar)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  var out = {
    edit:      form.getEditUrl(),
    published: form.getPublishedUrl(),
    responses: ss.getUrl()
  };
  Logger.log("TAHRIRLASH (edit):  " + out.edit);
  Logger.log("TARQATISH (public): " + out.published);
  Logger.log("JAVOBLAR (sheet):   " + out.responses);
  return out;
}
