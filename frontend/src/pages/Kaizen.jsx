import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Sparkles, RefreshCw, CheckCircle2, Loader2, Circle, AlarmClock,
  Users, ListChecks, CalendarClock, Trophy, ExternalLink, Search, Plug,
  Clock, TrendingUp, FolderKanban, FileText, Tag, UserCheck, UserRound,
  CircleDot, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── palette ────────────────────────────────────────────────────────────────
// Traffic-light status hues from the admin-panel palette:
// done green · in-progress yellow · not-started blue · overdue red.
const C_DONE = "#22c55e", C_PROG = "#eab308", C_TODO = "#3b82f6", C_OVERDUE = "#ef4444";
const BRAND = "#C8973F";          // brand gold — the page accent (mirrors --brand)

// rgba tint (soft chip/badge fills)
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// premium glassy tooltip shared by the page's bar charts (padding · blur · shadow)
const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// Per-project identity emoji, keyed by the stable slug. Colour is unified to the
// brand accent so the project grid reads as one family — not eight loud hues.
const PROJECT_EMOJI = {
  zakreplenie: "📌", shadzinka: "🧩", nastavnich: "🤝", kachestvo: "🎯",
  pokazateli: "📊", standarty: "📐", hansei: "🪞", kormery: "🛠️",
};
const emojiFor = (key) => PROJECT_EMOJI[key] || "📁";

// ── UI copy, 4 platform languages ────────────────────────────────────────────
const TXT = {
  uz: {
    title: "Kaizen loyihalari", subtitle: "Notion'dagi kaizen-sessiya loyihalari tahlili",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…", lastSynced: "Oxirgi sinxron", never: "hech qachon",
    connectTitle: "Notion ulanmagan", connectNote: "Tahlilni ko'rsatish uchun admin Notion integratsiyasini ulashi kerak:",
    step1: "notion.so/my-integrations sahifasida ichki integratsiya yarating",
    step2: "Kaizen hub sahifasini integratsiyaga ulang (Connections)",
    step3: "Tokenni backendga NOTION_TOKEN sifatida qo'shing va qayta ishga tushiring",
    emptyTitle: "Hali ma'lumot yo'q", emptyNote: "Notion'dan tortib olish uchun «Yangilash» tugmasini bosing.",
    kTotal: "Jami vazifa", kDone: "Bajarildi", kProg: "Jarayonda", kTodo: "Boshlanmadi", kOverdue: "Muddati o'tgan", kDonePct: "Bajarilish",
    sDone: "Bajarildi", sProg: "Jarayonda", sTodo: "Boshlanmadi", overdue: "Muddati o'tgan",
    secStatus: "Umumiy holat", secProjects: "Loyihalar kesimida", secPeople: "Mas'ullar yuki",
    secLeaders: "Eng faol ijrochilar", secTypes: "Vazifa turlari", secDeadlines: "Muddatlar", secTasks: "Vazifalar ro'yxati",
    allProjects: "Barcha loyihalar", allStatuses: "Barcha holatlar", searchPh: "Vazifa qidirish…",
    noMatch: "Filtrlarga mos vazifa yo'q", tasksWord: "vazifa", nextDue: "Keyingi muddat", noDeadline: "Muddatsiz",
    dueOverdue: "Muddati o'tgan", dueWeek: "Shu hafta", dueUpcoming: "Yaqin 14 kun", dueNoDate: "Muddatsiz",
    colProject: "Loyiha", colTask: "Vazifa", colType: "Turi", colResp: "Mas'ul", colCustomer: "Buyurtmachi", colDeadline: "Muddat", colStatus: "Holat",
    unassigned: "Belgilanmagan", daysOverdue: "kun kechikdi", people: "ijrochi", openNotion: "Notion'da ochish",
    tasksDone: "bajarildi", completion: "bajarilish",
    hi: "Xush kelibsiz", welcomeSub: "Kaizen loyihalaringizdagi bugungi holat",
    secOverview: "Vazifalar dinamikasi", overviewSub: "Vaqt bo'yicha taqsimot",
    pAll: "Butun davr", p12: "12 oy", p6: "6 oy",
    avgPerProject: "Loyihaga o'rtacha",
    secRecent: "So'nggi vazifalar", recentSub: "Eng yangi qo'shilganlar",
    viewAll: "Barchasi", statusSub: "Holatlar bo'yicha taqsimot",
    completionRate: "Bajarilish darajasi", ofTotal: "umumiydan",
  },
  uz_cyrl: {
    title: "Kaizen лойиҳалари", subtitle: "Notion'даги кайзен-сессия лойиҳалари таҳлили",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", lastSynced: "Охирги синхрон", never: "ҳеч қачон",
    connectTitle: "Notion уланмаган", connectNote: "Таҳлилни кўрсатиш учун админ Notion интеграциясини улаши керак:",
    step1: "notion.so/my-integrations саҳифасида ички интеграция яратинг",
    step2: "Kaizen hub саҳифасини интеграцияга уланг (Connections)",
    step3: "Токенни backendга NOTION_TOKEN сифатида қўшинг ва қайта ишга туширинг",
    emptyTitle: "Ҳали маълумот йўқ", emptyNote: "Notion'дан тортиб олиш учун «Янгилаш» тугмасини босинг.",
    kTotal: "Жами вазифа", kDone: "Бажарилди", kProg: "Жараёнда", kTodo: "Бошланмади", kOverdue: "Муддати ўтган", kDonePct: "Бажарилиш",
    sDone: "Бажарилди", sProg: "Жараёнда", sTodo: "Бошланмади", overdue: "Муддати ўтган",
    secStatus: "Умумий ҳолат", secProjects: "Лойиҳалар кесимида", secPeople: "Масъуллар юки",
    secLeaders: "Энг фаол ижрочилар", secTypes: "Вазифа турлари", secDeadlines: "Муддатлар", secTasks: "Вазифалар рўйхати",
    allProjects: "Барча лойиҳалар", allStatuses: "Барча ҳолатлар", searchPh: "Вазифа қидириш…",
    noMatch: "Филтрларга мос вазифа йўқ", tasksWord: "вазифа", nextDue: "Кейинги муддат", noDeadline: "Муддатсиз",
    dueOverdue: "Муддати ўтган", dueWeek: "Шу ҳафта", dueUpcoming: "Яқин 14 кун", dueNoDate: "Муддатсиз",
    colProject: "Лойиҳа", colTask: "Вазифа", colType: "Тури", colResp: "Масъул", colCustomer: "Буюртмачи", colDeadline: "Муддат", colStatus: "Ҳолат",
    unassigned: "Белгиланмаган", daysOverdue: "кун кечикди", people: "ижрочи", openNotion: "Notion'да очиш",
    tasksDone: "бажарилди", completion: "бажарилиш",
    hi: "Хуш келибсиз", welcomeSub: "Kaizen лойиҳаларингиздаги бугунги ҳолат",
    secOverview: "Вазифалар динамикаси", overviewSub: "Вақт бўйича тақсимот",
    pAll: "Бутун давр", p12: "12 ой", p6: "6 ой",
    avgPerProject: "Лойиҳага ўртача",
    secRecent: "Сўнгги вазифалар", recentSub: "Энг янги қўшилганлар",
    viewAll: "Барчаси", statusSub: "Ҳолатлар бўйича тақсимот",
    completionRate: "Бажарилиш даражаси", ofTotal: "умумийдан",
  },
  ru: {
    title: "Кайзен-проекты", subtitle: "Аналитика проектов кайзен-сессии из Notion",
    refresh: "Обновить", refreshing: "Обновление…", lastSynced: "Синхронизация", never: "никогда",
    connectTitle: "Notion не подключён", connectNote: "Чтобы показать аналитику, админ должен подключить интеграцию Notion:",
    step1: "Создайте внутреннюю интеграцию на notion.so/my-integrations",
    step2: "Подключите страницу-хаб Кайзен к интеграции (Connections)",
    step3: "Добавьте токен в backend как NOTION_TOKEN и перезапустите",
    emptyTitle: "Данных пока нет", emptyNote: "Нажмите «Обновить», чтобы загрузить данные из Notion.",
    kTotal: "Всего задач", kDone: "Выполнено", kProg: "В работе", kTodo: "Не начато", kOverdue: "Просрочено", kDonePct: "Выполнение",
    sDone: "Выполнено", sProg: "В работе", sTodo: "Не начато", overdue: "Просрочено",
    secStatus: "Общий статус", secProjects: "В разрезе проектов", secPeople: "Загрузка ответственных",
    secLeaders: "Самые активные исполнители", secTypes: "Типы задач", secDeadlines: "Сроки", secTasks: "Список задач",
    allProjects: "Все проекты", allStatuses: "Все статусы", searchPh: "Поиск задачи…",
    noMatch: "Нет задач под фильтры", tasksWord: "задач", nextDue: "Ближайший срок", noDeadline: "Без срока",
    dueOverdue: "Просрочено", dueWeek: "На этой неделе", dueUpcoming: "Ближайшие 14 дней", dueNoDate: "Без срока",
    colProject: "Проект", colTask: "Задача", colType: "Тип", colResp: "Ответственный", colCustomer: "Заказчик", colDeadline: "Срок", colStatus: "Статус",
    unassigned: "Не назначен", daysOverdue: "дн. просрочки", people: "исполн.", openNotion: "Открыть в Notion",
    tasksDone: "выполнено", completion: "выполнение",
    hi: "С возвращением", welcomeSub: "Что происходит с вашими Кайзен-проектами сегодня",
    secOverview: "Динамика задач", overviewSub: "Распределение задач по времени",
    pAll: "Весь период", p12: "12 мес.", p6: "6 мес.",
    avgPerProject: "В среднем на проект",
    secRecent: "Недавние задачи", recentSub: "Последние добавленные",
    viewAll: "Все", statusSub: "Распределение по статусам",
    completionRate: "Уровень выполнения", ofTotal: "от общего",
  },
  en: {
    title: "Kaizen Projects", subtitle: "Analytics for the Kaizen-session projects in Notion",
    refresh: "Refresh", refreshing: "Refreshing…", lastSynced: "Last synced", never: "never",
    connectTitle: "Notion not connected", connectNote: "To show analytics, an admin needs to connect the Notion integration:",
    step1: "Create an internal integration at notion.so/my-integrations",
    step2: "Connect the Kaizen hub page to the integration (Connections)",
    step3: "Add the token to the backend as NOTION_TOKEN and restart",
    emptyTitle: "No data yet", emptyNote: "Press “Refresh” to pull the data from Notion.",
    kTotal: "Total tasks", kDone: "Done", kProg: "In progress", kTodo: "Not started", kOverdue: "Overdue", kDonePct: "Completion",
    sDone: "Done", sProg: "In progress", sTodo: "Not started", overdue: "Overdue",
    secStatus: "Overall status", secProjects: "By project", secPeople: "Workload by person",
    secLeaders: "Top performers", secTypes: "Task types", secDeadlines: "Deadlines", secTasks: "Task list",
    allProjects: "All projects", allStatuses: "All statuses", searchPh: "Search task…",
    noMatch: "No tasks match the filters", tasksWord: "tasks", nextDue: "Next due", noDeadline: "No deadline",
    dueOverdue: "Overdue", dueWeek: "This week", dueUpcoming: "Next 14 days", dueNoDate: "No date",
    colProject: "Project", colTask: "Task", colType: "Type", colResp: "Responsible", colCustomer: "Customer", colDeadline: "Deadline", colStatus: "Status",
    unassigned: "Unassigned", daysOverdue: "days overdue", people: "people", openNotion: "Open in Notion",
    tasksDone: "done", completion: "completion",
    hi: "Welcome back", welcomeSub: "Here's what's happening with your Kaizen projects today",
    secOverview: "Task dynamics", overviewSub: "Task distribution over time",
    pAll: "All time", p12: "12 mo", p6: "6 mo",
    avgPerProject: "Avg per project",
    secRecent: "Recent tasks", recentSub: "Latest added",
    viewAll: "View all", statusSub: "Breakdown by status",
    completionRate: "Completion rate", ofTotal: "of total",
  },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Localised short month names → deadlines read as "12 May 2026" (day · month · year)
const MONTHS_SHORT = {
  uz:      ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
  uz_cyrl: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  ru:      ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en:      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const fmtDeadline = (iso, lang) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${(MONTHS_SHORT[lang] || MONTHS_SHORT.en)[m - 1]} ${y}`;
};

// People names → compact "surname-initial + full first name", e.g. "Azimjon Xusanov" → "X. Azimjon".
// Last token is treated as the surname (the majority convention in the Notion data);
// single-word names are returned untouched.
const shortName = (full) => {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return String(full || "");
  const surname = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return `${surname[0].toUpperCase()}. ${first}`;
};

// Notion-style grid rule shared by every table cell (vertical + horizontal lines)
const cellB = { borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" };

// 'YYYY-MM' → short month label (for the activity area chart x-axis)
const monthLabel = (key, opts) => {
  const d = new Date(`${key}-01T00:00:00`);
  if (isNaN(d)) return key;
  return d.toLocaleString(undefined, opts);
};

// status → {label, color, Icon}
function statusInfo(status, T) {
  if (status === "Done") return { label: T.sDone, color: C_DONE, Icon: CheckCircle2 };
  if (status === "In progress") return { label: T.sProg, color: C_PROG, Icon: Loader2 };
  return { label: T.sTodo, color: C_TODO, Icon: Circle };
}

// ── small presentational helpers (mirror Leaders / Trudoyomkost / Production) ──

// Card section header band: uppercase tracked label + brand icon + bottom rule.
function SectionHead({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />}
        {title}
      </div>
      {right}
    </div>
  );
}

function StatusPill({ status, T }) {
  const { label, color } = statusInfo(status, T);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: hexA(color, 0.14), color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}
    </span>
  );
}

// Sort affordance for the task-table headers — matches the Overview table:
// clicking a header cycles asc → desc → off, with neutral chevrons until active.
function SortIcon({ active, dir }) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon size={11} className={active ? "" : "group-hover:opacity-80 transition-opacity"}
    style={{ opacity: active ? 1 : 0.4, color: active ? "var(--brand-text)" : "inherit" }} />;
}

// Sortable, icon-led column header — brand-tinted glyph + label + sort state.
function Th({ icon: Icon, label, k, sort, onSort, cls = "" }) {
  const active = sort.key === k;
  return (
    <th className={`text-left font-medium px-4 py-2 select-none ${cls}`} style={cellB}>
      <button
        type="button" onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1.5 transition-colors"
        style={{ color: active ? "var(--text-1)" : "inherit" }}
      >
        {Icon && <Icon size={12} style={{ color: "var(--brand-text)" }} />}
        <span>{label}</span>
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

// Thin done/progress/todo stacked bar
function MiniBar({ done, prog, todo }) {
  const total = Math.max(done + prog + todo, 1);
  const seg = (n, c) => n > 0 && <div style={{ width: `${(n / total) * 100}%`, background: c }} />;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
      {seg(done, C_DONE)}{seg(prog, C_PROG)}{seg(todo, C_TODO)}
    </div>
  );
}

// Compact dot + count, used as the project-card mini-legend (replaces ✅ ◔ ○ glyphs)
function Tally({ color, n }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{n}
    </span>
  );
}

export default function Kaizen() {
  const { lang } = useLang();
  const { auth } = useAuth();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();
  const T = TXT[lang] || TXT.ru;

  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("12");   // activity-chart window: 6 · 12 · all
  const [sort, setSort] = useState({ key: null, dir: "asc" });  // task-table column sort
  // Click cycles asc → desc → off (original order), mirroring the Overview table.
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" }
      : s.dir === "asc" ? { key: k, dir: "desc" }
      : { key: null, dir: "asc" });

  const { data, isLoading } = useQuery({
    queryKey: ["kaizen"],
    queryFn: () => api.get("/api/kaizen").then((r) => r.data),
  });

  const refresh = useMutation({
    mutationFn: () => api.post("/api/kaizen/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kaizen"] }),
  });

  // ApexCharts measures its container width once at mount. Inside the
  // responsive grid the cells only get their final width a frame or two after
  // the data render lands, so a chart mounted too early gets a collapsed
  // y-axis gutter (names overlap the bars). Hold the charts back until layout
  // has settled, then mount them once at the right width — no global resize
  // nudges, no mid-render redraw flashes.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (isLoading) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setChartsReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [isLoading]);

  const tasks = data?.tasks || [];
  const projects = data?.projects || [];

  // ── analytics ──────────────────────────────────────────────────────────────
  const A = useMemo(() => {
    const today = todayStr();
    const isOverdue = (t) => t.deadline && t.deadline < today && t.status !== "Done";
    const blank = () => ({ total: 0, done: 0, prog: 0, todo: 0, overdue: 0 });
    const bump = (o, t) => {
      o.total++;
      if (t.status === "Done") o.done++;
      else if (t.status === "In progress") o.prog++;
      else o.todo++;
      if (isOverdue(t)) o.overdue++;
    };

    const totals = blank();
    const byProjectMap = {};
    const byPerson = {};
    const byType = {};
    for (const p of projects) byProjectMap[p.key] = { ...p, ...blank(), nextDue: null };

    for (const t of tasks) {
      bump(totals, t);
      const bp = byProjectMap[t.project_key] || (byProjectMap[t.project_key] = { key: t.project_key, name: t.project, ...blank(), nextDue: null });
      bump(bp, t);
      if (t.deadline && t.status !== "Done" && (!bp.nextDue || t.deadline < bp.nextDue)) bp.nextDue = t.deadline;

      const people = t.responsible?.length ? t.responsible : ["—"];
      for (const name of people) bump(byPerson[name] || (byPerson[name] = { name, ...blank() }), t);

      const ty = t.task_type || "—";
      bump(byType[ty] || (byType[ty] = { type: ty, ...blank() }), t);
    }

    const byProject = projects.map((p) => byProjectMap[p.key]).filter(Boolean);
    const people = Object.values(byPerson).sort((a, b) => b.total - a.total);
    const types = Object.values(byType).sort((a, b) => b.total - a.total);
    const leaders = [...Object.values(byPerson)].filter((p) => p.name !== "—" && p.done > 0)
      .sort((a, b) => b.done - a.done || b.total - a.total).slice(0, 5);

    const overdueTasks = tasks.filter(isOverdue)
      .map((t) => ({ ...t, late: daysBetween(today, t.deadline) }))
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
    const dueWeek = tasks.filter((t) => t.deadline && t.status !== "Done" && t.deadline >= today && daysBetween(t.deadline, today) <= 7).length;
    const dueUpcoming = tasks.filter((t) => t.deadline && t.status !== "Done" && t.deadline >= today && daysBetween(t.deadline, today) <= 14).length;
    const noDate = tasks.filter((t) => !t.deadline && t.status !== "Done").length;
    const donePct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

    // Activity timeline — tasks bucketed by month (deadline, else created date).
    // Feeds the headline area chart (the "Revenue Overview" analog).
    const monthMap = {};
    for (const t of tasks) {
      const ref = t.deadline || (t.created_time ? t.created_time.slice(0, 10) : null);
      if (!ref || ref.length < 7) continue;
      const key = ref.slice(0, 7);
      const m = monthMap[key] || (monthMap[key] = { key, count: 0, done: 0 });
      m.count++;
      if (t.status === "Done") m.done++;
    }
    const months = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key));

    // Most recently added tasks (the "Recent Bookings" analog).
    const recent = [...tasks]
      .sort((a, b) => (b.created_time || "").localeCompare(a.created_time || ""))
      .slice(0, 7);

    const projectCount = byProject.length || projects.length || 0;
    const avgPerProject = projectCount ? Math.round(totals.total / projectCount) : 0;

    return { totals, donePct, byProject, people, types, leaders, overdueTasks, dueWeek, dueUpcoming, noDate, months, recent, avgPerProject, peopleCount: Object.keys(byPerson).filter((n) => n !== "—").length };
  }, [tasks, projects]);

  // ── filtered table ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (project !== "all" && t.project_key !== project) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q) {
        const hay = `${tl(t.title)} ${t.title} ${(t.responsible || []).map(tl).join(" ")} ${(t.customer || []).map(tl).join(" ")} ${tl(t.task_type || "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, project, status, search, tl]);

  // Sorted view of the task table — string-compared per column, deadlines last.
  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const val = (t) => {
      switch (sort.key) {
        case "project":  return tl(t.project || "");
        case "task":     return t.title || "";
        case "type":     return tl(t.task_type || "");
        case "resp":     return (t.responsible || []).map(tl).join(", ");
        case "customer": return (t.customer || []).map(tl).join(", ");
        case "deadline": return t.deadline || "";
        case "status":   return statusInfo(t.status, T).label;
        default:         return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (sort.key === "deadline") {          // undated tasks always sink to the bottom
        if (!va && !vb) return 0;
        if (!va) return 1;
        if (!vb) return -1;
      }
      return va.localeCompare(vb, undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, tl, T]);

  // ── charts ───────────────────────────────────────────────────────────────────
  const gaugeOpts = {
    chart: { type: "radialBar", sparkline: { enabled: true }, fontFamily: "inherit", animations: { enabled: false } },
    plotOptions: { radialBar: {
      hollow: { size: "60%" },
      track: { background: "var(--bg-inner)" },
      dataLabels: {
        name: { offsetY: 22, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, fontSize: "26px", fontWeight: 700, color: "var(--text-1)", formatter: (v) => `${Math.round(v)}%` },
      },
    } },
    fill: { type: "solid", colors: [BRAND] },
    stroke: { lineCap: "round" },
    labels: [T.kDonePct],
  };

  // Status donut with a hollow centre total + side legend (the
  // "Technician Availability" analog). Per-slice labels are off; the legend
  // beside the ring carries the colour → label → count mapping.
  const donutOpts = {
    chart: { type: "donut", fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    labels: [T.sDone, T.sProg, T.sTodo],
    colors: [C_DONE, C_PROG, C_TODO],
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${T.tasksWord}` } },
    plotOptions: { pie: { donut: {
      size: "72%",
      labels: {
        show: true,
        name: { offsetY: 20, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, color: "var(--text-1)", fontSize: "28px", fontWeight: 700 },
        total: { show: true, label: T.kTotal, color: legendColor, fontSize: "11px", formatter: () => String(A.totals.total) },
      },
    } } },
  };

  // Headline activity area chart (the "Revenue Overview" analog), windowed by
  // the period selector. Smooth gold gradient over the monthly task buckets.
  const shownMonths = period === "all" ? A.months : A.months.slice(-Number(period));
  const areaOpts = {
    chart: { type: "area", toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    theme: chartTheme,
    colors: [BRAND],
    stroke: { curve: "smooth", width: 2.5 },
    fill: { type: "solid", opacity: 0.15 },
    dataLabels: { enabled: false },
    xaxis: {
      categories: shownMonths.map((m) => monthLabel(m.key, { month: "short" })),
      labels: { style: { colors: labelColor, fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    markers: { size: 0, hover: { size: 5 } },
    tooltip: { custom: ({ dataPointIndex }) => tipHTML(monthLabel(shownMonths[dataPointIndex]?.key, { month: "long", year: "numeric" }) ?? "", `${shownMonths[dataPointIndex]?.count ?? 0} ${T.tasksWord}`, BRAND) },
  };
  const areaSeries = [{ name: T.tasksWord, data: shownMonths.map((m) => m.count) }];

  const topPeople = A.people.slice(0, 10);
  const peopleOpts = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "inherit", animations: { enabled: false } },
    theme: chartTheme,
    plotOptions: { bar: { horizontal: true, barHeight: "62%", borderRadius: 3 } },
    colors: [C_DONE, C_PROG, C_TODO],
    xaxis: { categories: topPeople.map((p) => tl(p.name === "—" ? T.unassigned : p.name)), min: 0, labels: { style: { colors: labelColor, fontSize: "11px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" } } },
    legend: { position: "top", labels: { colors: legendColor }, markers: { width: 10, height: 10, radius: 3 } },
    dataLabels: { enabled: false },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: { theme: tooltipTheme },
    stroke: { width: 0 },
  };
  const peopleSeries = [
    { name: T.sDone, data: topPeople.map((p) => p.done) },
    { name: T.sProg, data: topPeople.map((p) => p.prog) },
    { name: T.sTodo, data: topPeople.map((p) => p.todo) },
  ];

  const topTypes = A.types.slice(0, 8);
  const typeCats = topTypes.map((t) => tl(t.type === "—" ? "—" : t.type));
  const typeOpts = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", animations: { enabled: false } },
    theme: chartTheme,
    plotOptions: { bar: { horizontal: true, barHeight: "58%", borderRadius: 4, borderRadiusApplication: "end" } },
    colors: [BRAND],
    fill: { type: "gradient", gradient: { type: "horizontal", gradientToColors: [mix(BRAND, -0.22)], inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    xaxis: { categories: typeCats, labels: { style: { colors: labelColor, fontSize: "11px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 220 } },
    legend: { show: false },
    dataLabels: { enabled: true, style: { colors: ["#1a1208"], fontSize: "11px", fontWeight: 600 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    tooltip: { custom: ({ dataPointIndex }) => tipHTML(typeCats[dataPointIndex] ?? "", `${topTypes[dataPointIndex].total} ${T.tasksWord}`, BRAND) },
  };
  const typeSeries = [{ name: T.tasksWord, data: topTypes.map((t) => t.total) }];

  const lastSynced = fmtDateTime(data?.last_synced);
  const canRefresh = data?.can_refresh;
  const medals = ["🥇", "🥈", "🥉", "🏅", "🏅"];

  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

  const refreshBtn = canRefresh && (
    <button
      onClick={() => refresh.mutate()}
      disabled={refresh.isPending}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity"
      style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: refresh.isPending ? 0.6 : 1 }}
    >
      <RefreshCw size={14} className={refresh.isPending ? "animate-spin" : ""} />
      {refresh.isPending ? T.refreshing : T.refresh}
    </button>
  );

  // First name for the personalised greeting banner.
  const firstName = (auth?.full_name || "").trim().split(/\s+/)[0] || "";

  // "View all" jumps to the full task table at the bottom of the page.
  const scrollToTable = () => document.getElementById("kaizen-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const viewAllBtn = (
    <button onClick={scrollToTable}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
      {T.viewAll}
    </button>
  );

  const periodOpts = [
    { value: "6", label: T.p6 },
    { value: "12", label: T.p12 },
    { value: "all", label: T.pAll },
  ];

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title={T.title} showFilters={false}>
      {/* Welcome banner: personalised greeting + last-synced chip + refresh */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>
            {T.hi}{firstName && <>, <span style={{ color: "var(--brand-text)" }}>{tl(firstName)}</span></>} 👋
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.welcomeSub}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
            <CalendarClock size={14} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </span>
          {refreshBtn}
        </div>
      </div>

      {refresh.isError && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4" style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
          {refresh.error?.response?.data?.detail || String(refresh.error)}
        </div>
      )}

      {isLoading ? (
        // ── skeleton scaffold (shape-of-content, per the loader convention) ──
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl px-4 py-3.5" style={cardStyle}>
                <SkeletonBlock className="h-3 w-16 mb-3" /><SkeletonBlock className="h-6 w-12" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-56" /></div>
            <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-56" /></div>
          </div>
        </div>
      ) : data && data.configured === false ? (
        // ── Not connected ──
        <div className="rounded-2xl overflow-hidden max-w-xl" style={cardStyle}>
          <SectionHead icon={Plug} title={T.connectTitle} />
          <div className="p-4">
            <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{T.connectNote}</p>
            <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: "var(--text-2)" }}>
              <li>{T.step1}</li><li>{T.step2}</li><li>{T.step3}</li>
            </ol>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        // ── Connected but empty ──
        <div className="rounded-2xl p-10 text-center" style={cardStyle}>
          <span className="grid place-items-center w-12 h-12 rounded-2xl mx-auto mb-3" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
            <Sparkles size={22} />
          </span>
          <div className="font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.emptyTitle}</div>
          <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>{T.emptyNote}</p>
          <div className="flex justify-center">{refreshBtn}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Hero: activity overview (area) + status donut with side legend ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Activity overview — the "Revenue Overview" analog */}
            <div className="lg:col-span-2 rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
              <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.secOverview}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{T.overviewSub}</div>
                </div>
                <StyledSelect value={period} onChange={setPeriod} options={periodOpts} className="w-32" />
              </div>
              <div className="px-4 pt-3">
                <div className="flex items-end gap-2.5 flex-wrap">
                  <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{A.totals.total}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mb-0.5" style={{ background: hexA(C_DONE, 0.14), color: C_DONE }}>
                    <TrendingUp size={12} /> {A.donePct}% {T.completion}
                  </span>
                </div>
              </div>
              <div className="px-1">
                {shownMonths.length === 0
                  ? <div className="h-[206px] grid place-items-center text-xs" style={{ color: "var(--text-4)" }}>—</div>
                  : chartsReady
                    ? <ReactApexChart options={areaOpts} series={areaSeries} type="area" height={206} />
                    : <div style={{ height: 206 }} />}
              </div>
              {/* Two inline sub-stat cells (mirrors Total Revenue · Avg Booking Value) */}
              <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-1 mt-auto">
                <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{T.kDone}</div>
                  <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{A.totals.done}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: C_DONE }}>{A.donePct}% {T.completion}</div>
                </div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{T.avgPerProject}</div>
                  <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{A.avgPerProject}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>{A.byProject.length} · {T.tasksWord}</div>
                </div>
              </div>
            </div>

            {/* Status donut + side legend — the "Technician Availability" analog */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={ListChecks} title={T.secStatus} right={viewAllBtn} />
              <div className="p-4 flex flex-col items-center gap-3">
                {chartsReady
                  ? <ReactApexChart options={donutOpts} series={[A.totals.done, A.totals.prog, A.totals.todo]} type="donut" height={200} />
                  : <div style={{ height: 200 }} />}
                <div className="w-full space-y-2.5">
                  {[
                    { label: T.sDone, color: C_DONE, n: A.totals.done },
                    { label: T.sProg, color: C_PROG, n: A.totals.prog },
                    { label: T.sTodo, color: C_TODO, n: A.totals.todo },
                    { label: T.overdue, color: C_OVERDUE, n: A.totals.overdue },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                      <span className="flex-1 truncate" style={{ color: "var(--text-2)" }}>{r.label}</span>
                      <span className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{r.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Four KPI stat cards (the bookings-stats row) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Loader2,      label: T.kProg,    value: A.totals.prog,    accent: C_PROG },
              { icon: Circle,       label: T.kTodo,    value: A.totals.todo,    accent: C_TODO },
              { icon: CheckCircle2, label: T.kDone,    value: A.totals.done,    accent: C_DONE },
              { icon: AlarmClock,   label: T.kOverdue, value: A.totals.overdue, accent: C_OVERDUE },
            ].map(({ icon: Icon, label, value, accent }) => {
              const pct = A.totals.total ? Math.round((value / A.totals.total) * 100) : 0;
              return (
                <div key={label} className="rounded-2xl p-4" style={cardStyle}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="grid place-items-center w-9 h-9 rounded-xl flex-shrink-0" style={{ background: hexA(accent, 0.14), color: accent }}>
                      <Icon size={17} />
                    </span>
                    <span className="text-xs font-medium truncate" style={{ color: "var(--text-2)" }}>{label}</span>
                  </div>
                  <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{value}</div>
                  <div className="text-[11px] mt-2 flex items-center gap-1" style={{ color: accent }}>
                    <TrendingUp size={12} /> {pct}% {T.ofTotal}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Completion gauge + recent tasks (lead-conversion / recent-bookings) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Completion card — the "Lead Conversion" analog */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Trophy} title={T.kDonePct} />
              <div className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: "var(--brand-text)" }}>{A.totals.total}</div>
                  <div className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{T.kTotal}</div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{T.completionRate}</div>
                  <div className="text-xl font-bold tabular-nums flex items-center gap-1.5" style={{ color: C_DONE }}>
                    {A.donePct}%
                    <span className="text-[11px] font-normal" style={{ color: "var(--text-4)" }}>{A.totals.done}/{A.totals.total}</span>
                  </div>
                </div>
                <div className="w-28 flex-shrink-0">
                  {chartsReady
                    ? <ReactApexChart options={gaugeOpts} series={[A.donePct]} type="radialBar" height={150} />
                    : <div style={{ height: 150 }} />}
                </div>
              </div>
            </div>

            {/* Recent tasks — the "Recent Bookings" analog */}
            <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Clock} title={T.secRecent} right={viewAllBtn} />
              <div className="px-2 py-1">
                {A.recent.map((t, i) => {
                  const overdue = t.deadline && t.deadline < todayStr() && t.status !== "Done";
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-2 py-2.5" style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                      <span className="grid place-items-center w-9 h-9 rounded-full text-base flex-shrink-0" style={{ background: "var(--brand-bg)" }} title={tl(t.project)}>
                        {emojiFor(t.project_key)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }} title={t.title}>{t.title}</div>
                        <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                          {t.task_type ? tl(t.task_type) : tl(t.project)}
                          {t.responsible?.length ? ` · ${t.responsible.map(tl).join(", ")}` : ""}
                        </div>
                      </div>
                      <span className="text-[11px] tabular-nums hidden sm:block flex-shrink-0" style={{ color: overdue ? C_OVERDUE : "var(--text-4)" }}>{fmtDeadline(t.deadline, lang) || "—"}</span>
                      <StatusPill status={t.status} T={T} />
                    </div>
                  );
                })}
                {A.recent.length === 0 && <div className="px-2 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>—</div>}
              </div>
            </div>
          </div>

          {/* By project */}
          <section>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>
              <ListChecks size={14} style={{ color: "var(--brand-text)" }} /> {T.secProjects}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {A.byProject.map((p) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                const active = project === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setProject(active ? "all" : p.key)}
                    className="text-left rounded-2xl p-4 transition-all"
                    style={{ background: "var(--bg-card)", border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`, boxShadow: active ? "0 0 0 1px var(--brand)" : "none" }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg leading-none">{emojiFor(p.key)}</span>
                        <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={tl(p.name)}>{tl(p.name)}</span>
                      </div>
                      {p.overdue > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: hexA(C_OVERDUE, 0.14), color: C_OVERDUE }}>
                          {p.overdue} {T.overdue.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-end justify-between mb-1.5">
                      <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--brand-text)" }}>{pct}%</span>
                      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{p.total} {T.tasksWord}</span>
                    </div>
                    <MiniBar done={p.done} prog={p.prog} todo={p.todo} />
                    <div className="flex items-center justify-between text-[10px] mt-2" style={{ color: "var(--text-3)" }}>
                      <span className="flex items-center gap-2">
                        <Tally color={C_DONE} n={p.done} /><Tally color={C_PROG} n={p.prog} /><Tally color={C_TODO} n={p.todo} />
                      </span>
                      <span style={{ color: "var(--text-4)" }}>{p.nextDue ? `${T.nextDue}: ${fmtDeadline(p.nextDue, lang)}` : T.noDeadline}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* People + leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Users} title={T.secPeople} />
              <div className="px-3 pb-3 pt-1">
                {topPeople.length > 0 && (chartsReady
                  ? <ReactApexChart options={peopleOpts} series={peopleSeries} type="bar" height={Math.max(220, topPeople.length * 34)} />
                  : <div style={{ height: Math.max(220, topPeople.length * 34) }} />)}
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Trophy} title={T.secLeaders} />
              <div className="p-4 space-y-2.5">
                {A.leaders.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(p.name)}</div>
                      <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(p.done / (A.leaders[0]?.done || 1)) * 100}%`, background: BRAND }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: "var(--brand-text)" }}>{p.done}</span>
                  </div>
                ))}
                {A.leaders.length === 0 && <div className="text-xs" style={{ color: "var(--text-4)" }}>—</div>}
              </div>
            </div>
          </div>

          {/* Task types + deadlines */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={ListChecks} title={T.secTypes} />
              <div className="px-3 pb-3 pt-1">
                {topTypes.length > 0 && (chartsReady
                  ? <ReactApexChart options={typeOpts} series={typeSeries} type="bar" height={Math.max(200, topTypes.length * 36)} />
                  : <div style={{ height: Math.max(200, topTypes.length * 36) }} />)}
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={CalendarClock} title={T.secDeadlines} />
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: T.dueOverdue, value: A.totals.overdue, color: C_OVERDUE },
                    { label: T.dueWeek, value: A.dueWeek, color: "#f59e0b" },
                    { label: T.dueUpcoming, value: A.dueUpcoming, color: C_PROG },
                    { label: T.dueNoDate, value: A.noDate, color: C_TODO },
                  ].map((b) => (
                    <div key={b.label} className="rounded-xl p-2.5" style={{ background: "var(--bg-inner)" }}>
                      <div className="text-xl font-bold tabular-nums" style={{ color: b.color }}>{b.value}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{b.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {A.overdueTasks.slice(0, 12).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C_OVERDUE }} />
                      <span className="flex-1 truncate" style={{ color: "var(--text-2)" }} title={t.title}>{t.title}</span>
                      <span className="flex-shrink-0 font-semibold tabular-nums" style={{ color: C_OVERDUE }}>{t.late} {T.daysOverdue}</span>
                    </div>
                  ))}
                  {A.overdueTasks.length === 0 && <div className="text-[11px]" style={{ color: "var(--text-4)" }}>—</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Task table */}
          <section id="kaizen-tasks" className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead icon={ListChecks}
              title={<span className="flex items-center gap-2">{T.secTasks}<span className="text-[11px] font-normal normal-case tracking-normal" style={{ color: "var(--text-4)" }}>({filtered.length})</span></span>}
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
                    <input
                      value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.searchPh}
                      className="pl-8 pr-3 py-1.5 rounded-lg text-xs w-44 outline-none"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    />
                  </div>
                  <StyledSelect value={project} onChange={setProject} className="w-44"
                    options={[{ value: "all", label: T.allProjects }, ...projects.map((p) => ({ value: p.key, label: `${emojiFor(p.key)} ${tl(p.name)}` }))]} />
                  <StyledSelect value={status} onChange={setStatus} className="w-36"
                    options={[
                      { value: "all", label: T.allStatuses },
                      { value: "Done", label: T.sDone },
                      { value: "In progress", label: T.sProg },
                      { value: "Not started", label: T.sTodo },
                    ]} />
                </div>
              } />
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                    <Th icon={FolderKanban} label={T.colProject}  k="project"  sort={sort} onSort={onSort} />
                    <Th icon={FileText}     label={T.colTask}     k="task"     sort={sort} onSort={onSort} />
                    <Th icon={Tag}          label={T.colType}     k="type"     sort={sort} onSort={onSort} cls="hidden md:table-cell" />
                    <Th icon={UserCheck}    label={T.colResp}     k="resp"     sort={sort} onSort={onSort} cls="hidden sm:table-cell" />
                    <Th icon={UserRound}    label={T.colCustomer} k="customer" sort={sort} onSort={onSort} cls="hidden lg:table-cell" />
                    <Th icon={CalendarClock} label={T.colDeadline} k="deadline" sort={sort} onSort={onSort} />
                    <Th icon={CircleDot}    label={T.colStatus}   k="status"   sort={sort} onSort={onSort} />
                    <th className="px-2 py-2" style={{ borderBottom: "1px solid var(--border)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => {
                    const overdue = t.deadline && t.deadline < todayStr() && t.status !== "Done";
                    return (
                      <tr key={t.id}>
                        <td className="px-4 py-2 whitespace-nowrap" style={cellB}><span title={tl(t.project)}>{emojiFor(t.project_key)}</span></td>
                        <td className="px-4 py-2 max-w-xs" style={cellB}><span className="line-clamp-2" style={{ color: "var(--text-1)" }}>{t.title}</span></td>
                        <td className="px-4 py-2 hidden md:table-cell" style={{ ...cellB, color: "var(--text-3)" }}>{t.task_type ? tl(t.task_type) : "—"}</td>
                        <td className="px-4 py-2 hidden sm:table-cell" style={{ ...cellB, color: "var(--text-2)" }}>
                          {t.responsible?.length ? <span title={t.responsible.map(tl).join(", ")}>{t.responsible.map((n) => shortName(tl(n))).join(", ")}</span> : <span style={{ color: "var(--text-4)" }}>{T.unassigned}</span>}
                        </td>
                        <td className="px-4 py-2 hidden lg:table-cell" style={{ ...cellB, color: "var(--text-2)" }}>
                          {t.customer?.length ? <span title={t.customer.map(tl).join(", ")}>{t.customer.map((n) => shortName(tl(n))).join(", ")}</span> : <span style={{ color: "var(--text-4)" }}>{T.unassigned}</span>}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap tabular-nums" style={{ ...cellB, color: overdue ? C_OVERDUE : "var(--text-3)" }}>{fmtDeadline(t.deadline, lang) || "—"}</td>
                        <td className="px-4 py-2" style={cellB}><StatusPill status={t.status} T={T} /></td>
                        <td className="px-2 py-2 text-center" style={{ borderBottom: "1px solid var(--border)" }}>
                          {t.url && <a href={t.url} target="_blank" rel="noreferrer" title={T.openNotion} className="inline-flex transition-colors hover:text-[var(--brand-text)]" style={{ color: "var(--text-4)" }}><ExternalLink size={13} /></a>}
                        </td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
}
