import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Activity, Users, Clock, Radio, TrendingUp, CalendarDays, Trophy,
  RefreshCw, Shield, Timer, CalendarClock, Hash,
  ChevronUp, ChevronDown, ChevronsUpDown, CircleUserRound,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import ContributionHeatmap from "../components/charts/ContributionHeatmap";
import { Sparkline } from "../components/ui/KpiDeltaCard";
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

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
const TXT = {
  uz: {
    title: "Foydalanuvchilar faolligi", subtitle: "Kim faol, qancha vaqt ishlatadi va faollik kalendari",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…",
    p7: "7 kun", p30: "30 kun", p90: "90 kun",
    kOnline: "Hozir onlayn", kToday: "Bugun faol", k7d: "7 kunda faol", k30d: "30 kunda faol",
    kAvgDay: "Kunlik o'rtacha", kTotalTime: "Jami vaqt", kUsers: "Kuzatilgan", kNew: "Yangi (7 kun)",
    cardTime: "Ilovadagi vaqt", perDay: "/kun", noOnline: "Hozir hech kim yo'q",
    coverage30: "30 kunlik qamrov", dataSince: "Ma'lumot {d} dan",
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
    cardTime: "Иловадаги вақт", perDay: "/кун", noOnline: "Ҳозир ҳеч ким йўқ",
    coverage30: "30 кунлик қамров", dataSince: "Маълумот {d} дан",
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
    cardTime: "Время в приложении", perDay: "/день", noOnline: "Сейчас никого нет",
    coverage30: "Охват за 30 дней", dataSince: "Данные с {d}",
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
    cardTime: "Time in app", perDay: "/day", noOnline: "No one online",
    coverage30: "30-day coverage", dataSince: "Data since {d}",
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
  guest: "role.guest",
};
const ROLE_COLOR = {
  admin: BRAND, "top-manager": C_USERS, "shift-manager": C_ONLINE, supervisor: C_NEW, leader: C_TIME,
  guest: "#94a3b8",
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

// One KPI card = one story: primary metric, its closest companion metric,
// and a live footer (sparkline / avatars / coverage bar) instead of dead space.
function StatCard({ icon: Icon, label, accent, live, value, valueSuffix, secLabel, secValue, secAccent, footer }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: hexA(accent, 0.14), color: accent }}>
          <Icon size={14} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--text-3)" }}>{label}</span>
        {live && (
          <span className="relative flex w-2 h-2 ml-auto flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: C_ONLINE }} />
            <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: C_ONLINE }} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{value}</span>
        {valueSuffix && <span className="text-[11px] font-medium" style={{ color: "var(--text-4)" }}>{valueSuffix}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate" style={{ color: "var(--text-3)" }}>{secLabel}</span>
        <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: secAccent || "var(--text-2)" }}>{secValue}</span>
      </div>
      <div className="mt-auto">{footer}</div>
    </div>
  );
}

function AvatarStack({ users, tl, emptyText }) {
  const shown = users.slice(0, 6);
  if (!shown.length) {
    return <div className="flex items-center h-[30px] text-[11px]" style={{ color: "var(--text-4)" }}>{emptyText}</div>;
  }
  return (
    <div className="flex items-center h-[30px]">
      {shown.map((u) => (
        <div key={u.telegram_id} title={tl(u.full_name)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white -ml-1.5 first:ml-0 flex-shrink-0"
          style={{ background: nameToColor(u.full_name), border: "2px solid var(--bg-card)" }}>
          {nameInitials(u.full_name)}
        </div>
      ))}
      {users.length > shown.length && (
        <span className="text-[10px] ml-1.5 font-semibold" style={{ color: "var(--text-3)" }}>+{users.length - shown.length}</span>
      )}
    </div>
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

  const onlineUsers = useMemo(() => users.filter((u) => u.online), [users]);

  // Tracking is forward-only, so early on most of the window is a flat run of
  // zero days. Trim the dead prefix (keeping ≥7 points and one leading zero for
  // context) so the chart tells the story instead of showing the void.
  const firstIdx = daily.findIndex((d) => d.minutes > 0 || d.active_users > 0);
  const trimStart = firstIdx > 1 ? Math.max(0, Math.min(firstIdx - 1, daily.length - 7)) : 0;
  const shownDaily = trimStart > 0 ? daily.slice(trimStart) : daily;
  const firstDataDay = firstIdx >= 0 ? daily[firstIdx].day : null;

  // ── trend chart: minutes (columns) + active users (line), dual axis ──
  const shortDay = (iso) => { const [, m, dd] = iso.split("-"); return `${dd}.${m}`; };
  const trendOpts = {
    chart: { type: "line", stacked: false, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", background: "transparent" },
    theme: chartTheme,
    stroke: { width: [0, 2.5], curve: "smooth" },
    colors: [hexA(BRAND, 0.7), C_USERS],
    fill: { type: ["solid", "solid"] },
    plotOptions: { bar: { columnWidth: shownDaily.length > 45 ? "82%" : shownDaily.length > 14 ? "58%" : "40%", borderRadius: 3 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: shownDaily.map((d) => shortDay(d.day)),
      tickAmount: Math.min(12, shownDaily.length),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      { seriesName: T.mMinutes, min: 0, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) } },
      { seriesName: T.mUsers, opposite: true, min: 0, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) } },
    ],
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    legend: { position: "top", horizontalAlign: "right", labels: { colors: legendColor }, markers: { width: 10, height: 10, radius: 3 } },
    markers: { size: shownDaily.length <= 31 ? 3 : 0, strokeWidth: 0, hover: { size: 5 } },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false },
  };
  const trendSeries = [
    { name: T.mMinutes, type: "column", data: shownDaily.map((d) => d.minutes) },
    { name: T.mUsers, type: "line", data: shownDaily.map((d) => d.active_users) },
  ];

  const isEmpty = !isLoading && (kpis.tracked_users || 0) === 0;

  // Share of the tracked audience that was active in the last 30 days.
  const coverage = kpis.tracked_users
    ? Math.min(100, Math.round(((kpis.active_30d || 0) / kpis.tracked_users) * 100))
    : 0;

  const periodSeg = (
    <div className="inline-flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--border-md)" }}>
      {periodOpts.map((o) => (
        <button key={o.value} onClick={() => setDays(o.value)}
          className="text-[11px] font-semibold px-3 py-2 transition-colors"
          style={days === o.value
            ? { background: BRAND, color: "#fff" }
            : { background: "var(--bg-inner)", color: "var(--text-3)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );

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
          {periodSeg}
          {refreshBtn}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-4" style={cardStyle}>
                <SkeletonBlock className="h-3 w-24 mb-3" /><SkeletonBlock className="h-7 w-16 mb-3" />
                <SkeletonBlock className="h-3 w-full mb-2" /><SkeletonBlock className="h-[30px] w-full" />
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

          {/* KPI cards — 4 stories: live now, engagement, time in app, audience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard icon={Radio} label={T.kOnline} accent={C_ONLINE} live={(kpis.online_now ?? 0) > 0}
              value={kpis.online_now ?? 0}
              secLabel={T.kToday} secValue={kpis.active_today ?? 0}
              footer={<AvatarStack users={onlineUsers} tl={tl} emptyText={T.noOnline} />} />

            <StatCard icon={Users} label={T.mUsers} accent={C_USERS}
              value={kpis.active_7d ?? 0} valueSuffix={`/ ${T.p7}`}
              secLabel={T.k30d} secValue={kpis.active_30d ?? 0}
              footer={<Sparkline values={shownDaily.map((d) => d.active_users)} color={C_USERS} />} />

            <StatCard icon={Clock} label={T.cardTime} accent={C_TIME}
              value={fmtDur(kpis.avg_minutes_day)} valueSuffix={T.perDay}
              secLabel={T.kTotalTime} secValue={kpis.total_hours != null ? `${kpis.total_hours}h` : "—"}
              footer={<Sparkline values={shownDaily.map((d) => d.minutes)} color={C_TIME} />} />

            <StatCard icon={CircleUserRound} label={T.kUsers} accent={C_NEW}
              value={kpis.tracked_users ?? 0}
              secLabel={T.kNew} secValue={(kpis.new_7d ?? 0) > 0 ? `+${kpis.new_7d}` : 0}
              secAccent={(kpis.new_7d ?? 0) > 0 ? C_ONLINE : undefined}
              footer={
                <div className="h-[30px] flex flex-col justify-center gap-1.5">
                  <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-4)" }}>
                    <span className="truncate">{T.coverage30}</span>
                    <span className="font-semibold tabular-nums" style={{ color: C_NEW }}>{coverage}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                    <div className="h-full rounded-full" style={{ width: `${coverage}%`, background: C_NEW }} />
                  </div>
                </div>
              } />
          </div>

          {/* Trend chart */}
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead icon={TrendingUp} title={T.secTrend}
              right={
                <div className="flex items-center gap-2 flex-wrap">
                  {trimStart > 0 && firstDataDay && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: hexA(C_USERS, 0.12), border: `1px solid ${hexA(C_USERS, 0.3)}`, color: C_USERS }}>
                      {T.dataSince.replace("{d}", shortDay(firstDataDay))}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{T.trendSub}</span>
                </div>
              } />
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

          {/* Users table — canonical POSITIONS-style TableCard with per-column sort. */}
          <TableCard
            icon={Users}
            title={T.secTable}
            right={
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                {rows.length}
              </span>
            }
            toolbar={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={T.searchPh}
                className="w-48"
                inputClassName="text-xs pl-8 pr-7 py-1.5"
              />
            }
          >
                <thead>
                  <tr>
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
                      <td className="px-4 py-2">
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
                      <td className="px-4 py-2 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: hexA(ROLE_COLOR[u.role] || "#888", 0.14), color: ROLE_COLOR[u.role] || "var(--text-3)" }}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-2 hidden lg:table-cell tabular-nums" style={{ color: "var(--text-3)" }}>{fmtJoined(u.created_at)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: u.online ? C_ONLINE : "var(--text-4)" }} />
                          <span style={{ color: u.online ? C_ONLINE : "var(--text-2)" }}>{u.online ? T.online : relTime(u.last_seen, T)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: "var(--text-2)" }}>{u.active_days}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{fmtDur(u.total_minutes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--text-2)" }}>{fmtDur(u.avg_minutes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums hidden lg:table-cell" style={{ color: "var(--text-3)" }}>{u.event_count}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>{search ? T.noMatch : T.emptyTitle}</td></tr>
                  )}
                </tbody>
          </TableCard>
        </div>
      )}
    </Layout>
  );
}
