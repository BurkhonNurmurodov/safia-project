import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Wrench, CircleUserRound, LayoutGrid, Timer, MessageSquareText, Barcode,
  Plus, Pencil, Trash2, Repeat2, RefreshCw, Gauge, ClipboardList,
  TrendingUp, TrendingDown, LineChart, BarChart3, Scale, CalendarDays,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import StyledSelect from "../components/ui/StyledSelect";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DayStepper from "../components/ui/DayStepper";
import DateRangePicker from "../components/ui/DateRangePicker";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import KPICard from "../components/ui/KPICard";
import TrendChart from "../components/charts/TrendChart";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock } from "../components/ui/Skeleton";
import CellLink from "../components/ui/CellLink";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { cellName } from "../utils/cellName";
import { padChartFrom, listChartDays } from "../utils/chartRange";

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
const TXT = {
  uz: {
    title: "Perenaladka vaqtlari",
    subtitle: "Har bir yacheyka bo'yicha o'rtacha perenaladka vaqti, sababi va SKU",
    subFact: "Kunlik haqiqiy perenaladka vaqti — yacheykalar bo'yicha",
    subAnalysis: "Standart va fakt: farq, trend va yacheykalar taqqoslami",
    tabStandard: "Standart", tabFact: "Fakt", tabAnalysis: "Tahlil",
    secTable: "Yacheykalar ro'yxati",
    colSupervisor: "Supervayzer", colCell: "Yacheyka", colMinutes: "Vaqt (min)", colReason: "Sabab", colSku: "SKU",
    searchPh: "Supervayzer, yacheyka yoki SKU…", allSups: "Barcha supervayzerlar",
    noMatch: "Mos qator topilmadi", empty: "Hozircha ma'lumot yo'q",
    add: "Qo'shish", edit: "Tahrirlash", del: "O'chirish", save: "Saqlash", cancel: "Bekor qilish",
    addTitle: "Yangi qator", editTitle: "Qatorni tahrirlash",
    delTitle: "Qatorni o'chirish", delMsg: "{cell} yacheykasining qatori o'chiriladi. Davom etasizmi?",
    fSupervisor: "Supervayzer", fCustom: "Ism (ro'yxatda yo'q)", fCell: "Yacheyka", fMinutes: "Perenaladka vaqti (min)",
    fSku: "SKU raqami", fReason: "Sabab", customOpt: "Boshqa ism…", minSuffix: "min",
    fCellCustom: "Yacheyka (ro'yxatda yo'q)", customCellOpt: "Boshqa yacheyka…",
    saveFail: "Saqlab bo'lmadi. Qayta urining.",
    // Fakt tab
    secFact: "Kunlik fakt", searchPhFact: "Supervayzer yoki yacheyka…",
    colStandard: "Standart (min)", colFact: "Fakt (min)", colNote: "Izoh",
    leader: "Lider",
    shiftAll: "Hammasi", shift1: "1-smena", shift2: "2-smena",
    factEditTitle: "Faktni kiritish",
    fFactMinutes: "Fakt vaqti (min)", fFactNote: "Izoh (ixtiyoriy)",
    factDelTitle: "Fakt yozuvini o'chirish",
    factDelMsg: "{cell} yacheykasining {date} sanasidagi fakt yozuvi o'chiriladi. Davom etasizmi?",
    refresh: "Yangilash",
    refreshHint: "«Смена отчёт» jadvalidan yacheykalar bo'yicha perenaladka tarixini yuklash",
    refreshDone: "Jadvaldan yuklandi", refreshFail: "Yangilab bo'lmadi",
    noCellsScope: "Sizning doirangizda yacheyka yo'q.",
    // Tahlil tab
    kEntries: "Fakt yozuvlari", kEntriesSub: "{n} yacheyka hisobot berdi",
    kStd: "O'rtacha standart", kFact: "O'rtacha fakt", kDelta: "O'rtacha farq",
    kMatchedSub: "standarti bor yacheykalar bo'yicha", vsStd: "standartga nisbatan",
    chTrend: "Fakt va standart — trend", chTrendSub: "Kunlik o'rtacha, hisobot bergan yacheykalar bo'yicha",
    chDev: "Eng katta farqlar", chDevSub: "Fakt o'rtachasi − standart, min",
    sFact: "Fakt", sStd: "Standart",
    secCompare: "Yacheykalar taqqoslami",
    colFactAvg: "Fakt o'rt.", colDays: "Kunlar", colMinMax: "Min–Max",
    colDelta: "Δ min", colDeltaPct: "Δ %",
    noFact: "Tanlangan davrda fakt ma'lumoti yo'q. «Fakt» tabida kiriting yoki jadvaldan yuklang.",
  },
  uz_cyrl: {
    title: "Переналадка вақтлари",
    subtitle: "Ҳар бир ячейка бўйича ўртача переналадка вақти, сабаби ва SKU",
    subFact: "Кунлик ҳақиқий переналадка вақти — ячейкалар бўйича",
    subAnalysis: "Стандарт ва факт: фарқ, тренд ва ячейкалар таққослами",
    tabStandard: "Стандарт", tabFact: "Факт", tabAnalysis: "Таҳлил",
    secTable: "Ячейкалар рўйхати",
    colSupervisor: "Супервайзер", colCell: "Ячейка", colMinutes: "Вақт (мин)", colReason: "Сабаб", colSku: "SKU",
    searchPh: "Супервайзер, ячейка ёки SKU…", allSups: "Барча супервайзерлар",
    noMatch: "Мос қатор топилмади", empty: "Ҳозирча маълумот йўқ",
    add: "Қўшиш", edit: "Таҳрирлаш", del: "Ўчириш", save: "Сақлаш", cancel: "Бекор қилиш",
    addTitle: "Янги қатор", editTitle: "Қаторни таҳрирлаш",
    delTitle: "Қаторни ўчириш", delMsg: "{cell} ячейкасининг қатори ўчирилади. Давом этасизми?",
    fSupervisor: "Супервайзер", fCustom: "Исм (рўйхатда йўқ)", fCell: "Ячейка", fMinutes: "Переналадка вақти (мин)",
    fSku: "SKU рақами", fReason: "Сабаб", customOpt: "Бошқа исм…", minSuffix: "мин",
    fCellCustom: "Ячейка (рўйхатда йўқ)", customCellOpt: "Бошқа ячейка…",
    saveFail: "Сақлаб бўлмади. Қайта уриниб кўринг.",
    secFact: "Кунлик факт", searchPhFact: "Супервайзер ёки ячейка…",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colNote: "Изоҳ",
    leader: "Лидер",
    shiftAll: "Ҳаммаси", shift1: "1-смена", shift2: "2-смена",
    factEditTitle: "Фактни киритиш",
    fFactMinutes: "Факт вақти (мин)", fFactNote: "Изоҳ (ихтиёрий)",
    factDelTitle: "Факт ёзувини ўчириш",
    factDelMsg: "{cell} ячейкасининг {date} санасидаги факт ёзуви ўчирилади. Давом этасизми?",
    refresh: "Янгилаш",
    refreshHint: "«Смена отчёт» жадвалидан ячейкалар бўйича переналадка тарихини юклаш",
    refreshDone: "Жадвалдан юкланди", refreshFail: "Янгилаб бўлмади",
    noCellsScope: "Сизнинг доирангизда ячейка йўқ.",
    kEntries: "Факт ёзувлари", kEntriesSub: "{n} ячейка ҳисобот берди",
    kStd: "Ўртача стандарт", kFact: "Ўртача факт", kDelta: "Ўртача фарқ",
    kMatchedSub: "стандарти бор ячейкалар бўйича", vsStd: "стандартга нисбатан",
    chTrend: "Факт ва стандарт — тренд", chTrendSub: "Кунлик ўртача, ҳисобот берган ячейкалар бўйича",
    chDev: "Энг катта фарқлар", chDevSub: "Факт ўртачаси − стандарт, мин",
    sFact: "Факт", sStd: "Стандарт",
    secCompare: "Ячейкалар таққослами",
    colFactAvg: "Факт ўрт.", colDays: "Кунлар", colMinMax: "Мин–Макс",
    colDelta: "Δ мин", colDeltaPct: "Δ %",
    noFact: "Танланган даврда факт маълумоти йўқ. «Факт» табида киритинг ёки жадвалдан юкланг.",
  },
  ru: {
    title: "Время переналадки",
    subtitle: "Среднее время переналадки по ячейкам — с причиной и SKU",
    subFact: "Фактическое время переналадки по ячейкам — по дням",
    subAnalysis: "Стандарт и факт: отклонения, тренд и сравнение по ячейкам",
    tabStandard: "Стандарт", tabFact: "Факт", tabAnalysis: "Анализ",
    secTable: "Реестр ячеек",
    colSupervisor: "Супервайзер", colCell: "Ячейка", colMinutes: "Время (мин)", colReason: "Причина", colSku: "SKU",
    searchPh: "Супервайзер, ячейка или SKU…", allSups: "Все супервайзеры",
    noMatch: "Нет подходящих строк", empty: "Данных пока нет",
    add: "Добавить", edit: "Изменить", del: "Удалить", save: "Сохранить", cancel: "Отмена",
    addTitle: "Новая строка", editTitle: "Изменить строку",
    delTitle: "Удалить строку", delMsg: "Строка ячейки {cell} будет удалена. Продолжить?",
    fSupervisor: "Супервайзер", fCustom: "Имя (не из списка)", fCell: "Ячейка", fMinutes: "Время переналадки (мин)",
    fSku: "Номер SKU", fReason: "Причина", customOpt: "Другое имя…", minSuffix: "мин",
    fCellCustom: "Ячейка (не из списка)", customCellOpt: "Другая ячейка…",
    saveFail: "Не удалось сохранить. Попробуйте ещё раз.",
    secFact: "Факт за день", searchPhFact: "Супервайзер или ячейка…",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colNote: "Комментарий",
    leader: "Лидер",
    shiftAll: "Все", shift1: "1-я смена", shift2: "2-я смена",
    factEditTitle: "Ввести факт",
    fFactMinutes: "Фактическое время (мин)", fFactNote: "Комментарий (необязательно)",
    factDelTitle: "Удалить запись факта",
    factDelMsg: "Запись факта ячейки {cell} за {date} будет удалена. Продолжить?",
    refresh: "Обновить",
    refreshHint: "Загрузить историю переналадок по ячейкам из таблицы «Смена отчёт»",
    refreshDone: "Загружено из таблицы", refreshFail: "Не удалось обновить",
    noCellsScope: "В вашей зоне нет ячеек.",
    kEntries: "Записей факта", kEntriesSub: "{n} ячеек с данными",
    kStd: "Средний стандарт", kFact: "Средний факт", kDelta: "Среднее отклонение",
    kMatchedSub: "по ячейкам со стандартом", vsStd: "к стандарту",
    chTrend: "Факт и стандарт — тренд", chTrendSub: "Среднее за день по отчитавшимся ячейкам",
    chDev: "Наибольшие отклонения", chDevSub: "Средний факт − стандарт, мин",
    sFact: "Факт", sStd: "Стандарт",
    secCompare: "Сравнение по ячейкам",
    colFactAvg: "Факт ср.", colDays: "Дней", colMinMax: "Мин–Макс",
    colDelta: "Δ мин", colDeltaPct: "Δ %",
    noFact: "За выбранный период нет данных факта. Введите их на вкладке «Факт» или загрузите из таблицы.",
  },
  en: {
    title: "Setup times",
    subtitle: "Average changeover time per production cell — with reason and SKU",
    subFact: "Actual daily changeover time per production cell",
    subAnalysis: "Standard vs fact: deviations, trend and per-cell comparison",
    tabStandard: "Standard", tabFact: "Fact", tabAnalysis: "Analysis",
    secTable: "Cells register",
    colSupervisor: "Supervisor", colCell: "Cell", colMinutes: "Time (min)", colReason: "Reason", colSku: "SKU",
    searchPh: "Supervisor, cell or SKU…", allSups: "All supervisors",
    noMatch: "No matching rows", empty: "No data yet",
    add: "Add", edit: "Edit", del: "Delete", save: "Save", cancel: "Cancel",
    addTitle: "New row", editTitle: "Edit row",
    delTitle: "Delete row", delMsg: "The row for cell {cell} will be deleted. Continue?",
    fSupervisor: "Supervisor", fCustom: "Name (not on the list)", fCell: "Cell", fMinutes: "Setup time (min)",
    fSku: "SKU number", fReason: "Reason", customOpt: "Custom name…", minSuffix: "min",
    fCellCustom: "Cell (not on the list)", customCellOpt: "Custom cell…",
    saveFail: "Could not save. Try again.",
    secFact: "Daily fact", searchPhFact: "Supervisor or cell…",
    colStandard: "Standard (min)", colFact: "Fact (min)", colNote: "Note",
    leader: "Leader",
    shiftAll: "All", shift1: "Shift 1", shift2: "Shift 2",
    factEditTitle: "Enter fact",
    fFactMinutes: "Actual time (min)", fFactNote: "Note (optional)",
    factDelTitle: "Delete fact entry",
    factDelMsg: "The fact entry of cell {cell} for {date} will be deleted. Continue?",
    refresh: "Refresh",
    refreshHint: "Load the per-cell changeover history from the «Смена отчёт» sheet",
    refreshDone: "Loaded from the sheet", refreshFail: "Refresh failed",
    noCellsScope: "No cells in your scope.",
    kEntries: "Fact entries", kEntriesSub: "{n} cells reported",
    kStd: "Avg standard", kFact: "Avg fact", kDelta: "Avg deviation",
    kMatchedSub: "across cells with a standard", vsStd: "vs standard",
    chTrend: "Fact vs standard — trend", chTrendSub: "Daily average across reporting cells",
    chDev: "Largest deviations", chDevSub: "Avg fact − standard, min",
    sFact: "Fact", sStd: "Standard",
    secCompare: "Per-cell comparison",
    colFactAvg: "Fact avg", colDays: "Days", colMinMax: "Min–Max",
    colDelta: "Δ min", colDeltaPct: "Δ %",
    noFact: "No fact data in the selected period. Enter it on the Fact tab or load it from the sheet.",
  },
};

// Traffic-light accent for the minutes pill: quick setups green, 3–5 amber,
// longer red; missing values grey (platform status-color convention).
const minColor = (v) =>
  v == null ? "#94a3b8" : v < 3 ? "#22c55e" : v <= 5 ? "#eab308" : "#ef4444";
// Fact-vs-standard traffic light: at/under the standard green, up to 20% over
// amber, beyond red. No standard to compare against → the absolute scale above.
const deltaColor = (delta, std) =>
  delta == null ? "#94a3b8"
  : delta <= 0 ? "#22c55e"
  : std > 0 && delta <= std * 0.2 ? "#eab308"
  : "#ef4444";
const factColor = (v, std) =>
  v == null ? "#94a3b8" : std == null || std <= 0 ? minColor(v) : deltaColor(v - std, std);
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fmtMin = (v) => (v == null ? "—" : String(parseFloat(Number(v).toFixed(2))));
const fmt1 = (v) => (v == null ? "—" : String(parseFloat(Number(v).toFixed(1))));
const fmtSigned = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + fmt1(v));

const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const addDaysIso = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmtDMY = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const fmtDM = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");

// The standard full-width modal text input (matches the Production/Concerns forms).
function ModalInput({ value, onChange, type = "text", className = "", ...rest }) {
  return (
    <input
      value={value}
      type={type}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${className}`}
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
      {...rest}
    />
  );
}

const EMPTY_DRAFT = { manager_id: null, supervisor: "", cell: "", minutes: "", sku: "", reason: "" };

// Cell-registry helpers: pick the workshop name for the viewer language (falling
// back across languages) and label a picker option "code — name".
const CUSTOM_CELL = "__custom__";
// Short {uz, uz_cyrl, ru, en} keys here — viewer language first, Russian next.
const pickName = (obj, lang) => cellName(obj, lang, "");
const cellOptLabel = (c, lang) => {
  const nm = pickName(c, lang);
  return nm ? `${c.code} — ${nm}` : c.code;
};

// Sortable-table state + toggle, persisted per key (asc → desc → off).
function useSortState(storageKey, initial = { key: null, dir: "asc" }) {
  const [sort, setSort] = usePersistentState(storageKey, initial);
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" });
  return [sort, onSort];
}
const sortCmp = (sort, val) => (a, b) => {
  const va = val(a), vb = val(b);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
};

// Code + muted workshop name — the one way a cell renders in ALL three tabs.
// With a registry id the code is a CellLink to /cells/:id; free-typed cells
// that match no registry row (cellId null) stay inert text.
function CellCol({ code, name, lang, cellId }) {
  const nm = pickName(name, lang);
  return (
    <>
      <div className="font-mono tabular-nums" style={{ color: "var(--text-2)" }}>
        <CellLink id={cellId}>{code}</CellLink>
      </div>
      {nm && (
        <div className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--text-4)" }}>{nm}</div>
      )}
    </>
  );
}

function MinPill({ value, color }) {
  return (
    <span
      className="inline-block min-w-[42px] text-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: hexA(color, 0.13), color }}
    >
      {fmtMin(value)}
    </span>
  );
}

// Card + SectionHead wrapper for the analysis charts — same chrome as TableCard.
function ChartCard({ icon, title, subtitle, right, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} subtitle={subtitle} right={right} />
      <div className="px-2 py-2 sm:px-3">{children}</div>
    </div>
  );
}

const emptyBox = (msg) => (
  <div
    className="rounded-2xl py-12 px-4 text-center text-sm"
    style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)", color: "var(--text-3)" }}
  >
    {msg}
  </div>
);

// ─── «Standart» tab — the hand-maintained reference register ─────────────────
function StandardTab({ T, lang, tl }) {
  const qc = useQueryClient();

  const [search, setSearch] = usePersistentState("setup_times_search", "");
  const [supSel, setSupSel] = usePersistentState("setup_times_supervisor", "all");
  const [sort, onSort] = useSortState("setup_times_sort");

  const [modal, setModal] = useState(null);      // null | { id?, draft }
  const [confirmDel, setConfirmDel] = useState(null); // row to delete

  const { data, isLoading } = useQuery({
    queryKey: ["setup-times"],
    queryFn: () => api.get("/api/setup-times").then((r) => r.data),
  });
  const canEdit = data?.can_edit;
  const allRows = data?.rows ?? [];
  const managers = data?.supervisors ?? [];
  const cells = data?.cells ?? [];
  const knownCells = useMemo(() => new Set(cells.map((c) => c.code)), [cells]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["setup-times"] });
    // Standards feed the Fakt pills and the Tahlil deltas.
    qc.invalidateQueries({ queryKey: ["setup-fact"] });
    qc.invalidateQueries({ queryKey: ["setup-analysis"] });
  };
  const saveRow = useMutation({
    mutationFn: ({ id, body }) =>
      id ? api.patch(`/api/setup-times/${id}`, body) : api.post("/api/setup-times", body),
    onSuccess: () => { setModal(null); invalidate(); },
  });
  const deleteRow = useMutation({
    mutationFn: (id) => api.delete(`/api/setup-times/${id}`),
    onSuccess: () => { setConfirmDel(null); invalidate(); },
  });

  // Filter options come from the rows themselves so unlinked free-text
  // supervisors (no manager unit) are filterable too.
  const supOpts = useMemo(() => {
    const names = [...new Set(allRows.map((r) => r.supervisor).filter(Boolean))]
      .sort((a, b) => tl(a).localeCompare(tl(b)));
    return [{ value: "all", label: T.allSups }, ...names.map((n) => ({ value: n, label: tl(n) }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, lang]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allRows;
    if (supSel !== "all") list = list.filter((r) => r.supervisor === supSel);
    if (q) list = list.filter((r) =>
      `${tl(r.supervisor)} ${r.supervisor} ${r.cell} ${r.sku} ${r.reason}`.toLowerCase().includes(q));
    if (!sort.key) return list;
    const val = (r) => ({
      supervisor: tl(r.supervisor || ""), cell: r.cell,
      minutes: r.minutes ?? -1, sku: r.sku, reason: r.reason,
    }[sort.key]);
    return [...list].sort(sortCmp(sort, val));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, supSel, sort, tl, lang]);

  // ── edit modal helpers ─────────────────────────────────────────────────────
  const openCreate = () => setModal({ draft: { ...EMPTY_DRAFT }, cellCustom: false });
  const openEdit = (r) => setModal({
    id: r.id,
    // A stored code that isn't in the registry (unseeded / suffixed sub-cell like
    // "2312 Б") opens straight into the free-text fallback so it survives a save.
    cellCustom: !!r.cell && !knownCells.has(r.cell),
    draft: {
      manager_id: r.manager_id,
      supervisor: r.manager_id ? "" : r.supervisor,
      cell: r.cell, minutes: r.minutes ?? "", sku: r.sku, reason: r.reason,
    },
  });
  const setDraft = (key) => (v) => setModal((m) => ({ ...m, draft: { ...m.draft, [key]: v } }));

  // Cell picker: the whole registry as options + a «Custom…» escape hatch that
  // reveals a free-text input (unknown codes are legitimate, so never reject).
  const cellSelectOpts = [
    ...cells.map((c) => ({ value: c.code, label: cellOptLabel(c, lang) })),
    { value: CUSTOM_CELL, label: T.customCellOpt },
  ];
  const cellSelValue = modal?.cellCustom ? CUSTOM_CELL : (modal?.draft.cell || "");
  const onCellPick = (v) => setModal((m) => v === CUSTOM_CELL
    ? { ...m, cellCustom: true, draft: { ...m.draft, cell: "" } }
    : { ...m, cellCustom: false, draft: { ...m.draft, cell: v } });

  const supValue = modal?.draft.manager_id != null ? `m${modal.draft.manager_id}` : "custom";
  const supSelectOpts = [
    ...managers.map((m) => ({ value: `m${m.id}`, label: tl(m.name) })),
    { value: "custom", label: T.customOpt },
  ];
  const onSupPick = (v) => setModal((m) => ({
    ...m,
    draft: { ...m.draft, manager_id: v === "custom" ? null : Number(v.slice(1)) },
  }));

  const canSave =
    (modal?.draft.cell ?? "").trim() !== "" &&
    (modal?.draft.manager_id != null || (modal?.draft.supervisor ?? "").trim() !== "");
  const submit = () => {
    const d = modal.draft;
    saveRow.mutate({
      id: modal.id,
      body: {
        manager_id: d.manager_id,
        supervisor: d.manager_id != null ? "" : d.supervisor.trim(),
        cell: d.cell.trim(),
        minutes: d.minutes === "" ? null : Number(d.minutes),
        sku: d.sku.trim(),
        reason: d.reason.trim(),
      },
    });
  };

  return (
    <>
      <TableCard
        icon={LayoutGrid}
        title={T.secTable}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {isLoading ? "…" : rows.length}
          </span>
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={T.searchPh} className="w-full sm:w-56" />
            <StyledSelect value={supSel} onChange={setSupSel} options={supOpts} searchable className="w-full sm:w-56" />
            <div className="flex-grow" />
            {canEdit && (
              <Button size="lg" icon={<Plus size={14} />} onClick={openCreate}>{T.add}</Button>
            )}
          </>
        }
      >
        <thead>
          <tr>
            <Th icon={CircleUserRound} label={T.colSupervisor} k="supervisor" sort={sort} onSort={onSort} />
            <Th icon={LayoutGrid} label={T.colCell} k="cell" sort={sort} onSort={onSort} />
            <Th icon={Timer} label={T.colMinutes} k="minutes" sort={sort} onSort={onSort} align="right" />
            <Th icon={MessageSquareText} label={T.colReason} k="reason" sort={sort} onSort={onSort} />
            <Th icon={Barcode} label={T.colSku} k="sku" sort={sort} onSort={onSort} />
            {canEdit && <Th label="" />}
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: canEdit ? 6 : 5 }).map((_, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3 w-full" /></td>
                ))}
              </tr>
            ))}
          {!isLoading && rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">
                <span className="font-medium" style={{ color: "var(--text-1)" }}>{tl(r.supervisor)}</span>
              </td>
              <td className="px-3 py-2">
                <CellCol code={r.cell} name={r.cell_name} lang={lang} cellId={r.cell_id} />
              </td>
              <td className="px-3 py-2 text-right">
                <MinPill value={r.minutes} color={minColor(r.minutes)} />
              </td>
              <td className="px-3 py-2 whitespace-normal min-w-[180px] max-w-[320px] text-[11px] leading-snug"
                style={{ color: r.reason ? "var(--text-2)" : "var(--text-4)" }}>
                {r.reason || "—"}
              </td>
              <td className="px-3 py-2 font-mono" style={{ color: r.sku ? "var(--text-2)" : "var(--text-4)" }}>
                {r.sku || "—"}
              </td>
              {canEdit && (
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <button title={T.edit} onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                      style={{ color: "var(--text-3)" }}>
                      <Pencil size={13} />
                    </button>
                    <button title={T.del} onClick={() => setConfirmDel(r)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                      style={{ color: "#ef4444" }}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </td>
              )}
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {search || supSel !== "all" ? T.noMatch : T.empty}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>

      {/* Create / edit modal */}
      {modal && (
        <Modal
          title={modal.id ? T.editTitle : T.addTitle}
          icon={<Wrench size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setModal(null)}
          dismissable={!saveRow.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)} disabled={saveRow.isPending}>{T.cancel}</Button>
              <Button onClick={submit} disabled={!canSave} loading={saveRow.isPending}>{T.save}</Button>
            </>
          }
        >
          <FormField label={T.fSupervisor} required>
            <StyledSelect value={supValue} onChange={onSupPick} options={supSelectOpts} searchable />
          </FormField>
          {modal.draft.manager_id == null && (
            <FormField label={T.fCustom} required>
              <ModalInput value={modal.draft.supervisor} onChange={setDraft("supervisor")} />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={T.fCell} required>
              <StyledSelect value={cellSelValue} onChange={onCellPick} options={cellSelectOpts} searchable />
            </FormField>
            <FormField label={T.fMinutes}>
              <ModalInput value={modal.draft.minutes} onChange={setDraft("minutes")} type="number" />
            </FormField>
          </div>
          {modal.cellCustom && (
            <FormField label={T.fCellCustom} required>
              <ModalInput value={modal.draft.cell} onChange={setDraft("cell")} className="font-mono" />
            </FormField>
          )}
          <FormField label={T.fSku}>
            <ModalInput value={modal.draft.sku} onChange={setDraft("sku")} className="font-mono" />
          </FormField>
          <FormField label={T.fReason}>
            <textarea
              value={modal.draft.reason}
              onChange={(e) => setDraft("reason")(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
          {saveRow.isError && (
            <div className="text-xs" style={{ color: "#ef4444" }}>
              {saveRow.error?.response?.data?.detail || T.saveFail}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <ConfirmDialog
          tone="danger"
          title={T.delTitle}
          message={T.delMsg.replace("{cell}", confirmDel.cell)}
          confirmLabel={T.del}
          cancelLabel={T.cancel}
          loading={deleteRow.isPending}
          error={deleteRow.isError ? (deleteRow.error?.response?.data?.detail || T.saveFail) : null}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => deleteRow.mutate(confirmDel.id)}
        />
      )}
    </>
  );
}

// ─── «Fakt» tab — one day's actual changeover minutes per cell ───────────────
// Same container and interaction model as the Standart register: a TableCard
// whose rows are the caller's cells for the picked day, standard and fact side
// by side, pencil-edit modal + trash per row. Bulk history comes in through the
// «Смена отчёт» Refresh; manual entry is for corrections and gap-filling.
function FactTab({ T, lang, tl }) {
  const qc = useQueryClient();
  const toast = useToast();

  // date deliberately NOT persisted: this is a data-entry surface — a silently
  // restored stale day could direct entries to the wrong date.
  const [date, setDate] = useState(localTodayIso());
  const [search, setSearch] = usePersistentState("setup_fact_search", "");
  const [supSel, setSupSel] = usePersistentState("setup_fact_supervisor", "all");
  const [shiftSel, setShiftSel] = usePersistentState("setup_fact_shift", "all");
  const [sort, onSort] = useSortState("setup_fact_sort");

  const [modal, setModal] = useState(null);        // { cell, minutes, note }
  const [confirmDel, setConfirmDel] = useState(null); // cell whose entry is deleted

  const { data, isLoading } = useQuery({
    queryKey: ["setup-fact", date],
    queryFn: () => api.get(`/api/setup-times/fact?date=${date}`).then((r) => r.data),
  });
  const allCells = data?.cells ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["setup-fact"] });
    qc.invalidateQueries({ queryKey: ["setup-analysis"] });
  };
  const saveMut = useMutation({
    mutationFn: (body) => api.post("/api/setup-times/fact", body).then((r) => r.data),
    onSuccess: () => { setModal(null); invalidate(); },
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/setup-times/fact/${id}`),
    onSuccess: () => { setConfirmDel(null); invalidate(); },
  });
  const refreshMut = useMutation({
    mutationFn: () => api.post("/api/setup-times/fact/refresh").then((r) => r.data),
    onSuccess: (d) => { invalidate(); toast.success(`${T.refreshDone} (+${d.saved ?? 0})`); },
    onError: (e) => toast.error(e?.response?.data?.detail || T.refreshFail),
  });

  const supOpts = useMemo(() => {
    const names = [...new Set(allCells.map((c) => c.supervisor).filter(Boolean))]
      .sort((a, b) => tl(a).localeCompare(tl(b)));
    return [{ value: "all", label: T.allSups }, ...names.map((n) => ({ value: n, label: tl(n), title: tl(n) }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCells, lang]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allCells;
    if (shiftSel !== "all") list = list.filter((c) => c.shift === shiftSel);
    if (supSel !== "all") list = list.filter((c) => c.supervisor === supSel);
    if (q) list = list.filter((c) =>
      `${tl(c.supervisor || "")} ${c.supervisor || ""} ${c.code} ${pickName(c.name, lang) || ""} ${tl(c.leader || "")} ${c.entry?.note || ""}`
        .toLowerCase().includes(q));
    if (!sort.key) return list;
    const val = (c) => ({
      supervisor: tl(c.supervisor || ""), cell: c.code,
      standard: c.standard ?? -1, fact: c.entry?.minutes ?? -1, note: c.entry?.note || "",
    }[sort.key]);
    return [...list].sort(sortCmp(sort, val));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCells, search, supSel, shiftSel, sort, tl, lang]);

  const filled = rows.filter((c) => c.entry).length;
  const totalMin = rows.reduce((a, c) => a + (c.entry?.minutes || 0), 0);

  const openEdit = (c) => setModal({
    cell: c,
    minutes: c.entry?.minutes != null ? String(c.entry.minutes) : "",
    note: c.entry?.note || "",
  });
  const canSave = Number(String(modal?.minutes ?? "").replace(",", ".")) > 0;
  const submit = () => saveMut.mutate({
    cell_id: modal.cell.cell_id,
    date,
    minutes: Number(String(modal.minutes).replace(",", ".")),
    note: modal.note.trim(),
  });

  return (
    <>
      <TableCard
        icon={Repeat2}
        title={T.secFact}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {isLoading ? "…" : `${filled}/${rows.length} · ${fmtMin(totalMin)} ${T.minSuffix}`}
          </span>
        }
        toolbar={
          <>
            <DayStepper value={date} onChange={setDate} />
            <SearchInput value={search} onChange={setSearch} placeholder={T.searchPhFact} className="w-full sm:w-48" />
            <StyledSelect value={supSel} onChange={setSupSel} options={supOpts} searchable className="w-full sm:w-52" />
            <SegmentedToggle
              value={shiftSel}
              onChange={setShiftSel}
              options={[["all", T.shiftAll], [1, T.shift1], [2, T.shift2]]}
            />
            <div className="flex-grow" />
            <Button
              size="lg"
              variant="secondary"
              loading={refreshMut.isPending}
              icon={!refreshMut.isPending ? <RefreshCw size={14} /> : null}
              title={T.refreshHint}
              onClick={() => refreshMut.mutate()}
            >
              <span className="hidden sm:inline">{T.refresh}</span>
            </Button>
          </>
        }
      >
        <thead>
          <tr>
            <Th icon={CircleUserRound} label={T.colSupervisor} k="supervisor" sort={sort} onSort={onSort} />
            <Th icon={LayoutGrid} label={T.colCell} k="cell" sort={sort} onSort={onSort} />
            <Th icon={Gauge} label={T.colStandard} k="standard" sort={sort} onSort={onSort} align="right" />
            <Th icon={Timer} label={T.colFact} k="fact" sort={sort} onSort={onSort} align="right" />
            <Th icon={MessageSquareText} label={T.colNote} k="note" sort={sort} onSort={onSort} />
            <Th label="" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3 w-full" /></td>
                ))}
              </tr>
            ))}
          {!isLoading && rows.map((c) => (
            <tr key={c.cell_id}>
              <td className="px-3 py-2">
                <div className="font-medium" style={{ color: c.supervisor ? "var(--text-1)" : "var(--text-4)" }}>
                  {c.supervisor ? tl(c.supervisor) : "—"}
                </div>
                {c.leader && (
                  <div className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--text-4)" }} title={T.leader}>
                    {tl(c.leader)}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <CellCol code={c.code} name={c.name} lang={lang} cellId={c.cell_id} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums"
                style={{ color: c.standard != null ? "var(--text-3)" : "var(--text-4)" }}>
                {fmtMin(c.standard)}
              </td>
              <td className="px-3 py-2 text-right">
                <MinPill value={c.entry?.minutes} color={factColor(c.entry?.minutes, c.standard)} />
              </td>
              <td className="px-3 py-2 whitespace-normal min-w-[160px] max-w-[300px] text-[11px] leading-snug"
                style={{ color: c.entry?.note ? "var(--text-2)" : "var(--text-4)" }}>
                {c.entry?.note || "—"}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <button title={T.edit} onClick={() => openEdit(c)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                    style={{ color: "var(--text-3)" }}>
                    <Pencil size={13} />
                  </button>
                  {c.entry && (
                    <button title={T.del} onClick={() => setConfirmDel(c)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-accent)]"
                      style={{ color: "#ef4444" }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
              </td>
            </tr>
          ))}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {allCells.length === 0 ? T.noCellsScope : T.noMatch}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>

      {/* Enter / edit one cell's fact */}
      {modal && (
        <Modal
          title={T.factEditTitle}
          subtitle={`${cellOptLabel({ code: modal.cell.code, ...(modal.cell.name || {}) }, lang)} · ${fmtDMY(date)}`}
          icon={<Repeat2 size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setModal(null)}
          dismissable={!saveMut.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)} disabled={saveMut.isPending}>{T.cancel}</Button>
              <Button onClick={submit} disabled={!canSave} loading={saveMut.isPending}>{T.save}</Button>
            </>
          }
        >
          {/* text + inputMode=decimal: the uz/ru iOS keypad types a comma, which
              type=number silently rejects; submit normalizes it to a dot. */}
          <FormField label={T.fFactMinutes} required>
            <ModalInput
              value={modal.minutes}
              onChange={(v) => setModal((m) => ({ ...m, minutes: v }))}
              inputMode="decimal"
              className="tabular-nums"
            />
          </FormField>
          {modal.cell.standard != null && (
            <div className="text-xs" style={{ color: "var(--text-3)" }}>
              {T.colStandard}: <span className="tabular-nums font-semibold">{fmtMin(modal.cell.standard)}</span>
            </div>
          )}
          <FormField label={T.fFactNote}>
            <textarea
              value={modal.note}
              onChange={(e) => setModal((m) => ({ ...m, note: e.target.value }))}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
          {saveMut.isError && (
            <div className="text-xs" style={{ color: "#ef4444" }}>
              {saveMut.error?.response?.data?.detail || T.saveFail}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDel && (
        <ConfirmDialog
          tone="danger"
          title={T.factDelTitle}
          message={T.factDelMsg.replace("{cell}", confirmDel.code).replace("{date}", fmtDMY(date))}
          confirmLabel={T.del}
          cancelLabel={T.cancel}
          loading={delMut.isPending}
          error={delMut.isError ? (delMut.error?.response?.data?.detail || T.saveFail) : null}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => delMut.mutate(confirmDel.entry.id)}
        />
      )}
      {toast.node}
    </>
  );
}

// ─── «Tahlil» tab — standard vs fact over a range ────────────────────────────
function AnalysisTab({ T, lang, tl }) {
  const { chartTheme, gridColor, labelColor, tooltipTheme } = useChartTheme();

  const today = localTodayIso();
  const [from, setFrom] = usePersistentState("setup_analysis_from", addDaysIso(today, -29));
  const [to, setTo] = usePersistentState("setup_analysis_to", today);
  const [supSel, setSupSel] = usePersistentState("setup_analysis_supervisor", "all");
  const [shiftSel, setShiftSel] = usePersistentState("setup_analysis_shift", "all");
  const [search, setSearch] = usePersistentState("setup_analysis_search", "");
  const [sort, onSort] = useSortState("setup_analysis_sort", { key: "delta", dir: "desc" });

  // The chart never shows fewer than 7 days (platform rule) — fetch the padded
  // window once; KPIs and the table stick to the exact picked range.
  const chartFrom = padChartFrom(from, to);
  const { data, isLoading } = useQuery({
    queryKey: ["setup-analysis", chartFrom, to],
    queryFn: () => api.get(`/api/setup-times/analysis?start=${chartFrom}&end=${to}`).then((r) => r.data),
    enabled: !!from && !!to,
  });
  const cellsAll = data?.cells ?? [];

  const supOpts = useMemo(() => {
    const names = [...new Set(cellsAll.map((c) => c.supervisor).filter(Boolean))]
      .sort((a, b) => tl(a).localeCompare(tl(b)));
    return [{ value: "all", label: T.allSups }, ...names.map((n) => ({ value: n, label: tl(n), title: tl(n) }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellsAll, lang]);

  // Per-cell stats over the EXACT picked range, honoring the shift/supervisor
  // filters — all client-side, so a filter flip recomputes without refetching.
  const stats = useMemo(() => {
    let list = cellsAll;
    if (shiftSel !== "all") list = list.filter((c) => c.shift === shiftSel);
    if (supSel !== "all") list = list.filter((c) => c.supervisor === supSel);
    return list.map((c) => {
      const inRange = (c.entries || []).filter((e) => e.date >= from && e.date <= to);
      const count = inRange.length;
      const sum = inRange.reduce((a, e) => a + e.minutes, 0);
      const avg = count ? sum / count : null;
      const mn = count ? Math.min(...inRange.map((e) => e.minutes)) : null;
      const mx = count ? Math.max(...inRange.map((e) => e.minutes)) : null;
      const delta = c.standard != null && avg != null ? avg - c.standard : null;
      const deltaPct = delta != null && c.standard > 0 ? (delta / c.standard) * 100 : null;
      return { ...c, count, sum, avg, mn, mx, delta, deltaPct };
    });
  }, [cellsAll, shiftSel, supSel, from, to]);

  const matched = useMemo(() => stats.filter((s) => s.delta != null), [stats]);
  const totalEntries = stats.reduce((a, s) => a + s.count, 0);
  const cellsWithFact = stats.filter((s) => s.count > 0).length;
  const mean = (arr) => (arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null);
  const avgStd = mean(matched.map((s) => s.standard));
  const avgFact = mean(matched.map((s) => s.avg));
  const avgDelta = avgStd != null && avgFact != null ? avgFact - avgStd : null;
  const avgDeltaPct = avgDelta != null && avgStd > 0 ? (avgDelta / avgStd) * 100 : null;

  // Daily trend across the padded window: the fact line averages every cell
  // that reported that day; the standard line averages the standards of those
  // same reporting cells — the reference moves with the day's mix.
  const trend = useMemo(() => {
    let list = cellsAll;
    if (shiftSel !== "all") list = list.filter((c) => c.shift === shiftSel);
    if (supSel !== "all") list = list.filter((c) => c.supervisor === supSel);
    const byDate = list.map((c) => ({
      std: c.standard,
      map: new Map((c.entries || []).map((e) => [e.date, e.minutes])),
    }));
    const days = listChartDays(chartFrom, to);
    return {
      days,
      fact: days.map((d) => {
        const vals = byDate.filter((c) => c.map.has(d)).map((c) => c.map.get(d));
        return vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(1) : null;
      }),
      std: days.map((d) => {
        const vals = byDate.filter((c) => c.map.has(d) && c.std != null).map((c) => c.std);
        return vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(1) : null;
      }),
    };
  }, [cellsAll, shiftSel, supSel, chartFrom, to]);
  const hasTrend = trend.fact.some((v) => v != null);

  // Cells that miss their standard the hardest — the fix-first list.
  const dev = useMemo(
    () => matched.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12),
    [matched],
  );

  const devOptions = {
    chart: {
      type: "bar", background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, redrawOnParentResize: false, redrawOnWindowResize: false, parentHeightOffset: 0,
    },
    plotOptions: { bar: { distributed: true, borderRadius: 3, columnWidth: "55%", dataLabels: { position: "top" } } },
    colors: dev.map((c) => (c.delta > 0 ? "#ef4444" : "#22c55e")),
    dataLabels: {
      enabled: true,
      formatter: (v) => fmtSigned(v),
      offsetY: -18,
      style: { fontSize: "10px", fontWeight: 700, colors: [labelColor] },
    },
    legend: { show: false },
    xaxis: {
      categories: dev.map((c) => c.code),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: -45 },
      axisBorder: { show: false },
      axisTicks: { color: gridColor },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => fmt1(v) }, forceNiceScale: true },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { top: 8 } },
    tooltip: {
      theme: tooltipTheme,
      x: {
        formatter: (val, opts) => {
          const c = dev[opts?.dataPointIndex];
          if (!c) return val;
          const nm = pickName(c.name, lang);
          return nm ? `${c.code} — ${nm}` : c.code;
        },
      },
      y: {
        formatter: (v, opts) => {
          const c = dev[opts?.dataPointIndex];
          const base = `${fmtSigned(v)} ${T.minSuffix}`;
          return c ? `${base} · ${T.sStd} ${fmt1(c.standard)} → ${T.sFact} ${fmt1(c.avg)}` : base;
        },
      },
    },
    theme: chartTheme,
  };

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stats.filter((s) => s.count > 0 || s.standard != null);
    if (q) list = list.filter((s) =>
      `${tl(s.supervisor || "")} ${s.supervisor || ""} ${s.code} ${pickName(s.name, lang) || ""}`.toLowerCase().includes(q));
    if (!sort.key) return list;
    const val = (s) => ({
      supervisor: tl(s.supervisor || ""), cell: s.code,
      standard: s.standard ?? -1e9, avg: s.avg ?? -1e9, count: s.count,
      delta: s.delta ?? -1e9, deltaPct: s.deltaPct ?? -1e9,
    }[sort.key]);
    return [...list].sort(sortCmp(sort, val));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, search, sort, tl, lang]);

  const filterRow = (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <DateRangePicker
        dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo}
        triggerClassName="px-3 py-2 text-sm"
      />
      <StyledSelect value={supSel} onChange={setSupSel} options={supOpts} searchable className="w-full sm:w-52" />
      <SegmentedToggle
        value={shiftSel}
        onChange={setShiftSel}
        options={[["all", T.shiftAll], [1, T.shift1], [2, T.shift2]]}
      />
    </div>
  );

  if (isLoading) {
    return (
      <>
        {filterRow}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-24 w-full rounded-xl" />)}
        </div>
        <SkeletonBlock className="h-64 w-full rounded-2xl mb-4" />
        <SkeletonBlock className="h-64 w-full rounded-2xl" />
      </>
    );
  }

  if (!totalEntries) {
    return (
      <>
        {filterRow}
        {emptyBox(T.noFact)}
      </>
    );
  }

  return (
    <>
      {filterRow}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard
          label={T.kEntries}
          value={totalEntries}
          sub={T.kEntriesSub.replace("{n}", String(cellsWithFact))}
          icon={ClipboardList}
          color="#3b82f6"
        />
        <KPICard
          label={T.kStd}
          value={avgStd != null ? `${fmt1(avgStd)} ${T.minSuffix}` : "—"}
          sub={T.kMatchedSub}
          icon={Gauge}
          color="#94a3b8"
        />
        <KPICard
          label={T.kFact}
          value={avgFact != null ? `${fmt1(avgFact)} ${T.minSuffix}` : "—"}
          sub={T.kMatchedSub}
          icon={Timer}
          color="#C8973F"
        />
        <KPICard
          label={T.kDelta}
          value={avgDelta != null ? `${fmtSigned(avgDelta)} ${T.minSuffix}` : "—"}
          sub={avgDeltaPct != null ? `${fmtSigned(avgDeltaPct)}% ${T.vsStd}` : T.kMatchedSub}
          icon={avgDelta != null && avgDelta > 0 ? TrendingUp : TrendingDown}
          color={avgDelta == null ? "#94a3b8" : avgDelta > 0 ? "#ef4444" : "#22c55e"}
        />
      </div>

      {/* Trend: daily fact average vs the moving standard reference */}
      <div className="mb-4">
        <ChartCard icon={LineChart} title={T.chTrend} subtitle={T.chTrendSub}>
          {hasTrend ? (
            <TrendChart
              dates={trend.days.map(fmtDM)}
              series={[
                { name: T.sFact, data: trend.fact, color: "#C8973F" },
                { name: T.sStd, data: trend.std, color: "#94a3b8", dashed: true },
              ]}
              height={280}
            />
          ) : (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>{T.noFact}</div>
          )}
        </ChartCard>
      </div>

      {/* Largest per-cell deviations */}
      {dev.length > 0 && (
        <div className="mb-4">
          <ChartCard icon={BarChart3} title={T.chDev} subtitle={T.chDevSub}>
            <ReactApexChart
              type="bar"
              series={[{ name: T.colDelta, data: dev.map((c) => +c.delta.toFixed(1)) }]}
              options={devOptions}
              height={300}
            />
          </ChartCard>
        </div>
      )}

      {/* Per-cell comparison register */}
      <TableCard
        icon={Scale}
        title={T.secCompare}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {tableRows.length}
          </span>
        }
        toolbar={
          <SearchInput value={search} onChange={setSearch} placeholder={T.searchPhFact} className="w-full sm:w-56" />
        }
      >
        <thead>
          <tr>
            <Th icon={CircleUserRound} label={T.colSupervisor} k="supervisor" sort={sort} onSort={onSort} />
            <Th icon={LayoutGrid} label={T.colCell} k="cell" sort={sort} onSort={onSort} />
            <Th icon={Gauge} label={T.colStandard} k="standard" sort={sort} onSort={onSort} align="right" />
            <Th icon={Timer} label={T.colFactAvg} k="avg" sort={sort} onSort={onSort} align="right" />
            <Th icon={CalendarDays} label={T.colDays} k="count" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colMinMax} align="right" />
            <Th label={T.colDelta} k="delta" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colDeltaPct} k="deltaPct" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {tableRows.map((s) => (
            <tr key={s.cell_id}>
              <td className="px-3 py-2">
                <span className="font-medium" style={{ color: s.supervisor ? "var(--text-1)" : "var(--text-4)" }}>
                  {s.supervisor ? tl(s.supervisor) : "—"}
                </span>
              </td>
              <td className="px-3 py-2">
                <CellCol code={s.code} name={s.name} lang={lang} cellId={s.cell_id} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums"
                style={{ color: s.standard != null ? "var(--text-3)" : "var(--text-4)" }}>
                {fmtMin(s.standard)}
              </td>
              <td className="px-3 py-2 text-right">
                <MinPill value={s.avg != null ? +s.avg.toFixed(1) : null} color={factColor(s.avg, s.standard)} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.count ? "var(--text-2)" : "var(--text-4)" }}>
                {s.count || "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.count ? "var(--text-3)" : "var(--text-4)" }}>
                {s.count ? `${fmt1(s.mn)}–${fmt1(s.mx)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <span className="tabular-nums font-semibold" style={{ color: deltaColor(s.delta, s.standard) }}>
                  {fmtSigned(s.delta)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums"
                style={{ color: s.deltaPct != null ? deltaColor(s.delta, s.standard) : "var(--text-4)" }}>
                {s.deltaPct != null ? `${fmtSigned(s.deltaPct)}%` : "—"}
              </td>
            </tr>
          ))}
          {tableRows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {T.noMatch}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>
    </>
  );
}

export default function SetupTimes() {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.ru;

  const [tab, setTab] = usePersistentState("setup_times_tab", "standard"); // standard | fact | analysis
  const sub = tab === "fact" ? T.subFact : tab === "analysis" ? T.subAnalysis : T.subtitle;

  return (
    <Layout title={T.title}>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight flex items-center gap-2" style={{ color: "var(--text-1)" }}>
            <Wrench size={20} style={{ color: "var(--brand-text)" }} /> {T.title}
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</p>
        </div>
      </div>

      {/* View tabs: the reference register, the daily actuals, the comparison. */}
      <SegmentedToggle
        asTabs
        ariaLabel={T.title}
        value={tab}
        onChange={setTab}
        options={[
          ["standard", T.tabStandard],
          ["fact", T.tabFact],
          ["analysis", T.tabAnalysis],
        ]}
        className="mb-4"
      />

      {tab === "standard" && <StandardTab T={T} lang={lang} tl={tl} />}
      {tab === "fact" && <FactTab T={T} lang={lang} tl={tl} />}
      {tab === "analysis" && <AnalysisTab T={T} lang={lang} tl={tl} />}
    </Layout>
  );
}
