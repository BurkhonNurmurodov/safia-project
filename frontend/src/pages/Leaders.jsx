import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Gauge, TrendingUp, BarChart3, Trophy, ListChecks, Info,
  CheckCircle2, XCircle, ArrowDownNarrowWide, ArrowUpNarrowWide,
  AlertTriangle, Users, User, RefreshCw, Loader2, Clock,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import SearchInput from "../components/ui/SearchInput";
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
    title: "Lider nazorati", avgSuccess: "O'rtacha muvaffaqiyat", timePeriod: "Davr",
    supervisor: "Brigadir", allSups: "Barcha brigadirlar", leader: "Lider", allLeaders: "Barcha liderlar",
    trend: "Bajarilish dinamikasi", taskTitle: "Vazifalar kesimida muvaffaqiyat",
    standing: "Liderlar reytingi", supStanding: "Brigadirlar reytingi",
    toggleLeader: "Lider", toggleSup: "Brigadir",
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
  },
  uz_cyrl: {
    title: "Лидер назорати", avgSuccess: "Ўртача муваффақият", timePeriod: "Давр",
    supervisor: "Бригадир", allSups: "Барча бригадирлар", leader: "Лидер", allLeaders: "Барча лидерлар",
    trend: "Бажарилиш динамикаси", taskTitle: "Вазифалар кесимида муваффақият",
    standing: "Лидерлар рейтинги", supStanding: "Бригадирлар рейтинги",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
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
  },
  ru: {
    title: "Контроль лидеров", avgSuccess: "Средний успех", timePeriod: "Период",
    supervisor: "Бригадир", allSups: "Все бригадиры", leader: "Лидер", allLeaders: "Все лидеры",
    trend: "Тренд выполнения", taskTitle: "Успех по задачам",
    standing: "Рейтинг лидеров", supStanding: "Рейтинг бригадиров",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
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
  },
  en: {
    title: "Leader Monitoring", avgSuccess: "Average Success", timePeriod: "Period",
    supervisor: "Supervisor", allSups: "All Supervisors", leader: "Leader", allLeaders: "All Leaders",
    trend: "Completion Trend", taskTitle: "Success per Task",
    standing: "Leader Standings", supStanding: "Supervisor Standings",
    toggleLeader: "Leader", toggleSup: "Supervisor",
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
  },
};

// 12 task descriptions, carried over from apps-script/JavaScript.html.
// Localized into all four UI languages (uz / uz_cyrl / ru / en);
// weights are language-independent.
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
  { w: "10%",
    ru:      { n: "Контроль работы зам лидера", note: "Фотоотчет чек листа" },
    uz:      { n: "Zam lider ishini nazorat qilish", note: "Chek-list foto hisoboti" },
    uz_cyrl: { n: "Зам лидер ишини назорат қилиш", note: "Чек-лист фото ҳисоботи" },
    en:      { n: "Assistant leader work control", note: "Checklist photo report" } },
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

// ── main page ──────────────────────────────────────────────────────────────────
export default function Leaders() {
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
  // The sheet-sync endpoint is admin-only, so only admins see the refresh button.
  const isAdmin = auth?.role === "admin";

  // Period — a concrete date range picked with the same control as the global
  // filters (presets + calendar popover). Defaults to the last 7 days.
  const [startDate, setStartDate] = useState(() => isoShift(todayISO(), -6));
  const [endDate, setEndDate] = useState(() => todayISO());
  const [fSup, setFSup] = useState("All");
  const [fLeader, setFLeader] = useState("All");
  const [standMode, setStandMode] = useState("leader");
  const [standDir, setStandDir] = useState("desc");
  const [detail, setDetail] = useState(null);
  const [taskInfo, setTaskInfo] = useState(false);

  // table-level filters (independent of the page filters above)
  const [tSearch, setTSearch] = useState("");
  const [tBand, setTBand] = useState("all");                 // all | good | mid | bad
  const [tSort, setTSort] = useState({ key: "score", dir: "asc" });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => api.get("/api/leaders").then((r) => r.data),
  });
  const rows = data?.data ?? [];

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
  const supervisors = useMemo(() => Object.keys(supLeaderMap).filter((s) => s !== "All").sort(), [supLeaderMap]);
  const leaderOptions = useMemo(() => [...(supLeaderMap[fSup] || [])].sort(), [supLeaderMap, fSup]);

  // date-period bounds — plain ISO-string comparison (rows carry "YYYY-MM-DD")
  const filtered = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate)
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, startDate, endDate, fSup, fLeader]);

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
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, trendFrom, endDate, fSup, fLeader]);

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

  // Only questions that were actually put to someone can be scored — an unasked
  // one would otherwise plot as a 0% bar and win "worst task" on no evidence.
  const chartTasks = useMemo(() => taskStats.filter((t) => t.asked > 0), [taskStats]);

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

  const effStandMode = isSupervisor ? "leader" : standMode;

  const standings = useMemo(() => {
    const map = {};
    for (const r of filtered) {
      const key = effStandMode === "leader" ? r.leader : r.supervisor;
      if (!key || key === "N/A") continue;
      (map[key] ||= { sum: 0, n: 0 });
      map[key].sum += r.completion; map[key].n++;
    }
    const entries = Object.entries(map).map(([name, v]) => ({ name, val: Math.round(v.sum / v.n) }));
    entries.sort((a, b) => (standDir === "desc" ? b.val - a.val : a.val - b.val));
    return entries;
  }, [filtered, effStandMode, standDir]);

  // Insight cards: the worst task plus the worst-performing supervisor / leader.
  const insights = useMemo(() => {
    let lowTask = null;
    chartTasks.forEach((t) => { if (lowTask == null || t.rate < lowTask.val) lowTask = { id: t.id, val: t.rate }; });

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
    colors: chartTasks.map((t) => scoreColor(t.rate)),
    fill: { type: "gradient", gradient: { type: "vertical", gradientToColors: chartTasks.map((t) => mix(scoreColor(t.rate), -0.24)), inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: grid("y"),
    xaxis: { categories: chartTasks.map((t) => `T${t.id}`), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: axisLabel },
    tooltip: { custom: ({ dataPointIndex }) => {
      const t = chartTasks[dataPointIndex];
      return tipHTML(`${T.task} ${t.id}`, `${t.rate}%`, scoreColor(t.rate));
    } },
  };

  const standHeight = Math.max(220, standings.length * 30 + 36);
  // Standings — slim pill bars, horizontal gradient, % set just inside the end in
  // white with a soft shadow so it stays legible on any bar length.
  const standOptions = {
    chart: { ...chartBase, type: "bar" },
    plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 5, borderRadiusApplication: "end", barHeight: "44%" } },
    colors: standings.map((e) => scoreColor(e.val)),
    fill: { type: "gradient", gradient: { type: "horizontal", gradientToColors: standings.map((e) => mix(scoreColor(e.val), -0.24)), inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    dataLabels: { enabled: true, textAnchor: "end", offsetX: -4, formatter: (v) => `${v}%`,
      style: { fontSize: "11px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: true, top: 0, left: 0, blur: 2, opacity: 0.5 } },
    legend: { show: false },
    grid: { ...grid("x"), padding: { top: 0, right: 14, bottom: 0, left: 10 } },
    xaxis: { min: 0, max: 100, categories: standings.map((e) => nm(e.name)), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { ...axisLabel, offsetX: -4, style: { colors: labelColor, fontSize: "11px" } } },
    tooltip: { custom: ({ dataPointIndex }) => tipHTML(nm(standings[dataPointIndex].name), `${standings[dataPointIndex].val}%`, scoreColor(standings[dataPointIndex].val)) },
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <Layout title={T.title} showFilters={false}>
      {/* Filters + admin refresh */}
      <div className="flex flex-wrap items-start gap-3 mb-3">
      <div className={`grid grid-cols-2 ${isSupervisor ? "lg:grid-cols-2" : "lg:grid-cols-3"} gap-2 sm:gap-3 flex-1 min-w-[260px]`}>
        {/* Period — same range picker as the global filters (presets + calendar).
            Mobile: full row, labels hidden (controls are self-describing), admin
            refresh collapses to an icon button beside the picker. */}
        <div className="col-span-2 sm:col-span-1 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.timePeriod}</label>
            <DateRangePicker
              dateFrom={startDate}
              dateTo={endDate}
              setDateFrom={setStartDate}
              setDateTo={setEndDate}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </div>
          {isAdmin && (
            <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
              aria-label={T.refresh} title={T.refresh}
              className="sm:hidden flex-shrink-0 p-2.5 rounded-lg transition-colors"
              style={justSynced
                ? { background: hexA(C_GOOD, 0.15), border: `1px solid ${hexA(C_GOOD, 0.35)}`, color: C_GOOD }
                : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: refreshMut.isPending ? 0.6 : 1 }}>
              {refreshMut.isPending ? <Loader2 size={16} className="animate-spin" />
                : justSynced ? <CheckCircle2 size={16} />
                : <RefreshCw size={16} />}
            </button>
          )}
        </div>

        {/* Supervisor — shift-managers / admins only; supervisors are locked to their own unit */}
        {!isSupervisor && (
          <div className="min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.supervisor}</label>
            <StyledSelect value={fSup} onChange={(v) => { setFSup(v); setFLeader("All"); }}
              options={[{ value: "All", label: T.allSups }, ...supervisors.map((s) => ({ value: s, label: nm(s) }))]} />
          </div>
        )}

        {/* Leader — takes the full row on mobile when it is the only select */}
        <div className={`min-w-0 ${isSupervisor ? "col-span-2 sm:col-span-1" : ""}`}>
          <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{T.leader}</label>
          <StyledSelect value={fLeader} onChange={setFLeader}
            options={[{ value: "All", label: T.allLeaders }, ...leaderOptions.map((l) => ({ value: l, label: nm(l) }))]} />
        </div>
      </div>

      {/* Re-sync the leaders sheet without leaving the page (admins only, sm+ —
          on mobile the icon button next to the date picker replaces this) */}
      {isAdmin && (
        <div className="hidden sm:block flex-shrink-0">
          <div className="text-[10px] font-semibold block mb-1 select-none" aria-hidden="true">&nbsp;</div>
          <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={justSynced
              ? { background: hexA(C_GOOD, 0.15), border: `1px solid ${hexA(C_GOOD, 0.35)}`, color: C_GOOD }
              : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: refreshMut.isPending ? 0.6 : 1 }}>
            {refreshMut.isPending ? <Loader2 size={14} className="animate-spin" />
              : justSynced ? <CheckCircle2 size={14} />
              : <RefreshCw size={14} />}
            {refreshMut.isPending ? T.refreshing : justSynced ? T.refreshed : T.refresh}
          </button>
        </div>
      )}
      </div>

      {refreshMut.isError && (
        <div className="rounded-2xl p-3 text-xs mb-3" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {refreshMut.error?.response?.data?.detail || String(refreshMut.error)}
        </div>
      )}

      {/* KPI / insight cards */}
      <div className={`grid grid-cols-2 ${isSupervisor ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-3 mb-4`}>
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
        {!isSupervisor && (
          <StatCard label={T.lowSup} icon={Users} tip={T.tipLowSup} fit
            value={hasData && insights.lowSup ? nm(insights.lowSup.name) : "—"}
            badge={hasData && insights.lowSup ? `${insights.lowSup.val}%` : null}
            badgeColor={hasData && insights.lowSup ? scoreColor(insights.lowSup.val) : "var(--text-4)"} />
        )}

        {/* Lowest-performing leader */}
        <StatCard label={T.lowLeader} icon={User} tip={T.tipLowLeader} fit
          value={hasData && insights.lowLeader ? nm(insights.lowLeader.name) : "—"}
          badge={hasData && insights.lowLeader ? `${insights.lowLeader.val}%` : null}
          badgeColor={hasData && insights.lowLeader ? scoreColor(insights.lowLeader.val) : "var(--text-4)"} />
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

        {/* Standings */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Trophy} title={effStandMode === "leader" ? T.standing : T.supStanding}
            right={
              <div className="flex items-center gap-2">
                {!isSupervisor && (
                  <SegmentedToggle value={standMode} onChange={setStandMode} options={[["leader", T.toggleLeader], ["sup", T.toggleSup]]} />
                )}
                <SegmentedToggle value={standDir} onChange={setStandDir}
                  options={[["desc", <ArrowDownNarrowWide key="d" size={13} />], ["asc", <ArrowUpNarrowWide key="a" size={13} />]]} />
              </div>
            } />
          <div className="px-3 pb-3 pt-1 apx-bare-tip"><ReactApexChart type="bar" series={[{ name: "%", data: standings.map((e) => e.val) }]} options={standOptions} height={standHeight} /></div>
        </div>

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
        <Modal maxWidth="max-w-3xl" title={`${T.modalTitle}: ${nm(detail.leader)} (${fmtDate(detail.date, lang)})`} onClose={() => setDetail(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(detail.tasks || []).map((tk, i) => {
              const photos = (tk.photo || "").split(",").map((p) => p.trim()).filter((p) => p.includes("http"));
              // map the task back to its description (tk.id is "1".."12"; fall back to row order)
              const ti = Number.isFinite(Number(tk.id)) ? Number(tk.id) - 1 : i;
              const desc = TASK_DETAILS[ti] ? taskDetail(ti, lang).n : null;
              return (
                <div key={i} className="rounded-xl p-3" style={{ background: hexA(tk.done ? C_GOOD : C_BAD, 0.08), border: `1px solid ${hexA(tk.done ? C_GOOD : C_BAD, 0.25)}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{T.task} {tk.id}</span>
                    {tk.done ? <CheckCircle2 size={16} color={C_GOOD} /> : <XCircle size={16} color={C_BAD} />}
                  </div>
                  {desc && <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-1)" }}>{desc}</p>}
                  <p className="text-xs mb-0" style={{ color: "var(--text-3)" }}>{tk.reason || (tk.done ? T.noIssues : T.noReason)}</p>
                  {photos.map((p, pi) => (
                    <img key={pi} src={p} alt="" onClick={() => window.open(p, "_blank")} loading="lazy"
                      className="mt-2 w-full rounded-lg border cursor-zoom-in" style={{ maxHeight: 240, objectFit: "cover", borderColor: "var(--border)" }} />
                  ))}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Task-info modal */}
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
                const d = taskDetail(i, lang);
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
