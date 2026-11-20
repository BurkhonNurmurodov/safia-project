// The shell's words on a PHONE (below md, 768px) — the leader-phone redesign
// (2026-11-20, docs/plan-leader-mobile.md §3.3, §4). Kept beside the shell in
// the four platform languages, the leaders-KPI pages' pattern
// (pages/leadersKpiText.js): `shellText(lang)` hands back one language's
// bundle, `fill(s, {t: "24:00"})` puts the values in.
//
// What is here:
//  - `job`   — a leader's menu named for the JOB, not for our structure
//              («Bugun», «Havotirlar», «Ish grafigi», «Kutish», «Natijam»), and
//              the quieter «Rahbariyat vazifalari» (/tasks). The same names
//              head the app bar, so the menu and the bar never disagree.
//  - `cam`   — the in-app camera's refusal and failure copy for the place the
//              person actually is: the Safia IMS Android app, or a browser. In
//              Telegram the platform's own `proof.cam.*Msg` strings stay — they
//              were written for Telegram and are right there.
//  - `camLine` — the camera's ONE status line on a phone (the stacked banners
//              are notes there).
//  - `notif` — «Hammasini o'qildi» read as a statement, not an action; on a
//              phone the button says what it DOES.

export const fill = (s, vals = {}) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vals[k] ?? m));

const uz = {
  job: {
    bugun: "Bugun",
    havotirlar: "Havotirlar",
    grafik: "Ish grafigi",
    kutish: "Kutish",
    natijam: "Natijam",
    tasks: "Rahbariyat vazifalari",
  },
  cam: {
    android: {
      deniedMsg: "Telefon sozlamalarida Safia IMS ilovasi uchun kamerani yoqing, so'ng qayta urinib ko'ring.",
      noneMsg: "Bu qurilmada kamera topilmadi. Bu vazifaning isboti ilovaning o'zida suratga olinadi — uni kamerasi bor telefonda oching.",
      heldMsg: "Kamerani boshqa ilova band qilgan. Uni yoping, so'ng «Qayta urinish»ni bosing.",
      stalledMsg: "Kamera ochildi, lekin tasvir kelmadi. Safia IMS ilovasini butunlay yopib, vazifani qaytadan oching yoki quyidagi tugmani bosing.",
      hungAgainMsg: "Sahifa yangilangandan keyin ham kamera javob bermadi. Safia IMS ilovasini butunlay yoping (so'nggi ilovalar ro'yxatidan surib tashlang), so'ng vazifani qaytadan oching.",
    },
    browser: {
      deniedMsg: "Brauzerda bu sayt uchun kamerani yoqing (manzil satridagi qulf belgisi), so'ng qayta urinib ko'ring.",
      noneMsg: "Bu qurilmada kamera topilmadi. Bu vazifaning isboti ilovaning o'zida suratga olinadi — uni kamerasi bor telefonda oching.",
      heldMsg: "Kamerani boshqa ilova yoki brauzer oynasi band qilgan. Uni yoping, so'ng «Qayta urinish»ni bosing.",
      stalledMsg: "Kamera ochildi, lekin tasvir kelmadi. Brauzerni yopib, vazifani qaytadan oching yoki quyidagi tugmani bosing.",
      hungAgainMsg: "Sahifa yangilangandan keyin ham kamera javob bermadi. Brauzerni butunlay yoping, so'ng vazifani qaytadan oching.",
    },
  },
  camLine: {
    late: "Kechikkan isbot",
    lateUntil: "Kechikkan isbot · {t} gacha",
    outside: "{lo}–{hi} dan tashqari — rasm «kech» bo'ladi",
  },
  notif: { markAllRead: "Hammasini o'qish" },
};

const uz_cyrl = {
  job: {
    bugun: "Бугун",
    havotirlar: "Ҳавотирлар",
    grafik: "Иш графиги",
    kutish: "Кутиш",
    natijam: "Натижам",
    tasks: "Раҳбарият вазифалари",
  },
  cam: {
    android: {
      deniedMsg: "Телефон созламаларида Safia IMS иловаси учун камерани ёқинг, сўнг қайта уриниб кўринг.",
      noneMsg: "Бу қурилмада камера топилмади. Бу вазифанинг исботи илованинг ўзида суратга олинади — уни камераси бор телефонда очинг.",
      heldMsg: "Камерани бошқа илова банд қилган. Уни ёпинг, сўнг «Қайта уриниш»ни босинг.",
      stalledMsg: "Камера очилди, лекин тасвир келмади. Safia IMS иловасини бутунлай ёпиб, вазифани қайтадан очинг ёки қуйидаги тугмани босинг.",
      hungAgainMsg: "Саҳифа янгилангандан кейин ҳам камера жавоб бермади. Safia IMS иловасини бутунлай ёпинг (сўнгги иловалар рўйхатидан суриб ташланг), сўнг вазифани қайтадан очинг.",
    },
    browser: {
      deniedMsg: "Браузерда бу сайт учун камерани ёқинг (манзил сатридаги қулф белгиси), сўнг қайта уриниб кўринг.",
      noneMsg: "Бу қурилмада камера топилмади. Бу вазифанинг исботи илованинг ўзида суратга олинади — уни камераси бор телефонда очинг.",
      heldMsg: "Камерани бошқа илова ёки браузер ойнаси банд қилган. Уни ёпинг, сўнг «Қайта уриниш»ни босинг.",
      stalledMsg: "Камера очилди, лекин тасвир келмади. Браузерни ёпиб, вазифани қайтадан очинг ёки қуйидаги тугмани босинг.",
      hungAgainMsg: "Саҳифа янгилангандан кейин ҳам камера жавоб бермади. Браузерни бутунлай ёпинг, сўнг вазифани қайтадан очинг.",
    },
  },
  camLine: {
    late: "Кечиккан исбот",
    lateUntil: "Кечиккан исбот · {t} гача",
    outside: "{lo}–{hi} дан ташқари — расм «кеч» бўлади",
  },
  notif: { markAllRead: "Ҳаммасини ўқиш" },
};

const ru = {
  job: {
    bugun: "Сегодня",
    havotirlar: "Хавотиры",
    grafik: "График работы",
    kutish: "Ожидания",
    natijam: "Мои результаты",
    tasks: "Задачи от руководства",
  },
  cam: {
    android: {
      deniedMsg: "Разрешите приложению Safia IMS доступ к камере в настройках телефона и попробуйте снова.",
      noneMsg: "На этом устройстве не найдена камера. Фото для этой задачи снимается прямо в приложении — откройте её на телефоне с камерой.",
      heldMsg: "Камеру занимает другое приложение. Закройте его и нажмите «Повторить».",
      stalledMsg: "Камера открылась, но изображение не пошло. Полностью закройте приложение Safia IMS и откройте задачу заново — или нажмите кнопку ниже.",
      hungAgainMsg: "Камера не ответила и после перезагрузки страницы. Полностью закройте приложение Safia IMS (смахните его из списка недавних) и откройте задачу заново.",
    },
    browser: {
      deniedMsg: "Разрешите этому сайту доступ к камере в браузере (значок замка в адресной строке) и попробуйте снова.",
      noneMsg: "На этом устройстве не найдена камера. Фото для этой задачи снимается прямо в приложении — откройте её на телефоне с камерой.",
      heldMsg: "Камеру занимает другое приложение или окно браузера. Закройте его и нажмите «Повторить».",
      stalledMsg: "Камера открылась, но изображение не пошло. Закройте браузер и откройте задачу заново — или нажмите кнопку ниже.",
      hungAgainMsg: "Камера не ответила и после перезагрузки страницы. Полностью закройте браузер и откройте задачу заново.",
    },
  },
  camLine: {
    late: "Позднее подтверждение",
    lateUntil: "Позднее подтверждение · до {t}",
    outside: "Вне {lo}–{hi} — снимок будет «поздним»",
  },
  notif: { markAllRead: "Прочитать все" },
};

const en = {
  job: {
    bugun: "Today",
    havotirlar: "Concerns",
    grafik: "Work schedule",
    kutish: "Waiting",
    natijam: "My results",
    tasks: "Tasks from management",
  },
  cam: {
    android: {
      deniedMsg: "Allow the Safia IMS app to use the camera in your phone settings, then try again.",
      noneMsg: "No camera was found on this device. This task's proof is photographed inside the app — open it on a phone with a camera.",
      heldMsg: "Another app is holding the camera. Close it, then press Retry.",
      stalledMsg: "The camera opened but sent no picture. Close the Safia IMS app completely and open the task again — or press the button below.",
      hungAgainMsg: "The camera did not answer even after the page reloaded. Close the Safia IMS app completely (swipe it away from recent apps), then open the task again.",
    },
    browser: {
      deniedMsg: "Allow this site to use the camera in your browser (the lock icon in the address bar), then try again.",
      noneMsg: "No camera was found on this device. This task's proof is photographed inside the app — open it on a phone with a camera.",
      heldMsg: "Another app or browser window is holding the camera. Close it, then press Retry.",
      stalledMsg: "The camera opened but sent no picture. Close the browser and open the task again — or press the button below.",
      hungAgainMsg: "The camera did not answer even after the page reloaded. Close the browser completely, then open the task again.",
    },
  },
  camLine: {
    late: "Late proof",
    lateUntil: "Late proof · until {t}",
    outside: "Outside {lo}–{hi} — the shot will be «late»",
  },
  notif: { markAllRead: "Mark all as read" },
};

export const SHELL_TXT = { uz, uz_cyrl, ru, en };
export const shellText = (lang) => SHELL_TXT[lang] || SHELL_TXT.uz;
