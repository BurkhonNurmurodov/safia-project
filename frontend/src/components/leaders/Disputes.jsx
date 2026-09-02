import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquareWarning, Hourglass, ShieldCheck, Ban, RotateCcw, Sparkles,
  Clock, CalendarCheck, ExternalLink, CircleSlash, ArrowUpCircle, UserCheck,
  MessageSquareQuote,
} from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
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
 * «Norozliklar» — the queue of objections to an automatic AI rejection.
 *
 * A flag costs a task its whole weight the moment it is written and nobody
 * presses anything to make that happen, so the way back has to be at least as
 * reliable as the deduction. It runs the same three-stage chain as a late
 * proof, because a leader who missed a deadline and a leader the machine
 * misjudged are the same person asking the same thing:
 *
 *   leader     files their own account of the shift, off the day report they
 *              were sent — they are who the verdict judged.
 *   supervisor their brigadir REFUSES it (final) or passes it up with their
 *              own mandatory case. They cannot restore the weight themselves.
 *   admin      reads BOTH notes and decides whether it is pointed.
 *
 * What the card is built around:
 *  - the objection is decided AGAINST the verdict, so the verdict travels with
 *    it: the flag, the model's own prose, and the window it measured against.
 *    Whoever has to open the report to learn what was even claimed will rule on
 *    the reason alone, which is how a rejection gets overturned twice.
 *  - EVERY note the chain has collected is on the card, in order. A queue that
 *    showed the first and the last would hide the middle judgement — the one
 *    that decided whether an admin ever saw this at all.
 *  - the photos stay one tap away, not inlined. Evidence belongs on the report
 *    where the whole day can be read; a queue that carried thumbnails would be
 *    a slower day report with fewer facts.
 *  - whose TURN it is comes from the server, per row (`canAct`), never from a
 *    page-level flag: "you are a brigadir" is not "you are THIS unit's
 *    brigadir", and a supervisor holding the page at scope «all» is served
 *    every unit's rows. Deriving it here grows buttons that answer 403.
 *  - approving RESTORES the task's weight and re-scores the day for everyone,
 *    so it confirms and says so. Deciding is one tap, which is exactly why the
 *    undo exists — and it sits under the ruling it takes back.
 */

const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_OFF = "#94a3b8";

// Which STAGE owns a row — the split the two sub-tabs make, off `status`, which
// is the stage AND the outcome in one column. An OPEN row belongs to whoever
// has to rule on it next; a SETTLED one to whoever ended it, so a ruling stays
// where it was made and, for an admin, where its undo is. Only a stage-1
// refusal ends on the brigadirs' side: an approval, an admin's refusal and a
// cancelled ruling are all admin acts.
const stageOf = (it) =>
  it.status === "supervisor" ? "sup"
    : it.status === "admin" ? "adm"
      : (it.status === "rejected" && it.sup?.action === "rejected") ? "sup" : "adm";


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
    rule: "AI rad etgan vazifa o'z og'irligini darhol yo'qotadi. Lider bu qarorga norozilik bildiradi, brigadir uni o'qib rad etadi yoki adminlarga yuboradi — o'z izohi bilan, — va ball faqat admin qaroridan keyin qaytadi.",
    ruleAdmin: "Ikkala izohni o'qing va qaror qiling: qabul qilsangiz, vazifa o'z og'irligini qaytarib oladi, kun qayta hisoblanadi va lider bilan brigadirga xabar boradi.",
    ruleSup: "Siz birinchi bo'lib ko'rib chiqasiz: rad etsangiz — AI qarori kuchida qoladi; adminlarga yuborsangiz, nega ball berilishi kerakligini yozishingiz shart.",
    ruleRead: "Bu yerda o'z noroziliklaringiz va ular qaysi bosqichda ekani ko'rinadi.",
    segAll: "Barchasi", segTodo: "Sizning navbatingiz", segDone: "Tarix",
    stageAdm: "Adminlarda", stageSup: "Brigadirlarda",
    shift1: "1-smena", shift2: "2-smena",
    searchPh: "Lider, brigadir yoki vazifa…",
    stSupervisor: "Brigadir ko'rib chiqmoqda", stAdmin: "Admin qarorini kutmoqda",
    stApproved: "Qabul qilindi", stRejected: "Rad etildi",
    stCancelled: "Qaror bekor qilindi",
    task: "Vazifa", aiTitle: "AI xulosasi",
    window: "Ruxsat etilgan vaqt", needDate: "Kerakli sana", onPhoto: "Rasmda",
    by: "Yubordi", decidedBy: "Qaror qildi",
    noteLead: "Lider izohi", noteLeadSup: "Brigadir izohi (lider nomidan)",
    noteSup: "Brigadir izohi", noteAdm: "Admin izohi",
    supRejected: "Brigadir rad etdi", supUplifted: "Brigadir adminlarga yubordi",
    approve: "Qabul qilish", reject: "Rad etish", uplift: "Adminlarga yuborish",
    undo: "Qarorni bekor qilish", cancel: "Bekor qilish",
    openReport: "Kun hisobotini ochish",
    cApproveT: "Norozilikni qabul qilish",
    cApproveM: "{leader} — {date}, «{task}». Vazifa o'z og'irligini qaytarib oladi, kun qayta hisoblanadi va lider bilan brigadirga xabar boradi.",
    cRejectT: "Norozilikni rad etish",
    cRejectM: "{leader} — {date}, «{task}». AI qarori kuchida qoladi, vazifa og'irligisiz qoladi. Lider sababni tuzatib qayta yuborishi mumkin.",
    cUpliftT: "Adminlarga yuborish",
    cUpliftM: "Nega bu vazifaga ball berilishi kerak? Adminlar lider izohi bilan birga shuni o'qib qaror qiladi.",
    cUndoT: "Qarorni bekor qilish",
    cUndoM: "{leader} — {date}, «{task}». Qaror bekor qilinadi: AI qarori yana kuchga kiradi va kun qayta hisoblanadi.",
    noteReq: "Izoh yozing.", notePh: "Sababni yozing…",
    okApprove: "Norozilik qabul qilindi", okReject: "Norozilik rad etildi",
    okUplift: "Adminlarga yuborildi",
    okUndo: "Qaror bekor qilindi", fail: "Amal bajarilmadi",
    emptyT: "Norozilik yo'q", emptyM: "Hech kim AI qaroriga e'tiroz bildirmagan.",
    noMatchT: "Mos norozilik topilmadi", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    title: "Норозликлар",
    rule: "AI рад этган вазифа ўз оғирлигини дарҳол йўқотади. Лидер бу қарорга норозилик билдиради, бригадир уни ўқиб рад этади ёки админларга юборади — ўз изоҳи билан, — ва балл фақат админ қароридан кейин қайтади.",
    ruleAdmin: "Иккала изоҳни ўқинг ва қарор қилинг: қабул қилсангиз, вазифа ўз оғирлигини қайтариб олади, кун қайта ҳисобланади ва лидер билан бригадирга хабар боради.",
    ruleSup: "Сиз биринчи бўлиб кўриб чиқасиз: рад этсангиз — AI қарори кучида қолади; админларга юборсангиз, нега балл берилиши кераклигини ёзишингиз шарт.",
    ruleRead: "Бу ерда ўз норозликларингиз ва улар қайси босқичда экани кўринади.",
    segAll: "Барчаси", segTodo: "Сизнинг навбатингиз", segDone: "Тарих",
    stageAdm: "Админларда", stageSup: "Бригадирларда",
    shift1: "1-смена", shift2: "2-смена",
    searchPh: "Лидер, бригадир ёки вазифа…",
    stSupervisor: "Бригадир кўриб чиқмоқда", stAdmin: "Админ қарорини кутмоқда",
    stApproved: "Қабул қилинди", stRejected: "Рад этилди",
    stCancelled: "Қарор бекор қилинди",
    task: "Вазифа", aiTitle: "AI хулосаси",
    window: "Рухсат этилган вақт", needDate: "Керакли сана", onPhoto: "Расмда",
    by: "Юборди", decidedBy: "Қарор қилди",
    noteLead: "Лидер изоҳи", noteLeadSup: "Бригадир изоҳи (лидер номидан)",
    noteSup: "Бригадир изоҳи", noteAdm: "Админ изоҳи",
    supRejected: "Бригадир рад этди", supUplifted: "Бригадир админларга юборди",
    approve: "Қабул қилиш", reject: "Рад этиш", uplift: "Админларга юбориш",
    undo: "Қарорни бекор қилиш", cancel: "Бекор қилиш",
    openReport: "Кун ҳисоботини очиш",
    cApproveT: "Норозиликни қабул қилиш",
    cApproveM: "{leader} — {date}, «{task}». Вазифа ўз оғирлигини қайтариб олади, кун қайта ҳисобланади ва лидер билан бригадирга хабар боради.",
    cRejectT: "Норозиликни рад этиш",
    cRejectM: "{leader} — {date}, «{task}». AI қарори кучида қолади, вазифа оғирлигисиз қолади. Лидер сабабни тузатиб қайта юбориши мумкин.",
    cUpliftT: "Админларга юбориш",
    cUpliftM: "Нега бу вазифага балл берилиши керак? Админлар лидер изоҳи билан бирга шуни ўқиб қарор қилади.",
    cUndoT: "Қарорни бекор қилиш",
    cUndoM: "{leader} — {date}, «{task}». Қарор бекор қилинади: AI қарори яна кучга киради ва кун қайта ҳисобланади.",
    noteReq: "Изоҳ ёзинг.", notePh: "Сабабни ёзинг…",
    okApprove: "Норозилик қабул қилинди", okReject: "Норозилик рад этилди",
    okUplift: "Админларга юборилди",
    okUndo: "Қарор бекор қилинди", fail: "Амал бажарилмади",
    emptyT: "Норозилик йўқ", emptyM: "Ҳеч ким AI қарорига эътироз билдирмаган.",
    noMatchT: "Мос норозилик топилмади", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    title: "Возражения",
    rule: "Задача, отклонённая ИИ, сразу теряет свой вес. Лидер возражает против этого решения, бригадир читает возражение и либо отклоняет его, либо передаёт администраторам — со своим комментарием, — и балл возвращается только по решению администратора.",
    ruleAdmin: "Прочитайте оба комментария и решите: если согласитесь, задача вернёт свой вес, день пересчитается, а лидер и бригадир получат уведомление.",
    ruleSup: "Вы смотрите первым: если отклоните — решение ИИ останется в силе; если передадите администраторам, нужно будет написать, почему балл должен быть начислен.",
    ruleRead: "Здесь видны ваши возражения и то, на какой они стадии.",
    segAll: "Все", segTodo: "Ваша очередь", segDone: "История",
    stageAdm: "У админов", stageSup: "У бригадиров",
    shift1: "Смена 1", shift2: "Смена 2",
    searchPh: "Лидер, бригадир или задача…",
    stSupervisor: "У бригадира", stAdmin: "Ждёт решения администратора",
    stApproved: "Принято", stRejected: "Отклонено",
    stCancelled: "Решение отменено",
    task: "Задача", aiTitle: "Заключение ИИ",
    window: "Допустимое время", needDate: "Нужная дата", onPhoto: "На фото",
    by: "Отправил(а)", decidedBy: "Решение",
    noteLead: "Комментарий лидера", noteLeadSup: "Комментарий бригадира (за лидера)",
    noteSup: "Комментарий бригадира", noteAdm: "Комментарий администратора",
    supRejected: "Бригадир отклонил", supUplifted: "Бригадир передал администраторам",
    approve: "Принять", reject: "Отклонить", uplift: "Передать администраторам",
    undo: "Отменить решение", cancel: "Отмена",
    openReport: "Открыть отчёт за день",
    cApproveT: "Принять возражение",
    cApproveM: "{leader} — {date}, «{task}». Задача вернёт свой вес, день пересчитается, лидер и бригадир получат уведомление.",
    cRejectT: "Отклонить возражение",
    cRejectM: "{leader} — {date}, «{task}». Решение ИИ остаётся в силе, задача остаётся без веса. Лидер может подать возражение снова с уточнённой причиной.",
    cUpliftT: "Передать администраторам",
    cUpliftM: "Почему за эту задачу нужно начислить балл? Администраторы прочитают ваш комментарий вместе с комментарием лидера.",
    cUndoT: "Отменить решение",
    cUndoM: "{leader} — {date}, «{task}». Решение будет отменено: заключение ИИ снова вступает в силу, день пересчитается.",
    noteReq: "Напишите комментарий.", notePh: "Напишите причину…",
    okApprove: "Возражение принято", okReject: "Возражение отклонено",
    okUplift: "Передано администраторам",
    okUndo: "Решение отменено", fail: "Не удалось выполнить действие",
    emptyT: "Возражений нет", emptyM: "Никто не оспорил решение ИИ.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    title: "Objections",
    rule: "A task the AI rejects loses its weight immediately. The leader objects to that ruling, their brigadir reads it and either refuses it or passes it to the admins with their own case — and the point comes back only on an admin's decision.",
    ruleAdmin: "Read both notes and decide: accepting restores the task's weight, re-scores the day and notifies both the leader and the brigadir.",
    ruleSup: "You read it first: refuse it and the AI ruling stands; pass it up and you must write why the task should be pointed.",
    ruleRead: "Your own objections and where each one stands are listed here.",
    segAll: "All", segTodo: "Your turn", segDone: "History",
    stageAdm: "On admins", stageSup: "On supervisors",
    shift1: "Shift 1", shift2: "Shift 2",
    searchPh: "Leader, brigadir or task…",
    stSupervisor: "With the brigadir", stAdmin: "Awaiting an admin decision",
    stApproved: "Upheld", stRejected: "Refused",
    stCancelled: "Ruling undone",
    task: "Task", aiTitle: "AI verdict",
    window: "Allowed window", needDate: "Required date", onPhoto: "On the photo",
    by: "Filed by", decidedBy: "Decided by",
    noteLead: "The leader's note", noteLeadSup: "The brigadir's note (for the leader)",
    noteSup: "The brigadir's case", noteAdm: "The admin's note",
    supRejected: "The brigadir refused it", supUplifted: "The brigadir passed it up",
    approve: "Uphold", reject: "Refuse", uplift: "Pass to the admins",
    undo: "Undo the ruling", cancel: "Cancel",
    openReport: "Open the day report",
    cApproveT: "Uphold the objection",
    cApproveM: "{leader} — {date}, “{task}”. The task gets its weight back, the day re-scores and both the leader and the brigadir are notified.",
    cRejectT: "Refuse the objection",
    cRejectM: "{leader} — {date}, “{task}”. The AI ruling stands and the task stays without its weight. The leader may file again with a better account.",
    cUpliftT: "Pass it to the admins",
    cUpliftM: "Why should this task be pointed? The admins read your comment beside the leader's and decide.",
    cUndoT: "Undo the ruling",
    cUndoM: "{leader} — {date}, “{task}”. The ruling is taken back: the AI verdict applies again and the day re-scores.",
    noteReq: "Write a comment.", notePh: "Write the reason…",
    okApprove: "Objection upheld", okReject: "Objection refused",
    okUplift: "Passed to the admins",
    okUndo: "Ruling undone", fail: "The action did not go through",
    emptyT: "No objections", emptyM: "Nobody has contested an AI ruling.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable",
  },
};

// One state → one look, shared by the chip and the card's left edge so the two
// can never disagree. The two OPEN stages are both amber — nothing has been
// decided in either — and told apart by their icon and their words, because
// colour here means outcome and neither of them has one yet. `cancelled` is
// colourless on purpose: an undone ruling says nothing about the score any
// more, and red would read as «refused», the one outcome it is not.
const STATE_STYLE = {
  supervisor: { color: C_WAIT, Icon: UserCheck,    key: "stSupervisor" },
  admin:      { color: C_WAIT, Icon: Hourglass,    key: "stAdmin" },
  approved:   { color: C_OK,   Icon: ShieldCheck,  key: "stApproved" },
  rejected:   { color: C_BAD,  Icon: Ban,          key: "stRejected" },
  cancelled:  { color: C_OFF,  Icon: CircleSlash,  key: "stCancelled" },
};

const OPEN_STATES = ["supervisor", "admin"];

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

/** One attributed block of somebody's own words — the leader's account, the
 *  brigadir's case, the admin's note. Same shape for all three, because they
 *  are read as one thread: what was claimed, what was argued, what was ruled. */
function Quote({ label, text, who, at, T, tone }) {
  const bodyText = (text || "").trim();
  const credit = (who || at)
    ? `${who ? `${T.by}: ${who}` : ""}${who && at ? " · " : ""}${at || ""}`
    : "";
  // Somebody who ruled without typing anything said nothing — so there is
  // nothing to quote, and a box holding an em dash is worse than no box: it
  // reads as a comment that failed to load. The attribution is the whole fact
  // in that case, and it stands on its own line.
  if (!bodyText) {
    return credit ? (
      <div className="text-[11px] mt-2" style={{ color: "var(--text-4)" }}>
        <span className="uppercase tracking-wide">{label}</span> · {credit}
      </div>
    ) : null;
  }
  return (
    <div className="mt-2">
      <div className="text-[11px] uppercase tracking-wide mb-0.5"
        style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap"
        style={{
          background: "var(--bg-inner)",
          borderLeft: `3px solid ${tone || "var(--border)"}`,
          color: "var(--text-2)",
        }}>
        <MessageSquareQuote size={12} className="inline-block mr-1.5 -mt-0.5"
          style={{ color: "var(--text-4)" }} />
        {bodyText}
      </div>
      {credit && (
        <div className="text-[11px] mt-1" style={{ color: "var(--text-4)" }}>{credit}</div>
      )}
    </div>
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

  // WHOSE stage is on screen. Opens on «Adminlarda» — the half the page's own
  // tab badge counts, and the only stage where the weight can come back.
  const [stage, setStage] = useState("adm");
  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);   // { kind, item }
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["leader-disputes"],
    queryFn: () => api.get("/api/leaders/disputes").then((r) => r.data),
  });
  const canDecide = !!data?.canDecide;
  const canSupervise = !!data?.canSupervise;

  // The endpoint ships the whole queue: a decision waiting on you must not be
  // hidden by a period somebody picked for the dashboard. The page scope
  // narrows what is LISTED, and whatever it leaves out is counted and printed
  // above the list rather than dropped (ScopeNotice) — the row an admin came
  // here for is, by definition, the one on a date nobody expected.
  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => all.filter((it) => inScope(it, scope)), [all, scope]);

  // Whose turn is it on THIS row? The SERVER's answer, per row, from the same
  // `_dispute_stage_rights` the write re-checks — never re-derived here.
  const mine = (it) => !!it.canAct;

  // Every ruling can move a score, so the register, the leaderboard and the day
  // report behind this card all have to re-read.
  const settle = (msg) => {
    qc.invalidateQueries({ queryKey: ["leader-disputes"] });
    qc.invalidateQueries({ queryKey: ["leaders"] });
    qc.invalidateQueries({ queryKey: ["leaderDayReport"] });
    setConfirm(null);
    setNote("");
    setNoteErr("");
    toast.success(msg);
  };
  const failMsg = (e) => e?.response?.data?.detail || T.fail;

  const decide = useMutation({
    mutationFn: ({ id, action, note: n }) =>
      api.post(`/api/leaders/disputes/${id}/decide`,
               { action, note: n || "" }).then((r) => r.data),
    onSuccess: (_r, v) => settle(
      v.action === "approved" ? T.okApprove
        : v.action === "uplifted" ? T.okUplift : T.okReject),
    // The failure stays INSIDE the dialog: a mutation that fails must leave the
    // dialog standing with the reason on it, never close and lose it.
    onError: (e) => setNoteErr(failMsg(e)),
  });
  const undo = useMutation({
    mutationFn: ({ id }) => api.post(`/api/leaders/disputes/${id}/undo`).then((r) => r.data),
    onSuccess: () => settle(T.okUndo),
    onError: (e) => setNoteErr(failMsg(e)),
  });

  const isDone = (it) => ["approved", "rejected", "cancelled"].includes(it.status);

  // The sub-tab is the FIRST cut, ahead of the segment and the search: every
  // count under it describes the stage on screen, so «Tarix 12» can never
  // promise rows the other tab is holding.
  const staged = useMemo(
    () => items.filter((it) => stageOf(it) === stage), [items, stage]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = staged.filter((it) => {
      if (seg === "todo" && !mine(it)) return false;
      if (seg === "done" && !isDone(it)) return false;
      if (needle) {
        const hay = `${tl(it.leader)} ${it.leader} ${it.supervisor} ${pick(it.taskName, lang)} ${it.reason} ${it.by} ${it.sup?.note || ""}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    // Your turn first, then the newest. The work is at the top without a
    // default filter hiding the history behind it.
    return [...arr].sort((a, b) =>
      (mine(b) - mine(a))
      || (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }, [staged, seg, q, tl, lang]);

  const counts = useMemo(() => ({
    all: staged.length,
    todo: staged.filter(mine).length,
    done: staged.filter(isDone).length,
  }), [staged]);

  // What each sub-tab still OWES — an open row, never a decision somebody has
  // already made. «Adminlarda» is the same number the page's tab badge carries,
  // read off the same field of the same payload.
  const stageTodo = useMemo(() => ({
    adm: items.filter((it) => it.status === "admin").length,
    sup: items.filter((it) => it.status === "supervisor").length,
  }), [items]);

  // What the page scope is holding back — and how much of it is still a
  // decision of YOURS, which is what turns the line amber.
  const out = useMemo(() => {
    const rest = all.filter((it) => !inScope(it, scope));
    return { hidden: rest.length, todo: rest.filter(mine).length };
  }, [all, scope]);

  const segLabel = (label, n) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
    </span>
  );

  const close = () => {
    setConfirm(null); setNote(""); setNoteErr("");
    decide.reset(); undo.reset();
  };
  const ask = (kind, item) => {
    setNote(""); setNoteErr(""); decide.reset(); undo.reset();
    setConfirm({ kind, item });
  };

  const run = () => {
    if (!confirm) return;
    const { kind, item } = confirm;
    if (kind === "undo") { undo.mutate({ id: item.id }); return; }
    if (kind === "uplift" && !note.trim()) { setNoteErr(T.noteReq); return; }
    const action = kind === "uplift" ? "uplifted"
      : kind === "approve" ? "approved" : "rejected";
    decide.mutate({ id: item.id, action, note: note.trim() });
  };

  const fillFor = (it) => (s) => String(s || "")
    .replaceAll("{leader}", tl(it.leader) || "—")
    .replaceAll("{date}", day(it.date))
    .replaceAll("{task}", pick(it.taskName, lang) || `№${it.taskId}`);

  const cText = (() => {
    if (!confirm) return { t: "", m: "", label: "", tone: undefined };
    const fill = fillFor(confirm.item);
    return {
      uplift: { t: T.cUpliftT, m: T.cUpliftM, label: T.uplift, tone: undefined },
      approve: { t: T.cApproveT, m: fill(T.cApproveM), label: T.approve, tone: "warning" },
      reject: { t: T.cRejectT, m: fill(T.cRejectM), label: T.reject, tone: "danger" },
      undo: { t: T.cUndoT, m: fill(T.cUndoM), label: T.undo, tone: "danger" },
    }[confirm.kind];
  })();

  return (
    <>
      {/* What this screen is, and the second sentence is the one for THIS
          viewer's job — an admin rules at stage two, a brigadir at stage one,
          a leader reads what became of their own objection. */}
      <div className="rounded-2xl p-4 mb-3 flex items-start gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
          <MessageSquareWarning size={16} />
        </span>
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>{T.title}</div>
          {T.rule}{" "}
          {canDecide ? T.ruleAdmin : canSupervise ? T.ruleSup : T.ruleRead}
        </div>
      </div>

      {!isLoading && <ScopeNotice hidden={out.hidden} todo={out.todo} onClear={onClearScope} />}

      {/* Whose ruling the queue is waiting for. Two questions of one register:
          what sits with the ADMINS — where the weight can come back, and where
          this page's badge points — and what is still with the brigadirs. A
          settled row stays under the stage that ended it, so the history of a
          ruling (and its undo) is found where the ruling was made. */}
      <SegmentedToggle asTabs ariaLabel={T.title} value={stage} onChange={setStage}
        className="mb-3"
        options={[
          { value: "adm", label: segLabel(T.stageAdm, stageTodo.adm) },
          { value: "sup", label: segLabel(T.stageSup, stageTodo.sup) },
        ]} />

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
            const turn = mine(it);
            const rev = it.verdict;
            const flags = rev?.flags || [];
            const dated = flags.some((f) => f === "no_date" || f === "date_mismatch");
            const taskName = pick(it.taskName, lang);
            // Whose words the first note is. A brigadir may still file for a
            // leader who resolves to no profile, and that must not be printed
            // as the leader's own account of their shift.
            const leadLabel = it.byRole === "leader" || !it.byRole
              ? T.noteLead : T.noteLeadSup;
            return (
              <div key={it.id} className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${turn ? hexA(tone.color, 0.35) : "var(--border)"}`,
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
                                DAY when only the day was judged — a decider has
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

                    {/* The whole thread, in order: what was claimed, what was
                        argued, what was ruled. */}
                    <Quote label={leadLabel} text={it.reason} who={it.by}
                      at={stamp(it.at, it.date)} T={T} tone={C_WAIT} />
                    {it.sup && (
                      <Quote
                        label={`${T.noteSup} · ${it.sup.action === "uplifted" ? T.supUplifted : T.supRejected}`}
                        text={it.sup.note} who={it.sup.by}
                        at={stamp(it.sup.at, it.date)} T={T}
                        tone={it.sup.action === "uplifted" ? C_WAIT : C_BAD} />
                    )}
                    {(it.decidedBy || it.note) && (
                      <Quote label={T.noteAdm} text={it.note} who={it.decidedBy}
                        at={stamp(it.decidedAt, it.date)} T={T}
                        tone={it.status === "approved" ? C_OK
                          : it.status === "cancelled" ? C_OFF : C_BAD} />
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* The two buttons this stage has — and only those. A
                          brigadir cannot restore the weight and an admin does
                          not uplift, so the asymmetry is expressed by which
                          buttons exist rather than by a 403 after the press. */}
                      {turn && OPEN_STATES.includes(it.status) && (
                        <>
                          <Button size="md" tint variant="danger"
                            onClick={() => ask("reject", it)}>
                            <Ban size={13} />{T.reject}
                          </Button>
                          {it.status === "supervisor" ? (
                            <Button size="md" tint variant="primary"
                              onClick={() => ask("uplift", it)}>
                              <ArrowUpCircle size={13} />{T.uplift}
                            </Button>
                          ) : (
                            <Button size="md" tint variant="success"
                              onClick={() => ask("approve", it)}>
                              <ShieldCheck size={13} />{T.approve}
                            </Button>
                          )}
                        </>
                      )}
                      {/* The way back out of a ruling still in force. A
                          cancelled row has nothing left to undo. */}
                      {canDecide && ["approved", "rejected"].includes(it.status) && (
                        <Button size="md" tint variant="secondary" icon={<RotateCcw size={13} />}
                          onClick={() => ask("undo", it)}>
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

      {/* Refuse, uphold and undo are plain confirms. Passing it up is a FORM —
          it collects a required comment — so it is the Modal template, not a
          ConfirmDialog carrying a field it was never built to hold. */}
      <ConfirmDialog
        open={!!confirm && confirm.kind !== "uplift"}
        title={cText.t}
        message={cText.m}
        confirmLabel={cText.label}
        tone={cText.tone}
        loading={decide.isPending || undo.isPending}
        error={noteErr || undefined}
        onCancel={close}
        onConfirm={run}
      />

      <Modal
        open={!!confirm && confirm.kind === "uplift"}
        onClose={close}
        title={T.cUpliftT}
        icon={<ArrowUpCircle size={16} />}
        subtitle={confirm?.item ? `${tl(confirm.item.leader)} · ${day(confirm.item.date)}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={close}>{T.cancel}</Button>
            <Button variant="primary" loading={decide.isPending} onClick={run}>
              <ArrowUpCircle size={14} />{T.uplift}
            </Button>
          </>
        }
      >
        <FormField label={T.noteSup} required hint={T.cUpliftM} error={noteErr || undefined}>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setNoteErr(""); }}
            rows={4} maxLength={1000} placeholder={T.notePh} autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm resize-y"
            style={{
              background: "var(--bg-inner)", border: "1px solid var(--border)",
              color: "var(--text-1)",
            }} />
        </FormField>
      </Modal>

      {toast.node}
    </>
  );
}
