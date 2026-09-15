// Users Activity — the usage ledger read two ways (routers/activity.py):
//   «Profillar bo'yicha»        one row per PROFILE — a person; every login that
//                               works as it folds into that row
//   «Foydalanuvchilar bo'yicha» one row per Telegram ACCOUNT — the login itself,
//                               whatever profiles it worked as
// `by` picks the unit on the SERVER, so neither tab re-derives a figure from the
// other's rows, and both tabs add up to the same minutes.
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Activity, Users, Clock, Radio, TrendingUp, CalendarDays, Trophy, RefreshCw, Shield, Timer,
  CalendarClock, LogIn, CircleUserRound, IdCard, Smartphone, Link2Off, TriangleAlert,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import ProfileAvatar from "../components/ui/ProfileAvatar";
import ContributionHeatmap from "../components/charts/ContributionHeatmap";
import { Sparkline } from "../components/ui/KpiDeltaCard";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useElementWidth from "../hooks/useElementWidth";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { AXIS_GUTTER_PX, axisLabelPx, ticksForWidth } from "../utils/chartRange";
import { CATEGORY_COLORS, FOLD_COLOR } from "../utils/chartPalette";

// Single-metric accents. Each measure wears ONE hue everywhere it is drawn — its
// KPI card, that card's sparkline, its trend series, its bars and its calendar.
const C_ACTIVE = "#3b82f6", C_ONLINE = "#10b981", C_NEW = "#a78bfa", C_TIME = "#f59e0b";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
const TXT = {
  uz: {
    title: "Foydalanuvchilar faolligi", subtitle: "Kim faol, ilovada qancha vaqt o'tkazadi va faollik kalendari",
    period: "Davr", refresh: "Yangilash", p7: "7 kun", p30: "30 kun", p90: "90 kun",
    tabs: { profile: "Profillar bo'yicha", account: "Foydalanuvchilar bo'yicha" },
    note: {
      profile: "Har bir qator — bitta profil, ya'ni bitta odam. Bir profil bilan bir necha Telegram akkaunt ishlasa, ularning vaqti qo'shilib bitta qatorda ko'rinadi.",
      account: "Har bir qator — bitta Telegram akkaunt (login). Bir akkaunt bir necha profil bilan ishlashi mumkin — ular «Profillar» ustunida ko'rinadi.",
    },
    kOnline: "Hozir onlayn", kToday: "Bugun faol", k30d: "30 kunda faol",
    kActive: { profile: "Faol profillar", account: "Faol foydalanuvchilar" },
    kTracked: { profile: "Kuzatilgan profillar", account: "Kuzatilgan foydalanuvchilar" },
    kNew: "Yangi (7 kun)", kTotalTime: "Jami vaqt", cardTime: "Ilovadagi vaqt",
    perIdDay: { profile: "/ profil-kun", account: "/ foydalanuvchi-kun" }, perDayShort: "/kun",
    hrs: (n) => `${n} soat`,
    noOnline: "Hozir hech kim yo'q", coverage30: "30 kunlik qamrov", dataSince: "Ma'lumot {d} dan",
    secTrend: "Vaqt bo'yicha faollik", trendSub: "Kunlik faollik va ilovadagi vaqt", mMinutes: "Daqiqa",
    secCalendar: "Faollik kalendari", calSub: "So'nggi 53 hafta — kunlik ishlatilgan vaqt, Toshkent vaqti bilan",
    calAll: { profile: "Barcha profillar", account: "Barcha foydalanuvchilar" },
    secTop: { profile: "Eng faol profillar", account: "Eng faol foydalanuvchilar" },
    secTable: { profile: "Barcha profillar", account: "Barcha foydalanuvchilar" },
    searchPh: { profile: "Profil qidirish…", account: "Foydalanuvchi qidirish…" },
    colProfile: "Profil", colUser: "Foydalanuvchi", colRole: "Rol", colAccounts: "Akkauntlar", colProfiles: "Profillar",
    colJoined: "Qo'shilgan", colLastSeen: "Oxirgi faollik", colActiveDays: "Faol kunlar", colTotal: "Jami vaqt",
    colAvg: "Kunlik o'rt.", colSessions: "Kirishlar",
    hintSessions: "Ilovaga necha marta kirilgan: 2,5 daqiqadan uzun tanaffusdan keyingi har bir qaytish — yangi kirish.",
    hintAccounts: "Shu profil bilan ishlagan Telegram akkauntlar soni",
    online: "onlayn", never: "hech qachon", noMatch: "Mos natija yo'q", emptyTitle: "Hozircha faollik yo'q",
    emptyNote: "Kuzatuv endi boshlandi — odamlar ilovadan foydalangani sari ma'lumot to'planadi.",
    activeDaysWord: "faol kun",
    unlinked: "Profil aniqlanmagan",
    unlinkedHint: "profil hali saqlanmagan davrdagi eski yozuvlar — qaysi profilga tegishli ekanini aniqlab bo'lmadi, shuning uchun akkaunt bo'yicha qoldi.",
    sessionsFrom: "Kirishlar soni {d} dan beri hisoblanadi — undan oldingi kunlar bu ustunga kirmaydi.",
    sessionsSoon: "Kirishlar soni endi hisoblana boshlaydi.",
    loadFailed: "Faollik ma'lumotini yuklab bo'lmadi.", retry: "Qayta urinish",
    rel: { now: "hozir", m: "daq", h: "soat", d: "kun", fmt: (n, u) => `${n} ${u}` },
    dur: (h, m) => (h ? (m ? `${h} soat ${m} daq` : `${h} soat`) : `${m} daq`),
    locale: "uz-Latn-UZ",
  },
  uz_cyrl: {
    title: "Фойдаланувчилар фаоллиги", subtitle: "Ким фаол, иловада қанча вақт ўтказади ва фаоллик календари",
    period: "Давр", refresh: "Янгилаш", p7: "7 кун", p30: "30 кун", p90: "90 кун",
    tabs: { profile: "Профиллар бўйича", account: "Фойдаланувчилар бўйича" },
    note: {
      profile: "Ҳар бир қатор — битта профил, яъни битта одам. Бир профил билан бир нечта Telegram аккаунт ишласа, уларнинг вақти қўшилиб битта қаторда кўринади.",
      account: "Ҳар бир қатор — битта Telegram аккаунт (логин). Бир аккаунт бир нечта профил билан ишлаши мумкин — улар «Профиллар» устунида кўринади.",
    },
    kOnline: "Ҳозир онлайн", kToday: "Бугун фаол", k30d: "30 кунда фаол",
    kActive: { profile: "Фаол профиллар", account: "Фаол фойдаланувчилар" },
    kTracked: { profile: "Кузатилган профиллар", account: "Кузатилган фойдаланувчилар" },
    kNew: "Янги (7 кун)", kTotalTime: "Жами вақт", cardTime: "Иловадаги вақт",
    perIdDay: { profile: "/ профил-кун", account: "/ фойдаланувчи-кун" }, perDayShort: "/кун",
    hrs: (n) => `${n} соат`,
    noOnline: "Ҳозир ҳеч ким йўқ", coverage30: "30 кунлик қамров", dataSince: "Маълумот {d} дан",
    secTrend: "Вақт бўйича фаоллик", trendSub: "Кунлик фаоллик ва иловадаги вақт", mMinutes: "Дақиқа",
    secCalendar: "Фаоллик календари", calSub: "Сўнгги 53 ҳафта — кунлик ишлатилган вақт, Тошкент вақти билан",
    calAll: { profile: "Барча профиллар", account: "Барча фойдаланувчилар" },
    secTop: { profile: "Энг фаол профиллар", account: "Энг фаол фойдаланувчилар" },
    secTable: { profile: "Барча профиллар", account: "Барча фойдаланувчилар" },
    searchPh: { profile: "Профил қидириш…", account: "Фойдаланувчи қидириш…" },
    colProfile: "Профил", colUser: "Фойдаланувчи", colRole: "Рол", colAccounts: "Аккаунтлар", colProfiles: "Профиллар",
    colJoined: "Қўшилган", colLastSeen: "Охирги фаоллик", colActiveDays: "Фаол кунлар", colTotal: "Жами вақт",
    colAvg: "Кунлик ўрт.", colSessions: "Киришлар",
    hintSessions: "Иловага неча марта кирилган: 2,5 дақиқадан узун танаффусдан кейинги ҳар бир қайтиш — янги кириш.",
    hintAccounts: "Шу профил билан ишлаган Telegram аккаунтлар сони",
    online: "онлайн", never: "ҳеч қачон", noMatch: "Мос натижа йўқ", emptyTitle: "Ҳозирча фаоллик йўқ",
    emptyNote: "Кузатув энди бошланди — одамлар иловадан фойдалангани сари маълумот тўпланади.",
    activeDaysWord: "фаол кун",
    unlinked: "Профил аниқланмаган",
    unlinkedHint: "профил ҳали сақланмаган даврдаги эски ёзувлар — қайси профилга тегишли эканини аниқлаб бўлмади, шунинг учун аккаунт бўйича қолди.",
    sessionsFrom: "Киришлар сони {d} дан бери ҳисобланади — ундан олдинги кунлар бу устунга кирмайди.",
    sessionsSoon: "Киришлар сони энди ҳисоблана бошлайди.",
    loadFailed: "Фаоллик маълумотини юклаб бўлмади.", retry: "Қайта уриниш",
    rel: { now: "ҳозир", m: "дақ", h: "соат", d: "кун", fmt: (n, u) => `${n} ${u}` },
    dur: (h, m) => (h ? (m ? `${h} соат ${m} дақ` : `${h} соат`) : `${m} дақ`),
    locale: "uz-Cyrl-UZ",
  },
  ru: {
    title: "Активность пользователей", subtitle: "Кто активен, сколько времени проводит в приложении и календарь активности",
    period: "Период", refresh: "Обновить", p7: "7 дней", p30: "30 дней", p90: "90 дней",
    tabs: { profile: "По профилям", account: "По пользователям" },
    note: {
      profile: "Каждая строка — один профиль, то есть один человек. Если под одним профилем работают несколько Telegram-аккаунтов, их время суммируется в одной строке.",
      account: "Каждая строка — один Telegram-аккаунт (логин). Один аккаунт может работать под несколькими профилями — они показаны в столбце «Профили».",
    },
    kOnline: "Онлайн сейчас", kToday: "Активны сегодня", k30d: "Активны за 30 дней",
    kActive: { profile: "Активные профили", account: "Активные пользователи" },
    kTracked: { profile: "Отслеживается профилей", account: "Отслеживается пользователей" },
    kNew: "Новые (7 дней)", kTotalTime: "Всего времени", cardTime: "Время в приложении",
    perIdDay: { profile: "/ профиль-день", account: "/ пользователь-день" }, perDayShort: "/день",
    hrs: (n) => `${n} ч`,
    noOnline: "Сейчас никого нет", coverage30: "Охват за 30 дней", dataSince: "Данные с {d}",
    secTrend: "Активность по времени", trendSub: "Активность и время в приложении по дням", mMinutes: "Минуты",
    secCalendar: "Календарь активности", calSub: "Последние 53 недели — время в приложении по дням, по ташкентскому времени",
    calAll: { profile: "Все профили", account: "Все пользователи" },
    secTop: { profile: "Самые активные профили", account: "Самые активные пользователи" },
    secTable: { profile: "Все профили", account: "Все пользователи" },
    searchPh: { profile: "Поиск профиля…", account: "Поиск пользователя…" },
    colProfile: "Профиль", colUser: "Пользователь", colRole: "Роль", colAccounts: "Аккаунты", colProfiles: "Профили",
    colJoined: "Регистрация", colLastSeen: "Был(а) активен", colActiveDays: "Активных дней", colTotal: "Всего",
    colAvg: "Ср./день", colSessions: "Входы",
    hintSessions: "Сколько раз заходили в приложение: каждое возвращение после перерыва дольше 2,5 минуты — новый вход.",
    hintAccounts: "Сколько Telegram-аккаунтов работали под этим профилем",
    online: "онлайн", never: "никогда", noMatch: "Ничего не найдено", emptyTitle: "Пока нет активности",
    emptyNote: "Отслеживание только началось — данные накапливаются по мере использования приложения.",
    activeDaysWord: "акт. дн.",
    unlinked: "Профиль не определён",
    unlinkedHint: "старые записи из периода, когда профиль ещё не сохранялся; определить профиль не удалось, поэтому они остались за аккаунтом.",
    sessionsFrom: "Входы считаются с {d} — более ранние дни в этот столбец не входят.",
    sessionsSoon: "Подсчёт входов только начинается.",
    loadFailed: "Не удалось загрузить данные активности.", retry: "Повторить",
    rel: { now: "сейчас", m: "мин", h: "ч", d: "дн", fmt: (n, u) => `${n} ${u}` },
    dur: (h, m) => (h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`),
    locale: "ru-RU",
  },
  en: {
    title: "Users Activity", subtitle: "Who's active, how long they spend in the app, and an activity calendar",
    period: "Period", refresh: "Refresh", p7: "7 days", p30: "30 days", p90: "90 days",
    tabs: { profile: "By profile", account: "By user" },
    note: {
      profile: "Each row is one profile — one person. When several Telegram accounts work as one profile, their time is added up in a single row.",
      account: "Each row is one Telegram account (login). An account can work as several profiles — they are listed in the Profiles column.",
    },
    kOnline: "Online now", kToday: "Active today", k30d: "Active 30d",
    kActive: { profile: "Active profiles", account: "Active users" },
    kTracked: { profile: "Tracked profiles", account: "Tracked users" },
    kNew: "New (7d)", kTotalTime: "Total time", cardTime: "Time in app",
    perIdDay: { profile: "/ profile-day", account: "/ user-day" }, perDayShort: "/day",
    hrs: (n) => `${n}h`,
    noOnline: "No one online", coverage30: "30-day coverage", dataSince: "Data since {d}",
    secTrend: "Activity over time", trendSub: "Daily activity and time in app", mMinutes: "Minutes",
    secCalendar: "Activity calendar", calSub: "Last 53 weeks — time in app per day, Tashkent time",
    calAll: { profile: "All profiles", account: "All users" },
    secTop: { profile: "Most active profiles", account: "Most active users" },
    secTable: { profile: "All profiles", account: "All users" },
    searchPh: { profile: "Search profile…", account: "Search user…" },
    colProfile: "Profile", colUser: "User", colRole: "Role", colAccounts: "Accounts", colProfiles: "Profiles",
    colJoined: "Joined", colLastSeen: "Last active", colActiveDays: "Active days", colTotal: "Total time",
    colAvg: "Avg/day", colSessions: "Visits",
    hintSessions: "How many times the app was opened: every return after a break longer than 2.5 minutes is a new visit.",
    hintAccounts: "Telegram accounts that worked as this profile",
    online: "online", never: "never", noMatch: "Nothing matches", emptyTitle: "No activity yet",
    emptyNote: "Tracking just started — data accumulates as people use the app.",
    activeDaysWord: "active days",
    unlinked: "Profile unknown",
    unlinkedHint: "old records from before the profile was stored; which profile they belong to could not be worked out, so they stay with the account.",
    sessionsFrom: "Visits are counted from {d} — earlier days are not in this column.",
    sessionsSoon: "Visits are only starting to be counted.",
    loadFailed: "Could not load activity data.", retry: "Retry",
    rel: { now: "now", m: "m", h: "h", d: "d", fmt: (n, u) => `${n}${u}` },
    dur: (h, m) => (h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`),
    locale: "en-GB",
  },
};

const ROLE_TKEYS = {
  admin: "role.admin", "top-manager": "role.topManager", "shift-manager": "role.manager",
  supervisor: "role.supervisor", leader: "role.leader", "idle-owner": "role.idleOwner", guest: "role.guest",
};
// Roles are categories: generic-first hues in the shared order; guest stays the
// de-emphasis slate.
const ROLE_COLOR = {
  admin: CATEGORY_COLORS[0], "top-manager": CATEGORY_COLORS[1], "shift-manager": CATEGORY_COLORS[2],
  supervisor: CATEGORY_COLORS[3], leader: CATEGORY_COLORS[4], "idle-owner": CATEGORY_COLORS[5],
  guest: FOLD_COLOR,
};

// ── formatting helpers ───────────────────────────────────────────────────────
const fmtDur = (min, T) => {
  const total = Math.round(min || 0);
  return T.dur(Math.floor(total / 60), total % 60);
};
const fmtDate = (iso, T) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString(T.locale, { day: "2-digit", month: "short", year: "numeric" });
};
const shortDay = (iso) => { const [, m, dd] = iso.split("-"); return `${dd}.${m}`; };
const fullDay = (iso) => { const [y, m, dd] = iso.split("-"); return `${dd}.${m}.${y}`; };
// Compact relative time: now · 5 min · 2 h · 3 d · then a short date.
const relTime = (iso, T) => {
  if (!iso) return T.never;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (isNaN(s)) return T.never;
  if (s < 60) return T.rel.now;
  const m = Math.floor(s / 60);
  if (m < 60) return T.rel.fmt(m, T.rel.m);
  const h = Math.floor(m / 60);
  if (h < 24) return T.rel.fmt(h, T.rel.h);
  const d = Math.floor(h / 24);
  if (d < 7) return T.rel.fmt(d, T.rel.d);
  return new Date(iso).toLocaleDateString(T.locale, { day: "2-digit", month: "short" });
};

// One KPI card = one story: primary metric, its closest companion metric,
// and a live footer (sparkline / avatars / coverage bar) instead of dead space.
function StatCard({ icon: Icon, label, accent, live, value, valueSuffix, secLabel, secValue, secAccent, footer }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2.5" style={cardStyle}>
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
      <div className="flex items-baseline gap-1.5 flex-wrap">
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

function AvatarStack({ users, tl, emptyText, withPhotos }) {
  const shown = users.slice(0, 6);
  if (!shown.length) {
    return <div className="flex items-center h-[30px] text-[11px]" style={{ color: "var(--text-4)" }}>{emptyText}</div>;
  }
  return (
    <div className="flex items-center h-[30px]">
      {shown.map((u) => (
        <span key={u.id} title={tl(u.full_name)}
          className="inline-flex rounded-full -ml-1.5 first:ml-0 flex-shrink-0" style={{ border: "2px solid var(--bg-card)" }}>
          <ProfileAvatar name={tl(u.full_name)} colorKey={u.full_name} size={22}
            profileKey={withPhotos ? u.profile_key : undefined} photoVer={withPhotos ? u.photo : undefined} />
        </span>
      ))}
      {users.length > shown.length && (
        <span className="text-[10px] ml-1.5 font-semibold" style={{ color: "var(--text-3)" }}>+{users.length - shown.length}</span>
      )}
    </div>
  );
}

function RoleChip({ role, label }) {
  const c = ROLE_COLOR[role] || FOLD_COLOR;
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
      style={{ background: hexA(c, 0.14), color: c }}>
      {label}
    </span>
  );
}

function RankChip({ n }) {
  const lead = n === 1;
  return (
    <span className="grid place-items-center w-6 h-6 rounded-lg text-[11px] font-bold tabular-nums flex-shrink-0"
      style={{
        background: lead ? "var(--brand-bg)" : "var(--bg-card)",
        color: lead ? "var(--brand-text)" : "var(--text-3)",
        border: `1px solid ${lead ? "var(--brand-border)" : "var(--border)"}`,
      }}>
      {n}
    </span>
  );
}

export default function UsersActivity() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const qc = useQueryClient();

  const [tabRaw, setTab] = usePersistentState("users_activity_tab", "profile");
  const by = tabRaw === "account" ? "account" : "profile";
  const [daysRaw, setDays] = usePersistentState("users_activity_days", 30);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;

  const refresh = useMutation({
    mutationFn: () => qc.invalidateQueries({ queryKey: ["activity"] }),
  });

  const tabOpts = [
    { value: "profile", label: <span className="inline-flex items-center gap-1.5"><IdCard size={14} />{T.tabs.profile}</span> },
    { value: "account", label: <span className="inline-flex items-center gap-1.5"><Smartphone size={14} />{T.tabs.account}</span> },
  ];

  return (
    <Layout title={T.title}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold leading-tight flex items-center gap-2" style={{ color: "var(--text-1)" }}>
              <Activity size={20} style={{ color: "var(--brand-text)" }} /> {T.title}
            </h2>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{T.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedToggle value={days} onChange={setDays} ariaLabel={T.period} className="flex-shrink-0"
              options={[[7, T.p7], [30, T.p30], [90, T.p90]]} />
            <Button variant="secondary" size="lg" icon={<RefreshCw size={15} />}
              loading={refresh.isPending} onClick={() => refresh.mutate()}>
              {T.refresh}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <SegmentedToggle asTabs ariaLabel={T.title} value={by} onChange={setTab} options={tabOpts} />
          <p className="text-[11px] sm:text-xs" style={{ color: "var(--text-3)" }}>{T.note[by]}</p>
        </div>

        {/* Keyed by the tab: its search, sort and calendar pick are its own. */}
        <ActivityView key={by} by={by} days={days} T={T} />
      </div>
    </Layout>
  );
}

function ActivityView({ by, days, T }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const [trendRef, trendW] = useElementWidth();
  const isProfile = by === "profile";

  const [search, setSearch] = usePersistentState(`users_activity_${by}_search`, "");
  const [cal, setCal] = usePersistentState(`users_activity_${by}_cal`, "all");
  const [sort, setSort] = usePersistentState(`users_activity_${by}_sort`, { key: null, dir: "asc" });
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" });

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["activity", "overview", by, days],
    queryFn: () => api.get("/api/activity/overview", { params: { days, by } }).then((r) => r.data),
    refetchInterval: 60_000,   // keeps «online now» fresh
  });

  const kpis = data?.kpis || {};
  const users = useMemo(() => data?.users || [], [data]);
  const daily = data?.daily || [];
  const calendar = data?.calendar || [];

  // A remembered calendar pick that is no longer on the list (a deleted profile,
  // an account quiet for a year) reads as «everyone», never as an empty grid.
  const calKey = cal !== "all" && users.some((u) => u.id === cal) ? cal : "all";
  const { data: personCal, isLoading: calLoading } = useQuery({
    queryKey: ["activity", "heatmap", by, calKey],
    queryFn: () => api.get("/api/activity/heatmap", { params: { person: calKey, by } }).then((r) => r.data),
    enabled: calKey !== "all",
  });

  const roleLabel = (r) => (r && ROLE_TKEYS[r] ? t(ROLE_TKEYS[r]) : (r || "—"));

  const topUsers = useMemo(
    () => users.filter((u) => u.total_minutes > 0).sort((a, b) => b.total_minutes - a.total_minutes).slice(0, 5),
    [users],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (q) {
      list = list.filter((u) => [
        tl(u.full_name), u.full_name, u.username, roleLabel(u.role),
        ...(u.accounts || []).flatMap((a) => [tl(a.name), a.name, a.username]),
        ...(u.profiles || []).flatMap((p) => [tl(p.name), p.name, roleLabel(p.role)]),
      ].filter(Boolean).join(" ").toLowerCase().includes(q));
    }
    if (!sort.key) return list;
    const val = (u) => {
      switch (sort.key) {
        case "user":     return tl(u.full_name || "");
        case "role":     return roleLabel(u.role);
        case "accounts": return (u.accounts || []).length;
        case "profiles": return tl(u.profiles?.[0]?.name || "");
        case "joined":   return u.created_at || "";
        case "last":     return u.last_seen || "";
        case "active":   return u.active_days;
        case "total":    return u.total_minutes;
        case "avg":      return u.avg_minutes;
        case "sessions": return u.sessions ?? -1;
        default:         return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, sort, tl, t]);

  // Two profiles (or two accounts) can carry one name; the picker then says
  // which is which instead of listing the same label twice.
  const nameCount = useMemo(() => {
    const c = new Map();
    users.forEach((u) => c.set(u.full_name, (c.get(u.full_name) || 0) + 1));
    return c;
  }, [users]);
  const identityLabel = (u) => {
    const base = tl(u.full_name);
    if ((nameCount.get(u.full_name) || 0) < 2) return base;
    return `${base} · ${isProfile ? roleLabel(u.role) : (u.username ? `@${u.username}` : u.id)}`;
  };
  const calOpts = [
    { value: "all", label: T.calAll[by] },
    ...[...users].sort((a, b) => tl(a.full_name).localeCompare(tl(b.full_name)))
      .map((u) => ({ value: u.id, label: identityLabel(u) })),
  ];
  const calName = calKey === "all" ? T.calAll[by] : identityLabel(users.find((u) => u.id === calKey));

  if (isError && !data) {
    return (
      <div className="rounded-2xl px-4 py-8 flex flex-col items-center text-center gap-3" style={cardStyle}>
        <span className="grid place-items-center w-10 h-10 rounded-xl" style={{ background: hexA("#ef4444", 0.12), color: "#ef4444" }}>
          <TriangleAlert size={20} />
        </span>
        <div className="text-sm" style={{ color: "var(--text-2)" }}>{T.loadFailed}</div>
        <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>{T.retry}</Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
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
    );
  }

  const tracked = kpis.tracked ?? kpis.tracked_users ?? 0;
  const isEmpty = tracked === 0;
  const onlineUsers = users.filter((u) => u.online);
  // Share of the tracked identities that were active in the last 30 days.
  const coverage = tracked ? Math.min(100, Math.round(((kpis.active_30d || 0) / tracked) * 100)) : 0;

  // Tracking is forward-only, so early on most of the window is a flat run of
  // zero days. Trim the dead prefix (keeping ≥7 points and one leading zero for
  // context) so the chart tells the story instead of showing the void.
  const firstIdx = daily.findIndex((d) => d.minutes > 0 || d.active_users > 0);
  const trimStart = firstIdx > 1 ? Math.max(0, Math.min(firstIdx - 1, daily.length - 7)) : 0;
  const shownDaily = trimStart > 0 ? daily.slice(trimStart) : daily;
  const firstDataDay = firstIdx >= 0 ? daily[firstIdx].day : null;

  // ── trend chart: minutes (columns) + active identities (line), dual axis ──
  const cats = shownDaily.map((d) => shortDay(d.day));
  const activeName = T.kActive[by];
  const trendOpts = {
    chart: { type: "line", stacked: false, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", background: "transparent" },
    theme: chartTheme,
    stroke: { width: [0, 2.5], curve: "smooth" },
    colors: [hexA(C_TIME, 0.75), C_ACTIVE],
    fill: { type: ["solid", "solid"] },
    plotOptions: { bar: { columnWidth: shownDaily.length > 45 ? "82%" : shownDaily.length > 14 ? "58%" : "40%", borderRadius: 3 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: cats,
      // Labels thin to the chart's MEASURED width; the second (right) y-axis
      // takes a gutter of its own, so it comes off before the fit.
      tickAmount: ticksForWidth(trendW ? Math.max(0, trendW - AXIS_GUTTER_PX) : 0, cats.length, axisLabelPx(cats)),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      { seriesName: T.mMinutes, min: 0, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) } },
      { seriesName: activeName, opposite: true, min: 0, labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) } },
    ],
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    legend: { position: "top", horizontalAlign: "right", labels: { colors: legendColor }, markers: { width: 10, height: 10, radius: 3 } },
    markers: { size: shownDaily.length <= 31 ? 3 : 0, strokeWidth: 0, hover: { size: 5 } },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false },
  };
  const trendSeries = [
    { name: T.mMinutes, type: "column", data: shownDaily.map((d) => d.minutes) },
    { name: activeName, type: "line", data: shownDaily.map((d) => d.active_users) },
  ];

  // Visits are counted forward only: say so whenever the window reaches back
  // past the first counted day, or a short count reads as a quiet month.
  const windowStart = daily[0]?.day;
  const sessionsNote = !data.sessions_from ? T.sessionsSoon
    : windowStart && windowStart < data.sessions_from ? T.sessionsFrom.replace("{d}", fullDay(data.sessions_from))
    : null;
  const hasUnlinked = isProfile
    ? users.some((u) => !u.resolved)
    : users.some((u) => (u.profiles || []).some((p) => !p.resolved));

  const noteCls = "flex items-start gap-1.5 text-[11px]";

  return (
    <div className="space-y-4">
      {isEmpty && (
        <div className="rounded-2xl px-4 py-3 text-xs flex items-start gap-2" style={{ background: hexA(C_ACTIVE, 0.08), border: `1px solid ${hexA(C_ACTIVE, 0.25)}`, color: "var(--text-2)" }}>
          <Activity size={15} style={{ color: C_ACTIVE, flexShrink: 0, marginTop: 1 }} />
          <div><span className="font-semibold" style={{ color: "var(--text-1)" }}>{T.emptyTitle}.</span> {T.emptyNote}</div>
        </div>
      )}

      {/* KPI cards — 4 stories: live now, engagement, time in app, audience */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Radio} label={T.kOnline} accent={C_ONLINE} live={(kpis.online_now ?? 0) > 0}
          value={kpis.online_now ?? 0}
          secLabel={T.kToday} secValue={kpis.active_today ?? 0}
          footer={<AvatarStack users={onlineUsers} tl={tl} emptyText={T.noOnline} withPhotos={isProfile} />} />

        <StatCard icon={Users} label={T.kActive[by]} accent={C_ACTIVE}
          value={kpis.active_7d ?? 0} valueSuffix={`/ ${T.p7}`}
          secLabel={T.k30d} secValue={kpis.active_30d ?? 0}
          footer={<Sparkline values={shownDaily.map((d) => d.active_users)} color={C_ACTIVE} />} />

        <StatCard icon={Clock} label={T.cardTime} accent={C_TIME}
          value={fmtDur(kpis.avg_minutes_day, T)} valueSuffix={T.perIdDay[by]}
          secLabel={T.kTotalTime} secValue={kpis.total_hours != null ? T.hrs(kpis.total_hours) : "—"}
          footer={<Sparkline values={shownDaily.map((d) => d.minutes)} color={C_TIME} />} />

        <StatCard icon={CircleUserRound} label={T.kTracked[by]} accent={C_NEW}
          value={tracked}
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {trimStart > 0 && firstDataDay && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: hexA(C_ACTIVE, 0.12), border: `1px solid ${hexA(C_ACTIVE, 0.3)}`, color: C_ACTIVE }}>
                  {T.dataSince.replace("{d}", shortDay(firstDataDay))}
                </span>
              )}
              <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-4)" }}>{T.trendSub}</span>
            </div>
          } />
        <div ref={trendRef} className="px-1 pt-2 pb-1">
          <ReactApexChart options={trendOpts} series={trendSeries} type="line" height={260} />
        </div>
      </div>

      {/* Contribution calendar */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <SectionHead icon={CalendarDays}
          title={
            <span className="flex items-center gap-2 min-w-0">
              {T.secCalendar}
              <span className="text-[11px] font-normal normal-case tracking-normal truncate" style={{ color: "var(--text-4)" }}>· {calName}</span>
            </span>
          }
          right={
            <StyledSelect value={calKey} onChange={setCal} options={calOpts} className="w-52 max-w-full"
              searchable searchPlaceholder={T.searchPh[by]} />
          } />
        <div className="p-4">
          <p className="text-[11px] mb-3" style={{ color: "var(--text-3)" }}>{T.calSub}</p>
          {calKey !== "all" && calLoading ? (
            <SkeletonChart className="h-40" />
          ) : (
            <ContributionHeatmap
              series={calKey === "all" ? calendar : (personCal?.series || [])}
              valueKey="minutes"
              accent={C_TIME}
              formatValue={(v) => fmtDur(v, T)}
            />
          )}
        </div>
      </div>

      {/* Most active identities */}
      {topUsers.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <SectionHead icon={Trophy} title={T.secTop[by]} />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topUsers.map((u, i) => {
              const maxT = topUsers[0].total_minutes || 1;
              const sub = isProfile ? roleLabel(u.role) : (u.profiles?.[0] ? tl(u.profiles[0].name) : "");
              return (
                <div key={u.id} className="rounded-xl p-3 min-w-0" style={{ background: "var(--bg-inner)" }}>
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <RankChip n={i + 1} />
                    <ProfileAvatar name={tl(u.full_name)} colorKey={u.full_name} size={28}
                      profileKey={isProfile ? u.profile_key : undefined} photoVer={isProfile ? u.photo : undefined} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={tl(u.full_name)}>{tl(u.full_name)}</div>
                      {sub && <div className="text-[10px] truncate" style={{ color: "var(--text-4)" }}>{sub}</div>}
                    </div>
                  </div>
                  <div className="text-lg font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{fmtDur(u.total_minutes, T)}</div>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--bg-card)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(u.total_minutes / maxT) * 100}%`, background: C_TIME }} />
                  </div>
                  <div className="text-[10px] mt-1.5" style={{ color: "var(--text-4)" }}>
                    {u.active_days} {T.activeDaysWord} · {fmtDur(u.avg_minutes, T)}{T.perDayShort}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* The register — one row per identity of this tab */}
      <div>
        <TableCard
          icon={isProfile ? IdCard : Smartphone}
          title={T.secTable[by]}
          right={<span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>{rows.length}</span>}
          toolbar={<SearchInput value={search} onChange={setSearch} placeholder={T.searchPh[by]} className="w-full sm:w-56" />}
        >
          <thead>
            <tr>
              <Th icon={isProfile ? IdCard : Smartphone} label={isProfile ? T.colProfile : T.colUser} k="user" sort={sort} onSort={onSort} />
              {isProfile ? (
                <>
                  <Th icon={Shield} label={T.colRole} k="role" sort={sort} onSort={onSort} cls="hidden sm:table-cell" />
                  <Th icon={Smartphone} label={T.colAccounts} k="accounts" sort={sort} onSort={onSort} hint={T.hintAccounts} cls="hidden md:table-cell" />
                </>
              ) : (
                <>
                  <Th icon={IdCard} label={T.colProfiles} k="profiles" sort={sort} onSort={onSort} cls="hidden sm:table-cell" />
                  <Th icon={CalendarClock} label={T.colJoined} k="joined" sort={sort} onSort={onSort} cls="hidden lg:table-cell" />
                </>
              )}
              <Th icon={Clock} label={T.colLastSeen} k="last" sort={sort} onSort={onSort} />
              <Th icon={CalendarDays} label={T.colActiveDays} k="active" sort={sort} onSort={onSort} align="right" cls="hidden md:table-cell" />
              <Th icon={Timer} label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" />
              <Th icon={TrendingUp} label={T.colAvg} k="avg" sort={sort} onSort={onSort} align="right" cls="hidden sm:table-cell" />
              <Th icon={LogIn} label={T.colSessions} k="sessions" sort={sort} onSort={onSort} align="right" hint={T.hintSessions} cls="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const lead = u.profiles?.[0];
              return (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex-shrink-0">
                        <ProfileAvatar name={tl(u.full_name)} colorKey={u.full_name} size={28}
                          profileKey={isProfile ? u.profile_key : undefined} photoVer={isProfile ? u.photo : undefined} />
                        {u.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: C_ONLINE, border: "2px solid var(--bg-card)" }} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[220px]" style={{ color: "var(--text-1)" }} title={tl(u.full_name)}>{tl(u.full_name)}</div>
                        {isProfile ? (
                          !u.resolved ? (
                            <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-3)" }}>
                              <Link2Off size={11} className="flex-shrink-0" /> {T.unlinked}
                            </div>
                          ) : (
                            <div className="sm:hidden text-[10px] truncate" style={{ color: "var(--text-4)" }}>{roleLabel(u.role)}</div>
                          )
                        ) : (
                          <>
                            {u.username && <div className="text-[10px] truncate" style={{ color: "var(--text-4)" }}>@{u.username}</div>}
                            {lead && <div className="sm:hidden text-[10px] truncate" style={{ color: "var(--text-3)" }}>{tl(lead.name)}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {isProfile ? (
                    <>
                      <td className="px-3 py-2 hidden sm:table-cell"><RoleChip role={u.role} label={roleLabel(u.role)} /></td>
                      <td className="px-3 py-2 hidden md:table-cell"
                        title={(u.accounts || []).map((a) => `${tl(a.name)}${a.username ? ` (@${a.username})` : ""} — ${fmtDur(a.minutes, T)}`).join("\n")}>
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{(u.accounts || []).length}</span>
                          <span className="truncate max-w-[160px]" style={{ color: "var(--text-3)" }}>
                            {tl(u.accounts?.[0]?.name || "")}{(u.accounts || []).length > 1 ? ` +${u.accounts.length - 1}` : ""}
                          </span>
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 hidden sm:table-cell"
                        title={(u.profiles || []).map((p) => `${tl(p.name)} · ${roleLabel(p.role)}${p.resolved ? "" : ` (${T.unlinked})`} — ${fmtDur(p.minutes, T)}`).join("\n")}>
                        {lead && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <RoleChip role={lead.role} label={roleLabel(lead.role)} />
                            <span className="truncate max-w-[180px]" style={{ color: lead.resolved ? "var(--text-2)" : "var(--text-4)" }}>{tl(lead.name)}</span>
                            {u.profiles.length > 1 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 tabular-nums"
                                style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                                +{u.profiles.length - 1}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDate(u.created_at, T)}</td>
                    </>
                  )}

                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: u.online ? C_ONLINE : "var(--text-4)" }} />
                      <span style={{ color: u.online ? C_ONLINE : "var(--text-2)" }}>{u.online ? T.online : relTime(u.last_seen, T)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: "var(--text-2)" }}>{u.active_days}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: "var(--text-1)" }}>{fmtDur(u.total_minutes, T)}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell whitespace-nowrap" style={{ color: "var(--text-2)" }}>{fmtDur(u.avg_minutes, T)}</td>
                  <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell" style={{ color: "var(--text-3)" }}>{u.sessions ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>{search ? T.noMatch : T.emptyTitle}</td></tr>
            )}
          </tbody>
        </TableCard>

        {(sessionsNote || hasUnlinked) && (
          <div className="mt-2 px-1 space-y-1">
            {sessionsNote && (
              <p className={noteCls} style={{ color: "var(--text-3)" }}>
                <LogIn size={12} className="flex-shrink-0 mt-[1px]" /> <span>{sessionsNote}</span>
              </p>
            )}
            {hasUnlinked && (
              <p className={noteCls} style={{ color: "var(--text-3)" }}>
                <Link2Off size={12} className="flex-shrink-0 mt-[1px]" />
                <span><span className="font-semibold">{T.unlinked}</span> — {T.unlinkedHint}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
