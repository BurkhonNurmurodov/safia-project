import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, Hourglass, ShieldCheck, Ban, ArrowUpCircle, CalendarClock,
  MessageSquareQuote, User, Camera, ImageUp, Timer,
} from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Modal from "../ui/Modal";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import Lightbox from "../ui/Lightbox";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import ScopeNotice from "./ScopeNotice";
import { LateProofPhoto } from "./ProofPhoto";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fmtDuration } from "../../utils/formatters";
import api from "../../utils/api";

/**
 * «Kechikkan isbotlar» — proofs filed after the task's own deadline.
 *
 * The task is already over and already scores 0; nothing on this tab changes
 * that by itself. What it shows is the one thing the platform could not say
 * before: this leader did the work, missed the hour, and has something to show
 * for it. Two people decide whether that is worth the point, and the tab is
 * built around which of them is looking:
 *
 *  - **the photos are ON the card, not one tap away.** This is the opposite of
 *    the objections queue next door, and deliberately: there, the subject is a
 *    VERDICT that already carries the model's prose, so the evidence belongs on
 *    the day report where the whole day can be read. Here the evidence IS the
 *    submission — there is no verdict, no AI prose, nothing else to rule on —
 *    and a brigadir deciding on a phone in a workshop will not open a second
 *    screen first.
 *  - **the two stages get two different cards.** A brigadir may reject or pass
 *    it up; only an admin can give the point back. The buttons say so by being
 *    the only ones present, rather than by refusing after a press.
 *  - **passing it up demands the brigadir's own case for it**, so that step is
 *    a form (the Modal template) with a required field, while reject and
 *    approve stay plain confirms. A required comment is not an "are you sure".
 */

const C_OK = "#22c55e", C_WAIT = "#eab308", C_BAD = "#ef4444", C_UP = "#3b82f6";

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const day = (iso) => {
  const s = String(iso || "").slice(0, 10);
  return s.length === 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : s || "—";
};
const stamp = (ts) => {
  if (!ts) return "";
  return `${day(ts)} ${String(ts).slice(11, 16)}`;
};
const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || o?.uz || "";
/** Just the clock off an instant the server already put in Tashkent terms. */
const hhmm = (ts) => (ts ? String(ts).slice(11, 16) : "");

/** How late, in the reader's own words. `lateMin` is the SERVER's subtraction
 *  (`leader_late_proof.late_minutes`) and null is a real answer there — a row
 *  filed before the deadline instant was recorded has no measurable lateness,
 *  and printing 0 for it would say "filed exactly on the hour", which is a
 *  different thing to tell somebody deciding whether to give a point back. */
const lateText = (mins, T) =>
  (mins === null || mins === undefined)
    ? T.lateNone
    : fmtDuration(mins, { day: T.unitD, hour: T.unitH, min: T.unitM });

const TXT = {
  uz: {
    title: "Kechikkan isbotlar",
    rule: "Vazifa vaqti tugagach, lider isbotni baribir yuborishi mumkin — lekin ball avtomatik berilmaydi. Avval brigadir ko'rib chiqadi, so'ng adminlar hal qiladi.",
    ruleSup: "Rad etsangiz — ball berilmaydi. Adminlarga yuborsangiz, nega tasdiqlash kerakligini yozib berishingiz shart.",
    ruleAdmin: "Tasdiqlasangiz, vazifa to'liq og'irligini oladi, kun qayta hisoblanadi va lider bilan brigadirga xabar boradi.",
    ruleRead: "Qarorni brigadir va adminlar qabul qiladi. Bu yerda o'z isbotlaringiz va ularning holati ko'rinadi.",
    segAll: "Barchasi", segTodo: "Sizning javobingiz", segDone: "Tarix",
    stageAdm: "Adminlarda", stageSup: "Brigadirlarda",
    search: "Lider, vazifa yoki sabab bo'yicha qidirish",
    stSupervisor: "Brigadirda", stAdmin: "Adminlarda",
    stApproved: "Tasdiqlangan", stRejected: "Rad etilgan",
    deadline: "Muddat", filed: "Yuborilgan", task: "Vazifa",
    lateBy: "Kechikish", lateNone: "aniqlanmadi",
    unitD: "kun", unitH: "soat", unitM: "daq",
    reasonLead: "Lider sababi", noteSup: "Brigadir izohi", noteAdm: "Admin izohi",
    photos: "Isbot rasmlari",
    btnReject: "Rad etish", btnUplift: "Adminlarga yuborish",
    btnApprove: "Tasdiqlash",
    cReject: "Rad etilsinmi?",
    cRejectM: "Bu ish uchun ball berilmaydi. Lider xabardor qilinadi.",
    cUplift: "Adminlarga yuborilsinmi?",
    cUpliftM: "Nega bu ish tasdiqlanishi kerak? Izohingizni adminlar o'qiydi.",
    cApprove: "Tasdiqlansinmi?",
    cApproveM: "Vazifa to'liq ballini qaytarib oladi va kun qayta hisoblanadi.",
    noteReq: "Izoh yozing.",
    notePh: "Sababni yozing…",
    okReject: "Rad etildi", okUplift: "Adminlarga yuborildi", okApprove: "Tasdiqlandi",
    fail: "Bajarilmadi",
    emptyT: "Kechikkan isbot yo'q",
    emptyM: "Vaqtidan keyin yuborilgan isbotlar shu yerda ko'rinadi.",
    noMatchT: "Mos yozuv yo'q", noMatchM: "Filtr yoki qidiruvni o'zgartiring.",
    by: "Kim", cancel: "Bekor qilish", photoFailed: "Rasm yuklanmadi", retry: "Qayta urinish",
    srcCam: "ilovada", srcUpload: "yuklangan",
  },
  uz_cyrl: {
    title: "Кечиккан исботлар",
    rule: "Вазифа вақти тугагач, лидер исботни барибир юбориши мумкин — лекин балл автоматик берилмайди. Аввал бригадир кўриб чиқади, сўнг админлар ҳал қилади.",
    ruleSup: "Рад этсангиз — балл берилмайди. Админларга юборсангиз, нега тасдиқлаш кераклигини ёзиб беришингиз шарт.",
    ruleAdmin: "Тасдиқласангиз, вазифа тўлиқ оғирлигини олади, кун қайта ҳисобланади ва лидер билан бригадирга хабар боради.",
    ruleRead: "Қарорни бригадир ва админлар қабул қилади. Бу ерда ўз исботларингиз ва уларнинг ҳолати кўринади.",
    segAll: "Барчаси", segTodo: "Сизнинг жавобингиз", segDone: "Тарих",
    stageAdm: "Админларда", stageSup: "Бригадирларда",
    search: "Лидер, вазифа ёки сабаб бўйича қидириш",
    stSupervisor: "Бригадирда", stAdmin: "Админларда",
    stApproved: "Тасдиқланган", stRejected: "Рад этилган",
    deadline: "Муддат", filed: "Юборилган", task: "Вазифа",
    lateBy: "Кечикиш", lateNone: "аниқланмади",
    unitD: "кун", unitH: "соат", unitM: "дақ",
    reasonLead: "Лидер сабаби", noteSup: "Бригадир изоҳи", noteAdm: "Админ изоҳи",
    photos: "Исбот расмлари",
    btnReject: "Рад этиш", btnUplift: "Админларга юбориш",
    btnApprove: "Тасдиқлаш",
    cReject: "Рад этилсинми?",
    cRejectM: "Бу иш учун балл берилмайди. Лидер хабардор қилинади.",
    cUplift: "Админларга юборилсинми?",
    cUpliftM: "Нега бу иш тасдиқланиши керак? Изоҳингизни админлар ўқийди.",
    cApprove: "Тасдиқлансинми?",
    cApproveM: "Вазифа тўлиқ баллини қайтариб олади ва кун қайта ҳисобланади.",
    noteReq: "Изоҳ ёзинг.",
    notePh: "Сабабни ёзинг…",
    okReject: "Рад этилди", okUplift: "Админларга юборилди", okApprove: "Тасдиқланди",
    fail: "Бажарилмади",
    emptyT: "Кечиккан исбот йўқ",
    emptyM: "Вақтидан кейин юборилган исботлар шу ерда кўринади.",
    noMatchT: "Мос ёзув йўқ", noMatchM: "Филтр ёки қидирувни ўзгартиринг.",
    by: "Ким", cancel: "Бекор қилиш", photoFailed: "Расм юкланмади", retry: "Қайта уриниш",
    srcCam: "иловада", srcUpload: "юкланган",
  },
  ru: {
    title: "Поздние подтверждения",
    rule: "Когда время задачи вышло, лидер всё равно может прислать подтверждение — но балл автоматически не начисляется. Сначала смотрит бригадир, затем решают администраторы.",
    ruleSup: "Если отклоните — балл не начислят. Если передаёте админам, нужно написать, почему это стоит принять.",
    ruleAdmin: "Если примете, задача получит полный вес, день пересчитается, а лидер и бригадир получат уведомление.",
    ruleRead: "Решение принимают бригадир и администраторы. Здесь видны ваши подтверждения и их статус.",
    segAll: "Все", segTodo: "Ждут вас", segDone: "История",
    stageAdm: "У админов", stageSup: "У бригадиров",
    search: "Поиск по лидеру, задаче или причине",
    stSupervisor: "У бригадира", stAdmin: "У администраторов",
    stApproved: "Принято", stRejected: "Отклонено",
    deadline: "Срок", filed: "Отправлено", task: "Задача",
    lateBy: "Опоздание", lateNone: "не определено",
    unitD: "д", unitH: "ч", unitM: "мин",
    reasonLead: "Причина лидера", noteSup: "Комментарий бригадира", noteAdm: "Комментарий админа",
    photos: "Фото-подтверждение",
    btnReject: "Отклонить", btnUplift: "Передать администраторам",
    btnApprove: "Принять",
    cReject: "Отклонить?",
    cRejectM: "Балл за эту работу не начислят. Лидер получит уведомление.",
    cUplift: "Передать администраторам?",
    cUpliftM: "Почему эту работу стоит принять? Ваш комментарий прочитают администраторы.",
    cApprove: "Принять?",
    cApproveM: "Задача получит полный балл, день будет пересчитан.",
    noteReq: "Напишите комментарий.",
    notePh: "Напишите причину…",
    okReject: "Отклонено", okUplift: "Передано администраторам", okApprove: "Принято",
    fail: "Не выполнено",
    emptyT: "Поздних подтверждений нет",
    emptyM: "Здесь появятся подтверждения, присланные после срока.",
    noMatchT: "Ничего не найдено", noMatchM: "Измените фильтр или поиск.",
    by: "Кто", cancel: "Отмена", photoFailed: "Фото не загрузилось", retry: "Повторить",
    srcCam: "в приложении", srcUpload: "файл",
  },
  en: {
    title: "Late proofs",
    rule: "Once a task's time is up the leader can still send proof — but no point is given automatically. The brigadir looks first, then the admins decide.",
    ruleSup: "Reject and no point is given. To pass it up you must write why it should be accepted.",
    ruleAdmin: "Approve and the task gets its full weight, the day is re-scored, and the leader and brigadir are told.",
    ruleRead: "The brigadir and the admins decide. Your own filings and their status are shown here.",
    segAll: "All", segTodo: "Waiting on you", segDone: "History",
    stageAdm: "On admins", stageSup: "On supervisors",
    search: "Search by leader, task or reason",
    stSupervisor: "With the brigadir", stAdmin: "With the admins",
    stApproved: "Approved", stRejected: "Rejected",
    deadline: "Due", filed: "Filed", task: "Task",
    lateBy: "Late by", lateNone: "not measurable",
    unitD: "d", unitH: "h", unitM: "m",
    reasonLead: "Leader's reason", noteSup: "Brigadir's comment", noteAdm: "Admin's comment",
    photos: "Proof photos",
    btnReject: "Reject", btnUplift: "Pass to the admins",
    btnApprove: "Approve",
    cReject: "Reject it?",
    cRejectM: "No point is given for this work. The leader is told.",
    cUplift: "Pass it to the admins?",
    cUpliftM: "Why should this work be accepted? The admins read your comment.",
    cApprove: "Approve it?",
    cApproveM: "The task gets its full weight back and the day is re-scored.",
    noteReq: "Write a comment.",
    notePh: "Write the reason…",
    okReject: "Rejected", okUplift: "Passed to the admins", okApprove: "Approved",
    fail: "Failed",
    emptyT: "No late proofs",
    emptyM: "Proofs sent after the deadline show up here.",
    noMatchT: "Nothing matches", noMatchM: "Change the filter or the search.",
    by: "By", cancel: "Cancel", photoFailed: "Photo failed to load", retry: "Retry",
    srcCam: "in-app", srcUpload: "uploaded",
  },
};

const STATUS = {
  supervisor: { c: C_WAIT, icon: Hourglass, key: "stSupervisor" },
  admin: { c: C_UP, icon: ArrowUpCircle, key: "stAdmin" },
  approved: { c: C_OK, icon: ShieldCheck, key: "stApproved" },
  rejected: { c: C_BAD, icon: Ban, key: "stRejected" },
};

const same = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Does this row survive the PAGE scope bar? Same meaning as on the dashboard
 *  next door — a late proof is about one (leader, day) checklist row. */
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

export default function LateProofs({ scope, onClearScope }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const qc = useQueryClient();
  const toast = useToast();

  // WHOSE stage is on screen. Opens on «Adminlarda» — the half the page's own
  // tab badge counts, and the only stage where the point can come back.
  const [stage, setStage] = useState("adm");
  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);   // { kind, item }
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [shot, setShot] = useState(null);         // lightbox src

  const { data, isLoading } = useQuery({
    queryKey: ["leader-late-proofs"],
    queryFn: () => api.get("/api/leaders/late-proofs").then((r) => r.data),
  });
  const canSupervise = !!data?.canSupervise;
  const canApprove = !!data?.canApprove;

  const all = useMemo(() => data?.items ?? [], [data]);
  const items = useMemo(() => all.filter((it) => inScope(it, scope)), [all, scope]);

  // Whose turn is it on THIS row? The SERVER's answer, per row, from the same
  // `_lp_stage_rights` the write re-checks — never re-derived here.
  //
  // It used to be computed from two page-level flags, and that is a different
  // question: "you are a brigadir" is not "you are THIS unit's brigadir", and
  // a supervisor holding the leaders page at scope «all» is served every
  // unit's rows. Every foreign card then grew buttons that answered 403, and
  // the in-tab count disagreed with the tab badge the server computes.
  const mine = (it) => !!it.canAct;

  const settle = (msg) => {
    // An approval moves a score, so everything that reads one re-reads.
    qc.invalidateQueries({ queryKey: ["leader-late-proofs"] });
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
      api.post(`/api/leaders/late-proofs/${id}/decide`,
               { action, note: n || "" }).then((r) => r.data),
    onSuccess: (_r, v) => settle(
      v.action === "approved" ? T.okApprove
        : v.action === "uplifted" ? T.okUplift : T.okReject),
    // The failure stays INSIDE the dialog: a mutation that fails must leave the
    // dialog standing with the reason on it, never close and lose it.
    onError: (e) => setNoteErr(failMsg(e)),
  });

  const isDone = (it) => it.status === "approved" || it.status === "rejected";

  // The sub-tab is the FIRST cut, ahead of the segment and the search: every
  // count under it describes the stage on screen, so «Tarix · 12» can never
  // promise rows the other tab is holding.
  const staged = useMemo(
    () => items.filter((it) => stageOf(it) === stage), [items, stage]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = staged.filter((it) => {
      if (seg === "todo" && !mine(it)) return false;
      if (seg === "done" && !isDone(it)) return false;
      if (needle) {
        const hay = `${tl(it.leader)} ${it.leader} ${it.supervisor} ${pick(it.taskName, lang)} ${it.reason}`;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    // Your turn first, then newest. The work is at the top without a default
    // filter hiding the history behind it.
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

  const out = useMemo(() => {
    const rest = all.filter((it) => !inScope(it, scope));
    return { hidden: rest.length, todo: rest.filter(mine).length };
  }, [all, scope]);

  const close = () => { setConfirm(null); setNote(""); setNoteErr(""); };

  const ask = (kind, item) => {
    setNote("");
    setNoteErr("");
    setConfirm({ kind, item });
  };

  const run = () => {
    if (!confirm) return;
    const { kind, item } = confirm;
    if (kind === "uplift" && !note.trim()) {
      setNoteErr(T.noteReq);
      return;
    }
    const action = kind === "uplift" ? "uplifted"
      : kind === "approve" ? "approved" : "rejected";
    decide.mutate({ id: item.id, action, note: note.trim() });
  };

  const cText = confirm?.kind === "uplift" ? { t: T.cUplift, m: T.cUpliftM }
    : confirm?.kind === "approve" ? { t: T.cApprove, m: T.cApproveM }
      : { t: T.cReject, m: T.cRejectM };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
            <Clock size={15} />
          </span>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-1)" }}>{T.title}</h2>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          {T.rule}{" "}
          {canApprove ? T.ruleAdmin : canSupervise ? T.ruleSup : T.ruleRead}
        </p>
      </div>

      {!isLoading && (
        <ScopeNotice hidden={out.hidden} todo={out.todo} onClear={onClearScope} />
      )}

      {/* Whose ruling the queue is waiting for. Two questions of one register:
          what sits with the ADMINS — where the point can come back, and where
          this page's badge points — and what is still with the brigadirs. A
          settled row stays under the stage that ended it, so a ruling is found
          where it was made. */}
      <SegmentedToggle asTabs ariaLabel={T.title} value={stage} onChange={setStage}
        options={[
          ["adm", stageTodo.adm ? `${T.stageAdm} · ${stageTodo.adm}` : T.stageAdm],
          ["sup", stageTodo.sup ? `${T.stageSup} · ${stageTodo.sup}` : T.stageSup],
        ]} />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          value={seg} onChange={setSeg}
          options={[
            ["all", `${T.segAll} · ${counts.all}`],
            ["todo", `${T.segTodo} · ${counts.todo}`],
            ["done", `${T.segDone} · ${counts.done}`],
          ]} />
        <SearchInput value={q} onChange={setQ} placeholder={T.search}
          className="flex-1 min-w-[180px]" />
      </div>

      {isLoading && <SkeletonBlock className="h-40" />}

      {!isLoading && !all.length && (
        <EmptyState icon={Clock} title={T.emptyT} message={T.emptyM} />
      )}
      {!isLoading && !!all.length && !shown.length && (
        <EmptyState icon={Clock} title={T.noMatchT} message={T.noMatchM} />
      )}

      <div className="space-y-3">
        {shown.map((it) => {
          const st = STATUS[it.status] || STATUS.supervisor;
          const Icon = st.icon;
          const turn = mine(it);
          return (
            <div key={it.id} className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${turn ? hexA(st.c, 0.5) : "var(--border)"}`,
              }}>
              {/* header — who, which task, and what state it is in */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold"
                  style={{ background: hexA(st.c, 0.12), color: st.c }}>
                  <Icon size={12} />{T[st.key]}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--text-1)" }}>
                  <User size={13} style={{ color: "var(--text-3)" }} />
                  {tl(it.leader) || "—"}
                </span>
                {it.supervisor && (
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>
                    · {tl(it.supervisor)}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-2 text-xs tabular-nums"
                  style={{ color: "var(--text-3)" }}>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={12} />{day(it.date)}
                  </span>
                  {/* HOW LATE, at scanning level. The deadline used to sit here
                      and it is the wrong half of the subtraction to show twice:
                      the strip below states it in full, and the question a
                      reviewer is scanning this queue with is not "when was it
                      due" but "how far past that was it".

                      ONE tone, and deliberately no threshold: this is a
                      magnitude, not a verdict. Splitting it red/amber at some
                      number would be the platform ruling on the filing in the
                      colour bar of the card somebody is opening in order to
                      rule on it themselves. */}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold"
                    style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
                    <Timer size={11} />{T.lateBy} {lateText(it.lateMin, T)}
                  </span>
                </span>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide mb-0.5"
                    style={{ color: "var(--text-4)" }}>{T.task}</div>
                  <div className="text-sm" style={{ color: "var(--text-1)" }}>
                    {pick(it.taskName, lang) || `#${it.taskId}`}
                  </div>
                </div>

                {/* The whole question this queue exists to answer, written as
                    the subtraction it is: when the task stopped accepting work,
                    when the leader actually sent the proof, and the gap.

                    All three are the SERVER's — the deadline as an instant
                    (`dueAt`, seated on the day the shift anchor puts it on, a
                    rule no JavaScript copy should own) and the gap already
                    subtracted. The instants arrive in the plant's own wall
                    clock; before that the filing time was served in UTC beside
                    a Tashkent deadline, so a proof sent one minute late read as
                    five hours early on the card it is judged from. */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl px-3 py-2"
                  style={{ background: "var(--bg-inner)" }}>
                  <Fact label={T.deadline}
                    value={it.dueAt ? stamp(it.dueAt) : (it.deadline || "—")} />
                  <Fact label={T.filed} value={stamp(it.at) || "—"} />
                  <Fact label={T.lateBy} value={lateText(it.lateMin, T)}
                    tone={it.lateMin == null ? undefined : C_WAIT} />
                </div>

                {/* No timestamp on the credit line: it is the same instant
                    the strip above states under a label, and an unlabelled bare
                    clock beside a labelled deadline is what made this card
                    unreadable in the first place. The two rulings below DO
                    carry theirs — those are different instants nothing else
                    names. */}
                <Quote label={T.reasonLead} text={it.reason}
                  who={tl(it.leader)} T={T} />

                {/* The evidence, on the card. See the component docstring. */}
                {!!it.photos?.length && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-1.5"
                      style={{ color: "var(--text-4)" }}>
                      {T.photos} · {it.photos.length}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {it.photos.map((p) => {
                        // A shot taken in the app carries a clock the leader
                        // could not author; a file they chose carries nothing
                        // this platform can vouch for. Showing the two the same
                        // way would teach reviewers that the stamp is
                        // decoration — so each says which it is, and the
                        // in-app one shows the second it was taken.
                        //
                        // BOTH now say WHEN, though, and they say two different
                        // things by it. A camera shot's stamp is when it was
                        // TAKEN; `got` is when the server received it, which is
                        // the only instant an uploaded file has and the one a
                        // reviewer asking "when did they send this" wants. An
                        // upload carried neither before, so the door that
                        // produced the proof in the screenshot said «yuklangan»
                        // and nothing at all about the hour.
                        const cam = p.source === "camera";
                        const when = cam ? (p.stamp?.slice(-8) || hhmm(p.at)) : hhmm(p.got);
                        const label = cam ? T.srcCam : T.srcUpload;
                        return (
                          <div key={p.id} className="flex flex-col gap-1"
                            style={{ width: 72 }}>
                            <div style={{ width: 72, height: 72 }}>
                              <LateProofPhoto lateId={it.id} id={p.id} T={T} thumb
                                className="" onClick={(u) => setShot(u)} />
                            </div>
                            <span
                              title={`${label}${when ? ` · ${when}` : ""}`}
                              className="inline-flex items-center gap-1 text-[9px] leading-tight"
                              style={{ color: cam ? C_OK : "var(--text-4)" }}>
                              {cam ? <Camera size={9} /> : <ImageUp size={9} />}
                              <span className="truncate">{when || label}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {it.sup && (
                  <Quote label={T.noteSup} text={it.sup.note}
                    who={it.sup.by} at={stamp(it.sup.at)} T={T} tone={C_UP} />
                )}
                {it.adm && (
                  <Quote label={T.noteAdm} text={it.adm.note}
                    who={it.adm.by} at={stamp(it.adm.at)} T={T}
                    tone={it.adm.action === "approved" ? C_OK : C_BAD} />
                )}
              </div>

              {/* The two buttons this stage has — and only those. */}
              {turn && (
                <div className="flex flex-wrap gap-2 px-4 py-3"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <Button variant="danger" tint size="lg"
                    onClick={() => ask("reject", it)}>
                    <Ban size={14} />{T.btnReject}
                  </Button>
                  {it.status === "supervisor" ? (
                    <Button variant="primary" tint size="lg" className="ml-auto"
                      onClick={() => ask("uplift", it)}>
                      <ArrowUpCircle size={14} />{T.btnUplift}
                    </Button>
                  ) : (
                    <Button variant="success" tint size="lg" className="ml-auto"
                      onClick={() => ask("approve", it)}>
                      <ShieldCheck size={14} />{T.btnApprove}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Lightbox src={shot} onClose={() => setShot(null)} />

      {/* Reject and approve are plain confirms. Passing it up is a FORM — it
          collects a required comment — so it is the Modal template, not a
          ConfirmDialog carrying a field it was never built to hold. */}
      <ConfirmDialog
        open={!!confirm && confirm.kind !== "uplift"}
        tone={confirm?.kind === "reject" ? "danger" : undefined}
        title={cText.t}
        message={cText.m}
        error={noteErr || undefined}
        confirmLabel={confirm?.kind === "approve" ? T.btnApprove : T.btnReject}
        loading={decide.isPending}
        onConfirm={run}
        onCancel={close}
      />

      <Modal
        open={!!confirm && confirm.kind === "uplift"}
        onClose={close}
        title={T.cUplift}
        icon={<ArrowUpCircle size={16} />}
        subtitle={confirm?.item ? `${tl(confirm.item.leader)} · ${day(confirm.item.date)}` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={close}>{T.cancel}</Button>
            <Button variant="primary" loading={decide.isPending} onClick={run}>
              <ArrowUpCircle size={14} />{T.btnUplift}
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
    </div>
  );
}

/** One labelled fact of the deadline → filed → gap strip. A bare row of three
 *  timestamps is unreadable; each one has to say which of the three it is. */
function Fact({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide"
        style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-xs font-semibold tabular-nums"
        style={{ color: tone || "var(--text-2)" }}>{value}</div>
    </div>
  );
}

/** One attributed block of somebody's own words — the leader's reason, the
 *  brigadir's case, the admin's note. Same shape for all three, because they
 *  are read as one thread: what was claimed, what was argued, what was ruled. */
function Quote({ label, text, who, at, T, tone }) {
  const body = (text || "").trim();
  const credit = (who || at)
    ? `${who ? `${T.by}: ${who}` : ""}${who && at ? " · " : ""}${at || ""}`
    : "";
  // An admin who approved without typing anything said nothing — so there is
  // nothing to quote, and a box holding an em dash is worse than no box: it
  // reads as a comment that failed to load. The attribution is the whole fact
  // in that case, and it stands on its own line.
  if (!body) {
    return credit ? (
      <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
        <span className="uppercase tracking-wide">{label}</span> · {credit}
      </div>
    ) : null;
  }
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide mb-0.5"
        style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="rounded-xl px-3 py-2 text-sm whitespace-pre-wrap"
        style={{
          background: "var(--bg-inner)",
          borderLeft: `3px solid ${tone || "var(--border)"}`,
          color: "var(--text-2)",
        }}>
        <MessageSquareQuote size={12} className="inline-block mr-1.5 -mt-0.5"
          style={{ color: "var(--text-4)" }} />
        {body}
      </div>
      {credit && (
        <div className="text-[11px] mt-1" style={{ color: "var(--text-4)" }}>{credit}</div>
      )}
    </div>
  );
}
