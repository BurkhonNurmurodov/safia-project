// The phone-only words of /cell-concerns, /concerns and /tasks (2026-11-20, the
// leader-phone redesign) in the four platform languages — beside the pages, the
// leaders-KPI pages' pattern (leadersKpiText). Everything else on those pages
// still reads translations.js. `phoneDay` is the ONE date the three pages print
// on a phone: «9-noyabr» inside the current year, «9-noyabr, 2025» outside it
// (the comment thread's day dividers read the same way).

const uz = {
  tabWrite: "Yozish",
  editText: "Matnni tahrirlash",
  comments: "Izohlar",
  due: "Muddat",
  overdue: "Muddati o'tgan",
  markUrgent: "Shoshilinch deb belgilash",
  unmarkUrgent: "Shoshilinchni olib tashlash",
  insightScope: "Faqat davr va tuzilma bo'yicha",
  setBy: "Qo'ydi",
  urgent: "Shoshilinch",
  months: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
};

const uz_cyrl = {
  tabWrite: "Ёзиш",
  editText: "Матнни таҳрирлаш",
  comments: "Изоҳлар",
  due: "Муддат",
  overdue: "Муддати ўтган",
  markUrgent: "Шошилинч деб белгилаш",
  unmarkUrgent: "Шошилинчни олиб ташлаш",
  insightScope: "Фақат давр ва тузилма бўйича",
  setBy: "Қўйди",
  urgent: "Шошилинч",
  months: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};

const ru = {
  tabWrite: "Написать",
  editText: "Изменить текст",
  comments: "Комментарии",
  due: "Срок",
  overdue: "Просрочено",
  markUrgent: "Отметить срочной",
  unmarkUrgent: "Снять срочность",
  insightScope: "Только по периоду и структуре",
  setBy: "Поставил(а)",
  urgent: "Срочно",
  months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

const en = {
  tabWrite: "Write",
  editText: "Edit the text",
  comments: "Comments",
  due: "Due",
  overdue: "Overdue",
  markUrgent: "Mark urgent",
  unmarkUrgent: "Unmark urgent",
  insightScope: "Period and org chain only",
  setBy: "Set by",
  urgent: "Urgent",
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export const TXT = { uz, uz_cyrl, ru, en };

export const phoneText = (lang) => TXT[lang] || TXT.uz;

// «9-noyabr» / «9 ноября» / «9 November» — the year only when it is not this one.
export function phoneDay(iso, lang) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  const mn = phoneText(lang).months[m - 1];
  const year = y !== new Date().getFullYear();
  if (lang === "ru" || lang === "en") return year ? `${d} ${mn} ${y}` : `${d} ${mn}`;
  return year ? `${d}-${mn}, ${y}` : `${d}-${mn}`;
}
