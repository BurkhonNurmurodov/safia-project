import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, ShieldCheck, Hourglass, Ban, Undo2, Send, Info,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
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
 * «Kechikkan hisobotlar» — the review surface for shift-1 checklist days the
 * submission window voided (see routers/leaders.py).
 *
 * The flow it draws: a voided day scores 0, the unit's own brigadir asks for it
 * to count and must say why, an ADMIN decides, and an opened day counts at its
 * own score while staying flagged as late forever. Two roles read this screen
 * with different jobs, so one card renders both — the state line always says
 * what happened, and the buttons under it are only ever the ones this viewer
 * may press (the server checks again either way).
 *
 * Design rules this leans on:
 *  - actionable first. The list sorts what needs THIS viewer before everything
 *    else, so the work is at the top without a filter that hides the rest.
 *  - the reason is never optional and never hidden: it is what an admin decides
 *    against, so it is quoted on the card, not tucked behind a tooltip.
 *  - a decision states its cost before it is taken («this day will count at
 *    96%»), and a failure leaves the dialog standing with the reason on it —
 *    this is a Telegram WebView, where window.alert() is silently swallowed.
 */

const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_OFF = "#94a3b8";

const MONTHS = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const fmtDate = (iso, lang) => {
  const [y, m, d] = String(iso || "").split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en") return `${mn} ${d}, ${y}`;
  if (lang === "ru") return `${d} ${mn} ${y}`;
  return `${d}-${mn}, ${y}`;
};
// The clock a card prints is the moment the checklist was FILED, and that is not
// always a moment on the day it reports on — a night filed at 10:00 the morning
// after belongs to the night before. A bare "07:12" beside a shift-2 day whose
// window shuts at 09:00 the NEXT morning then reads as impossible, which is how a
// correctly voided row gets mistaken for a bug. Print the date too whenever the
// two disagree; numeric, so it needs no fifth translation of every month.
const stamp = (ts, day) => {
  if (!ts) return "—";
  const on = String(ts).slice(0, 10), at = String(ts).slice(11, 16);
  return on === String(day || "").slice(0, 10) ? at : `${on.slice(8, 10)}.${on.slice(5, 7)} ${at}`;
};

const TXT = {
  uz: {
    title: "Kechikkan hisobotlar",
    rule: "Hisobot o'z smenasining oynasida yuborilishi kerak: 1-smena — o'z kunida 08:00–20:00, 2-smena — 17:00 dan ertasi kuni 09:00 gacha. Bu oraliqdan tashqarida kelgan kunlar shu yerda to'planadi.",
    ruleSup: "Kunni ochishni so'rang — sababini yozib. Qarorni admin qabul qiladi.",
    ruleAdmin: "Brigadirlarning so'rovlarini shu yerda ko'rib chiqasiz. Ochilgan kun o'z natijasi bilan hisoblanadi va kechikkan deb belgilangan holda qoladi.",
    segAll: "Barchasi", segTodo: "Sizga kerak", segPending: "Kutilmoqda", segDone: "Tarix",
    searchPh: "Lider ismi…",
    stVoid: "Hisobga olinmayapti", stPending: "Admin qarorini kutmoqda",
    stApproved: "Ochildi — hisobga olinadi", stRejected: "Ochilmadi",
    waitingSup: "Brigadirning so'rovi kutilmoqda",
    reqBy: "So'radi", decidedBy: "Qaror qildi", nRows: "{n} ta hisobot",
    askOpen: "Ochishni so'rash", openNow: "Kunni ochish", approve: "Tasdiqlash",
    reject: "Rad etish", withdraw: "Qaytarib olish", askAgain: "Qayta so'rash",
    revoke: "Ochishni bekor qilish",
    reason: "Sabab", reasonPh: "Nega bu kun hisobga olinishi kerak?",
    reasonHint: "Sabab barcha adminlarga Telegramda yuboriladi va yozuvda qoladi.",
    reasonShort: "Sababni yozing (kamida 3 ta belgi).",
    modalReq: "Kechikkan kunni ochishni so'rash", modalAdmin: "Kechikkan kunni ochish",
    whatSup: "So'rov barcha adminlarga Telegramda yuboriladi. Kun faqat admin tasdiqlagandan keyin hisoblanadi.",
    whatAdmin: "Siz admin sifatida bu kunni darhol ochasiz. Lider xabardor qilinadi.",
    send: "Yuborish", open: "Ochish", cancel: "Bekor qilish",
    cApproveT: "Kunni ochish",
    cApproveM: "{leader} — {date}. Bu kun {score}% bilan hisoblanadi va kechikkan deb belgilangan holda qoladi. Lider xabardor qilinadi.",
    cRejectT: "So'rovni rad etish", cRejectM: "{leader} — {date}. Kun 0% bilan qoladi.",
    cRevokeT: "Ochishni bekor qilish", cRevokeM: "{leader} — {date}. Bu kun yana 0% bilan hisoblanadi.",
    cWithdrawT: "So'rovni qaytarib olish", cWithdrawM: "{leader} — {date}. So'rov o'chiriladi, kun 0% bilan qoladi.",
    okReq: "So'rov adminlarga yuborildi", okOpen: "Kun ochildi",
    okReject: "So'rov rad etildi", okWithdraw: "So'rov qaytarib olindi",
    fail: "Amal bajarilmadi",
    emptyT: "Kechikkan hisobot yo'q", emptyM: "Barcha hisobotlar o'z smenasining oynasida kelgan.",
    noMatchT: "Mos kun topilmadi", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
  },
  uz_cyrl: {
    title: "Кечиккан ҳисоботлар",
    rule: "Ҳисобот ўз сменасининг ойнасида юборилиши керак: 1-смена — ўз кунида 08:00–20:00, 2-смена — 17:00 дан эртаси куни 09:00 гача. Бу оралиқдан ташқарида келган кунлар шу ерда тўпланади.",
    ruleSup: "Кунни очишни сўранг — сабабини ёзиб. Қарорни админ қабул қилади.",
    ruleAdmin: "Бригадирларнинг сўровларини шу ерда кўриб чиқасиз. Очилган кун ўз натижаси билан ҳисобланади ва кечиккан деб белгиланган ҳолда қолади.",
    segAll: "Барчаси", segTodo: "Сизга керак", segPending: "Кутилмоқда", segDone: "Тарих",
    searchPh: "Лидер исми…",
    stVoid: "Ҳисобга олинмаяпти", stPending: "Админ қарорини кутмоқда",
    stApproved: "Очилди — ҳисобга олинади", stRejected: "Очилмади",
    waitingSup: "Бригадирнинг сўрови кутилмоқда",
    reqBy: "Сўради", decidedBy: "Қарор қилди", nRows: "{n} та ҳисобот",
    askOpen: "Очишни сўраш", openNow: "Кунни очиш", approve: "Тасдиқлаш",
    reject: "Рад этиш", withdraw: "Қайтариб олиш", askAgain: "Қайта сўраш",
    revoke: "Очишни бекор қилиш",
    reason: "Сабаб", reasonPh: "Нега бу кун ҳисобга олиниши керак?",
    reasonHint: "Сабаб барча админларга Телеграмда юборилади ва ёзувда қолади.",
    reasonShort: "Сабабни ёзинг (камида 3 та белги).",
    modalReq: "Кечиккан кунни очишни сўраш", modalAdmin: "Кечиккан кунни очиш",
    whatSup: "Сўров барча админларга Телеграмда юборилади. Кун фақат админ тасдиқлагандан кейин ҳисобланади.",
    whatAdmin: "Сиз админ сифатида бу кунни дарҳол очасиз. Лидер хабардор қилинади.",
    send: "Юбориш", open: "Очиш", cancel: "Бекор қилиш",
    cApproveT: "Кунни очиш",
    cApproveM: "{leader} — {date}. Бу кун {score}% билан ҳисобланади ва кечиккан деб белгиланган ҳолда қолади. Лидер хабардор қилинади.",
    cRejectT: "Сўровни рад этиш", cRejectM: "{leader} — {date}. Кун 0% билан қолади.",
    cRevokeT: "Очишни бекор қилиш", cRevokeM: "{leader} — {date}. Бу кун яна 0% билан ҳисобланади.",
    cWithdrawT: "Сўровни қайтариб олиш", cWithdrawM: "{leader} — {date}. Сўров ўчирилади, кун 0% билан қолади.",
    okReq: "Сўров админларга юборилди", okOpen: "Кун очилди",
    okReject: "Сўров рад этилди", okWithdraw: "Сўров қайтариб олинди",
    fail: "Амал бажарилмади",
    emptyT: "Кечиккан ҳисобот йўқ", emptyM: "Барча ҳисоботлар ўз сменасининг ойнасида келган.",
    noMatchT: "Мос кун топилмади", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
  },
  ru: {
    title: "Опоздавшие отчёты",
    rule: "Отчёт должен быть отправлен в окно своей смены: 1-я смена — в свой день с 08:00 до 20:00, 2-я смена — с 17:00 до 09:00 следующего дня. Дни, пришедшие вне этого окна, собираются здесь.",
    ruleSup: "Запросите открытие дня, указав причину. Решение принимает администратор.",
    ruleAdmin: "Здесь вы рассматриваете запросы бригадиров. Открытый день засчитывается со своим результатом и остаётся отмеченным как опоздавший.",
    segAll: "Все", segTodo: "Требует вас", segPending: "На решении", segDone: "История",
    searchPh: "Имя лидера…",
    stVoid: "Не засчитан", stPending: "Ждёт решения администратора",
    stApproved: "Открыт — засчитывается", stRejected: "Не открыт",
    waitingSup: "Ожидается запрос бригадира",
    reqBy: "Запросил(а)", decidedBy: "Решение", nRows: "{n} отчёт(ов)",
    askOpen: "Запросить открытие", openNow: "Открыть день", approve: "Одобрить",
    reject: "Отклонить", withdraw: "Отозвать", askAgain: "Запросить снова",
    revoke: "Отменить открытие",
    reason: "Причина", reasonPh: "Почему этот день должен быть засчитан?",
    reasonHint: "Причина уйдёт всем администраторам в Telegram и останется в записи.",
    reasonShort: "Укажите причину (минимум 3 символа).",
    modalReq: "Запрос на открытие опоздавшего дня", modalAdmin: "Открытие опоздавшего дня",
    whatSup: "Запрос уйдёт всем администраторам в Telegram. День засчитается только после одобрения.",
    whatAdmin: "Как администратор, вы открываете этот день сразу. Лидер получит уведомление.",
    send: "Отправить", open: "Открыть", cancel: "Отмена",
    cApproveT: "Открыть день",
    cApproveM: "{leader} — {date}. День будет засчитан с результатом {score}% и останется отмеченным как опоздавший. Лидер получит уведомление.",
    cRejectT: "Отклонить запрос", cRejectM: "{leader} — {date}. День останется с 0%.",
    cRevokeT: "Отменить открытие", cRevokeM: "{leader} — {date}. День снова будет считаться как 0%.",
    cWithdrawT: "Отозвать запрос", cWithdrawM: "{leader} — {date}. Запрос удалится, день останется с 0%.",
    okReq: "Запрос отправлен администраторам", okOpen: "День открыт",
    okReject: "Запрос отклонён", okWithdraw: "Запрос отозван",
    fail: "Не удалось выполнить действие",
    emptyT: "Опоздавших отчётов нет", emptyM: "Все отчёты пришли в окно своей смены.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
  },
  en: {
    title: "Late reports",
    rule: "A checklist must be filed inside its shift's window: shift 1 on its own day between 08:00 and 20:00, shift 2 from 17:00 through 09:00 the next morning. Days that arrived outside that window collect here.",
    ruleSup: "Ask for a day to be opened, with a reason. An admin makes the decision.",
    ruleAdmin: "You review the supervisors' requests here. An opened day counts at its own score and stays flagged as late.",
    segAll: "All", segTodo: "Needs you", segPending: "Awaiting decision", segDone: "History",
    searchPh: "Leader name…",
    stVoid: "Not counted", stPending: "Awaiting an admin decision",
    stApproved: "Opened — counts", stRejected: "Not opened",
    waitingSup: "Waiting for the supervisor to ask",
    reqBy: "Requested by", decidedBy: "Decided by", nRows: "{n} report(s)",
    askOpen: "Request to open", openNow: "Open the day", approve: "Approve",
    reject: "Reject", withdraw: "Withdraw", askAgain: "Ask again",
    revoke: "Undo the opening",
    reason: "Reason", reasonPh: "Why should this day count?",
    reasonHint: "The reason goes to every admin on Telegram and stays on the record.",
    reasonShort: "Write a reason (at least 3 characters).",
    modalReq: "Request to open a late day", modalAdmin: "Open a late day",
    whatSup: "The request goes to every admin on Telegram. The day counts only once an admin approves it.",
    whatAdmin: "As an admin you open this day immediately. The leader is notified.",
    send: "Send", open: "Open", cancel: "Cancel",
    cApproveT: "Open the day",
    cApproveM: "{leader} — {date}. The day will count at {score}% and stays flagged as late. The leader is notified.",
    cRejectT: "Reject the request", cRejectM: "{leader} — {date}. The day stays at 0%.",
    cRevokeT: "Undo the opening", cRevokeM: "{leader} — {date}. The day goes back to counting as 0%.",
    cWithdrawT: "Withdraw the request", cWithdrawM: "{leader} — {date}. The request is deleted; the day stays at 0%.",
    okReq: "Request sent to the admins", okOpen: "Day opened",
    okReject: "Request rejected", okWithdraw: "Request withdrawn",
    fail: "The action did not go through",
    emptyT: "No late reports", emptyM: "Every checklist arrived inside its shift's window.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
  },
};

// One state → one look, used by the chip and the card's left edge so the two can
// never disagree. `void` is grey rather than red: the day not counting is the
// rule working as intended, not an error someone made.
const STATE_STYLE = {
  void:     { color: C_OFF,  Icon: Ban },
  pending:  { color: C_WAIT, Icon: Hourglass },
  approved: { color: C_OK,   Icon: ShieldCheck },
  rejected: { color: C_BAD,  Icon: Ban },
};

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function StateChip({ state, T }) {
  const { color, Icon } = STATE_STYLE[state] || STATE_STYLE.void;
  const label = { void: T.stVoid, pending: T.stPending, approved: T.stApproved, rejected: T.stRejected }[state];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold"
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color }}>
      <Icon size={12} />{label}
    </span>
  );
}

/** Normalised name compare — the queue, the dashboard and the bot register all
 *  print the same person, and only casing and stray spacing ever differ. */
const same = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Does this row survive the PAGE scope bar (period · shift · supervisor ·
 *  leader)? The queue is a list of (leader, day) rows, so the page's scope
 *  means exactly what it means on the dashboard next door. */
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

export default function LateReports({ canDecide = false, scope, onClearScope }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const qc = useQueryClient();
  const toast = useToast();

  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState(null);        // the item whose reason modal is open
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(null); // { kind, item }

  const { data, isLoading } = useQuery({
    queryKey: ["leaders-late"],
    queryFn: () => api.get("/api/leaders/late").then((r) => r.data),
  });
  // The endpoint deliberately ships the WHOLE queue — a decision waiting on you
  // must not depend on a period. The page scope narrows what is listed, and
  // whatever it leaves out is counted and printed above the list rather than
  // dropped (see ScopeNotice): the row an admin came here for is, by
  // definition, the one on a date nobody expected.
  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => all.filter((it) => inScope(it, scope)), [all, scope]);

  // Both the dashboard feed and this queue move on every decision — a day that
  // starts counting has to change the standings behind the other tab too.
  const settle = (okMsg) => {
    qc.invalidateQueries({ queryKey: ["leaders-late"] });
    qc.invalidateQueries({ queryKey: ["leaders"] });
    toast.success(okMsg);
  };
  const failMsg = (e) => e?.response?.data?.detail || T.fail;

  const askMut = useMutation({
    mutationFn: ({ key, reason }) => api.post("/api/leaders/late", { key, reason }).then((r) => r.data),
    onSuccess: (res) => { setAsk(null); setReason(""); settle(res?.status === "approved" ? T.okOpen : T.okReq); },
  });
  const decideMut = useMutation({
    mutationFn: ({ id, status }) => api.post(`/api/leaders/late/${id}/decide`, { status }).then((r) => r.data),
    onSuccess: (_res, vars) => { setConfirm(null); settle(vars.status === "approved" ? T.okOpen : T.okReject); },
  });
  const cancelMut = useMutation({
    mutationFn: ({ id }) => api.delete(`/api/leaders/late/${id}`).then((r) => r.data),
    onSuccess: () => { setConfirm(null); settle(T.okWithdraw); },
  });

  // Whose TURN it is — the same rule the tab badge counts (see routers/leaders.py).
  // An admin owes a decision on pending requests; a brigadir owes a request on
  // days nobody has raised. An admin CAN open an un-raised day directly, but it
  // is not their turn, so it does not sit in their «needs you».
  const needsMe = (it) =>
    (it.state === "pending" && it.can_decide)
    || (it.state === "void" && it.can_request && !it.can_decide);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = items.filter((it) => {
      if (seg === "todo" && !needsMe(it)) return false;
      if (seg === "pending" && it.state !== "pending") return false;
      if (seg === "done" && !["approved", "rejected"].includes(it.state)) return false;
      if (needle && !`${tl(it.leader)} ${it.leader} ${it.supervisor}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    // Actionable first, then the newest — the work is at the top without a
    // default filter hiding everything else.
    arr = [...arr].sort((a, b) => (needsMe(b) - needsMe(a)) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return arr;
  }, [items, seg, q, tl]);   // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    all: items.length,
    todo: items.filter(needsMe).length,
    pending: items.filter((i) => i.state === "pending").length,
    done: items.filter((i) => ["approved", "rejected"].includes(i.state)).length,
  }), [items]);   // eslint-disable-line react-hooks/exhaustive-deps

  // What the page scope is holding back — and how much of it is this viewer's
  // turn, which is what turns the line amber.
  const out = useMemo(() => {
    const rest = all.filter((it) => !inScope(it, scope));
    return { hidden: rest.length, todo: rest.filter(needsMe).length };
  }, [all, scope]);   // eslint-disable-line react-hooks/exhaustive-deps

  const segLabel = (label, n) => (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
    </span>
  );

  const openAsk = (it) => { setReason(""); setAsk(it); };
  const submitAsk = () => {
    const r = reason.trim();
    if (r.length < 3) return;
    askMut.mutate({ key: ask.key, reason: r });
  };

  const cfg = confirm && {
    approve: {
      title: T.cApproveT,
      message: T.cApproveM.replace("{leader}", tl(confirm.item.leader))
        .replace("{date}", fmtDate(confirm.item.date, lang))
        .replace("{score}", Math.round(confirm.item.completion)),
      tone: "warning", label: T.approve,
      run: () => decideMut.mutate({ id: confirm.item.request.id, status: "approved" }),
    },
    reject: {
      title: T.cRejectT,
      message: T.cRejectM.replace("{leader}", tl(confirm.item.leader)).replace("{date}", fmtDate(confirm.item.date, lang)),
      tone: "danger", label: T.reject,
      run: () => decideMut.mutate({ id: confirm.item.request.id, status: "rejected" }),
    },
    revoke: {
      title: T.cRevokeT,
      message: T.cRevokeM.replace("{leader}", tl(confirm.item.leader)).replace("{date}", fmtDate(confirm.item.date, lang)),
      tone: "danger", label: T.revoke,
      run: () => decideMut.mutate({ id: confirm.item.request.id, status: "rejected" }),
    },
    withdraw: {
      title: T.cWithdrawT,
      message: T.cWithdrawM.replace("{leader}", tl(confirm.item.leader)).replace("{date}", fmtDate(confirm.item.date, lang)),
      tone: "danger", label: T.withdraw,
      run: () => cancelMut.mutate({ id: confirm.item.request.id }),
    },
  }[confirm.kind];

  return (
    <>
      {/* What this screen is. Two sentences, and the second one is the one for
          THIS viewer's job — an admin and a brigadir do different things here. */}
      <div className="rounded-2xl p-4 mb-3 flex items-start gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}><Clock size={16} /></span>
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>{T.title}</div>
          {T.rule} {canDecide ? T.ruleAdmin : T.ruleSup}
        </div>
      </div>

      {/* What the page scope bar is keeping off this list. Above the toolbar,
          because it explains the list that follows before it is read. */}
      {!isLoading && <ScopeNotice hidden={out.hidden} todo={out.todo} onClear={onClearScope} />}

      {/* Toolbar: search left, state filter right — the page's standard row.
          Only the axes the PAGE bar does not own: which state, and free text. */}
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
            { value: "pending", label: segLabel(T.segPending, counts.pending) },
            { value: "done", label: segLabel(T.segDone, counts.done) },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : !all.length ? (
        /* Truly nothing late — praise, and only ever printed when the WHOLE
           queue is empty. An empty list under a narrow scope is «nothing
           matched», a dead end, and reading one as the other tells an admin
           the work is done when it is merely filtered away. */
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
            const tone = STATE_STYLE[it.state] || STATE_STYLE.void;
            const req = it.request;
            const mine = needsMe(it);
            return (
              <div key={it.key} className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${mine ? hexA(tone.color, 0.35) : "var(--border)"}`,
                }}>
                {/* the state's colour as a left edge: scannable down a long list */}
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: tone.color }} />
                  <div className="flex-1 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
                          {tl(it.leader)}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>
                          {tl(it.supervisor)} · {fmtDate(it.date, lang)}
                          {it.rows > 1 && ` · ${T.nRows.replace("{n}", it.rows)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
                          <Clock size={12} />{stamp(it.submitted_at, it.date)}
                        </span>
                        {/* grey while the day does not count, its real colour once it does */}
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white tabular-nums"
                          style={{ background: it.state === "approved" ? C_OK : C_OFF }}>
                          {Math.round(it.completion)}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StateChip state={it.state} T={T} />
                      {/* Whose turn it is. An admin sees this on a day nobody
                          has raised — they may still open it themselves, but the
                          badge does not count it as theirs, and this says why. */}
                      {it.state === "void" && (it.can_decide || !it.can_request) && (
                        <span className="text-xs" style={{ color: "var(--text-4)" }}>{T.waitingSup}</span>
                      )}
                    </div>

                    {/* The reason, quoted — it is what the decision is made on. */}
                    {req?.reason && (
                      <div className="mt-2 rounded-xl px-3 py-2 text-xs leading-relaxed"
                        style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                        “{req.reason}”
                        <div className="mt-1" style={{ color: "var(--text-4)" }}>
                          {T.reqBy}: {req.by || "—"}
                          {req.decided_by && ` · ${T.decidedBy}: ${req.decided_by}`}
                        </div>
                      </div>
                    )}

                    {(it.can_request || it.can_decide) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {it.state === "void" && it.can_request && (
                          <Button size="md" tint variant="primary" icon={<Send size={13} />}
                            onClick={() => openAsk(it)}>
                            {it.can_decide ? T.openNow : T.askOpen}
                          </Button>
                        )}
                        {it.state === "pending" && it.can_decide && (
                          <>
                            <Button size="md" tint variant="success"
                              onClick={() => setConfirm({ kind: "approve", item: it })}>{T.approve}</Button>
                            <Button size="md" tint variant="danger"
                              onClick={() => setConfirm({ kind: "reject", item: it })}>{T.reject}</Button>
                          </>
                        )}
                        {it.state === "pending" && !it.can_decide && it.can_request && (
                          <Button size="md" tint variant="secondary" icon={<Undo2 size={13} />}
                            onClick={() => setConfirm({ kind: "withdraw", item: it })}>{T.withdraw}</Button>
                        )}
                        {it.state === "rejected" && it.can_request && (
                          <Button size="md" tint variant="primary" icon={<Send size={13} />}
                            onClick={() => openAsk(it)}>{T.askAgain}</Button>
                        )}
                        {it.state === "approved" && it.can_decide && (
                          <Button size="md" tint variant="secondary" icon={<Undo2 size={13} />}
                            onClick={() => setConfirm({ kind: "revoke", item: it })}>{T.revoke}</Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reason — required, and the modal says what pressing send actually does */}
      {ask && (
        <Modal
          title={ask.can_decide ? T.modalAdmin : T.modalReq}
          subtitle={`${tl(ask.leader)} · ${fmtDate(ask.date, lang)} · ${Math.round(ask.completion)}%`}
          icon={<Clock size={16} />}
          onClose={() => { setAsk(null); askMut.reset(); }}
          footer={
            <>
              <Button variant="secondary" onClick={() => { setAsk(null); askMut.reset(); }}>
                {T.cancel}
              </Button>
              <Button variant="primary" icon={<Send size={13} />} loading={askMut.isPending}
                disabled={reason.trim().length < 3} onClick={submitAsk}>
                {ask.can_decide ? T.open : T.send}
              </Button>
            </>
          }>
          <div className="rounded-xl px-3 py-2 text-xs flex items-start gap-2"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
            <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-4)" }} />
            <span>{ask.can_decide ? T.whatAdmin : T.whatSup}</span>
          </div>
          <FormField label={T.reason} required hint={T.reasonHint}
            error={askMut.isError ? failMsg(askMut.error)
              : reason.length > 0 && reason.trim().length < 3 ? T.reasonShort : null}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              placeholder={T.reasonPh}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
        </Modal>
      )}

      {confirm && cfg && (
        <ConfirmDialog
          title={cfg.title}
          message={cfg.message}
          confirmLabel={cfg.label}
          tone={cfg.tone}
          loading={decideMut.isPending || cancelMut.isPending}
          error={decideMut.isError ? failMsg(decideMut.error)
            : cancelMut.isError ? failMsg(cancelMut.error) : null}
          onCancel={() => { setConfirm(null); decideMut.reset(); cancelMut.reset(); }}
          onConfirm={cfg.run}
        />
      )}

      {toast.node}
    </>
  );
}
