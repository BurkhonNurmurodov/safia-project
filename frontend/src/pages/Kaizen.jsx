import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Sparkles, RefreshCw, CheckCircle2, Loader2, Circle, AlarmClock,
  Users, ListChecks, CalendarClock, Trophy, ExternalLink, Search, Plug,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── palette ────────────────────────────────────────────────────────────────
const C_DONE = "#22c55e", C_PROG = "#3b82f6", C_TODO = "#94a3b8", C_OVERDUE = "#ef4444";

// Per-project visual identity (emoji + accent hue), keyed by the stable slug.
const PROJECT_META = {
  zakreplenie: { emoji: "📌", color: "#6366f1" },
  shadzinka:   { emoji: "🧩", color: "#06b6d4" },
  nastavnich:  { emoji: "🤝", color: "#f59e0b" },
  kachestvo:   { emoji: "🎯", color: "#ec4899" },
  pokazateli:  { emoji: "📊", color: "#10b981" },
  standarty:   { emoji: "📐", color: "#8b5cf6" },
  hansei:      { emoji: "🪞", color: "#0ea5e9" },
  kormery:     { emoji: "🛠️", color: "#ef8a3c" },
};
const metaFor = (key) => PROJECT_META[key] || { emoji: "📁", color: "#64748b" };

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
    colProject: "Loyiha", colTask: "Vazifa", colType: "Turi", colResp: "Mas'ul", colDeadline: "Muddat", colStatus: "Holat",
    unassigned: "Belgilanmagan", daysOverdue: "kun kechikdi", people: "ijrochi", openNotion: "Notion'da ochish",
    tasksDone: "bajarildi", completion: "bajarilish",
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
    colProject: "Лойиҳа", colTask: "Вазифа", colType: "Тури", colResp: "Масъул", colDeadline: "Муддат", colStatus: "Ҳолат",
    unassigned: "Белгиланмаган", daysOverdue: "кун кечикди", people: "ижрочи", openNotion: "Notion'да очиш",
    tasksDone: "бажарилди", completion: "бажарилиш",
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
    colProject: "Проект", colTask: "Задача", colType: "Тип", colResp: "Ответственный", colDeadline: "Срок", colStatus: "Статус",
    unassigned: "Не назначен", daysOverdue: "дн. просрочки", people: "исполн.", openNotion: "Открыть в Notion",
    tasksDone: "выполнено", completion: "выполнение",
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
    colProject: "Project", colTask: "Task", colType: "Type", colResp: "Responsible", colDeadline: "Deadline", colStatus: "Status",
    unassigned: "Unassigned", daysOverdue: "days overdue", people: "people", openNotion: "Open in Notion",
    tasksDone: "done", completion: "completion",
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

// status → {label, color, Icon}
function statusInfo(status, T) {
  if (status === "Done") return { label: T.sDone, color: C_DONE, Icon: CheckCircle2 };
  if (status === "In progress") return { label: T.sProg, color: C_PROG, Icon: Loader2 };
  return { label: T.sTodo, color: C_TODO, Icon: Circle };
}

// ── small presentational helpers ─────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a`, color }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{value}</div>
        <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{label}</div>
        {sub != null && <div className="text-[10px]" style={{ color }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status, T }) {
  const { label, color } = statusInfo(status, T);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${color}1f`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{label}
    </span>
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

export default function Kaizen() {
  const { auth } = useAuth();
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();
  const T = TXT[lang] || TXT.ru;

  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["kaizen"],
    queryFn: () => api.get("/api/kaizen").then((r) => r.data),
  });

  const refresh = useMutation({
    mutationFn: () => api.post("/api/kaizen/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kaizen"] }),
  });

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

    return { totals, donePct, byProject, people, types, leaders, overdueTasks, dueWeek, dueUpcoming, noDate, peopleCount: Object.keys(byPerson).filter((n) => n !== "—").length };
  }, [tasks, projects]);

  // ── filtered table ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (project !== "all" && t.project_key !== project) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q) {
        const hay = `${tl(t.title)} ${t.title} ${(t.responsible || []).map(tl).join(" ")} ${tl(t.task_type || "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, project, status, search, tl]);

  // ── charts ───────────────────────────────────────────────────────────────────
  const gaugeOpts = {
    chart: { type: "radialBar", sparkline: { enabled: true } },
    plotOptions: { radialBar: {
      hollow: { size: "60%" },
      track: { background: "var(--bg-inner)" },
      dataLabels: {
        name: { offsetY: 22, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, fontSize: "26px", fontWeight: 700, color: "var(--text-1)", formatter: (v) => `${Math.round(v)}%` },
      },
    } },
    fill: { colors: [C_DONE] },
    stroke: { lineCap: "round" },
    labels: [T.kDonePct],
  };

  const donutOpts = {
    chart: { type: "donut" },
    labels: [T.sDone, T.sProg, T.sTodo],
    colors: [C_DONE, C_PROG, C_TODO],
    legend: { position: "bottom", labels: { colors: legendColor }, fontSize: "12px" },
    dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%`, style: { fontSize: "11px" } },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme },
    plotOptions: { pie: { donut: { size: "62%" } } },
  };

  const topPeople = A.people.slice(0, 10);
  const peopleOpts = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "inherit" },
    theme: chartTheme,
    plotOptions: { bar: { horizontal: true, barHeight: "62%", borderRadius: 3 } },
    colors: [C_DONE, C_PROG, C_TODO],
    xaxis: { categories: topPeople.map((p) => tl(p.name === "—" ? T.unassigned : p.name)), labels: { style: { colors: labelColor, fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" } } },
    legend: { position: "top", labels: { colors: legendColor } },
    dataLabels: { enabled: false },
    grid: { borderColor: "var(--border)" },
    tooltip: { theme: tooltipTheme },
    stroke: { width: 0 },
  };
  const peopleSeries = [
    { name: T.sDone, data: topPeople.map((p) => p.done) },
    { name: T.sProg, data: topPeople.map((p) => p.prog) },
    { name: T.sTodo, data: topPeople.map((p) => p.todo) },
  ];

  const topTypes = A.types.slice(0, 8);
  const typeOpts = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    theme: chartTheme,
    plotOptions: { bar: { horizontal: true, barHeight: "58%", borderRadius: 4, distributed: true } },
    colors: ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#0ea5e9", "#ef8a3c"],
    xaxis: { categories: topTypes.map((t) => tl(t.type === "—" ? "—" : t.type)), labels: { style: { colors: labelColor, fontSize: "11px" } } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 220 } },
    legend: { show: false },
    dataLabels: { enabled: true, style: { colors: ["#fff"], fontSize: "11px" } },
    grid: { borderColor: "var(--border)" },
    tooltip: { theme: tooltipTheme },
  };
  const typeSeries = [{ name: T.tasksWord, data: topTypes.map((t) => t.total) }];

  const lastSynced = fmtDateTime(data?.last_synced);
  const canRefresh = data?.can_refresh;
  const medals = ["🥇", "🥈", "🥉", "🏅", "🏅"];

  const refreshBtn = canRefresh && (
    <button
      onClick={() => refresh.mutate()}
      disabled={refresh.isPending}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
      style={{ background: "var(--brand)", color: "#fff" }}
    >
      <RefreshCw size={15} className={refresh.isPending ? "animate-spin" : ""} />
      {refresh.isPending ? T.refreshing : T.refresh}
    </button>
  );

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{T.title}</h1>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-right" style={{ color: "var(--text-4)" }}>
              {T.lastSynced}<br /><span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
            </div>
            {refreshBtn}
          </div>
        </div>

        {refresh.isError && (
          <div className="rounded-xl px-4 py-2.5 text-xs" style={{ background: "#ef44441a", color: "#ef4444", border: "1px solid #ef444455" }}>
            {refresh.error?.response?.data?.detail || String(refresh.error)}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-24" style={{ color: "var(--text-3)" }}>
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : data && data.configured === false ? (
          // ── Not connected ──
          <div className="rounded-2xl p-6 max-w-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: "var(--text-1)" }}>
              <Plug size={18} /><span className="font-semibold">{T.connectTitle}</span>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-3)" }}>{T.connectNote}</p>
            <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: "var(--text-2)" }}>
              <li>{T.step1}</li><li>{T.step2}</li><li>{T.step3}</li>
            </ol>
          </div>
        ) : tasks.length === 0 ? (
          // ── Connected but empty ──
          <div className="rounded-2xl p-8 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="text-4xl mb-2">🌱</div>
            <div className="font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.emptyTitle}</div>
            <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>{T.emptyNote}</p>
            <div className="flex justify-center">{refreshBtn}</div>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Kpi icon={ListChecks}   label={T.kTotal}   value={A.totals.total}      color="#6366f1" />
              <Kpi icon={CheckCircle2} label={T.kDone}     value={A.totals.done}       color={C_DONE} sub={`${A.donePct}% ${T.completion}`} />
              <Kpi icon={Loader2}      label={T.kProg}     value={A.totals.prog}       color={C_PROG} />
              <Kpi icon={Circle}       label={T.kTodo}     value={A.totals.todo}       color={C_TODO} />
              <Kpi icon={AlarmClock}   label={T.kOverdue}  value={A.totals.overdue}    color={C_OVERDUE} />
              <Kpi icon={Users}        label={T.secPeople} value={A.peopleCount}       color="#0ea5e9" sub={T.people} />
            </div>

            {/* Status overview: gauge + donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.kDonePct}</div>
                <ReactApexChart options={gaugeOpts} series={[A.donePct]} type="radialBar" height={230} />
              </div>
              <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-1)" }}>{T.secStatus}</div>
                <ReactApexChart options={donutOpts} series={[A.totals.done, A.totals.prog, A.totals.todo]} type="donut" height={230} />
              </div>
            </div>

            {/* By project */}
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                <ListChecks size={16} /> {T.secProjects}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {A.byProject.map((p) => {
                  const m = metaFor(p.key);
                  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                  const active = project === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setProject(active ? "all" : p.key)}
                      className="text-left rounded-2xl p-4 transition-all"
                      style={{ background: "var(--bg-card)", border: `1px solid ${active ? m.color : "var(--border)"}`, boxShadow: active ? `0 0 0 1px ${m.color}` : "none" }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg leading-none">{m.emoji}</span>
                          <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={tl(p.name)}>{tl(p.name)}</span>
                        </div>
                        {p.overdue > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${C_OVERDUE}1f`, color: C_OVERDUE }}>
                            {p.overdue} {T.overdue.toLowerCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-end justify-between mb-1.5">
                        <span className="text-2xl font-bold" style={{ color: m.color }}>{pct}%</span>
                        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{p.total} {T.tasksWord}</span>
                      </div>
                      <MiniBar done={p.done} prog={p.prog} todo={p.todo} />
                      <div className="flex items-center justify-between text-[10px] mt-1.5" style={{ color: "var(--text-4)" }}>
                        <span>✅ {p.done} · ◔ {p.prog} · ○ {p.todo}</span>
                        <span>{p.nextDue ? `${T.nextDue}: ${p.nextDue}` : T.noDeadline}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* People + leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  <Users size={16} /> {T.secPeople}
                </h2>
                {topPeople.length > 0 && (
                  <ReactApexChart options={peopleOpts} series={peopleSeries} type="bar" height={Math.max(220, topPeople.length * 34)} />
                )}
              </div>
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  <Trophy size={16} /> {T.secLeaders}
                </h2>
                <div className="space-y-2">
                  {A.leaders.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-lg w-6 text-center">{medals[i]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(p.name)}</div>
                        <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                          <div className="h-full rounded-full" style={{ width: `${(p.done / (A.leaders[0]?.done || 1)) * 100}%`, background: C_DONE }} />
                        </div>
                      </div>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color: C_DONE }}>{p.done}</span>
                    </div>
                  ))}
                  {A.leaders.length === 0 && <div className="text-xs" style={{ color: "var(--text-4)" }}>—</div>}
                </div>
              </div>
            </div>

            {/* Task types + deadlines */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  <ListChecks size={16} /> {T.secTypes}
                </h2>
                {topTypes.length > 0 && (
                  <ReactApexChart options={typeOpts} series={typeSeries} type="bar" height={Math.max(200, topTypes.length * 36)} />
                )}
              </div>
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  <CalendarClock size={16} /> {T.secDeadlines}
                </h2>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: T.dueOverdue, value: A.totals.overdue, color: C_OVERDUE },
                    { label: T.dueWeek, value: A.dueWeek, color: "#f59e0b" },
                    { label: T.dueUpcoming, value: A.dueUpcoming, color: C_PROG },
                    { label: T.dueNoDate, value: A.noDate, color: C_TODO },
                  ].map((b) => (
                    <div key={b.label} className="rounded-xl p-2.5" style={{ background: "var(--bg-inner)" }}>
                      <div className="text-xl font-bold" style={{ color: b.color }}>{b.value}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{b.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {A.overdueTasks.slice(0, 12).map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C_OVERDUE }} />
                      <span className="flex-1 truncate" style={{ color: "var(--text-2)" }} title={tl(t.title)}>{tl(t.title)}</span>
                      <span className="flex-shrink-0 font-semibold" style={{ color: C_OVERDUE }}>{t.late} {T.daysOverdue}</span>
                    </div>
                  ))}
                  {A.overdueTasks.length === 0 && <div className="text-[11px]" style={{ color: "var(--text-4)" }}>✅ —</div>}
                </div>
              </div>
            </div>

            {/* Task table */}
            <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="p-4 flex flex-wrap items-center gap-2 justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
                  <ListChecks size={16} /> {T.secTasks}
                  <span className="text-[11px] font-normal" style={{ color: "var(--text-4)" }}>({filtered.length})</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
                    <input
                      value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.searchPh}
                      className="pl-8 pr-3 py-1.5 rounded-lg text-xs w-44"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                    />
                  </div>
                  <select value={project} onChange={(e) => setProject(e.target.value)}
                    className="py-1.5 px-2 rounded-lg text-xs" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                    <option value="all">{T.allProjects}</option>
                    {projects.map((p) => <option key={p.key} value={p.key}>{metaFor(p.key).emoji} {tl(p.name)}</option>)}
                  </select>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="py-1.5 px-2 rounded-lg text-xs" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                    <option value="all">{T.allStatuses}</option>
                    <option value="Done">{T.sDone}</option>
                    <option value="In progress">{T.sProg}</option>
                    <option value="Not started">{T.sTodo}</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                      <th className="text-left font-medium px-4 py-2">{T.colProject}</th>
                      <th className="text-left font-medium px-4 py-2">{T.colTask}</th>
                      <th className="text-left font-medium px-4 py-2 hidden md:table-cell">{T.colType}</th>
                      <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">{T.colResp}</th>
                      <th className="text-left font-medium px-4 py-2">{T.colDeadline}</th>
                      <th className="text-left font-medium px-4 py-2">{T.colStatus}</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const m = metaFor(t.project_key);
                      const overdue = t.deadline && t.deadline < todayStr() && t.status !== "Done";
                      return (
                        <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td className="px-4 py-2 whitespace-nowrap"><span title={tl(t.project)}>{m.emoji}</span></td>
                          <td className="px-4 py-2 max-w-xs"><span className="line-clamp-2" style={{ color: "var(--text-1)" }}>{tl(t.title)}</span></td>
                          <td className="px-4 py-2 hidden md:table-cell" style={{ color: "var(--text-3)" }}>{t.task_type ? tl(t.task_type) : "—"}</td>
                          <td className="px-4 py-2 hidden sm:table-cell" style={{ color: "var(--text-2)" }}>
                            {t.responsible?.length ? t.responsible.map(tl).join(", ") : <span style={{ color: "var(--text-4)" }}>{T.unassigned}</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap" style={{ color: overdue ? C_OVERDUE : "var(--text-3)" }}>{t.deadline || "—"}</td>
                          <td className="px-4 py-2"><StatusPill status={t.status} T={T} /></td>
                          <td className="px-2 py-2">
                            {t.url && <a href={t.url} target="_blank" rel="noreferrer" title={T.openNotion} style={{ color: "var(--text-4)" }}><ExternalLink size={13} /></a>}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>{T.noMatch}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
