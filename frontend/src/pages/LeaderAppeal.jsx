import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Ban, ArrowUpCircle, ShieldCheck, RotateCcw, ExternalLink,
  MessageSquareWarning, MessageCircle, Clock, Hourglass, UserCheck, CircleSlash,
  Sparkles, CalendarCheck, Camera, ImageUp, Timer, Images,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ErrorScreen from "../components/ui/ErrorScreen";
import Lightbox from "../components/ui/Lightbox";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { CommentsThread } from "../components/ui/CommentsModal";
import { BotPhoto, ReportPhoto, LateProofPhoto } from "../components/leaders/ProofPhoto";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { fmtDuration } from "../utils/formatters";
import api from "../utils/api";

/**
 * One appeal's CHAT — `/leaders/appeal/:kind/:id` (kind = dispute | late), and
 * `/leaders/appeal/dispute/new?uid=&task=` for writing a new objection.
 *
 * From 2026-09-26 (the operator's directive) objections to an AI rejection and
 * proofs filed after their deadline are argued as a conversation between the
 * three people the chain is made of — the leader, their brigadir, the admins —
 * and this page is where it happens. It reads top to bottom in the order a
 * ruling needs:
 *
 *   1. the RULING buttons, for whoever may rule at this stage and nobody else
 *      (the server's `canSupervise` / `canDecide`, never a role guess): the
 *      brigadir refuses or passes up — both need their comment; an admin
 *      refuses (reason required) or upholds (comment optional); an admin can
 *      take a ruling back, which REOPENS the chat at that stage;
 *   2. the EVIDENCE — the proof photos and the AI's reason for the rejection;
 *      a late proof has no AI verdict (the AI never reviews one), so its
 *      photos and how late it came stand there instead;
 *   3. the CHAT — the filing, every question and answer, every ruling, with
 *      files of any type attached. All three parties read everything and are
 *      told about every message; writing stops once a ruling is final.
 *
 * Auth-only and row-scoped, like `/leaders/report/:uid`: it is where the
 * Telegram «Open chat» button lands, and the leader or brigadir tapping it is
 * often somebody nobody granted the /leaders page to.
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
const stamp = (ts) => (ts ? `${day(ts)} ${String(ts).slice(11, 16)}` : "");
const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || o?.uz || "";

const TXT = {
  uz: {
    titleDispute: "AI qaroriga norozilik", titleLate: "Kechikkan isbot", titleNew: "Yangi norozilik",
    back: "Orqaga", task: "Vazifa", shift1: "1-smena", shift2: "2-smena",
    stSupervisor: "Brigadir ko'rib chiqmoqda", stAdmin: "Admin qarorini kutmoqda",
    stApproved: "Qabul qilindi", stApprovedLate: "Tasdiqlandi", stRejected: "Rad etildi",
    stCancelled: "Qaror bekor qilingan",
    reject: "Rad etish", uplift: "Adminlarga yuborish", approve: "Qabul qilish",
    approveLate: "Tasdiqlash", undo: "Qarorni bekor qilish", openReport: "Kun hisobotini ochish",
    cancel: "Bekor qilish",
    turnSup: "Sizning navbatingiz: savollaringizni chatda bering, so'ng rad eting yoki adminlarga yuboring — ikkalasi ham izoh talab qiladi.",
    turnAdm: "Sizning navbatingiz: chatda lider va brigadirdan so'rashingiz mumkin. Rad etish uchun sabab shart, qabul qilishda izoh ixtiyoriy.",
    photos: "Isbot rasmlari", noPhotos: "Rasm topilmadi", aiTitle: "AI rad etish sababi",
    window: "Ruxsat etilgan vaqt", needDate: "Kerakli sana", needTime: "Ruxsat etilgan soat",
    onPhoto: "Rasmda", deadline: "Muddat", filed: "Yuborildi", lateBy: "Kechikish",
    lateNone: "o'lchab bo'lmaydi", unitD: "kun", unitH: "soat", unitM: "daq",
    srcCam: "Ilovada olingan", srcUpload: "Yuklangan",
    chat: "Muhokama", chatHint: "Lider, brigadir va adminlar ko'radi va xabar oladi",
    placeholder: "Xabar yozing…", closed: "Qaror yakuniy — chat yopilgan. Admin qarorni bekor qilsa, chat qayta ochiladi.",
    readOnly: "Bu chatda faqat lider, brigadir va adminlar yozadi.",
    empty: "Hozircha xabar yo'q",
    kFiled: "Norozilik", kFiledLate: "Kechikkan isbot sababi", kSupRejected: "Brigadir rad etdi",
    kUplifted: "Adminlarga yuborildi", kApproved: "Qabul qilindi", kApprovedLate: "Tasdiqlandi",
    kRejected: "Rad etildi", kUndone: "Qaror bekor qilindi — chat qayta ochildi",
    rLeader: "Lider", rSupervisor: "Brigadir", rAdmin: "Admin",
    mRejectT: "Rad etish", mUpliftT: "Adminlarga yuborish", mApproveT: "Qabul qilish",
    mNoteSup: "Brigadir izohi", mNoteAdm: "Admin izohi", noteOpt: "ixtiyoriy",
    hRejectSup: "Nega rad etyapsiz? Izoh chatga yoziladi va liderga yuboriladi.",
    hUplift: "Nega ball berilishi kerak? Adminlar shuni lider izohi bilan birga o'qiydi.",
    hRejectAdm: "Nega rad etyapsiz? Sabab chatga yoziladi va liderga yuboriladi.",
    hApprove: "Ixtiyoriy — yozsangiz, chatga qaror bilan birga tushadi.",
    notePh: "Izohingizni yozing…", noteReq: "Izoh yozing.",
    cUndoT: "Qarorni bekor qilish",
    cUndoM: "Qaror bekor qilinadi va chat qayta ochiladi — qaror qilingan bosqichga qaytadi. Berilgan ball qaytarib olinadi.",
    okUplift: "Adminlarga yuborildi", okReject: "Rad etildi", okApprove: "Qabul qilindi",
    okUndo: "Qaror bekor qilindi, chat qayta ochildi", fail: "Amal bajarilmadi",
    nfT: "Topilmadi", nfM: "Bu murojaat topilmadi yoki uni ko'rishga ruxsatingiz yo'q.",
    newIntro: "Nega bu vazifa noto'g'ri rad etilgan? Birinchi xabaringiz — norozilik: uni brigadiringiz o'qiydi, savol berishi, rad etishi yoki adminlarga yuborishi mumkin. Fayl ham biriktirishingiz mumkin.",
    newPh: "Masalan: rasmda soat ko'rinib turibdi, lekin AI o'qiy olmagan",
    newNot: "Bu vazifa bo'yicha norozilik bildirib bo'lmaydi.",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
    photoFailed: "Rasm yuklanmadi", retry: "Qayta urinish",
  },
  uz_cyrl: {
    titleDispute: "AI қарорига норозилик", titleLate: "Кечиккан исбот", titleNew: "Янги норозилик",
    back: "Орқага", task: "Вазифа", shift1: "1-смена", shift2: "2-смена",
    stSupervisor: "Бригадир кўриб чиқмоқда", stAdmin: "Админ қарорини кутмоқда",
    stApproved: "Қабул қилинди", stApprovedLate: "Тасдиқланди", stRejected: "Рад этилди",
    stCancelled: "Қарор бекор қилинган",
    reject: "Рад этиш", uplift: "Админларга юбориш", approve: "Қабул қилиш",
    approveLate: "Тасдиқлаш", undo: "Қарорни бекор қилиш", openReport: "Кун ҳисоботини очиш",
    cancel: "Бекор қилиш",
    turnSup: "Сизнинг навбатингиз: саволларингизни чатда беринг, сўнг рад этинг ёки админларга юборинг — иккаласи ҳам изоҳ талаб қилади.",
    turnAdm: "Сизнинг навбатингиз: чатда лидер ва бригадирдан сўрашингиз мумкин. Рад этиш учун сабаб шарт, қабул қилишда изоҳ ихтиёрий.",
    photos: "Исбот расмлари", noPhotos: "Расм топилмади", aiTitle: "AI рад этиш сабаби",
    window: "Рухсат этилган вақт", needDate: "Керакли сана", needTime: "Рухсат этилган соат",
    onPhoto: "Расмда", deadline: "Муддат", filed: "Юборилди", lateBy: "Кечикиш",
    lateNone: "ўлчаб бўлмайди", unitD: "кун", unitH: "соат", unitM: "дақ",
    srcCam: "Иловада олинган", srcUpload: "Юкланган",
    chat: "Муҳокама", chatHint: "Лидер, бригадир ва админлар кўради ва хабар олади",
    placeholder: "Хабар ёзинг…", closed: "Қарор якуний — чат ёпилган. Админ қарорни бекор қилса, чат қайта очилади.",
    readOnly: "Бу чатда фақат лидер, бригадир ва админлар ёзади.",
    empty: "Ҳозирча хабар йўқ",
    kFiled: "Норозилик", kFiledLate: "Кечиккан исбот сабаби", kSupRejected: "Бригадир рад этди",
    kUplifted: "Админларга юборилди", kApproved: "Қабул қилинди", kApprovedLate: "Тасдиқланди",
    kRejected: "Рад этилди", kUndone: "Қарор бекор қилинди — чат қайта очилди",
    rLeader: "Лидер", rSupervisor: "Бригадир", rAdmin: "Админ",
    mRejectT: "Рад этиш", mUpliftT: "Админларга юбориш", mApproveT: "Қабул қилиш",
    mNoteSup: "Бригадир изоҳи", mNoteAdm: "Админ изоҳи", noteOpt: "ихтиёрий",
    hRejectSup: "Нега рад этяпсиз? Изоҳ чатга ёзилади ва лидерга юборилади.",
    hUplift: "Нега балл берилиши керак? Админлар шуни лидер изоҳи билан бирга ўқийди.",
    hRejectAdm: "Нега рад этяпсиз? Сабаб чатга ёзилади ва лидерга юборилади.",
    hApprove: "Ихтиёрий — ёзсангиз, чатга қарор билан бирга тушади.",
    notePh: "Изоҳингизни ёзинг…", noteReq: "Изоҳ ёзинг.",
    cUndoT: "Қарорни бекор қилиш",
    cUndoM: "Қарор бекор қилинади ва чат қайта очилади — қарор қилинган босқичга қайтади. Берилган балл қайтариб олинади.",
    okUplift: "Админларга юборилди", okReject: "Рад этилди", okApprove: "Қабул қилинди",
    okUndo: "Қарор бекор қилинди, чат қайта очилди", fail: "Амал бажарилмади",
    nfT: "Топилмади", nfM: "Бу мурожаат топилмади ёки уни кўришга рухсатингиз йўқ.",
    newIntro: "Нега бу вазифа нотўғри рад этилган? Биринчи хабарингиз — норозилик: уни бригадирингиз ўқийди, савол бериши, рад этиши ёки админларга юбориши мумкин. Файл ҳам бириктиришингиз мумкин.",
    newPh: "Масалан: расмда соат кўриниб турибди, лекин AI ўқий олмаган",
    newNot: "Бу вазифа бўйича норозилик билдириб бўлмайди.",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
    photoFailed: "Расм юкланмади", retry: "Қайта уриниш",
  },
  ru: {
    titleDispute: "Возражение на решение ИИ", titleLate: "Позднее подтверждение", titleNew: "Новое возражение",
    back: "Назад", task: "Задача", shift1: "Смена 1", shift2: "Смена 2",
    stSupervisor: "У бригадира", stAdmin: "Ждёт решения администратора",
    stApproved: "Принято", stApprovedLate: "Принято", stRejected: "Отклонено",
    stCancelled: "Решение отменено",
    reject: "Отклонить", uplift: "Передать администраторам", approve: "Принять",
    approveLate: "Принять", undo: "Отменить решение", openReport: "Открыть отчёт за день",
    cancel: "Отмена",
    turnSup: "Ваша очередь: задайте вопросы в чате, затем отклоните или передайте администраторам — в обоих случаях нужен комментарий.",
    turnAdm: "Ваша очередь: в чате можно спросить лидера и бригадира. Для отказа нужна причина, при принятии комментарий необязателен.",
    photos: "Фото-подтверждения", noPhotos: "Фото не найдены", aiTitle: "Причина отказа ИИ",
    window: "Допустимое время", needDate: "Нужная дата", needTime: "Допустимый час съёмки",
    onPhoto: "На фото", deadline: "Срок", filed: "Отправлено", lateBy: "Опоздание",
    lateNone: "не измерить", unitD: "д", unitH: "ч", unitM: "мин",
    srcCam: "Снято в приложении", srcUpload: "Загружено",
    chat: "Обсуждение", chatHint: "Лидер, бригадир и администраторы видят всё и получают уведомления",
    placeholder: "Напишите сообщение…", closed: "Решение окончательное — чат закрыт. Если администратор отменит решение, чат откроется снова.",
    readOnly: "В этом чате пишут только лидер, бригадир и администраторы.",
    empty: "Сообщений пока нет",
    kFiled: "Возражение", kFiledLate: "Причина опоздания", kSupRejected: "Бригадир отклонил",
    kUplifted: "Передано администраторам", kApproved: "Принято", kApprovedLate: "Принято",
    kRejected: "Отклонено", kUndone: "Решение отменено — чат открыт снова",
    rLeader: "Лидер", rSupervisor: "Бригадир", rAdmin: "Админ",
    mRejectT: "Отклонить", mUpliftT: "Передать администраторам", mApproveT: "Принять",
    mNoteSup: "Комментарий бригадира", mNoteAdm: "Комментарий администратора", noteOpt: "необязательно",
    hRejectSup: "Почему вы отклоняете? Комментарий попадёт в чат и будет отправлен лидеру.",
    hUplift: "Почему балл должен быть начислен? Администраторы прочитают это вместе с комментарием лидера.",
    hRejectAdm: "Почему вы отклоняете? Причина попадёт в чат и будет отправлена лидеру.",
    hApprove: "Необязательно — если напишете, это попадёт в чат вместе с решением.",
    notePh: "Напишите комментарий…", noteReq: "Напишите комментарий.",
    cUndoT: "Отменить решение",
    cUndoM: "Решение будет отменено, а чат откроется снова — на той стадии, где решение было принято. Начисленный балл будет снят.",
    okUplift: "Передано администраторам", okReject: "Отклонено", okApprove: "Принято",
    okUndo: "Решение отменено, чат открыт снова", fail: "Не удалось выполнить действие",
    nfT: "Не найдено", nfM: "Обращение не найдено или у вас нет доступа к нему.",
    newIntro: "Почему эта задача отклонена неверно? Ваше первое сообщение — это возражение: его прочитает бригадир, он может задать вопросы, отклонить его или передать администраторам. Можно прикрепить файлы.",
    newPh: "Например: часы на фото видны, но ИИ их не прочитал",
    newNot: "По этой задаче возразить нельзя.",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось",
    photoFailed: "Фото не загрузилось", retry: "Повторить",
  },
  en: {
    titleDispute: "Objection to an AI ruling", titleLate: "Late proof", titleNew: "New objection",
    back: "Back", task: "Task", shift1: "Shift 1", shift2: "Shift 2",
    stSupervisor: "With the brigadir", stAdmin: "Awaiting an admin decision",
    stApproved: "Upheld", stApprovedLate: "Approved", stRejected: "Refused",
    stCancelled: "Ruling undone",
    reject: "Refuse", uplift: "Pass to the admins", approve: "Uphold",
    approveLate: "Approve", undo: "Undo the ruling", openReport: "Open the day report",
    cancel: "Cancel",
    turnSup: "Your turn: ask what you need in the chat, then refuse it or pass it to the admins — both need your comment.",
    turnAdm: "Your turn: you can ask the leader and the brigadir in the chat. Refusing needs a reason; a comment on approval is optional.",
    photos: "Proof photos", noPhotos: "No photos found", aiTitle: "Why the AI rejected it",
    window: "Allowed window", needDate: "Required date", needTime: "Allowed clock time",
    onPhoto: "On the photo", deadline: "Deadline", filed: "Filed", lateBy: "Late by",
    lateNone: "not measurable", unitD: "d", unitH: "h", unitM: "min",
    srcCam: "Shot in the app", srcUpload: "Uploaded",
    chat: "Discussion", chatHint: "The leader, the brigadir and the admins see everything and are notified",
    placeholder: "Write a message…", closed: "The ruling is final — the chat is closed. If an admin undoes the ruling, it opens again.",
    readOnly: "Only the leader, the brigadir and the admins write in this chat.",
    empty: "No messages yet",
    kFiled: "Objection", kFiledLate: "Reason for being late", kSupRejected: "The brigadir refused",
    kUplifted: "Passed to the admins", kApproved: "Upheld", kApprovedLate: "Approved",
    kRejected: "Refused", kUndone: "Ruling undone — the chat is open again",
    rLeader: "Leader", rSupervisor: "Brigadir", rAdmin: "Admin",
    mRejectT: "Refuse", mUpliftT: "Pass to the admins", mApproveT: "Uphold",
    mNoteSup: "The brigadir's comment", mNoteAdm: "The admin's comment", noteOpt: "optional",
    hRejectSup: "Why are you refusing? The comment goes into the chat and to the leader.",
    hUplift: "Why should the task be pointed? The admins read it beside the leader's note.",
    hRejectAdm: "Why are you refusing? The reason goes into the chat and to the leader.",
    hApprove: "Optional — if you write one, it goes into the chat with the ruling.",
    notePh: "Write your comment…", noteReq: "Write a comment.",
    cUndoT: "Undo the ruling",
    cUndoM: "The ruling is taken back and the chat opens again at the stage it was made. Any point given is taken back.",
    okUplift: "Passed to the admins", okReject: "Refused", okApprove: "Upheld",
    okUndo: "Ruling undone — the chat is open again", fail: "The action did not go through",
    nfT: "Not found", nfM: "This appeal does not exist or you may not see it.",
    newIntro: "Why was this task rejected wrongly? Your first message IS the objection: your brigadir reads it and may ask questions, refuse it or pass it to the admins. You can attach files.",
    newPh: "e.g. the clock is visible on the photo but the AI misread it",
    newNot: "This task cannot be objected to.",
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable",
    photoFailed: "Photo failed to load", retry: "Retry",
  },
};

const STATE = {
  supervisor: { color: C_WAIT, Icon: UserCheck, key: "stSupervisor" },
  admin:      { color: C_WAIT, Icon: Hourglass, key: "stAdmin" },
  approved:   { color: C_OK,   Icon: ShieldCheck, key: "stApproved", lateKey: "stApprovedLate" },
  rejected:   { color: C_BAD,  Icon: Ban, key: "stRejected" },
  cancelled:  { color: C_OFF,  Icon: CircleSlash, key: "stCancelled" },
};

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

// `overflow: clip`, not hidden: it rounds the corners the same way, but a
// hidden box is a scroll container, and the chat's composer — `sticky bottom-0`
// inside this card — can only stick to the viewport through a card that is not
// one. A browser without `clip` ignores the inline value and keeps the class.
function Card({ children }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", overflow: "clip" }}>
      {children}
    </div>
  );
}

/** The AI's verdict being argued against — flags, its own prose, and the rule
 *  it was measured by (the window when hours were the rule, the day when only
 *  the day was, the bare clock when only the hour was). */
function Verdict({ rev, T, lang }) {
  if (!rev) return null;
  const flags = rev.flags || [];
  const dated = flags.some((f) => f === "no_date" || f === "date_mismatch");
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: "var(--text-4)" }}>
        <Sparkles size={11} />{T.aiTitle}
      </div>
      {!!flags.length && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {flags.map((f) => (
            <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
              {T[`f_${f}`] || f}
            </span>
          ))}
        </div>
      )}
      {pick(rev.reason, lang) && (
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
          {pick(rev.reason, lang)}
        </p>
      )}
      {dated && pick(rev.dateReason, lang) && (
        <p className="text-[12px] leading-snug mt-1" style={{ color: "var(--text-2)" }}>
          {pick(rev.dateReason, lang)}
        </p>
      )}
      {dated && rev.expected && (
        <p className="text-[11px] tabular-nums mt-1.5 flex items-center gap-1 flex-wrap"
          style={{ color: "var(--text-4)" }}>
          {rev.dayCheck === false
            ? <><Clock size={11} />{T.needTime}: {rev.expected}</>
            : rev.timeCheck === false
              ? <><CalendarCheck size={11} />{T.needDate}: {rev.expected}</>
              : <><Clock size={11} />{T.window}: {rev.expected}</>}
          {rev.imageDate && <> · {T.onPhoto}: {rev.imageDate}</>}
        </p>
      )}
    </div>
  );
}

/** The photos the AI refused — the day report's own archive copies (with the
 *  in-app stamp where there is one) or the Form links, through the report's
 *  photo doors, which the `uid` authorises. */
function DisputePhotos({ photos, uid, T, onZoom }) {
  if (!photos?.length) {
    return <p className="text-[11px]" style={{ color: "var(--text-4)" }}>{T.noPhotos}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={p.id ?? p.url ?? i} className="flex flex-col gap-1" style={{ width: 88 }}>
          <div style={{ width: 88, height: 88 }}>
            {p.kind === "bot"
              ? <BotPhoto id={p.id} uid={uid} T={T} thumb className="" onClick={onZoom} />
              : <ReportPhoto src={p.url} uid={uid} T={T} thumb className="" onClick={onZoom} />}
          </div>
          {p.cam && (
            <span className="inline-flex items-center gap-1 text-[9px]" style={{ color: C_OK }}>
              <Camera size={9} />{T.srcCam}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function LatePhotos({ item, T, onZoom }) {
  if (!item.photos?.length) {
    return <p className="text-[11px]" style={{ color: "var(--text-4)" }}>{T.noPhotos}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {item.photos.map((p) => {
        const cam = p.source === "camera";
        const when = cam ? (p.stamp?.slice(-8) || String(p.at || "").slice(11, 16))
          : String(p.got || "").slice(11, 16);
        return (
          <div key={p.id} className="flex flex-col gap-1" style={{ width: 88 }}>
            <div style={{ width: 88, height: 88 }}>
              <LateProofPhoto lateId={item.id} id={p.id} T={T} thumb className="" onClick={onZoom} />
            </div>
            <span className="inline-flex items-center gap-1 text-[9px] leading-tight"
              title={cam ? T.srcCam : T.srcUpload}
              style={{ color: cam ? C_OK : "var(--text-4)" }}>
              {cam ? <Camera size={9} /> : <ImageUp size={9} />}
              <span className="truncate">{when || (cam ? T.srcCam : T.srcUpload)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Fact({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-[13px] font-semibold tabular-nums" style={{ color: tone || "var(--text-1)" }}>{value}</div>
    </div>
  );
}

function useKinds(T, late) {
  return useMemo(() => ({
    filed: { label: late ? T.kFiledLate : T.kFiled, color: C_WAIT,
             Icon: late ? Clock : MessageSquareWarning },
    sup_rejected: { label: T.kSupRejected, color: C_BAD, Icon: Ban },
    uplifted: { label: T.kUplifted, color: C_UP, Icon: ArrowUpCircle },
    approved: { label: late ? T.kApprovedLate : T.kApproved, color: C_OK, Icon: ShieldCheck },
    rejected: { label: T.kRejected, color: C_BAD, Icon: Ban },
    undone: { label: T.kUndone, color: C_OFF, Icon: RotateCcw, system: true },
  }), [T, late]);
}

const roleLabelFor = (T) => (role) =>
  ({ leader: T.rLeader, supervisor: T.rSupervisor, admin: T.rAdmin })[role] || "";

/** Header: whose appeal, about which task, where it stands. */
function Header({ T, title, item, late, onBack, lang, tl }) {
  return (
    <Card>
      <div className="px-4 py-3.5">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1 text-[11px] font-semibold mb-2"
          style={{ color: "var(--text-4)" }}>
          <ArrowLeft size={13} /> {T.back}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}>{title}</div>
            <div className="text-base font-semibold leading-tight mt-0.5" style={{ color: "var(--text-1)" }}>
              {tl(item.leader) || "—"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>
              {tl(item.supervisor) || "—"} · <span className="tabular-nums">{day(item.date)}</span>
              {item.shift ? ` · ${T[`shift${item.shift}`] || ""}` : ""}
            </div>
          </div>
          {item.status && <StateChip status={item.status} late={late} T={T} />}
        </div>
        <div className="mt-2.5 flex items-start gap-2 text-[13px]">
          <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5"
            style={{ color: "var(--text-4)" }}>№{item.taskId}</span>
          <span className="font-semibold leading-snug" style={{ color: "var(--text-2)" }}>
            {pick(item.taskName, lang) || T.task}
          </span>
        </div>
      </div>
    </Card>
  );
}

function AppealView({ thread, path, id }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });
  const late = thread === "late";
  const kinds = useKinds(T, late);
  const [zoom, setZoom] = useState("");
  const [rule, setRule] = useState(null);        // reject | uplift | approve
  const [note, setNote] = useState("");
  const [noteErr, setNoteErr] = useState("");
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoErr, setUndoErr] = useState("");

  const threadKey = ["appeal-thread", thread, String(id)];
  const msgsKey = ["appeal-msgs", thread, String(id)];
  const listKey = late ? ["leader-late-proofs"] : ["leader-disputes"];

  const { data, isLoading, error } = useQuery({
    queryKey: threadKey,
    queryFn: () => api.get(`/api/leaders/${path}/${id}/thread`).then((r) => r.data),
    retry: false,
    refetchInterval: 30000,
  });

  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav(`/leaders?tab=${late ? "lateproof" : "disputes"}`);
  };

  const settle = (msg) => {
    [threadKey, msgsKey, listKey, ["leaders"], ["leaderDayReport"], ["leaderUnitReport"]]
      .forEach((k) => qc.invalidateQueries({ queryKey: k }));
    toast.success(msg);
  };

  const decide = useMutation({
    mutationFn: ({ action, note: n }) =>
      api.post(`/api/leaders/${path}/${id}/decide`, { action, note: n || "" }).then((r) => r.data),
    onSuccess: (_r, v) => {
      setRule(null); setNote(""); setNoteErr("");
      settle(v.action === "uplifted" ? T.okUplift : v.action === "approved" ? T.okApprove : T.okReject);
    },
    onError: (e) => setNoteErr(e?.response?.data?.detail || T.fail),
  });
  const undo = useMutation({
    mutationFn: () => api.post(`/api/leaders/${path}/${id}/undo`).then((r) => r.data),
    onSuccess: () => { setUndoOpen(false); setUndoErr(""); settle(T.okUndo); },
    onError: (e) => setUndoErr(e?.response?.data?.detail || T.fail),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        <SkeletonBlock className="w-full" style={{ height: 110 }} />
        <SkeletonBlock className="w-full" style={{ height: 150 }} />
        <SkeletonBlock className="w-full" style={{ height: 220 }} />
      </div>
    );
  }
  if (error || !data?.item) {
    return (
      <ErrorScreen inline tone="neutral" code="404" title={T.nfT} message={T.nfM}
        action={{ label: T.back, onClick: back }} />
    );
  }

  const item = data.item;
  const noteRequired = rule === "reject" || rule === "uplift";
  const open = (r) => { setNote(""); setNoteErr(""); decide.reset(); setRule(r); };
  const run = () => {
    if (noteRequired && !note.trim()) { setNoteErr(T.noteReq); return; }
    decide.mutate({
      action: rule === "uplift" ? "uplifted" : rule === "approve" ? "approved" : "rejected",
      note: note.trim(),
    });
  };
  const atSup = data.canSupervise;
  const hint = rule === "uplift" ? T.hUplift
    : rule === "approve" ? T.hApprove
      : atSup ? T.hRejectSup : T.hRejectAdm;
  const lateText = (m) => (m === null || m === undefined)
    ? T.lateNone : fmtDuration(m, { day: T.unitD, hour: T.unitH, min: T.unitM });

  return (
    <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
      <Header T={T} title={`${late ? T.titleLate : T.titleDispute} · №${item.id}`}
        item={item} late={late} onBack={back} lang={lang} tl={tl} />

      {/* 1 · The ruling — only the buttons THIS reader has at THIS stage. */}
      {(data.canSupervise || data.canDecide || data.canUndo || (!late && item.uid)) && (
        <Card>
          <div className="px-4 py-3 space-y-2.5">
            {(data.canSupervise || data.canDecide) && (
              <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)" }}>
                {data.canSupervise ? T.turnSup : T.turnAdm}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(data.canSupervise || data.canDecide) && (
                <Button size="lg" tint variant="danger" onClick={() => open("reject")}>
                  <Ban size={14} />{T.reject}
                </Button>
              )}
              {data.canSupervise && (
                <Button size="lg" tint variant="primary" onClick={() => open("uplift")}>
                  <ArrowUpCircle size={14} />{T.uplift}
                </Button>
              )}
              {data.canDecide && (
                <Button size="lg" tint variant="success" onClick={() => open("approve")}>
                  <ShieldCheck size={14} />{late ? T.approveLate : T.approve}
                </Button>
              )}
              {data.canUndo && (
                <Button size="lg" tint variant="secondary"
                  onClick={() => { setUndoErr(""); undo.reset(); setUndoOpen(true); }}>
                  <RotateCcw size={14} />{T.undo}
                </Button>
              )}
              {!late && item.uid && (
                <Button size="lg" tint variant="ghost" className="ml-auto"
                  onClick={() => nav(`/leaders/report/${encodeURIComponent(item.uid)}`)}>
                  <ExternalLink size={14} />{T.openReport}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 2 · The evidence. */}
      <Card>
        <SectionHead icon={Images} title={T.photos}
          right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {item.photos?.length || 0}</span>} />
        <div className="px-4 py-3 space-y-3">
          {late ? (
            <>
              <LatePhotos item={item} T={T} onZoom={setZoom} />
              <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl px-3 py-2"
                style={{ background: "var(--bg-inner)" }}>
                <Fact label={T.deadline} value={item.dueAt ? stamp(item.dueAt) : (item.deadline || "—")} />
                <Fact label={T.filed} value={stamp(item.at) || "—"} />
                <Fact label={T.lateBy} value={lateText(item.lateMin)}
                  tone={item.lateMin == null ? undefined : C_WAIT} />
              </div>
            </>
          ) : (
            <>
              <DisputePhotos photos={item.photos} uid={item.uid} T={T} onZoom={setZoom} />
              <Verdict rev={item.verdict} T={T} lang={lang} />
            </>
          )}
        </div>
      </Card>

      {/* 3 · The chat. */}
      <Card>
        <SectionHead size="lg" icon={MessageCircle} title={T.chat} subtitle={T.chatHint}
          right={late && item.lateMin != null ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
              style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
              <Timer size={11} />{lateText(item.lateMin)}
            </span>
          ) : null} />
        <CommentsThread
          layout="page"
          endpoint={`/api/leaders/${path}/${id}/messages`}
          queryKey={msgsKey}
          refreshKeys={[threadKey, listKey]}
          filesEndpoint={`/api/leaders/${path}/${id}/files`}
          attachments
          canComment={!!data.canWrite}
          closedText={data.open ? T.readOnly : T.closed}
          kinds={kinds}
          roleLabel={roleLabelFor(T)}
          placeholder={T.placeholder}
          emptyText={T.empty}
          pollMs={20000}
        />
      </Card>

      <Lightbox src={zoom} onClose={() => setZoom("")} />

      {/* A ruling that carries a comment is a FORM (the Modal template). Both
          of the brigadir's rulings and an admin's refusal demand it; an
          approval offers it. The comment is the ruling's entry in the chat. */}
      <Modal
        open={!!rule}
        onClose={() => { setRule(null); setNoteErr(""); }}
        title={rule === "uplift" ? T.mUpliftT : rule === "approve" ? T.mApproveT : T.mRejectT}
        icon={rule === "uplift" ? <ArrowUpCircle size={16} />
          : rule === "approve" ? <ShieldCheck size={16} /> : <Ban size={16} />}
        subtitle={`${tl(item.leader) || "—"} · ${day(item.date)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRule(null); setNoteErr(""); }}>{T.cancel}</Button>
            <Button variant={rule === "reject" ? "danger" : rule === "approve" ? "success" : "primary"}
              loading={decide.isPending} onClick={run}>
              {rule === "uplift" ? <><ArrowUpCircle size={14} />{T.uplift}</>
                : rule === "approve" ? <><ShieldCheck size={14} />{late ? T.approveLate : T.approve}</>
                  : <><Ban size={14} />{T.reject}</>}
            </Button>
          </>
        }
      >
        <FormField
          label={rule === "approve" ? `${T.mNoteAdm} · ${T.noteOpt}` : (atSup ? T.mNoteSup : T.mNoteAdm)}
          required={noteRequired}
          hint={hint}
          error={noteErr || undefined}>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setNoteErr(""); }}
            rows={4} maxLength={1000} placeholder={T.notePh} autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm resize-y"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
        </FormField>
      </Modal>

      <ConfirmDialog
        open={undoOpen}
        title={T.cUndoT}
        message={T.cUndoM}
        confirmLabel={T.undo}
        cancelLabel={T.cancel}
        tone="danger"
        loading={undo.isPending}
        error={undoErr || undefined}
        onCancel={() => { setUndoOpen(false); setUndoErr(""); }}
        onConfirm={() => undo.mutate()}
      />

      {toast.node}
    </div>
  );
}

/** Writing a NEW objection: the rejected task's photos and the AI's reason on
 *  top, and the chat's composer — whose first message IS the objection. The
 *  day report is the one read that knows the task; once filed, the page opens
 *  the conversation it started. */
function NewObjection({ uid, taskId }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const nav = useNavigate();
  const qc = useQueryClient();
  const kinds = useKinds(T, false);
  const [zoom, setZoom] = useState("");

  const { data: rep, isLoading, error } = useQuery({
    queryKey: ["leaderDayReport", uid],
    queryFn: () => api.get(`/api/leaders/report/${encodeURIComponent(uid)}`).then((r) => r.data),
    retry: false,
    enabled: !!uid,
  });

  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav(`/leaders/report/${encodeURIComponent(uid || "")}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        <SkeletonBlock className="w-full" style={{ height: 110 }} />
        <SkeletonBlock className="w-full" style={{ height: 150 }} />
      </div>
    );
  }
  const task = (rep?.tasks || []).find((t) => Number(t.id) === Number(taskId));
  if (error || !rep || !task) {
    return (
      <ErrorScreen inline tone="neutral" code="404" title={T.nfT} message={T.nfM}
        action={{ label: T.back, onClick: back }} />
    );
  }
  const live = task.dispute && ["supervisor", "admin"].includes(task.dispute.status);
  if (live && task.dispute.id) {
    // Already argued — the conversation exists; go there instead of a second.
    return <Navigate to={`/leaders/appeal/dispute/${task.dispute.id}`} replace />;
  }
  const allowed = rep.canDispute && task.ai_rejected;
  const photos = task.media?.length
    ? task.media.map((mid, i) => ({ kind: "bot", id: mid, cam: task.cam?.[i] || null }))
    : String(task.photo || "").split(",").map((u) => u.trim()).filter((u) => u.includes("http"))
      .map((url) => ({ kind: "sheet", url }));
  const item = {
    leader: rep.leader, supervisor: rep.supervisor, date: rep.date, shift: rep.shift,
    taskId: task.id, taskName: task.name, status: null,
  };

  return (
    <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
      <Header T={T} title={T.titleNew} item={item} late={false} onBack={back} lang={lang} tl={tl} />
      <Card>
        <SectionHead icon={Images} title={T.photos}
          right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{photos.length}</span>} />
        <div className="px-4 py-3 space-y-3">
          <DisputePhotos photos={photos} uid={rep.uid} T={T} onZoom={setZoom} />
          <Verdict rev={task.review} T={T} lang={lang} />
        </div>
      </Card>
      <Card>
        <SectionHead size="lg" icon={MessageCircle} title={T.chat} subtitle={allowed ? T.newIntro : T.newNot} />
        {allowed && (
          <CommentsThread
            layout="page"
            endpoint={`/api/leaders/report/${encodeURIComponent(rep.uid)}/dispute`}
            queryKey={["appeal-new", rep.uid, task.id]}
            listEnabled={false}
            postFields={{ task_id: task.id }}
            textField="reason"
            requireText
            minText={3}
            attachments
            kinds={kinds}
            placeholder={T.newPh}
            emptyText={T.empty}
            refreshKeys={[["leaderDayReport", uid], ["leader-disputes"], ["leaderUnitReport"]]}
            onPosted={(res) => {
              qc.invalidateQueries({ queryKey: ["leader-disputes"] });
              if (res?.id) nav(`/leaders/appeal/dispute/${res.id}`, { replace: true });
              else back();
            }}
          />
        )}
      </Card>
      <Lightbox src={zoom} onClose={() => setZoom("")} />
    </div>
  );
}

export default function LeaderAppeal() {
  const { kind, id } = useParams();
  const [sp] = useSearchParams();
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const late = kind === "late";
  const title = late ? T.titleLate : T.titleDispute;
  return (
    <Layout title={title}>
      {!late && id === "new"
        ? <NewObjection uid={sp.get("uid")} taskId={sp.get("task")} />
        : <AppealView key={`${kind}-${id}`} thread={late ? "late" : "dispute"}
            path={late ? "late-proofs" : "disputes"} id={id} />}
    </Layout>
  );
}
