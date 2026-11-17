// «Panel: audit minuslari» (/panel/sdpanel) — the words in the four platform
// languages, beside the page (the /trello pattern). The report's own text
// (workshops, tasks, questions, comments) stays as the panel writes it.
import { useLang } from "../../context/LangContext";

export const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

const uz = {
  title: "panel.safiabakery.uz — kirish",
  explain: "Bu hisobotning API'si yo'q, shuning uchun platforma panelga odam kabi login bilan kiradi va bitta sahifani o'qiydi. Panelga hech narsa yozilmaydi.",
  user: "Login", password: "Parol",
  passHint: "Shifrlangan holda saqlanadi, faqat adminlarga ko'rinadi.",
  save: "Saqlash", saved: "Saqlandi",
  report: "Texnik audit minuslari — oktabr 2026",
  reportHint: "Har bir qator — bitta tekshiruvda ball yo'qotgan bitta savol. 100% olgan tekshiruv bu yerda bo'lmaydi.",
  fetch: "Paneldan o'qish", fetching: "Panelga kirilmoqda va hisobot o'qilmoqda…",
  saveFirst: "Avval o'zgarishlarni saqlang.", never: "Hali o'qilmagan.",
  read: "O'qildi: {at} · {by} · {s} s", counts: "{n} savol · {w} sex",
  failed: "O'qib bo'lmadi ({at}):", oldRows: "Jadvalda {at} dagi oxirgi natija.",
  empty: "Bu davrda minus yo'q.", openPanel: "Panelda ochish",
  col: { n: "№", day: "Sana", workshop: "Sex", inspector: "Inspektor", total: "Umumiy reyting", rating: "Reyting", task: "Vazifa", question: "Savol", comment: "Izoh", top: "TOP" },
  e: {
    no_login: "Login va parol saqlanmagan.",
    unreadable: "Saqlangan parolni ochib bo'lmadi — qayta kiriting.",
    no_csrf: "Panelning kirish sahifasi o'zgargan — kirish formasi topilmadi.",
    refused: "Panel login yoki parolni qabul qilmadi.",
    no_access: "Kirildi, lekin bu hisob hisobotni ocha olmaydi.",
    status: "Panel kutilmagan javob qaytardi.",
    shape: "Hisobot sahifasi o'zgargan — ustunlar boshqacha. Kodni yangilash kerak.",
    network: "Panelga ulanib bo'lmadi.",
    timeout: "Panel o'z vaqtida javob bermadi.",
  },
  loadErr: "Sozlamalarni yuklab bo'lmadi",
};

const uz_cyrl = {
  title: "panel.safiabakery.uz — кириш",
  explain: "Бу ҳисоботнинг API'си йўқ, шунинг учун платформа панелга одам каби логин билан киради ва битта саҳифани ўқийди. Панелга ҳеч нарса ёзилмайди.",
  user: "Логин", password: "Парол",
  passHint: "Шифрланган ҳолда сақланади, фақат админларга кўринади.",
  save: "Сақлаш", saved: "Сақланди",
  report: "Техник аудит минуслари — октябр 2026",
  reportHint: "Ҳар бир қатор — битта текширувда балл йўқотган битта савол. 100% олган текширув бу ерда бўлмайди.",
  fetch: "Панелдан ўқиш", fetching: "Панелга кирилмоқда ва ҳисобот ўқилмоқда…",
  saveFirst: "Аввал ўзгаришларни сақланг.", never: "Ҳали ўқилмаган.",
  read: "Ўқилди: {at} · {by} · {s} с", counts: "{n} савол · {w} цех",
  failed: "Ўқиб бўлмади ({at}):", oldRows: "Жадвалда {at} даги охирги натижа.",
  empty: "Бу даврда минус йўқ.", openPanel: "Панелда очиш",
  col: { n: "№", day: "Сана", workshop: "Цех", inspector: "Инспектор", total: "Умумий рейтинг", rating: "Рейтинг", task: "Вазифа", question: "Савол", comment: "Изоҳ", top: "TOP" },
  e: {
    no_login: "Логин ва парол сақланмаган.",
    unreadable: "Сақланган паролни очиб бўлмади — қайта киритинг.",
    no_csrf: "Панелнинг кириш саҳифаси ўзгарган — кириш формаси топилмади.",
    refused: "Панел логин ёки паролни қабул қилмади.",
    no_access: "Кирилди, лекин бу ҳисоб ҳисоботни оча олмайди.",
    status: "Панел кутилмаган жавоб қайтарди.",
    shape: "Ҳисобот саҳифаси ўзгарган — устунлар бошқача. Кодни янгилаш керак.",
    network: "Панелга уланиб бўлмади.",
    timeout: "Панел ўз вақтида жавоб бермади.",
  },
  loadErr: "Созламаларни юклаб бўлмади",
};

const ru = {
  title: "panel.safiabakery.uz — вход",
  explain: "У этого отчёта нет API, поэтому платформа входит в панель с логином, как человек, и читает одну страницу. В панель ничего не записывается.",
  user: "Логин", password: "Пароль",
  passHint: "Хранится в зашифрованном виде, видно только администраторам.",
  save: "Сохранить", saved: "Сохранено",
  report: "Минусы технического аудита — октябрь 2026",
  reportHint: "Каждая строка — один вопрос, потерявший баллы в одной проверке. Проверок на 100% здесь нет.",
  fetch: "Прочитать с панели", fetching: "Вход в панель и чтение отчёта…",
  saveFirst: "Сначала сохраните изменения.", never: "Ещё не читали.",
  read: "Прочитано: {at} · {by} · {s} с", counts: "{n} вопросов · {w} цехов",
  failed: "Не удалось прочитать ({at}):", oldRows: "В таблице последний результат от {at}.",
  empty: "За этот период минусов нет.", openPanel: "Открыть в панели",
  col: { n: "№", day: "Дата", workshop: "Цех", inspector: "Инспектор", total: "Общ. рейтинг", rating: "Рейтинг", task: "Задача", question: "Подзадача", comment: "Комментарий", top: "TOP" },
  e: {
    no_login: "Логин и пароль не сохранены.",
    unreadable: "Сохранённый пароль не открывается — введите его заново.",
    no_csrf: "Страница входа панели изменилась — форма входа не найдена.",
    refused: "Панель не приняла логин или пароль.",
    no_access: "Вход выполнен, но этой учётной записи отчёт недоступен.",
    status: "Панель ответила неожиданно.",
    shape: "Страница отчёта изменилась — другие столбцы. Нужно обновить код.",
    network: "Не удалось подключиться к панели.",
    timeout: "Панель не ответила вовремя.",
  },
  loadErr: "Не удалось загрузить настройки",
};

const en = {
  title: "panel.safiabakery.uz — sign-in",
  explain: "This report has no API, so the platform signs in to the panel with a login, like a person, and reads one page. Nothing is written to the panel.",
  user: "Login", password: "Password",
  passHint: "Stored encrypted, visible to admins only.",
  save: "Save", saved: "Saved",
  report: "Technical audit minuses — October 2026",
  reportHint: "Each row is one question that lost points in one inspection. An inspection scored 100% has no row here.",
  fetch: "Read from the panel", fetching: "Signing in to the panel and reading the report…",
  saveFirst: "Save your changes first.", never: "Not read yet.",
  read: "Read: {at} · {by} · {s} s", counts: "{n} questions · {w} workshops",
  failed: "Could not read ({at}):", oldRows: "The table shows the last result, from {at}.",
  empty: "No minuses in this period.", openPanel: "Open in the panel",
  col: { n: "№", day: "Date", workshop: "Workshop", inspector: "Inspector", total: "Overall", rating: "Rating", task: "Task", question: "Question", comment: "Comment", top: "TOP" },
  e: {
    no_login: "No login and password saved.",
    unreadable: "The saved password can't be opened — type it again.",
    no_csrf: "The panel's sign-in page changed — no sign-in form found.",
    refused: "The panel refused the login or password.",
    no_access: "Signed in, but this account can't open the report.",
    status: "The panel answered unexpectedly.",
    shape: "The report page changed — its columns differ. The code needs an update.",
    network: "Could not reach the panel.",
    timeout: "The panel did not answer in time.",
  },
  loadErr: "Could not load the settings",
};

export const TXT = { uz, uz_cyrl, ru, en };

export function useSdText() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}
