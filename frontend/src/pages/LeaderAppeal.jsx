import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban, ArrowUpCircle, ShieldCheck, RotateCcw, ChevronLeft, ChevronRight, ChevronDown,
  MessageSquareWarning, MessageCircle, Clock, Hourglass, UserCheck, CircleSlash,
  Camera, ImageUp, Timer, Images, Gavel, FileText, Maximize2, UserPlus,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import FormField from "../components/ui/FormField";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import VerdictBlock from "../components/leaders/VerdictBlock";
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
 * ruling is MADE — read, then decide (2026-09-28, reworked for phones):
 *
 *   1. the CASE — whose appeal, which task, which day, where it stands; for the
 *      one person whose turn it is, a «your ruling is waiting» row that jumps
 *      straight to the ruling (so nobody has to hunt for it);
 *   2. the EVIDENCE — the proof photos, drawn large (a lone photo takes the
 *      card's width: it IS the thing being judged), and the AI's reason for the
 *      rejection; a late proof has no AI verdict (the AI never reviews one), so
 *      its photos and how late it came stand there instead;
 *   3. the CHAT — the filing, every question and answer, every ruling, with
 *      files of any type attached. All three parties read everything and are
 *      told about every message; writing stops once a ruling is final;
 *   4. the RULING, at the end of the conversation and right above the
 *      composer, for whoever may rule at this stage and nobody else (the
 *      server's `canSupervise` / `canDecide`, never a role guess): the brigadir
 *      refuses or passes up — both need their comment; an admin refuses
 *      (reason required) or upholds (comment optional); an admin can take a
 *      ruling back, which REOPENS the chat at that stage.
 *
 * The ruling used to open the page. On a phone it had scrolled under the
 * header before the photo and the discussion — what it depends on — were even
 * read, so a ruler read down and then scrolled back up to act, and the page's
 * first move invited deciding before reading. At the end of the discussion it
 * is where the reader arrives, and the first screen still says whose turn it
 * is and takes them there in one tap.
 *
 * Once the case scrolls away the app header names it (leader · task · day), so
 * a reader deep in a long thread never loses whose appeal they are in.
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
// «Surname Given» — what the app header has room for («Akramov Dilshodbek»).
const twoWords = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
const hhmm = (ts) => (ts ? String(ts).slice(11, 16) : "");
const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const TXT = {
  uz: {
    titleDispute: "AI qaroriga norozilik", titleLate: "Kechikkan isbot", titleNew: "Yangi norozilik",
    back: "Orqaga", task: "Vazifa", shift1: "1-smena", shift2: "2-smena",
    stSupervisor: "Brigadir ko'rib chiqmoqda", stAdmin: "Admin qarorini kutmoqda",
    stApproved: "Qabul qilindi", stApprovedLate: "Tasdiqlandi", stRejected: "Rad etildi",
    stCancelled: "Qaror bekor qilingan",
    reject: "Rad etish", uplift: "Adminlarga yuborish", approve: "Qabul qilish",
    approveLate: "Tasdiqlash", undo: "Qarorni bekor qilish", openReport: "Kun hisobotini ochish", openChecklist: "Chek-listni ochish",
    cancel: "Bekor qilish",
    turnSup: "Sizning navbatingiz: savollaringizni chatda bering, so'ng rad eting yoki adminlarga yuboring — ikkalasi ham izoh talab qiladi.",
    turnAdm: "Sizning navbatingiz: chatda lider va brigadirdan so'rashingiz mumkin. Rad etish uchun sabab shart, qabul qilishda izoh ixtiyoriy.",
    photos: "Isbot rasmlari", noPhotos: "Rasm topilmadi", aiTitle: "AI rad etish sababi",
    window: "Ruxsat etilgan vaqt", needDate: "Kerakli sana", needTime: "Ruxsat etilgan soat",
    onPhoto: "Rasmda", deadline: "Muddat", filed: "Yuborildi", lateBy: "Kechikish",
    lateNone: "o'lchab bo'lmaydi", unitD: "kun", unitH: "soat", unitM: "daq",
    srcCam: "Ilovada olingan", srcUpload: "Yuklangan",
    chat: "Muhokama", chatHint: "Lider, brigadir, adminlar va chatga qo'shilganlar ko'radi va xabar oladi",
    placeholder: "Xabar yozing…", closed: "Qaror yakuniy — chat yopilgan. Admin qarorni bekor qilsa, chat qayta ochiladi.",
    readOnly: "Bu chatda faqat lider, brigadir, adminlar va ular chatga qo'shgan odamlar yozadi.",
    placeholderMention: "Xabar yozing… @ bilan odam qo'shing", kInvited: "Chatga qo'shildi",
    empty: "Hozircha xabar yo'q",
    kFiled: "Norozilik", kFiledLate: "Kechikkan isbot sababi", kSupRejected: "Brigadir rad etdi",
    kUplifted: "Adminlarga yuborildi", kApproved: "Qabul qilindi", kApprovedLate: "Tasdiqlandi",
    kRejected: "Rad etildi", kUndone: "Qaror bekor qilindi — chat qayta ochildi",
    rLeader: "Lider", rSupervisor: "Brigadir", rAdmin: "Admin",
    rShiftManager: "Smena menejeri", rTopManager: "Top menejer", rGuest: "Mehmon", rIdleOwner: "Kutish mas'uli",
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
    turnShort: "Qaror sizdan kutilmoqda", toRuling: "Qarorga o'tish", rulingTitle: "Sizning qaroringiz",
    zoom: "Kattalashtirish", photosOne: "{n} ta rasm", photosMany: "{n} ta rasm",
  },
  uz_cyrl: {
    titleDispute: "AI қарорига норозилик", titleLate: "Кечиккан исбот", titleNew: "Янги норозилик",
    back: "Орқага", task: "Вазифа", shift1: "1-смена", shift2: "2-смена",
    stSupervisor: "Бригадир кўриб чиқмоқда", stAdmin: "Админ қарорини кутмоқда",
    stApproved: "Қабул қилинди", stApprovedLate: "Тасдиқланди", stRejected: "Рад этилди",
    stCancelled: "Қарор бекор қилинган",
    reject: "Рад этиш", uplift: "Админларга юбориш", approve: "Қабул қилиш",
    approveLate: "Тасдиқлаш", undo: "Қарорни бекор қилиш", openReport: "Кун ҳисоботини очиш", openChecklist: "Чек-листни очиш",
    cancel: "Бекор қилиш",
    turnSup: "Сизнинг навбатингиз: саволларингизни чатда беринг, сўнг рад этинг ёки админларга юборинг — иккаласи ҳам изоҳ талаб қилади.",
    turnAdm: "Сизнинг навбатингиз: чатда лидер ва бригадирдан сўрашингиз мумкин. Рад этиш учун сабаб шарт, қабул қилишда изоҳ ихтиёрий.",
    photos: "Исбот расмлари", noPhotos: "Расм топилмади", aiTitle: "AI рад этиш сабаби",
    window: "Рухсат этилган вақт", needDate: "Керакли сана", needTime: "Рухсат этилган соат",
    onPhoto: "Расмда", deadline: "Муддат", filed: "Юборилди", lateBy: "Кечикиш",
    lateNone: "ўлчаб бўлмайди", unitD: "кун", unitH: "соат", unitM: "дақ",
    srcCam: "Иловада олинган", srcUpload: "Юкланган",
    chat: "Муҳокама", chatHint: "Лидер, бригадир, админлар ва чатга қўшилганлар кўради ва хабар олади",
    placeholder: "Хабар ёзинг…", closed: "Қарор якуний — чат ёпилган. Админ қарорни бекор қилса, чат қайта очилади.",
    readOnly: "Бу чатда фақат лидер, бригадир, админлар ва улар чатга қўшган одамлар ёзади.",
    placeholderMention: "Хабар ёзинг… @ билан одам қўшинг", kInvited: "Чатга қўшилди",
    empty: "Ҳозирча хабар йўқ",
    kFiled: "Норозилик", kFiledLate: "Кечиккан исбот сабаби", kSupRejected: "Бригадир рад этди",
    kUplifted: "Админларга юборилди", kApproved: "Қабул қилинди", kApprovedLate: "Тасдиқланди",
    kRejected: "Рад этилди", kUndone: "Қарор бекор қилинди — чат қайта очилди",
    rLeader: "Лидер", rSupervisor: "Бригадир", rAdmin: "Админ",
    rShiftManager: "Смена менежери", rTopManager: "Топ менежер", rGuest: "Меҳмон", rIdleOwner: "Кутиш масъули",
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
    turnShort: "Қарор сиздан кутилмоқда", toRuling: "Қарорга ўтиш", rulingTitle: "Сизнинг қарорингиз",
    zoom: "Катталаштириш", photosOne: "{n} та расм", photosMany: "{n} та расм",
  },
  ru: {
    titleDispute: "Возражение на решение ИИ", titleLate: "Позднее подтверждение", titleNew: "Новое возражение",
    back: "Назад", task: "Задача", shift1: "Смена 1", shift2: "Смена 2",
    stSupervisor: "У бригадира", stAdmin: "Ждёт решения администратора",
    stApproved: "Принято", stApprovedLate: "Принято", stRejected: "Отклонено",
    stCancelled: "Решение отменено",
    reject: "Отклонить", uplift: "Передать администраторам", approve: "Принять",
    approveLate: "Принять", undo: "Отменить решение", openReport: "Открыть отчёт за день", openChecklist: "Открыть чек-лист",
    cancel: "Отмена",
    turnSup: "Ваша очередь: задайте вопросы в чате, затем отклоните или передайте администраторам — в обоих случаях нужен комментарий.",
    turnAdm: "Ваша очередь: в чате можно спросить лидера и бригадира. Для отказа нужна причина, при принятии комментарий необязателен.",
    photos: "Фото-подтверждения", noPhotos: "Фото не найдены", aiTitle: "Причина отказа ИИ",
    window: "Допустимое время", needDate: "Нужная дата", needTime: "Допустимый час съёмки",
    onPhoto: "На фото", deadline: "Срок", filed: "Отправлено", lateBy: "Опоздание",
    lateNone: "не измерить", unitD: "д", unitH: "ч", unitM: "мин",
    srcCam: "Снято в приложении", srcUpload: "Загружено",
    chat: "Обсуждение", chatHint: "Лидер, бригадир, администраторы и добавленные в чат видят всё и получают уведомления",
    placeholder: "Напишите сообщение…", closed: "Решение окончательное — чат закрыт. Если администратор отменит решение, чат откроется снова.",
    readOnly: "В этом чате пишут только лидер, бригадир, администраторы и добавленные ими люди.",
    placeholderMention: "Напишите сообщение… @ — добавить человека", kInvited: "Добавлен(а) в чат",
    empty: "Сообщений пока нет",
    kFiled: "Возражение", kFiledLate: "Причина опоздания", kSupRejected: "Бригадир отклонил",
    kUplifted: "Передано администраторам", kApproved: "Принято", kApprovedLate: "Принято",
    kRejected: "Отклонено", kUndone: "Решение отменено — чат открыт снова",
    rLeader: "Лидер", rSupervisor: "Бригадир", rAdmin: "Админ",
    rShiftManager: "Менеджер смены", rTopManager: "Топ-менеджер", rGuest: "Гость", rIdleOwner: "Ответственный за простой",
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
    turnShort: "Ждёт вашего решения", toRuling: "Перейти к решению", rulingTitle: "Ваше решение",
    zoom: "Увеличить", photosOne: "{n} фото", photosMany: "{n} фото",
  },
  en: {
    titleDispute: "Objection to an AI ruling", titleLate: "Late proof", titleNew: "New objection",
    back: "Back", task: "Task", shift1: "Shift 1", shift2: "Shift 2",
    stSupervisor: "With the brigadir", stAdmin: "Awaiting an admin decision",
    stApproved: "Upheld", stApprovedLate: "Approved", stRejected: "Refused",
    stCancelled: "Ruling undone",
    reject: "Refuse", uplift: "Pass to the admins", approve: "Uphold",
    approveLate: "Approve", undo: "Undo the ruling", openReport: "Open the day report", openChecklist: "Open the checklist",
    cancel: "Cancel",
    turnSup: "Your turn: ask what you need in the chat, then refuse it or pass it to the admins — both need your comment.",
    turnAdm: "Your turn: you can ask the leader and the brigadir in the chat. Refusing needs a reason; a comment on approval is optional.",
    photos: "Proof photos", noPhotos: "No photos found", aiTitle: "Why the AI rejected it",
    window: "Allowed window", needDate: "Required date", needTime: "Allowed clock time",
    onPhoto: "On the photo", deadline: "Deadline", filed: "Filed", lateBy: "Late by",
    lateNone: "not measurable", unitD: "d", unitH: "h", unitM: "min",
    srcCam: "Shot in the app", srcUpload: "Uploaded",
    chat: "Discussion", chatHint: "The leader, the brigadir, the admins and the people added to the chat see everything and are notified",
    placeholder: "Write a message…", closed: "The ruling is final — the chat is closed. If an admin undoes the ruling, it opens again.",
    readOnly: "Only the leader, the brigadir, the admins and the people they added write in this chat.",
    placeholderMention: "Write a message… @ adds a person", kInvited: "Added to the chat",
    empty: "No messages yet",
    kFiled: "Objection", kFiledLate: "Reason for being late", kSupRejected: "The brigadir refused",
    kUplifted: "Passed to the admins", kApproved: "Upheld", kApprovedLate: "Approved",
    kRejected: "Refused", kUndone: "Ruling undone — the chat is open again",
    rLeader: "Leader", rSupervisor: "Brigadir", rAdmin: "Admin",
    rShiftManager: "Shift manager", rTopManager: "Top manager", rGuest: "Guest", rIdleOwner: "Waiting owner",
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
    turnShort: "Waiting for your ruling", toRuling: "Go to the ruling", rulingTitle: "Your ruling",
    zoom: "Enlarge", photosOne: "{n} photo", photosMany: "{n} photos",
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

/** One proof photo. The image is fetched with the session's auth (ProxyPhoto);
 *  over it sits a real, labelled button — a tap on a phone, a keyboard stop on a
 *  desktop — that opens it full-screen. A LONE photo is drawn at the card's
 *  width with its whole frame (`contain`): it is the evidence the ruling is
 *  about, and at the old 88px a document photo was a grey square nobody could
 *  read. Several share a grid of squares and open the same way. */
function ProofTile({ render, caption, big, T, onZoom }) {
  const [src, setSrc] = useState("");
  return (
    <figure className="min-w-0 m-0">
      <div className={`relative rounded-lg overflow-hidden ${big ? "" : "aspect-square"}`}
        style={{ background: "var(--bg-inner)" }}>
        {render({ big, onReady: setSrc, onClick: onZoom })}
        {src && (
          <button type="button" onClick={() => onZoom(src)} aria-label={T.zoom} title={T.zoom}
            className="group absolute inset-0 w-full h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)]">
            <span className={`absolute right-2 bottom-2 grid place-items-center rounded-full text-white transition-transform group-hover:scale-110 ${big ? "w-9 h-9" : "w-7 h-7"}`}
              style={{ background: "rgba(0,0,0,.55)" }}>
              <Maximize2 size={big ? 16 : 13} />
            </span>
          </button>
        )}
      </div>
      {caption && (
        <figcaption className={`mt-1.5 flex items-center gap-1.5 min-w-0 ${big ? "text-[12px]" : "text-[11px]"}`}
          style={{ color: "var(--text-2)" }}>
          <caption.Icon size={big ? 13 : 12} className="flex-shrink-0" style={{ color: caption.tone }} />
          <span className="truncate">{caption.text}</span>
        </figcaption>
      )}
    </figure>
  );
}

function Gallery({ items, T, onZoom }) {
  if (!items.length) {
    return <p className="text-[13px]" style={{ color: "var(--text-3)" }}>{T.noPhotos}</p>;
  }
  if (items.length === 1) {
    const [only] = items;
    return <ProofTile big render={only.render} caption={only.caption} T={T} onZoom={onZoom} />;
  }
  return (
    <div className={`grid gap-2 ${items.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {items.map((it) => (
        <ProofTile key={it.key} render={it.render} caption={it.caption} T={T} onZoom={onZoom} />
      ))}
    </div>
  );
}

// How big a lone photo may be drawn — most of a phone's screen, never more.
const BIG_MAX = "min(62vh, 520px)";
const photoProps = (big) => (big ? { fit: "contain", maxHeight: BIG_MAX } : { thumb: true });
// Where a proof came from: shot in the app (the server stamped its time) or a
// picked file. Green camera = the time on it is the platform's own.
const camCaption = (T, at) => ({ Icon: Camera, tone: C_OK, text: at ? `${T.srcCam} · ${at}` : T.srcCam });
const uploadCaption = (T, at) => ({ Icon: ImageUp, tone: "var(--text-4)", text: at ? `${T.srcUpload} · ${at}` : T.srcUpload });

/** The photos the AI refused — the day report's own archive copies (with the
 *  in-app stamp where there is one) or the Form links, through the report's
 *  photo doors, which the `uid` authorises. */
function DisputePhotos({ photos, uid, T, onZoom }) {
  const items = (photos || []).map((p, i) => ({
    key: p.id ?? p.url ?? i,
    render: ({ big, onReady, onClick }) => (p.kind === "bot"
      ? <BotPhoto id={p.id} uid={uid} T={T} className="" {...photoProps(big)} onReady={onReady} onClick={onClick} />
      : <ReportPhoto src={p.url} uid={uid} T={T} className="" {...photoProps(big)} onReady={onReady} onClick={onClick} />),
    caption: p.cam ? camCaption(T, hhmm(p.cam?.at)) : uploadCaption(T, ""),
  }));
  return <Gallery items={items} T={T} onZoom={onZoom} />;
}

function LatePhotos({ item, T, onZoom }) {
  const items = (item.photos || []).map((p) => {
    const cam = p.source === "camera";
    const when = cam ? (p.stamp?.slice(-8, -3) || hhmm(p.at)) : hhmm(p.got);
    return {
      key: p.id,
      render: ({ big, onReady, onClick }) => (
        <LateProofPhoto lateId={item.id} id={p.id} T={T} className="" {...photoProps(big)}
          onReady={onReady} onClick={onClick} />),
      caption: cam ? camCaption(T, when) : uploadCaption(T, when),
    };
  });
  return <Gallery items={items} T={T} onZoom={onZoom} />;
}

function Fact({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-0.5 text-[14px] font-semibold tabular-nums" style={{ color: tone || "var(--text-1)" }}>{value}</div>
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
    // An admin @mentioned somebody new: a centred line naming who was added.
    invited: { label: T.kInvited, color: C_UP, Icon: UserPlus, system: true, inline: true },
  }), [T, late]);
}

const roleLabelFor = (T) => (role) =>
  ({
    leader: T.rLeader, supervisor: T.rSupervisor, admin: T.rAdmin,
    "shift-manager": T.rShiftManager, "top-manager": T.rTopManager,
    guest: T.rGuest, "idle-owner": T.rIdleOwner,
  })[role] || "";

/** The case: whose appeal, about which task, where it stands — and, for the
 *  one person whose turn it is, a row that takes them to the ruling. The page
 *  title («AI qaroriga norozilik») is the app header's; this card leads with
 *  the PERSON, which is what a reader scanning several appeals tells apart.
 *  `idRef` marks the name block: once it scrolls away, the app header takes
 *  over naming the case (see AppealView). */
function Header({ T, item, late, onBack, lang, tl, idRef, turn, onToRuling, report }) {
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";
  return (
    <Card>
      <div className="px-3 sm:px-6 pt-2 pb-4">
        <button type="button" onClick={onBack}
          className={`-ml-1.5 mb-1 inline-flex items-center gap-0.5 h-9 pl-0.5 pr-2.5 rounded-lg text-[13px] font-semibold transition-colors hover:bg-[var(--hover-bg)] ${focus}`}
          style={{ color: "var(--text-2)" }}>
          <ChevronLeft size={18} />{T.back}
        </button>
        <div ref={idRef}>
          <h2 className="text-lg font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
            {tl(item.leader) || "—"}
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-3)" }}>
            {tl(item.supervisor) || "—"} · <span className="tabular-nums">{day(item.date)}</span>
            {item.shift ? ` · ${T[`shift${item.shift}`] || ""}` : ""}
          </p>
        </div>
        {item.status && (
          <div className="mt-2.5"><StateChip status={item.status} late={late} T={T} /></div>
        )}
        <div className="mt-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)" }}>
          <span className="text-[12px] font-bold tabular-nums flex-shrink-0 mt-[2px]" style={{ color: "var(--text-3)" }}>
            №{item.taskId}
          </span>
          <span className="text-[14px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
            {pick(item.taskName, lang) || T.task}
          </span>
        </div>
        {turn && (
          <button type="button" onClick={onToRuling}
            className={`mt-3 w-full flex items-center gap-3 rounded-xl px-3 py-2.5 min-h-[52px] text-left transition-[filter] hover:brightness-110 ${focus}`}
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <Gavel size={18} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                {T.turnShort}
              </span>
              <span className="block text-[12px] leading-snug" style={{ color: "var(--brand-text)" }}>{T.toRuling}</span>
            </span>
            <ChevronDown size={18} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
          </button>
        )}
        {report && (
          <div className="mt-3 -mb-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={report.onClick}
              className={`-mx-2 w-[calc(100%+1rem)] flex items-center gap-2.5 min-h-[44px] px-2 rounded-lg text-left text-[14px] font-medium transition-colors hover:bg-[var(--hover-bg)] ${focus}`}
              style={{ color: "var(--text-1)" }}>
              <FileText size={17} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
              <span className="flex-1 min-w-0">{report.label}</span>
              <ChevronRight size={17} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** The case, named in the app header while its own card is scrolled away. */
function useCompactTitle(ref, compact, onCompact, ready) {
  useEffect(() => {
    const el = ref.current;
    if (!onCompact || !ready || !el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => {
      // Out of view AND in the upper half: scrolled PAST, not yet to come.
      const past = !e.isIntersecting && e.boundingClientRect.top < window.innerHeight / 2;
      onCompact(past ? compact : null);
    });
    io.observe(el);
    return () => { io.disconnect(); onCompact(null); };
    // `compact` is keyed by its text, so a refetch returning the same case
    // does not re-arm the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, compact?.title, compact?.subtitle, onCompact]);
}

function AppealView({ thread, path, id, onCompact }) {
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
  const idRef = useRef(null);
  const rulingRef = useRef(null);
  const [rulingFlash, setRulingFlash] = useState(false);

  const threadKey = ["appeal-thread", thread, String(id)];
  const msgsKey = ["appeal-msgs", thread, String(id)];
  const listKey = late ? ["leader-late-proofs"] : ["leader-disputes"];

  const { data, isLoading, error } = useQuery({
    queryKey: threadKey,
    queryFn: () => api.get(`/api/leaders/${path}/${id}/thread`).then((r) => r.data),
    retry: false,
    refetchInterval: 30000,
  });
  // Everybody an ADMIN may bring into the chat by @mentioning them — the
  // server offers the list to admins alone (the operator's ruling), so nobody
  // else asks for it.
  const peopleKey = ["appeal-people", thread, String(id)];
  const { data: people } = useQuery({
    queryKey: peopleKey,
    queryFn: () => api.get(`/api/leaders/${path}/${id}/mentionable`).then((r) => r.data),
    enabled: !!data?.canMention,
    staleTime: 5 * 60 * 1000,
  });
  // WHEN the ФАКТ behind a failed #9 was typed — its own request, asked once:
  // it builds production pages, which the 30-second thread poll must not pay
  // for. `null` for an objection to anything else, so nothing is drawn there.
  const { data: timing } = useQuery({
    queryKey: ["appeal-auto-timing", String(id)],
    queryFn: () => api.get(`/api/leaders/disputes/${id}/auto-timing`).then((r) => r.data?.timing),
    enabled: !late && !!data?.item?.auto && !data?.item?.verdict,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const mentionNames = useMemo(() => (data?.item ? [
    data.item.leader, data.item.supervisor, ...(data.members || []).map((m) => m.name),
  ].filter(Boolean) : []), [data]);

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

  const it = data?.item;
  const compact = useMemo(() => (it ? {
    title: twoWords(tl(it.leader)) || T.titleDispute,
    subtitle: [`№${it.taskId}`, pick(it.taskName, lang), day(it.date).slice(0, 5)].filter(Boolean).join(" · "),
  } : null), [it, tl, lang, T]);
  useCompactTitle(idRef, compact, onCompact, !!it);

  // The «your turn» row's jump: the ruling sits at the end of the discussion,
  // brought to mid-screen (the docked composer owns the bottom edge) and ringed
  // for a moment so the eye lands on it, not merely somewhere near it.
  useEffect(() => {
    if (!rulingFlash) return undefined;
    const tm = window.setTimeout(() => setRulingFlash(false), 1400);
    return () => window.clearTimeout(tm);
  }, [rulingFlash]);
  const toRuling = () => {
    rulingRef.current?.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    setRulingFlash(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 196 }} />
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 360 }} />
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 220 }} />
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

  const canRule = !!(data.canSupervise || data.canDecide);
  const nPhotos = item.photos?.length || 0;
  const photoCount = (nPhotos === 1 ? T.photosOne : T.photosMany).replace("{n}", nPhotos);
  // A day still being filed has no report yet — an objection may be raised the
  // moment a submitted task is judged — so its reader is sent to that day's
  // checklist instead. Navigation, so it is a row with a chevron, not a
  // button competing with the ruling.
  // Somebody an admin brought in reads THIS chat, not the day behind it.
  const report = !late && item.uid && !data.invited ? {
    label: item.dayOpen ? T.openChecklist : T.openReport,
    onClick: () => nav(item.dayOpen
      ? `/leaders?tab=checklist&leader=${item.leaderId || ""}&date=${item.date || ""}`
      : `/leaders/report/${encodeURIComponent(item.uid)}`),
  } : null;

  // The choices THIS reader has at THIS stage. Two short ones share a row on
  // every width; «Adminlarga yuborish» — and three choices — do not fit half a
  // phone, so they stack there.
  const rulingButtons = [
    { key: "reject", variant: "danger", Icon: Ban, label: T.reject },
    ...(data.canSupervise ? [{ key: "uplift", variant: "primary", Icon: ArrowUpCircle, label: T.uplift }] : []),
    ...(data.canDecide ? [{ key: "approve", variant: "success", Icon: ShieldCheck, label: late ? T.approveLate : T.approve }] : []),
  ];
  const rulingCols = rulingButtons.length === 3 ? "grid-cols-1 sm:grid-cols-3"
    : data.canSupervise ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2";
  const rulingPanel = canRule ? (
    <div ref={rulingRef} className="px-3 sm:px-6 pb-4">
      <section aria-labelledby={`ruling-${thread}-${id}`}
        className="rounded-2xl p-3.5 sm:p-4 transition-shadow duration-300"
        style={{
          background: "var(--bg-inner)", border: "1px solid var(--brand-border)",
          boxShadow: rulingFlash ? "0 0 0 1px var(--brand), 0 0 0 5px var(--brand-bg)" : "none",
        }}>
        <h3 id={`ruling-${thread}-${id}`} className="flex items-center gap-2 text-[15px] font-semibold leading-snug"
          style={{ color: "var(--text-1)" }}>
          <Gavel size={17} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
          {T.rulingTitle}
        </h3>
        <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--text-3)" }}>
          {data.canSupervise ? T.turnSup : T.turnAdm}
        </p>
        <div className={`mt-3 grid gap-2 ${rulingCols}`}>
          {rulingButtons.map((b) => (
            <Button key={b.key} size="lg" tint variant={b.variant} className="w-full h-11"
              onClick={() => open(b.key)}>
              <b.Icon size={16} />{b.label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  ) : data.canUndo ? (
    <div className="px-3 sm:px-6 pb-4">
      <Button size="lg" tint variant="secondary" className="w-full h-11"
        onClick={() => { setUndoErr(""); undo.reset(); setUndoOpen(true); }}>
        <RotateCcw size={15} />{T.undo}
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
      {/* 1 · The case. */}
      <Header T={T} item={item} late={late} onBack={back} lang={lang} tl={tl}
        idRef={idRef} turn={canRule} onToRuling={toRuling} report={report} />

      {/* 2 · The evidence. */}
      <Card>
        <SectionHead size="lg" icon={Images} title={T.photos} subtitle={photoCount} />
        <div className="px-3 sm:px-6 py-4 space-y-4">
          {late ? (
            <>
              <LatePhotos item={item} T={T} onZoom={setZoom} />
              <div className="grid grid-cols-3 gap-3 rounded-xl px-3 py-2.5"
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
              {/* An objection to an AUTOMATIC check carries no AI verdict —
                  what it argues with is the check's own sentinel. */}
              <VerdictBlock rev={item.verdict} autoReason={item.auto?.reason}
                autoFacts={item.auto?.facts} autoTiming={timing} title={T.aiTitle} />
            </>
          )}
        </div>
      </Card>

      {/* 3 · The chat — and 4 · the ruling, at its end, above the composer. */}
      <Card>
        <SectionHead size="lg" icon={MessageCircle} title={T.chat} subtitle={T.chatHint}
          // Beside the title from sm; on a phone the facts right above already
          // say how late it was, and this chip only wrapped under the title.
          right={late && item.lateMin != null ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
              style={{ background: hexA(C_WAIT, 0.12), color: C_WAIT }}>
              <Timer size={11} />{lateText(item.lateMin)}
            </span>
          ) : null} />
        <CommentsThread
          layout="page"
          endpoint={`/api/leaders/${path}/${id}/messages`}
          queryKey={msgsKey}
          refreshKeys={[threadKey, listKey, peopleKey]}
          filesEndpoint={`/api/leaders/${path}/${id}/files`}
          attachments
          canComment={!!data.canWrite}
          closedText={data.open ? T.readOnly : T.closed}
          kinds={kinds}
          roleLabel={roleLabelFor(T)}
          mentionPeople={data.canMention ? (people || []) : null}
          mentionNames={mentionNames}
          placeholder={data.canMention ? T.placeholderMention : T.placeholder}
          emptyText={T.empty}
          pollMs={20000}
          beforeComposer={rulingPanel}
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
function NewObjection({ uid, taskId, onCompact }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const nav = useNavigate();
  const qc = useQueryClient();
  const kinds = useKinds(T, false);
  const [zoom, setZoom] = useState("");
  const idRef = useRef(null);

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

  const task = (rep?.tasks || []).find((t) => Number(t.id) === Number(taskId));
  const compact = useMemo(() => (rep && task ? {
    title: twoWords(tl(rep.leader)) || T.titleNew,
    subtitle: [`№${task.id}`, pick(task.name, lang), day(rep.date).slice(0, 5)].filter(Boolean).join(" · "),
  } : null), [rep, task, tl, lang, T]);
  useCompactTitle(idRef, compact, onCompact, !!(rep && task));

  if (isLoading) {
    return (
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 160 }} />
        <SkeletonBlock className="w-full rounded-2xl" style={{ height: 360 }} />
      </div>
    );
  }
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
  // A failed AUTOMATIC check can be argued too (2026-09-28) — the report says
  // which tasks may be, and an older backend that does not say is read as
  // «only an AI rejection», exactly as before.
  const allowed = rep.canDispute && (task.objectable ?? task.ai_rejected);
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
      <Header T={T} item={item} late={false} onBack={back} lang={lang} tl={tl} idRef={idRef} />
      <Card>
        <SectionHead size="lg" icon={Images} title={T.photos}
          subtitle={(photos.length === 1 ? T.photosOne : T.photosMany).replace("{n}", photos.length)} />
        <div className="px-3 sm:px-6 py-4 space-y-4">
          <DisputePhotos photos={photos} uid={rep.uid} T={T} onZoom={setZoom} />
          <VerdictBlock rev={task.review} autoReason={task.auto ? task.reason : null}
            autoFacts={task.autoFacts} title={T.aiTitle} />
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
  const fresh = !late && id === "new";
  const title = late ? T.titleLate : fresh ? T.titleNew : T.titleDispute;
  // While the case card is scrolled away the app header names the case —
  // leader · task · day — instead of the page's kind (see useCompactTitle).
  const [compact, setCompact] = useState(null);
  return (
    <Layout title={compact?.title || title} subtitle={compact?.subtitle}>
      {fresh
        ? <NewObjection uid={sp.get("uid")} taskId={sp.get("task")} onCompact={setCompact} />
        : <AppealView key={`${kind}-${id}`} thread={late ? "late" : "dispute"}
            path={late ? "late-proofs" : "disputes"} id={id} onCompact={setCompact} />}
    </Layout>
  );
}
