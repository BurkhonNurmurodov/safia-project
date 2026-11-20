// «Natijam» — a leader's own results on a phone (`/leaders?tab=monitor`, the
// leader-phone redesign of 2026-11-20) — and the frame /leaders wears for a
// leader below md: the page's words in the four platform languages, read
// through `useLang().lang` (the pattern of pages/leadersKpiText.js).
// `fill(s, {n: 3})` puts the numbers in.

export const fill = (s, vars = {}) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : m));

const uz = {
  natijam: "Natijam", bugun: "Bugun",
  myDays: "Kunlarim", avg: "O'rtacha",
  week: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
  dayMissed: "topshirilmagan", dayOff: "hisobga olinmagan", dayVoid: "bekor qilingan",
  dayLater: "hali hisoblanmagan", dayToday: "bugun",
  pickReport: "Qaysi hisobot?", cellReport: "{c} yacheyka", report: "Hisobot",
  appeals: "Bahslar", kindDispute: "Norozilik", kindLate: "Kechikkan isbot",
  newN: "{n} yangi", more: "Yana {n} ta", taskN: "Vazifa №{n}", you: "Siz", segNew: "Yangi xabar",
  months: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
};

const uz_cyrl = {
  natijam: "Натижам", bugun: "Бугун",
  myDays: "Кунларим", avg: "Ўртача",
  week: ["Ду", "Се", "Чо", "Па", "Жу", "Ша", "Як"],
  dayMissed: "топширилмаган", dayOff: "ҳисобга олинмаган", dayVoid: "бекор қилинган",
  dayLater: "ҳали ҳисобланмаган", dayToday: "бугун",
  pickReport: "Қайси ҳисобот?", cellReport: "{c} ячейка", report: "Ҳисобот",
  appeals: "Баҳслар", kindDispute: "Норозилик", kindLate: "Кечиккан исбот",
  newN: "{n} янги", more: "Яна {n} та", taskN: "Вазифа №{n}", you: "Сиз", segNew: "Янги хабар",
  months: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};

const ru = {
  natijam: "Мои результаты", bugun: "Сегодня",
  myDays: "Мои дни", avg: "В среднем",
  week: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  dayMissed: "не сдан", dayOff: "не учитывается", dayVoid: "аннулирован",
  dayLater: "ещё не подсчитан", dayToday: "сегодня",
  pickReport: "Какой отчёт?", cellReport: "Ячейка {c}", report: "Отчёт",
  appeals: "Споры", kindDispute: "Возражение", kindLate: "Позднее подтверждение",
  newN: "{n} новых", more: "Ещё {n}", taskN: "Задача №{n}", you: "Вы", segNew: "Новые",
  months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

const en = {
  natijam: "My results", bugun: "Today",
  myDays: "My days", avg: "Average",
  week: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  dayMissed: "not filed", dayOff: "not counted", dayVoid: "voided",
  dayLater: "not counted yet", dayToday: "today",
  pickReport: "Which report?", cellReport: "Cell {c}", report: "Report",
  appeals: "Appeals", kindDispute: "Objection", kindLate: "Late proof",
  newN: "{n} new", more: "{n} more", taskN: "Task #{n}", you: "You", segNew: "New",
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export const NATIJA_T = { uz, uz_cyrl, ru, en };

/** «18-noyabr» / «18 ноября» / «18 November» — a day of the current year, the
 *  one date format Natijam prints. Another year keeps its year. */
export const shortDate = (iso, lang) => {
  const s = String(iso || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  const T = NATIJA_T[lang] || uz;
  const mn = T.months[m - 1];
  const yr = y !== new Date().getFullYear() ? `, ${y}` : "";
  if (lang === "ru") return `${d} ${mn}${yr ? ` ${y}` : ""}`;
  if (lang === "en") return `${d} ${mn}${yr}`;
  return `${d}-${mn}${yr}`;
};
