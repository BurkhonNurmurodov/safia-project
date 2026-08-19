import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ListChecks, User, Users, Layers, Camera, Clock, AlarmClock, Scale, Info,
  Image as ImageIcon, RefreshCw, CalendarCheck,
} from "lucide-react";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import Lightbox from "../ui/Lightbox";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { ExamplePhoto } from "./ProofPhoto";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";

/**
 * «Vazifalar» — the reference tab of /leaders: what each daily checklist task
 * REQUIRES, for the subject the page scope names.
 *
 * One card per enabled task, in checklist order: name and proof type, the
 * definition of done (the very text the AI reviewer judges by — a leader gets
 * to read the rule they are measured against), weight, minimum photos, the
 * photo window and the submission deadline, plus the admin's example photos
 * when any were uploaded. Everything comes resolved from
 * /api/leader-tasks/requirements down the global → supervisor → leader chain,
 * so a renamed task, a per-leader weight or a unit's own window shows exactly
 * as it is in force — never the seeded catalogue.
 *
 * WHOSE chain: a leader always sees their own; a supervisor their unit (or one
 * of their leaders when the leader filter names one); admins and top-managers
 * follow the page filters (leader → supervisor → the global standard). The
 * server enforces the same lock, the client only chooses what to ask for.
 *
 * The deadline is INFORMATIONAL — said on the card and once in the header:
 * a report is still scored solely by the day's filing window. A task with no
 * deadline of its own shows that filing deadline instead, marked as the day's,
 * because "no deadline" is not true — the day has one.
 */

const TXT = {
  uz: {
    title: "Kunlik vazifalar",
    countN: "{n} ta vazifa",
    globalStd: "Umumiy standart",
    unit: "{name} brigadasi",
    shift1: "1-smena", shift2: "2-smena",
    pickHint: "Filtrda brigadir yoki liderni tanlang — ularning o'z sozlamalari ko'rinadi.",
    leaderUnresolved: "Bu lider profilga bog'lanmagan — brigada standarti ko'rsatilmoqda.",
    tileTasks: "Vazifalar", tileWeight: "Jami og'irlik", tileFiling: "Hisobot topshirish",
    pts: "{n} ball", ptsShare: "{n} ball · {p}%",
    filingRange: "{from} – {to}",
    nextMorning: "ertalab",
    deadlineNote: "Muddat ma'lumot uchun ko'rsatiladi: baho faqat kunlik topshirish oynasi bo'yicha hisoblanadi.",
    proof: "Isbot", minPhotos: "kamida {n} ta rasm", noPhotos: "rasm talab qilinmaydi",
    inApp: "Bu vazifaning rasmi botdagi «📷 Kamerani ochish» tugmasi orqali ILOVADA olinadi. Chatga rasm yuborib bo'lmaydi; sana va vaqt rasmga server soati bo'yicha avtomatik yoziladi.",
    criteria: "Talab", noCriteria: "Talab yozilmagan — AI faqat rasm vaqtini tekshiradi.",
    noCriteriaNoDate: "Talab yozilmagan — AI faqat rasm mavzusini tekshiradi.",
    photoWin: "Rasm: {from} – {to}", noDate: "Sana tekshirilmaydi",
    dayOnly: "Sana kerak, vaqt shart emas",
    due: "Muddat: {t} gacha", dueDay: "{t} gacha · kun bo'yicha",
    examples: "Namuna",
    empty: "Faol vazifalar yo'q", emptyMsg: "Bu darajada barcha vazifalar o'chirilgan.",
    loadFail: "Yuklab bo'lmadi", retry: "Qayta urinish", photoFailed: "Rasm yuklanmadi",
  },
  uz_cyrl: {
    title: "Кунлик вазифалар",
    countN: "{n} та вазифа",
    globalStd: "Умумий стандарт",
    unit: "{name} бригадаси",
    shift1: "1-смена", shift2: "2-смена",
    pickHint: "Филтрда бригадир ёки лидерни танланг — уларнинг ўз созламалари кўринади.",
    leaderUnresolved: "Бу лидер профилга боғланмаган — бригада стандарти кўрсатилмоқда.",
    tileTasks: "Вазифалар", tileWeight: "Жами оғирлик", tileFiling: "Ҳисобот топшириш",
    pts: "{n} балл", ptsShare: "{n} балл · {p}%",
    filingRange: "{from} – {to}",
    nextMorning: "эрталаб",
    deadlineNote: "Муддат маълумот учун кўрсатилади: баҳо фақат кунлик топшириш ойнаси бўйича ҳисобланади.",
    proof: "Исбот", minPhotos: "камида {n} та расм", noPhotos: "расм талаб қилинмайди",
    inApp: "Бу вазифанинг расми ботдаги «📷 Камерани очиш» тугмаси орқали ИЛОВАДА олинади. Чатга расм юбориб бўлмайди; сана ва вақт расмга сервер соати бўйича автоматик ёзилади.",
    criteria: "Талаб", noCriteria: "Талаб ёзилмаган — AI фақат расм вақтини текширади.",
    noCriteriaNoDate: "Талаб ёзилмаган — AI фақат расм мавзусини текширади.",
    photoWin: "Расм: {from} – {to}", noDate: "Сана текширилмайди",
    dayOnly: "Сана керак, вақт шарт эмас",
    due: "Муддат: {t} гача", dueDay: "{t} гача · кун бўйича",
    examples: "Намуна",
    empty: "Фаол вазифалар йўқ", emptyMsg: "Бу даражада барча вазифалар ўчирилган.",
    loadFail: "Юклаб бўлмади", retry: "Қайта уриниш", photoFailed: "Расм юкланмади",
  },
  ru: {
    title: "Ежедневные задачи",
    countN: "{n} задач",
    globalStd: "Общий стандарт",
    unit: "бригада {name}",
    shift1: "1-я смена", shift2: "2-я смена",
    pickHint: "Выберите бригадира или лидера в фильтре — покажутся их собственные настройки.",
    leaderUnresolved: "Этот лидер не привязан к профилю — показан стандарт бригады.",
    tileTasks: "Задач", tileWeight: "Суммарный вес", tileFiling: "Сдача отчёта",
    pts: "{n} балл.", ptsShare: "{n} балл. · {p}%",
    filingRange: "{from} – {to}",
    nextMorning: "утра",
    deadlineNote: "Срок носит справочный характер: оценка считается только по дневному окну сдачи отчёта.",
    proof: "Доказательство", minPhotos: "минимум {n} фото", noPhotos: "фото не требуется",
    inApp: "Фото для этой задачи снимается В ПРИЛОЖЕНИИ — кнопкой «📷 Открыть камеру» в боте. Отправить фото в чат нельзя; дата и время наносятся на снимок автоматически по часам сервера.",
    criteria: "Требование", noCriteria: "Требование не задано — ИИ проверяет только время фото.",
    noCriteriaNoDate: "Требование не задано — ИИ проверяет только тему фото.",
    photoWin: "Фото: {from} – {to}", noDate: "Дата не проверяется",
    dayOnly: "Нужна дата, время не обязательно",
    due: "Срок: до {t}", dueDay: "до {t} · по дню",
    examples: "Пример",
    empty: "Нет активных задач", emptyMsg: "На этом уровне все задачи отключены.",
    loadFail: "Не удалось загрузить", retry: "Повторить", photoFailed: "Фото не загрузилось",
  },
  en: {
    title: "Daily tasks",
    countN: "{n} tasks",
    globalStd: "Global standard",
    unit: "{name}'s unit",
    shift1: "Shift 1", shift2: "Shift 2",
    pickHint: "Pick a supervisor or a leader in the filter to see their own settings.",
    leaderUnresolved: "This leader is not linked to a profile — the unit's standard is shown.",
    tileTasks: "Tasks", tileWeight: "Total weight", tileFiling: "Report filing",
    pts: "{n} pts", ptsShare: "{n} pts · {p}%",
    filingRange: "{from} – {to}",
    nextMorning: "next morning",
    deadlineNote: "The deadline is informational: the score is computed only against the day's filing window.",
    proof: "Proof", minPhotos: "at least {n} photo(s)", noPhotos: "no photo required",
    inApp: "This task's photo is taken IN THE APP — with the «📷 Open the camera» button in the bot. No photo can be sent to the chat; the date and time are burnt in automatically from the server's clock.",
    criteria: "Requirement", noCriteria: "No requirement written — the AI checks only the photo time.",
    noCriteriaNoDate: "No requirement written — the AI checks only the photo subject.",
    photoWin: "Photo: {from} – {to}", noDate: "Date not checked",
    dayOnly: "Date required, time not",
    due: "Due: by {t}", dueDay: "by {t} · day rule",
    examples: "Example",
    empty: "No active tasks", emptyMsg: "Every task is disabled at this level.",
    loadFail: "Could not load", retry: "Retry", photoFailed: "Photo failed to load",
  },
};

const fill = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), s);

// A small labelled fact — the meta row on every card. Icon + text, never a
// colour alone; `tone` "accent" is the brand tint for the one fact a leader
// acts on (a task-specific deadline), everything else stays neutral.
function Fact({ icon: Icon, children, tone = "neutral", title }) {
  const accent = tone === "accent";
  return (
    <span title={title}
      className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2 py-1 tabular-nums"
      style={accent
        ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }
        : { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      <Icon size={13} className="flex-shrink-0" style={{ opacity: 0.85 }} />
      {children}
    </span>
  );
}

function Tile({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl px-3 py-2 min-w-0"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold"
        style={{ color: "var(--text-3)" }}>
        <Icon size={12} className="flex-shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums truncate" style={{ color: "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

function TaskCard({ task, lang, T, tl, total, shift, filingTo, filingOvernight, onZoom, flash }) {
  const name = task.names?.[lang] || task.names?.uz || `T${task.id}`;
  const note = task.note?.[lang] || task.note?.uz || "";
  const criteria = (task.criteria || "").trim();
  const [wFrom, wTo] = task.window || [];
  // The window is only a RULE while the CLOCK is judged. In the other two modes
  // it is stale config, so the chip states what is actually asked instead — a
  // leader reading hours nothing measures them by reshoots proofs for no reason,
  // which is the same failure as being flagged for a rule nobody stated.
  //   full  the window, as before
  //   day   "a date must be visible, the time need not be" — the honest ask for
  //         a proof that is a screen: its day is on it, its shooting time is not
  //   off   nothing about when at all
  const dateOn = task.date_check !== false;
  const timeOn = dateOn && task.time_check !== false;
  const share = total > 0 ? Math.round((task.weight / total) * 100) : 0;
  // A clock before the shift's start on an overnight day is tomorrow morning —
  // "02:00" on a 17:00→09:00 day. Said, so the leader does not read it as
  // two in the afternoon.
  const morning = (t) => shift === 2 && t && t < "17:00" ? ` (${T.nextMorning})` : "";
  const dueOwn = task.deadline;
  return (
    <article id={`ltask-${task.id}`} className="rounded-2xl p-3.5 flex flex-col gap-3"
      style={{ background: "var(--bg-card)",
               border: `1px solid ${flash ? "var(--brand)" : "var(--border)"}`,
               boxShadow: flash ? "0 0 0 3px var(--brand-bg)" : "none",
               transition: "border-color 300ms, box-shadow 300ms" }}>
      <header className="flex items-start gap-2.5">
        <span className="flex-shrink-0 grid place-items-center rounded-lg text-[11px] font-bold tabular-nums"
          style={{ width: 34, height: 26, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
          T{task.id}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>{name}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
            <Camera size={12} className="flex-shrink-0" />
            <span className="truncate">
              {note ? `${note} · ` : `${T.proof} · `}
              {task.min_media > 0 ? fill(T.minPhotos, { n: task.min_media }) : T.noPhotos}
            </span>
          </div>
          {/* WHERE this task is answered. Stated first, and as a sentence
              rather than a chip in the row of facts below: a leader who expects
              to send a file to the chat and finds the bot refusing it has been
              left to guess, and that is a support call, not a misunderstanding
              they can resolve alone. */}
          {task.proof_kind === "camera" && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug"
              style={{ background: "rgba(200,151,63,0.10)", color: "var(--text-2)",
                       border: "1px solid rgba(200,151,63,0.30)" }}>
              <Camera size={12} className="flex-shrink-0 mt-px" style={{ color: "var(--brand)" }} />
              <span>{T.inApp}</span>
            </div>
          )}
        </div>
      </header>

      <div>
        <div className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: "var(--text-3)" }}>{T.criteria}</div>
        {criteria
          ? <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>{tl(criteria)}</p>
          : <p className="text-xs italic" style={{ color: "var(--text-4)" }}>
              {dateOn ? T.noCriteria : T.noCriteriaNoDate}
            </p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Fact icon={Scale}>
          {total !== 100 ? fill(T.ptsShare, { n: task.weight, p: share }) : fill(T.pts, { n: task.weight })}
        </Fact>
        <Fact icon={timeOn ? Clock : CalendarCheck}>
          {timeOn ? fill(T.photoWin, { from: wFrom || "—", to: (wTo || "—") + morning(wTo) })
            : dateOn ? T.dayOnly : T.noDate}
        </Fact>
        {dueOwn
          ? <Fact icon={AlarmClock} tone="accent">{fill(T.due, { t: dueOwn + morning(dueOwn) })}</Fact>
          : <Fact icon={AlarmClock}>{fill(T.dueDay, { t: filingTo + (filingOvernight ? ` (${T.nextMorning})` : "") })}</Fact>}
      </div>

      {task.examples?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide font-semibold mb-1.5 flex items-center gap-1"
            style={{ color: "var(--text-3)" }}>
            <ImageIcon size={12} /> {T.examples}
          </div>
          <div className="flex flex-wrap gap-2">
            {task.examples.map((eid) => (
              <div key={eid} className="w-[72px] h-[72px] rounded-lg overflow-hidden flex-shrink-0">
                <ExamplePhoto id={eid} T={T} className="" thumb onClick={onZoom} />
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function TaskRequirements({
  scope, rows, isLeader, isSupervisor, nm,
  // A task id the day-detail modal handed over: its card is scrolled into view
  // and ringed for a moment once the list is in, then `onFocusDone` clears it
  // so a later visit to the tab starts at the top like any other.
  focusTaskId = null, onFocusDone,
}) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const [zoom, setZoom] = useState("");
  const [flash, setFlash] = useState(null);

  // The leader filter carries a NAME (the register keys people by it); the
  // profile id rides on the rows, so any row of that person resolves it. A
  // name that matches no profile (an unmatched sheet spelling) stays unresolved
  // and the server answers with the level above — said in the header.
  const leaderId = useMemo(() => {
    if (!scope?.leader) return null;
    return (rows || []).find((r) => r.leader === scope.leader && r.leader_id)?.leader_id ?? null;
  }, [scope?.leader, rows]);
  const leaderUnresolved = !!scope?.leader && !leaderId;

  const params = useMemo(() => ({
    ...(leaderId ? { leader_id: leaderId } : {}),
    ...(scope?.supervisor ? { supervisor: scope.supervisor } : {}),
    ...(scope?.shift ? { shift: scope.shift } : {}),
  }), [leaderId, scope?.supervisor, scope?.shift]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["leader-task-requirements", params],
    queryFn: () => api.get("/api/leader-tasks/requirements", { params }).then((r) => r.data),
  });

  const tasks = data?.tasks || [];
  const total = data?.total_weight ?? 0;

  useEffect(() => {
    if (!focusTaskId || !data) return undefined;
    const el = document.getElementById(`ltask-${focusTaskId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(focusTaskId);
    const t = window.setTimeout(() => { setFlash(null); onFocusDone?.(); }, 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, data]);
  const shift = data?.shift;
  const shiftLabel = shift === 2 ? T.shift2 : T.shift1;
  const filing = data?.filing || {};
  const filingTo = filing.to || "";

  const subject = (() => {
    if (!data) return "";
    const s = data.subject || {};
    if (data.level === "leader") return [nm(s.leader), s.supervisor ? fill(T.unit, { name: nm(s.supervisor) }) : null, shiftLabel].filter(Boolean).join(" · ");
    if (data.level === "supervisor") return [fill(T.unit, { name: nm(s.supervisor) }), shiftLabel].join(" · ");
    return `${T.globalStd} · ${shiftLabel}`;
  })();
  const SubjectIcon = data?.level === "leader" ? User : data?.level === "supervisor" ? Users : Layers;
  const canPick = !isLeader && !isSupervisor;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ListChecks} title={T.title}
          right={data ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
              {fill(T.countN, { n: tasks.length })}
            </span>
          ) : null} />
        <div className="p-3.5 space-y-3">
          {isLoading ? (
            <>
              <SkeletonBlock className="h-4 w-2/3" />
              <div className="grid grid-cols-3 gap-2">
                <SkeletonBlock className="h-14 rounded-xl" /><SkeletonBlock className="h-14 rounded-xl" /><SkeletonBlock className="h-14 rounded-xl" />
              </div>
            </>
          ) : isError ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs" style={{ color: "#ef4444" }}>
                {T.loadFail}{error?.response?.data?.detail ? ` — ${error.response.data.detail}` : ""}
              </span>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />}
                loading={isFetching} onClick={() => refetch()}>{T.retry}</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-medium min-w-0" style={{ color: "var(--text-1)" }}>
                <span className="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                  <SubjectIcon size={14} />
                </span>
                <span className="truncate">{subject}</span>
              </div>
              {(leaderUnresolved || (canPick && data?.level === "global")) && (
                <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-3)" }}>
                  <Info size={13} className="flex-shrink-0 mt-[1px]" />
                  <span>{leaderUnresolved ? T.leaderUnresolved : T.pickHint}</span>
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Tile icon={ListChecks} label={T.tileTasks} value={tasks.length} />
                <Tile icon={Scale} label={T.tileWeight} value={fill(T.pts, { n: total })} />
                <Tile icon={AlarmClock} label={T.tileFiling}
                  value={fill(T.filingRange, { from: filing.from || "—", to: filingTo || "—" })}
                  sub={filing.overnight ? T.nextMorning : null} />
              </div>
              <p className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--text-3)" }}>
                <Info size={12} className="flex-shrink-0 mt-[2px]" />
                <span>{T.deadlineNote}</span>
              </p>
            </>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-3.5 space-y-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-3 w-1/2" />
              <SkeletonBlock className="h-12 w-full" />
              <div className="flex gap-2"><SkeletonBlock className="h-6 w-20" /><SkeletonBlock className="h-6 w-28" /><SkeletonBlock className="h-6 w-24" /></div>
            </div>
          ))}
        </div>
      ) : !isError && tasks.length === 0 ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState icon={ListChecks} title={T.empty} message={T.emptyMsg} showUploadLink={false} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} lang={lang} T={T} tl={tl} total={total}
              shift={shift} filingTo={filingTo} filingOvernight={!!filing.overnight}
              onZoom={setZoom} flash={flash === task.id} />
          ))}
        </div>
      )}

      <Lightbox src={zoom} onClose={() => setZoom("")} />
    </div>
  );
}
