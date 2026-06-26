import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Sparkles, RefreshCw, CheckCircle2, Loader2, Circle, AlarmClock,
  Users, ListChecks, CalendarClock, Trophy, ExternalLink, Search, Plug,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── palette ────────────────────────────────────────────────────────────────
// On-brand status hues: desaturated to glow rather than glare against charcoal,
// matching the emerald/amber/rose set used across Leaders & Trudoyomkost.
const C_DONE = "#10b981", C_PROG = "#7FB3E8", C_TODO = "#94a3b8", C_OVERDUE = "#f43f5e";
const BRAND = "#C8973F";          // brand gold — the page accent (mirrors --brand)

// rgba tint + lighten/darken toward white/black (chart gradients & soft fills)
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

// KPI tile: muted uppercase label + soft-tinted iconed chip on top, big value
// below. Colour stays an indicator (the chip) — the number reads neutral unless
// it carries an alarm (overdue).
function Kpi({ icon: Icon, label, value, sub, accent, valueColor, subColor, primary }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{
      background: primary ? "var(--brand-bg)" : "var(--bg-card)",
      border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}`,
    }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold truncate" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && (
          <span className="grid place-items-center w-6 h-6 rounded-lg flex-shrink-0"
            style={{ background: accent ? hexA(accent, 0.14) : "var(--bg-inner)", color: accent || "var(--brand-text)" }}>
            <Icon size={13} />
          </span>
        )}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: valueColor || "var(--text-1)" }}>{value}</div>
      {sub != null && <div className="text-[11px] mt-1.5" style={{ color: subColor || "var(--text-3)" }}>{sub}</div>}
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
  const { auth } = useAuth();
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
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
    chart: { type: "radialBar", sparkline: { enabled: true }, fontFamily: "inherit" },
    plotOptions: { radialBar: {
      hollow: { size: "60%" },
      track: { background: "var(--bg-inner)" },
      dataLabels: {
        name: { offsetY: 22, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, fontSize: "26px", fontWeight: 700, color: "var(--text-1)", formatter: (v) => `${Math.round(v)}%` },
      },
    } },
    fill: { type: "gradient", gradient: { shade: "dark", type: "horizontal", gradientToColors: [mix(BRAND, 0.18)], stops: [0, 100] }, colors: [BRAND] },
    stroke: { lineCap: "round" },
    labels: [T.kDonePct],
  };

  const donutOpts = {
    chart: { type: "donut", fontFamily: "inherit" },
    labels: [T.sDone, T.sProg, T.sTodo],
    colors: [C_DONE, C_PROG, C_TODO],
    legend: { position: "bottom", labels: { colors: legendColor }, fontSize: "12px", markers: { width: 10, height: 10, radius: 3 } },
    dataLabels: { enabled: true, formatter: (v) => `${Math.round(v)}%`, style: { fontSize: "11px", fontWeight: 600 } },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme },
    plotOptions: { pie: { donut: { size: "64%" } } },
  };

  const topPeople = A.people.slice(0, 10);
  const peopleOpts = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "inherit" },
    theme: chartTheme,
    plotOptions: { bar: { horizontal: true, barHeight: "62%", borderRadius: 3 } },
    colors: [C_DONE, C_PROG, C_TODO],
    xaxis: { categories: topPeople.map((p) => tl(p.name === "—" ? T.unassigned : p.name)), labels: { style: { colors: labelColor, fontSize: "11px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
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
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
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

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title={T.title} showFilters={false}>
      {/* Top controls: last-synced context chip + refresh (mirrors Trudoyomkost) */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
          <CalendarClock size={14} style={{ color: "var(--brand-text)" }} />
          {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
        </span>
        <div className="ml-auto">{refreshBtn}</div>
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
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={ListChecks}   label={T.kTotal}   value={A.totals.total}   accent={BRAND} primary />
            <Kpi icon={CheckCircle2} label={T.kDone}     value={A.totals.done}    accent={C_DONE} sub={`${A.donePct}% ${T.completion}`} subColor={C_DONE} />
            <Kpi icon={Loader2}      label={T.kProg}     value={A.totals.prog}    accent={C_PROG} />
            <Kpi icon={Circle}       label={T.kTodo}     value={A.totals.todo}    accent={C_TODO} />
            <Kpi icon={AlarmClock}   label={T.kOverdue}  value={A.totals.overdue} accent={C_OVERDUE} valueColor={A.totals.overdue > 0 ? C_OVERDUE : undefined} />
            <Kpi icon={Users}        label={T.secPeople} value={A.peopleCount}    accent={C_PROG} sub={T.people} />
          </div>

          {/* Status overview: gauge + donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Trophy} title={T.kDonePct} />
              <div className="px-3 pb-3 pt-1"><ReactApexChart options={gaugeOpts} series={[A.donePct]} type="radialBar" height={230} /></div>
            </div>
            <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={ListChecks} title={T.secStatus} />
              <div className="px-3 pb-3 pt-1"><ReactApexChart options={donutOpts} series={[A.totals.done, A.totals.prog, A.totals.todo]} type="donut" height={230} /></div>
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
                      <span style={{ color: "var(--text-4)" }}>{p.nextDue ? `${T.nextDue}: ${p.nextDue}` : T.noDeadline}</span>
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
                {topPeople.length > 0 && (
                  <ReactApexChart options={peopleOpts} series={peopleSeries} type="bar" height={Math.max(220, topPeople.length * 34)} />
                )}
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
                {topTypes.length > 0 && (
                  <ReactApexChart options={typeOpts} series={typeSeries} type="bar" height={Math.max(200, topTypes.length * 36)} />
                )}
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
                      <span className="flex-1 truncate" style={{ color: "var(--text-2)" }} title={tl(t.title)}>{tl(t.title)}</span>
                      <span className="flex-shrink-0 font-semibold tabular-nums" style={{ color: C_OVERDUE }}>{t.late} {T.daysOverdue}</span>
                    </div>
                  ))}
                  {A.overdueTasks.length === 0 && <div className="text-[11px]" style={{ color: "var(--text-4)" }}>—</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Task table */}
          <section className="rounded-2xl overflow-hidden" style={cardStyle}>
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
                    const overdue = t.deadline && t.deadline < todayStr() && t.status !== "Done";
                    return (
                      <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-2 whitespace-nowrap"><span title={tl(t.project)}>{emojiFor(t.project_key)}</span></td>
                        <td className="px-4 py-2 max-w-xs"><span className="line-clamp-2" style={{ color: "var(--text-1)" }}>{tl(t.title)}</span></td>
                        <td className="px-4 py-2 hidden md:table-cell" style={{ color: "var(--text-3)" }}>{t.task_type ? tl(t.task_type) : "—"}</td>
                        <td className="px-4 py-2 hidden sm:table-cell" style={{ color: "var(--text-2)" }}>
                          {t.responsible?.length ? t.responsible.map(tl).join(", ") : <span style={{ color: "var(--text-4)" }}>{T.unassigned}</span>}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap tabular-nums" style={{ color: overdue ? C_OVERDUE : "var(--text-3)" }}>{t.deadline || "—"}</td>
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
        </div>
      )}
    </Layout>
  );
}
