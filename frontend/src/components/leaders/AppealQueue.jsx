import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  MessageSquareWarning, Hourglass, ShieldCheck, Ban, UserCheck, CircleSlash,
  Clock, Timer, MessagesSquare, ChevronRight, ChevronDown, Paperclip, Hand, Settings2, ShieldX,
  TimerOff,
} from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { SectionHead } from "../ui/DataTable";
import ScopeNotice from "./ScopeNotice";
import { NATIJA_T, shortDate, fill } from "./natijaText";
import { useTaskCatalog, taskTitle } from "./appealTask";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fmtDuration } from "../../utils/formatters";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import useLeaderPhone from "../../hooks/useLeaderPhone";

/**
 * «Norozliklar» and «Kechikkan isbotlar» — the two appeal queues on /leaders,
 * as ONE component (2026-09-26).
 *
 * Both are argued as a CHAT now (`pages/LeaderAppeal.jsx`): a card here is the
 * summary of one appeal — whose, which task, where it stands, the newest entry
 * of its conversation and how much of it this reader has not seen — and
 * tapping it opens the chat, where the ruling buttons, the evidence and the
 * discussion are. The two queues used to be two components with two copies of
 * the ruling dialogs; with the rulings moved into the chat nothing but their
 * words told them apart, so they are one queue with a `thread` prop.
 *
 * What the queue keeps from before, because each was bought with a reason:
 *  - the STAGE split (with the admins / with the brigadirs), first cut ahead of
 *    the segment and the search, so every count describes the stage on screen —
 *    except for a LEADER, who reads only their own appeals and for whom the
 *    split hid their own rows behind the tab they did not open. A brigadir
 *    lands on «Brigadirlarda», where their work is; everybody else on
 *    «Adminlarda», the half the page's own badge counts;
 *  - whose TURN it is comes from the server, per row (`canAct`), never from a
 *    role guess — "you are a brigadir" is not "you are THIS unit's brigadir";
 *  - the page scope narrows what is LISTED, and whatever it holds back is
 *    counted above the list (ScopeNotice), never silently dropped.
 */

const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_OFF = "#94a3b8", C_UP = "#3b82f6";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const day = (iso) => {
  const s = String(iso || "").slice(0, 10);
  return s.length === 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "—";
};
const when = (ts) => {
  if (!ts) return "";
  const d = String(ts).slice(0, 10), at = String(ts).slice(11, 16);
  return `${d.slice(8, 10)}.${d.slice(5, 7)} ${at}`;
};


const TXT = {
  uz: {
    titleDispute: "Norozliklar", titleLate: "Kechikkan isbotlar",
    introMore: "Batafsil", introLess: "Yig'ish",
    ruleDispute: "AI, avtomatik tekshiruv yoki admin qarori bilan rad etilgan vazifa o'z og'irligini darhol yo'qotadi. Lider norozilik yozadi, brigadir savol berib rad etadi yoki adminlarga yuboradi, ball faqat admin qaroridan keyin qaytadi.",
    ruleLate: "Vazifa vaqti tugagach yuborilgan isbot uchun ball avtomatik berilmaydi: avval brigadir ko'rib chiqadi, so'ng adminlar hal qiladi.",
    ruleAdmin: "Kartani oching: tepada qaror tugmalari, keyin rasmlar va sabab, pastda chat — lider va brigadirdan so'rab, so'ng qaror qiling.",
    ruleSup: "Kartani oching: chatda savol bering, so'ng rad eting yoki adminlarga yuboring — ikkalasi ham izoh talab qiladi.",
    ruleRead: "Kartani oching: rasmlar, qaror va chat bir joyda. Sizga savol berilsa, shu chatda javob bering.",
    segAll: "Barchasi", segTodo: "Sizning navbatingiz", segUnread: "Yangi xabar", segDone: "Tarix",
    stageAdm: "Adminlarda", stageSup: "Brigadirlarda",
    searchPh: "Lider, brigadir yoki vazifa…",
    shift1: "1-smena", shift2: "2-smena",
    stSupervisor: "Brigadir ko'rib chiqmoqda", stAdmin: "Admin qarorini kutmoqda",
    stApproved: "Qabul qilindi", stApprovedLate: "Tasdiqlandi", stRejected: "Rad etildi",
    stCancelled: "Qaror bekor qilingan",
    yourTurn: "Sizning navbatingiz", unread: "{n} yangi", msgs: "{n} xabar", files: "{n} fayl",
    heldNote: "Saqlandi — brigadirga hamma liderlar kunni yopgach yuboriladi",
    lateBy: "kechikish", lateNone: "aniqlanmadi", unitD: "kun", unitH: "soat", unitM: "daq",
    kFiled: "Norozilik", kFiledLate: "Sabab", kSupRejected: "Brigadir rad etdi",
    kUplifted: "Adminlarga yuborildi", kApproved: "Qabul qilindi", kApprovedLate: "Tasdiqlandi",
    kRejected: "Rad etildi", kUndone: "Qaror bekor qilindi", kInvited: "Chatga qo'shildi",
    emptyDispute: "Norozilik yo'q", emptyDisputeM: "Hech kim rad etilgan vazifaga e'tiroz bildirmagan.",
    emptyLate: "Kechikkan isbot yo'q", emptyLateM: "Vaqtidan keyin yuborilgan isbotlar shu yerda ko'rinadi.",
    noMatchT: "Mos yozuv yo'q", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi", autoCheck: "Avtomatik tekshiruv", deadline: "Muddat o'tdi", adminRuling: "Admin qarori",
  },
  uz_cyrl: {
    titleDispute: "Норозликлар", titleLate: "Кечиккан исботлар",
    introMore: "Батафсил", introLess: "Йиғиш",
    ruleDispute: "AI, автоматик текширув ёки админ қарори билан рад этилган вазифа ўз оғирлигини дарҳол йўқотади. Лидер норозилик ёзади, бригадир савол бериб рад этади ёки админларга юборади, балл фақат админ қароридан кейин қайтади.",
    ruleLate: "Вазифа вақти тугагач юборилган исбот учун балл автоматик берилмайди: аввал бригадир кўриб чиқади, сўнг админлар ҳал қилади.",
    ruleAdmin: "Картани очинг: тепада қарор тугмалари, кейин расмлар ва сабаб, пастда чат — лидер ва бригадирдан сўраб, сўнг қарор қилинг.",
    ruleSup: "Картани очинг: чатда савол беринг, сўнг рад этинг ёки админларга юборинг — иккаласи ҳам изоҳ талаб қилади.",
    ruleRead: "Картани очинг: расмлар, қарор ва чат бир жойда. Сизга савол берилса, шу чатда жавоб беринг.",
    segAll: "Барчаси", segTodo: "Сизнинг навбатингиз", segUnread: "Янги хабар", segDone: "Тарих",
    stageAdm: "Админларда", stageSup: "Бригадирларда",
    searchPh: "Лидер, бригадир ёки вазифа…",
    shift1: "1-смена", shift2: "2-смена",
    stSupervisor: "Бригадир кўриб чиқмоқда", stAdmin: "Админ қарорини кутмоқда",
    stApproved: "Қабул қилинди", stApprovedLate: "Тасдиқланди", stRejected: "Рад этилди",
    stCancelled: "Қарор бекор қилинган",
    yourTurn: "Сизнинг навбатингиз", unread: "{n} янги", msgs: "{n} хабар", files: "{n} файл",
    heldNote: "Сақланди — бригадирга ҳамма лидерлар кунни ёпгач юборилади",
    lateBy: "кечикиш", lateNone: "аниқланмади", unitD: "кун", unitH: "соат", unitM: "дақ",
    kFiled: "Норозилик", kFiledLate: "Сабаб", kSupRejected: "Бригадир рад этди",
    kUplifted: "Админларга юборилди", kApproved: "Қабул қилинди", kApprovedLate: "Тасдиқланди",
    kRejected: "Рад этилди", kUndone: "Қарор бекор қилинди", kInvited: "Чатга қўшилди",
    emptyDispute: "Норозилик йўқ", emptyDisputeM: "Ҳеч ким рад этилган вазифага эътироз билдирмаган.",
    emptyLate: "Кечиккан исбот йўқ", emptyLateM: "Вақтидан кейин юборилган исботлар шу ерда кўринади.",
    noMatchT: "Мос ёзув йўқ", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади", autoCheck: "Автоматик текширув", deadline: "Муддат ўтди", adminRuling: "Админ қарори",
  },
  ru: {
    titleDispute: "Возражения", titleLate: "Поздние подтверждения",
    introMore: "Подробнее", introLess: "Свернуть",
    ruleDispute: "Задача, отклонённая ИИ, автоматической проверкой или решением администратора, сразу теряет вес. Лидер пишет возражение, бригадир задаёт вопросы и отклоняет его или передаёт администраторам, а балл возвращается только по решению администратора.",
    ruleLate: "За подтверждение, отправленное после срока, балл сам не начисляется: сначала смотрит бригадир, затем решают администраторы.",
    ruleAdmin: "Откройте карточку: вверху кнопки решения, затем фото и причина, ниже чат — спросите лидера и бригадира и решите.",
    ruleSup: "Откройте карточку: задайте вопросы в чате, затем отклоните или передайте администраторам — в обоих случаях нужен комментарий.",
    ruleRead: "Откройте карточку: фото, решение и чат в одном месте. Если вам задали вопрос, ответьте в этом чате.",
    segAll: "Все", segTodo: "Ваша очередь", segUnread: "Новые сообщения", segDone: "История",
    stageAdm: "У админов", stageSup: "У бригадиров",
    searchPh: "Лидер, бригадир или задача…",
    shift1: "Смена 1", shift2: "Смена 2",
    stSupervisor: "У бригадира", stAdmin: "Ждёт решения администратора",
    stApproved: "Принято", stApprovedLate: "Принято", stRejected: "Отклонено",
    stCancelled: "Решение отменено",
    yourTurn: "Ваша очередь", unread: "{n} новых", msgs: "{n} сообщ.", files: "{n} файл.",
    heldNote: "Сохранено — уйдёт бригадиру, когда день закроют все лидеры",
    lateBy: "опоздание", lateNone: "не измерить", unitD: "д", unitH: "ч", unitM: "мин",
    kFiled: "Возражение", kFiledLate: "Причина", kSupRejected: "Бригадир отклонил",
    kUplifted: "Передано администраторам", kApproved: "Принято", kApprovedLate: "Принято",
    kRejected: "Отклонено", kUndone: "Решение отменено", kInvited: "Добавлен(а) в чат",
    emptyDispute: "Возражений нет", emptyDisputeM: "Никто не оспорил отклонённую задачу.",
    emptyLate: "Поздних подтверждений нет", emptyLateM: "Здесь появятся подтверждения, отправленные после срока.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось", autoCheck: "Автоматическая проверка", deadline: "Срок истёк", adminRuling: "Решение администратора",
  },
  en: {
    titleDispute: "Objections", titleLate: "Late proofs",
    introMore: "More", introLess: "Less",
    ruleDispute: "A rejected task — by the AI, an automatic check or an admin's ruling — loses its weight at once. The leader writes an objection, the brigadir asks what they need and refuses it or passes it to the admins, and the point comes back only on an admin's decision.",
    ruleLate: "A proof sent after its deadline earns no point by itself: the brigadir looks first, then the admins decide.",
    ruleAdmin: "Open a card: the ruling buttons on top, then the photos and the reason, the chat below — ask the leader and the brigadir, then decide.",
    ruleSup: "Open a card: ask in the chat, then refuse it or pass it to the admins — both need your comment.",
    ruleRead: "Open a card: the photos, the ruling and the chat are in one place. If you are asked something, answer in that chat.",
    segAll: "All", segTodo: "Your turn", segUnread: "New messages", segDone: "History",
    stageAdm: "On admins", stageSup: "On supervisors",
    searchPh: "Leader, brigadir or task…",
    shift1: "Shift 1", shift2: "Shift 2",
    stSupervisor: "With the brigadir", stAdmin: "Awaiting an admin decision",
    stApproved: "Upheld", stApprovedLate: "Approved", stRejected: "Refused",
    stCancelled: "Ruling undone",
    yourTurn: "Your turn", unread: "{n} new", msgs: "{n} messages", files: "{n} files",
    heldNote: "Saved — goes to the brigadir once every leader has closed the day",
    lateBy: "late", lateNone: "not measurable", unitD: "d", unitH: "h", unitM: "min",
    kFiled: "Objection", kFiledLate: "Reason", kSupRejected: "The brigadir refused",
    kUplifted: "Passed to the admins", kApproved: "Upheld", kApprovedLate: "Approved",
    kRejected: "Refused", kUndone: "Ruling undone", kInvited: "Added to the chat",
    emptyDispute: "No objections", emptyDisputeM: "Nobody has contested a rejected task.",
    emptyLate: "No late proofs", emptyLateM: "Proofs sent after their deadline appear here.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable", autoCheck: "Automatic check", deadline: "Deadline passed", adminRuling: "Admin's ruling",
  },
};

// One state → one look, shared by the chip and the card's left edge. The two
// OPEN stages are both amber — nothing has been decided in either — and told
// apart by icon and words; `cancelled` is colourless (an undone ruling says
// nothing about the score any more).
const STATE = {
  supervisor: { color: C_WAIT, Icon: UserCheck, key: "stSupervisor" },
  admin:      { color: C_WAIT, Icon: Hourglass, key: "stAdmin" },
  approved:   { color: C_OK,   Icon: ShieldCheck, key: "stApproved", lateKey: "stApprovedLate" },
  rejected:   { color: C_BAD,  Icon: Ban, key: "stRejected" },
  cancelled:  { color: C_OFF,  Icon: CircleSlash, key: "stCancelled" },
};

const KIND = {
  filed: { key: "kFiled", lateKey: "kFiledLate", color: C_WAIT },
  sup_rejected: { key: "kSupRejected", color: C_BAD },
  uplifted: { key: "kUplifted", color: C_UP },
  approved: { key: "kApproved", lateKey: "kApprovedLate", color: C_OK },
  rejected: { key: "kRejected", color: C_BAD },
  undone: { key: "kUndone", color: C_OFF },
  invited: { key: "kInvited", color: C_UP },
};

// Which STAGE owns a row — the split the two sub-tabs make, off `status`. An
// OPEN row belongs to whoever rules next; a SETTLED one to whoever ended it.
const stageOf = (it) =>
  it.status === "supervisor" ? "sup"
    : it.status === "admin" ? "adm"
      : (it.status === "rejected" && it.sup?.action === "rejected") ? "sup" : "adm";

const same = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Does this row survive the PAGE scope bar (period · shift · supervisor ·
 *  leader)? An appeal is about one (leader, day) checklist row. */
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

const isDone = (it) => ["approved", "rejected", "cancelled"].includes(it.status);

// `ink` — the label in the theme's status INK (`--status-*`, index.css), which
// holds AA on a light card where the raw hue does not (amber on white is
// ~2:1). The leader-phone rows use it; the queue's desktop cards are as before.
const INK = { [C_OK]: "var(--status-ok)", [C_WAIT]: "var(--status-warn)", [C_BAD]: "var(--status-bad)", [C_OFF]: "var(--text-3)" };
function StateChip({ status, late, T, ink = false }) {
  const st = STATE[status] || STATE.cancelled;
  const { color, Icon } = st;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${ink ? "text-[12px]" : "text-[11px]"} font-semibold flex-shrink-0`}
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color: ink ? (INK[color] || color) : color }}>
      <Icon size={12} />{T[(late && st.lateKey) || st.key]}
    </span>
  );
}

const lastAt = (it) => it.chat?.last?.at || it.at || it.date || "";

/** One appeal as a LEADER reads it on a phone (2026-11-20): it leads with the
 *  TASK — the leader knows whose appeal it is, it is theirs — then where it
 *  stands as ONE chip and how many messages wait unread; the newest entry of
 *  the conversation on one line under it. Every appeal of theirs, whichever
 *  judge it argues with and whether an objection or a late proof, reads the
 *  same, so «Bahslar» can list both kinds in one column. */
export function AppealRow({ it, kind, cat, first }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const nav = useNavigate();
  const T = TXT[lang] || TXT.uz;
  const N = NATIJA_T[lang] || NATIJA_T.uz;
  const late = kind === "late";
  const tone = STATE[it.status] || STATE.cancelled;
  const n = Number(it.chat?.unread || 0);
  const last = it.chat?.last;
  // The leader reads only their own appeals, so a «leader» author is the
  // reader: «Siz», never their own name. Anybody else by surname.
  const who = last ? (last.role === "leader" ? N.you : (tl(last.author) || "").split(/\s+/)[0]) : "";
  const name = taskTitle(it, lang, cat) || fill(N.taskN, { n: it.taskId });
  return (
    <button type="button"
      onClick={() => nav(`/leaders/appeal/${late ? "late" : "dispute"}/${it.id}`)}
      className="w-full text-left flex min-h-[64px] transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--brand-ring)]"
      style={first ? undefined : { borderTop: "1px solid var(--border)" }}>
      <span aria-hidden="true" className="w-1 flex-shrink-0" style={{ background: tone.color }} />
      <span className="flex-1 min-w-0 px-3 py-3 flex flex-col gap-1.5">
        <span className="flex items-start gap-2 min-w-0">
          <span className="flex-1 min-w-0 text-[15px] font-semibold leading-snug line-clamp-2 break-words" style={{ color: "var(--text-1)" }}>
            {name}
          </span>
          {n > 0 && (
            <span className="flex-shrink-0 mt-px inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-bold tabular-nums"
              style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
              {fill(N.newN, { n })}
            </span>
          )}
        </span>
        <span className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
          <StateChip status={it.status} late={late} T={T} ink />
          {/* Which kind, by its icon (the one the queues wear); the words are
              read out, the date is printed. */}
          <span className="inline-flex items-center gap-1 text-[12px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {late ? <Clock size={12} aria-hidden="true" /> : <MessageSquareWarning size={12} aria-hidden="true" />}
            <span className="sr-only">{late ? N.kindLate : N.kindDispute} · </span>
            {shortDate(it.date, lang)}
          </span>
        </span>
        {last && (last.text || last.files > 0) && (
          <span className="text-[13px] leading-snug truncate" style={{ color: "var(--text-2)" }}>
            <span className="font-semibold" style={{ color: "var(--text-1)" }}>{who}</span>
            {": "}{last.text || T.files.replace("{n}", last.files)}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="flex items-center pr-2" style={{ color: "var(--text-3)" }}>
        <ChevronRight size={16} />
      </span>
    </button>
  );
}

const DIGEST_STEP = 5;

/** «Bahslar» — a leader's objections AND late proofs as ONE list, newest
 *  activity first, an unread one ahead of them (Natijam, a leader's phone)
 *  — what waits on the leader before what merely happened. The two queues the page keeps
 *  as tabs read the same two payloads under the same keys, so opening either
 *  costs nothing more. The server serves every OPEN appeal whatever its day and
 *  the settled ones of the period; all of it is listed — an argument still
 *  running is never «outside the period». Renders nothing once it knows there
 *  is nothing: an empty heading at the foot of the page says only that. */
export function AppealDigest({ from = "", to = "" }) {
  const { lang } = useLang();
  const N = NATIJA_T[lang] || NATIJA_T.uz;
  const cat = useTaskCatalog();
  const [shown, setShown] = useState(DIGEST_STEP);
  const params = { ...(from && { from }), ...(to && { to }) };
  const keyOf = (base) => (from || to ? [base, { from, to }] : [base]);
  const disp = useQuery({
    queryKey: keyOf("leader-disputes"),
    queryFn: () => api.get("/api/leaders/disputes", { params }).then((r) => r.data),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
  });
  const lp = useQuery({
    queryKey: keyOf("leader-late-proofs"),
    queryFn: () => api.get("/api/leaders/late-proofs", { params }).then((r) => r.data),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => [
    ...(disp.data?.items ?? []).map((it) => ({ it, kind: "dispute" })),
    ...(lp.data?.items ?? []).map((it) => ({ it, kind: "late" })),
  ].sort((a, b) => ((Number(b.it.chat?.unread || 0) > 0) - (Number(a.it.chat?.unread || 0) > 0))
    || (lastAt(a.it) < lastAt(b.it) ? 1 : lastAt(a.it) > lastAt(b.it) ? -1 : b.it.id - a.it.id)),
  [disp.data, lp.data]);

  const loading = (disp.isLoading || lp.isLoading) && !items.length;
  if (!loading && !items.length) return null;
  const rest = items.length - shown;
  return (
    <section aria-label={N.appeals} className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={MessagesSquare} title={N.appeals} />
      {loading ? (
        <div className="p-3 space-y-2">
          {[0, 1].map((i) => <SkeletonBlock key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <>
          {items.slice(0, shown).map(({ it, kind }, i) => (
            <AppealRow key={`${kind}-${it.id}`} it={it} kind={kind} cat={cat} first={i === 0} />
          ))}
          {rest > 0 && (
            <button type="button" onClick={() => setShown(items.length)}
              className="w-full min-h-[48px] px-3 flex items-center justify-center gap-2 text-[14px] font-semibold transition-colors hover:bg-[var(--bg-inner)]"
              style={{ borderTop: "1px solid var(--border)", color: "var(--brand-text)" }}>
              <ChevronDown size={15} />{fill(N.more, { n: rest })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function AppealQueue({ thread, scope, onClearScope }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const T = TXT[lang] || TXT.uz;
  const nav = useNavigate();
  const late = thread === "late";
  const role = auth?.role;
  // A leader on a phone reads their own appeals, task first (AppealRow), with
  // no search over a list of one person and no «your turn» segment — the turn
  // a leader takes is answering in the chat, which «Yangi xabar» already finds.
  const leaderPhone = useLeaderPhone();
  const cat = useTaskCatalog();
  // A leader reads their own appeals only; a split by stage hid them behind
  // the tab they did not open. Everybody else keeps the split, landing where
  // their work is.
  const split = role !== "leader";
  // Both toggles survive opening a chat and coming back. The stage is kept per
  // ROLE: the keys are per browser, and an admin's «Adminlarda» must not land a
  // brigadir sharing the machine away from their own half.
  const [stage, setStage] = usePersistentState(
    `leaders_appeal_${thread}_stage_${role || "none"}`,
    role === "supervisor" ? "sup" : "adm");
  const [seg, setSeg] = usePersistentState(`leaders_appeal_${thread}_seg`, "all");
  // A segment the leader's phone does not offer must not filter it unseen.
  const segEff = leaderPhone && seg === "todo" ? "all" : seg;
  const [introOpen, setIntroOpen] = useState(false);
  const [q, setQ] = useState("");

  // The server serves EVERY open appeal, and the settled ones of the page's
  // period — so «Tarix» of a day older than the newest few hundred still
  // reads whole. Without a period the key is the bare one the tab badge reads,
  // and the two share one request.
  const from = scope?.from || "", to = scope?.to || "";
  const base = late ? "leader-late-proofs" : "leader-disputes";
  const qKey = from || to ? [base, { from, to }] : [base];
  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => api.get(late ? "/api/leaders/late-proofs" : "/api/leaders/disputes",
      { params: { ...(from && { from }), ...(to && { to }) } })
      .then((r) => r.data),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
  });
  const canApprove = !!(data?.canApprove ?? data?.canDecide);
  const canSupervise = !!data?.canSupervise;

  const all = useMemo(() => data?.items ?? [], [data]);
  // «Barchasini ko'rsatish» sets the page scope aside for THIS queue only
  // (2026-11-20). It used to clear the page's period and filters — for every
  // tab, without a word: Monitoring came back on «Sanalarni tanlang». The
  // scope stays exactly as picked; this list shows the rest too, says so in
  // the same notice, and a new scope (another period, another filter) puts it
  // back under the page's control.
  const scopeKey = JSON.stringify(scope || {});
  const [outFor, setOutFor] = useState(null);
  const showOut = outFor === scopeKey;
  const items = useMemo(() => (showOut ? all : all.filter((it) => inScope(it, scope))),
    [all, scope, showOut]);
  const mine = (it) => !!it.canAct;
  const unread = (it) => Number(it.chat?.unread || 0);

  const staged = useMemo(
    () => (split ? items.filter((it) => stageOf(it) === stage) : items),
    [items, stage, split]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = staged.filter((it) => {
      if (segEff === "todo" && !mine(it)) return false;
      if (segEff === "unread" && !unread(it)) return false;
      if (segEff === "done" && !isDone(it)) return false;
      if (needle) {
        const hay = `${tl(it.leader)} ${it.leader} ${tl(it.supervisor)} ${it.supervisor} ${taskTitle(it, lang, cat)} ${it.reason} ${it.chat?.last?.text || ""}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    // Your turn first, then what you have not read, then the newest activity.
    const lastAt = (it) => it.chat?.last?.at || it.at || it.date || "";
    return [...arr].sort((a, b) =>
      (mine(b) - mine(a))
      || ((unread(b) > 0) - (unread(a) > 0))
      || (lastAt(a) < lastAt(b) ? 1 : lastAt(a) > lastAt(b) ? -1 : b.id - a.id));
  }, [staged, segEff, q, tl, lang, cat]);

  const counts = useMemo(() => ({
    all: staged.length,
    todo: staged.filter(mine).length,
    unread: staged.filter((it) => unread(it) > 0).length,
    done: staged.filter(isDone).length,
  }), [staged]);

  const stageTodo = useMemo(() => ({
    adm: items.filter((it) => it.status === "admin").length,
    sup: items.filter((it) => it.status === "supervisor").length,
  }), [items]);

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
  const lateText = (m) => (m === null || m === undefined)
    ? T.lateNone : fmtDuration(m, { day: T.unitD, hour: T.unitH, min: T.unitM });

  const preview = (it) => {
    const last = it.chat?.last;
    if (!last) {
      return it.reason ? { who: tl(it.by || it.leader), label: null, text: it.reason, files: 0, at: it.at } : null;
    }
    const k = KIND[last.kind];
    return {
      who: tl(last.author) || "—",
      label: k ? { text: T[(late && k.lateKey) || k.key], color: k.color } : null,
      text: last.text, files: last.files, at: last.at,
    };
  };

  return (
    <>
      {/* The rule of the queue, for whoever has not read it yet. Two lines
          and a «Batafsil» on a phone: in full it was a seven-line card, a
          third of the first screen, standing between a regular and the queue
          they open this tab to work. */}
      {/* Not on a phone (2026-11-20, the operator: no explanatory notes on a
          phone page, ever) — the queue is what the tab is opened for. */}
      <div className="rounded-2xl p-3.5 sm:p-4 mb-3 flex items-start gap-3 max-md:hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
          {late ? <Clock size={16} /> : <MessageSquareWarning size={16} />}
        </span>
        <div className="min-w-0 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>
            {late ? T.titleLate : T.titleDispute}
          </div>
          <p id={`appeal-rule-${thread}`} className={introOpen ? "" : "max-sm:line-clamp-2"}>
            {late ? T.ruleLate : T.ruleDispute}{" "}
            {canApprove ? T.ruleAdmin : canSupervise ? T.ruleSup : T.ruleRead}
          </p>
          <button type="button" onClick={() => setIntroOpen((o) => !o)}
            aria-expanded={introOpen} aria-controls={`appeal-rule-${thread}`}
            className="sm:hidden mt-1 -ml-1 px-1 py-1 inline-flex items-center gap-1 rounded-md text-[12px] font-semibold"
            style={{ color: "var(--brand-text)" }}>
            {introOpen ? T.introLess : T.introMore}
            <ChevronDown size={13} className="transition-transform" style={{ transform: introOpen ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
      </div>

      {!isLoading && (
        <ScopeNotice hidden={out.hidden} todo={showOut ? 0 : out.todo} showing={showOut}
          onClear={onClearScope ? () => setOutFor(scopeKey) : undefined}
          onBack={() => setOutFor(null)} />
      )}

      {split && (
        <SegmentedToggle asTabs ariaLabel={late ? T.titleLate : T.titleDispute}
          value={stage} onChange={setStage} className="mb-3"
          options={[
            { value: "adm", label: segLabel(T.stageAdm, stageTodo.adm) },
            { value: "sup", label: segLabel(T.stageSup, stageTodo.sup) },
          ]} />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {!leaderPhone && (
          <div className="flex-1 min-w-[180px] max-w-sm">
            <SearchInput value={q} onChange={setQ} placeholder={T.searchPh} />
          </div>
        )}
        <SegmentedToggle
          value={segEff}
          onChange={setSeg}
          size={leaderPhone ? "lg" : "md"}
          className={leaderPhone ? "w-full" : ""}
          fill={leaderPhone}
          // On a leader's phone only «Yangi xabar» keeps its count — the one
          // that asks something of them; the list itself counts the rest, and
          // three labelled counts do not fit 320px at a thumb's height.
          options={[
            { value: "all", label: leaderPhone ? T.segAll : segLabel(T.segAll, counts.all) },
            ...(leaderPhone ? [] : [{ value: "todo", label: segLabel(T.segTodo, counts.todo) }]),
            { value: "unread", label: segLabel(leaderPhone ? (NATIJA_T[lang] || NATIJA_T.uz).segNew : T.segUnread, counts.unread) },
            { value: "done", label: leaderPhone ? T.segDone : segLabel(T.segDone, counts.done) },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : !all.length ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={late ? T.emptyLate : T.emptyDispute}
            message={late ? T.emptyLateM : T.emptyDisputeM} showUploadLink={false} />
        </div>
      ) : !shown.length ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.noMatchT} message={T.noMatchM} showUploadLink={false} />
        </div>
      ) : leaderPhone ? (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          {shown.map((it, i) => (
            <AppealRow key={it.id} it={it} kind={thread} cat={cat} first={i === 0} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((it) => {
            const tone = STATE[it.status] || STATE.cancelled;
            const turn = mine(it);
            const n = unread(it);
            const flags = it.verdict?.flags || [];
            const pv = preview(it);
            const count = Number(it.chat?.count || 0);
            return (
              <button key={it.id} type="button"
                onClick={() => nav(`/leaders/appeal/${late ? "late" : "dispute"}/${it.id}`)}
                className="w-full text-left rounded-2xl overflow-hidden transition-colors hover:border-[var(--brand-border)]"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${turn ? hexA(tone.color, 0.45) : "var(--border)"}`,
                }}>
                <div className="flex">
                  {/* the state's colour as a left edge: scannable down a long list */}
                  <div className="w-1 flex-shrink-0" style={{ background: tone.color }} />
                  <div className="flex-1 p-3 sm:p-4 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight flex items-center gap-2 flex-wrap"
                          style={{ color: "var(--text-1)" }}>
                          {tl(it.leader) || "—"}
                          {turn && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: hexA(C_WAIT, 0.14), color: C_WAIT }}>
                              <Hand size={10} />{T.yourTurn}
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>
                          {tl(it.supervisor) || "—"} · <span className="tabular-nums">{day(it.date)}</span>
                          {it.shift ? ` · ${T[`shift${it.shift}`] || ""}` : ""}
                        </div>
                      </div>
                      <StateChip status={it.status} late={late} T={T} />
                    </div>
                    {/* Filed and not yet sent: it reaches the brigadir once
                        every leader of the unit has closed the day. */}
                    {late && it.held && it.status === "supervisor" && (
                      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
                        {T.heldNote}
                      </p>
                    )}

                    <div className="mt-2 flex items-start gap-2 text-[13px]">
                      <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5"
                        style={{ color: "var(--text-4)" }}>№{it.taskId}</span>
                      <span className="font-semibold leading-snug" style={{ color: "var(--text-2)" }}>
                        {taskTitle(it, lang, cat) || "—"}
                      </span>
                    </div>

                    {/* What the appeal is ABOUT, at scanning level: the AI's
                        flags for an objection, how late for a late proof. */}
                    {!late && !!flags.length && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {flags.map((f) => (
                          <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
                            {T[`f_${f}`] || f}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* An objection to an ADMIN's «not done» ruling names that
                        ruling — it is what is argued with, whatever the AI or
                        the automatic check said under it. */}
                    {!late && it.ruling && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                          style={{ background: hexA(C_BAD, 0.1), color: C_BAD,
                                   border: `1px solid ${hexA(C_BAD, 0.25)}` }}>
                          <ShieldX size={11} />{T.adminRuling}{it.ruling.by ? ` · ${tl(it.ruling.by)}` : ""}
                        </span>
                      </div>
                    )}
                    {/* An objection to an AUTOMATIC check (#1, #8, #9, #11) has
                        no AI flags — it says which judge it argues with instead. */}
                    {!late && !flags.length && !it.ruling && it.auto && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                          style={{ background: "var(--bg-inner)", color: "var(--text-2)",
                                   border: "1px solid var(--border)" }}>
                          <Settings2 size={11} />{T.autoCheck} · {it.auto.time}
                        </span>
                      </div>
                    )}
                    {/* …and one to the platform closing the task unsubmitted
                        at its hour (2026-10-30). */}
                    {!late && !flags.length && !it.ruling && !it.auto && it.missed && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                          style={{ background: "var(--bg-inner)", color: "var(--text-2)",
                                   border: "1px solid var(--border)" }}>
                          <TimerOff size={11} />{T.deadline}{it.missed.time ? ` · ${it.missed.time}` : ""}
                        </span>
                      </div>
                    )}
                    {late && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
                          <Timer size={11} />{lateText(it.lateMin)} {T.lateBy}
                        </span>
                      </div>
                    )}

                    {/* The newest entry of its conversation. */}
                    {pv && (
                      <div className="mt-2 rounded-xl px-3 py-2 flex items-start gap-2"
                        style={{ background: "var(--bg-inner)" }}>
                        <MessagesSquare size={13} className="flex-shrink-0 mt-0.5"
                          style={{ color: "var(--text-4)" }} />
                        <div className="min-w-0 flex-1 text-[12px] leading-snug break-words line-clamp-2"
                          style={{ color: "var(--text-2)" }}>
                          <span className="font-semibold" style={{ color: "var(--text-1)" }}>{pv.who}</span>
                          {pv.label && (
                            <span className="font-semibold" style={{ color: pv.label.color }}> · {pv.label.text}</span>
                          )}
                          {(pv.text || pv.files > 0) && ": "}
                          {pv.text}
                          {pv.files > 0 && (
                            <span className="inline-flex items-center gap-0.5 ml-1 align-middle" style={{ color: "var(--text-4)" }}>
                              <Paperclip size={10} />{T.files.replace("{n}", pv.files)}
                            </span>
                          )}
                        </div>
                        {pv.at && (
                          <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
                            {when(pv.at)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-4)" }}>
                      {count > 0 && <span>{T.msgs.replace("{n}", count)}</span>}
                      {n > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md font-bold text-white"
                          style={{ background: "var(--brand)" }}>
                          {T.unread.replace("{n}", n)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center pr-2" style={{ color: "var(--text-4)" }}>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
