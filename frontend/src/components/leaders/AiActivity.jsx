import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, CheckCircle2, AlertTriangle, XCircle, CalendarRange, Clock, User,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/* ══ what the AI has actually been doing ══════════════════════════════════════
 *
 * The progress strip is arithmetic: a percentage, a remainder, an ETA. None of
 * it answers the question anybody has while metered quota is being spent —
 * *whose reports is it judging, and what is it deciding about them?* «1 129 of
 * 1 174» is equally consistent with a healthy run and with one that has flagged
 * every photo of one unit because their board was moved.
 *
 * So the strip is now a button, and this is behind it. Three readings of the
 * same set, in the order the question is asked:
 *
 *   1. the run itself — is it alive, whose slice, how far, how long.
 *   2. WHO — one row per leader, so "has this unit been covered" is a glance
 *      rather than a scroll.
 *   3. WHAT — the newest verdicts in order, the only view in which a run gone
 *      wrong (every row flagged, every row errored) is obvious at a look.
 *
 * Admin-only, like every other AI surface: the endpoint behind it tests the JWT
 * role itself, and the strip that opens it never renders for anyone else.
 */

const BRAND = "#C8973F";
const GOOD = "#22c55e";
const BAD = "#ef4444";
const WARN = "#eab308";
const FLAT = "#94a3b8";

const FLAGS = ["off_topic", "not_proven", "date_mismatch", "no_date", "unreadable"];
const FLAG_TONE = {
  off_topic: BAD, not_proven: BAD,
  date_mismatch: BRAND, no_date: BRAND, unreadable: FLAT,
};

const TXT = {
  uz: {
    title: "AI tekshiruvi — tafsilotlar",
    subLive: "Hozir nima tekshirilmoqda",
    subIdle: "Oxirgi tekshiruvlar",
    close: "Yopish",
    winRun: "Shu tekshiruv boshidan",
    win24: "Oxirgi 24 soat",
    floor: "AI tekshiruvi {t} dan boshlanadi",
    by: "boshlagan: {t}", byAuto: "o'zi boshladi",
    scope: { unchecked: "Tekshirilmaganlar", flagged: "Shubhalilar", clean: "Tozalar", all: "Hammasi" },
    stChecked: "Tekshirildi", stClean: "Toza", stFlagged: "Shubhali", stErr: "Xatolik",
    stQueued: "Navbatda",
    tabWho: "Kimlar", tabWhat: "Xulosalar", tabQueued: "Navbatda",
    thLeader: "Lider", thSup: "Brigadir", thShift: "Smena", thDays: "Kun",
    thRows: "Tekshirildi", thClean: "Toza", thFlag: "Shubhali", thLast: "Oxirgi",
    thTasks: "Vazifa", thReports: "Hisobot", thRange: "Sanalar",
    thQueued: "Navbatga qo'yilgan", thDate: "Sana", thLeaders: "Lider",
    qWhen: "Qachon navbatga qo'yilgan",
    qWhenHint: "Bir daqiqada minglab qator paydo bo'lsa — bu bitta tugma bosilgani. Kun bo'yi bittalab kelsa — hisobotlar odatdagidek kelmoqda.",
    qCounts: "{n} ta vazifa · {r} ta hisobot · {l} ta lider",
    qTotals: "{n} ta vazifa · {r} ta hisobot · {l} ta lider · {s} ta brigadir",
    qRange: "Hisobot sanalari: {a} — {b}",
    qWho: "Kimlar", qDates: "Sanalar",
    qEmpty: "Navbat bo'sh",
    qEmptyBody: "Hozir AI ga yuborilgan, lekin hali tekshirilmagan hisobot yo'q.",
    qCapped: "Faqat oxirgi {n} ta qator ko'rsatilyapti — navbat bundan uzunroq.",
    emptyTitle: "Hali hech narsa tekshirilmagan",
    emptyBody: "Bu oraliqda AI hech qanday xulosa yozmagan. Hisobotlar kelganda tekshiruv o'zi boshlanadi.",
    capped: "Faqat oxirgi {n} ta xulosa ko'rsatilyapti.",
    okOne: "Toza", flagOne: "Shubhali", errOne: "Xatolik",
    ruled: "hukm chiqarilgan",
    sheet: "Forma", bot: "Bot",
    f_off_topic: "Rasm boshqa narsa haqida", f_not_proven: "Bajarilgani ko'rinmaydi",
    f_date_mismatch: "Sana oynadan tashqarida", f_no_date: "Rasmda sana yo'q",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    title: "AI текшируви — тафсилотлар",
    subLive: "Ҳозир нима текширилмоқда",
    subIdle: "Охирги текширувлар",
    close: "Ёпиш",
    winRun: "Шу текширув бошидан",
    win24: "Охирги 24 соат",
    floor: "AI текшируви {t} дан бошланади",
    by: "бошлаган: {t}", byAuto: "ўзи бошлади",
    scope: { unchecked: "Текширилмаганлар", flagged: "Шубҳалилар", clean: "Тозалар", all: "Ҳаммаси" },
    stChecked: "Текширилди", stClean: "Тоза", stFlagged: "Шубҳали", stErr: "Хатолик",
    stQueued: "Навбатда",
    tabWho: "Кимлар", tabWhat: "Хулосалар", tabQueued: "Навбатда",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена", thDays: "Кун",
    thRows: "Текширилди", thClean: "Тоза", thFlag: "Шубҳали", thLast: "Охирги",
    thTasks: "Вазифа", thReports: "Ҳисобот", thRange: "Саналар",
    thQueued: "Навбатга қўйилган", thDate: "Сана", thLeaders: "Лидер",
    qWhen: "Қачон навбатга қўйилган",
    qWhenHint: "Бир дақиқада минглаб қатор пайдо бўлса — бу битта тугма босилгани. Кун бўйи биттадан келса — ҳисоботлар одатдагидек келмоқда.",
    qCounts: "{n} та вазифа · {r} та ҳисобот · {l} та лидер",
    qTotals: "{n} та вазифа · {r} та ҳисобот · {l} та лидер · {s} та бригадир",
    qRange: "Ҳисобот саналари: {a} — {b}",
    qWho: "Кимлар", qDates: "Саналар",
    qEmpty: "Навбат бўш",
    qEmptyBody: "Ҳозир AI га юборилган, лекин ҳали текширилмаган ҳисобот йўқ.",
    qCapped: "Фақат охирги {n} та қатор кўрсатиляпти — навбат бундан узунроқ.",
    emptyTitle: "Ҳали ҳеч нарса текширилмаган",
    emptyBody: "Бу оралиқда AI ҳеч қандай хулоса ёзмаган. Ҳисоботлар келганда текширув ўзи бошланади.",
    capped: "Фақат охирги {n} та хулоса кўрсатиляпти.",
    okOne: "Тоза", flagOne: "Шубҳали", errOne: "Хатолик",
    ruled: "ҳукм чиқарилган",
    sheet: "Форма", bot: "Бот",
    f_off_topic: "Расм бошқа нарса ҳақида", f_not_proven: "Бажарилгани кўринмайди",
    f_date_mismatch: "Сана ойнадан ташқарида", f_no_date: "Расмда сана йўқ",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    title: "Проверка ИИ — подробности",
    subLive: "Что проверяется сейчас",
    subIdle: "Последние проверки",
    close: "Закрыть",
    winRun: "С начала этой проверки",
    win24: "За последние 24 часа",
    floor: "Проверка ИИ начинается с {t}",
    by: "запустил: {t}", byAuto: "запустилась сама",
    scope: { unchecked: "Непроверенные", flagged: "Сомнительные", clean: "Чистые", all: "Все" },
    stChecked: "Проверено", stClean: "Чисто", stFlagged: "Сомнительно", stErr: "Ошибки",
    stQueued: "В очереди",
    tabWho: "Кого проверили", tabWhat: "Заключения", tabQueued: "В очереди",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена", thDays: "Дней",
    thRows: "Проверено", thClean: "Чисто", thFlag: "Сомнительно", thLast: "Последняя",
    thTasks: "Задач", thReports: "Отчётов", thRange: "Даты",
    thQueued: "Поставлено", thDate: "Дата", thLeaders: "Лидеров",
    qWhen: "Когда поставлено в очередь",
    qWhenHint: "Тысячи строк за одну минуту — это одно нажатие кнопки. Единицы в течение дня — отчёты приходят как обычно.",
    qCounts: "задач: {n} · отчётов: {r} · лидеров: {l}",
    qTotals: "задач: {n} · отчётов: {r} · лидеров: {l} · бригадиров: {s}",
    qRange: "Даты отчётов: {a} — {b}",
    qWho: "Кого", qDates: "Даты",
    qEmpty: "Очередь пуста",
    qEmptyBody: "Сейчас нет отчётов, отправленных ИИ и ещё не проверенных.",
    qCapped: "Показаны только последние {n} строк — очередь длиннее.",
    emptyTitle: "Пока ничего не проверено",
    emptyBody: "За этот период ИИ не записал ни одного заключения. Проверка запускается сама, когда приходят отчёты.",
    capped: "Показаны только последние {n} заключений.",
    okOne: "Чисто", flagOne: "Сомнительно", errOne: "Ошибка",
    ruled: "есть решение",
    sheet: "Форма", bot: "Бот",
    f_off_topic: "Фото не о том", f_not_proven: "Выполнение не видно",
    f_date_mismatch: "Дата вне окна", f_no_date: "На фото нет даты",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    title: "AI review — details",
    subLive: "What is being checked right now",
    subIdle: "Recent checks",
    close: "Close",
    winRun: "Since this run started",
    win24: "Last 24 hours",
    floor: "AI review starts from {t}",
    by: "started by {t}", byAuto: "started itself",
    scope: { unchecked: "Unchecked", flagged: "Flagged", clean: "Clean", all: "All" },
    stChecked: "Checked", stClean: "Clean", stFlagged: "Flagged", stErr: "Errors",
    stQueued: "Queued",
    tabWho: "Who was checked", tabWhat: "Verdicts", tabQueued: "Queued",
    thLeader: "Leader", thSup: "Supervisor", thShift: "Shift", thDays: "Days",
    thRows: "Checked", thClean: "Clean", thFlag: "Flagged", thLast: "Last",
    thTasks: "Tasks", thReports: "Reports", thRange: "Dates",
    thQueued: "Queued at", thDate: "Date", thLeaders: "Leaders",
    qWhen: "When it was queued",
    qWhenHint: "Thousands of rows in one minute is one press of one button. Ones and twos across the day is reports arriving normally.",
    qCounts: "{n} tasks · {r} reports · {l} leaders",
    qTotals: "{n} tasks · {r} reports · {l} leaders · {s} supervisors",
    qRange: "Report dates: {a} — {b}",
    qWho: "Who", qDates: "Dates",
    qEmpty: "The queue is empty",
    qEmptyBody: "Nothing has been sent to the AI and left unchecked.",
    qCapped: "Only the newest {n} rows are shown — the queue is longer.",
    emptyTitle: "Nothing checked yet",
    emptyBody: "The AI has written no verdicts in this window. Review starts by itself as reports arrive.",
    capped: "Only the latest {n} verdicts are shown.",
    okOne: "Clean", flagOne: "Flagged", errOne: "Error",
    ruled: "ruled on",
    sheet: "Form", bot: "Bot",
    f_off_topic: "Photo is about something else", f_not_proven: "Completion not visible",
    f_date_mismatch: "Date outside the window", f_no_date: "No date on the photo",
    f_unreadable: "Photo unreadable",
  },
};

const fmt = (s, v) => String(s).replace(/\{[nt]\}/g, v);
/** Multi-slot version: every language puts these counts in its own order, so
 *  they are named rather than positional. */
const tpl = (s, vars) =>
  String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toLocaleString());
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
const hhmm = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
/** Day AND time. A queue can hold rows submitted a week apart, so the bare
 *  clock face `hhmm` prints would make two different days look like one. */
const dtm = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** "12.08 — 13.08", or one date when the range is a single day. */
const span = (a, b) => (a && b ? (a === b ? ddmm(a) : `${ddmm(a)} — ${ddmm(b)}`) : "—");

const TILE_COLS = {
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
};

/** One number and what it means. Four of these are the whole answer to "how did
 *  this window go", and they sit above the tables because that is the order the
 *  question is asked: the shape first, the rows only if the shape is wrong. */
const Tile = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-xl px-3 py-2.5 min-w-0"
    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={12} className="flex-shrink-0" style={{ color: tone }} />
      <span className="text-[10px] font-bold uppercase tracking-wider truncate"
        style={{ color: "var(--text-4)" }}>{label}</span>
    </div>
    <span className="text-lg font-bold tabular-nums leading-none" style={{ color: tone }}>
      {value.toLocaleString()}
    </span>
  </div>
);

/** Verdict as a word plus a colour, never a colour alone. */
const StatusChip = ({ status, T }) => {
  const [tone, label] = status === "flagged" ? [BAD, T.flagOne]
    : status === "error" ? [WARN, T.errOne] : [GOOD, T.okOne];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ background: `${tone}1F`, color: tone, border: `1px solid ${tone}55` }}>
      <i className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone }} />
      {label}
    </span>
  );
};

export default function AiActivity({ open, onClose, progress }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const [tab, setTab] = useState("who");
  // Once the operator picks a tab it is theirs. Without this the auto-landing
  // below would drag them back to «Navbatda» on every poll.
  const [tabPicked, setTabPicked] = useState(false);
  // Inside the queue tab: the same set read by person or by report date. Both
  // are asked ("whose data went in" and "which days went in") and neither is a
  // filter on the other, so they are two readings rather than one table.
  const [qView, setQView] = useState("who");

  const live = !!progress?.active;

  const { data, isLoading } = useQuery({
    queryKey: ["leader-ai-activity"],
    queryFn: () => api.get("/api/leader-ai/activity", { params: { limit: 60 } })
      .then((r) => r.data),
    enabled: open,
    // Follows the run: a live drain writes a verdict every few seconds and a
    // feed that does not move looks broken. Idle, the window is the last 24
    // hours and nothing in it changes without a run.
    refetchInterval: open && live ? 5000 : false,
  });

  /* ── the queue, read from the other end ────────────────────────────────────
   * Everything above is keyed off `reviewed_at` — what the reviewer has already
   * DECIDED. That leaves the most expensive thing on the screen invisible: the
   * work already submitted and not yet paid for. Fetched only when the tab is
   * opened, because it walks the whole queue rather than counting it. */
  const { data: q, isLoading: qLoading } = useQuery({
    queryKey: ["leader-ai-queue"],
    queryFn: () => api.get("/api/leader-ai/activity/queue").then((r) => r.data),
    enabled: open && tab === "queued",
    refetchInterval: open && tab === "queued" && live ? 10000 : false,
  });

  // Land on the tab that has something to say. A window with no verdicts and a
  // queue of thousands opened on «Kimlar» — an empty table — which reads as
  // "the AI has done nothing", the opposite of what is happening.
  const noVerdicts = !!data && !data.recent?.length;
  const hasQueue = (data?.queuedCount || 0) > 0;
  useEffect(() => {
    if (open && !tabPicked && noVerdicts && hasQueue) setTab("queued");
  }, [open, tabPicked, noVerdicts, hasQueue]);
  // Reopening asks the question again from the top.
  useEffect(() => { if (!open) { setTabPicked(false); setTab("who"); } }, [open]);

  if (!open) return null;

  const totals = data?.totals || {};
  const people = data?.people || [];
  const recent = data?.recent || [];
  const queuedN = data?.queuedCount || 0;
  const qTot = q?.totals || {};
  const qGroups = q?.groups || [];
  const qDates = q?.dates || [];
  const qBursts = q?.bursts || [];
  // A queue with nothing judged yet is exactly the state worth opening this
  // for, so an empty verdict feed must not blank the whole modal.
  const nothing = !isLoading && !recent.length && !queuedN;

  const p = progress;
  const pct = live && p?.total
    ? Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100)) : null;

  return (
    <Modal open onClose={onClose} maxWidth="max-w-3xl"
      title={T.title} subtitle={live ? T.subLive : T.subIdle}
      icon={<Sparkles size={16} />}
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}>

      {/* ── the run, spelled out ──────────────────────────────────────────────
          The strip that opened this had room for a percentage and little else.
          Here the same run says which slice it covers, who started it and how
          far it has got — the three things that make a number believable. */}
      <div className="rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0${live ? " animate-pulse" : ""}`}
            style={{ background: live ? BRAND : FLAT }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {data?.scoped ? T.winRun : T.win24}
          </span>
          {pct != null && (
            <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
              {p.done.toLocaleString()} / {p.total.toLocaleString()} · {pct}%
            </span>
          )}
        </div>

        {pct != null && (
          <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "var(--bg-inner)" }}
            role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
            <div className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, background: BRAND }} />
          </div>
        )}

        <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap text-[11px]"
          style={{ color: "var(--text-4)" }}>
          {/* WHOSE rows, in words. A run narrowed to one brigadir is otherwise
              indistinguishable from one over the whole plant. */}
          {live && p?.scope && (
            <span>{T.scope[p.scope] || p.scope}
              {p.from || p.to ? ` · ${(p.from || "…").slice(5)}–${(p.to || "…").slice(5)}` : ""}
              {p.narrow?.length ? ` · ${p.narrow.join(" · ")}` : ""}</span>
          )}
          {live && <><span>·</span><span>{p?.by ? fmt(T.by, p.by) : T.byAuto}</span></>}
          {/* The floor. Every "why was this old day never checked" question ends
              here, and it used to be a settings row nobody could read. */}
          {data?.floor && (
            <span className="inline-flex items-center gap-1 ml-auto">
              <CalendarRange size={11} />{fmt(T.floor, ddmm(data.floor))}
            </span>
          )}
        </div>
      </div>

      {/* What the window came to. Errors only when there are some — a standing
          «0 errors» makes a clean run look like it has a problem to read. */}
      {/* Class strings spelled out rather than built, so Tailwind's scanner can
          see them. Two columns on a phone once there are more than three. */}
      <div className={`grid gap-2 ${
        TILE_COLS[3 + (totals.errors ? 1 : 0) + (queuedN ? 1 : 0)]}`}>
        <Tile icon={Sparkles} label={T.stChecked} value={totals.judged || 0} tone="var(--text-1)" />
        <Tile icon={CheckCircle2} label={T.stClean} value={totals.clean || 0} tone={GOOD} />
        <Tile icon={AlertTriangle} label={T.stFlagged} value={totals.flagged || 0} tone={BAD} />
        {!!totals.errors && (
          <Tile icon={XCircle} label={T.stErr} value={totals.errors} tone={WARN} />
        )}
        {/* The tile the other four could not show: work SUBMITTED, not yet
            judged. It is the number quota will be spent on next, and it was the
            one figure this view had no way to state. */}
        {!!queuedN && (
          <Tile icon={Clock} label={T.stQueued} value={queuedN} tone={BRAND} />
        )}
      </div>

      {isLoading && <SkeletonBlock className="h-64 rounded-2xl" />}

      {nothing && (
        <EmptyState icon={Sparkles} title={T.emptyTitle} message={T.emptyBody}
          showUploadLink={false} />
      )}

      {!isLoading && !nothing && (
        <>
          <div>
            <SegmentedToggle asTabs scrollable ariaLabel={T.title} value={tab}
              onChange={(v) => { setTabPicked(true); setTab(v); }}
              options={[
                { value: "who", label: `${T.tabWho} · ${people.length}` },
                { value: "what", label: `${T.tabWhat} · ${recent.length}` },
                { value: "queued", label: `${T.tabQueued} · ${queuedN.toLocaleString()}` },
              ]} />
          </div>

          {/* ── WHO ────────────────────────────────────────────────────────────
              The literal answer to "whose data has been reviewed". Sorted by
              flags then volume, server-side: the unit worth opening is the one
              with decisions behind it, and ninety leaders in alphabetical order
              bury it. */}
          {tab === "who" && (
            <TableCard maxHeight="46vh">
              <thead>
                <tr>
                  <Th label={T.thLeader} icon={User} />
                  <Th label={T.thSup} cls="hidden sm:table-cell" />
                  <Th label={T.thShift} align="center" />
                  <Th label={T.thDays} align="center" cls="hidden sm:table-cell" />
                  <Th label={T.thRows} align="right" />
                  <Th label={T.thClean} align="right" cls="hidden sm:table-cell" />
                  <Th label={T.thFlag} align="right" />
                  <Th label={T.thLast} align="right" cls="hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {people.map((r) => (
                  <tr key={`${r.leaderId || "x"}-${r.leader}`}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{r.leader}</td>
                    <td className="px-3 py-2 hidden sm:table-cell" style={{ color: "var(--text-3)" }}>{r.supervisor}</td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                      {r.shift ? `S${r.shift}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums hidden sm:table-cell"
                      style={{ color: "var(--text-3)" }}>{r.days}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "var(--text-1)" }}>{r.rows}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                      style={{ color: r.clean ? GOOD : "var(--text-4)" }}>{r.clean}</td>
                    {/* Zero flags stay muted — the point of the column is the
                        rows that are NOT zero. */}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: r.flagged ? BAD : "var(--text-4)" }}>{r.flagged}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                      style={{ color: "var(--text-4)" }}>{hhmm(r.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}

          {/* ── WHAT ───────────────────────────────────────────────────────────
              Newest first, with the flags in words. This is the view where a run
              that has gone wrong announces itself: forty rows, every one
              flagged with the same reason, is a criteria bug and not forty
              careless leaders. */}
          {tab === "what" && (
            <div className="rounded-2xl overflow-hidden overflow-y-auto"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", maxHeight: "46vh" }}>
              {recent.map((it, i) => (
                <div key={it.ref} className="px-3 py-2.5 flex items-start gap-2.5"
                  style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                  <span className="text-[11px] tabular-nums pt-0.5 flex-shrink-0 inline-flex items-center gap-1"
                    style={{ color: "var(--text-4)" }}>
                    <Clock size={10} />{hhmm(it.reviewedAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                        {it.leader}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                        {ddmm(it.date)}{it.shift ? ` · S${it.shift}` : ""} · {it.source === "bot" ? T.bot : T.sheet}
                      </span>
                      <StatusChip status={it.status} T={T} />
                      {/* A flag a human has already ruled on is not an open
                          question — say so rather than showing it as one. */}
                      {it.resolution && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                          style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>
                          {T.ruled}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                      {it.taskLabel}
                    </p>
                    {!!it.flags?.length && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {it.flags.filter((f) => FLAGS.includes(f)).map((f) => (
                          <span key={f} className="inline-flex items-center gap-1 text-[10px]"
                            style={{ color: FLAG_TONE[f] || FLAT }}>
                            <i className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: FLAG_TONE[f] || FLAT }} />
                            {T[`f_${f}`] || f}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.status === "error" && it.error && (
                      <p className="text-[11px] mt-1 break-words" style={{ color: WARN }}>{it.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── QUEUED ─────────────────────────────────────────────────────────
              What has been SENT and not yet judged. The two tabs above read
              `reviewed_at`, so between them they can describe every verdict
              already paid for and not one row of the bill still coming. This is
              that bill, named: whose reports are in it, which report dates it
              covers, and — first, because it is the question a queue nobody
              expected actually raises — the minute each batch was queued. */}
          {tab === "queued" && (
            <>
              {qLoading && <SkeletonBlock className="h-64 rounded-2xl" />}

              {!qLoading && !qGroups.length && (
                <EmptyState icon={Clock} title={T.qEmpty} message={T.qEmptyBody}
                  showUploadLink={false} />
              )}

              {!qLoading && !!qGroups.length && (
                <>
                  {/* WHEN. A submission is a spike in `created_at`: one minute
                      holding two thousand rows is one press, and no other view
                      on this platform can tell that from a normal day's
                      arrivals. It goes first because it is the only line here
                      that explains the rest. */}
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-4)" }}>{T.qWhen}</span>
                    </div>
                    {qBursts.map((b) => (
                      <div key={b.at} className="flex items-baseline gap-2 flex-wrap text-[11px] py-0.5">
                        <span className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>
                          {dtm(b.at)}
                        </span>
                        <span style={{ color: "var(--text-3)" }}>
                          {tpl(T.qCounts, { n: b.tasks, r: b.reports, l: b.leaders })}
                        </span>
                      </div>
                    ))}
                    <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "var(--text-3)" }}>
                      {T.qWhenHint}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-[11px]">
                    <span style={{ color: "var(--text-2)" }}>
                      {tpl(T.qTotals, { n: qTot.tasks, r: qTot.reports,
                                        l: qTot.leaders, s: qTot.supervisors })}
                    </span>
                    <span className="sm:ml-auto tabular-nums" style={{ color: "var(--text-4)" }}>
                      {tpl(T.qRange, { a: ddmm(qTot.from), b: ddmm(qTot.to) })}
                    </span>
                  </div>

                  <div>
                    <SegmentedToggle size="sm" asTabs ariaLabel={T.tabQueued}
                      value={qView} onChange={setQView}
                      options={[
                        { value: "who", label: `${T.qWho} · ${qGroups.length}` },
                        { value: "dates", label: `${T.qDates} · ${qDates.length}` },
                      ]} />
                  </div>

                  {/* Supervisor FIRST. A leader name alone does not tell an
                      admin which brigadir's plant just went into the reviewer,
                      and that is the level the question is asked at. */}
                  {qView === "who" && (
                    <TableCard maxHeight="38vh">
                      <thead>
                        <tr>
                          <Th label={T.thSup} icon={User} />
                          <Th label={T.thLeader} />
                          <Th label={T.thShift} align="center" />
                          <Th label={T.thReports} align="right" />
                          <Th label={T.thTasks} align="right" />
                          <Th label={T.thRange} align="right" cls="hidden sm:table-cell" />
                          <Th label={T.thQueued} align="right" cls="hidden sm:table-cell" />
                        </tr>
                      </thead>
                      <tbody>
                        {qGroups.map((r, i) => (
                          <tr key={`${r.supervisor}-${r.leader}-${r.leaderId || i}`}>
                            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.supervisor}</td>
                            <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{r.leader}</td>
                            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                              {r.shift ? `S${r.shift}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>
                              {r.reports.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold"
                              style={{ color: "var(--text-1)" }}>{r.tasks.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                              style={{ color: "var(--text-3)" }}>{span(r.from, r.to)}</td>
                            <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                              style={{ color: "var(--text-4)" }}>{dtm(r.queuedLast)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableCard>
                  )}

                  {/* The literal "which dates" answer — report dates, newest
                      first. A submission that reached back a year says so here
                      and nowhere else. */}
                  {qView === "dates" && (
                    <TableCard maxHeight="38vh">
                      <thead>
                        <tr>
                          <Th label={T.thDate} icon={CalendarRange} />
                          <Th label={T.thLeaders} align="right" />
                          <Th label={T.thReports} align="right" />
                          <Th label={T.thTasks} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {qDates.map((d) => (
                          <tr key={d.date}>
                            <td className="px-3 py-2 tabular-nums font-medium"
                              style={{ color: "var(--text-1)" }}>{d.date}</td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>
                              {d.leaders.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>
                              {d.reports.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold"
                              style={{ color: "var(--text-1)" }}>{d.tasks.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableCard>
                  )}

                  {q?.capped && (
                    <p className="text-[11px]" style={{ color: "#eab308" }}>
                      {fmt(T.qCapped, (q.cap || 0).toLocaleString())}
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* Said out loud rather than silently truncated. */}
          {tab !== "queued" && data?.capped && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-4)" }}>
              {fmt(T.capped, recent.length)}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
