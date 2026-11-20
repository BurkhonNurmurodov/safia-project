// The leader's floor pages on a PHONE (below md) — «Zagruzka fayli»
// (/production), «Ish grafigi» (/kelish), «Kutish» (/idle-cell): the few words
// the phone layout of the leader-phone redesign (2026-11-20,
// docs/plan-leader-mobile.md) added, in the four platform languages. Read with
// `useFloorText()`; `fill(s, {n: 3})` puts the numbers in. Every other string
// these pages print stays in i18n/translations.js.
import { useLang } from "../context/LangContext";

const uz = {
  // /production
  noPlan: "Bu kun uchun reja kiritilmagan",
  kpiTeamScope: "Ko'rsatkichlar butun jamoa bo'yicha",
  cellsAll: "Hammasi",
  actions: "Amallar",
  plan: "Reja",
  fact: "Fakt",
  vyp: "Bajarish",
  cell: "Yacheyka",
  editQty: "{what} — {name}",
  exportExcel: "Excel yuklab olish",
  // /kelish
  t11: "11-vazifa",
  t11Title: "11-vazifa tekshiruvi: {d}, soat {t}",
  // /idle-cell
  title: "Kutish",
  notePh: "Kutish sababi",
  timelineEmpty: "Vaqt chizig'i bo'sh — bu kun kutish yo'q",
  catGuide: "Kategoriyalar",
};

const uz_cyrl = {
  noPlan: "Бу кун учун режа киритилмаган",
  kpiTeamScope: "Кўрсаткичлар бутун жамоа бўйича",
  cellsAll: "Ҳаммаси",
  actions: "Амаллар",
  plan: "Режа",
  fact: "Факт",
  vyp: "Бажариш",
  cell: "Ячейка",
  editQty: "{what} — {name}",
  exportExcel: "Excel юклаб олиш",
  t11: "11-вазифа",
  t11Title: "11-вазифа текшируви: {d}, соат {t}",
  title: "Кутиш",
  notePh: "Кутиш сабаби",
  timelineEmpty: "Вақт чизиғи бўш — бу кун кутиш йўқ",
  catGuide: "Категориялар",
};

const ru = {
  noPlan: "План на этот день не внесён",
  kpiTeamScope: "Показатели — по всей команде",
  cellsAll: "Все",
  actions: "Действия",
  plan: "План",
  fact: "Факт",
  vyp: "Выполнение",
  cell: "Ячейка",
  editQty: "{what} — {name}",
  exportExcel: "Скачать Excel",
  t11: "Задача №11",
  t11Title: "Проверка задачи №11: {d}, {t}",
  title: "Ожидание",
  notePh: "Причина ожидания",
  timelineEmpty: "Шкала дня пуста — ожиданий нет",
  catGuide: "Категории",
};

const en = {
  noPlan: "No plan entered for this day",
  kpiTeamScope: "Figures for the whole team",
  cellsAll: "All",
  actions: "Actions",
  plan: "Plan",
  fact: "Actual",
  vyp: "Done",
  cell: "Cell",
  editQty: "{what} — {name}",
  exportExcel: "Download Excel",
  t11: "Task #11",
  t11Title: "Task #11 check: {d} at {t}",
  title: "Waiting",
  notePh: "Reason for the wait",
  timelineEmpty: "The day's timeline is empty — no waits",
  catGuide: "Categories",
};

export const FLOOR_TXT = { uz, uz_cyrl, ru, en };

export const fill = (s, params) =>
  Object.entries(params || {}).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v ?? "")), String(s ?? ""));

export function useFloorText() {
  const { lang } = useLang();
  return FLOOR_TXT[lang] || FLOOR_TXT.ru;
}
