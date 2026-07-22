import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Gauge, TrendingUp, BarChart3, Trophy, ListChecks, Info,
  CheckCircle2, XCircle, ArrowDownNarrowWide, ArrowUpNarrowWide,
  AlertTriangle, Users, User, RefreshCw, Loader2, Clock, ImageOff, CalendarClock,
  Crown, Award, Shield, ShieldAlert, SlidersHorizontal,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import { SectionHead, Th } from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── score colours (tuned for the dark dashboard — softer emerald/amber/rose,
//    deliberately desaturated so they glow rather than glare against charcoal) ──
const C_BAD = "#F43F5E", C_MID = "#F59E0B", C_GOOD = "#10B981";
const C_TREND = "#D4A95C";                          // brand gold — the completion line
const scoreColor = (v) => (v < 50 ? C_BAD : v < 85 ? C_MID : C_GOOD);

// hex helpers: rgba tint + lighten/darken toward white/black (for chart gradients)
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const mix = (hex, amt) => {                          // amt > 0 → lighter, < 0 → darker
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const ch = (s) => Math.round(((n >> s) & 255) + (t - ((n >> s) & 255)) * p);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

// premium glassy tooltip shared by every chart on the page (padding · blur · shadow)
const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// ── UI copy, all 4 platform languages ─────────────────────────────────────────
const TXT = {
  uz: {
    title: "Lider nazorati", titleBot: "Lider nazorati · Bot", avgSuccess: "O'rtacha muvaffaqiyat", timePeriod: "Davr", shift: "Smena",
    supervisor: "Brigadir", allSups: "Barcha brigadirlar", leader: "Lider", allLeaders: "Barcha liderlar",
    trend: "Bajarilish dinamikasi", taskTitle: "Vazifalar kesimida muvaffaqiyat",
    standing: "Liderlar reytingi", supStanding: "Brigadirlar reytingi",
    toggleLeader: "Lider", toggleSup: "Brigadir",
    standRating: "Reyting", standConsist: "Barqarorlik",
    thPlace: "O'rin", thDays: "Yuborilgan kun", thTier: "Daraja",
    tierTop: "Chempion", tierGood: "A'lo", tierMid: "O'rta", tierBad: "Past",
    supSearchPh: "Brigadir qidirish…",
    standInfo: "Reyting — davrning HAR BIR kuni uchun ball: hisobot yuborilmagan kun 0% hisoblanadi. Barqarorlik — o'sha kunlarning qanchasida umuman hisobot yuborilgani, foizda. Hisob oynasi — tanlangan davr to'liq, birinchi hisobotdan emas. Shu sababli reyting hech qachon barqarorlikdan yuqori bo'lmaydi.\n\nTanlangan ustun — asosiy reyting, ikkinchisi esa qo'shimcha reyting: teng natijalar aynan shu bo'yicha ajratiladi. O'rin faqat ikkala ko'rsatkich ham teng bo'lgandagina bo'lishiladi.",
    standPrimaryHint: "Asosiy reyting — ro'yxat shu ustun bo'yicha saralanadi",
    standSubHint: "Qo'shimcha reyting — asosiy ustun teng chiqqanda o'rinni shu ajratadi",
    tierEdit: "Daraja chegaralari", tierEditSub: "Barcha foydalanuvchilar uchun amal qiladi",
    tierEditRow: "% va undan yuqori",
    tierEditHint: "Chegaralar ro'yxat saralanayotgan ustunga (Reyting yoki Barqarorlik) qo'llanadi. Eng past chegaradan pastda qolganlar — «Past».",
    tierEditOrder: "Chegaralar kamayib borishi kerak: Chempion > A'lo > O'rta.",
    save: "Saqlash", cancel: "Bekor qilish",
    winLabel: "Hisob oynasi", daysSent: "Yuborilgan", daysMissed: "O'tkazib yuborilgan",
    tableTitle: "Oxirgi hisobotlar (past ko'rsatkich birinchi)",
    thDate: "Sana", thLeader: "Lider", thScore: "Natija", thFailed: "Xatolar", thAction: "Harakat",
    thSubmitted: "Yuborilgan", lateTitle: "Hisobot kunidan keyin yuborilgan", dayAbbr: "kun",
    notAsked: "So'ralmagan", submittedAt: "Yuborilgan",
    details: "Batafsil", missed: "ta vazifa bajarilmadi", modalTitle: "Hisobot tafsilotlari",
    noIssues: "Muammo aniqlanmadi.", noReason: "Xatolik sababi ko'rsatilmagan.",
    task: "Vazifa", noData: "Ma'lumot yo'q", taskInfoTitle: "Vazifalar mazmuni va talablari",
    taskDesc: "Vazifa tavsifi", taskWeight: "Vazni", taskNote: "Eslatma / Talablar",
    lowTask: "Eng past vazifa", lowSup: "Eng past brigadir", lowLeader: "Eng past lider",
    tipLowTask: "Davr ichida eng kam bajarilgan vazifa",
    tipLowSup: "Eng past o'rtacha ko'rsatkichli brigadir",
    tipLowLeader: "Eng past o'rtacha ko'rsatkichli lider",
    searchPh: "Lider qidirish…", bandAll: "Barchasi", noMatch: "Filtrlarga mos hisobot yo'q",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…", refreshed: "Yangilandi",
    lastSynced: "Oxirgi yangilanish", never: "hech qachon",
    photoFailed: "Rasm yuklanmadi", retry: "Qayta urinish",
  },
  uz_cyrl: {
    title: "Лидер назорати", titleBot: "Лидер назорати · Бот", avgSuccess: "Ўртача муваффақият", timePeriod: "Давр", shift: "Смена",
    supervisor: "Бригадир", allSups: "Барча бригадирлар", leader: "Лидер", allLeaders: "Барча лидерлар",
    trend: "Бажарилиш динамикаси", taskTitle: "Вазифалар кесимида муваффақият",
    standing: "Лидерлар рейтинги", supStanding: "Бригадирлар рейтинги",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
    standRating: "Рейтинг", standConsist: "Барқарорлик",
    thPlace: "Ўрин", thDays: "Юборилган кун", thTier: "Даража",
    tierTop: "Чемпион", tierGood: "Аъло", tierMid: "Ўрта", tierBad: "Паст",
    supSearchPh: "Бригадир қидириш…",
    standInfo: "Рейтинг — даврнинг ҲАР БИР куни учун балл: ҳисобот юборилмаган кун 0% ҳисобланади. Барқарорлик — ўша кунларнинг қанчасида умуман ҳисобот юборилгани, фоизда. Ҳисоб ойнаси — танланган давр тўлиқ, биринчи ҳисоботдан эмас. Шу сабабли рейтинг ҳеч қачон барқарорликдан юқори бўлмайди.\n\nТанланган устун — асосий рейтинг, иккинчиси эса қўшимча рейтинг: тенг натижалар айнан шу бўйича ажратилади. Ўрин фақат иккала кўрсаткич ҳам тенг бўлгандагина бўлишилади.",
    standPrimaryHint: "Асосий рейтинг — рўйхат шу устун бўйича сараланади",
    standSubHint: "Қўшимча рейтинг — асосий устун тенг чиққанда ўринни шу ажратади",
    tierEdit: "Даража чегаралари", tierEditSub: "Барча фойдаланувчилар учун амал қилади",
    tierEditRow: "% ва ундан юқори",
    tierEditHint: "Чегаралар рўйхат сараланаётган устунга (Рейтинг ёки Барқарорлик) қўлланади. Энг паст чегарадан пастда қолганлар — «Паст».",
    tierEditOrder: "Чегаралар камайиб бориши керак: Чемпион > Аъло > Ўрта.",
    save: "Сақлаш", cancel: "Бекор қилиш",
    winLabel: "Ҳисоб ойнаси", daysSent: "Юборилган", daysMissed: "Ўтказиб юборилган",
    tableTitle: "Охирги ҳисоботлар (паст кўрсаткич биринчи)",
    thDate: "Сана", thLeader: "Лидер", thScore: "Натижа", thFailed: "Хатолар", thAction: "Ҳаракат",
    thSubmitted: "Юборилган", lateTitle: "Ҳисобот кунидан кейин юборилган", dayAbbr: "кун",
    notAsked: "Сўралмаган", submittedAt: "Юборилган",
    details: "Батафсил", missed: "та вазифа бажарилмади", modalTitle: "Ҳисобот тафсилотлари",
    noIssues: "Муаммо аниқланмади.", noReason: "Хатолик сабаби кўрсатилмаган.",
    task: "Вазифа", noData: "Маълумот йўқ", taskInfoTitle: "Вазифалар мазмуни ва талаблари",
    taskDesc: "Вазифа тавсифи", taskWeight: "Вазни", taskNote: "Эслатма / Талаблар",
    lowTask: "Энг паст вазифа", lowSup: "Энг паст бригадир", lowLeader: "Энг паст лидер",
    tipLowTask: "Давр ичида энг кам бажарилган вазифа",
    tipLowSup: "Энг паст ўртача кўрсаткичли бригадир",
    tipLowLeader: "Энг паст ўртача кўрсаткичли лидер",
    searchPh: "Лидер қидириш…", bandAll: "Барчаси", noMatch: "Филтрларга мос ҳисобот йўқ",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", refreshed: "Янгиланди",
    lastSynced: "Охирги янгиланиш", never: "ҳеч қачон",
    photoFailed: "Расм юкланмади", retry: "Қайта уриниш",
  },
  ru: {
    title: "Контроль лидеров", titleBot: "Контроль лидеров · Бот", avgSuccess: "Средний успех", timePeriod: "Период", shift: "Смена",
    supervisor: "Бригадир", allSups: "Все бригадиры", leader: "Лидер", allLeaders: "Все лидеры",
    trend: "Тренд выполнения", taskTitle: "Успех по задачам",
    standing: "Рейтинг лидеров", supStanding: "Рейтинг бригадиров",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
    standRating: "Рейтинг", standConsist: "Стабильность",
    thPlace: "Место", thDays: "Сдано дней", thTier: "Уровень",
    tierTop: "Чемпион", tierGood: "Отлично", tierMid: "Средне", tierBad: "Низко",
    supSearchPh: "Поиск бригадира…",
    standInfo: "Рейтинг — балл за КАЖДЫЙ день периода: день без отчёта считается за 0%. Стабильность — доля этих дней, за которые отчёт вообще сдан. Окно расчёта — весь выбранный период, а не с первого отчёта. Поэтому рейтинг никогда не бывает выше стабильности.\n\nВыбранная вкладка — основной рейтинг, вторая колонка — подрейтинг: именно она разводит равные результаты. Место делится только тогда, когда совпали оба показателя.",
    standPrimaryHint: "Основной рейтинг — список сортируется по этой колонке",
    standSubHint: "Подрейтинг — разводит места при равенстве в основной колонке",
    tierEdit: "Границы уровней", tierEditSub: "Действуют для всех пользователей",
    tierEditRow: "% и выше",
    tierEditHint: "Границы применяются к тому столбцу, по которому отсортирован список (Рейтинг или Стабильность). Всё, что ниже последней границы, — «Низко».",
    tierEditOrder: "Границы должны убывать: Чемпион > Отлично > Средне.",
    save: "Сохранить", cancel: "Отмена",
    winLabel: "Окно расчёта", daysSent: "Сдано", daysMissed: "Пропущено",
    tableTitle: "Последние отчёты (сначала низкий балл)",
    thDate: "Дата", thLeader: "Лидер", thScore: "Балл", thFailed: "Пропущено", thAction: "Действие",
    thSubmitted: "Отправлено", lateTitle: "Отправлено позже отчётного дня", dayAbbr: "дн.",
    notAsked: "Не задавалась", submittedAt: "Отправлено",
    details: "Детали", missed: "задач пропущено", modalTitle: "Детали отчёта",
    noIssues: "Проблем не выявлено.", noReason: "Причина не указана.",
    task: "Задача", noData: "Нет данных", taskInfoTitle: "Содержание и требования задач",
    taskDesc: "Описание задачи", taskWeight: "Вес", taskNote: "Примечания / Требования",
    lowTask: "Худшая задача", lowSup: "Худший бригадир", lowLeader: "Худший лидер",
    tipLowTask: "Наименее выполняемая задача за период",
    tipLowSup: "Бригадир с наименьшим средним баллом",
    tipLowLeader: "Лидер с наименьшим средним баллом",
    searchPh: "Поиск лидера…", bandAll: "Все", noMatch: "Нет отчётов под фильтры",
    refresh: "Обновить", refreshing: "Обновление…", refreshed: "Обновлено",
    lastSynced: "Обновлено", never: "никогда",
    photoFailed: "Не удалось загрузить фото", retry: "Повторить",
  },
  en: {
    title: "Leader Monitoring", titleBot: "Leader Monitoring · Bot", avgSuccess: "Average Success", timePeriod: "Period", shift: "Shift",
    supervisor: "Supervisor", allSups: "All Supervisors", leader: "Leader", allLeaders: "All Leaders",
    trend: "Completion Trend", taskTitle: "Success per Task",
    standing: "Leader Standings", supStanding: "Supervisor Standings",
    toggleLeader: "Leader", toggleSup: "Supervisor",
    standRating: "Rating", standConsist: "Consistency",
    thPlace: "Place", thDays: "Days filed", thTier: "Tier",
    tierTop: "Champion", tierGood: "Excellent", tierMid: "Average", tierBad: "Low",
    supSearchPh: "Search supervisor…",
    standInfo: "Rating — a score for EVERY day of the period: a day with no report counts as 0%. Consistency — the share of those days that carry a report at all. The scoring window is the whole picked period, not from the first report. Rating can therefore never exceed consistency.\n\nThe active tab is the primary ranking and the other column is its sub-rating: equal results are separated by it. A place is shared only when BOTH figures match.",
    standPrimaryHint: "Primary ranking — the list is sorted by this column",
    standSubHint: "Sub-rating — breaks the tie when the primary column is equal",
    tierEdit: "Grade cutoffs", tierEditSub: "Applies to every viewer",
    tierEditRow: "% and above",
    tierEditHint: "Cutoffs apply to whichever column the list is ranked by (Rating or Consistency). Anything below the lowest cutoff is «Low».",
    tierEditOrder: "Cutoffs must descend: Champion > Excellent > Average.",
    save: "Save", cancel: "Cancel",
    winLabel: "Scoring window", daysSent: "Filed", daysMissed: "Missed",
    tableTitle: "Recent Submissions (Low Score First)",
    thDate: "Date", thLeader: "Leader", thScore: "Score", thFailed: "Failed", thAction: "Action",
    thSubmitted: "Submitted", lateTitle: "Filed after the day it reports on", dayAbbr: "d",
    notAsked: "Not asked", submittedAt: "Submitted",
    details: "Details", missed: "tasks missed", modalTitle: "Submission Details",
    noIssues: "No issues reported.", noReason: "No reason provided for failure.",
    task: "Task", noData: "No Data", taskInfoTitle: "Task Details & Requirements",
    taskDesc: "Task Description", taskWeight: "Weight", taskNote: "Notes / Requirements",
    lowTask: "Lowest Task", lowSup: "Lowest Supervisor", lowLeader: "Lowest Leader",
    tipLowTask: "Least-completed task over the period",
    tipLowSup: "Supervisor with the lowest average score",
    tipLowLeader: "Leader with the lowest average score",
    searchPh: "Search leader…", bandAll: "All", noMatch: "No submissions match the filters",
    refresh: "Refresh", refreshing: "Refreshing…", refreshed: "Refreshed",
    lastSynced: "Last updated", never: "never",
    photoFailed: "Failed to load image", retry: "Retry",
  },
};

// The 13 checklist questions, in the sheet's question order (index + 1 = the
// "N)" in its column headers). The first 12 carry over from
// apps-script/JavaScript.html; T13 was added to the form later, which is why the
// old T12 weight of 10% is now split 5% / 5% across the two. Localized into all
// four UI languages; weights are language-independent and total 100%.
const TASK_DETAILS = [
  { w: "10%",
    ru:      { n: "Фиксация ежедневной загрузки ячейки (план)", note: "фотоотчет" },
    uz:      { n: "Yacheykaning kunlik planini qayd qilish", note: "Foto hisobot" },
    uz_cyrl: { n: "Ячейканинг кунлик планини қайд қилиш", note: "Фото ҳисобот" },
    en:      { n: "Daily cell load fixation (plan)", note: "photo report" } },
  { w: "5%",
    ru:      { n: "Каскадная встреча (открытие - планерка)", note: "Фотоотчет Распределение зон" },
    uz:      { n: "Kaskad uchrashuv (ochilish – rejalashtirish)", note: "Foto hisobot. Zonalarni taqsimlash" },
    uz_cyrl: { n: "Каскад учрашув (очилиш – режалаштириш)", note: "Фото ҳисобот. Зоналарни тақсимлаш" },
    en:      { n: "Cascade meeting (briefing)", note: "Photo report Zone distribution" } },
  { w: "10%",
    ru:      { n: "СОП стандарт", note: "Фотоотчет Фиксация смежных ячеек" },
    uz:      { n: "SOP standarti", note: "Foto hisobot. Qo'shni yacheykalarni qayd qilish" },
    uz_cyrl: { n: "СОП стандарти", note: "Фото ҳисобот. Қўшни ячейкаларни қайд қилиш" },
    en:      { n: "SOP Standard", note: "Photo report adjacent cell fixation" } },
  { w: "15%",
    ru:      { n: "КРУ обход цеха (3 раза в день) (9:00 - 11:00 - 15:00)", note: "Чек лист обхода" },
    uz:      { n: "Obxod sexa (kuniga 3 marta)", note: "Aylanib chiqish chek-listi" },
    uz_cyrl: { n: "Обход цеха (кунига 3 марта)", note: "Айланиб чиқиш чек-листи" },
    en:      { n: "Workshop inspection (3x/day 9:00-11:00-15:00)", note: "Inspection checklist" } },
  { w: "5%",
    ru:      { n: "Прием сырья (холодильник, склад)", note: "Контрольный лист" },
    uz:      { n: "Syryo qabul qilish (sovutgich, ombor)", note: "Nazorat varaqasi" },
    uz_cyrl: { n: "Сырьё қабул қилиш (совутгич, омбор)", note: "Назорат варақаси" },
    en:      { n: "Receiving raw materials", note: "Control sheet" } },
  { w: "5%",
    ru:      { n: "Контроль своевременных поставок (внутреняя логистика)", note: "Фиксация Тайминга захода" },
    uz:      { n: "O'z vaqtida yetkazib berishni nazorat qilish (ichki logistika)", note: "Kirish taymingini qayd qilish" },
    uz_cyrl: { n: "Ўз вақтида етказиб беришни назорат қилиш (ички логистика)", note: "Кириш таймингини қайд қилиш" },
    en:      { n: "Internal logistics timing control", note: "Arrival timing fixation" } },
  { w: "5%",
    ru:      { n: "Заполнение контрольного стенда (САП)", note: "фотоотчет" },
    uz:      { n: "Nazorat stendini to'ldirish (SAP)", note: "Foto hisobot" },
    uz_cyrl: { n: "Назорат стендини тўлдириш (SAP)", note: "Фото ҳисобот" },
    en:      { n: "Control board filling (SAP)", note: "photo report" } },
  { w: "5%",
    ru:      { n: "Заполнение обеспокоенности", note: "фотоотчет" },
    uz:      { n: "Obespokoennosti kiritish", note: "Foto hisobot" },
    uz_cyrl: { n: "Обеспокоенности киритиш", note: "Фото ҳисобот" },
    en:      { n: "Concern reporting", note: "photo report" } },
  { w: "10%",
    ru:      { n: "Фиксация 50% плана в течении смены", note: "Отчет бригадиру" },
    uz:      { n: "Smena davomida rejaning 50% ni qayd qilish", note: "Brigadirga hisobot" },
    uz_cyrl: { n: "Смена давомида режанинг 50% ни қайд қилиш", note: "Бригадирга ҳисобот" },
    en:      { n: "50% plan fixation during shift", note: "Report to supervisor" } },
  { w: "10%",
    ru:      { n: "Закрытие плана САП", note: "Подтверждение бригадира" },
    uz:      { n: "SAP rejasini yopish", note: "Brigadir tasdig'i" },
    uz_cyrl: { n: "SAP режасини ёпиш", note: "Бригадир тасдиғи" },
    en:      { n: "SAP plan closure", note: "Supervisor confirmation" } },
  { w: "10%",
    ru:      { n: "Составление графика", note: "Фотоотчет" },
    uz:      { n: "Ish jadvalini grafika tuzish", note: "Foto hisobot" },
    uz_cyrl: { n: "Иш жадвалини графика тузиш", note: "Фото ҳисобот" },
    en:      { n: "Scheduling", note: "Photo report" } },
  { w: "5%",
    ru:      { n: "Контроль работы зам лидера", note: "Фотоотчет чек листа" },
    uz:      { n: "Zam lider ishini nazorat qilish", note: "Chek-list foto hisoboti" },
    uz_cyrl: { n: "Зам лидер ишини назорат қилиш", note: "Чек-лист фото ҳисоботи" },
    en:      { n: "Assistant leader work control", note: "Checklist photo report" } },
  { w: "5%",
    ru:      { n: "Сменный отчёт лидера", note: "фотоотчет" },
    uz:      { n: "Liderning smena hisoboti", note: "Foto hisobot" },
    uz_cyrl: { n: "Лидернинг смена отчёти", note: "Фото ҳисобот" },
    en:      { n: "Leader's shift report", note: "photo report" } },
];
// `id` is the sheet's question number (1-based). A question that is on the form
// but not yet described here still renders — as "Task N", with no weight.
const taskDetail = (id, lang) => {
  const td = TASK_DETAILS[id - 1];
  if (!td) return { weight: "—", n: "", note: "" };
  const loc = td[lang] || td.uz || td.ru;
  return { weight: td.w, ...loc };
};

const DAY = 86400000;
// Standings row box: py-2 (16) + the 20px value line + the meter (mt-1 + 2.5px)
// + the 1px row border; the head is py-2.5 (20) around the same 20px line.
const STAND_ROW_H = 44;
const STAND_HEAD_H = 41;
const ddmm = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
// "2026-04-08T07:22:58" → "07:22"
const hhmm = (ts) => (ts ? String(ts).slice(11, 16) : "");
// Days between the day a checklist was filed and the day it reports on. > 0 means
// it was written up after the fact, which is what the "late" chip calls out.
const lateDays = (row) => {
  if (!row.submitted_at) return 0;
  const filed = String(row.submitted_at).slice(0, 10);
  const covers = String(row.date).slice(0, 10);
  if (!filed || !covers) return 0;
  return Math.round((new Date(`${filed}T00:00:00`) - new Date(`${covers}T00:00:00`)) / DAY);
};
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO(new Date());
const isoShift = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d); };
const weekStartISO = (iso) => { const d = new Date(iso + "T00:00:00"); return isoShift(iso, -((d.getDay() + 6) % 7)); };

// ── localized long-date formatter ("19th June, 2026" and its translations) ──────
const MONTHS = {
  en:      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru:      ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz:      ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};
const enOrd = (d) => { const t = d % 100; if (t >= 11 && t <= 13) return "th"; return ["th", "st", "nd", "rd"][d % 10] || "th"; };
const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en") return `${d}${enOrd(d)} ${mn}, ${y}`;   // 19th June, 2026
  if (lang === "ru") return `${d} ${mn} ${y}`;               // 19 июня 2026
  return `${d}-${mn}, ${y}`;                                 // 19-iyun, 2026 / 19-июн, 2026
};
// "last updated" timestamp: date + time (locale-aware), for the page header pill.
const fmtDateTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt)) return null;
  return dt.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

// ── small atoms (mirror Trudoyomkost / Production idioms) ───────────────────────
// ── person-name display helpers (for the insight cards) ─────────────────────────
// Source names come from a free-text sheet in "Surname Given [Patronymic]" order,
// sometimes SHOUTED in all-caps. Soften the casing and, when a name is too long
// to fit a card, keep the surname full and abbreviate the rest → "Surname G.".
const titleCaseShout = (s) => {
  const str = String(s ?? "");
  if (str && str === str.toUpperCase() && str !== str.toLowerCase())
    return str.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  return str;
};
const abbrevName = (s) => {
  const parts = String(s ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || String(s ?? "");
  return `${parts[0]} ${parts.slice(1).map((w) => w[0].toUpperCase() + ".").join(" ")}`;
};

// Shrinks a single-line label to fit its container between `max` and `min` px.
// If even `min` overflows, it swaps in the shorter `short` text and re-fits — so
// the full name shows whenever it can, and only the worst cases get abbreviated.
function FitText({ full, short, max = 24, min = 13, className = "", style = {} }) {
  const boxRef = useRef(null);
  const txtRef = useRef(null);
  const [text, setText] = useState(full);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const box = boxRef.current, txt = txtRef.current;
    if (!box || !txt) return;
    const fit = () => {
      const w = box.clientWidth;
      if (!w) return;
      const tryFit = (candidate) => {
        txt.textContent = candidate;
        let s = max;
        txt.style.fontSize = `${s}px`;
        while (txt.scrollWidth > w && s > min) { s -= 1; txt.style.fontSize = `${s}px`; }
        return { fits: txt.scrollWidth <= w, s };
      };
      let chosen = full, r = tryFit(full);
      if (!r.fits && short && short !== full) { chosen = short; r = tryFit(short); }
      setText(chosen);
      setSize(r.s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [full, short, max, min]);

  return (
    <div ref={boxRef} className={`min-w-0 ${className}`}>
      <span ref={txtRef} className="block whitespace-nowrap font-bold leading-none"
        style={{ fontSize: size, ...style }}>{text}</span>
    </div>
  );
}

// Unified insight card. Every KPI shares one container (no per-card border
// quirks): muted label + iconed chip on top, big value below, and the score %
// as a soft-tinted pill so colour stays an *indicator* — never a slab of neon.
// `accent` lights a hairline glow across the top and tints the chip (hero card).
// "+2 kun" — a checklist filed this many days after the day it reports on.
function LateChip({ days, T }) {
  return (
    <span
      title={T.lateTitle}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
      style={{ background: hexA(C_BAD, 0.12), border: `1px solid ${hexA(C_BAD, 0.3)}`, color: C_BAD }}>
      <Clock size={10} />+{days} {T.dayAbbr}
    </span>
  );
}

function StatCard({ label, icon: Icon, tip, value, valueColor, badge, badgeColor, accent, fit }) {
  // `fit` cards hold a person's name: soften the casing, then auto-shrink it to
  // the card width (abbreviating to "Surname G." only if it still won't fit).
  const fitFull = fit ? titleCaseShout(value) : value;
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {accent && <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider font-semibold truncate" style={{ color: "var(--text-3)" }}>{label}</span>
        <span title={tip} className="grid place-items-center w-6 h-6 rounded-lg flex-shrink-0 cursor-help"
          style={{ background: accent ? hexA(accent, 0.14) : "var(--bg-inner)", color: accent || "var(--brand-text)" }}>
          {Icon && <Icon size={13} />}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 min-w-0">
        {fit ? (
          <FitText full={fitFull} short={abbrevName(fitFull)} className="flex-1"
            style={{ color: valueColor || "var(--text-1)" }} />
        ) : (
          <span className="text-2xl font-bold tabular-nums leading-none truncate" style={{ color: valueColor || "var(--text-1)" }}>{value}</span>
        )}
        {badge != null && (
          <span className="text-[11px] font-bold tabular-nums px-2 py-1 rounded-md flex-shrink-0 leading-none"
            style={{ background: hexA(badgeColor, 0.15), color: badgeColor }}>{badge}</span>
        )}
      </div>
    </div>
  );
}

// A report photo that keeps its own load state: on failure it shows a compact
// "failed to load + retry" placeholder in the image's place instead of letting
// the broken <img> bubble up to the boot-diagnostics error overlay in index.html.
function ReportPhoto({ src, T }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) {
    return (
      <div className="mt-2 w-full rounded-lg border flex flex-col items-center justify-center gap-2 py-6 px-3 text-center"
        style={{ minHeight: 120, borderColor: "var(--border)", background: "var(--bg-inner)" }}>
        <ImageOff size={22} color="var(--text-4)" />
        <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{T.photoFailed}</span>
        <button type="button" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
          style={{ color: "var(--brand)", background: hexA("#C8973F", 0.12) }}>
          <RefreshCw size={13} /> {T.retry}
        </button>
      </div>
    );
  }
  // Bumping the query string on retry defeats the browser's cached failed response.
  const url = attempt ? src + (src.includes("?") ? "&" : "?") + "_retry=" + attempt : src;
  return (
    <img src={url} alt="" onClick={() => window.open(src, "_blank")} loading="lazy"
      onError={() => setFailed(true)}
      className="mt-2 w-full rounded-lg border cursor-zoom-in"
      style={{ maxHeight: 240, objectFit: "cover", borderColor: "var(--border)" }} />
  );
}

// A bot-submission proof photo. Unlike the sheet's public Google URLs it sits
// behind the auth-gated backend proxy (the JWT rides the Authorization header),
// so it's fetched as a BLOB and rendered via an object URL — a bare <img src>
// can't attach the token.
function BotPhoto({ id, T }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let obj = "";
    let alive = true;
    setFailed(false);
    setUrl("");
    api.get(`/api/leader-tasks/media/${id}`, { responseType: "blob" })
      .then((res) => {
        obj = URL.createObjectURL(res.data);
        if (alive) setUrl(obj);
        else URL.revokeObjectURL(obj);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
  }, [id, attempt]);
  if (failed) {
    return (
      <div className="mt-2 w-full rounded-lg border flex flex-col items-center justify-center gap-2 py-6 px-3 text-center"
        style={{ minHeight: 120, borderColor: "var(--border)", background: "var(--bg-inner)" }}>
        <ImageOff size={22} color="var(--text-4)" />
        <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{T.photoFailed}</span>
        <button type="button" onClick={() => setAttempt((a) => a + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
          style={{ color: "var(--brand)", background: hexA("#C8973F", 0.12) }}>
          <RefreshCw size={13} /> {T.retry}
        </button>
      </div>
    );
  }
  if (!url) return <SkeletonBlock className="mt-2 h-28 w-full" />;
  return (
    <img src={url} alt="" onClick={() => window.open(url, "_blank")} loading="lazy"
      className="mt-2 w-full rounded-lg border cursor-zoom-in"
      style={{ maxHeight: 240, objectFit: "cover", borderColor: "var(--border)" }} />
  );
}

/* ══ standings (the leaderboard) ══════════════════════════════════════════════
 * Identity hues for the initials chips — full-spectrum so neighbouring names
 * never collide by accident. Decoration, not status: the traffic-light
 * green/amber/rose stays reserved for the numbers themselves. */
const AVA_HUES = ["#8b5cf6", "#2dd4bf", "#f472b6", "#38bdf8", "#fb923c", "#a3e635",
                  "#818cf8", "#e879f9", "#22d3ee", "#facc15", "#fb7185", "#4ade80"];
const hueOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVA_HUES[h % AVA_HUES.length];
};
const initialsOf = (s) => s.trim().split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();

// Medals — gold / silver / bronze for the podium, one attention rose for all
// three cards when the list is flipped (nobody gets a medal for finishing last).
const MEDAL = { 1: "#D4A017", 2: "#9AA4B0", 3: "#C17E45" };

// Tier chip ("Daraja"). Cut from whichever metric is being ranked, so the chip
// always describes the number the list is sorted by. The three cutoffs are org
// policy an admin retunes from the page (GET/PUT /api/leader-tiers) and are held
// globally, not per viewer — a grade has to mean the same thing to the admin,
// the supervisor and the leader reading their own row. These defaults mirror the
// backend's and only render while that fetch is in flight.
const TIER_CUTS = { top: 85, good: 65, mid: 40 };
const TIER_BANDS = [
  { cut: "top",  key: "tierTop",  color: C_GOOD, Icon: Crown },
  { cut: "good", key: "tierGood", color: C_GOOD, Icon: Award },
  { cut: "mid",  key: "tierMid",  color: C_MID,  Icon: Shield },
];
const TIER_BAD = { key: "tierBad", color: C_BAD, Icon: ShieldAlert };
const tierOf = (v, cuts = TIER_CUTS) => TIER_BANDS.find((b) => v >= cuts[b.cut]) || TIER_BAD;
// Cutoffs must stay strictly descending: a band whose floor sits at or above the
// one above it can never be reached. Guards the editor before the PUT does.
const tierOrderOk = (c) =>
  [c?.top, c?.good, c?.mid].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)
  && c.top > c.good && c.good > c.mid;

function Avatar({ name, size = 24 }) {
  const hue = hueOf(name);
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: hexA(hue, 0.18), color: hue }}>
      {initialsOf(name)}
    </span>
  );
}

// The dashed micro-gauge under every number — six segments, lit by the value's
// own band, so a row reads at a glance without parsing the digits.
function Meter({ pct, color }) {
  const on = Math.max(0, Math.min(6, Math.round((pct / 100) * 6)));
  return (
    <span className="flex gap-[2px] mt-1" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 5, height: 2.5, borderRadius: 1, background: i < on ? color : "var(--border-md)" }} />
      ))}
    </span>
  );
}

/* Filed days. `sent + missed` is always the scoring window (missed is derived
 * from it), so the pair is really ONE number out of a constant — rendered as
 * the fraction "18/30". The old "18 – 12" read as a range or a subtraction. */
const daysTotal = (e) => e.sent + e.missed;
const daysPct = (e) => (daysTotal(e) ? (e.sent / daysTotal(e)) * 100 : 0);

function DaysValue({ e }) {
  return (
    <span className="tabular-nums">
      {e.sent}
      <span className="font-normal text-[12px]" style={{ color: "var(--text-4)" }}>/{daysTotal(e)}</span>
    </span>
  );
}

function TierChip({ value, T, cuts }) {
  const t = tierOf(value, cuts);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: hexA(t.color, 0.14), color: t.color }}>
      <t.Icon size={12} />{T[t.key]}
    </span>
  );
}

// One stat inside a podium card: label, value, micro-gauge. The metric the list
// is ranked by gets a brand-gold label so the card says why it is on the card.
function CardStat({ label, value, pct, color, active }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide truncate"
        style={{ color: active ? "var(--brand-text)" : "var(--text-4)" }}>{label}</div>
      <div className="text-[15px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: "var(--text-1)" }}>{value}</div>
      <Meter pct={pct} color={color} />
    </div>
  );
}

/* A podium card — places 1-3, or the bottom three when the list is flipped.
 * Either way it keeps its REAL place number, so the flipped state reads as
 * "the three who need help" rather than as a fake podium. */
function StandCard({ e, worst, metric, T, name, cuts }) {
  const tone = worst ? C_BAD : MEDAL[e.place] || MEDAL[3];
  const Badge = worst ? AlertTriangle : Trophy;
  const ranked = metric === "consist" ? e.consist : e.rating;
  return (
    <div className="relative rounded-2xl overflow-hidden p-3"
      style={{ background: "var(--bg-inner)", border: `1px solid ${hexA(tone, 0.34)}` }}>
      <span aria-hidden className="absolute select-none tabular-nums font-black leading-none"
        style={{ right: 6, bottom: -18, fontSize: 76, color: hexA(tone, 0.1) }}>{e.place}</span>

      <div className="relative flex items-center gap-2">
        <Avatar name={name} size={30} />
        <div className="min-w-0 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{name}</div>
        <Badge size={20} className="ml-auto flex-shrink-0" style={{ color: tone }} />
      </div>

      <div className="relative mt-2"><TierChip value={ranked} T={T} cuts={cuts} /></div>

      <div className="relative grid grid-cols-3 gap-2 mt-2.5">
        <CardStat label={T.daysSent} pct={daysPct(e)} color={scoreColor(daysPct(e))} value={<DaysValue e={e} />} />
        <CardStat label={T.standRating} value={`${e.rating}%`} pct={e.rating} color={scoreColor(e.rating)} active={metric === "rating"} />
        <CardStat label={T.standConsist} value={`${e.consist}%`} pct={e.consist} color={scoreColor(e.consist)} active={metric === "consist"} />
      </div>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
// botMode: the admin-only COPY at /leaders-bot showing the in-bot checklist
// submissions. Deliberately independent of the sheet-driven /leaders — two
// pages, two data sources, no refresh button (the DB needs no sync).
export default function Leaders({ botMode = false }) {
  const { auth } = useAuth();
  const { lang } = useLang();
  const { tl } = useTranslit();
  // Person names everywhere on the page: transliterate, then soften SHOUTED
  // all-caps source entries to capital-case ("TURDIMURODOV NODIR" → "Turdimurodov Nodir").
  const nm = (s) => titleCaseShout(tl(s));
  const { gridColor, labelColor, legendColor } = useChartTheme();
  const T = TXT[lang] || TXT.uz;

  // Supervisors are locked to their own unit: the backend returns only their
  // rows, so they get no supervisor filter and no supervisor standings toggle.
  const isSupervisor = auth?.role === "supervisor";
  // A leader is locked to their OWN checklist rows (scoped server-side by name),
  // so they get no shift / supervisor / leader pickers and no standings toggle —
  // the page shows only their own monitoring.
  const isLeader = auth?.role === "leader";
  const isAdmin = auth?.role === "admin";
  // The refresh button is shown to every profile that can open this page — the
  // backend allows the "leaders" sheet re-sync for anyone with page access, and
  // each still only reads their own scoped rows afterwards. Bot mode has no
  // sheet to sync, so no refresh at all.
  const canRefresh = !botMode;

  // Period — a concrete date range picked with the same control as the global
  // filters (presets + calendar popover). Defaults to the last 7 days.
  const [startDate, setStartDate] = useState(() => isoShift(todayISO(), -6));
  const [endDate, setEndDate] = useState(() => todayISO());
  const [fShift, setFShift] = useState(null);                // null = all shifts | 1 | 2
  const [fSup, setFSup] = useState("All");
  const [fLeader, setFLeader] = useState("All");
  const [standMode, setStandMode] = useState("leader");
  const [standDir, setStandDir] = useState("desc");
  const [standMetric, setStandMetric] = useState("rating");  // rating | consist
  const [standSearch, setStandSearch] = useState("");
  const standScroll = useRef(null);
  const [standInfo, setStandInfo] = useState(false);
  const [tierEdit, setTierEdit] = useState(null);            // admin's draft cutoffs
  const [detail, setDetail] = useState(null);
  const [taskInfo, setTaskInfo] = useState(false);

  // table-level filters (independent of the page filters above)
  const [tSearch, setTSearch] = useState("");
  const [tBand, setTBand] = useState("all");                 // all | good | mid | bad
  const [tSort, setTSort] = useState({ key: "score", dir: "asc" });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [botMode ? "leaders-bot" : "leaders"],
    queryFn: () => api.get(botMode ? "/admin/leaders-bot" : "/api/leaders").then((r) => r.data),
  });
  const rows = data?.data ?? [];
  const lastSynced = fmtDateTime(data?.last_synced);

  // On-page re-sync of the leaders sheet (same endpoint as the admin panel).
  const qc = useQueryClient();
  const [justSynced, setJustSynced] = useState(false);
  const refreshMut = useMutation({
    mutationFn: () => api.post("/admin/refresh-sheet/leaders").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    },
  });

  // Daraja cutoffs. One global row, so every viewer grades on the same scale;
  // the server decides who may write it back rather than the client's own role.
  const { data: tierData } = useQuery({
    queryKey: ["leader-tiers"],
    queryFn: () => api.get("/api/leader-tiers").then((r) => r.data),
  });
  const tierCuts = useMemo(() => ({
    top:  tierData?.top  ?? TIER_CUTS.top,
    good: tierData?.good ?? TIER_CUTS.good,
    mid:  tierData?.mid  ?? TIER_CUTS.mid,
  }), [tierData]);
  const canEditTiers = !!tierData?.can_edit;
  const tierMut = useMutation({
    mutationFn: (cuts) => api.put("/api/leader-tiers", cuts).then((r) => r.data),
    onSuccess: (d) => { qc.setQueryData(["leader-tiers"], d); setTierEdit(null); },
  });

  // supervisor → leaders cascade
  const supLeaderMap = useMemo(() => {
    const map = { All: new Set() };
    for (const r of rows) {
      if (!r.supervisor || r.supervisor === "N/A") continue;
      if (!map[r.supervisor]) map[r.supervisor] = new Set();
      if (r.leader && r.leader !== "N/A") {
        map[r.supervisor].add(r.leader);
        map.All.add(r.leader);
      }
    }
    return map;
  }, [rows]);
  // supervisor → shift (from the row the backend tags with Manager.shift), so a
  // shift filter can also narrow the supervisor picker. An unmatched supervisor
  // has no shift and drops out once a shift is chosen.
  const supShift = useMemo(() => {
    const m = {};
    for (const r of rows) if (r.supervisor && r.supervisor !== "N/A") m[r.supervisor] = r.shift;
    return m;
  }, [rows]);
  const supervisors = useMemo(
    () => Object.keys(supLeaderMap)
      .filter((s) => s !== "All" && (fShift == null || supShift[s] === fShift))
      .sort(),
    [supLeaderMap, supShift, fShift]);
  // Leader options track the active supervisor AND shift so the picker never
  // offers a leader whose rows aren't in the current scope.
  const leaderOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      if (!r.leader || r.leader === "N/A") continue;
      if (fShift != null && r.shift !== fShift) continue;
      if (fSup !== "All" && r.supervisor !== fSup) continue;
      set.add(r.leader);
    }
    return [...set].sort();
  }, [rows, fShift, fSup]);

  // date-period bounds — plain ISO-string comparison (rows carry "YYYY-MM-DD")
  const filtered = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate)
      && (fShift == null || r.shift === fShift)
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, startDate, endDate, fShift, fSup, fLeader]);

  // The trend chart uses a window widened to at least the last 7 days (ending
  // at the selected end date), so short periods still draw a meaningful line.
  const trendFrom = useMemo(() => {
    if (!endDate) return startDate;
    const weekAgo = isoShift(endDate, -6);
    return startDate && startDate < weekAgo ? startDate : weekAgo;
  }, [startDate, endDate]);
  const trendRows = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!trendFrom || d >= trendFrom) && (!endDate || d <= endDate)
      && (fShift == null || r.shift === fShift)
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, trendFrom, endDate, fShift, fSup, fLeader]);

  const hasData = filtered.length > 0;

  // Aggregates over the selected period (KPIs, task chart, standings, table).
  // Tasks are keyed by the sheet's question number, and a question nobody was
  // asked (`answered: false` — it was added to the form after these submissions)
  // is left out of its own rate instead of counting as a failure. Rows synced
  // before the backend carried the flag have no `answered` key: those are real
  // answers, so only an explicit `false` excludes one.
  const { avg, taskStats } = useMemo(() => {
    if (!filtered.length) return { avg: 0, taskStats: [] };
    const acc = new Map();                                    // question id → {done, asked}
    let total = 0;
    for (const r of filtered) {
      total += r.completion;
      for (const tk of r.tasks || []) {
        const id = Number(tk.id);
        if (!Number.isFinite(id)) continue;
        const a = acc.get(id) || { done: 0, asked: 0 };
        if (tk.answered !== false) { a.asked++; if (tk.done) a.done++; }
        acc.set(id, a);
      }
    }
    return {
      avg: Math.round(total / filtered.length),
      taskStats: [...acc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([id, a]) => ({
          id, asked: a.asked,
          rate: a.asked ? Math.round((a.done / a.asked) * 100) : null,
        })),
    };
  }, [filtered]);

  // Every question on the form keeps its slot on the axis, but one nobody has
  // answered plots as null — an empty space under its label, not a 0% bar. A 0%
  // bar would read as "the leaders never do this", when in truth they were never
  // asked, and it would take the worst-task card on no evidence.
  const chartTasks = taskStats;

  // Trend series — daily points for short windows; aggregates into weekly /
  // monthly buckets as the span grows so the date axis stays readable.
  const { trendCats, trendVals, trendTips } = useMemo(() => {
    if (!trendRows.length) return { trendCats: [], trendVals: [], trendTips: [] };
    const byDay = {};
    for (const r of trendRows) {
      const d = String(r.date).slice(0, 10);
      (byDay[d] ||= { sum: 0, n: 0 });
      byDay[d].sum += r.completion; byDay[d].n++;
    }
    const days = Object.keys(byDay).sort();
    const span = Math.round((new Date(days[days.length - 1] + "T00:00:00") - new Date(days[0] + "T00:00:00")) / DAY) + 1;
    const mode = span <= 31 ? "day" : span <= 180 ? "week" : "month";
    const buckets = {};
    for (const d of days) {
      const key = mode === "day" ? d : mode === "week" ? weekStartISO(d) : d.slice(0, 7);
      (buckets[key] ||= { sum: 0, n: 0 });
      buckets[key].sum += byDay[d].sum; buckets[key].n += byDay[d].n;
    }
    const keys = Object.keys(buckets).sort();
    const label = (k) => (mode === "month" ? `${k.slice(5, 7)}.${k.slice(0, 4)}` : ddmm(k));
    return {
      trendCats: keys.map(label),
      trendVals: keys.map((k) => Math.round(buckets[k].sum / buckets[k].n)),
      // weekly buckets get a full "start – end" range in the tooltip
      trendTips: keys.map((k) => (mode === "week" ? `${ddmm(k)} – ${ddmm(isoShift(k, 6))}` : label(k))),
    };
  }, [trendRows]);

  const effStandMode = (isSupervisor || isLeader) ? "leader" : standMode;

  // ── standings ───────────────────────────────────────────────────────────────
  // The scoring window is EXACTLY the picked period — start date to end date,
  // every calendar day in it. Nothing is inferred from where the data happens to
  // begin or end: a day with no report is a real 0%, whether it falls before a
  // leader's first submission, on a Sunday, or after the last sheet sync. Only
  // when a date input is cleared does that edge fall back to the data's own
  // range, since an open-ended window has no other floor or ceiling.
  //
  //   Reyting     — each day's score averaged over EVERY day of the window, a
  //                 day with no report counting as 0%
  //   Barqarorlik — how many of those days carry a report at all, as a %
  //
  // So rating is consistency weighted by how good the filed reports were, and
  // can never exceed it; the gap between the two columns is exactly "he shows
  // up, but the reports are weak". In supervisor mode a day's score is the mean
  // of that unit's leaders, so one unit reporting more rows than another doesn't
  // inflate its calendar.
  const standings = useMemo(() => {
    const map = {};                                   // name → { days: Map }
    let winFrom = startDate || null, winTo = endDate || null;
    for (const r of filtered) {
      const key = effStandMode === "leader" ? r.leader : r.supervisor;
      if (!key || key === "N/A") continue;
      const d = String(r.date).slice(0, 10);
      if (!startDate && (winFrom == null || d < winFrom)) winFrom = d;
      if (!endDate && (winTo == null || d > winTo)) winTo = d;
      const e = (map[key] ||= { days: new Map() });
      const day = e.days.get(d) || { sum: 0, n: 0 };
      day.sum += r.completion; day.n++;
      e.days.set(d, day);
    }
    // Both edges can be pre-set from the picker, so an empty result set would
    // otherwise slip through with a valid-looking window and no rows.
    if (!winFrom || !winTo || !Object.keys(map).length)
      return { list: [], winFrom: null, winTo: null, winDays: 0 };
    const winDays = Math.round((new Date(`${winTo}T00:00:00`) - new Date(`${winFrom}T00:00:00`)) / DAY) + 1;

    const list = Object.entries(map).map(([name, e]) => {
      let daySum = 0;
      for (const day of e.days.values()) daySum += day.sum / day.n;
      return {
        name,
        rating: Math.round(daySum / winDays),
        consist: Math.round((e.days.size / winDays) * 100),
        sent: e.days.size,
        missed: winDays - e.days.size,
      };
    });
    // The two columns are ONE ranking, not two: the active tab is the primary
    // metric and the other column is its sub-rating. Ranking on the primary
    // alone put five people on 1st place — a whole shift shares a 6/7 calendar,
    // so Barqarorlik is coarse by construction (only 8 values exist in a 7-day
    // window) and Reyting, the finer number, has to separate them.
    const val = (e) => (standMetric === "consist" ? e.consist : e.rating);
    const alt = (e) => (standMetric === "consist" ? e.rating : e.consist);
    list.sort((a, b) => val(b) - val(a) || alt(b) - alt(a) || a.name.localeCompare(b.name));
    // Competition ranking on the PAIR — a place is shared only when the primary
    // AND the sub-rating both match, i.e. the two are genuinely indistinguishable
    // (1, 2, 2, 4…). `sent` is not a third tiebreak: it is consist over a fixed
    // window, so it can never split a pair the sub-rating already tied.
    const same = (a, b) => val(a) === val(b) && alt(a) === alt(b);
    list.forEach((e, i) => { e.place = i > 0 && same(list[i - 1], e) ? list[i - 1].place : i + 1; });
    return { list, winFrom, winTo, winDays };
  }, [filtered, effStandMode, standMetric, startDate, endDate]);

  // Descending is the natural reading order; flipping reverses the whole list,
  // which drops the three who need help into the card row (see StandCard).
  const standOrdered = useMemo(
    () => (standDir === "desc" ? standings.list : [...standings.list].reverse()),
    [standings, standDir]);
  // A pool of three or fewer is the whole table already — cards there would
  // leave an empty register underneath, so the podium only opens above three.
  const standTop = standOrdered.length > 3 ? standOrdered.slice(0, 3) : [];
  const standRest = standTop.length ? standOrdered.slice(3) : standOrdered;
  // Searching drops the cards and searches the FULL ranking instead of the
  // leftovers, so a name that sits on the podium is still findable.
  const standRows = useMemo(() => {
    const q = standSearch.trim().toLowerCase();
    if (!q) return standRest;
    return standOrdered.filter((e) => nm(e.name).toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [standRest, standOrdered, standSearch, lang]);

  // The register is one continuous ranking, so it scrolls instead of paging —
  // ten rows stay open and the rest is a flick away, no click needed to see 11th
  // place. Height is spelled out from the row box (px-3 py-2 around a 20px value
  // line + the 7px meter = 44px) so it always lands on a whole row, never on a
  // half-cut one that reads as the end of the list.
  const STAND_ROWS_OPEN = 10;
  const standViewH = STAND_HEAD_H + STAND_ROWS_OPEN * STAND_ROW_H;
  // Re-ranking scrolls you back to the top: after flipping the sort or the tab,
  // row 1 is the whole point, and staying at row 30 hides that anything changed.
  useEffect(() => { if (standScroll.current) standScroll.current.scrollTop = 0; },
    [standMetric, standDir, effStandMode, standSearch, startDate, endDate, fShift, fSup, fLeader]);
  // Tabs and sortable headers drive the same pair of knobs — re-picking the
  // column that is already active flips the direction, as a table should.
  const standSort = { key: standMetric, dir: standDir };
  const onStandSort = (k) =>
    (k === standMetric ? setStandDir((d) => (d === "desc" ? "asc" : "desc")) : setStandMetric(k));

  // Insight cards: the worst task plus the worst-performing supervisor / leader.
  const insights = useMemo(() => {
    let lowTask = null;
    // `rate == null` (nobody answered) is not a low score — skip it, or it wins.
    chartTasks.forEach((t) => {
      if (t.rate == null) return;
      if (lowTask == null || t.rate < lowTask.val) lowTask = { id: t.id, val: t.rate };
    });

    const worst = (keyFn) => {
      const map = {};
      for (const r of filtered) {
        const k = keyFn(r);
        if (!k || k === "N/A") continue;
        (map[k] ||= { sum: 0, n: 0 });
        map[k].sum += r.completion; map[k].n++;
      }
      let lo = null;
      for (const [name, v] of Object.entries(map)) {
        const val = Math.round(v.sum / v.n);
        if (lo == null || val < lo.val) lo = { name, val };
      }
      return lo;
    };
    return { lowTask, lowSup: worst((r) => r.supervisor), lowLeader: worst((r) => r.leader) };
  }, [filtered, chartTasks]);

  // table rows: search + score-band filter, then sortable columns
  const displayRows = useMemo(() => {
    const q = tSearch.trim().toLowerCase();
    let arr = filtered.map((r) => ({
      ...r,
      // an unasked question is not a missed one
      _failed: (r.tasks || []).filter((tk) => tk.answered !== false && !tk.done).length,
      _late: lateDays(r),
    }));
    if (q) arr = arr.filter((r) => `${tl(r.leader)} ${r.leader}`.toLowerCase().includes(q));
    if (tBand !== "all") arr = arr.filter((r) => {
      const v = r.completion;
      return tBand === "good" ? v >= 85 : tBand === "mid" ? (v >= 50 && v < 85) : v < 50;
    });
    const dir = tSort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (tSort.key === "date") return a.date < b.date ? -dir : a.date > b.date ? dir : 0;
      if (tSort.key === "leader") return tl(a.leader).localeCompare(tl(b.leader)) * dir;
      if (tSort.key === "failed") return (a._failed - b._failed) * dir;
      // submissions with no timestamp (pre-form-change rows) sort to the bottom
      if (tSort.key === "submitted") {
        const av = a.submitted_at || "", bv = b.submitted_at || "";
        if (!av || !bv) return !av && !bv ? 0 : !av ? 1 : -1;
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      return (a.completion - b.completion) * dir;          // score
    });
    return arr;
  }, [filtered, tSearch, tBand, tSort, tl]);

  const toggleSort = (key) => setTSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  // colored score-band chips, matching the badge palette
  const BANDS = [
    { id: "all",  label: T.bandAll, color: "var(--brand)" },
    { id: "good", label: "≥85%",    color: C_GOOD },
    { id: "mid",  label: "50–84%",  color: C_MID },
    { id: "bad",  label: "<50%",    color: C_BAD },
  ];

  // ── chart options ────────────────────────────────────────────────────────────
  const chartBase = { background: "transparent", toolbar: { show: false }, animations: { enabled: false }, parentHeightOffset: 0, fontFamily: "inherit" };
  // faint dashed grid so the eye can track values without the lines shouting
  const grid = (axis) => ({ borderColor: gridColor, strokeDashArray: 4, xaxis: { lines: { show: axis === "x" } }, yaxis: { lines: { show: axis !== "x" } }, padding: { top: 0, right: 10, bottom: 0, left: 8 } });
  const axisLabel = { style: { colors: labelColor, fontSize: "10px" } };

  // Trend — smooth spline grounded by a soft gradient wash fading to transparent.
  const trendOptions = {
    chart: { ...chartBase, type: "area", zoom: { enabled: false } },
    colors: [C_TREND],
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.02, stops: [0, 90, 100] } },
    // clean spline: no static dot markers — a single marker surfaces on hover
    markers: { size: 0, colors: ["#fff"], strokeColors: C_TREND, strokeWidth: 2, hover: { size: 5 } },
    dataLabels: { enabled: false },
    grid: grid("y"),
    xaxis: { categories: trendCats, tickAmount: trendCats.length > 14 ? 12 : undefined, labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { ...axisLabel, formatter: (v) => Math.round(v) } },
    tooltip: { custom: ({ dataPointIndex }) => tipHTML(trendTips[dataPointIndex] ?? "", `${trendVals[dataPointIndex]}%`, C_TREND) },
  };

  // Per-task bars — rounded tops, vertical gradient (lighter top → darker base),
  // no in-bar numbers; the styled tooltip carries the value on hover.
  const taskOptions = {
    chart: { ...chartBase, type: "bar" },
    plotOptions: { bar: { distributed: true, borderRadius: 6, borderRadiusApplication: "end", columnWidth: "56%" } },
    // an unanswered question carries no colour — its slot stays empty
    colors: chartTasks.map((t) => (t.rate == null ? "transparent" : scoreColor(t.rate))),
    fill: { type: "gradient", gradient: { type: "vertical", gradientToColors: chartTasks.map((t) => (t.rate == null ? "transparent" : mix(scoreColor(t.rate), -0.24))), inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: grid("y"),
    xaxis: { categories: chartTasks.map((t) => `T${t.id}`), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: axisLabel },
    tooltip: { custom: ({ dataPointIndex }) => {
      const t = chartTasks[dataPointIndex];
      if (t.rate == null) return tipHTML(`${T.task} ${t.id}`, T.notAsked, "#94a3b8");
      return tipHTML(`${T.task} ${t.id}`, `${t.rate}%`, scoreColor(t.rate));
    } },
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <Layout title={botMode ? T.titleBot : T.title} showFilters={false}>
      {/* header: title + last-updated + refresh (right side, all profiles) */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{botMode ? T.titleBot : T.title}</h2>
          {/* phones can't spare a whole pill row — updated time rides under the title */}
          {!botMode && (
          <p className="sm:hidden text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }} title={lastSynced || T.never}>
            <CalendarClock size={12} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!botMode && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <CalendarClock size={14} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </span>
          )}
          {canRefresh && (
            <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
              aria-label={T.refresh} title={T.refresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
              style={justSynced
                ? { background: hexA(C_GOOD, 0.15), border: `1px solid ${hexA(C_GOOD, 0.35)}`, color: C_GOOD }
                : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: refreshMut.isPending ? 0.6 : 1 }}>
              {refreshMut.isPending ? <Loader2 size={14} className="animate-spin" />
                : justSynced ? <CheckCircle2 size={14} />
                : <RefreshCw size={14} />}
              <span className="hidden sm:inline">{refreshMut.isPending ? T.refreshing : justSynced ? T.refreshed : T.refresh}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-start gap-3 mb-3">
      <div className={`grid grid-cols-2 ${isSupervisor ? "lg:grid-cols-2" : isLeader ? "lg:grid-cols-1 sm:max-w-xs" : "lg:grid-cols-4"} gap-2 sm:gap-3 flex-1 min-w-[260px]`}>
        {/* Period — same range picker as the global filters (presets + calendar).
            Mobile: full row, labels hidden (controls are self-describing). */}
        <div className="col-span-2 sm:col-span-1">
          <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.timePeriod}</label>
          <DateRangePicker
            dateFrom={startDate}
            dateTo={endDate}
            setDateFrom={setStartDate}
            setDateTo={setEndDate}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>

        {/* Shift — narrows the supervisor picker (and all data) to one shift.
            Hidden for supervisors, who are locked to their own unit/shift, and
            for leaders, who see only their own (single-shift) rows. */}
        {!isSupervisor && !isLeader && (
          <div className="min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.shift}</label>
            <SegmentedToggle fill value={fShift}
              onChange={(v) => { setFShift(v); setFSup("All"); setFLeader("All"); }}
              options={[[null, T.bandAll], [1, "S1"], [2, "S2"]]} />
          </div>
        )}

        {/* Supervisor — shift-managers / admins only; supervisors are locked to
            their own unit and leaders to their own rows */}
        {!isSupervisor && !isLeader && (
          <div className="min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.supervisor}</label>
            <StyledSelect value={fSup} onChange={(v) => { setFSup(v); setFLeader("All"); }}
              options={[{ value: "All", label: T.allSups }, ...supervisors.map((s) => ({ value: s, label: nm(s) }))]} />
          </div>
        )}

        {/* Leader — hidden for leaders, who see only their own monitoring;
            takes the full row on mobile when it is the only select */}
        {!isLeader && (
          <div className={`min-w-0 ${isSupervisor ? "col-span-2 sm:col-span-1" : ""}`}>
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.leader}</label>
            <StyledSelect value={fLeader} onChange={setFLeader}
              options={[{ value: "All", label: T.allLeaders }, ...leaderOptions.map((l) => ({ value: l, label: nm(l) }))]} />
          </div>
        )}
      </div>
      </div>

      {refreshMut.isError && (
        <div className="rounded-2xl p-3 text-xs mb-3" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {refreshMut.error?.response?.data?.detail || String(refreshMut.error)}
        </div>
      )}

      {/* KPI / insight cards */}
      <div className={`grid grid-cols-2 ${isSupervisor ? "lg:grid-cols-3" : isLeader ? "lg:grid-cols-2" : "lg:grid-cols-4"} gap-3 mb-4`}>
        {/* Average success — hero: the only card with an accent glow */}
        <StatCard label={T.avgSuccess} icon={Gauge} tip={T.avgSuccess}
          value={hasData ? `${avg}%` : "—"}
          valueColor={hasData ? scoreColor(avg) : "var(--text-4)"}
          accent={hasData ? scoreColor(avg) : undefined} />

        {/* Lowest-success task */}
        <StatCard label={T.lowTask} icon={AlertTriangle}
          tip={hasData && insights.lowTask ? `T${insights.lowTask.id}: ${taskDetail(insights.lowTask.id, lang).n}` : T.tipLowTask}
          value={hasData && insights.lowTask ? `T${insights.lowTask.id}` : "—"}
          badge={hasData && insights.lowTask ? `${insights.lowTask.val}%` : null}
          badgeColor={hasData && insights.lowTask ? scoreColor(insights.lowTask.val) : "var(--text-4)"} />

        {/* Lowest-performing supervisor — shift-managers / admins only */}
        {!isSupervisor && !isLeader && (
          <StatCard label={T.lowSup} icon={Users} tip={T.tipLowSup} fit
            value={hasData && insights.lowSup ? nm(insights.lowSup.name) : "—"}
            badge={hasData && insights.lowSup ? `${insights.lowSup.val}%` : null}
            badgeColor={hasData && insights.lowSup ? scoreColor(insights.lowSup.val) : "var(--text-4)"} />
        )}

        {/* Lowest-performing leader — hidden for a leader (it's just themselves) */}
        {!isLeader && (
          <StatCard label={T.lowLeader} icon={User} tip={T.tipLowLeader} fit
            value={hasData && insights.lowLeader ? nm(insights.lowLeader.name) : "—"}
            badge={hasData && insights.lowLeader ? `${insights.lowLeader.val}%` : null}
            badgeColor={hasData && insights.lowLeader ? scoreColor(insights.lowLeader.val) : "var(--text-4)"} />
        )}
      </div>

      {isError && (
        <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || "Error"}
        </div>
      )}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <SkeletonBlock className="h-3 w-36 mb-4" /><SkeletonChart className="h-60" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-3 w-44 mb-4" /><SkeletonChart className="h-56" />
          </div>
        </div>
      )}
      {!isLoading && !isError && !hasData && (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.noData} message={null} showUploadLink={false} />
        </div>
      )}

      {hasData && (<>
        {/* Trend + Task */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={TrendingUp} title={T.trend} />
            <div className="px-3 pb-3 pt-1 apx-bare-tip"><ReactApexChart type="area" series={[{ name: "%", data: trendVals }]} options={trendOptions} height={260} /></div>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={BarChart3} title={T.taskTitle}
              right={<button onClick={() => setTaskInfo(true)} className="p-1 rounded transition-colors hover:bg-white/10" title={T.taskInfoTitle} style={{ color: "var(--brand-text)" }}><Info size={15} /></button>} />
            <div className="px-3 pb-3 pt-1 apx-bare-tip"><ReactApexChart type="bar" series={[{ name: "%", data: chartTasks.map((t) => t.rate) }]} options={taskOptions} height={260} /></div>
          </div>
        </div>

        {/* Standings — hidden for a leader (a one-row ranking of themselves) */}
        {!isLeader && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Trophy} title={effStandMode === "leader" ? T.standing : T.supStanding}
            right={
              <div className="flex items-center gap-2">
                {!isSupervisor && !isLeader && (
                  <SegmentedToggle value={standMode} onChange={setStandMode} options={[["leader", T.toggleLeader], ["sup", T.toggleSup]]} />
                )}
                <SegmentedToggle value={standDir} onChange={setStandDir}
                  options={[["desc", <ArrowDownNarrowWide key="d" size={13} />], ["asc", <ArrowUpNarrowWide key="a" size={13} />]]} />
              </div>
            } />

          {/* metric tabs (= the sort presets) + name search */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <SegmentedToggle value={standMetric} onChange={setStandMetric}
              options={[["rating", T.standRating], ["consist", T.standConsist]]} />
            <button onClick={() => setStandInfo(true)} title={T.standInfo}
              className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "var(--brand-text)" }}>
              <Info size={15} />
            </button>
            {canEditTiers && (
              <button onClick={() => setTierEdit(tierCuts)} title={T.tierEdit}
                className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "var(--text-3)" }}>
                <SlidersHorizontal size={15} />
              </button>
            )}
            {standings.winFrom && (
              <span className="hidden md:inline text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {T.winLabel}: {ddmm(standings.winFrom)} – {ddmm(standings.winTo)} · {standings.winDays} {T.dayAbbr}
              </span>
            )}
            <SearchInput value={standSearch} onChange={setStandSearch} className="ml-auto w-full sm:w-56"
              placeholder={effStandMode === "leader" ? T.searchPh : T.supSearchPh} />
          </div>

          {/* podium — the best three, or the three who need help when flipped */}
          {!standSearch.trim() && standTop.length === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3">
              {standTop.map((e) => (
                <StandCard key={e.name} e={e} name={nm(e.name)} worst={standDir === "asc"} metric={standMetric} T={T} cuts={tierCuts} />
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th label={T.thPlace} cls="w-[58px]" />
                  <Th label={effStandMode === "leader" ? T.thLeader : T.supervisor} cls="border-l border-[var(--border)]" />
                  <Th label={T.thDays} cls="border-l border-[var(--border)] w-[132px]" hint={`${T.daysSent} / ${T.winLabel}`} />
                  <Th label={T.standRating} k="rating" sort={standSort} onSort={onStandSort}
                    hint={standMetric === "rating" ? T.standPrimaryHint : T.standSubHint}
                    cls="border-l border-[var(--border)] w-[104px]" />
                  <Th label={T.standConsist} k="consist" sort={standSort} onSort={onStandSort}
                    hint={standMetric === "consist" ? T.standPrimaryHint : T.standSubHint}
                    cls="border-l border-[var(--border)] w-[112px]" />
                  <Th label={T.thTier} cls="border-l border-[var(--border)] w-[116px]" />
                </tr>
              </thead>
              <tbody>
                {standPageRows.map((e) => {
                  const ranked = standMetric === "consist" ? e.consist : e.rating;
                  return (
                    <tr key={e.name} className="transition-colors hover:bg-[var(--bg-inner)]"
                      style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{e.place}</td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={nm(e.name)} size={24} />
                          <span style={{ color: "var(--text-1)" }}>{nm(e.name)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}
                        title={`${T.daysSent}: ${e.sent} · ${T.daysMissed}: ${e.missed}`}>
                        <div className="font-bold" style={{ color: "var(--text-1)" }}>
                          <DaysValue e={e} />
                        </div>
                        <Meter pct={daysPct(e)} color={scoreColor(daysPct(e))} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <div className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{e.rating}%</div>
                        <Meter pct={e.rating} color={scoreColor(e.rating)} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <div className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{e.consist}%</div>
                        <Meter pct={e.consist} color={scoreColor(e.consist)} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <TierChip value={ranked} T={T} cuts={tierCuts} />
                      </td>
                    </tr>
                  );
                })}
                {!standPageRows.length && (
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>{T.noMatch}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-3 pb-3">
            <Pagination page={standPageSafe} pageCount={standPageCount} total={standRows.length}
              pageSize={STAND_PAGE} onPage={setStandPage} />
          </div>
        </div>
        )}

        {/* Recent submissions */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={ListChecks} title={T.tableTitle} />

          {/* table-level filters: leader search + score-band chips */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <SearchInput
              value={tSearch}
              onChange={setTSearch}
              placeholder={T.searchPh}
              className="flex-1 min-w-[150px]"
            />
            <SegmentedToggle
              value={tBand}
              onChange={setTBand}
              options={BANDS.map((b) => [b.id, b.label])}
            />
          </div>

          {displayRows.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{T.noMatch}</div>
          ) : (<>
            {/* desktop / tablet: sortable table (canonical POSITIONS-style) */}
            <div className="hidden sm:block overflow-auto" style={{ maxHeight: 460 }}>
              <table className="w-full text-xs whitespace-nowrap [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)] [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)] [&_tbody_tr:hover]:bg-[var(--bg-inner)]" style={{ color: "var(--text-1)", minWidth: 680 }}>
                <thead>
                  <tr>
                    <Th label={T.thDate}      k="date"      sort={tSort} onSort={toggleSort} />
                    <Th label={T.thSubmitted} k="submitted" sort={tSort} onSort={toggleSort} />
                    <Th label={T.thLeader}    k="leader"    sort={tSort} onSort={toggleSort} />
                    <Th label={T.thScore}     k="score"     sort={tSort} onSort={toggleSort} align="center" />
                    <Th label={T.thFailed}    k="failed"    sort={tSort} onSort={toggleSort} />
                    <Th label={T.thAction} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => (
                    <tr key={r.uid}>
                      <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>{fmtDate(r.date, lang)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>
                        {r.submitted_at ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="tabular-nums">{hhmm(r.submitted_at)}</span>
                            {r._late > 0 && <LateChip days={r._late} T={T} />}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{nm(r.leader)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold text-white tabular-nums" style={{ background: scoreColor(r.completion) }}>
                          {Math.round(r.completion)}%
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: r._failed ? "#ef4444" : "var(--text-4)" }}>{r._failed} {T.missed}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => setDetail(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                          {T.details}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile: stacked cards */}
            <div className="sm:hidden overflow-y-auto" style={{ maxHeight: 480 }}>
              {displayRows.map((r, i) => (
                <div key={r.uid} className="p-3 flex flex-col gap-2" style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{nm(r.leader)}</span>
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold text-white tabular-nums flex-shrink-0" style={{ background: scoreColor(r.completion) }}>
                      {Math.round(r.completion)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--text-4)" }}>{fmtDate(r.date, lang)}</span>
                    <span className="text-xs" style={{ color: r._failed ? "#ef4444" : "var(--text-4)" }}>{r._failed} {T.missed}</span>
                  </div>
                  {r.submitted_at && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-4)" }}>
                      <Clock size={11} />
                      <span className="tabular-nums">{hhmm(r.submitted_at)}</span>
                      {r._late > 0 && <LateChip days={r._late} T={T} />}
                    </div>
                  )}
                  <button onClick={() => setDetail(r)} className="w-full px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                    {T.details}
                  </button>
                </div>
              ))}
            </div>
          </>)}
        </div>
      </>)}

      {/* Detail modal */}
      {detail && (
        <Modal maxWidth="max-w-3xl" title={`${T.modalTitle}: ${nm(detail.leader)} (${fmtDate(detail.date, lang)})`}
          subtitle={detail.submitted_at
            ? `${T.submittedAt}: ${fmtDate(detail.submitted_at, lang)} ${hhmm(detail.submitted_at)}${lateDays(detail) > 0 ? ` (+${lateDays(detail)} ${T.dayAbbr})` : ""}`
            : null}
          onClose={() => setDetail(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(detail.tasks || []).map((tk, i) => {
              const photos = (tk.photo || "").split(",").map((p) => p.trim()).filter((p) => p.includes("http"));
              const id = Number(tk.id);
              const desc = taskDetail(id, lang).n;
              // a question the form did not put to this leader — neither pass nor fail
              const unasked = tk.answered === false;
              const tone = unasked ? "#94a3b8" : tk.done ? C_GOOD : C_BAD;
              return (
                <div key={i} className="rounded-xl p-3" style={{ background: hexA(tone, 0.08), border: `1px solid ${hexA(tone, 0.25)}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{T.task} {tk.id}</span>
                    {unasked ? <span className="text-[10px] font-semibold" style={{ color: tone }}>{T.notAsked}</span>
                      : tk.done ? <CheckCircle2 size={16} color={C_GOOD} /> : <XCircle size={16} color={C_BAD} />}
                  </div>
                  {desc && <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-1)" }}>{desc}</p>}
                  {!unasked && <p className="text-xs mb-0" style={{ color: "var(--text-3)" }}>{tk.reason || (tk.done ? T.noIssues : T.noReason)}</p>}
                  {photos.map((p, pi) => (
                    <ReportPhoto key={pi} src={p} T={T} />
                  ))}
                  {(tk.media || []).map((mid) => (
                    <BotPhoto key={`m${mid}`} id={mid} T={T} />
                  ))}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Task-info modal */}
      {standInfo && (
        <Modal maxWidth="max-w-lg" title={effStandMode === "leader" ? T.standing : T.supStanding} onClose={() => setStandInfo(false)}>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>{T.standInfo}</p>
          {standings.winFrom && (
            <p className="text-xs mt-3 tabular-nums" style={{ color: "var(--text-4)" }}>
              {T.winLabel}: {ddmm(standings.winFrom)} – {ddmm(standings.winTo)} · {standings.winDays} {T.dayAbbr}
            </p>
          )}
        </Modal>
      )}

      {/* Daraja cutoffs — admin only, saved globally for every viewer */}
      {tierEdit && (
        <Modal maxWidth="max-w-md" title={T.tierEdit} subtitle={T.tierEditSub}
          icon={<SlidersHorizontal size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setTierEdit(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setTierEdit(null)}>{T.cancel}</Button>
            <Button onClick={() => tierMut.mutate(tierEdit)} loading={tierMut.isPending}
              disabled={!tierOrderOk(tierEdit)}>{T.save}</Button>
          </>}>
          <div className="space-y-3">
            {TIER_BANDS.map((b) => (
              <FormField key={b.cut} label={<span className="inline-flex items-center gap-1.5">
                <b.Icon size={12} style={{ color: b.color }} />{T[b.key]}
              </span>}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} value={tierEdit[b.cut]}
                    onChange={(e) => setTierEdit({ ...tierEdit, [b.cut]: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 px-3 py-2 rounded-lg text-sm tabular-nums outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
                  <span className="text-xs" style={{ color: "var(--text-4)" }}>{T.tierEditRow}</span>
                </div>
              </FormField>
            ))}
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>{T.tierEditHint}</p>
            {!tierOrderOk(tierEdit) && (
              <p className="text-xs" style={{ color: C_BAD }}>{T.tierEditOrder}</p>
            )}
          </div>
        </Modal>
      )}

      {taskInfo && (
        <Modal maxWidth="max-w-3xl" title={T.taskInfoTitle} onClose={() => setTaskInfo(false)}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--brand)", color: "#fff" }}>
                <th className="text-left px-3 py-2 text-xs font-semibold" style={{ width: 50 }}>ID</th>
                <th className="text-left px-3 py-2 text-xs font-semibold">{T.taskDesc}</th>
                <th className="text-center px-3 py-2 text-xs font-semibold" style={{ width: 70 }}>{T.taskWeight}</th>
                <th className="text-left px-3 py-2 text-xs font-semibold">{T.taskNote}</th>
              </tr>
            </thead>
            <tbody>
              {TASK_DETAILS.map((_, i) => {
                const d = taskDetail(i + 1, lang);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-bold text-xs" style={{ color: "var(--text-4)" }}>T{i + 1}</td>
                    <td className="px-3 py-2 text-xs font-medium" style={{ color: "var(--text-1)" }}>{d.n}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>{d.weight}</span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-3)" }}>{d.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </Layout>
  );
}
