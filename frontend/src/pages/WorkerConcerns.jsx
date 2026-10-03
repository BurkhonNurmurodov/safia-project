import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  AlertTriangle, ClipboardList, ShieldCheck,
  Loader, Users2, TrendingUp, UserCog, Boxes, Megaphone, Settings2,
  LayoutGrid, UserRound, CircleDot, FileSpreadsheet, ArrowUpRight,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { usePageAccess } from "../hooks/usePageAccess";
import { useCapabilities } from "../hooks/useCapabilities";
import { canAccessPage } from "../config/pages";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { padChartFrom, listChartDays } from "../utils/chartRange";

// The page reads the concerns workers file on «Yacheyka havotirlari»
// (/cell-concerns) — routers/worker_concerns.py, from 2026-10-03. It used to
// read the ~180 per-cell Google sheets; nothing here syncs or refreshes now.

// ── status palette ───────────────────────────────────────────────────────────
// Statuses are SEMANTIC (traffic-light), not categorical: done green, doing
// yellow, todo red; «uplifted» (handed up the chain, still open — no longer the
// leader's to act on) is a de-emphasis slate. Never brand gold.
const ST_KEYS = ["done", "doing", "todo", "uplifted"];
const ST_COLORS = {
  done: "#22c55e", doing: "#eab308", todo: "#ef4444", uplifted: "#94a3b8",
};
const C_OPEN = "#ef4444", C_DONE = "#22c55e", C_DOING = "#eab308";
const C_WORKERS = "#3b82f6";
const C_LOWN = "#94a3b8";
const BRAND = "#C8973F";

// A status filter saved before the switch may still name the sheet era's keys:
// «deferred» was their word for the same act as «uplifted», «other» has none.
const cleanStatuses = (sel) =>
  [...new Set((sel || []).map((s) => (s === "deferred" ? "uplifted" : s)))]
    .filter((s) => ST_KEYS.includes(s));

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "—");
const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Two tokens are enough to recognize a person and short enough for an axis
// label (a worker's name is free text, so this is all it ever claims).
const shortName = (name) => {
  const t = (name || "").trim().split(/\s+/);
  return t.slice(0, 2).join(" ");
};

const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// ── status words → four platform languages ───────────────────────────────────
// «todo» is the word /cell-concerns prints for the same rows («Yangi»): the
// platform knows a concern was not taken into work, never that it was not read.
const LI = { uz: 0, uz_cyrl: 1, ru: 2, en: 3 };
const ST_LBL = {
  done:     ["Hal bo'lgan", "Ҳал бўлган", "Решено", "Resolved"],
  doing:    ["Jarayonda", "Жараёнда", "В работе", "In progress"],
  todo:     ["Yangi", "Янги", "Новый", "New"],
  uplifted: ["Ko'tarilgan", "Кўтарилган", "Передано выше", "Escalated"],
};

const TXT = {
  uz: {
    title: "Ishchi havotirlari", sub: "Ishchilar «Yacheyka havotirlari» sahifasida liderlarga yozgan havotirlar — liderlar KPI",
    vObzor: "Obzor", vLeaders: "Liderlar KPI", vRegister: "Reyestr",
    loadFailed: "Ma'lumotlarni yuklab bo'lmadi", retry: "Qayta urinish",
    emptyTitle: "Hali havotir yo'q", emptyNote: "Ishchilar «Yacheyka havotirlari» sahifasida yozgan havotirlar shu yerda hisoblanadi.",
    emptyGo: "Yacheyka havotirlari",
    kTotal: "Jami havotirlar", kResolved: "Hal bo'lgan", kDoing: "Jarayonda",
    kOpen: "Hal bo'lmagan", kOpenHint: "hal bo'lganidan tashqari barchasi", kOpenUp: "{n} tasi yuqoriga ko'tarilgan",
    kWorkers: "Faol ishchilar", kWorkersHint: "yozilgan ism bo'yicha",
    secDaily: "Kunlik dinamika", secDailySub: "holatlar bo'yicha, kelib tushgan sana",
    secBrig: "Brigadirlar kesimi", secBrigSub: "tanlangan davr, holatlar bo'yicha",
    secCells: "Yacheykalar — hal bo'lmaganlar TOP", secCellsSub: "eng ko'p ochiq havotirli yacheykalar",
    secLeaders: "Liderlar KPI", secLeadersSub: "havotir yuborilgan lider kesimida",
    secRegister: "Havotirlar reyestri",
    colLeader: "Lider", colBrig: "Brigadir", colCells: "Yacheykalar", colTotal: "Jami",
    colDone: "Hal bo'lgan", colDoing: "Jarayonda", colOpen: "Hal bo'lmagan", colPct: "% hal bo'lgan",
    colNo: "№", colDate: "Sana", colCell: "Yacheyka", colOwner: "Ishchi", colText: "Havotir", colStatus: "Holat",
    fBrig: "Brigadir", fLeader: "Lider", fCell: "Yacheyka", fStatus: "Holat",
    searchLeader: "Lider qidirish…", searchReg: "Matn, ishchi, lider yoki №",
    rows: "ta", concernsWord: "havotir", leadersWord: "lider", noMatch: "Mos yozuv topilmadi",
    lowN: "kam ma'lumot", lowNHint: "5 tadan kam havotir — reyting uchun yetarli emas",
    unassigned: "ta havotirda lider ko'rsatilmagan — reytingga kirmaydi, reyestrda ko'rinadi",
    stUpHint: "Brigadirga (yoki undan yuqoriga) ko'tarilgan, hali hal bo'lmagan",
    bandsTitle: "KPI chegaralari", bandsEdit: "Chegaralarni sozlash",
    bandGreenL: "Yashil chegara (≥ %)", bandYellowL: "Sariq chegara (≥ %)",
    bandsHint: "Sariqdan pasti qizil hisoblanadi. Chegaralar butun platforma uchun bitta.",
    bandsSaved: "Chegaralar saqlandi", bandsErr: "Saqlab bo'lmadi",
    cancel: "Bekor qilish", save: "Saqlash", close: "Yopish",
    mTitle: "Havotir", mBrig: "Brigadir", mCategory: "Bo'lim", mStep: "Bosqich",
    mDoneOn: "Hal qilingan sana", mOpen: "«Havotirlar» sahifasida ochish",
    kamBand: "kam ma'lumot",
    pageOf: "sahifa",
    xBtn: "Excel",
    xTitle: "Excel eksport",
    xModalQ: "Filtrlar qo'llangan. Faylga nimani kiritamiz?",
    xOptFiltered: "Faqat filtrlangan yozuvlar",
    xOptFilteredD: "Ekranda ko'rinayotgan kesim bo'yicha",
    xOptAll: "Davrning barcha ma'lumotlari",
    xOptAllD: "Tanlangan davr uchun to'liq manzara — filtrlarsiz",
    xExport: "Eksport qilish",
    xDownloaded: "Fayl yuklab olindi",
    xSentTg: "Fayl Telegramga yuborildi",
    xFailed: "Eksport qilib bo'lmadi",
    xPeriod: "Davr", xPlant: "Zavod", xAllPlants: "Barcha zavodlar",
    xFilters: "Filtrlar", xScopeAll: "Barcha ma'lumotlar (filtrsiz)",
    xGenerated: "Shakllantirildi", xSearch: "Qidiruv",
    xUnassignedRow: "Lidersiz havotirlar",
    xSecKpi: "Asosiy ko'rsatkichlar",
  },
  uz_cyrl: {
    title: "Ишчи ҳавотирлари", sub: "Ишчилар «Ячейка ҳавотирлари» саҳифасида лидерларга ёзган ҳавотирлар — лидерлар KPI",
    vObzor: "Обзор", vLeaders: "Лидерлар KPI", vRegister: "Реестр",
    loadFailed: "Маълумотларни юклаб бўлмади", retry: "Қайта уриниш",
    emptyTitle: "Ҳали ҳавотир йўқ", emptyNote: "Ишчилар «Ячейка ҳавотирлари» саҳифасида ёзган ҳавотирлар шу ерда ҳисобланади.",
    emptyGo: "Ячейка ҳавотирлари",
    kTotal: "Жами ҳавотирлар", kResolved: "Ҳал бўлган", kDoing: "Жараёнда",
    kOpen: "Ҳал бўлмаган", kOpenHint: "ҳал бўлганидан ташқари барчаси", kOpenUp: "{n} таси юқорига кўтарилган",
    kWorkers: "Фаол ишчилар", kWorkersHint: "ёзилган исм бўйича",
    secDaily: "Кунлик динамика", secDailySub: "ҳолатлар бўйича, келиб тушган сана",
    secBrig: "Бригадирлар кесими", secBrigSub: "танланган давр, ҳолатлар бўйича",
    secCells: "Ячейкалар — ҳал бўлмаганлар TOP", secCellsSub: "энг кўп очиқ ҳавотирли ячейкалар",
    secLeaders: "Лидерлар KPI", secLeadersSub: "ҳавотир юборилган лидер кесимида",
    secRegister: "Ҳавотирлар реестри",
    colLeader: "Лидер", colBrig: "Бригадир", colCells: "Ячейкалар", colTotal: "Жами",
    colDone: "Ҳал бўлган", colDoing: "Жараёнда", colOpen: "Ҳал бўлмаган", colPct: "% ҳал бўлган",
    colNo: "№", colDate: "Сана", colCell: "Ячейка", colOwner: "Ишчи", colText: "Ҳавотир", colStatus: "Ҳолат",
    fBrig: "Бригадир", fLeader: "Лидер", fCell: "Ячейка", fStatus: "Ҳолат",
    searchLeader: "Лидер қидириш…", searchReg: "Матн, ишчи, лидер ёки №",
    rows: "та", concernsWord: "ҳавотир", leadersWord: "лидер", noMatch: "Мос ёзув топилмади",
    lowN: "кам маълумот", lowNHint: "5 тадан кам ҳавотир — рейтинг учун етарли эмас",
    unassigned: "та ҳавотирда лидер кўрсатилмаган — рейтингга кирмайди, реестрда кўринади",
    stUpHint: "Бригадирга (ёки ундан юқорига) кўтарилган, ҳали ҳал бўлмаган",
    bandsTitle: "KPI чегаралари", bandsEdit: "Чегараларни созлаш",
    bandGreenL: "Яшил чегара (≥ %)", bandYellowL: "Сариқ чегара (≥ %)",
    bandsHint: "Сариқдан пасти қизил ҳисобланади. Чегаралар бутун платформа учун битта.",
    bandsSaved: "Чегаралар сақланди", bandsErr: "Сақлаб бўлмади",
    cancel: "Бекор қилиш", save: "Сақлаш", close: "Ёпиш",
    mTitle: "Ҳавотир", mBrig: "Бригадир", mCategory: "Бўлим", mStep: "Босқич",
    mDoneOn: "Ҳал қилинган сана", mOpen: "«Ҳавотирлар» саҳифасида очиш",
    kamBand: "кам маълумот",
    pageOf: "саҳифа",
    xBtn: "Excel",
    xTitle: "Excel экспорт",
    xModalQ: "Филтрлар қўлланган. Файлга нимани киритамиз?",
    xOptFiltered: "Фақат филтрланган ёзувлар",
    xOptFilteredD: "Экранда кўринаётган кесим бўйича",
    xOptAll: "Даврнинг барча маълумотлари",
    xOptAllD: "Танланган давр учун тўлиқ манзара — филтрларсиз",
    xExport: "Экспорт қилиш",
    xDownloaded: "Файл юклаб олинди",
    xSentTg: "Файл Telegram'га юборилди",
    xFailed: "Экспорт қилиб бўлмади",
    xPeriod: "Давр", xPlant: "Завод", xAllPlants: "Барча заводлар",
    xFilters: "Филтрлар", xScopeAll: "Барча маълумотлар (филтрсиз)",
    xGenerated: "Шакллантирилди", xSearch: "Қидирув",
    xUnassignedRow: "Лидерсиз ҳавотирлар",
    xSecKpi: "Асосий кўрсаткичлар",
  },
  ru: {
    title: "Хавотиры работников", sub: "Опасения, которые работники пишут лидерам на странице «Хавотиры ячеек» — KPI лидеров",
    vObzor: "Обзор", vLeaders: "KPI лидеров", vRegister: "Реестр",
    loadFailed: "Не удалось загрузить данные", retry: "Повторить",
    emptyTitle: "Хавотиров пока нет", emptyNote: "Здесь считаются хавотиры, которые работники пишут на странице «Хавотиры ячеек».",
    emptyGo: "Хавотиры ячеек",
    kTotal: "Всего хавотиров", kResolved: "Решено", kDoing: "В работе",
    kOpen: "Не решено", kOpenHint: "всё, кроме решённых", kOpenUp: "из них {n} передано выше",
    kWorkers: "Активных работников", kWorkersHint: "по введённому имени",
    secDaily: "Динамика по дням", secDailySub: "по статусам, дата подачи",
    secBrig: "Разрез по бригадирам", secBrigSub: "выбранный период, по статусам",
    secCells: "Ячейки — топ нерешённых", secCellsSub: "ячейки с наибольшим числом открытых хавотиров",
    secLeaders: "KPI лидеров", secLeadersSub: "по лидеру, которому подан хавотир",
    secRegister: "Реестр хавотиров",
    colLeader: "Лидер", colBrig: "Бригадир", colCells: "Ячейки", colTotal: "Всего",
    colDone: "Решено", colDoing: "В работе", colOpen: "Не решено", colPct: "% решено",
    colNo: "№", colDate: "Дата", colCell: "Ячейка", colOwner: "Работник", colText: "Хавотир", colStatus: "Статус",
    fBrig: "Бригадир", fLeader: "Лидер", fCell: "Ячейка", fStatus: "Статус",
    searchLeader: "Поиск лидера…", searchReg: "Текст, работник, лидер или №",
    rows: "шт", concernsWord: "хавотиров", leadersWord: "лидеров", noMatch: "Ничего не найдено",
    lowN: "мало данных", lowNHint: "меньше 5 хавотиров — недостаточно для рейтинга",
    unassigned: "хавотиров без лидера — не входят в рейтинг, видны в реестре",
    stUpHint: "Передан бригадиру (или выше) и ещё не решён",
    bandsTitle: "Пороги KPI", bandsEdit: "Настроить пороги",
    bandGreenL: "Зелёный порог (≥ %)", bandYellowL: "Жёлтый порог (≥ %)",
    bandsHint: "Ниже жёлтого — красный. Пороги общие для всей платформы.",
    bandsSaved: "Пороги сохранены", bandsErr: "Не удалось сохранить",
    cancel: "Отмена", save: "Сохранить", close: "Закрыть",
    mTitle: "Хавотир", mBrig: "Бригадир", mCategory: "Отдел", mStep: "Уровень",
    mDoneOn: "Дата решения", mOpen: "Открыть в «Хавотирах»",
    kamBand: "мало данных",
    pageOf: "страница",
    xBtn: "Excel",
    xTitle: "Экспорт в Excel",
    xModalQ: "Применены фильтры. Что включить в файл?",
    xOptFiltered: "Только отфильтрованные записи",
    xOptFilteredD: "Срез, который сейчас на экране",
    xOptAll: "Все данные за период",
    xOptAllD: "Полная картина за выбранный период — без фильтров",
    xExport: "Экспортировать",
    xDownloaded: "Файл скачан",
    xSentTg: "Файл отправлен в Telegram",
    xFailed: "Не удалось экспортировать",
    xPeriod: "Период", xPlant: "Завод", xAllPlants: "Все заводы",
    xFilters: "Фильтры", xScopeAll: "Все данные (без фильтров)",
    xGenerated: "Сформирован", xSearch: "Поиск",
    xUnassignedRow: "Хавотиры без лидера",
    xSecKpi: "Ключевые показатели",
  },
  en: {
    title: "Worker concerns", sub: "Concerns workers write to their leaders on «Cell concerns» — the leaders' KPI",
    vObzor: "Overview", vLeaders: "Leaders KPI", vRegister: "Register",
    loadFailed: "Failed to load data", retry: "Retry",
    emptyTitle: "No concerns yet", emptyNote: "Concerns workers write on the «Cell concerns» page are counted here.",
    emptyGo: "Cell concerns",
    kTotal: "Total concerns", kResolved: "Resolved", kDoing: "In progress",
    kOpen: "Unresolved", kOpenHint: "everything except resolved", kOpenUp: "{n} of them escalated",
    kWorkers: "Active workers", kWorkersHint: "by the name typed",
    secDaily: "Daily trend", secDailySub: "by status, filing date",
    secBrig: "By brigadir", secBrigSub: "selected period, by status",
    secCells: "Cells — top unresolved", secCellsSub: "cells with the most open concerns",
    secLeaders: "Leaders KPI", secLeadersSub: "by the leader each concern was filed to",
    secRegister: "Concerns register",
    colLeader: "Leader", colBrig: "Brigadir", colCells: "Cells", colTotal: "Total",
    colDone: "Resolved", colDoing: "In progress", colOpen: "Unresolved", colPct: "% resolved",
    colNo: "№", colDate: "Date", colCell: "Cell", colOwner: "Worker", colText: "Concern", colStatus: "Status",
    fBrig: "Brigadir", fLeader: "Leader", fCell: "Cell", fStatus: "Status",
    searchLeader: "Search leaders…", searchReg: "Text, worker, leader or №",
    rows: "rows", concernsWord: "concerns", leadersWord: "leaders", noMatch: "No match",
    lowN: "low data", lowNHint: "fewer than 5 concerns — not enough to rank",
    unassigned: "concern(s) name no leader — outside the ranking, visible in the register",
    stUpHint: "Handed to the brigadir (or higher) and not resolved yet",
    bandsTitle: "KPI thresholds", bandsEdit: "Adjust thresholds",
    bandGreenL: "Green threshold (≥ %)", bandYellowL: "Yellow threshold (≥ %)",
    bandsHint: "Below yellow counts as red. Thresholds are platform-wide.",
    bandsSaved: "Thresholds saved", bandsErr: "Could not save",
    cancel: "Cancel", save: "Save", close: "Close",
    mTitle: "Concern", mBrig: "Brigadir", mCategory: "Department", mStep: "Chain step",
    mDoneOn: "Resolved on", mOpen: "Open in «Concerns»",
    kamBand: "low data",
    pageOf: "page",
    xBtn: "Excel",
    xTitle: "Excel export",
    xModalQ: "Filters are applied. What should go into the file?",
    xOptFiltered: "Only the filtered records",
    xOptFilteredD: "The slice currently on screen",
    xOptAll: "All data for the period",
    xOptAllD: "The full picture for the selected range — no filters",
    xExport: "Export",
    xDownloaded: "File downloaded",
    xSentTg: "File sent to Telegram",
    xFailed: "Export failed",
    xPeriod: "Period", xPlant: "Plant", xAllPlants: "All plants",
    xFilters: "Filters", xScopeAll: "All data (no filters)",
    xGenerated: "Generated", xSearch: "Search",
    xUnassignedRow: "Concerns with no leader",
    xSecKpi: "Key figures",
  },
};

export default function WorkerConcerns() {
  const { lang, t } = useLang();
  const T = TXT[lang] || TXT.ru;
  const stL = (k) => (ST_LBL[k] || ST_LBL.todo)[LI[lang] ?? LI.ru];
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const may = (key) => canAccessPage(auth?.role, key, access, capPages, deniedPages);
  const { chartTheme, gridColor, labelColor, legendColor } = useChartTheme();
  const factorySection = useFactorySection();

  const today = localISO(new Date());
  const monthStart = today.slice(0, 8) + "01";

  // ── page state (persisted, like every page) ───────────────────────────────
  const [view, setView] = usePersistentState("wc_view", "obzor");
  const [dateFrom, setDateFrom] = usePersistentState("wc_date_from", monthStart);
  const [dateTo, setDateTo] = usePersistentState("wc_date_to", today);
  const [mgrSel, setMgrSel] = usePersistentState("wc_mgr_sel", []);
  // Leaders are picked by PROFILE id since the platform became the source; the
  // sheet era kept spellings under `wc_lead_sel`, which nothing reads now.
  const [leadSel, setLeadSel] = usePersistentState("wc_lead_ids", []);
  const [cellSel, setCellSel] = usePersistentState("wc_cell_sel", []);
  const [stSaved, setStSel] = usePersistentState("wc_st_sel", []);
  const stSel = useMemo(() => cleanStatuses(stSaved), [stSaved]);
  const [q, setQ] = usePersistentState("wc_q", "");
  const [page, setPage] = usePersistentState("wc_page", 1);
  const [regSort, setRegSort] = usePersistentState("wc_reg_sort", "date_desc");
  const [ldSort, setLdSort] = usePersistentState("wc_ld_sort", { key: "total", dir: "desc" });

  // ── meta (options + bands) ────────────────────────────────────────────────
  const metaQ = useQuery({
    queryKey: ["wc-meta"],
    queryFn: () => api.get("/api/worker-concerns/meta").then((r) => r.data),
  });
  const meta = metaQ.data;
  const bands = meta?.bands || { green: 80, yellow: 50 };
  const minRanked = meta?.min_ranked ?? 5;
  // Nothing filed in this viewer's scope, ever — not a period with no rows.
  const noneYet = meta != null && (meta.total || 0) === 0;

  // ── request params ────────────────────────────────────────────────────────
  const baseParams = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ...(mgrSel.length ? { manager_id: mgrSel } : {}),
    ...(leadSel.length ? { leader_id: leadSel } : {}),
    ...(cellSel.length ? { cell: cellSel } : {}),
    ...(stSel.length ? { status: stSel } : {}),
  }), [dateFrom, dateTo, mgrSel, leadSel, cellSel, stSel]);
  const params = useFactoryParams(baseParams);

  // The daily chart honors the 7-day minimum window; KPIs keep the exact range.
  const chartFrom = padChartFrom(dateFrom, dateTo);
  const statsParams = useMemo(
    () => (chartFrom !== dateFrom ? { ...params, chart_from: chartFrom } : params),
    [params, chartFrom, dateFrom]
  );

  const statsQ = useQuery({
    queryKey: ["wc-stats", statsParams],
    queryFn: () => api.get("/api/worker-concerns/stats", { params: statsParams }).then((r) => r.data),
    enabled: !noneYet,
    placeholderData: keepPreviousData,
  });
  const leadersQ = useQuery({
    queryKey: ["wc-leaders", params],
    queryFn: () => api.get("/api/worker-concerns/leaders", { params }).then((r) => r.data),
    enabled: !noneYet && view === "leaders",
    placeholderData: keepPreviousData,
  });
  const listParams = useMemo(
    () => ({ ...params, q: q.trim() || undefined, page, page_size: 50, sort: regSort }),
    [params, q, page, regSort]
  );
  const listQ = useQuery({
    queryKey: ["wc-list", listParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: listParams }).then((r) => r.data),
    enabled: !noneYet && view === "register",
    placeholderData: keepPreviousData,
  });

  // Filters changed → back to page 1 of the register.
  const filterSig = JSON.stringify([params, q, regSort]);
  const prevSig = useRef(filterSig);
  useEffect(() => {
    if (prevSig.current !== filterSig) {
      prevSig.current = filterSig;
      if (page !== 1) setPage(1);
    }
  }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filter sections ───────────────────────────────────────────────────────
  const supers = useFactorySupervisors(meta?.supervisors || [], mgrSel, (kept) => setMgrSel(kept || []), "id");
  const supName = useMemo(
    () => Object.fromEntries((meta?.supervisors || []).map((s) => [s.id, s.name])),
    [meta]
  );
  const leaderOpts = meta?.leader_opts || [];
  const leadName = useMemo(
    () => Object.fromEntries(leaderOpts.map((l) => [l.id, l.name])),
    [leaderOpts]
  );
  // A pick the viewer can no longer see (a leader whose rows left their
  // scope) must not narrow the page invisibly — drop it once the list is in.
  useEffect(() => {
    if (!meta) return;
    const kept = leadSel.filter((id) => id in leadName);
    if (kept.length !== leadSel.length) setLeadSel(kept);
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    const s = [];
    if (factorySection) s.push(factorySection);
    if (!meta?.lock_own_unit && (meta?.supervisors || []).length > 0) {
      s.push({
        key: "brig", icon: UserCog, label: T.fBrig,
        active: mgrSel.length > 0,
        display: mgrSel.length === 1 ? tl(supName[mgrSel[0]] || "") : String(mgrSel.length),
        onClear: () => setMgrSel([]),
        render: () => (
          <OptsFilter opts={supers.map((x) => x.id)} sel={mgrSel} onChange={setMgrSel}
            render={(id) => tl(supName[id] || String(id))} />
        ),
      });
    }
    if (!meta?.lock_own_leader && leaderOpts.length > 0) {
      s.push({
        key: "leader", icon: UserRound, label: T.fLeader,
        active: leadSel.length > 0,
        display: leadSel.length === 1 ? tl(shortName(leadName[leadSel[0]] || "")) : String(leadSel.length),
        onClear: () => setLeadSel([]),
        render: () => (
          <OptsFilter searchable opts={leaderOpts.map((l) => l.id)} sel={leadSel} onChange={setLeadSel}
            render={(id) => tl(leadName[id] || String(id))} />
        ),
      });
    }
    // A cell is its CODE (utils/cellName.js) — the workshop name is never printed.
    if ((meta?.cells || []).length > 0) {
      s.push({
        key: "cell", icon: LayoutGrid, label: T.fCell,
        active: cellSel.length > 0,
        display: cellSel.length === 1 ? cellSel[0] : String(cellSel.length),
        onClear: () => setCellSel([]),
        render: () => (
          <OptsFilter searchable opts={(meta.cells || []).map((c) => c.code)}
            sel={cellSel} onChange={setCellSel} render={(c) => c} />
        ),
      });
    }
    s.push({
      key: "status", icon: CircleDot, label: T.fStatus,
      active: stSel.length > 0,
      display: stSel.length === 1 ? stL(stSel[0]) : String(stSel.length),
      onClear: () => setStSel([]),
      render: () => (
        <OptsFilter opts={ST_KEYS} sel={stSel} onChange={setStSel} render={(k) => stL(k)} />
      ),
    });
    return s;
  }, [factorySection, meta, mgrSel, leadSel, cellSel, stSel, supers, supName, leaderOpts, leadName, T, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = () => { setMgrSel([]); setLeadSel([]); setCellSel([]); setStSel([]); };

  // ── charts ────────────────────────────────────────────────────────────────
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setChartsReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
  const baseChart = {
    fontFamily: "inherit", toolbar: { show: false }, background: "transparent",
    animations: { enabled: false }, zoom: { enabled: false }, selection: { enabled: false },
  };

  const stats = statsQ.data;
  const kpi = stats?.kpi;

  // Daily stacked columns over the padded window; a status with zero rows in
  // the window doesn't earn a legend entry.
  const daily = stats?.daily || [];
  const days = useMemo(() => listChartDays(chartFrom, dateTo), [chartFrom, dateTo]);
  const byDay = useMemo(() => Object.fromEntries(daily.map((d) => [d.d, d])), [daily]);
  const dailySt = ST_KEYS.filter((k) => daily.some((d) => (d[k] || 0) > 0));
  const dailySeries = dailySt.map((k) => ({ name: stL(k), data: days.map((d) => byDay[d]?.[k] || 0) }));
  const dailyOpts = {
    chart: { ...baseChart, type: "bar", stacked: true },
    theme: chartTheme,
    colors: dailySt.map((k) => ST_COLORS[k]),
    plotOptions: { bar: { columnWidth: days.length > 40 ? "82%" : "58%", borderRadius: 3 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: days.map((d) => fmtDate(d).slice(0, 5)),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" } } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 4, right: 8 } },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };

  // Per-brigadir horizontal stack, resolution % in the axis label.
  const brig = stats?.by_brigadir || [];
  const brigSt = ST_KEYS.filter((k) => brig.some((b) => (b[k] || 0) > 0));
  const brigCats = brig.map((b) =>
    `${tl(shortName(b.name))} · ${b.total ? Math.round((b.done / b.total) * 100) : 0}%`);
  const brigSeries = brigSt.map((k) => ({ name: stL(k), data: brig.map((b) => b[k] || 0) }));
  const brigOpts = {
    chart: { ...baseChart, type: "bar", stacked: true },
    theme: chartTheme,
    colors: brigSt.map((k) => ST_COLORS[k]),
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
    dataLabels: { enabled: false },
    xaxis: {
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
      categories: brigCats,
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 200 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };
  const brigH = Math.max(220, brig.length * 30 + 90);

  // Cells with the most open concerns — the "go fix this first" list.
  const topCells = (stats?.top_cells || []).filter((c) => c.open > 0).slice(0, 10);
  const cellCats = topCells.map((c) => c.leader ? `${c.code} · ${tl(shortName(c.leader))}` : c.code);
  const cellOpts = {
    chart: { ...baseChart, type: "bar" },
    theme: chartTheme,
    colors: [C_OPEN],
    plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: "68%" } },
    dataLabels: {
      enabled: true, offsetX: 18,
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    xaxis: {
      categories: cellCats,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 210 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const c = topCells[dataPointIndex];
        return tipHTML(cellCats[dataPointIndex] ?? "",
          `${c?.open ?? 0} / ${c?.total ?? 0} ${T.concernsWord}`, C_OPEN);
      },
    },
  };
  const cellsH = Math.max(200, topCells.length * 32 + 60);

  // ── leaders table ─────────────────────────────────────────────────────────
  const bandOf = (r) => {
    if (!r.ranked || r.pct == null) return "low";
    if (r.pct >= bands.green) return "green";
    if (r.pct >= bands.yellow) return "yellow";
    return "red";
  };
  const BAND_COLORS = { green: C_DONE, yellow: C_DOING, red: C_OPEN, low: C_LOWN };

  const ldRowsAll = leadersQ.data?.rows || [];
  const ldRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? ldRowsAll.filter((r) =>
          r.leader.toLowerCase().includes(needle) || tl(r.leader).toLowerCase().includes(needle))
      : ldRowsAll;
    const dirMul = ldSort.dir === "asc" ? 1 : -1;
    const val = (r) => {
      switch (ldSort.key) {
        case "leader": return r.leader;
        case "done": return r.done;
        case "open": return r.open;
        case "pct":
          // Unranked rows always trail — a 100% on two concerns must not sit
          // on top of the table this KPI is read from.
          return r.ranked ? r.pct : (ldSort.dir === "asc" ? Infinity : -Infinity);
        default: return r.total;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string") return va.localeCompare(vb) * dirMul;
      return (va - vb) * dirMul;
    });
  }, [ldRowsAll, q, ldSort, tl]);
  const onLdSort = (k) =>
    setLdSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));

  const bandCounts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, low: 0 };
    for (const r of ldRowsAll) c[bandOf(r)] += 1;
    return c;
  }, [ldRowsAll, bands]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── thresholds modal (admin only) ─────────────────────────────────────────
  const [bandsOpen, setBandsOpen] = useState(false);
  const [gEdit, setGEdit] = useState(bands.green);
  const [yEdit, setYEdit] = useState(bands.yellow);
  useEffect(() => { setGEdit(bands.green); setYEdit(bands.yellow); }, [bands.green, bands.yellow]);
  const bandsMut = useMutation({
    mutationFn: (body) => api.put("/api/worker-concerns/thresholds", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wc-meta"] });
      qc.invalidateQueries({ queryKey: ["wc-leaders"] });
      setBandsOpen(false);
      toast.success(T.bandsSaved);
    },
    onError: (e) => toast.error(`${T.bandsErr}: ${e?.response?.data?.detail || e?.message || ""}`),
  });
  const bandsValid = Number(yEdit) > 0 && Number(gEdit) > Number(yEdit) && Number(gEdit) <= 100;

  // ── register ──────────────────────────────────────────────────────────────
  const [detail, setDetail] = useState(null);
  const list = listQ.data;
  const pageCount = Math.max(1, Math.ceil((list?.total || 0) / 50));

  // ── Excel export ──────────────────────────────────────────────────────────
  // One file mirrors the whole page: Obzor + Liderlar KPI + Reyestr (ALL
  // matching rows — paging is a screen affordance). When filters make «what
  // you see» ≠ «the period», a modal asks which one the file should be; the
  // choice is resolved HERE into a plain filter set so the backend never
  // re-derives it. Labels ship in the viewer's language; the data itself is
  // re-queried server-side under the same scope builder as every endpoint.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [exporting, setExporting] = useState(false);

  // The locked viewer's static plant chip is not a choice, so not a "filter".
  const activeFilterChips = [];
  if (factorySection?.active && !factorySection.static) activeFilterChips.push(factorySection.display);
  if (mgrSel.length) activeFilterChips.push(`${T.fBrig}: ${mgrSel.length === 1 ? tl(supName[mgrSel[0]] || "") : mgrSel.length}`);
  if (leadSel.length) activeFilterChips.push(`${T.fLeader}: ${leadSel.length === 1 ? tl(shortName(leadName[leadSel[0]] || "")) : leadSel.length}`);
  if (cellSel.length) activeFilterChips.push(`${T.fCell}: ${cellSel.length === 1 ? cellSel[0] : cellSel.length}`);
  if (stSel.length) activeFilterChips.push(`${T.fStatus}: ${stSel.length === 1 ? stL(stSel[0]) : stSel.length}`);
  if (q.trim()) activeFilterChips.push(`${T.xSearch}: «${q.trim()}»`);
  const filtersActive = activeFilterChips.length > 0;
  // What the «filtered» option will actually put in the register sheet.
  const regCount = kpi && !q.trim() ? (kpi.total ?? 0) : null;

  const buildExportBody = (scope) => {
    const period = `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    const plantValue = factorySection?.static ? factorySection.display
      : scope === "filtered" && factorySection?.active ? factorySection.display
      : T.xAllPlants;
    return {
      filename: `${T.title} ${fmtDate(dateFrom)}–${fmtDate(dateTo)}`,
      title: T.title,
      subtitle: T.sub,
      caption: `📊 ${T.title} · ${period}`,
      filters: scope === "all"
        ? { date_from: dateFrom || undefined, date_to: dateTo || undefined, sort: regSort }
        : { ...params, q: q.trim() || undefined, sort: regSort },
      sheets: { overview: T.vObzor, leaders: T.vLeaders, register: T.vRegister },
      status_labels: Object.fromEntries(ST_KEYS.map((k) => [k, stL(k)])),
      labels: {
        secKpi: T.xSecKpi,
        kTotal: T.kTotal, kResolved: T.kResolved, kDoing: T.kDoing,
        kOpen: T.kOpen, kOpenHint: T.kOpenHint,
        kWorkers: T.kWorkers, kWorkersHint: T.kWorkersHint,
        secDaily: T.secDaily, secDailySub: T.secDailySub,
        secBrig: T.secBrig, secBrigSub: T.secBrigSub,
        secCells: T.secCells, secCellsSub: T.secCellsSub,
        secLeaders: T.secLeaders, secLeadersSub: T.secLeadersSub,
        secRegister: T.secRegister,
        colLeader: T.colLeader, colBrig: T.colBrig, colCells: T.colCells,
        colTotal: T.colTotal, colDone: T.colDone, colDoing: T.colDoing,
        colOpen: T.colOpen, colPct: T.colPct, colDate: T.colDate,
        colCell: T.colCell, colOwner: T.colOwner, colText: T.colText,
        colStatus: T.colStatus,
        unassignedRow: T.xUnassignedRow,
        lowNHint: T.lowNHint, noMatch: T.noMatch,
        rows: T.rows, concernsWord: T.concernsWord, leadersWord: T.leadersWord,
        bandLegend: {
          green: `≥ ${bands.green}%`,
          yellow: `${bands.yellow}–${bands.green - 1}%`,
          red: `< ${bands.yellow}%`,
          low: `${T.kamBand} (n<${minRanked})`,
        },
      },
      meta: [
        { label: T.xPeriod, value: period },
        { label: T.xPlant, value: plantValue },
        { label: T.xFilters, value: scope === "all" ? T.xScopeAll : (activeFilterChips.join(" · ") || "—") },
        { label: T.xGenerated, value: fmtDateTime(new Date().toISOString()) },
      ],
    };
  };

  const runExport = async (scope) => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/worker-concerns/export.xlsx", {
        body: buildExportBody(scope),
        fallbackName: "worker-concerns.xlsx",
      });
      toast.success(via === "download" ? T.xDownloaded : T.xSentTg);
      setExportOpen(false);
    } catch (e) {
      // The modal (if open) stays up so the operator can retry; the error
      // toast persists until dismissed (Telegram suppresses window.alert).
      toast.error(`${T.xFailed}: ${e?.response?.data?.detail || e?.message || ""}`);
    } finally {
      setExporting(false);
    }
  };
  const onExportClick = () => {
    if (filtersActive) { setExportScope("filtered"); setExportOpen(true); }
    else runExport("all");
  };
  const exportBtn = meta && !noneYet ? (
    <Button size="lg" variant="secondary" loading={exporting}
      icon={!exporting ? <FileSpreadsheet size={14} /> : null}
      onClick={onExportClick}>
      <span className="hidden sm:inline">{T.xBtn}</span>
    </Button>
  ) : null;

  const Kpi = ({ icon: Icon, color, label, value, hint }) => (
    <div className="rounded-2xl px-4 py-3.5" style={cardStyle}>
      <span className="grid place-items-center w-7 h-7 rounded-lg mb-2" style={{ background: hexA(color, 0.13), color }}>
        <Icon size={14} strokeWidth={2.4} />
      </span>
      <div className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-1 font-medium truncate" style={{ color: "var(--text-3)" }} title={label}>{label}</div>
      {hint && <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-4)" }} title={hint}>{hint}</div>}
    </div>
  );

  const ChartCard = ({ icon, title, subtitle, height = 300, empty, children }) => (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-6 h-6 rounded-md flex-shrink-0" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>{icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{title}</div>
            {subtitle && <div className="text-[11px] truncate" style={{ color: "var(--text-4)" }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="px-1 py-2 flex-1">
        {empty
          ? <div className="grid place-items-center text-xs" style={{ height, color: "var(--text-4)" }}>{T.noMatch}</div>
          : chartsReady ? children : <div style={{ height }} />}
      </div>
    </div>
  );

  const StChip = ({ st }) => (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap"
      style={{ background: hexA(ST_COLORS[st] || C_LOWN, 0.12), color: ST_COLORS[st] || C_LOWN, border: `1px solid ${hexA(ST_COLORS[st] || C_LOWN, 0.3)}` }}
      title={st === "uplifted" ? T.stUpHint : undefined}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ST_COLORS[st] || C_LOWN }} />
      {stL(st)}
    </span>
  );

  const PctCell = ({ r }) => {
    const band = bandOf(r);
    const color = BAND_COLORS[band];
    if (band === "low") {
      return (
        <span className="inline-flex items-center gap-1.5" title={T.lowNHint}>
          <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold"
            style={{ background: hexA(C_LOWN, 0.12), color: C_LOWN, border: `1px solid ${hexA(C_LOWN, 0.3)}` }}>
            {r.pct != null ? `${r.pct}%` : "—"}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{T.lowN}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <span className="hidden md:block w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: "var(--bg-inner)" }}>
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: color }} />
        </span>
        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums"
          style={{ background: hexA(color, 0.13), color, border: `1px solid ${hexA(color, 0.33)}` }}>
          {r.pct}%
        </span>
      </span>
    );
  };

  const isBoot = metaQ.isLoading;
  const loadError = metaQ.isError;
  const bodyLoading = statsQ.isLoading && view === "obzor";
  // The «Hal bo'lmagan» card names how much of it already left the leader.
  const openHint = kpi?.uplifted > 0
    ? T.kOpenUp.replace("{n}", kpi.uplifted.toLocaleString("ru-RU"))
    : T.kOpenHint;

  return (
    <Layout title={T.title}>
      {/* header: title + export */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{T.title}</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.sub}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {exportBtn}
        </div>
      </div>

      {/* load failure — before anything else, with a way out */}
      {loadError && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4"
          style={{ background: hexA(C_OPEN, 0.1), color: C_OPEN, border: `1px solid ${hexA(C_OPEN, 0.33)}` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span className="min-w-0">{T.loadFailed}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => metaQ.refetch()}>{T.retry}</Button>
          </div>
        </div>
      )}

      {isBoot ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-9 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl px-4 py-3.5" style={cardStyle}>
                <SkeletonBlock className="h-7 w-7 mb-3" /><SkeletonBlock className="h-5 w-12 mb-2" /><SkeletonBlock className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-28 mb-4" /><SkeletonChart className="h-64" /></div>
        </div>
      ) : noneYet ? (
        /* nothing filed in this viewer's scope yet — say where it comes from */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={Megaphone} height="h-56" showUploadLink={false}
            title={T.emptyTitle} message={T.emptyNote}
            action={may("cell-concerns") ? (
              <Button size="sm" variant="secondary" icon={<ArrowUpRight size={13} />}
                onClick={() => navigate("/cell-concerns")}>
                {T.emptyGo}
              </Button>
            ) : null} />
        </div>
      ) : meta ? (
        <>
          {/* view tabs — switching WHAT you look at, so tabs semantics */}
          <div className="flex items-center gap-2 mb-3">
            <SegmentedToggle asTabs ariaLabel={T.title} value={view} onChange={setView}
              options={[["obzor", T.vObzor], ["leaders", T.vLeaders], ["register", T.vRegister]]} />
          </div>

          {/* ONE filter row for every view: period inline, scopes in the panel,
              text search inline (leaders: name filter · register: full-text) */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              max={today} compactLabel triggerClassName="px-3 py-2 text-sm" />
            <FilterPanel sections={sections} onClearAll={clearAll} />
            <div className="flex-1" />
            {view !== "obzor" && (
              <SearchInput value={q} onChange={setQ}
                placeholder={view === "leaders" ? T.searchLeader : T.searchReg}
                className="w-full sm:w-72" />
            )}
          </div>

          {/* ══ OBZOR ══ */}
          {view === "obzor" && (bodyLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-2xl px-4 py-3.5" style={cardStyle}>
                    <SkeletonBlock className="h-7 w-7 mb-3" /><SkeletonBlock className="h-5 w-12 mb-2" /><SkeletonBlock className="h-3 w-16" />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-28 mb-4" /><SkeletonChart className="h-64" /></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-64" /></div>
                <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-64" /></div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* KPI strip — scoped to the current filters, each card names itself */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Kpi icon={ClipboardList} color={BRAND} label={T.kTotal}
                  value={(kpi?.total ?? 0).toLocaleString("ru-RU")} />
                <Kpi icon={ShieldCheck} color={C_DONE} label={T.kResolved}
                  value={(kpi?.done ?? 0).toLocaleString("ru-RU")}
                  hint={kpi?.pct != null ? `${kpi.pct}%` : undefined} />
                <Kpi icon={Loader} color={C_DOING} label={T.kDoing}
                  value={(kpi?.doing ?? 0).toLocaleString("ru-RU")} />
                <Kpi icon={AlertTriangle} color={C_OPEN} label={T.kOpen}
                  value={(kpi?.open ?? 0).toLocaleString("ru-RU")} hint={openHint} />
                <Kpi icon={Users2} color={C_WORKERS} label={T.kWorkers}
                  value={(kpi?.workers ?? 0).toLocaleString("ru-RU")} hint={T.kWorkersHint} />
              </div>

              <ChartCard icon={<TrendingUp size={13} />} title={T.secDaily} subtitle={T.secDailySub}
                empty={dailySeries.length === 0} height={280}>
                <ReactApexChart options={dailyOpts} series={dailySeries} type="bar" height={280} />
              </ChartCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard icon={<UserCog size={13} />} title={T.secBrig} subtitle={T.secBrigSub}
                  empty={brig.length === 0} height={brigH}>
                  <ReactApexChart options={brigOpts} series={brigSeries} type="bar" height={brigH} />
                </ChartCard>
                <ChartCard icon={<Boxes size={13} />} title={T.secCells} subtitle={T.secCellsSub}
                  empty={topCells.length === 0} height={cellsH}>
                  <ReactApexChart className="apx-bare-tip"
                    options={cellOpts} series={[{ name: T.colOpen, data: topCells.map((c) => c.open) }]}
                    type="bar" height={cellsH} />
                </ChartCard>
              </div>
            </div>
          ))}

          {/* ══ LIDERLAR KPI ══ */}
          {view === "leaders" && (
            <div className="space-y-3">
              {/* the grading scale, spelled out — plus the admin's knob to move it */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  ["green", `≥ ${bands.green}%`, bandCounts.green],
                  ["yellow", `${bands.yellow}–${bands.green - 1}%`, bandCounts.yellow],
                  ["red", `< ${bands.yellow}%`, bandCounts.red],
                  ["low", `${T.kamBand} (n<${minRanked})`, bandCounts.low],
                ].map(([band, label, n]) => (
                  <span key={band} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium"
                    style={{ background: hexA(BAND_COLORS[band], 0.1), color: BAND_COLORS[band], border: `1px solid ${hexA(BAND_COLORS[band], 0.28)}` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: BAND_COLORS[band] }} />
                    {label}
                    <span className="font-bold tabular-nums">{n}</span>
                  </span>
                ))}
                <div className="flex-1" />
                {meta?.is_admin && (
                  <Button size="sm" variant="ghost" icon={<Settings2 size={13} />}
                    onClick={() => setBandsOpen(true)}>
                    <span className="hidden sm:inline">{T.bandsEdit}</span>
                  </Button>
                )}
              </div>

              {leadersQ.isLoading ? (
                <div className="rounded-2xl p-4" style={cardStyle}>
                  <SkeletonBlock className="h-3 w-28 mb-4" />
                  {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full mb-2" />)}
                </div>
              ) : (
                <TableCard icon={UserRound} title={T.secLeaders} subtitle={T.secLeadersSub}
                  right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{ldRows.length} {T.leadersWord}</span>}
                  minWidth={700}>
                  <thead>
                    <tr>
                      <Th label={T.colLeader} k="leader" sort={ldSort} onSort={onLdSort} />
                      <Th label={T.colBrig} cls="hidden md:table-cell" />
                      <Th label={T.colCells} align="center" />
                      <Th label={T.colTotal} k="total" sort={ldSort} onSort={onLdSort} align="right" />
                      <Th label={T.colDone} k="done" sort={ldSort} onSort={onLdSort} align="right" />
                      <Th label={T.colDoing} align="right" cls="hidden sm:table-cell" />
                      <Th label={T.colOpen} k="open" sort={ldSort} onSort={onLdSort} align="right" />
                      <Th label={T.colPct} k="pct" sort={ldSort} onSort={onLdSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {ldRows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
                    ) : ldRows.map((r) => (
                      <tr key={r.leader_id ?? r.leader}>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(r.leader)}</td>
                        <td className="px-3 py-2 hidden md:table-cell" style={{ color: "var(--text-3)" }}>
                          {r.brigadirs.map((b) => tl(shortName(b))).join(", ")}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] tabular-nums"
                            style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                            title={r.cells.join(", ")}>
                            {r.cells.length}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: C_DONE }}>{r.done}</td>
                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: r.doing ? C_DOING : "var(--text-4)" }}>{r.doing}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.open ? C_OPEN : "var(--text-4)" }}
                          title={r.uplifted ? `${stL("uplifted")}: ${r.uplifted}` : undefined}>{r.open}</td>
                        <td className="px-3 py-2"><PctCell r={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              )}

              {leadersQ.data?.unassigned && (
                <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                  <AlertTriangle size={12} style={{ color: C_DOING }} />
                  {leadersQ.data.unassigned.total.toLocaleString("ru-RU")} {T.unassigned}
                </p>
              )}
            </div>
          )}

          {/* ══ REYESTR ══ */}
          {view === "register" && (
            <div className="space-y-3">
              {listQ.isLoading ? (
                <div className="rounded-2xl p-4" style={cardStyle}>
                  <SkeletonBlock className="h-3 w-28 mb-4" />
                  {Array.from({ length: 10 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full mb-2" />)}
                </div>
              ) : (
                <>
                  <TableCard icon={ClipboardList} title={T.secRegister}
                    right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                      {(list?.total ?? 0).toLocaleString("ru-RU")} {T.rows}
                    </span>}
                    minWidth={800} wrap>
                    <thead>
                      <tr>
                        <Th label={T.colNo} align="right" />
                        <Th label={T.colDate} k="date" sort={{ key: "date", dir: regSort === "date_asc" ? "asc" : "desc" }}
                          onSort={() => setRegSort((s) => (s === "date_desc" ? "date_asc" : "date_desc"))} />
                        <Th label={T.colCell} />
                        <Th label={T.colLeader} />
                        <Th label={T.colOwner} />
                        <Th label={T.colText} />
                        <Th label={T.colStatus} />
                      </tr>
                    </thead>
                    <tbody>
                      {(list?.rows || []).length === 0 ? (
                        <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
                      ) : list.rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>{r.no}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                            {fmtDate(r.d)}
                          </td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={r.leader ? `${r.cell} · ${tl(r.leader)}` : r.cell}>{r.cell || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                            {r.leader ? tl(shortName(r.leader)) : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{tl(shortName(r.owner || "")) || "—"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--text-2)", minWidth: 260 }}>
                            <span className="line-clamp-2">{r.text}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap"><StChip st={r.st} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                  <Pagination page={page} pageCount={pageCount} total={list?.total || 0} pageSize={50} onPage={setPage} />
                </>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* row detail — the full text one row at a time; the chain, the thread
          and every action live on /concerns, one tap away */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${T.mTitle} №${detail.no}`}
          subtitle={detail.leader ? `${detail.cell || "—"} · ${tl(detail.leader)}` : (detail.cell || "—")}
          icon={<Megaphone size={16} />}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetail(null)}>{T.close}</Button>
              {may("concerns") && (
                <Button icon={<ArrowUpRight size={14} />}
                  onClick={() => navigate(`/concerns?open=${detail.id}`)}>
                  {T.mOpen}
                </Button>
              )}
            </>
          }>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>{detail.text}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colDate}</div>
              <div style={{ color: "var(--text-2)" }}>{fmtDate(detail.d)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colStatus}</div>
              <StChip st={detail.st} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colOwner}</div>
              <div style={{ color: "var(--text-2)" }}>{tl(detail.owner || "") || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colLeader}</div>
              <div style={{ color: "var(--text-2)" }}>{detail.leader ? tl(detail.leader) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mBrig}</div>
              <div style={{ color: "var(--text-2)" }}>{tl(shortName(detail.brigadir || "")) || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mCategory}</div>
              <div style={{ color: "var(--text-2)" }}>{detail.category ? t(`concerns.category.${detail.category}`) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mStep}</div>
              <div style={{ color: "var(--text-2)" }}>{t(`concerns.level.${detail.level}`)}</div>
            </div>
            {detail.done_on && (
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mDoneOn}</div>
                <div style={{ color: "var(--text-2)" }}>{fmtDate(detail.done_on)}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* export scope — asked only when filters make «what you see» ≠ «the
          period»; without filters the button exports the whole range directly */}
      {exportOpen && (
        <Modal open onClose={() => { if (!exporting) setExportOpen(false); }}
          title={T.xTitle} icon={<FileSpreadsheet size={16} />} maxWidth="max-w-md"
          footer={
            <>
              <Button variant="secondary" disabled={exporting} onClick={() => setExportOpen(false)}>{T.cancel}</Button>
              <Button loading={exporting} icon={!exporting ? <FileSpreadsheet size={14} /> : null}
                onClick={() => runExport(exportScope)}>
                {T.xExport}
              </Button>
            </>
          }>
          <p className="text-sm mb-3" style={{ color: "var(--text-2)" }}>{T.xModalQ}</p>
          <div role="radiogroup" aria-label={T.xTitle} className="space-y-2">
            {[
              {
                v: "filtered", label: T.xOptFiltered, desc: T.xOptFilteredD,
                chips: [
                  ...(regCount != null ? [`${regCount.toLocaleString("ru-RU")} ${T.concernsWord}`] : []),
                  ...activeFilterChips,
                ],
              },
              { v: "all", label: T.xOptAll, desc: T.xOptAllD, chips: [] },
            ].map((o) => {
              const sel = exportScope === o.v;
              return (
                <button key={o.v} type="button" role="radio" aria-checked={sel}
                  onClick={() => setExportScope(o.v)}
                  className="w-full text-left rounded-xl px-3.5 py-3 transition-colors"
                  style={{
                    background: sel ? "var(--brand-bg)" : "var(--bg-inner)",
                    border: `1px solid ${sel ? "var(--brand)" : "var(--border)"}`,
                  }}>
                  <span className="flex items-start gap-2.5">
                    <span className="grid place-items-center w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
                      style={{ border: `2px solid ${sel ? "var(--brand)" : "var(--border-md)"}` }}>
                      {sel && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-1)" }}>{o.label}</span>
                      <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{o.desc}</span>
                      {o.chips.length > 0 && (
                        <span className="flex flex-wrap gap-1 mt-2">
                          {o.chips.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-lg text-[10px] whitespace-nowrap"
                              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                              {c}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* thresholds — admin-only policy knob, validated before it can save */}
      {bandsOpen && (
        <Modal open onClose={() => setBandsOpen(false)} title={T.bandsTitle}
          icon={<Settings2 size={16} />} maxWidth="max-w-sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBandsOpen(false)}>{T.cancel}</Button>
              <Button loading={bandsMut.isPending} disabled={!bandsValid}
                onClick={() => bandsMut.mutate({ green: Number(gEdit), yellow: Number(yEdit) })}>
                {T.save}
              </Button>
            </>
          }>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={T.bandGreenL} required>
              <input type="number" min={2} max={100} value={gEdit}
                onChange={(e) => setGEdit(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                style={{ background: "var(--bg-inner)", border: `1px solid ${bandsValid ? "var(--border-md)" : hexA(C_OPEN, 0.5)}`, color: "var(--text-1)" }} />
            </FormField>
            <FormField label={T.bandYellowL} required hint={T.bandsHint}>
              <input type="number" min={1} max={99} value={yEdit}
                onChange={(e) => setYEdit(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
                style={{ background: "var(--bg-inner)", border: `1px solid ${bandsValid ? "var(--border-md)" : hexA(C_OPEN, 0.5)}`, color: "var(--text-1)" }} />
            </FormField>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
