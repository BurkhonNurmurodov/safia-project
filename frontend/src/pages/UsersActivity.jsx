import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Activity, Users, Clock, Radio, TrendingUp, CalendarDays, Trophy,
  RefreshCw, Search, Shield, Timer, CalendarClock, UserPlus, Hash,
  ChevronUp, ChevronDown, ChevronsUpDown, CircleUserRound,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import ContributionHeatmap from "../components/charts/ContributionHeatmap";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

// ── palette (mirrors Kaizen / Leaders / Trudoyomkost) ────────────────────────
const BRAND = "#C8973F";
const C_USERS = "#7FB3E8", C_ONLINE = "#10b981", C_NEW = "#a78bfa", C_TIME = "#f59e0b";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const mix = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const ch = (s) => Math.round(((n >> s) & 255) + (t - ((n >> s) & 255)) * p);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};
const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
const TXT = {
  uz: {
    title: "Foydalanuvchilar faolligi", subtitle: "Kim faol, qancha vaqt ishlatadi va faollik kalendari",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…",
    p7: "7 kun", p30: "30 kun", p90: "90 kun",
    kOnline: "Hozir onlayn", kToday: "Bugun faol", k7d: "7 kunda faol", k30d: "30 kunda faol",
    kAvgDay: "Kunlik o'rtacha", kTotalTime: "Jami vaqt", kUsers: "Kuzatilgan", kNew: "Yangi (7 kun)",
    secTrend: "Vaqt bo'yicha faollik", trendSub: "Kunlik faol foydalanuvchilar va vaqt",
    mUsers: "Faol foydalanuvchilar", mMinutes: "Daqiqa",
    secCalendar: "Faollik kalendari", calSub: "So'nggi 53 hafta — kunlik ishlatilgan vaqt",
    calAll: "Barcha foydalanuvchilar",
    secTop: "Eng faol foydalanuvchilar", secTable: "Barcha foydalanuvchilar",
    colUser: "Foydalanuvchi", colRole: "Rol", colJoined: "Qo'shilgan", colLastSeen: "Oxirgi faollik",
    colActiveDays: "Faol kunlar", colTotal: "Jami vaqt", colAvg: "Kunlik o'rt.", colSessions: "Kirishlar",
    online: "onlayn", never: "hech qachon", searchPh: "Foydalanuvchi qidirish…",
    noMatch: "Mos foydalanuvchi yo'q", emptyTitle: "Hozircha faollik yo'q",
    emptyNote: "Kuzatuv endi boshlandi — odamlar ilovadan foydalangani sari ma'lumot to'planadi.",
    activeDaysWord: "faol kun", ofWindow: "davr ichida",
  },
  uz_cyrl: {
    title: "Фойдаланувчилар фаоллиги", subtitle: "Ким фаол, қанча вақт ишлатади ва фаоллик календари",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…",
    p7: "7 кун", p30: "30 кун", p90: "90 кун",
    kOnline: "Ҳозир онлайн", kToday: "Бугун фаол", k7d: "7 кунда фаол", k30d: "30 кунда фаол",
    kAvgDay: "Кунлик ўртача", kTotalTime: "Жами вақт", kUsers: "Кузатилган", kNew: "Янги (7 кун)",
    secTrend: "Вақт бўйича фаоллик", trendSub: "Кунлик фаол фойдаланувчилар ва вақт",
    mUsers: "Фаол фойдаланувчилар", mMinutes: "Дақиқа",
    secCalendar: "Фаоллик календари", calSub: "Сўнгги 53 ҳафта — кунлик ишлатилган вақт",
    calAll: "Барча фойдаланувчилар",
    secTop: "Энг фаол фойдаланувчилар", secTable: "Барча фойдаланувчилар",
    colUser: "Фойдаланувчи", colRole: "Рол", colJoined: "Қўшилган", colLastSeen: "Охирги фаоллик",
    colActiveDays: "Фаол кунлар", colTotal: "Жами вақт", colAvg: "Кунлик ўрт.", colSessions: "Киришлар",
    online: "онлайн", never: "ҳеч қачон", searchPh: "Фойдаланувчи қидириш…",
    noMatch: "Мос фойдаланувчи йўқ", emptyTitle: "Ҳозирча фаоллик йўқ",
    emptyNote: "Кузатув энди бошланди — одамлар иловадан фойдалангани сари маълумот тўпланади.",
    activeDaysWord: "фаол кун", ofWindow: "давр ичида",
  },
  ru: {
    title: "Активность пользователей", subtitle: "Кто активен, сколько времени проводит и календарь активности",
    refresh: "Обновить", refreshing: "Обновление…",
    p7: "7 дней", p30: "30 дней", p90: "90 дней",
    kOnline: "Онлайн сейчас", kToday: "Активны сегодня", k7d: "Активны за 7 дней", k30d: "Активны за 30 дней",
    kAvgDay: "В среднем в день", kTotalTime: "Всего времени", kUsers: "Отслеживается", kNew: "Новые (7 дней)",
    secTrend: "Активность по времени", trendSub: "Активные пользователи и время по дням",
    mUsers: "Активные пользователи", mMinutes: "Минуты",
    secCalendar: "Календарь активности", calSub: "Последние 53 недели — время в приложении по дням",
    calAll: "Все пользователи",
    secTop: "Самые активные", secTable: "Все пользователи",
    colUser: "Пользователь", colRole: "Роль", colJoined: "Регистрация", colLastSeen: "Был(а) активен",
    colActiveDays: "Активных дней", colTotal: "Всего", colAvg: "Ср./день", colSessions: "Входы",
    online: "онлайн", never: "никогда", searchPh: "Поиск пользователя…",
    noMatch: "Нет подходящих пользователей", emptyTitle: "Пока нет активности",
    emptyNote: "Отслеживание только началось — данные накапливаются по мере использования приложения.",
    activeDaysWord: "акт. дн.", ofWindow: "за период",
  },
  en: {
    title: "Users Activity", subtitle: "Who's active, how long they use the app, and an activity calendar",
    refresh: "Refresh", refreshing: "Refreshing…",
    p7: "7 days", p30: "30 days", p90: "90 days",
    kOnline: "Online now", kToday: "Active today", k7d: "Active 7d", k30d: "Active 30d",
    kAvgDay: "Avg per day", kTotalTime: "Total time", kUsers: "Tracked users", kNew: "New (7d)",
    secTrend: "Activity over time", trendSub: "Daily active users and time-in-app",
    mUsers: "Active users", mMinutes: "Minutes",
    secCalendar: "Activity calendar", calSub: "Last 53 weeks — time in app per day",
    calAll: "All users",
    secTop: "Most active users", secTable: "All users",
    colUser: "User", colRole: "Role", colJoined: "Joined", colLastSeen: "Last active",
    colActiveDays: "Active days", colTotal: "Total time", colAvg: "Avg/day", colSessions: "Sessions",
    online: "online", never: "never", searchPh: "Search user…",
    noMatch: "No matching users", emptyTitle: "No activity yet",
    emptyNote: "Tracking just started — data accumulates as people use the app.",
    activeDaysWord: "active days", ofWindow: "in window",
  },
};

const ROLE_TKEYS = {
  admin: "role.admin", "top-manager": "role.topManager",
  "shift-manager": "role.manager", supervisor: "role.supervisor", leader: "role.leader",
};
const ROLE_COLOR = {
  admin: BRAND, "top-manager": C_USERS, "shift-manager": C_ONLINE, supervisor: C_NEW, leader: C_TIME,
};

// ── formatting helpers ───────────────────────────────────────────────────────
const fmtDur = (min) => {
  const m = Math.round(min || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
const fmtJoined = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};
// Compact GitHub-style relative time: now · 5m · 2h · 3d · then a short date.
const relTime = (iso, T) => {
  if (!iso) return T.never;
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return T.never;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};

const nameInitials = (name = "") => {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
};
const nameToColor = (name = "") => {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 50%, 42%)`;
};

// ── shared presentational bits (mirror Kaizen) ───────────────────────────────
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
function SortIcon({ active, dir }) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon size={11} style={{ opacity: active ? 1 : 0.4, color: active ? "var(--brand-text)" : "inherit" }} />;
}
const cellB = { borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" };
function Th({ icon: Icon, label, k, sort, onSort, align = "left", cls = "" }) {
  const active = sort.key === k;
  return (
    <th className={`font-medium px-4 py-2 select-none ${cls}`} style={{ ...cellB, textAlign: align }}>
      <button type="button" onClick={() => onSort(k)}
        className="group inline-flex items-center gap-1.5 transition-colors"
        style={{ color: active ? "var(--text-1)" : "inherit" }}>
        {Icon && <Icon size={12} style={{ color: "var(--brand-text)" }} />}
        <span>{label}</span>
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

export default function UsersActivity() {
  const { lang, t } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();
  const T = TXT[lang] || TXT.ru;

  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [calUser, setCalUser] = useState("all");   // 'all' | telegram_id
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" });

  const { data, isLoading } = useQuery({
    queryKey: ["activity", "overview", days],
    queryFn: () => api.get("/api/activity/overview", { params: { days } }).then((r) => r.data),
    refetchInterval: 60_000,   // keep "online now" fresh
  });

  // Per-user calendar drilldown (only when a specific user is picked).
  const { data: userCal } = useQuery({
    queryKey: ["activity", "heatmap", calUser],
    queryFn: () => api.get("/api/activity/heatmap", { params: { telegram_id: calUser } }).then((r) => r.data),
    enabled: calUser !== "all",
  });

  const refresh = useMutation({
    mutationFn: () => qc.invalidateQueries({ queryKey: ["activity"] }),
  });

  const kpis = data?.kpis || {};
  const users = data?.users || [];
  const daily = data?.daily || [];
  const calendar = data?.calendar || [];

  const roleLabel = (r) => (r && ROLE_TKEYS[r] ? t(ROLE_TKEYS[r]) : (r || "—"));

  // Top 5 by total time in the window.
  const topUsers = useMemo(
    () => [...users].filter((u) => u.total_minutes > 0).sort((a, b) => b.total_minutes - a.total_minutes).slice(0, 5),
    [users]
  );

  // Filtered + sorted table.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (q) list = list.filter((u) =>
      `${tl(u.full_name)} ${u.full_name} ${u.username || ""} ${roleLabel(u.role)}`.toLowerCase().includes(q));
    if (!sort.key) return list;
    const val = (u) => ({
      user: tl(u.full_name || ""), role: roleLabel(u.role), joined: u.created_at || "",
      last: u.last_seen || "", active: u.active_days, total: u.total_minutes, avg: u.avg_minutes, sessions: u.event_count,
    }[sort.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, sort, tl, lang]);

  const calSeries = calUser === "all" ? calendar : (userCal?.series || []);
  const calUserName = calUser === "all" ? T.calAll : (users.find((u) => String(u.telegram_id) === String(calUser))?.full_name || "");

  const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
  const periodOpts = [{ value: 7, label: T.p7 }, { value: 30, label: T.p30 }, { value: 90, label: T.p90 }];
  const userOpts = [{ value: "all", label: T.calAll },
    ...[...users].sort((a, b) => tl(a.full_name).localeCompare(tl(b.full_name)))
      .map((u) => ({ value: String(u.telegram_id), label: tl(u.full_name) }))];
  const medals = ["🥇", "🥈", "🥉", "🏅", "🏅"];

  // ── trend chart: minutes (columns) + active users (line), dual axis ──
  const trendCats = daily.map((d) => d.day);
  const shortDay = (iso) => { const [, m, dd] = iso.split("-"); return `${dd}.${m}`; };
  const trendOpts = {
    chart: { type: "line", stacked: false, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", background: "transparent" },
    theme: chartTheme,
    stroke: { width: [0, 2.5], curve: "smooth" },
    colors: [hexA(BRAND, 0.55), C_USERS],
    fill: { type: ["solid", "solid"] },
    plotOptions: { bar: { columnWidth: days > 45 ? "82%" : "55%", borderRadius: 2 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: trendCats.map(shortDay),
      tickAmount: Math.min(12, trendCats.length),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      { seriesName: T.mMinutes, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) }, title: { text: T.mMinutes, style: { color: labelColor, fontSize: "10px", fontWeight: 500 } } },
      { seriesName: T.mUsers, opposite: true, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) }, title: { text: T.mUsers, style: { color: labelColor, fontSize: "10px", fontWeight: 500 } } },
    ],
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    legend: { position: "top", horizontalAlign: "right", labels: { colors: legendColor }, markers: { width: 10, height: 10, radius: 3 } },
    markers: { size: 0, hover: { size: 5 } },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false },
  };
  const trendSeries = [
    { name: T.mMinutes, type: "column", data: daily.map((d) => d.minutes) },
    { name: T.mUsers, type: "line", data: daily.map((d) => d.active_users) },
  ];

  const isEmpty = !isLoading && (kpis.tracked_users || 0) === 0;

  const KPIS = [
    { icon: Radio, label: T.kOnline, value: kpis.online_now ?? 0, accent: C_ONLINE, live: true },
    { icon: Activity, label: T.kToday, value: kpis.active_today ?? 0, accent: BRAND },
    { icon: Users, label: T.k7d, value: kpis.active_7d ?? 0, accent: C_USERS },
    { icon: CalendarDays, label: T.k30d, value: kpis.active_30d ?? 0, accent: C_USERS },
    { icon: Timer, label: T.kAvgDay, value: fmtDur(kpis.avg_minutes_day), accent: C_TIME },
    { icon: Clock, label: T.kTotalTime, value: kpis.total_hours != null ? `${kpis.total_hours}h` : "—", accent: C_TIME },
    { icon: CircleUserRound, label: T.kUsers, value: kpis.tracked_users ?? 0, accent: "var(--text-2)" },
    { icon: UserPlus, label: T.kNew, value: kpis.new_7d ?? 0, accent: C_NEW },
  ];

  const refreshBtn = (
    <button onClick={() => refresh.mutate()} disabled={refresh.isPending || isLoading}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity"
      style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: (refresh.isPending || isLoading) ? 0.6 : 1 }}>
      <RefreshCw size={14} className={refresh.isPending ? "animate-spin" : ""} />
      {refresh.isPending ? T.refreshing : T.refresh}
    </button>
  );

  return (
    <Layout title={T.title} showFilters={false}>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight flex items-center gap-2" style={{ color: "var(--text-1)" }}>
            <Activity size={20} style={{ color: "var(--brand-text)" }} /> {T.title}
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StyledSelect value={days} onChange={(v) => setDays(Number(v))} options={periodOpts} className="w-28" />
          {refreshBtn}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl px-4 py-3.5" style={cardStyle}>
                <SkeletonBlock className="h-3 w-14 mb-3" /><SkeletonBlock className="h-6 w-10" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-32 mb-4" /><SkeletonChart className="h-56" /></div>
          <div className="rounded-2xl p-4" style={cardStyle}><SkeletonBlock className="h-3 w-32 mb-4" /><SkeletonChart className="h-40" /></div>
        </div>
      ) : (
        <div className="space-y-4">
          {isEmpty && (
            <div className="rounded-2xl px-4 py-3 text-xs flex items-start gap-2" style={{ background: hexA(C_USERS, 0.08), border: `1px solid ${hexA(C_USERS, 0.25)}`, color: "var(--text-2)" }}>
              <Activity size={15} style={{ color: C_USERS, flexShrink: 0, marginTop: 1 }} />
              <div><span className="font-semibold" style={{ color: "var(--text-1)" }}>{T.emptyTitle}.</span> {T.emptyNote}</div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {KPIS.map(({ icon: Icon, label, value, accent, live }) => (
              <div key={label} className="rounded-2xl p-3.5" style={cardStyle}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 relative" style={{ background: hexA(typeof accent === "string" && accent.startsWith("#") ? accent : "#888", 0.14), color: accent }}>
                    <Icon size={15} />
                    {live && value > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: C_ONLINE, boxShadow: `0 0 0 2px var(--bg-card)` }} />}
                  </span>
                </div>
                <div className="text-xl font-bold tabular-nums leading-none truncate" style={{ color: "var(--text-1)" }} title={String(value)}>{value}</div>
                <div className="text-[10px] mt-1.5 uppercase tracking-wider truncate" style={{ color: "var(--text-3)" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead icon={TrendingUp} title={T.secTrend}
              right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{T.trendSub}</span>} />
            <div className="px-1 pt-2 pb-1">
              <ReactApexChart options={trendOpts} series={trendSeries} type="line" height={260} />
            </div>
          </div>

          {/* Contribution calendar */}
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead icon={CalendarDays}
              title={<span className="flex items-center gap-2">{T.secCalendar}
                <span className="text-[11px] font-normal normal-case tracking-normal" style={{ color: "var(--text-4)" }}>· {tl(calUserName)}</span></span>}
              right={<StyledSelect value={calUser} onChange={setCalUser} options={userOpts} className="w-52" />} />
            <div className="p-4">
              <p className="text-[11px] mb-3" style={{ color: "var(--text-4)" }}>{T.calSub}</p>
              <ContributionHeatmap
                series={calSeries}
                valueKey="minutes"
                accent={BRAND}
                formatValue={(v) => fmtDur(v)}
              />
            </div>
          </div>

          {/* Top users + at-a-glance */}
          {topUsers.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Trophy} title={T.secTop} />
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {topUsers.map((u, i) => {
                  const maxT = topUsers[0].total_minutes || 1;
                  return (
                    <div key={u.telegram_id} className="rounded-xl p-3" style={{ background: "var(--bg-inner)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{medals[i]}</span>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: nameToColor(u.full_name) }}>
                          {nameInitials(u.full_name)}
                        </div>
                        <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={tl(u.full_name)}>{tl(u.full_name)}</span>
                      </div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: "var(--brand-text)" }}>{fmtDur(u.total_minutes)}</div>
                      <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--bg-card)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(u.total_minutes / maxT) * 100}%`, background: BRAND }} />
                      </div>
                      <div className="text-[10px] mt-1.5" style={{ color: "var(--text-4)" }}>{u.active_days} {T.activeDaysWord} · {fmtDur(u.avg_minutes)}/d</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Users table */}
          <section className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead icon={Users}
              title={<span className="flex items-center gap-2">{T.secTable}
                <span className="text-[11px] font-normal normal-case tracking-normal" style={{ color: "var(--text-4)" }}>({rows.length})</span></span>}
              right={
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.searchPh}
                    className="pl-8 pr-3 py-1.5 rounded-lg text-xs w-48 outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
                </div>
              } />
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                    <Th icon={CircleUserRound} label={T.colUser} k="user" sort={sort} onSort={onSort} />
                    <Th icon={Shield} label={T.colRole} k="role" sort={sort} onSort={onSort} cls="hidden sm:table-cell" />
                    <Th icon={CalendarClock} label={T.colJoined} k="joined" sort={sort} onSort={onSort} cls="hidden lg:table-cell" />
                    <Th icon={Clock} label={T.colLastSeen} k="last" sort={sort} onSort={onSort} />
                    <Th icon={CalendarDays} label={T.colActiveDays} k="active" sort={sort} onSort={onSort} align="right" cls="hidden md:table-cell" />
                    <Th icon={Timer} label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" />
                    <Th icon={TrendingUp} label={T.colAvg} k="avg" sort={sort} onSort={onSort} align="right" cls="hidden sm:table-cell" />
                    <Th icon={Hash} label={T.colSessions} k="sessions" sort={sort} onSort={onSort} align="right" cls="hidden lg:table-cell" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.telegram_id}>
                      <td className="px-4 py-2" style={cellB}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 relative" style={{ background: nameToColor(u.full_name) }}>
                            {nameInitials(u.full_name)}
                            {u.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: C_ONLINE, border: "2px solid var(--bg-card)" }} />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate" style={{ color: "var(--text-1)" }} title={tl(u.full_name)}>{tl(u.full_name)}</div>
                            {u.username && <div className="text-[10px] truncate" style={{ color: "var(--text-4)" }}>@{u.username}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 hidden sm:table-cell" style={cellB}>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: hexA(ROLE_COLOR[u.role] || "#888", 0.14), color: ROLE_COLOR[u.role] || "var(--text-3)" }}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-2 hidden lg:table-cell tabular-nums" style={{ ...cellB, color: "var(--text-3)" }}>{fmtJoined(u.created_at)}</td>
                      <td className="px-4 py-2 whitespace-nowrap" style={cellB}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: u.online ? C_ONLINE : "var(--text-4)" }} />
                          <span style={{ color: u.online ? C_ONLINE : "var(--text-2)" }}>{u.online ? T.online : relTime(u.last_seen, T)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell" style={{ ...cellB, color: "var(--text-2)" }}>{u.active_days}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ ...cellB, color: "var(--text-1)" }}>{fmtDur(u.total_minutes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell" style={{ ...cellB, color: "var(--text-2)" }}>{fmtDur(u.avg_minutes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums hidden lg:table-cell" style={{ ...cellB, color: "var(--text-3)" }}>{u.event_count}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>{search ? T.noMatch : T.emptyTitle}</td></tr>
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
