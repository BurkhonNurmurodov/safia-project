import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  RefreshCw, CalendarClock, AlertTriangle, MessageSquareWarning, ShieldCheck,
  Undo2, Siren, Factory, UserRound, Store, CircleDot, Tag, Layers, Boxes,
  MapPin, Wrench, UserCog, TrendingUp, TrendingDown, ClipboardList, Bug,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── palettes ────────────────────────────────────────────────────────────────
// Status keeps the traffic-light encoding used across the platform; the
// identity palettes (source / type / category) are full-spectrum and unique
// per item, since these are many-category sets, not status encodings.
const C_DONE = "#22c55e", C_OPEN = "#ef4444", C_WAIT = "#eab308", C_REPEAT = "#f97316", C_NA = "#94a3b8";
const BRAND = "#C8973F";

const SRC_COLORS = { production: "#6366f1", guest: "#f97316", store: "#14b8a6" };
const SRC_ICONS  = { production: Factory,   guest: UserRound,  store: Store };

// Supervisor identity palette for the Production-tab trend (stacked by responsible
// supervisor). Full-spectrum and distinct per band; the folded tail is slate.
const SUP_PALETTE = [
  "#6366f1", "#f97316", "#14b8a6", "#ec4899", "#3b82f6", "#84cc16",
  "#a855f7", "#eab308", "#06b6d4", "#8b5cf6", "#f43f5e", "#10b981",
];
const OTHER_KEY = "__other__";

const TYPE_COLORS = {
  risk: "#6366f1", foreign: "#ef4444", storage: "#f97316", sanitation: "#06b6d4",
  recipe: "#8b5cf6", review: "#14b8a6", labeling: "#3b82f6", mold: "#84cc16",
  special_order: "#ec4899", standard: "#a855f7", poisoning: "#dc2626",
  packing: "#0ea5e9", damage: "#f59e0b", documentation: "#64748b", writeoff: "#94a3b8",
};

const CAT_COLORS = {
  hair: "#8b5cf6", polyethylene: "#06b6d4", metal: "#64748b", plastic: "#3b82f6",
  paper: "#f59e0b", organic: "#84cc16", dirt: "#a16207", wood: "#b45309",
  raw: "#14b8a6", insect: "#65a30d", glass: "#22d3ee", other: "#94a3b8",
};

const STATUS_COLORS = { done: C_DONE, open: C_OPEN, waiting: C_WAIT, repeat: C_REPEAT, not_required: C_NA };

// Statuses that describe work: «не требуется мера» is not a failure to fix, so
// it never enters a resolution rate.
const ACTIONABLE = ["done", "open", "waiting", "repeat"];
const OPEN_STATES = ["open", "waiting", "repeat"];

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// ── Seasonality heatmap (native grid, styled after the fleet HeatmapChart) ──
// Brand-gold ramp for a type's share of a month's findings. The low buckets are
// tight because most type-months sit under 20%; coarse buckets flattened the
// whole matrix into one shade of gold and hid the seasonality. Ordered high→low
// for a first-match lookup.
const SEASON_RAMP = [
  { from: 35,     color: "#7d5c21" },
  { from: 25,     color: "#a87c2f" },
  { from: 18,     color: "#C8973F" },
  { from: 12,     color: "#d3ac60" },
  { from: 7,      color: "#e0c48c" },
  { from: 3,      color: "#eddcb9" },
  { from: 0.0001, color: "#f6ecd9" },
];
const seasonColor = (v) => {
  for (const s of SEASON_RAMP) if (v >= s.from) return s.color;
  return null; // 0% / no share → neutral cell, no fill
};
// Black or white label so the % stays legible across the whole light→dark ramp
// (WCAG perceived-luminance split) — the fleet heatmap's contrast trick, which
// beats forcing one text colour on every cell.
const contrastText = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#3d2c10" : "#ffffff";
};

const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// ── the sheet's Russian labels, in the four platform languages ───────────────
// Order: [uz, uz_cyrl, ru, en]. A label the sheet adds later isn't here — it
// falls back to transliteration, so nothing disappears from the UI.
const LI = { uz: 0, uz_cyrl: 1, ru: 2, en: 3 };
const LBL = {
  src: {
    production: ["Ishlab chiqarish", "Ишлаб чиқариш", "Производство", "Production"],
    guest:      ["Mehmon", "Меҳмон", "Гость", "Guest"],
    store:      ["Do‘kon", "Дўкон", "Магазин", "Store"],
  },
  type: {
    risk:          ["Xavf", "Хавф", "Риск", "Risk"],
    foreign:       ["Yot jism", "Ёт жисм", "Инородный предмет", "Foreign object"],
    storage:       ["Saqlash", "Сақлаш", "Хранение", "Storage"],
    sanitation:    ["SanPin", "СанПин", "СанПин", "Sanitation"],
    recipe:        ["Texkarta", "Техкарта", "Техкарта", "Recipe card"],
    review:        ["Sharh", "Шарҳ", "Отзыв", "Review"],
    labeling:      ["Markirovka", "Маркировка", "Маркировка", "Labeling"],
    mold:          ["Mog‘or", "Моғор", "Плесень", "Mold"],
    special_order: ["Maxsus buyurtma", "Махсус буюртма", "Спецзаказ", "Special order"],
    standard:      ["Standart", "Стандарт", "Стандарт", "Standard"],
    poisoning:     ["Zaharlanish", "Заҳарланиш", "Отравление", "Poisoning"],
    packing:       ["Fasovka", "Фасовка", "Фасовка", "Packing"],
    damage:        ["Shikastlanish", "Шикастланиш", "Повреждение", "Damage"],
    documentation: ["Hujjatlar", "Ҳужжатлар", "Документация", "Documentation"],
    writeoff:      ["Hisobdan chiqarish", "Ҳисобдан чиқариш", "Списание", "Write-off"],
  },
  cat: {
    hair:         ["Soch", "Соч", "Волос", "Hair"],
    polyethylene: ["Polietilen", "Полиэтилен", "Полиэтилен", "Polyethylene"],
    metal:        ["Metall", "Металл", "Металл", "Metal"],
    plastic:      ["Plastik", "Пластик", "Пластик", "Plastic"],
    paper:        ["Qog‘oz", "Қоғоз", "Бумага", "Paper"],
    organic:      ["Organika", "Органика", "Органика", "Organic"],
    dirt:         ["Ifloslik", "Ифлослик", "Грязь и мусор", "Dirt & litter"],
    wood:         ["Yog‘och", "Ёғоч", "Дерево", "Wood"],
    raw:          ["Xomashyo", "Хомашё", "Сырьё", "Raw material"],
    insect:       ["Hasharot", "Ҳашарот", "Насекомое", "Insect"],
    glass:        ["Shisha", "Шиша", "Стекло", "Glass"],
    other:        ["Boshqa", "Бошқа", "Другое", "Other"],
  },
  st: {
    done:         ["Bartaraf etilgan", "Бартараф этилган", "Устранено", "Resolved"],
    open:         ["Ochiq", "Очиқ", "Не устранено", "Open"],
    waiting:      ["Kutilmoqda", "Кутилмоқда", "В ожидании", "Waiting"],
    repeat:       ["Takrorlanuvchi", "Такрорланувчи", "Повторяющееся", "Recurring"],
    not_required: ["Chora talab etilmaydi", "Чора талаб этилмайди", "Мера не требуется", "No action needed"],
  },
};

const TXT = {
  uz: {
    title: "Sifat va shikoyatlar", sub: "Nomuvofiqliklar reyestri tahlili",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…", lastSynced: "Oxirgi sinxron", never: "hech qachon",
    emptyTitle: "Ma’lumot yo‘q", emptyNote: "Reyestrni Google Sheets’dan tortib olish uchun «Yangilash» tugmasini bosing.",
    noMatch: "Filtrlarga mos yozuv yo‘q", vOverall: "Umumiy", vSup: "Brigadirlar",
    kTotal: "Jami nomuvofiqlik", kGuest: "Mehmon shikoyatlari", kResolved: "Bartaraf etilgan",
    kOpen: "Ochiq", kReturn: "Qaytarishlar", kCritical: "Kritik",
    kResolvedHint: "chora talab etilganlardan", kCriticalHint: "zaharlanish · mog‘or · mehmondagi yot jism",
    kOpenHint: "ochiq · kutilmoqda · takrorlanuvchi",
    kForeign: "Yot jismlar", kCriticalHintProd: "zaharlanish · mog‘or · yot jism",
    trendSubProd: "brigadirlar kesimida",
    secProducts: "Muammoli mahsulotlar", prodSub: "nomuvofiqliklar soni bo‘yicha",
    secTrend: "Nomuvofiqliklar dinamikasi", trendSub: "manba kesimida",
    byMonth: "Oy", byWeek: "Hafta",
    secTypes: "Nomuvofiqlik turlari", secForeign: "Yot jismlar", foreignSub: "toifalar bo‘yicha",
    secTop: "Shikoyat markazlari", topProducts: "Mahsulotlar", topPlaces: "Savdo nuqtalari",
    topSub: "mehmon shikoyatlari bo‘yicha eng ko‘pi",
    secCells: "Aybdor yacheykalar", cellsSub: "ishlab chiqarish nomuvofiqliklari",
    secAcc: "Mas’uliyat va bartaraf etish", accBrig: "Brigadirlar", accMgr: "Rahbarlar",
    accSub: "chora talab etilgan yozuvlar; % — bartaraf etilgan ulushi",
    secSupStatus: "Brigadirlar bo‘yicha holat",
    stResolved: "Bartaraf etilgan", stNotSolved: "Bartaraf etilmagan", stRecurring: "Takrorlanuvchi",
    stTotal: "Jami", tglCount: "Soni", tglPct: "%",
    secSeason: "Mavsumiylik", seasonSub: "tur ulushi, oy ichidagi % hisobida",
    secTable: "Nomuvofiqliklar reyestri", searchPh: "Nuqta, mahsulot, brigadir, № …",
    colDate: "Sana", colSrc: "Manba", colPlace: "Nuqta / sex", colProduct: "Mahsulot",
    colType: "Turi", colCat: "Toifa", colCell: "Aybdor yacheyka", colBrig: "Mas’ul brigadir",
    colRet: "Qaytarish", colStatus: "Holat", colMgr: "Mas’ul rahbar", colNo: "№",
    fSrc: "Manba", fType: "Turi", fCat: "Toifa", fStatus: "Holat", fRet: "Qaytarish",
    fBrig: "Brigadir", fMgr: "Rahbar",
    yes: "Ha", no: "Yo‘q", rows: "yozuv", vsPrev: "oldingi davrga nisbatan",
    mDesc: "Shikoyat tavsifi", mAction: "Tuzatuvchi choralar", mComment: "Izohlar",
    mFault: "Sex/do‘kon aybi", mCell: "Aybdor yacheyka", mReturn: "Qaytarish keldi",
    close: "Yopish", detail: "Nomuvofiqlik", otherWord: "Boshqalar",
    fShift: "Smena", shift: "Smena", shiftAll: "Barchasi", allBrig: "Barcha brigadirlar", mSheetName: "Jadvaldagi ism",
    loadFailed: "Ma’lumotni yuklab bo‘lmadi", retry: "Qayta urinish",
    textFailed: "Matnli maydonlarni yuklab bo‘lmadi",
  },
  uz_cyrl: {
    title: "Сифат ва шикоятлар", sub: "Номувофиқликлар реестри таҳлили",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", lastSynced: "Охирги синхрон", never: "ҳеч қачон",
    emptyTitle: "Маълумот йўқ", emptyNote: "Реестрни Google Sheets’дан тортиб олиш учун «Янгилаш» тугмасини босинг.",
    noMatch: "Филтрларга мос ёзув йўқ", vOverall: "Умумий", vSup: "Бригадирлар",
    kTotal: "Жами номувофиқлик", kGuest: "Меҳмон шикоятлари", kResolved: "Бартараф этилган",
    kOpen: "Очиқ", kReturn: "Қайтаришлар", kCritical: "Критик",
    kResolvedHint: "чора талаб этилганлардан", kCriticalHint: "заҳарланиш · моғор · меҳмондаги ёт жисм",
    kOpenHint: "очиқ · кутилмоқда · такрорланувчи",
    kForeign: "Ёт жисмлар", kCriticalHintProd: "заҳарланиш · моғор · ёт жисм",
    trendSubProd: "бригадирлар кесимида",
    secProducts: "Муаммоли маҳсулотлар", prodSub: "номувофиқликлар сони бўйича",
    secTrend: "Номувофиқликлар динамикаси", trendSub: "манба кесимида",
    byMonth: "Ой", byWeek: "Ҳафта",
    secTypes: "Номувофиқлик турлари", secForeign: "Ёт жисмлар", foreignSub: "тоифалар бўйича",
    secTop: "Шикоят марказлари", topProducts: "Маҳсулотлар", topPlaces: "Савдо нуқталари",
    topSub: "меҳмон шикоятлари бўйича энг кўпи",
    secCells: "Айбдор ячейкалар", cellsSub: "ишлаб чиқариш номувофиқликлари",
    secAcc: "Масъулият ва бартараф этиш", accBrig: "Бригадирлар", accMgr: "Раҳбарлар",
    accSub: "чора талаб этилган ёзувлар; % — бартараф этилган улуши",
    secSupStatus: "Бригадирлар бўйича ҳолат",
    stResolved: "Бартараф этилган", stNotSolved: "Бартараф этилмаган", stRecurring: "Такрорланувчи",
    stTotal: "Жами", tglCount: "Сони", tglPct: "%",
    secSeason: "Мавсумийлик", seasonSub: "тур улуши, ой ичидаги % ҳисобида",
    secTable: "Номувофиқликлар реестри", searchPh: "Нуқта, маҳсулот, бригадир, № …",
    colDate: "Сана", colSrc: "Манба", colPlace: "Нуқта / сех", colProduct: "Маҳсулот",
    colType: "Тури", colCat: "Тоифа", colCell: "Айбдор ячейка", colBrig: "Масъул бригадир",
    colRet: "Қайтариш", colStatus: "Ҳолат", colMgr: "Масъул раҳбар", colNo: "№",
    fSrc: "Манба", fType: "Тури", fCat: "Тоифа", fStatus: "Ҳолат", fRet: "Қайтариш",
    fBrig: "Бригадир", fMgr: "Раҳбар",
    yes: "Ҳа", no: "Йўқ", rows: "ёзув", vsPrev: "олдинги даврга нисбатан",
    mDesc: "Шикоят тавсифи", mAction: "Тузатувчи чоралар", mComment: "Изоҳлар",
    mFault: "Сех/дўкон айби", mCell: "Айбдор ячейка", mReturn: "Қайтариш келди",
    close: "Ёпиш", detail: "Номувофиқлик", otherWord: "Бошқалар",
    fShift: "Смена", shift: "Смена", shiftAll: "Барчаси", allBrig: "Барча бригадирлар", mSheetName: "Жадвалдаги исм",
    loadFailed: "Маълумотни юклаб бўлмади", retry: "Қайта уриниш",
    textFailed: "Матнли майдонларни юклаб бўлмади",
  },
  ru: {
    title: "Качество и жалобы", sub: "Аналитика реестра несоответствий",
    refresh: "Обновить", refreshing: "Обновление…", lastSynced: "Последняя синхронизация", never: "никогда",
    emptyTitle: "Данных пока нет", emptyNote: "Нажмите «Обновить», чтобы загрузить реестр из Google Sheets.",
    noMatch: "Нет записей по фильтрам", vOverall: "Общий", vSup: "Бригадиры",
    kTotal: "Всего несоответствий", kGuest: "Жалобы гостей", kResolved: "Устранено",
    kOpen: "Открытые", kReturn: "Возвраты", kCritical: "Критичные",
    kResolvedHint: "от требующих меры", kCriticalHint: "отравление · плесень · инородный предмет у гостя",
    kOpenHint: "не устранено · в ожидании · повторяющиеся",
    kForeign: "Инородные предметы", kCriticalHintProd: "отравление · плесень · инородный предмет",
    trendSubProd: "в разрезе бригадиров",
    secProducts: "Проблемные изделия", prodSub: "по числу несоответствий",
    secTrend: "Динамика несоответствий", trendSub: "в разрезе источника",
    byMonth: "Месяц", byWeek: "Неделя",
    secTypes: "Типы несоответствий", secForeign: "Инородные предметы", foreignSub: "по категориям",
    secTop: "Очаги жалоб", topProducts: "Изделия", topPlaces: "Точки продаж",
    topSub: "лидеры по жалобам гостей",
    secCells: "Виновные ячейки", cellsSub: "несоответствия производства",
    secAcc: "Ответственность и устранение", accBrig: "Бригадиры", accMgr: "Руководители",
    accSub: "записи, требующие меры; % — доля устранённых",
    secSupStatus: "Статусы по бригадирам",
    stResolved: "Устранено", stNotSolved: "Не устранено", stRecurring: "Повторяющееся",
    stTotal: "Всего", tglCount: "Кол-во", tglPct: "%",
    secSeason: "Сезонность", seasonSub: "доля типа, % от несоответствий месяца",
    secTable: "Реестр несоответствий", searchPh: "Точка, изделие, бригадир, № …",
    colDate: "Дата", colSrc: "Источник", colPlace: "Точка / цех", colProduct: "Изделие",
    colType: "Тип", colCat: "Категория", colCell: "Виновная ячейка", colBrig: "Отв. бригадир",
    colRet: "Возврат", colStatus: "Статус", colMgr: "Отв. руководитель", colNo: "№",
    fSrc: "Источник", fType: "Тип", fCat: "Категория", fStatus: "Статус", fRet: "Возврат",
    fBrig: "Бригадир", fMgr: "Руководитель",
    yes: "Да", no: "Нет", rows: "записей", vsPrev: "к прошлому периоду",
    mDesc: "Описание жалобы", mAction: "Корректирующие действия", mComment: "Комментарии",
    mFault: "Вина цеха/магазина", mCell: "Виновная ячейка", mReturn: "Поступил возврат",
    close: "Закрыть", detail: "Несоответствие", otherWord: "Прочие",
    fShift: "Смена", shift: "Смена", shiftAll: "Все", allBrig: "Все бригадиры", mSheetName: "Имя в таблице",
    loadFailed: "Не удалось загрузить данные", retry: "Повторить",
    textFailed: "Не удалось загрузить текстовые поля",
  },
  en: {
    title: "Quality & complaints", sub: "Non-conformance register analytics",
    refresh: "Refresh", refreshing: "Refreshing…", lastSynced: "Last synced", never: "never",
    emptyTitle: "No data yet", emptyNote: "Hit “Refresh” to pull the register from Google Sheets.",
    noMatch: "No records match the filters", vOverall: "Overall", vSup: "Brigadirs",
    kTotal: "Total findings", kGuest: "Guest complaints", kResolved: "Resolved",
    kOpen: "Open", kReturn: "Returns", kCritical: "Critical",
    kResolvedHint: "of those needing action", kCriticalHint: "poisoning · mold · foreign object at guest",
    kOpenHint: "open · waiting · recurring",
    kForeign: "Foreign objects", kCriticalHintProd: "poisoning · mold · foreign object",
    trendSubProd: "by brigadir",
    secProducts: "Problem products", prodSub: "by non-conformance count",
    secTrend: "Findings over time", trendSub: "by source",
    byMonth: "Month", byWeek: "Week",
    secTypes: "Finding types", secForeign: "Foreign objects", foreignSub: "by category",
    secTop: "Complaint hotspots", topProducts: "Products", topPlaces: "Stores",
    topSub: "most complained about by guests",
    secCells: "Cells at fault", cellsSub: "production non-conformances",
    secAcc: "Accountability & resolution", accBrig: "Brigadirs", accMgr: "Managers",
    accSub: "records needing action; % = share resolved",
    secSupStatus: "Status by supervisor",
    stResolved: "Resolved", stNotSolved: "Not solved", stRecurring: "Recurring",
    stTotal: "Total", tglCount: "Count", tglPct: "%",
    secSeason: "Seasonality", seasonSub: "type share, % of that month’s findings",
    secTable: "Non-conformance register", searchPh: "Store, product, brigadir, no. …",
    colDate: "Date", colSrc: "Source", colPlace: "Store / shop", colProduct: "Product",
    colType: "Type", colCat: "Category", colCell: "Cell at fault", colBrig: "Brigadir",
    colRet: "Return", colStatus: "Status", colMgr: "Manager", colNo: "No.",
    fSrc: "Source", fType: "Type", fCat: "Category", fStatus: "Status", fRet: "Return",
    fBrig: "Brigadir", fMgr: "Manager",
    yes: "Yes", no: "No", rows: "records", vsPrev: "vs previous period",
    mDesc: "Complaint description", mAction: "Corrective actions", mComment: "Comments",
    mFault: "Shop/store at fault", mCell: "Cell at fault", mReturn: "Return received",
    close: "Close", detail: "Non-conformance", otherWord: "Other",
    fShift: "Shift", shift: "Shift", shiftAll: "All", allBrig: "All brigadirs", mSheetName: "Name in the sheet",
    loadFailed: "Could not load the register", retry: "Retry",
    textFailed: "Could not load the text fields",
  },
};

const PAGE_SIZE = 50;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "—");

// Monday of the ISO week the date falls in — the bucket key of the weekly trend.
const weekStart = (s) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};

const fmtDateTime = (iso8601) => {
  if (!iso8601) return "";
  const d = new Date(iso8601);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Quality() {
  const { lang, t } = useLang();
  const { auth } = useAuth();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const { chartTheme, cardBg, gridColor, labelColor, legendColor } = useChartTheme();
  const T = TXT[lang] || TXT.ru;
  // The detail modal describes a Russian-language register, so its field labels
  // stay Russian in every UI language — the translated/transliterated variants
  // (e.g. Uzbek Cyrillic) read badly next to the Russian data they sit above.
  const RU = TXT.ru;
  const li = LI[lang] ?? LI.ru;

  // A sheet label the dictionary doesn't know (a new type the QA team typed
  // yesterday) still has to render — transliterate it instead of dropping it.
  const L = (group, key) => (key ? (LBL[group]?.[key]?.[li] || tl(key)) : "—");

  const MONTHS = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === "en" ? "en" : "ru", { month: "short" });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2025, m, 1)).replace(".", ""));
  }, [lang]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["quality"],
    queryFn: () => api.get("/api/quality").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: () => api.post("/api/quality/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality"] }),
  });

  const rows = data?.rows || [];

  // Default window: the rolling last 12 months — long enough for seasonality,
  // short enough that "now" isn't drowned by 2025.
  const today = iso(new Date());
  const [dateFrom, setDateFrom] = useState(addDays(today, -364));
  const [dateTo, setDateTo] = useState(today);

  const [srcSel, setSrcSel] = useState([]);
  const [typeSel, setTypeSel] = useState([]);
  const [catSel, setCatSel] = useState([]);
  const [statusSel, setStatusSel] = useState([]);
  const [retSel, setRetSel] = useState([]);
  const [brigSel, setBrigSel] = useState([]);
  const [shiftSel, setShiftSel] = useState([]);
  const [mgrSel, setMgrSel] = useState([]);

  // Page-level view switch: "overall" = the whole register; "production" (the
  // «Brigadirs» tab) narrows every KPI/chart/table row to the ones the QA team
  // pinned on a matched supervisor unit (r.sup set) — regardless of source, so
  // производство, торговые точки and guest complaints all count. Brigadirs is
  // the default landing tab.
  const [view, setView] = useState("production");
  const isProd = view === "production";
  const [gran, setGran] = useState("month");
  const [topMode, setTopMode] = useState("product");
  const [accMode, setAccMode] = useState("brig");
  const [supStatMode, setSupStatMode] = useState("count");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  // Mount the charts one frame after the layout settles (same trick as Kaizen —
  // Apex measures its container on mount and would otherwise draw at the wrong width).
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (isLoading) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setChartsReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [isLoading]);

  // Filter options come from the data itself, so a label the QA team adds
  // tomorrow shows up in the filters without a code change.
  // The responsible person, under the name the platform uses. The backend matched
  // the sheet's passport-style names against the supervisor units, so a matched
  // row reads "Хакимов Руслан" like every other page; everyone else in the
  // register (technologists, IT, logistics, individual leaders) keeps their sheet
  // name — they are genuinely not supervisors, not a failed match.
  const who = (r) => r.sup || r.b || "";

  // Surname + initials — full passport names ("SULTONOV ABROR ALISHEROVICH")
  // overflow chart axes and legends, so responsible people collapse to this.
  const shortName = (n) => {
    const parts = tl(n).trim().split(/\s+/);
    return parts.length < 2 ? parts[0] : `${parts[0]} ${parts.slice(1).map((p) => p[0] + ".").join("")}`;
  };

  // Brigadirs view: the responsible «Отв. бригадир/ТМ» matched a real supervisor
  // unit on our system (r.sup is set only on a match; technologists / IT /
  // individual leaders keep their sheet name in r.b and are excluded here). Source
  // is NOT restricted — a matched supervisor's rows count whether they came from
  // производство, a торговая точка or a guest complaint.
  const inView = (r) => (isProd ? !!r.sup : true);

  // Selectable filter options are scoped to the rows the active tab can actually
  // show — so the Production tab's Brigadir list holds only matched supervisors,
  // not «Torgovaya tochka» / «IT oldel» / unmatched people that live only in Overall.
  const opts = useMemo(() => {
    const scope = rows.filter(inView);
    const uniq = (key) => [...new Set(scope.map((r) => r[key]).filter(Boolean))];
    const byCount = (fn) => {
      const c = {};
      for (const r of scope) { const k = fn(r); if (k) c[k] = (c[k] || 0) + 1; }
      return Object.keys(c).sort((a, b) => c[b] - c[a]);
    };
    return {
      src: uniq("s"), type: byCount((r) => r.t), cat: byCount((r) => r.c), status: uniq("st"),
      brig: byCount(who), mgr: byCount((r) => r.m),
      shift: [...new Set(scope.map((r) => r.sh).filter(Boolean))].sort(),
    };
  }, [rows, view]);

  const matchesFilters = useMemo(() => {
    return (r) => {
      if (srcSel.length && !srcSel.includes(r.s)) return false;
      if (typeSel.length && !typeSel.includes(r.t)) return false;
      if (catSel.length && !catSel.includes(r.c)) return false;
      if (statusSel.length && !statusSel.includes(r.st)) return false;
      if (retSel.length && !retSel.includes(r.r ? "yes" : "no")) return false;
      if (brigSel.length && !brigSel.includes(who(r))) return false;
      if (shiftSel.length && !shiftSel.includes(String(r.sh || ""))) return false;
      if (mgrSel.length && !mgrSel.includes(r.m)) return false;
      return true;
    };
  }, [srcSel, typeSel, catSel, statusSel, retSel, brigSel, shiftSel, mgrSel]);

  const filtered = useMemo(
    () => rows.filter((r) => r.d >= dateFrom && r.d <= dateTo && inView(r) && matchesFilters(r)),
    [rows, dateFrom, dateTo, view, matchesFilters]
  );

  // Same filters, the equally long window immediately before — the KPI deltas.
  // If that window reaches back past the register's first record, the register
  // simply didn't exist yet: comparing against it would invent a +138% "rise"
  // out of missing history, so the deltas are suppressed instead.
  const { prev, prevComparable } = useMemo(() => {
    const span = daysBetween(dateFrom, dateTo) + 1;
    const pTo = addDays(dateFrom, -1);
    const pFrom = addDays(pTo, -(span - 1));
    const earliest = rows.length ? rows.reduce((m, r) => (r.d < m ? r.d : m), rows[0].d) : null;
    return {
      prev: rows.filter((r) => r.d >= pFrom && r.d <= pTo && inView(r) && matchesFilters(r)),
      prevComparable: !!earliest && pFrom >= earliest,
    };
  }, [rows, dateFrom, dateTo, view, matchesFilters]);

  useEffect(() => { setPage(1); }, [view, dateFrom, dateTo, srcSel, typeSel, catSel, statusSel, retSel, brigSel, shiftSel, mgrSel]);
  // The Production tab hides the Source filter; drop any leftover source selection
  // so a "guest"-only pick carried over from Overall doesn't zero the whole page.
  useEffect(() => { if (isProd) setSrcSel([]); }, [isProd]);

  // ── analytics ─────────────────────────────────────────────────────────────
  // A foreign object is critical when it reached a guest — or, on the Production
  // tab (guest rows are excluded there), whenever it's found in a produced item.
  const isCritical = (r) =>
    r.t === "poisoning" || r.t === "mold" || (r.t === "foreign" && (r.s === "guest" || isProd));

  const kpi = useMemo(() => {
    const sum = (arr) => {
      const actionable = arr.filter((r) => ACTIONABLE.includes(r.st));
      const done = actionable.filter((r) => r.st === "done").length;
      return {
        total: arr.length,
        guest: arr.filter((r) => r.s === "guest").length,
        done,
        actionable: actionable.length,
        resolved: actionable.length ? Math.round((done / actionable.length) * 100) : 0,
        open: arr.filter((r) => OPEN_STATES.includes(r.st)).length,
        returns: arr.filter((r) => r.r).length,
        foreign: arr.filter((r) => r.t === "foreign").length,
        critical: arr.filter(isCritical).length,
      };
    };
    const cur = sum(filtered);
    const old = sum(prev);
    const delta = (a, b) => (prevComparable && b ? Math.round(((a - b) / b) * 100) : null);
    return {
      ...cur,
      dTotal: delta(cur.total, old.total),
      dGuest: delta(cur.guest, old.guest),
      dResolved: prevComparable && old.actionable ? cur.resolved - old.resolved : null,
      dOpen: delta(cur.open, old.open),
      dReturns: delta(cur.returns, old.returns),
      dCritical: delta(cur.critical, old.critical),
      dForeign: delta(cur.foreign, old.foreign),
      guestPct: cur.total ? Math.round((cur.guest / cur.total) * 100) : 0,
      returnPct: cur.total ? Math.round((cur.returns / cur.total) * 100) : 0,
      foreignPct: cur.total ? Math.round((cur.foreign / cur.total) * 100) : 0,
    };
  }, [filtered, prev, prevComparable]);

  const A = useMemo(() => {
    // Trend — one bucket per month or per ISO week. Overall stacks by source;
    // the Production tab stacks by responsible supervisor (top-6 by volume, the
    // rest folded into a single «Прочие» band).
    const trendKeyOf = isProd ? who : (r) => r.s;
    let trendKeys;
    if (isProd) {
      const totals = {};
      for (const r of filtered) { const k = who(r); if (k) totals[k] = (totals[k] || 0) + 1; }
      const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
      const top = ranked.slice(0, 6);
      trendKeys = ranked.length > top.length ? [...top, OTHER_KEY] : top;
    } else {
      trendKeys = ["production", "guest", "store"];
    }
    const trendTop = new Set(trendKeys);
    const buckets = {};
    for (const r of filtered) {
      const key = gran === "month" ? r.d.slice(0, 7) : weekStart(r.d);
      const b = buckets[key] || (buckets[key] = { key });
      let k = trendKeyOf(r);
      if (isProd) { if (!k) continue; if (!trendTop.has(k)) k = OTHER_KEY; }
      if (k && trendTop.has(k)) b[k] = (b[k] || 0) + 1;
    }
    const trend = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));

    const count = (arr, key) => {
      const c = {};
      for (const r of arr) { const k = r[key]; if (k) c[k] = (c[k] || 0) + 1; }
      return Object.entries(c).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
    };

    const types = count(filtered, "t");
    const cats = count(filtered.filter((r) => r.c), "c");

    // Hotspots: guest complaints on Overall; on Production it's the most
    // defect-prone produced items (all production rows, stores don't apply).
    const hotBase = isProd ? filtered : filtered.filter((r) => r.s === "guest");
    const topProducts = count(hotBase, "pr").slice(0, 10);
    const topPlaces = count(hotBase, "pl").slice(0, 10);

    // Cells at fault: only rows the QA team actually pinned on a production
    // cell (a fault code that resolved to a cell name).
    const cellRows = filtered.filter((r) => r.f && (r.cn || r.fc));
    const cellCounts = {};
    for (const r of cellRows) {
      const k = r.cn || r.fc;
      const c = cellCounts[k] || (cellCounts[k] = { k, n: 0, code: r.fc });
      c.n++;
    }
    const topCells = Object.values(cellCounts).sort((a, b) => b.n - a.n).slice(0, 10);

    // Accountability — resolution split per responsible person. Brigadir mode
    // keys on the matched supervisor unit, so the sheet's spelling variants of
    // one person collapse into the single unit the platform knows.
    const accOf = (nameOf) => {
      const map = {};
      for (const r of filtered) {
        const k = nameOf(r);
        if (!k || !ACTIONABLE.includes(r.st)) continue;
        const m = map[k] || (map[k] = { name: k, done: 0, open: 0, waiting: 0, repeat: 0, total: 0 });
        m[r.st]++; m.total++;
      }
      return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 12);
    };
    const acc = accOf(accMode === "brig" ? who : (r) => r.m);

    // Seasonality — share of each type within its calendar month, so a window
    // that covers some months twice (18 months of data) can't inflate them.
    const monthTotals = Array(12).fill(0);
    const typeMonth = {};
    for (const r of filtered) {
      const m = parseInt(r.d.slice(5, 7), 10) - 1;
      monthTotals[m]++;
      if (!r.t) continue;
      (typeMonth[r.t] || (typeMonth[r.t] = Array(12).fill(0)))[m]++;
    }
    const seasonTypes = types.slice(0, 7).map((x) => x.k);
    const season = seasonTypes.map((k) => ({
      k,
      data: (typeMonth[k] || Array(12).fill(0)).map((n, m) =>
        monthTotals[m] ? Math.round((n / monthTotals[m]) * 1000) / 10 : 0
      ),
    }));

    return { trend, trendKeys, types, cats, topProducts, topPlaces, topCells, acc, season, monthTotals };
  }, [filtered, gran, accMode, isProd]);

  // Brigadirs tab — per-supervisor resolution matrix for the status table that
  // sits under the KPI strip. The four actionable statuses fold into the three
  // columns the table shows (done → resolved, open+waiting → not solved, repeat →
  // recurring); «мера не требуется» rows are excluded, as everywhere resolution
  // is measured. Rows are alphabetical by the platform (transliterated) name.
  const supStatus = useMemo(() => {
    if (!isProd) return [];
    const map = {};
    for (const r of filtered) {
      const k = who(r);
      if (!k || !ACTIONABLE.includes(r.st)) continue;
      const m = map[k] || (map[k] = { name: k, resolved: 0, notSolved: 0, recurring: 0, total: 0 });
      if (r.st === "done") m.resolved++;
      else if (r.st === "repeat") m.recurring++;
      else m.notSolved++; // open | waiting
      m.total++;
    }
    return Object.values(map).sort((a, b) => tl(a.name).localeCompare(tl(b.name)));
  }, [filtered, isProd, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── table ─────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const val = (r) => {
      switch (sort.key) {
        case "date":    return r.d || "";
        case "src":     return L("src", r.s);
        case "place":   return r.pl || "";
        case "product": return r.pr || "";
        case "type":    return L("type", r.t);
        case "cat":     return L("cat", r.c);
        case "cell":    return r.cn || r.fc || "";
        case "brig":    return tl(who(r));
        case "ret":     return r.r ? "1" : "0";
        case "status":  return L("st", r.st);
        default:        return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => String(val(a)).localeCompare(String(val(b)), undefined, { numeric: true }) * dir);
  }, [filtered, sort, tl, li]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const { data: detail, isFetching: detailLoading, error: detailError } = useQuery({
    queryKey: ["quality-row", openId],
    queryFn: () => api.get(`/api/quality/${openId}`).then((r) => r.data),
    enabled: openId != null,
  });

  // The clicked row, straight from the list payload — the modal paints from it
  // without waiting on the network.
  const openRow = useMemo(() => rows.find((r) => r.id === openId) || null, [rows, openId]);

  // ── filter panel ──────────────────────────────────────────────────────────
  const optFilter = (o, sel, set, group, icon) => ({
    key: group, icon, label: o.label, active: sel.length > 0,
    display: `${sel.length} ${t("filter.selected2")}`,
    render: () => (
      <OptsFilter opts={o.opts} sel={sel} onChange={set}
        render={(k) => (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            {o.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.dot(k) }} />}
            <span className="truncate">{o.render ? o.render(k) : k}</span>
          </span>
        )} />
    ),
  });

  const filterSections = [
    // Source is a single constant on the Production tab (always «Производство») —
    // drop the filter there.
    ...(!isProd ? [optFilter({ label: T.fSrc, opts: opts.src, render: (k) => L("src", k), dot: (k) => SRC_COLORS[k] || C_NA }, srcSel, setSrcSel, "src", Layers)] : []),
    optFilter({ label: T.fType, opts: opts.type, render: (k) => L("type", k), dot: (k) => TYPE_COLORS[k] || C_NA }, typeSel, setTypeSel, "type", Tag),
    optFilter({ label: T.fCat, opts: opts.cat, render: (k) => L("cat", k), dot: (k) => CAT_COLORS[k] || C_NA }, catSel, setCatSel, "cat", Bug),
    optFilter({ label: T.fStatus, opts: opts.status, render: (k) => L("st", k), dot: (k) => STATUS_COLORS[k] || C_NA }, statusSel, setStatusSel, "status", CircleDot),
    optFilter({ label: T.fRet, opts: ["yes", "no"], render: (k) => (k === "yes" ? T.yes : T.no) }, retSel, setRetSel, "ret", Undo2),
    // Brigadir lives in the panel on Overall; the Production tab surfaces it as a
    // standalone supervisor dropdown on the toolbar (scoped to the shift), so drop
    // it here alongside the shift filter.
    ...(!isProd ? [optFilter({ label: T.fBrig, opts: opts.brig, render: (k) => tl(k) }, brigSel, setBrigSel, "brig", Wrench)] : []),
    ...(!isProd ? [optFilter({ label: T.fShift, opts: opts.shift.map(String), render: (k) => `${T.shift} ${k}` }, shiftSel, setShiftSel, "shift", Layers)] : []),
    optFilter({ label: T.fMgr, opts: opts.mgr, render: (k) => tl(k) }, mgrSel, setMgrSel, "mgr", UserCog),
  ];
  // On Production the shift toggle and supervisor dropdown live outside the panel,
  // so they don't count toward the panel's active-filter badge.
  const filterActiveCount = (isProd
    ? [typeSel, catSel, statusSel, retSel, mgrSel]
    : [srcSel, typeSel, catSel, statusSel, retSel, brigSel, shiftSel, mgrSel]
  ).filter((s) => s.length).length;
  // The Production tab's shift control: a 3-way All / Shift 1 / Shift 2 toggle that
  // drives the same shiftSel state the panel filter uses on Overall.
  const shiftTab = shiftSel.length === 1 && ["1", "2"].includes(shiftSel[0]) ? shiftSel[0] : "all";

  // Supervisor → shift is 1:1 (a unit sits on one shift). Map it once so the
  // toolbar dropdown can scope itself to the picked shift, and so a stale pick
  // from the other shift can be dropped.
  const supShift = useMemo(() => {
    const m = {};
    for (const r of rows) if (r.sup) m[who(r)] = String(r.sh ?? "");
    return m;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Supervisors available in the Production dropdown, most-active first and
  // narrowed to the selected shift (All = every matched supervisor).
  const supOpts = useMemo(() => {
    const c = {};
    for (const r of rows) {
      if (!r.sup) continue;
      if (shiftTab !== "all" && String(r.sh ?? "") !== shiftTab) continue;
      const k = who(r);
      if (k) c[k] = (c[k] || 0) + 1;
    }
    return Object.keys(c).sort((a, b) => c[b] - c[a]);
  }, [rows, shiftTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching shift strands a supervisor pick from the other shift (0 rows, and it
  // vanishes from the scoped dropdown) — drop it when it no longer fits the shift.
  useEffect(() => {
    if (!isProd || shiftTab === "all" || !brigSel.length) return;
    const kept = brigSel.filter((b) => supShift[b] === shiftTab);
    if (kept.length !== brigSel.length) setBrigSel(kept);
  }, [shiftTab, isProd]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearAllFilters = () => {
    setSrcSel([]); setTypeSel([]); setCatSel([]); setStatusSel([]); setRetSel([]); setBrigSel([]); setShiftSel([]); setMgrSel([]);
  };

  // ── charts ────────────────────────────────────────────────────────────────
  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

  // Brand-gold header cell for the seasonality grid (mirrors the fleet heatmap head).
  const seasonTh = {
    fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
    color: "#fff", background: "var(--brand)", padding: "7px 4px",
    whiteSpace: "nowrap", border: "1px solid var(--border)",
  };
  // zoom/selection off: Apex turns a drag on an area chart into a zoom-selection
  // box, which does nothing useful here (the date range is the toolbar's job) and
  // just leaves the chart stuck in a zoomed state with no toolbar to reset it.
  const baseChart = {
    fontFamily: "inherit",
    toolbar: { show: false },
    background: "transparent",
    animations: { enabled: false },
    zoom: { enabled: false },
    selection: { enabled: false },
  };

  // Stacked area — solid fills with a 2px card-coloured seam between bands
  // (translucent fills multiply into mud where they overlap). Overall stacks by
  // source; Production stacks by responsible supervisor, «Прочие» pinned last.
  const trendOrder = A.trendKeys
    .map((k) => ({ k, n: A.trend.reduce((s, b) => s + (b[k] || 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (a.k === OTHER_KEY ? 1 : b.k === OTHER_KEY ? -1 : b.n - a.n));

  const trendColorAt = (k, i) =>
    !isProd ? (SRC_COLORS[k] || C_NA) : (k === OTHER_KEY ? C_NA : SUP_PALETTE[i % SUP_PALETTE.length]);
  const trendName = (k) =>
    !isProd ? L("src", k) : (k === OTHER_KEY ? T.otherWord : shortName(k));

  const trendLabels = A.trend.map((b) =>
    gran === "month"
      ? `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]} ${b.key.slice(2, 4)}`
      : fmtDate(b.key).slice(0, 5)
  );
  const areaOpts = {
    chart: { ...baseChart, type: "area", stacked: true, theme: chartTheme },
    theme: chartTheme,
    colors: trendOrder.map((x, i) => trendColorAt(x.k, i)),
    fill: { type: "solid", opacity: 1 },
    stroke: { curve: "smooth", width: 2, colors: trendOrder.map(() => cardBg) },
    dataLabels: { enabled: false },
    xaxis: {
      categories: trendLabels,
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" } } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 4, right: 8 } },
    legend: { show: true, position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };
  const areaSeries = trendOrder.map((x) => ({
    name: trendName(x.k),
    data: A.trend.map((b) => b[x.k] || 0),
  }));

  const topTypes = A.types.slice(0, 8);
  const otherTypes = A.types.slice(8).reduce((s, x) => s + x.n, 0);
  const donutLabels = [...topTypes.map((x) => L("type", x.k)), ...(otherTypes ? [T.otherWord] : [])];
  const donutSeries = [...topTypes.map((x) => x.n), ...(otherTypes ? [otherTypes] : [])];
  const donutOpts = {
    chart: { ...baseChart, type: "donut" },
    theme: chartTheme,
    labels: donutLabels,
    colors: [...topTypes.map((x) => TYPE_COLORS[x.k] || C_NA), ...(otherTypes ? [C_NA] : [])],
    stroke: { width: 2, colors: [cardBg] },
    dataLabels: {
      enabled: true,
      formatter: (v) => (v >= 6 ? `${Math.round(v)}%` : ""),
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true, showAlways: true, label: T.kTotal, fontSize: "11px", color: labelColor,
              formatter: () => filtered.length.toLocaleString("ru-RU"),
            },
            value: { fontSize: "20px", fontWeight: 700, color: legendColor },
            name: { fontSize: "11px", color: labelColor },
          },
        },
      },
    },
    legend: { show: false },
    tooltip: { theme: chartTheme.mode, y: { formatter: (v) => `${v} ${T.rows}` } },
  };

  const treeSeries = [{
    data: A.cats.map((x) => ({ x: L("cat", x.k), y: x.n, fillColor: CAT_COLORS[x.k] || C_NA })),
  }];
  const treeOpts = {
    chart: { ...baseChart, type: "treemap" },
    theme: chartTheme,
    legend: { show: false },
    dataLabels: {
      enabled: true, style: { fontSize: "11px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
      formatter: (text, op) => [text, op.value],
      offsetY: -3,
    },
    plotOptions: { treemap: { distributed: true, enableShades: false, borderRadius: 6 } },
    stroke: { width: 2, colors: [cardBg] },
    tooltip: { theme: chartTheme.mode, y: { formatter: (v) => `${v} ${T.rows}` } },
  };

  const topData = (isProd || topMode === "product") ? A.topProducts : A.topPlaces;
  const barOpts = (cats, color, horizontal = true) => ({
    chart: { ...baseChart, type: "bar" },
    theme: chartTheme,
    colors: [color],
    plotOptions: { bar: { horizontal, borderRadius: 5, barHeight: "68%", columnWidth: "55%", distributed: false } },
    dataLabels: {
      enabled: true, offsetX: 18, style: { fontSize: "10px", fontWeight: 700, colors: [legendColor] },
      dropShadow: { enabled: false },
    },
    xaxis: {
      categories: cats,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 190 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: { custom: ({ dataPointIndex, series, seriesIndex }) => tipHTML(cats[dataPointIndex] ?? "", `${series[seriesIndex][dataPointIndex]} ${T.rows}`, color) },
  });

  // The resolution rate rides in the axis label (shortName, defined up top, keeps
  // full passport names from overflowing and truncating the % away).
  const accCats = A.acc.map((x) => `${shortName(x.name)} · ${x.total ? Math.round((x.done / x.total) * 100) : 0}%`);
  const accSeries = ACTIONABLE.map((st) => ({
    name: L("st", st),
    data: A.acc.map((x) => x[st]),
  }));
  const accOpts = {
    chart: { ...baseChart, type: "bar", stacked: true, stackType: "normal" },
    theme: chartTheme,
    colors: ACTIONABLE.map((st) => STATUS_COLORS[st]),
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: accCats,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 200 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };

  // ── chips ─────────────────────────────────────────────────────────────────
  const Chip = ({ color, children, icon: Icon }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap"
      style={{ background: hexA(color, 0.13), color }}>
      {Icon && <Icon size={11} />}{children}
    </span>
  );

  const Delta = ({ v, invert = true, suffix = "%" }) => {
    if (v == null || v === 0) return null;
    const good = invert ? v < 0 : v > 0;
    const color = good ? C_DONE : C_OPEN;
    const Icon = v > 0 ? TrendingUp : TrendingDown;
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color }} title={T.vsPrev}>
        <Icon size={11} />{v > 0 ? "+" : ""}{v}{suffix}
      </span>
    );
  };

  const Kpi = ({ icon: Icon, color, label, value, hint, delta }) => (
    <div className="rounded-2xl px-4 py-3.5" style={cardStyle}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: hexA(color, 0.13), color }}>
          <Icon size={14} strokeWidth={2.4} />
        </span>
        {delta}
      </div>
      <div className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-1 font-medium truncate" style={{ color: "var(--text-3)" }} title={label}>{label}</div>
      {hint && <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-4)" }} title={hint}>{hint}</div>}
    </div>
  );

  const lastSynced = fmtDateTime(data?.last_synced);
  // Gate on the caller's own role, not on the payload: when the GET fails there
  // is no payload, and hiding Refresh then leaves an admin staring at a page
  // with no way out. The server re-checks the role on /refresh anyway.
  const canRefresh = data?.can_refresh ?? auth?.role === "admin";
  const refreshBtn = canRefresh && (
    <Button size="lg" variant="secondary" loading={refresh.isPending}
      icon={!refresh.isPending ? <RefreshCw size={14} /> : null}
      onClick={() => refresh.mutate()}>
      {refresh.isPending ? T.refreshing : T.refresh}
    </Button>
  );

  const ChartCard = ({ icon, title, subtitle, right, height = 300, empty, children }) => (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="grid place-items-center w-6 h-6 rounded-md flex-shrink-0" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>{icon}</span>}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{title}</div>
            {subtitle && <div className="text-[11px] truncate" style={{ color: "var(--text-4)" }}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
      <div className="px-1 py-2 flex-1">
        {empty
          ? <div className="grid place-items-center text-xs" style={{ height, color: "var(--text-4)" }}>{T.noMatch}</div>
          : chartsReady ? children : <div style={{ height }} />}
      </div>
    </div>
  );

  return (
    <Layout title={T.title} showFilters={false}>
      {/* header: title + last-synced + refresh */}
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{T.title}</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.sub}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
            <CalendarClock size={14} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </span>
          {refreshBtn}
        </div>
      </div>

      {/* page-level view switch — Production narrows everything to источник = «Производство» */}
      <div className="mb-4">
        <SegmentedToggle value={view} onChange={setView}
          options={[["production", T.vSup], ["overall", T.vOverall]]} />
      </div>

      {(refresh.isError || isError) && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: hexA(C_OPEN, 0.1), color: C_OPEN, border: `1px solid ${hexA(C_OPEN, 0.33)}` }}>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="min-w-0">
              {refresh.isError
                ? (refresh.error?.response?.data?.detail || String(refresh.error))
                : (error?.response?.data?.detail || T.loadFailed)}
            </span>
          </span>
          {isError && !refresh.isError && (
            <Button size="sm" variant="secondary" onClick={() => refetch()}>{T.retry}</Button>
          )}
        </div>
      )}

      {/* one filter zone for the whole page — charts and table read the same state */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          max={today} triggerClassName="px-3 py-2 text-sm" />
        <FilterPanel sections={filterSections} activeCount={filterActiveCount}
          anyActive={filterActiveCount > 0} onClearAll={clearAllFilters} />
        {isProd && (
          <SegmentedToggle value={shiftTab}
            onChange={(v) => setShiftSel(v === "all" ? [] : [v])}
            options={[["all", T.shiftAll], ["1", `${T.shift} 1`], ["2", `${T.shift} 2`]]} />
        )}
        {isProd && (
          <StyledSelect value={brigSel[0] || ""}
            onChange={(v) => setBrigSel(v ? [v] : [])}
            options={[{ value: "", label: T.allBrig }, ...supOpts.map((s) => ({ value: s, label: tl(s) }))]}
            searchable searchPlaceholder={T.fBrig}
            className="w-full sm:w-56" />
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl px-4 py-3.5" style={cardStyle}>
                <SkeletonBlock className="h-7 w-7 mb-3" /><SkeletonBlock className="h-5 w-12 mb-2" /><SkeletonBlock className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-28 mb-4" /><SkeletonChart className="h-64" /></div>
            <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-64" /></div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={cardStyle}>
          <span className="grid place-items-center w-12 h-12 rounded-2xl mx-auto mb-3" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
            <ClipboardList size={22} />
          </span>
          <div className="font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.emptyTitle}</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>{T.emptyNote}</p>
          <div className="flex justify-center">{refreshBtn}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── KPI strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={ClipboardList} color={BRAND} label={T.kTotal}
              value={kpi.total.toLocaleString("ru-RU")} delta={<Delta v={kpi.dTotal} />} />
            {isProd ? (
              <Kpi icon={Bug} color={TYPE_COLORS.foreign} label={T.kForeign}
                value={kpi.foreign.toLocaleString("ru-RU")} hint={`${kpi.foreignPct}% ${T.kTotal.toLowerCase()}`}
                delta={<Delta v={kpi.dForeign} />} />
            ) : (
              <Kpi icon={MessageSquareWarning} color={SRC_COLORS.guest} label={T.kGuest}
                value={kpi.guest.toLocaleString("ru-RU")} hint={`${kpi.guestPct}% ${T.kTotal.toLowerCase()}`}
                delta={<Delta v={kpi.dGuest} />} />
            )}
            <Kpi icon={ShieldCheck} color={C_DONE} label={T.kResolved}
              value={`${kpi.resolved}%`} hint={T.kResolvedHint}
              delta={<Delta v={kpi.dResolved} invert={false} suffix=" п.п." />} />
            <Kpi icon={AlertTriangle} color={C_OPEN} label={T.kOpen}
              value={kpi.open.toLocaleString("ru-RU")} hint={T.kOpenHint} delta={<Delta v={kpi.dOpen} />} />
            <Kpi icon={Undo2} color={C_WAIT} label={T.kReturn}
              value={kpi.returns.toLocaleString("ru-RU")} hint={`${kpi.returnPct}% ${T.kTotal.toLowerCase()}`}
              delta={<Delta v={kpi.dReturns} />} />
            <Kpi icon={Siren} color="#dc2626" label={T.kCritical}
              value={kpi.critical.toLocaleString("ru-RU")} hint={isProd ? T.kCriticalHintProd : T.kCriticalHint} delta={<Delta v={kpi.dCritical} />} />
          </div>

          {/* ── per-supervisor status matrix (Brigadirs tab only) ──
                 done → resolved · open+waiting → not solved · repeat → recurring.
                 Numbers/percent toggle: percentages are row-wise, so each
                 supervisor's three status columns sum to 100% and «Resolved» reads
                 as that supervisor's own resolution rate; the Total column stays a
                 raw actionable count to anchor the percentages. ── */}
          {isProd && (
            <TableCard
              icon={ShieldCheck}
              title={T.secSupStatus}
              right={<SegmentedToggle size="sm" value={supStatMode} onChange={setSupStatMode}
                options={[["count", T.tglCount], ["pct", T.tglPct]]} />}
            >
              <thead className="sticky top-0 z-10" style={{ background: "var(--bg-inner)" }}>
                <tr>
                  <Th label={T.colBrig} k="sup" />
                  <Th label={T.stResolved} align="right" />
                  <Th label={T.stNotSolved} align="right" />
                  <Th label={T.stRecurring} align="right" />
                  <Th label={T.stTotal} align="right" />
                </tr>
              </thead>
              <tbody>
                {supStatus.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td>
                  </tr>
                ) : supStatus.map((s) => {
                  const cell = (v, color) => {
                    const text = supStatMode === "pct"
                      ? `${s.total ? Math.round((v / s.total) * 100) : 0}%`
                      : v.toLocaleString("ru-RU");
                    return (
                      <td className="px-3 py-2 text-right tabular-nums font-semibold"
                        style={{ color: v === 0 ? "var(--text-4)" : color }}>{text}</td>
                    );
                  };
                  return (
                    <tr key={s.name}>
                      <td className="px-3 py-2 max-w-[220px] truncate" title={tl(s.name)} style={{ color: "var(--text-2)" }}>{tl(s.name)}</td>
                      {cell(s.resolved, C_DONE)}
                      {cell(s.notSolved, C_OPEN)}
                      {cell(s.recurring, C_REPEAT)}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>
                        {s.total.toLocaleString("ru-RU")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}

          {/* ── trend + type mix ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard icon={<TrendingUp size={13} />} title={T.secTrend} subtitle={isProd ? T.trendSubProd : T.trendSub}
                empty={A.trend.length === 0} height={286}
                right={<SegmentedToggle size="sm" value={gran} onChange={setGran}
                  options={[["month", T.byMonth], ["week", T.byWeek]]} />}>
                <ReactApexChart options={areaOpts} series={areaSeries} type="area" height={286} />
              </ChartCard>
            </div>
            <ChartCard icon={<Tag size={13} />} title={T.secTypes} empty={A.types.length === 0} height={286}>
              <div className="px-3">
                <ReactApexChart options={donutOpts} series={donutSeries} type="donut" height={210} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center pb-2">
                  {topTypes.slice(0, 6).map((x) => (
                    <span key={x.k} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[x.k] || C_NA }} />
                      {L("type", x.k)} <span className="tabular-nums font-semibold" style={{ color: "var(--text-2)" }}>{x.n}</span>
                    </span>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* ── hotspots + foreign objects ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard icon={(!isProd && topMode === "place") ? <MapPin size={13} /> : <Boxes size={13} />}
              title={isProd ? T.secProducts : T.secTop} subtitle={isProd ? T.prodSub : T.topSub}
              empty={topData.length === 0} height={320}
              right={isProd ? null : <SegmentedToggle size="sm" value={topMode} onChange={setTopMode}
                options={[["product", T.topProducts], ["place", T.topPlaces]]} />}>
              <ReactApexChart
                options={barOpts(topData.map((x) => x.k), isProd ? SRC_COLORS.production : SRC_COLORS.guest)}
                series={[{ name: T.rows, data: topData.map((x) => x.n) }]}
                type="bar" height={320} />
            </ChartCard>

            <ChartCard icon={<Bug size={13} />} title={T.secForeign} subtitle={T.foreignSub}
              empty={A.cats.length === 0} height={320}>
              <ReactApexChart options={treeOpts} series={treeSeries} type="treemap" height={320} />
            </ChartCard>
          </div>

          {/* ── cells at fault + accountability ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard icon={<Factory size={13} />} title={T.secCells} subtitle={T.cellsSub}
              empty={A.topCells.length === 0} height={330}>
              <ReactApexChart
                options={barOpts(A.topCells.map((x) => (x.code && x.code !== x.k ? `${x.code} · ${x.k}` : x.k)), SRC_COLORS.production)}
                series={[{ name: T.rows, data: A.topCells.map((x) => x.n) }]}
                type="bar" height={330} />
            </ChartCard>

            <ChartCard icon={<UserCog size={13} />} title={T.secAcc} subtitle={T.accSub}
              empty={A.acc.length === 0} height={330}
              right={<SegmentedToggle size="sm" value={accMode} onChange={setAccMode}
                options={[["brig", T.accBrig], ["mgr", T.accMgr]]} />}>
              <ReactApexChart options={accOpts} series={accSeries} type="bar" height={330} />
            </ChartCard>
          </div>

          {/* ── seasonality — native grid heatmap, styled after the fleet HeatmapChart:
                 brand-gold header, solid ramp cells with auto-contrast labels,
                 collapsed 1px borders, sticky type-name column ── */}
          <ChartCard icon={<CalendarClock size={13} />} title={T.secSeason} subtitle={T.seasonSub}
            empty={A.season.length === 0} height={280}>
            <div className="overflow-x-auto px-3 pb-1">
              <table className="season-heat" style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 134 }} />
                  {MONTHS.map((_, m) => <col key={m} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...seasonTh, position: "sticky", left: 0, zIndex: 2, textAlign: "left", paddingLeft: 12 }}>
                      {T.colType}
                    </th>
                    {MONTHS.map((mo, m) => (
                      <th key={m} style={{ ...seasonTh, textAlign: "center", opacity: A.monthTotals[m] ? 1 : 0.5 }}>{mo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {A.season.map((s) => (
                    <tr key={s.k}>
                      <td
                        title={L("type", s.k)}
                        style={{
                          position: "sticky", left: 0, zIndex: 1,
                          background: "var(--bg-card)",
                          borderRight: "2px solid var(--border-md)",
                          borderBottom: "1px solid var(--border)",
                          padding: "0 10px", height: 40, whiteSpace: "nowrap",
                          fontSize: 12, fontWeight: 600, color: "var(--text-2)",
                        }}
                      >
                        <span className="block truncate" style={{ maxWidth: 114 }}>{L("type", s.k)}</span>
                      </td>
                      {s.data.map((v, m) => {
                        const noData = A.monthTotals[m] === 0;
                        const bg = noData ? null : seasonColor(v);
                        return (
                          <td
                            key={m}
                            title={noData ? undefined : `${L("type", s.k)} · ${MONTHS[m]} — ${v}%`}
                            style={{
                              height: 40, textAlign: "center",
                              fontSize: 11, fontWeight: 700, letterSpacing: "-0.2px",
                              border: "1px solid var(--border)",
                              background: bg || "var(--bg-inner)",
                              color: bg ? contrastText(bg) : "var(--text-4)",
                            }}
                          >
                            {noData || !bg ? "" : v >= 1 ? `${Math.round(v)}%` : "<1%"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {/* ── register ── */}
          <div>
            <TableCard
              icon={ClipboardList}
              title={T.secTable}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {sorted.length.toLocaleString("ru-RU")} {T.rows}
              </span>}
              maxHeight="none"
            >
              <thead className="sticky top-0 z-10" style={{ background: "var(--bg-inner)" }}>
                <tr>
                  <Th label={T.colDate} k="date" sort={sort} onSort={onSort} />
                  {!isProd && <Th label={T.colSrc} k="src" sort={sort} onSort={onSort} />}
                  <Th label={T.colPlace} k="place" sort={sort} onSort={onSort} />
                  <Th label={T.colProduct} k="product" sort={sort} onSort={onSort} />
                  <Th label={T.colType} k="type" sort={sort} onSort={onSort} />
                  <Th label={T.colCat} k="cat" sort={sort} onSort={onSort} />
                  <Th label={T.colCell} k="cell" sort={sort} onSort={onSort} />
                  <Th label={T.colBrig} k="brig" sort={sort} onSort={onSort} />
                  <Th label={T.colRet} k="ret" align="center" />
                  <Th label={T.colStatus} k="status" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={isProd ? 9 : 10} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td>
                  </tr>
                ) : pageRows.map((r) => {
                  const SrcIcon = SRC_ICONS[r.s] || CircleDot;
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDate(r.d)}</td>
                      {!isProd && (
                        <td className="px-3 py-2">
                          <Chip color={SRC_COLORS[r.s] || C_NA} icon={SrcIcon}>{L("src", r.s)}</Chip>
                        </td>
                      )}
                      <td className="px-3 py-2 max-w-[190px] truncate" title={r.pl || ""} style={{ color: "var(--text-2)" }}>{r.pl || "—"}</td>
                      <td className="px-3 py-2 max-w-[190px] truncate" title={r.pr || ""} style={{ color: "var(--text-2)" }}>{r.pr || "—"}</td>
                      <td className="px-3 py-2"><Chip color={TYPE_COLORS[r.t] || C_NA}>{L("type", r.t)}</Chip></td>
                      <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                        {r.c ? <Chip color={CAT_COLORS[r.c] || C_NA}>{L("cat", r.c)}</Chip> : "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[170px] truncate" title={r.cn || r.fc || ""} style={{ color: "var(--text-3)" }}>
                        {r.cn || r.fc || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[190px] truncate" title={tl(r.b || "")} style={{ color: "var(--text-2)" }}>{tl(who(r)) || "—"}</td>
                      <td className="px-3 py-2 text-center" style={{ color: r.r ? C_WAIT : "var(--text-4)" }}>{r.r ? T.yes : "—"}</td>
                      <td className="px-3 py-2"><Chip color={STATUS_COLORS[r.st] || C_NA}>{L("st", r.st)}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
            <Pagination page={page} pageCount={pageCount} total={sorted.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        </div>
      )}

      {/* ── row detail ──
          Everything except the three long free-text columns is already in the
          table row, so the modal paints from that immediately. Only the text
          block waits on /api/quality/{id} — a failure there costs the notes,
          not the whole card. */}
      {openRow && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          title={T.detail}
          subtitle={`${fmtDate(openRow.d)}${openRow.no ? ` · № ${openRow.no}` : ""}`}
          icon={<ClipboardList size={16} />}
          maxWidth="max-w-2xl"
          footer={<Button variant="secondary" onClick={() => setOpenId(null)}>{T.close}</Button>}
        >
          <>
            <div className="flex flex-wrap gap-1.5">
              <Chip color={SRC_COLORS[openRow.s] || C_NA} icon={SRC_ICONS[openRow.s] || CircleDot}>{L("src", openRow.s)}</Chip>
              <Chip color={TYPE_COLORS[openRow.t] || C_NA}>{L("type", openRow.t)}</Chip>
              {openRow.c && <Chip color={CAT_COLORS[openRow.c] || C_NA}>{L("cat", openRow.c)}</Chip>}
              <Chip color={STATUS_COLORS[openRow.st] || C_NA}>{L("st", openRow.st)}</Chip>
              {openRow.r && <Chip color={C_WAIT} icon={Undo2}>{T.mReturn}</Chip>}
            </div>

            {/* The register is Russian. Descriptive fields (store, product, cell)
                are words — transliterating them to Latin just mangles them, so
                they render verbatim (their original Russian). People's names
                (brigadir, manager, sheet name) still go through tl: a name reads
                fine transliterated. The table cells and word-charts follow the
                same split. */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                [RU.colPlace, openRow.pl || ""],
                [RU.colProduct, openRow.pr || ""],
                [RU.mCell, [openRow.fc, openRow.cn || ""].filter(Boolean).join(" · ")],
                [RU.mFault, openRow.f == null ? "—" : openRow.f ? T.yes : T.no],
                [RU.colBrig, tl(who(openRow))],
                ...(openRow.sup ? [[RU.mSheetName, tl(openRow.b || "")]] : []),
                [RU.colMgr, tl(openRow.m || "")],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)" }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>{k}</div>
                  <div style={{ color: "var(--text-1)" }}>{v || "—"}</div>
                </div>
              ))}
            </div>

            {detailLoading && !detail ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-28" /><SkeletonBlock className="h-14 w-full" />
              </div>
            ) : detailError ? (
              <div className="rounded-xl px-3 py-2 text-[11px]" style={{ background: hexA(C_OPEN, 0.1), color: C_OPEN }}>
                {T.textFailed}: {detailError?.response?.status || ""} {detailError?.response?.data?.detail || detailError?.message || ""}
              </div>
            ) : (
              [[RU.mDesc, detail?.description], [RU.mAction, detail?.action], [RU.mComment, detail?.comment]]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{k}</div>
                    {/* Free-text the QA team typed by hand — show it verbatim, as
                        entered. Transliterating a whole comment/description/action
                        paragraph (tl) just garbles what a person actually wrote. */}
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>{v}</p>
                  </div>
                ))
            )}
          </>
        </Modal>
      )}
    </Layout>
  );
}
