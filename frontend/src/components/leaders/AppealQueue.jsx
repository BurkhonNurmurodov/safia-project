import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquareWarning, Hourglass, ShieldCheck, Ban, UserCheck, CircleSlash,
  Clock, Timer, MessagesSquare, ChevronRight, Paperclip, Hand,
} from "lucide-react";
import SegmentedToggle from "../ui/SegmentedToggle";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import ScopeNotice from "./ScopeNotice";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fmtDuration } from "../../utils/formatters";
import api from "../../utils/api";

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
const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || o?.uz || "";

const TXT = {
  uz: {
    titleDispute: "Norozliklar", titleLate: "Kechikkan isbotlar",
    ruleDispute: "AI rad etgan vazifa o'z og'irligini darhol yo'qotadi. Lider norozilik yozadi, brigadir savol berib rad etadi yoki adminlarga yuboradi, ball faqat admin qaroridan keyin qaytadi.",
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
    lateBy: "kechikish", lateNone: "aniqlanmadi", unitD: "kun", unitH: "soat", unitM: "daq",
    kFiled: "Norozilik", kFiledLate: "Sabab", kSupRejected: "Brigadir rad etdi",
    kUplifted: "Adminlarga yuborildi", kApproved: "Qabul qilindi", kApprovedLate: "Tasdiqlandi",
    kRejected: "Rad etildi", kUndone: "Qaror bekor qilindi",
    emptyDispute: "Norozilik yo'q", emptyDisputeM: "Hech kim AI qaroriga e'tiroz bildirmagan.",
    emptyLate: "Kechikkan isbot yo'q", emptyLateM: "Vaqtidan keyin yuborilgan isbotlar shu yerda ko'rinadi.",
    noMatchT: "Mos yozuv yo'q", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    titleDispute: "Норозликлар", titleLate: "Кечиккан исботлар",
    ruleDispute: "AI рад этган вазифа ўз оғирлигини дарҳол йўқотади. Лидер норозилик ёзади, бригадир савол бериб рад этади ёки админларга юборади, балл фақат админ қароридан кейин қайтади.",
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
    lateBy: "кечикиш", lateNone: "аниқланмади", unitD: "кун", unitH: "соат", unitM: "дақ",
    kFiled: "Норозилик", kFiledLate: "Сабаб", kSupRejected: "Бригадир рад этди",
    kUplifted: "Админларга юборилди", kApproved: "Қабул қилинди", kApprovedLate: "Тасдиқланди",
    kRejected: "Рад этилди", kUndone: "Қарор бекор қилинди",
    emptyDispute: "Норозилик йўқ", emptyDisputeM: "Ҳеч ким AI қарорига эътироз билдирмаган.",
    emptyLate: "Кечиккан исбот йўқ", emptyLateM: "Вақтидан кейин юборилган исботлар шу ерда кўринади.",
    noMatchT: "Мос ёзув йўқ", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    titleDispute: "Возражения", titleLate: "Поздние подтверждения",
    ruleDispute: "Задача, отклонённая ИИ, сразу теряет вес. Лидер пишет возражение, бригадир задаёт вопросы и отклоняет его или передаёт администраторам, а балл возвращается только по решению администратора.",
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
    lateBy: "опоздание", lateNone: "не измерить", unitD: "д", unitH: "ч", unitM: "мин",
    kFiled: "Возражение", kFiledLate: "Причина", kSupRejected: "Бригадир отклонил",
    kUplifted: "Передано администраторам", kApproved: "Принято", kApprovedLate: "Принято",
    kRejected: "Отклонено", kUndone: "Решение отменено",
    emptyDispute: "Возражений нет", emptyDisputeM: "Никто не оспорил решение ИИ.",
    emptyLate: "Поздних подтверждений нет", emptyLateM: "Здесь появятся подтверждения, отправленные после срока.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    titleDispute: "Objections", titleLate: "Late proofs",
    ruleDispute: "A task the AI rejects loses its weight at once. The leader writes an objection, the brigadir asks what they need and refuses it or passes it to the admins, and the point comes back only on an admin's decision.",
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
    lateBy: "late", lateNone: "not measurable", unitD: "d", unitH: "h", unitM: "min",
    kFiled: "Objection", kFiledLate: "Reason", kSupRejected: "The brigadir refused",
    kUplifted: "Passed to the admins", kApproved: "Upheld", kApprovedLate: "Approved",
    kRejected: "Refused", kUndone: "Ruling undone",
    emptyDispute: "No objections", emptyDisputeM: "Nobody has contested an AI ruling.",
    emptyLate: "No late proofs", emptyLateM: "Proofs sent after their deadline appear here.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable",
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

function StateChip({ status, late, T }) {
  const st = STATE[status] || STATE.cancelled;
  const { color, Icon } = st;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0"
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color }}>
      <Icon size={12} />{T[(late && st.lateKey) || st.key]}
    </span>
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
  // A leader reads their own appeals only; a split by stage hid them behind
  // the tab they did not open. Everybody else keeps the split, landing where
  // their work is.
  const split = role !== "leader";
  const [stage, setStage] = useState(role === "supervisor" ? "sup" : "adm");
  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");

  const qKey = late ? ["leader-late-proofs"] : ["leader-disputes"];
  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => api.get(late ? "/api/leaders/late-proofs" : "/api/leaders/disputes")
      .then((r) => r.data),
    refetchInterval: 60000,
  });
  const canApprove = !!(data?.canApprove ?? data?.canDecide);
  const canSupervise = !!data?.canSupervise;

  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => all.filter((it) => inScope(it, scope)), [all, scope]);
  const mine = (it) => !!it.canAct;
  const unread = (it) => Number(it.chat?.unread || 0);

  const staged = useMemo(
    () => (split ? items.filter((it) => stageOf(it) === stage) : items),
    [items, stage, split]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = staged.filter((it) => {
      if (seg === "todo" && !mine(it)) return false;
      if (seg === "unread" && !unread(it)) return false;
      if (seg === "done" && !isDone(it)) return false;
      if (needle) {
        const hay = `${tl(it.leader)} ${it.leader} ${tl(it.supervisor)} ${it.supervisor} ${pick(it.taskName, lang)} ${it.reason} ${it.chat?.last?.text || ""}`;
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
  }, [staged, seg, q, tl, lang]);

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
      <div className="rounded-2xl p-4 mb-3 flex items-start gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
          {late ? <Clock size={16} /> : <MessageSquareWarning size={16} />}
        </span>
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>
            {late ? T.titleLate : T.titleDispute}
          </div>
          {late ? T.ruleLate : T.ruleDispute}{" "}
          {canApprove ? T.ruleAdmin : canSupervise ? T.ruleSup : T.ruleRead}
        </div>
      </div>

      {!isLoading && <ScopeNotice hidden={out.hidden} todo={out.todo} onClear={onClearScope} />}

      {split && (
        <SegmentedToggle asTabs ariaLabel={late ? T.titleLate : T.titleDispute}
          value={stage} onChange={setStage} className="mb-3"
          options={[
            { value: "adm", label: segLabel(T.stageAdm, stageTodo.adm) },
            { value: "sup", label: segLabel(T.stageSup, stageTodo.sup) },
          ]} />
      )}

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
            { value: "unread", label: segLabel(T.segUnread, counts.unread) },
            { value: "done", label: segLabel(T.segDone, counts.done) },
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

                    <div className="mt-2 flex items-start gap-2 text-[13px]">
                      <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5"
                        style={{ color: "var(--text-4)" }}>№{it.taskId}</span>
                      <span className="font-semibold leading-snug" style={{ color: "var(--text-2)" }}>
                        {pick(it.taskName, lang) || "—"}
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
