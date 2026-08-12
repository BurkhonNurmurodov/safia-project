import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  RefreshCw, CalendarClock, AlertTriangle, ClipboardList, ShieldCheck,
  Loader, Loader2, Users2, TrendingUp, UserCog, Boxes, Megaphone, Settings2,
  LayoutGrid, UserRound, CircleDot,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { padChartFrom, listChartDays } from "../utils/chartRange";

// ── status palette ───────────────────────────────────────────────────────────
// Statuses are SEMANTIC (traffic-light), not categorical: done green, doing
// yellow, todo red; deferred/other are de-emphasis slates. Never brand gold.
const ST_KEYS = ["done", "doing", "todo", "deferred", "other"];
const ST_COLORS = {
  done: "#22c55e", doing: "#eab308", todo: "#ef4444",
  deferred: "#94a3b8", other: "#64748b",
};
const C_OPEN = "#ef4444", C_DONE = "#22c55e", C_DOING = "#eab308";
const C_WORKERS = "#3b82f6";
const C_LOWN = "#94a3b8";
const BRAND = "#C8973F";

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

// Sheet names are FULL passport spellings in caps; two tokens are enough to
// recognize a person and short enough for an axis label.
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

// ── статусы sheet vocabulary → four platform languages ───────────────────────
const LI = { uz: 0, uz_cyrl: 1, ru: 2, en: 3 };
const ST_LBL = {
  done:     ["Hal bo'lgan", "Ҳал бўлган", "Решено", "Resolved"],
  doing:    ["Jarayonda", "Жараёнда", "В работе", "In progress"],
  todo:     ["Ko'rilmagan", "Кўрилмаган", "Не рассмотрено", "Not addressed"],
  deferred: ["O'tkazilgan", "Ўтказилган", "Перенесено", "Deferred"],
  other:    ["Boshqa", "Бошқа", "Прочее", "Other"],
};

const TXT = {
  uz: {
    title: "Ishchi havotirlari", sub: "Ishchilar liderlarga bildirgan havotirlar — liderlar KPI",
    vObzor: "Obzor", vLeaders: "Liderlar KPI", vRegister: "Reyestr",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…", lastSynced: "Oxirgi sinxron", never: "hech qachon",
    syncSheets: "varaq", syncDone: "Ma'lumotlar yangilandi", syncFailedT: "Sinxronlashda xatolik",
    loadFailed: "Ma'lumotlarni yuklab bo'lmadi", retry: "Qayta urinish",
    emptyTitle: "Hali ma'lumot yo'q", emptyNote: "Google Sheets'dan birinchi sinxronlashni ishga tushiring — ~180 varaq, 2–4 daqiqa.",
    kTotal: "Jami havotirlar", kResolved: "Hal bo'lgan", kDoing: "Jarayonda",
    kOpen: "Hal bo'lmagan", kOpenHint: "hal bo'lganidan tashqari barchasi",
    kWorkers: "Faol ishchilar", kWorkersHint: "havotir bildirganlar",
    undatedNote: "ta yozuv sanasi noto'g'ri kiritilgan — davr grafiklari va KPI ga kirmaydi (reyestrda «—» bilan ko'rinadi)",
    secDaily: "Kunlik dinamika", secDailySub: "holatlar bo'yicha, kelib tushgan sana",
    secBrig: "Brigadirlar kesimi", secBrigSub: "tanlangan davr, holatlar bo'yicha",
    secCells: "Yacheykalar — hal bo'lmaganlar TOP", secCellsSub: "eng ko'p ochiq havotirli yacheykalar",
    secLeaders: "Liderlar KPI", secLeadersSub: "reyestr bo'yicha biriktirilgan lider kesimida",
    secRegister: "Havotirlar reyestri",
    colLeader: "Lider", colBrig: "Brigadir", colCells: "Yacheykalar", colTotal: "Jami",
    colDone: "Hal bo'lgan", colDoing: "Jarayonda", colOpen: "Hal bo'lmagan", colPct: "% hal bo'lgan",
    colDate: "Sana", colCell: "Yacheyka", colOwner: "Ishchi", colText: "Havotir", colStatus: "Holat",
    fBrig: "Brigadir", fLeader: "Lider", fCell: "Yacheyka", fStatus: "Holat",
    searchLeader: "Lider qidirish…", searchReg: "Matn, ishchi yoki lider bo'yicha qidirish…",
    rows: "ta", concernsWord: "havotir", leadersWord: "lider", noMatch: "Mos yozuv topilmadi",
    lowN: "kam ma'lumot", lowNHint: "5 tadan kam havotir — reyting uchun yetarli emas",
    unassigned: "ta havotir reyestrda lidersiz yacheykalarga tegishli — reytingga kirmaydi, reyestrda ko'rinadi",
    bandsTitle: "KPI chegaralari", bandsEdit: "Chegaralarni sozlash",
    bandGreenL: "Yashil chegara (≥ %)", bandYellowL: "Sariq chegara (≥ %)",
    bandsHint: "Sariqdan pasti qizil hisoblanadi. Chegaralar butun platforma uchun bitta.",
    bandsSaved: "Chegaralar saqlandi", bandsErr: "Saqlab bo'lmadi",
    cancel: "Bekor qilish", save: "Saqlash",
    mTitle: "Havotir", mLeaderRow: "Varaqdagi lider yozuvi", mBrig: "Brigadir", mRawDate: "Varaqdagi sana",
    kamBand: "kam ma'lumot",
    pageOf: "sahifa",
  },
  uz_cyrl: {
    title: "Ишчи ҳавотирлари", sub: "Ишчилар лидерларга билдирган ҳавотирлар — лидерлар KPI",
    vObzor: "Обзор", vLeaders: "Лидерлар KPI", vRegister: "Реестр",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", lastSynced: "Охирги синхрон", never: "ҳеч қачон",
    syncSheets: "варақ", syncDone: "Маълумотлар янгиланди", syncFailedT: "Синхронлашда хатолик",
    loadFailed: "Маълумотларни юклаб бўлмади", retry: "Қайта уриниш",
    emptyTitle: "Ҳали маълумот йўқ", emptyNote: "Google Sheets'дан биринчи синхронлашни ишга туширинг — ~180 варақ, 2–4 дақиқа.",
    kTotal: "Жами ҳавотирлар", kResolved: "Ҳал бўлган", kDoing: "Жараёнда",
    kOpen: "Ҳал бўлмаган", kOpenHint: "ҳал бўлганидан ташқари барчаси",
    kWorkers: "Фаол ишчилар", kWorkersHint: "ҳавотир билдирганлар",
    undatedNote: "та ёзув санаси нотўғри киритилган — давр графиклари ва KPI га кирмайди (реестрда «—» билан кўринади)",
    secDaily: "Кунлик динамика", secDailySub: "ҳолатлар бўйича, келиб тушган сана",
    secBrig: "Бригадирлар кесими", secBrigSub: "танланган давр, ҳолатлар бўйича",
    secCells: "Ячейкалар — ҳал бўлмаганлар TOP", secCellsSub: "энг кўп очиқ ҳавотирли ячейкалар",
    secLeaders: "Лидерлар KPI", secLeadersSub: "реестр бўйича бириктирилган лидер кесимида",
    secRegister: "Ҳавотирлар реестри",
    colLeader: "Лидер", colBrig: "Бригадир", colCells: "Ячейкалар", colTotal: "Жами",
    colDone: "Ҳал бўлган", colDoing: "Жараёнда", colOpen: "Ҳал бўлмаган", colPct: "% ҳал бўлган",
    colDate: "Сана", colCell: "Ячейка", colOwner: "Ишчи", colText: "Ҳавотир", colStatus: "Ҳолат",
    fBrig: "Бригадир", fLeader: "Лидер", fCell: "Ячейка", fStatus: "Ҳолат",
    searchLeader: "Лидер қидириш…", searchReg: "Матн, ишчи ёки лидер бўйича қидириш…",
    rows: "та", concernsWord: "ҳавотир", leadersWord: "лидер", noMatch: "Мос ёзув топилмади",
    lowN: "кам маълумот", lowNHint: "5 тадан кам ҳавотир — рейтинг учун етарли эмас",
    unassigned: "та ҳавотир реестрда лидерсиз ячейкаларга тегишли — рейтингга кирмайди, реестрда кўринади",
    bandsTitle: "KPI чегаралари", bandsEdit: "Чегараларни созлаш",
    bandGreenL: "Яшил чегара (≥ %)", bandYellowL: "Сариқ чегара (≥ %)",
    bandsHint: "Сариқдан пасти қизил ҳисобланади. Чегаралар бутун платформа учун битта.",
    bandsSaved: "Чегаралар сақланди", bandsErr: "Сақлаб бўлмади",
    cancel: "Бекор қилиш", save: "Сақлаш",
    mTitle: "Ҳавотир", mLeaderRow: "Варақдаги лидер ёзуви", mBrig: "Бригадир", mRawDate: "Варақдаги сана",
    kamBand: "кам маълумот",
    pageOf: "саҳифа",
  },
  ru: {
    title: "Хавотиры работников", sub: "Опасения, поданные работниками лидерам — KPI лидеров",
    vObzor: "Обзор", vLeaders: "KPI лидеров", vRegister: "Реестр",
    refresh: "Обновить", refreshing: "Обновление…", lastSynced: "Последняя синхронизация", never: "никогда",
    syncSheets: "листов", syncDone: "Данные обновлены", syncFailedT: "Ошибка синхронизации",
    loadFailed: "Не удалось загрузить данные", retry: "Повторить",
    emptyTitle: "Данных пока нет", emptyNote: "Запустите первую синхронизацию из Google Sheets — ~180 листов, 2–4 минуты.",
    kTotal: "Всего хавотиров", kResolved: "Решено", kDoing: "В работе",
    kOpen: "Не решено", kOpenHint: "всё, кроме решённых",
    kWorkers: "Активных работников", kWorkersHint: "подавали хавотиры",
    undatedNote: "записей с нечитаемой датой — не входят в графики периода и KPI (в реестре видны с «—»)",
    secDaily: "Динамика по дням", secDailySub: "по статусам, дата подачи",
    secBrig: "Разрез по бригадирам", secBrigSub: "выбранный период, по статусам",
    secCells: "Ячейки — топ нерешённых", secCellsSub: "ячейки с наибольшим числом открытых хавотиров",
    secLeaders: "KPI лидеров", secLeadersSub: "по закреплённому в реестре лидеру",
    secRegister: "Реестр хавотиров",
    colLeader: "Лидер", colBrig: "Бригадир", colCells: "Ячейки", colTotal: "Всего",
    colDone: "Решено", colDoing: "В работе", colOpen: "Не решено", colPct: "% решено",
    colDate: "Дата", colCell: "Ячейка", colOwner: "Работник", colText: "Хавотир", colStatus: "Статус",
    fBrig: "Бригадир", fLeader: "Лидер", fCell: "Ячейка", fStatus: "Статус",
    searchLeader: "Поиск лидера…", searchReg: "Поиск по тексту, работнику или лидеру…",
    rows: "шт", concernsWord: "хавотиров", leadersWord: "лидеров", noMatch: "Ничего не найдено",
    lowN: "мало данных", lowNHint: "меньше 5 хавотиров — недостаточно для рейтинга",
    unassigned: "хавотиров относятся к ячейкам без лидера в реестре — не входят в рейтинг, видны в реестре",
    bandsTitle: "Пороги KPI", bandsEdit: "Настроить пороги",
    bandGreenL: "Зелёный порог (≥ %)", bandYellowL: "Жёлтый порог (≥ %)",
    bandsHint: "Ниже жёлтого — красный. Пороги общие для всей платформы.",
    bandsSaved: "Пороги сохранены", bandsErr: "Не удалось сохранить",
    cancel: "Отмена", save: "Сохранить",
    mTitle: "Хавотир", mLeaderRow: "Лидер в строке листа", mBrig: "Бригадир", mRawDate: "Дата в листе",
    kamBand: "мало данных",
    pageOf: "страница",
  },
  en: {
    title: "Worker concerns", sub: "Concerns workers raise to their leaders — the leaders' KPI",
    vObzor: "Overview", vLeaders: "Leaders KPI", vRegister: "Register",
    refresh: "Refresh", refreshing: "Refreshing…", lastSynced: "Last synced", never: "never",
    syncSheets: "sheets", syncDone: "Data refreshed", syncFailedT: "Sync failed",
    loadFailed: "Failed to load data", retry: "Retry",
    emptyTitle: "No data yet", emptyNote: "Run the first sync from Google Sheets — ~180 sheets, 2–4 minutes.",
    kTotal: "Total concerns", kResolved: "Resolved", kDoing: "In progress",
    kOpen: "Unresolved", kOpenHint: "everything except resolved",
    kWorkers: "Active workers", kWorkersHint: "submitted concerns",
    undatedNote: "row(s) with an unreadable date — excluded from period charts and KPI (shown as «—» in the register)",
    secDaily: "Daily trend", secDailySub: "by status, filing date",
    secBrig: "By brigadir", secBrigSub: "selected period, by status",
    secCells: "Cells — top unresolved", secCellsSub: "cells with the most open concerns",
    secLeaders: "Leaders KPI", secLeadersSub: "by the leader registered for each cell",
    secRegister: "Concerns register",
    colLeader: "Leader", colBrig: "Brigadir", colCells: "Cells", colTotal: "Total",
    colDone: "Resolved", colDoing: "In progress", colOpen: "Unresolved", colPct: "% resolved",
    colDate: "Date", colCell: "Cell", colOwner: "Worker", colText: "Concern", colStatus: "Status",
    fBrig: "Brigadir", fLeader: "Leader", fCell: "Cell", fStatus: "Status",
    searchLeader: "Search leaders…", searchReg: "Search text, worker or leader…",
    rows: "rows", concernsWord: "concerns", leadersWord: "leaders", noMatch: "No match",
    lowN: "low data", lowNHint: "fewer than 5 concerns — not enough to rank",
    unassigned: "concern(s) belong to cells with no registered leader — outside the ranking, visible in the register",
    bandsTitle: "KPI thresholds", bandsEdit: "Adjust thresholds",
    bandGreenL: "Green threshold (≥ %)", bandYellowL: "Yellow threshold (≥ %)",
    bandsHint: "Below yellow counts as red. Thresholds are platform-wide.",
    bandsSaved: "Thresholds saved", bandsErr: "Could not save",
    cancel: "Cancel", save: "Save",
    mTitle: "Concern", mLeaderRow: "Leader as written in the sheet", mBrig: "Brigadir", mRawDate: "Date in the sheet",
    kamBand: "low data",
    pageOf: "page",
  },
};

export default function WorkerConcerns() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const stL = (k) => (ST_LBL[k] || ST_LBL.other)[LI[lang] ?? LI.ru];
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();
  const { chartTheme, cardBg, gridColor, labelColor, legendColor } = useChartTheme();
  const factorySection = useFactorySection();

  const today = localISO(new Date());
  const monthStart = today.slice(0, 8) + "01";

  // ── page state (persisted, like every page) ───────────────────────────────
  const [view, setView] = usePersistentState("wc_view", "obzor");
  const [dateFrom, setDateFrom] = usePersistentState("wc_date_from", monthStart);
  const [dateTo, setDateTo] = usePersistentState("wc_date_to", today);
  const [mgrSel, setMgrSel] = usePersistentState("wc_mgr_sel", []);
  const [leadSel, setLeadSel] = usePersistentState("wc_lead_sel", []);
  const [cellSel, setCellSel] = usePersistentState("wc_cell_sel", []);
  const [stSel, setStSel] = usePersistentState("wc_st_sel", []);
  const [q, setQ] = usePersistentState("wc_q", "");
  const [page, setPage] = usePersistentState("wc_page", 1);
  const [regSort, setRegSort] = usePersistentState("wc_reg_sort", "date_desc");
  const [ldSort, setLdSort] = usePersistentState("wc_ld_sort", { key: "total", dir: "desc" });

  // ── meta (options + sync state + bands) ───────────────────────────────────
  const metaQ = useQuery({
    queryKey: ["wc-meta"],
    queryFn: () => api.get("/api/worker-concerns/meta").then((r) => r.data),
    // While a crawl runs the meta row is the progress feed — poll it.
    refetchInterval: (query) => (query.state.data?.sync?.running ? 2500 : false),
  });
  const meta = metaQ.data;
  const sync = meta?.sync;
  const running = !!sync?.running;
  const hasData = (sync?.row_count || 0) > 0;
  const bands = meta?.bands || { green: 80, yellow: 50 };
  const minRanked = meta?.min_ranked ?? 5;

  // ── request params ────────────────────────────────────────────────────────
  const baseParams = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ...(mgrSel.length ? { manager_id: mgrSel } : {}),
    ...(leadSel.length ? { leader: leadSel } : {}),
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
    enabled: hasData,
    placeholderData: keepPreviousData,
  });
  const leadersQ = useQuery({
    queryKey: ["wc-leaders", params],
    queryFn: () => api.get("/api/worker-concerns/leaders", { params }).then((r) => r.data),
    enabled: hasData && view === "leaders",
    placeholderData: keepPreviousData,
  });
  const listParams = useMemo(
    () => ({ ...params, q: q.trim() || undefined, page, page_size: 50, sort: regSort }),
    [params, q, page, regSort]
  );
  const listQ = useQuery({
    queryKey: ["wc-list", listParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: listParams }).then((r) => r.data),
    enabled: hasData && view === "register",
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

  // ── refresh (the 180-sheet crawl, minutes — progress polled via meta) ─────
  const refreshMut = useMutation({
    mutationFn: () => api.post("/api/worker-concerns/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wc-meta"] }),
    onError: (e) => toast.error(`${T.syncFailedT}: ${e?.response?.data?.detail || e?.message || ""}`),
  });
  const prevRunning = useRef(false);
  useEffect(() => {
    if (prevRunning.current && !running) {
      // A crawl just finished — pull fresh numbers and report the outcome.
      qc.invalidateQueries({ queryKey: ["wc-stats"] });
      qc.invalidateQueries({ queryKey: ["wc-leaders"] });
      qc.invalidateQueries({ queryKey: ["wc-list"] });
      if (sync?.ok === false) toast.error(`${T.syncFailedT}: ${sync?.message || ""}`);
      else toast.success(T.syncDone);
    }
    prevRunning.current = running;
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filter sections ───────────────────────────────────────────────────────
  const supers = useFactorySupervisors(meta?.supervisors || [], mgrSel, (kept) => setMgrSel(kept || []), "id");
  const supName = useMemo(
    () => Object.fromEntries((meta?.supervisors || []).map((s) => [s.id, s.name])),
    [meta]
  );
  const cellName = useMemo(() => {
    const m = {};
    for (const c of meta?.cells || []) {
      const n = c.names && (c.names[lang] || c.names.ru || c.names.uz);
      m[c.code] = n ? `${c.code} · ${n}` : c.code;
    }
    return m;
  }, [meta, lang]);

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
    if (!meta?.lock_own_leader && (meta?.leaders || []).length > 0) {
      s.push({
        key: "leader", icon: UserRound, label: T.fLeader,
        active: leadSel.length > 0,
        display: leadSel.length === 1 ? tl(shortName(leadSel[0])) : String(leadSel.length),
        onClear: () => setLeadSel([]),
        render: () => (
          <OptsFilter searchable opts={meta.leaders} sel={leadSel} onChange={setLeadSel}
            render={(n) => tl(n)} />
        ),
      });
    }
    if ((meta?.cells || []).length > 0) {
      s.push({
        key: "cell", icon: LayoutGrid, label: T.fCell,
        active: cellSel.length > 0,
        display: cellSel.length === 1 ? cellSel[0] : String(cellSel.length),
        onClear: () => setCellSel([]),
        render: () => (
          <OptsFilter searchable opts={(meta.cells || []).map((c) => c.code)}
            sel={cellSel} onChange={setCellSel} render={(c) => cellName[c] || c} />
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
  }, [factorySection, meta, mgrSel, leadSel, cellSel, stSel, supers, supName, cellName, T, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = () => { setMgrSel([]); setLeadSel([]); setCellSel([]); setStSel([]); };

  // ── charts ────────────────────────────────────────────────────────────────
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (!hasData) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setChartsReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [hasData]);

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

  // ── shared bits ───────────────────────────────────────────────────────────
  const lastSynced = fmtDateTime(sync?.last_synced);
  const refreshBtn = (
    <Button size="lg" variant="secondary" loading={running || refreshMut.isPending}
      icon={!(running || refreshMut.isPending) ? <RefreshCw size={14} /> : null}
      onClick={() => refreshMut.mutate()}>
      {/* Button hides its children while `loading` (overlay spinner keeps the
          width stable), so the crawl progress lives in the sync pill instead. */}
      <span className="hidden sm:inline">{T.refresh}</span>
    </Button>
  );

  // The last-synced pill doubles as the live progress feed during the crawl —
  // a 2–4 minute background job with nothing but a spinner reads as frozen.
  const syncPill = running ? (
    <>
      <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {T.refreshing}
      <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
        {sync?.progress_done ?? 0}/{sync?.progress_total || "…"}
      </span>
      {T.syncSheets}
    </>
  ) : (
    <>
      <CalendarClock size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
    </>
  );

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

  const StChip = ({ st, raw }) => (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap"
      style={{ background: hexA(ST_COLORS[st] || C_LOWN, 0.12), color: ST_COLORS[st] || C_LOWN, border: `1px solid ${hexA(ST_COLORS[st] || C_LOWN, 0.3)}` }}
      title={raw || undefined}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ST_COLORS[st] || C_LOWN }} />
      {st === "other" && raw ? raw : stL(st)}
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
  const bodyLoading = hasData && statsQ.isLoading && view === "obzor";

  return (
    <Layout title={T.title}>
      {/* header: title + last-synced + refresh */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{T.title}</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.sub}</p>
          <p className="sm:hidden text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }}>
            {syncPill}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
            {syncPill}
          </span>
          {refreshBtn}
        </div>
      </div>

      {/* sync problems / load failures — before anything else, with a way out */}
      {(sync?.ok === false || loadError) && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: hexA(C_OPEN, 0.1), color: C_OPEN, border: `1px solid ${hexA(C_OPEN, 0.33)}` }}>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="min-w-0">
              {loadError ? T.loadFailed : `${T.syncFailedT}: ${sync?.message || ""}`}
            </span>
          </span>
          {loadError && <Button size="sm" variant="secondary" onClick={() => metaQ.refetch()}>{T.retry}</Button>}
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
      ) : !hasData ? (
        /* never synced (or wiped) — the page's only useful action is the crawl */
        <div className="rounded-2xl p-10 text-center" style={cardStyle}>
          <span className="grid place-items-center w-12 h-12 rounded-2xl mx-auto mb-3" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
            <Megaphone size={22} />
          </span>
          <div className="font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.emptyTitle}</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>{T.emptyNote}</p>
          <div className="flex justify-center">{refreshBtn}</div>
          {running && (
            <p className="text-xs mt-3 tabular-nums" style={{ color: "var(--text-3)" }}>
              {sync?.progress_done ?? 0}/{sync?.progress_total || "…"} {T.syncSheets}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* view tabs — switching WHAT you look at, so tabs semantics */}
          <div className="flex items-center gap-2 mb-3">
            <SegmentedToggle asTabs scrollable ariaLabel={T.title} value={view} onChange={setView}
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
                  value={(kpi?.open ?? 0).toLocaleString("ru-RU")} hint={T.kOpenHint} />
                <Kpi icon={Users2} color={C_WORKERS} label={T.kWorkers}
                  value={(kpi?.workers ?? 0).toLocaleString("ru-RU")} hint={T.kWorkersHint} />
              </div>

              {(kpi?.undated_in_scope || 0) > 0 && (
                <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                  <AlertTriangle size={12} style={{ color: C_DOING }} />
                  {kpi.undated_in_scope.toLocaleString("ru-RU")} {T.undatedNote}
                </p>
              )}

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
                      <tr key={r.leader}>
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
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.open ? C_OPEN : "var(--text-4)" }}>{r.open}</td>
                        <td className="px-3 py-2"><PctCell r={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              )}

              {(leadersQ.data?.unassigned || (leadersQ.data?.undated || 0) > 0) && (
                <div className="space-y-1">
                  {leadersQ.data?.unassigned && (
                    <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                      <AlertTriangle size={12} style={{ color: C_DOING }} />
                      {leadersQ.data.unassigned.total.toLocaleString("ru-RU")} {T.unassigned}
                    </p>
                  )}
                  {(leadersQ.data?.undated || 0) > 0 && (
                    <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                      <AlertTriangle size={12} style={{ color: C_DOING }} />
                      {leadersQ.data.undated.toLocaleString("ru-RU")} {T.undatedNote}
                    </p>
                  )}
                </div>
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
                    minWidth={760} wrap>
                    <thead>
                      <tr>
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
                        <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
                      ) : list.rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap" title={r.d ? undefined : (r.draw || "")}
                            style={{ color: r.d ? "var(--text-2)" : "var(--text-4)" }}>
                            {fmtDate(r.d)}
                          </td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={cellName[r.cell] || r.cell}>{r.cell}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                            {r.leader ? tl(shortName(r.leader)) : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{tl(shortName(r.owner || "")) || "—"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--text-2)", minWidth: 260 }}>
                            <span className="line-clamp-2">{r.text}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap"><StChip st={r.st} raw={r.straw} /></td>
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
      )}

      {/* row detail — the full text one row at a time */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={T.mTitle}
          subtitle={cellName[detail.cell] || detail.cell}
          icon={<Megaphone size={16} />}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>{detail.text}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colDate}</div>
              <div style={{ color: "var(--text-2)" }}>{detail.d ? fmtDate(detail.d) : (detail.draw || "—")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colStatus}</div>
              <StChip st={detail.st} raw={detail.straw} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colOwner}</div>
              <div style={{ color: "var(--text-2)" }}>{tl(detail.owner || "") || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.colLeader}</div>
              <div style={{ color: "var(--text-2)" }}>{detail.leader ? tl(detail.leader) : "—"}</div>
            </div>
            {detail.row_leader && detail.row_leader !== detail.leader && (
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mLeaderRow}</div>
                <div style={{ color: "var(--text-3)" }}>{tl(detail.row_leader)}</div>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{T.mBrig}</div>
              <div style={{ color: "var(--text-2)" }}>{tl(shortName(detail.brigadir || "")) || "—"}</div>
            </div>
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
