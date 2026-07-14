import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  RefreshCw, CalendarClock, AlertTriangle, MessageSquareWarning, ShieldCheck,
  Undo2, Siren, Factory, UserRound, Store, CircleDot, Tag, Layers, Boxes,
  MapPin, Wrench, UserCog, TrendingUp, TrendingDown, ClipboardList, Bug,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SearchInput from "../components/ui/SearchInput";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
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
    noMatch: "Filtrlarga mos yozuv yo‘q",
    kTotal: "Jami nomuvofiqlik", kGuest: "Mehmon shikoyatlari", kResolved: "Bartaraf etilgan",
    kOpen: "Ochiq", kReturn: "Qaytarishlar", kCritical: "Kritik",
    kResolvedHint: "chora talab etilganlardan", kCriticalHint: "zaharlanish · mog‘or · mehmondagi yot jism",
    kOpenHint: "ochiq · kutilmoqda · takrorlanuvchi",
    secTrend: "Nomuvofiqliklar dinamikasi", trendSub: "manba kesimida",
    byMonth: "Oy", byWeek: "Hafta",
    secTypes: "Nomuvofiqlik turlari", secForeign: "Yot jismlar", foreignSub: "toifalar bo‘yicha",
    secTop: "Shikoyat markazlari", topProducts: "Mahsulotlar", topPlaces: "Savdo nuqtalari",
    topSub: "mehmon shikoyatlari bo‘yicha eng ko‘pi",
    secCells: "Aybdor yacheykalar", cellsSub: "ishlab chiqarish nomuvofiqliklari",
    secAcc: "Mas’uliyat va bartaraf etish", accBrig: "Brigadirlar", accMgr: "Rahbarlar",
    accSub: "chora talab etilgan yozuvlar; % — bartaraf etilgan ulushi",
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
    loadFailed: "Ma’lumotni yuklab bo‘lmadi", retry: "Qayta urinish",
  },
  uz_cyrl: {
    title: "Сифат ва шикоятлар", sub: "Номувофиқликлар реестри таҳлили",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", lastSynced: "Охирги синхрон", never: "ҳеч қачон",
    emptyTitle: "Маълумот йўқ", emptyNote: "Реестрни Google Sheets’дан тортиб олиш учун «Янгилаш» тугмасини босинг.",
    noMatch: "Филтрларга мос ёзув йўқ",
    kTotal: "Жами номувофиқлик", kGuest: "Меҳмон шикоятлари", kResolved: "Бартараф этилган",
    kOpen: "Очиқ", kReturn: "Қайтаришлар", kCritical: "Критик",
    kResolvedHint: "чора талаб этилганлардан", kCriticalHint: "заҳарланиш · моғор · меҳмондаги ёт жисм",
    kOpenHint: "очиқ · кутилмоқда · такрорланувчи",
    secTrend: "Номувофиқликлар динамикаси", trendSub: "манба кесимида",
    byMonth: "Ой", byWeek: "Ҳафта",
    secTypes: "Номувофиқлик турлари", secForeign: "Ёт жисмлар", foreignSub: "тоифалар бўйича",
    secTop: "Шикоят марказлари", topProducts: "Маҳсулотлар", topPlaces: "Савдо нуқталари",
    topSub: "меҳмон шикоятлари бўйича энг кўпи",
    secCells: "Айбдор ячейкалар", cellsSub: "ишлаб чиқариш номувофиқликлари",
    secAcc: "Масъулият ва бартараф этиш", accBrig: "Бригадирлар", accMgr: "Раҳбарлар",
    accSub: "чора талаб этилган ёзувлар; % — бартараф этилган улуши",
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
    loadFailed: "Маълумотни юклаб бўлмади", retry: "Қайта уриниш",
  },
  ru: {
    title: "Качество и жалобы", sub: "Аналитика реестра несоответствий",
    refresh: "Обновить", refreshing: "Обновление…", lastSynced: "Последняя синхронизация", never: "никогда",
    emptyTitle: "Данных пока нет", emptyNote: "Нажмите «Обновить», чтобы загрузить реестр из Google Sheets.",
    noMatch: "Нет записей по фильтрам",
    kTotal: "Всего несоответствий", kGuest: "Жалобы гостей", kResolved: "Устранено",
    kOpen: "Открытые", kReturn: "Возвраты", kCritical: "Критичные",
    kResolvedHint: "от требующих меры", kCriticalHint: "отравление · плесень · инородный предмет у гостя",
    kOpenHint: "не устранено · в ожидании · повторяющиеся",
    secTrend: "Динамика несоответствий", trendSub: "в разрезе источника",
    byMonth: "Месяц", byWeek: "Неделя",
    secTypes: "Типы несоответствий", secForeign: "Инородные предметы", foreignSub: "по категориям",
    secTop: "Очаги жалоб", topProducts: "Изделия", topPlaces: "Точки продаж",
    topSub: "лидеры по жалобам гостей",
    secCells: "Виновные ячейки", cellsSub: "несоответствия производства",
    secAcc: "Ответственность и устранение", accBrig: "Бригадиры", accMgr: "Руководители",
    accSub: "записи, требующие меры; % — доля устранённых",
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
    loadFailed: "Не удалось загрузить данные", retry: "Повторить",
  },
  en: {
    title: "Quality & complaints", sub: "Non-conformance register analytics",
    refresh: "Refresh", refreshing: "Refreshing…", lastSynced: "Last synced", never: "never",
    emptyTitle: "No data yet", emptyNote: "Hit “Refresh” to pull the register from Google Sheets.",
    noMatch: "No records match the filters",
    kTotal: "Total findings", kGuest: "Guest complaints", kResolved: "Resolved",
    kOpen: "Open", kReturn: "Returns", kCritical: "Critical",
    kResolvedHint: "of those needing action", kCriticalHint: "poisoning · mold · foreign object at guest",
    kOpenHint: "open · waiting · recurring",
    secTrend: "Findings over time", trendSub: "by source",
    byMonth: "Month", byWeek: "Week",
    secTypes: "Finding types", secForeign: "Foreign objects", foreignSub: "by category",
    secTop: "Complaint hotspots", topProducts: "Products", topPlaces: "Stores",
    topSub: "most complained about by guests",
    secCells: "Cells at fault", cellsSub: "production non-conformances",
    secAcc: "Accountability & resolution", accBrig: "Brigadirs", accMgr: "Managers",
    accSub: "records needing action; % = share resolved",
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
    loadFailed: "Could not load the register", retry: "Retry",
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

  const [search, setSearch] = useState("");
  const [srcSel, setSrcSel] = useState([]);
  const [typeSel, setTypeSel] = useState([]);
  const [catSel, setCatSel] = useState([]);
  const [statusSel, setStatusSel] = useState([]);
  const [retSel, setRetSel] = useState([]);
  const [brigSel, setBrigSel] = useState([]);
  const [mgrSel, setMgrSel] = useState([]);

  const [gran, setGran] = useState("month");
  const [topMode, setTopMode] = useState("product");
  const [accMode, setAccMode] = useState("brig");
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
  const opts = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
    const byCount = (key) => {
      const c = {};
      for (const r of rows) if (r[key]) c[r[key]] = (c[r[key]] || 0) + 1;
      return Object.keys(c).sort((a, b) => c[b] - c[a]);
    };
    return {
      src: uniq("s"), type: byCount("t"), cat: byCount("c"), status: uniq("st"),
      brig: byCount("b"), mgr: byCount("m"),
    };
  }, [rows]);

  const matchesFilters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (r) => {
      if (srcSel.length && !srcSel.includes(r.s)) return false;
      if (typeSel.length && !typeSel.includes(r.t)) return false;
      if (catSel.length && !catSel.includes(r.c)) return false;
      if (statusSel.length && !statusSel.includes(r.st)) return false;
      if (retSel.length && !retSel.includes(r.r ? "yes" : "no")) return false;
      if (brigSel.length && !brigSel.includes(r.b)) return false;
      if (mgrSel.length && !mgrSel.includes(r.m)) return false;
      if (q) {
        const hay = `${r.pl || ""} ${tl(r.pl || "")} ${r.pr || ""} ${tl(r.pr || "")} ${r.b || ""} ${tl(r.b || "")} ${r.cn || ""} ${r.fc || ""} ${r.no || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
  }, [search, srcSel, typeSel, catSel, statusSel, retSel, brigSel, mgrSel, tl]);

  const filtered = useMemo(
    () => rows.filter((r) => r.d >= dateFrom && r.d <= dateTo && matchesFilters(r)),
    [rows, dateFrom, dateTo, matchesFilters]
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
      prev: rows.filter((r) => r.d >= pFrom && r.d <= pTo && matchesFilters(r)),
      prevComparable: !!earliest && pFrom >= earliest,
    };
  }, [rows, dateFrom, dateTo, matchesFilters]);

  useEffect(() => { setPage(1); }, [dateFrom, dateTo, search, srcSel, typeSel, catSel, statusSel, retSel, brigSel, mgrSel]);

  // ── analytics ─────────────────────────────────────────────────────────────
  const isCritical = (r) =>
    r.t === "poisoning" || r.t === "mold" || (r.t === "foreign" && r.s === "guest");

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
      guestPct: cur.total ? Math.round((cur.guest / cur.total) * 100) : 0,
      returnPct: cur.total ? Math.round((cur.returns / cur.total) * 100) : 0,
    };
  }, [filtered, prev]);

  const A = useMemo(() => {
    // Trend — one bucket per month or per ISO week, stacked by source.
    const buckets = {};
    for (const r of filtered) {
      const key = gran === "month" ? r.d.slice(0, 7) : weekStart(r.d);
      const b = buckets[key] || (buckets[key] = { key, production: 0, guest: 0, store: 0 });
      if (b[r.s] != null) b[r.s]++;
    }
    const trend = Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));

    const count = (arr, key) => {
      const c = {};
      for (const r of arr) { const k = r[key]; if (k) c[k] = (c[k] || 0) + 1; }
      return Object.entries(c).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
    };

    const types = count(filtered, "t");
    const cats = count(filtered.filter((r) => r.c), "c");

    const guest = filtered.filter((r) => r.s === "guest");
    const topProducts = count(guest, "pr").slice(0, 10);
    const topPlaces = count(guest, "pl").slice(0, 10);

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

    // Accountability — resolution split per responsible person.
    const accOf = (key) => {
      const map = {};
      for (const r of filtered) {
        if (!r[key] || !ACTIONABLE.includes(r.st)) continue;
        const m = map[r[key]] || (map[r[key]] = { name: r[key], done: 0, open: 0, waiting: 0, repeat: 0, total: 0 });
        m[r.st]++; m.total++;
      }
      return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 12);
    };
    const acc = accOf(accMode === "brig" ? "b" : "m");

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

    return { trend, types, cats, topProducts, topPlaces, topCells, acc, season, monthTotals };
  }, [filtered, gran, accMode]);

  // ── table ─────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const val = (r) => {
      switch (sort.key) {
        case "date":    return r.d || "";
        case "src":     return L("src", r.s);
        case "place":   return tl(r.pl || "");
        case "product": return tl(r.pr || "");
        case "type":    return L("type", r.t);
        case "cat":     return L("cat", r.c);
        case "cell":    return r.cn || r.fc || "";
        case "brig":    return tl(r.b || "");
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

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ["quality-row", openId],
    queryFn: () => api.get(`/api/quality/${openId}`).then((r) => r.data),
    enabled: openId != null,
  });

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
    optFilter({ label: T.fSrc, opts: opts.src, render: (k) => L("src", k), dot: (k) => SRC_COLORS[k] || C_NA }, srcSel, setSrcSel, "src", Layers),
    optFilter({ label: T.fType, opts: opts.type, render: (k) => L("type", k), dot: (k) => TYPE_COLORS[k] || C_NA }, typeSel, setTypeSel, "type", Tag),
    optFilter({ label: T.fCat, opts: opts.cat, render: (k) => L("cat", k), dot: (k) => CAT_COLORS[k] || C_NA }, catSel, setCatSel, "cat", Bug),
    optFilter({ label: T.fStatus, opts: opts.status, render: (k) => L("st", k), dot: (k) => STATUS_COLORS[k] || C_NA }, statusSel, setStatusSel, "status", CircleDot),
    optFilter({ label: T.fRet, opts: ["yes", "no"], render: (k) => (k === "yes" ? T.yes : T.no) }, retSel, setRetSel, "ret", Undo2),
    optFilter({ label: T.fBrig, opts: opts.brig, render: (k) => tl(k) }, brigSel, setBrigSel, "brig", Wrench),
    optFilter({ label: T.fMgr, opts: opts.mgr, render: (k) => tl(k) }, mgrSel, setMgrSel, "mgr", UserCog),
  ];
  const filterActiveCount = [srcSel, typeSel, catSel, statusSel, retSel, brigSel, mgrSel].filter((s) => s.length).length;
  const clearAllFilters = () => {
    setSrcSel([]); setTypeSel([]); setCatSel([]); setStatusSel([]); setRetSel([]); setBrigSel([]); setMgrSel([]);
  };

  // ── charts ────────────────────────────────────────────────────────────────
  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
  const baseChart = { fontFamily: "inherit", toolbar: { show: false }, background: "transparent", animations: { enabled: false } };

  // Stacked area — solid fills with a 2px card-coloured seam between bands
  // (translucent fills multiply into mud where they overlap).
  const trendOrder = ["production", "guest", "store"]
    .map((k) => ({ k, n: A.trend.reduce((s, b) => s + b[k], 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const trendLabels = A.trend.map((b) =>
    gran === "month"
      ? `${MONTHS[parseInt(b.key.slice(5, 7), 10) - 1]} ${b.key.slice(2, 4)}`
      : fmtDate(b.key).slice(0, 5)
  );
  const areaOpts = {
    chart: { ...baseChart, type: "area", stacked: true, theme: chartTheme },
    theme: chartTheme,
    colors: trendOrder.map((x) => SRC_COLORS[x.k]),
    fill: { type: "solid", opacity: 1 },
    stroke: { curve: "smooth", width: 2, colors: [cardBg, cardBg, cardBg] },
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
    name: L("src", x.k),
    data: A.trend.map((b) => b[x.k]),
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

  const topData = topMode === "product" ? A.topProducts : A.topPlaces;
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

  // The resolution rate rides in the axis label — the number this chart exists
  // for. Full names ("SULTONOV ABROR ALISHEROVICH") blow past the axis width and
  // truncate the % away, so they collapse to surname + initials.
  const shortName = (n) => {
    const parts = tl(n).trim().split(/\s+/);
    return parts.length < 2 ? parts[0] : `${parts[0]} ${parts.slice(1).map((p) => p[0] + ".").join("")}`;
  };
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

  const heatSeries = A.season.map((s) => ({
    name: L("type", s.k),
    data: s.data.map((v, m) => ({ x: MONTHS[m], y: A.monthTotals[m] ? v : 0 })),
  })).reverse();
  const heatOpts = {
    chart: { ...baseChart, type: "heatmap" },
    theme: chartTheme,
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: [cardBg] },
    plotOptions: {
      heatmap: {
        radius: 4, enableShades: false,
        // A brand-gold sequential ramp: empty cells fade into the grid, the
        // hot ones darken. No shades/filters — an SVG filter on a many-celled
        // heatmap is what froze a laptop last time.
        colorScale: {
          ranges: [
            { from: 0, to: 0.0001, color: gridColor },
            { from: 0.0001, to: 5, color: "#efdfc2" },
            { from: 5, to: 15, color: "#dcb977" },
            { from: 15, to: 30, color: "#C8973F" },
            { from: 30, to: 100, color: "#8c6522" },
          ],
        },
      },
    },
    xaxis: {
      type: "category",
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 150 } },
    grid: { padding: { right: 8 } },
    legend: { show: false },
    tooltip: { theme: chartTheme.mode, y: { formatter: (v) => `${v}%` } },
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
        <SearchInput value={search} onChange={setSearch} placeholder={T.searchPh} className="w-full sm:w-72 sm:ml-auto" />
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
            <Kpi icon={MessageSquareWarning} color={SRC_COLORS.guest} label={T.kGuest}
              value={kpi.guest.toLocaleString("ru-RU")} hint={`${kpi.guestPct}% ${T.kTotal.toLowerCase()}`}
              delta={<Delta v={kpi.dGuest} />} />
            <Kpi icon={ShieldCheck} color={C_DONE} label={T.kResolved}
              value={`${kpi.resolved}%`} hint={T.kResolvedHint}
              delta={<Delta v={kpi.dResolved} invert={false} suffix=" п.п." />} />
            <Kpi icon={AlertTriangle} color={C_OPEN} label={T.kOpen}
              value={kpi.open.toLocaleString("ru-RU")} hint={T.kOpenHint} delta={<Delta v={kpi.dOpen} />} />
            <Kpi icon={Undo2} color={C_WAIT} label={T.kReturn}
              value={kpi.returns.toLocaleString("ru-RU")} hint={`${kpi.returnPct}% ${T.kTotal.toLowerCase()}`}
              delta={<Delta v={kpi.dReturns} />} />
            <Kpi icon={Siren} color="#dc2626" label={T.kCritical}
              value={kpi.critical.toLocaleString("ru-RU")} hint={T.kCriticalHint} delta={<Delta v={kpi.dCritical} />} />
          </div>

          {/* ── trend + type mix ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ChartCard icon={<TrendingUp size={13} />} title={T.secTrend} subtitle={T.trendSub}
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
            <ChartCard icon={topMode === "product" ? <Boxes size={13} /> : <MapPin size={13} />}
              title={T.secTop} subtitle={T.topSub} empty={topData.length === 0} height={320}
              right={<SegmentedToggle size="sm" value={topMode} onChange={setTopMode}
                options={[["product", T.topProducts], ["place", T.topPlaces]]} />}>
              <ReactApexChart
                options={barOpts(topData.map((x) => tl(x.k)), SRC_COLORS.guest)}
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
                options={barOpts(A.topCells.map((x) => tl(x.k)), SRC_COLORS.production)}
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

          {/* ── seasonality ── */}
          <ChartCard icon={<CalendarClock size={13} />} title={T.secSeason} subtitle={T.seasonSub}
            empty={A.season.length === 0} height={280}>
            <ReactApexChart options={heatOpts} series={heatSeries} type="heatmap" height={280} />
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
                  <Th label={T.colSrc} k="src" sort={sort} onSort={onSort} />
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
                    <td colSpan={10} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td>
                  </tr>
                ) : pageRows.map((r) => {
                  const SrcIcon = SRC_ICONS[r.s] || CircleDot;
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDate(r.d)}</td>
                      <td className="px-3 py-2">
                        <Chip color={SRC_COLORS[r.s] || C_NA} icon={SrcIcon}>{L("src", r.s)}</Chip>
                      </td>
                      <td className="px-3 py-2 max-w-[190px] truncate" title={tl(r.pl || "")} style={{ color: "var(--text-2)" }}>{tl(r.pl || "") || "—"}</td>
                      <td className="px-3 py-2 max-w-[190px] truncate" title={tl(r.pr || "")} style={{ color: "var(--text-2)" }}>{tl(r.pr || "") || "—"}</td>
                      <td className="px-3 py-2"><Chip color={TYPE_COLORS[r.t] || C_NA}>{L("type", r.t)}</Chip></td>
                      <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                        {r.c ? <Chip color={CAT_COLORS[r.c] || C_NA}>{L("cat", r.c)}</Chip> : "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[170px] truncate" title={tl(r.cn || r.fc || "")} style={{ color: "var(--text-3)" }}>
                        {tl(r.cn || r.fc || "") || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[190px] truncate" title={tl(r.b || "")} style={{ color: "var(--text-2)" }}>{tl(r.b || "") || "—"}</td>
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

      {/* ── row detail ── */}
      {openId != null && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          title={T.detail}
          subtitle={detail ? `${fmtDate(detail.date)}${detail.ref_no ? ` · № ${detail.ref_no}` : ""}` : ""}
          icon={<ClipboardList size={16} />}
          maxWidth="max-w-2xl"
          footer={<Button variant="secondary" onClick={() => setOpenId(null)}>{T.close}</Button>}
        >
          {detailLoading || !detail ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-40" /><SkeletonBlock className="h-16 w-full" /><SkeletonBlock className="h-12 w-full" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Chip color={SRC_COLORS[detail.source] || C_NA} icon={SRC_ICONS[detail.source] || CircleDot}>{L("src", detail.source)}</Chip>
                <Chip color={TYPE_COLORS[detail.ctype] || C_NA}>{L("type", detail.ctype)}</Chip>
                {detail.category && <Chip color={CAT_COLORS[detail.category] || C_NA}>{L("cat", detail.category)}</Chip>}
                <Chip color={STATUS_COLORS[detail.status] || C_NA}>{L("st", detail.status)}</Chip>
                {detail.returned && <Chip color={C_WAIT} icon={Undo2}>{T.mReturn}</Chip>}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  [T.colPlace, tl(detail.place || "")],
                  [T.colProduct, tl(detail.product || "")],
                  [T.mCell, [detail.fault_code, tl(detail.cell_name || "")].filter(Boolean).join(" · ")],
                  [T.mFault, detail.fault == null ? "—" : detail.fault ? T.yes : T.no],
                  [T.colBrig, tl(detail.brigadir || "")],
                  [T.colMgr, tl(detail.manager || "")],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)" }}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>{k}</div>
                    <div style={{ color: "var(--text-1)" }}>{v || "—"}</div>
                  </div>
                ))}
              </div>

              {[[T.mDesc, detail.description], [T.mAction, detail.action], [T.mComment, detail.comment]]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{k}</div>
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>{tl(v)}</p>
                  </div>
                ))}
            </>
          )}
        </Modal>
      )}
    </Layout>
  );
}
