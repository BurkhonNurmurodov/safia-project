import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquareWarning, Hourglass, ShieldCheck, Ban, RotateCcw, Sparkles,
  Clock, CalendarCheck, ExternalLink, CircleSlash,
} from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import SegmentedToggle from "../ui/SegmentedToggle";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import ScopeNotice from "./ScopeNotice";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";

/**
 * «Norozliklar» — the queue of objections to automatic AI rejections.
 *
 * A flag now costs a task its weight the moment it is written, so the way back
 * is the brigadir's objection and the admin's ruling on it. That ruling was
 * reachable from exactly two places: an inline Telegram card that scrolls out
 * of the chat, and the day report of the ONE leader it belongs to. An admin
 * who missed the card had nothing to work from — no list, and no way to find
 * the report holding the objection. This is that list.
 *
 * What the card is built around:
 *  - the objection is decided AGAINST the verdict, so the verdict travels with
 *    it: the flag, the model's own prose, and the window it measured against.
 *    An admin who has to open the report to learn what was even claimed will
 *    rule on the reason alone, which is how a rejection gets overturned twice.
 *  - the photos stay one tap away, not inlined. Evidence belongs on the report
 *    where the whole day can be read; a queue that carried thumbnails would be
 *    a slower day report with fewer facts.
 *  - approving RESTORES the task's weight and re-scores the day for everyone,
 *    so it confirms and says so. Deciding is one tap, which is exactly why the
 *    undo exists — and it sits under the ruling it takes back.
 */

const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_OFF = "#94a3b8";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Numeric on purpose: the queue is scanned, not read, and a numeric day needs
// no fifth translation of every month name.
const day = (iso) => {
  const s = String(iso || "").slice(0, 10);
  return s.length === 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "—";
};
// The filing moment. Prints its own date whenever it differs from the day the
// objection is about — an objection raised days later is the normal case here.
const stamp = (ts, on) => {
  if (!ts) return "";
  const d = String(ts).slice(0, 10), at = String(ts).slice(11, 16);
  return d === String(on || "").slice(0, 10) ? at : `${d.slice(8, 10)}.${d.slice(5, 7)} ${at}`;
};

const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || o?.uz || "";

const TXT = {
  uz: {
    title: "Norozliklar",
    rule: "AI rad etgan vazifa o'z og'irligini darhol yo'qotadi. Brigadir bu qarorga norozilik bildiradi — sabab bilan, — va faqat admin uni hal qiladi.",
    ruleAdmin: "Qabul qilsangiz, vazifa o'z og'irligini qaytarib oladi, kun qayta hisoblanadi va lider bilan brigadirga xabar boradi.",
    ruleRead: "Qarorni admin qabul qiladi. Bu yerda o'z brigadangizning norozliklari va ularning holati ko'rinadi.",
    segAll: "Barchasi", segTodo: "Kutilmoqda", segDone: "Tarix",
    shift1: "1-smena", shift2: "2-smena",
    searchPh: "Lider, brigadir yoki vazifa…",
    stPending: "Admin qarorini kutmoqda", stApproved: "Qabul qilindi",
    stRejected: "Rad etildi", stCancelled: "Qaror bekor qilindi",
    task: "Vazifa", aiTitle: "AI xulosasi",
    window: "Ruxsat etilgan vaqt", needDate: "Kerakli sana", onPhoto: "Rasmda",
    by: "Yubordi", decidedBy: "Qaror qildi",
    approve: "Qabul qilish", reject: "Rad etish", undo: "Qarorni bekor qilish",
    openReport: "Kun hisobotini ochish",
    cApproveT: "Norozilikni qabul qilish",
    cApproveM: "{leader} — {date}, «{task}». Vazifa o'z og'irligini qaytarib oladi, kun qayta hisoblanadi va lider bilan brigadirga xabar boradi.",
    cRejectT: "Norozilikni rad etish",
    cRejectM: "{leader} — {date}, «{task}». AI qarori kuchida qoladi, vazifa og'irligisiz qoladi. Brigadir sababni tuzatib qayta yuborishi mumkin.",
    cUndoT: "Qarorni bekor qilish",
    cUndoM: "{leader} — {date}, «{task}». Qaror bekor qilinadi: AI qarori yana kuchga kiradi va kun qayta hisoblanadi.",
    okApprove: "Norozilik qabul qilindi", okReject: "Norozilik rad etildi",
    okUndo: "Qaror bekor qilindi", fail: "Amal bajarilmadi",
    emptyT: "Norozilik yo'q", emptyM: "Hech kim AI qaroriga e'tiroz bildirmagan.",
    noMatchT: "Mos norozilik topilmadi", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    title: "Норозликлар",
    rule: "AI рад этган вазифа ўз оғирлигини дарҳол йўқотади. Бригадир бу қарорга норозилик билдиради — сабаб билан, — ва фақат админ уни ҳал қилади.",
    ruleAdmin: "Қабул қилсангиз, вазифа ўз оғирлигини қайтариб олади, кун қайта ҳисобланади ва лидер билан бригадирга хабар боради.",
    ruleRead: "Қарорни админ қабул қилади. Бу ерда ўз бригадангизнинг норозликлари ва уларнинг ҳолати кўринади.",
    segAll: "Барчаси", segTodo: "Кутилмоқда", segDone: "Тарих",
    shift1: "1-смена", shift2: "2-смена",
    searchPh: "Лидер, бригадир ёки вазифа…",
    stPending: "Админ қарорини кутмоқда", stApproved: "Қабул қилинди",
    stRejected: "Рад этилди", stCancelled: "Қарор бекор қилинди",
    task: "Вазифа", aiTitle: "AI хулосаси",
    window: "Рухсат этилган вақт", needDate: "Керакли сана", onPhoto: "Расмда",
    by: "Юборди", decidedBy: "Қарор қилди",
    approve: "Қабул қилиш", reject: "Рад этиш", undo: "Қарорни бекор қилиш",
    openReport: "Кун ҳисоботини очиш",
    cApproveT: "Норозиликни қабул қилиш",
    cApproveM: "{leader} — {date}, «{task}». Вазифа ўз оғирлигини қайтариб олади, кун қайта ҳисобланади ва лидер билан бригадирга хабар боради.",
    cRejectT: "Норозиликни рад этиш",
    cRejectM: "{leader} — {date}, «{task}». AI қарори кучида қолади, вазифа оғирлигисиз қолади. Бригадир сабабни тузатиб қайта юбориши мумкин.",
    cUndoT: "Қарорни бекор қилиш",
    cUndoM: "{leader} — {date}, «{task}». Қарор бекор қилинади: AI қарори яна кучга киради ва кун қайта ҳисобланади.",
    okApprove: "Норозилик қабул қилинди", okReject: "Норозилик рад этилди",
    okUndo: "Қарор бекор қилинди", fail: "Амал бажарилмади",
    emptyT: "Норозилик йўқ", emptyM: "Ҳеч ким AI қарорига эътироз билдирмаган.",
    noMatchT: "Мос норозилик топилмади", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    title: "Возражения",
    rule: "Задача, отклонённая ИИ, сразу теряет свой вес. Бригадир возражает против этого решения — с причиной, — и решает только администратор.",
    ruleAdmin: "Если вы согласитесь, задача вернёт свой вес, день пересчитается, а лидер и бригадир получат уведомление.",
    ruleRead: "Решение принимает администратор. Здесь видны возражения вашей бригады и их состояние.",
    segAll: "Все", segTodo: "На решении", segDone: "История",
    shift1: "Смена 1", shift2: "Смена 2",
    searchPh: "Лидер, бригадир или задача…",
    stPending: "Ждёт решения администратора", stApproved: "Принято",
    stRejected: "Отклонено", stCancelled: "Решение отменено",
    task: "Задача", aiTitle: "Заключение ИИ",
    window: "Допустимое время", needDate: "Нужная дата", onPhoto: "На фото",
    by: "Отправил(а)", decidedBy: "Решение",
    approve: "Принять", reject: "Отклонить", undo: "Отменить решение",
    openReport: "Открыть отчёт за день",
    cApproveT: "Принять возражение",
    cApproveM: "{leader} — {date}, «{task}». Задача вернёт свой вес, день пересчитается, лидер и бригадир получат уведомление.",
    cRejectT: "Отклонить возражение",
    cRejectM: "{leader} — {date}, «{task}». Решение ИИ остаётся в силе, задача остаётся без веса. Бригадир может подать возражение снова с уточнённой причиной.",
    cUndoT: "Отменить решение",
    cUndoM: "{leader} — {date}, «{task}». Решение будет отменено: заключение ИИ снова вступает в силу, день пересчитается.",
    okApprove: "Возражение принято", okReject: "Возражение отклонено",
    okUndo: "Решение отменено", fail: "Не удалось выполнить действие",
    emptyT: "Возражений нет", emptyM: "Никто не оспорил решение ИИ.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    title: "Objections",
    rule: "A task the AI rejects loses its weight immediately. The unit's brigadir objects to that ruling — with a reason — and only an admin settles it.",
    ruleAdmin: "Accepting restores the task's weight, re-scores the day and notifies both the leader and the brigadir.",
    ruleRead: "An admin makes the decision. Your unit's objections and where they stand are listed here.",
    segAll: "All", segTodo: "Awaiting decision", segDone: "History",
    shift1: "Shift 1", shift2: "Shift 2",
    searchPh: "Leader, brigadir or task…",
    stPending: "Awaiting an admin decision", stApproved: "Upheld",
    stRejected: "Refused", stCancelled: "Ruling undone",
    task: "Task", aiTitle: "AI verdict",
    window: "Allowed window", needDate: "Required date", onPhoto: "On the photo",
    by: "Filed by", decidedBy: "Decided by",
    approve: "Uphold", reject: "Refuse", undo: "Undo the ruling",
    openReport: "Open the day report",
    cApproveT: "Uphold the objection",
    cApproveM: "{leader} — {date}, “{task}”. The task gets its weight back, the day re-scores and both the leader and the brigadir are notified.",
    cRejectT: "Refuse the objection",
    cRejectM: "{leader} — {date}, “{task}”. The AI ruling stands and the task stays without its weight. The brigadir may file again with a better reason.",
    cUndoT: "Undo the ruling",
    cUndoM: "{leader} — {date}, “{task}”. The ruling is taken back: the AI verdict applies again and the day re-scores.",
    okApprove: "Objection upheld", okReject: "Objection refused",
    okUndo: "Ruling undone", fail: "The action did not go through",
    emptyT: "No objections", emptyM: "Nobody has contested an AI ruling.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable",
  },
};

// One state → one look, shared by the chip and the card's left edge so the two
// can never disagree. `cancelled` is colourless on purpose: an undone ruling
// says nothing about the score any more, and red would read as «refused» —
// the one outcome it is not.
const STATE_STYLE = {
  pending:   { color: C_WAIT, Icon: Hourglass,  key: "stPending" },
  approved:  { color: C_OK,   Icon: ShieldCheck, key: "stApproved" },
  rejected:  { color: C_BAD,  Icon: Ban,         key: "stRejected" },
  cancelled: { color: C_OFF,  Icon: CircleSlash, key: "stCancelled" },
};

function StateChip({ status, T }) {
  const st = STATE_STYLE[status] || STATE_STYLE.cancelled;
  const { color, Icon } = st;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold"
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color }}>
      <Icon size={12} />{T[st.key]}
    </span>
  );
}

/** Normalised name compare — the queue, the register and the bot all print the
 *  same person, and only casing and stray spacing ever differ. */
const same = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Does this row survive the PAGE scope bar (period · shift · supervisor ·
 *  leader)? An objection is about one (leader, day) checklist row, so the
 *  page's scope means exactly what it means on the dashboard next door. */
const inScope = (it, s) => {
  if (!s) return true;
  const d = String(it.date || "").slice(0, 10);
  if (s.from && d < s.from) return false;
  if (s.to && d > s.to) return false;
  if (s.shift != null && it.shift !== s.shift) return false;
  if (s.supervisor && !same(it.supervisor, s.supervisor)) return false;
  if (s.leader && !same(it.leader, s.leader)) return false;
  return true;
};

export default function Disputes({ scope, onClearScope }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();

  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);   // { kind, item }

  const { data, isLoading } = useQuery({
    queryKey: ["leader-disputes"],
    queryFn: () => api.get("/api/leaders/disputes").then((r) => r.data),
  });
  const canDecide = !!data?.canDecide;

  // The endpoint ships the whole queue: a decision waiting on you must not be
  // hidden by a period somebody picked for the dashboard. The page scope
  // narrows what is LISTED, and whatever it leaves out is counted and printed
  // above the list rather than dropped (ScopeNotice) — the row an admin came
  // here for is, by definition, the one on a date nobody expected.
  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => all.filter((it) => inScope(it, scope)), [all, scope]);

  // Every ruling moves a score, so the register, the leaderboard and the day
  // report behind this card all have to re-read.
  const settle = (msg) => {
    qc.invalidateQueries({ queryKey: ["leader-disputes"] });
    qc.invalidateQueries({ queryKey: ["leaders"] });
    qc.invalidateQueries({ queryKey: ["leaderDayReport"] });
    setConfirm(null);
    toast.success(msg);
  };
  const failMsg = (e) => e?.response?.data?.detail || T.fail;

  const decide = useMutation({
    mutationFn: ({ id, status }) =>
      api.post(`/api/leaders/disputes/${id}/decide`, { status }).then((r) => r.data),
    onSuccess: (_r, v) => settle(v.status === "approved" ? T.okApprove : T.okReject),
  });
  const undo = useMutation({
    mutationFn: ({ id }) => api.post(`/api/leaders/disputes/${id}/undo`).then((r) => r.data),
    onSuccess: () => settle(T.okUndo),
  });

  const isDone = (it) => ["approved", "rejected", "cancelled"].includes(it.status);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = items.filter((it) => {
      if (seg === "todo" && it.status !== "pending") return false;
      if (seg === "done" && !isDone(it)) return false;
      if (needle) {
        const hay = `${tl(it.leader)} ${it.leader} ${it.supervisor} ${pick(it.taskName, lang)} ${it.reason} ${it.by}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    // Pending first, then the newest — the work is at the top without a default
    // filter hiding the history behind it.
    return [...arr].sort((a, b) =>
      ((b.status === "pending") - (a.status === "pending"))
      || (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }, [items, seg, q, tl, lang]);

  const counts = useMemo(() => ({
    all: items.length,
    todo: items.filter((i) => i.status === "pending").length,
    done: items.filter(isDone).length,
  }), [items]);

  // What the page scope is holding back — and how much of it is still a
  // decision, which is what turns the line amber.
  const out = useMemo(() => {
    const rest = all.filter((it) => !inScope(it, scope));
    return {
      hidden: rest.length,
      todo: canDecide ? rest.filter((i) => i.status === "pending").length : 0,
    };
  }, [all, scope, canDecide]);

  const segLabel = (label, n) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
    </span>
  );

  const cfg = confirm && (() => {
    const it = confirm.item;
    const fill = (s) => s
      .replaceAll("{leader}", tl(it.leader) || "—")
      .replaceAll("{date}", day(it.date))
      .replaceAll("{task}", pick(it.taskName, lang) || `№${it.taskId}`);
    return {
      approve: {
        title: T.cApproveT, message: fill(T.cApproveM), tone: "warning", label: T.approve,
        run: () => decide.mutate({ id: it.id, status: "approved" }),
      },
      reject: {
        title: T.cRejectT, message: fill(T.cRejectM), tone: "danger", label: T.reject,
        run: () => decide.mutate({ id: it.id, status: "rejected" }),
      },
      undo: {
        title: T.cUndoT, message: fill(T.cUndoM), tone: "danger", label: T.undo,
        run: () => undo.mutate({ id: it.id }),
      },
    }[confirm.kind];
  })();

  return (
    <>
      {/* What this screen is, and the second sentence is the one for THIS
          viewer's job — an admin rules here, a brigadir watches. */}
      <div className="rounded-2xl p-4 mb-3 flex items-start gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
          <MessageSquareWarning size={16} />
        </span>
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>{T.title}</div>
          {T.rule} {canDecide ? T.ruleAdmin : T.ruleRead}
        </div>
      </div>

      {!isLoading && <ScopeNotice hidden={out.hidden} todo={out.todo} onClear={onClearScope} />}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex-1 min-w-[180px] max-w-sm">
          <SearchInput value={q} onChange={setQ} placeholder={T.searchPh} />
        </div>
        <SegmentedToggle
          value={seg}
          onChange={setSeg}
          options={[
            { value: "all", label: segLabel(T.segAll, counts.all) },
            { value: "todo", label: segLabel(T.segTodo, counts.todo) },
            { value: "done", label: segLabel(T.segDone, counts.done) },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : !all.length ? (
        /* Only ever printed when the WHOLE queue is empty. An empty list under
           a narrow scope is «nothing matched», a dead end — reading one as the
           other tells an admin the work is done when it is merely filtered. */
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.emptyT} message={T.emptyM} showUploadLink={false} />
        </div>
      ) : !shown.length ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.noMatchT} message={T.noMatchM} showUploadLink={false} />
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((it) => {
            const tone = STATE_STYLE[it.status] || STATE_STYLE.cancelled;
            const open = it.status === "pending";
            const rev = it.verdict;
            const flags = rev?.flags || [];
            const dated = flags.some((f) => f === "no_date" || f === "date_mismatch");
            const taskName = pick(it.taskName, lang);
            return (
              <div key={it.id} className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${open && canDecide ? hexA(tone.color, 0.35) : "var(--border)"}`,
                }}>
                <div className="flex">
                  {/* the state's colour as a left edge: scannable down a long list */}
                  <div className="w-1 flex-shrink-0" style={{ background: tone.color }} />
                  <div className="flex-1 p-3 sm:p-4 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
                          {tl(it.leader) || "—"}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>
                          {tl(it.supervisor) || "—"} · <span className="tabular-nums">{day(it.date)}</span>
                          {it.shift ? ` · ${T[`shift${it.shift}`] || ""}` : ""}
                        </div>
                      </div>
                      <StateChip status={it.status} T={T} />
                    </div>

                    {/* Which task lost its weight. The number is what the bot,
                        the report and the matrix all call it by. */}
                    <div className="mt-2 flex items-start gap-2 text-[13px]">
                      <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5"
                        style={{ color: "var(--text-4)" }}>№{it.taskId}</span>
                      <span className="font-semibold leading-snug" style={{ color: "var(--text-2)" }}>
                        {taskName || "—"}
                      </span>
                    </div>

                    {/* The verdict being argued against — flag, prose, and the
                        rule it was measured by. Deciding without these means
                        deciding on the objection's wording alone. */}
                    {rev && (
                      <div className="mt-2 rounded-xl px-3 py-2"
                        style={{ background: "var(--bg-inner)" }}>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1"
                          style={{ color: "var(--text-4)" }}>
                          <Sparkles size={11} />{T.aiTitle}
                        </div>
                        {!!flags.length && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {flags.map((f) => (
                              <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
                                {T[`f_${f}`] || f}
                              </span>
                            ))}
                          </div>
                        )}
                        {pick(rev.reason, lang) && (
                          <p className="text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
                            {pick(rev.reason, lang)}
                          </p>
                        )}
                        {dated && (
                          <>
                            {pick(rev.dateReason, lang) && (
                              <p className="text-[11px] leading-snug mt-1" style={{ color: "var(--text-2)" }}>
                                {pick(rev.dateReason, lang)}
                              </p>
                            )}
                            {/* The hours when hours were the rule, the required
                                DAY when only the day was judged — an admin has
                                to read which rule the leader was measured by. */}
                            {rev.expected && (
                              <p className="text-[10px] tabular-nums mt-1 flex items-center gap-1 flex-wrap"
                                style={{ color: "var(--text-4)" }}>
                                {rev.timeCheck === false
                                  ? <><CalendarCheck size={10} />{T.needDate}: {rev.expected}</>
                                  : <><Clock size={10} />{T.window}: {rev.expected}</>}
                                {rev.imageDate && <> · {T.onPhoto}: {rev.imageDate}</>}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* The objection, quoted — it is what the decision is made on. */}
                    <div className="mt-2 rounded-xl px-3 py-2 text-xs leading-relaxed"
                      style={{ background: hexA(tone.color, 0.08), color: "var(--text-2)" }}>
                      “{it.reason}”
                      <div className="mt-1" style={{ color: "var(--text-4)" }}>
                        {T.by}: {it.by || "—"}
                        {it.at && ` · ${stamp(it.at, it.date)}`}
                        {it.decidedBy && ` · ${T.decidedBy}: ${it.decidedBy}`}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canDecide && open && (
                        <>
                          <Button size="md" tint variant="success"
                            onClick={() => setConfirm({ kind: "approve", item: it })}>
                            {T.approve}
                          </Button>
                          <Button size="md" tint variant="danger"
                            onClick={() => setConfirm({ kind: "reject", item: it })}>
                            {T.reject}
                          </Button>
                        </>
                      )}
                      {/* The way back out of a ruling still in force. A cancelled
                          row has nothing left to undo. */}
                      {canDecide && ["approved", "rejected"].includes(it.status) && (
                        <Button size="md" tint variant="secondary" icon={<RotateCcw size={13} />}
                          onClick={() => setConfirm({ kind: "undo", item: it })}>
                          {T.undo}
                        </Button>
                      )}
                      {/* The evidence stays one tap away: photos belong on the
                          report, where the whole day can be read. */}
                      {it.uid && (
                        <Button size="md" tint variant="ghost" className="ml-auto"
                          icon={<ExternalLink size={13} />}
                          onClick={() => nav(`/leaders/report/${encodeURIComponent(it.uid)}`)}>
                          {T.openReport}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirm && cfg && (
        <ConfirmDialog
          title={cfg.title}
          message={cfg.message}
          confirmLabel={cfg.label}
          tone={cfg.tone}
          loading={decide.isPending || undo.isPending}
          error={decide.isError ? failMsg(decide.error)
            : undo.isError ? failMsg(undo.error) : null}
          onCancel={() => { setConfirm(null); decide.reset(); undo.reset(); }}
          onConfirm={cfg.run}
        />
      )}

      {toast.node}
    </>
  );
}
