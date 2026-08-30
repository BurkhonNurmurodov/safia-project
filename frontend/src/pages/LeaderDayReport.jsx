import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarDays, User, Users, Sparkles, Clock, CalendarCheck,
  CheckCircle2, XCircle, MessageSquareWarning, Camera, ChevronDown, RotateCcw,
  ArrowUpCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Lightbox from "../components/ui/Lightbox";
import FormField from "../components/ui/FormField";
import ErrorScreen from "../components/ui/ErrorScreen";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { ReportPhoto, BotPhoto } from "../components/leaders/ProofPhoto";
import { VERIFY, GROUP_ORDER, groupOf, taskState, disputeOpen } from "../components/leaders/verifyState";
import api from "../utils/api";

/**
 * One leader's day, verified — `/leaders/report/:uid`.
 *
 * This is where the automatic-verification DM lands. Its whole job is to
 * answer, on a phone, in one screen: **what is my score, and why did it move?**
 * Everything on the page is arranged around that question.
 *
 *  - Access is a valid session only, deliberately NOT `page.view.leaders`
 *    (like `/cells/:id`): the brigadir being told their unit's score is often
 *    someone no admin ever granted the page to, and a notification that opens
 *    onto "no access" is worse than no notification. The backend scopes the
 *    row — admins see all, a brigadir their unit, a leader themselves.
 *  - Tasks are grouped by OUTCOME, failures first, never by task number.
 *    Thirteen tasks in catalog order put ten passes above the three failures,
 *    so the first screen answered nothing.
 *  - The score is never shown alone. `submitted → verified` travels with it,
 *    because a number that dropped without saying what it dropped from reads
 *    as a bug, not a verdict.
 *  - Nothing here re-derives a score. The backend ships the same number the
 *    register prints, from the same code; three surfaces disagreeing about one
 *    day is the exact failure this feature exists to prevent.
 */

const T_ALL = {
  uz: {
    title: "Kun hisoboti", back: "Orqaga",
    leader: "Lider", unit: "Bo'lim", date: "Sana", shift: "Smena",
    filed: "Yuborilgan", source: "Manba", srcBot: "Bot", srcSheet: "Forma",
    verified: "Tasdiqlangan baho", submitted: "Topshirilgan",
    ofTasks: "{n} ta vazifadan", checkedN: "{n} ta tekshirildi",
    rejectedN: "{n} ta o'tmadi", errorN: "{n} ta xatolik", pendingN: "{n} ta tekshirilmoqda",
    checking: "Tekshirilmoqda", chkNote: "{done}/{total} vazifa tekshirildi — baho o'zgarishi mumkin.",
    stVerified: "Tasdiqlandi", stRejected: "Qabul qilinmadi", stDisputed: "Norozilik ko'rib chiqilmoqda",
    stError: "Tekshirib bo'lmadi", stChecking: "Navbatda",
    gRejected: "Qabul qilinmagan", gDisputed: "Norozilik bildirilgan",
    gError: "Texnik xatolik", gChecking: "Tekshirilmoqda", gVerified: "Tasdiqlangan",
    gNone: "Tekshirilmagan",
    answerYes: "Bajarildi", answerNo: "Bajarilmadi", noAnswer: "Javob berilmagan",
    reason: "Sabab", weight: "Ulush", photos: "Dalil rasmlari",
    shotInApp: "ilovada olingan", shotLate: "kech", shotDeferred: "keyin yuborilgan",
    aiVerdict: "AI xulosasi", window: "Ruxsat etilgan vaqt", onPhoto: "Rasmda",
    needDate: "Kerakli sana",
    errNote: "Bu rasmni yuklab bo'lmadi. Bu texnik nosozlik — baho pasaytirilmadi.",
    adminRuled: "Admin qarori: {v}", ruledDone: "bajarilgan", ruledNot: "bajarilmagan",
    dispute: "Norozilik bildirish", disputeTitle: "AI qaroriga norozilik",
    disputeIntro: "Nima uchun bu vazifa noto'g'ri rad etilgan? Izohingizni brigadiringiz o'qiydi: u rad etadi yoki adminlarga yuboradi, va ball adminlar qaroridan keyin qaytadi.",
    disputeReason: "Sabab", disputePh: "Masalan: rasmda soat ko'rinib turibdi, lekin AI o'qiy olmagan",
    disputeSend: "Yuborish", cancel: "Bekor qilish",
    dispSupervisor: "Norozilik yuborildi — brigadir ko'rib chiqmoqda",
    dispAdmin: "Brigadir adminlarga yubordi — admin qarorini kutmoqda",
    dispApproved: "Norozilik qabul qilindi", dispRejected: "Norozilik rad etildi",
    dispCancelled: "Norozilik bo'yicha qaror bekor qilindi",
    dispBy: "Yuborgan: {who}", dispDecided: "Hal qildi: {who}",
    dispUndoneBy: "Bekor qildi: {who}",
    noteLead: "Lider izohi", noteLeadSup: "Brigadir izohi (lider nomidan)",
    noteSup: "Brigadir izohi", noteAdm: "Admin izohi",
    supUplifted: "adminlarga yuborildi", supRejected: "rad etdi",
    uplift: "Adminlarga yuborish", upliftTitle: "Norozilikni adminlarga yuborish",
    upliftIntro: "Nega bu vazifaga ball berilishi kerak? Adminlar lider izohi bilan birga shuni o'qib qaror qiladi.",
    upliftPh: "Izohingizni yozing…", noteReq: "Izoh yozing.",
    okUplift: "Adminlarga yuborildi",
    approve: "Qabul qilish", refuse: "Rad etish",
    undo: "Qarorni bekor qilish", undoTitle: "Qaror bekor qilinsinmi?",
    undoBody: "«{v}» qarori bekor qilinadi va vazifa yana AI xulosasi bo'yicha hisoblanadi — ya'ni ulushini yo'qotadi. Kun bahosi qayta hisoblanadi va yangilangan hisobot lider bilan brigadirga qayta yuboriladi. Lider yangi sabab bilan qaytadan norozilik bildira oladi.",
    undone: "Qaror bekor qilindi",
    sent: "Norozilik yuborildi", decided: "Qaror saqlandi",
    voided: "Kun vaqtida yuborilmagan",
    excluded: "Bu kun natijalarga kirmaydi",
    excludedNote: "Administrator bu kunni hisobdan chiqargan — u o'rtacha natijaga na ortiqcha, na kamchilik bo'lib qo'shiladi. Quyidagi baho faqat kun nimaga teng bo'lganini ko'rsatadi.",
    cutoff: "Bu lider natijalarga kirmaydi",
    cutoffNote: "{d} dan boshlab bu liderning kunlari o'rtacha natijaga umuman kirmaydi — na ortiqcha, na kamchilik. Quyidagi baho faqat kun nimaga teng bo'lganini ko'rsatadi.",
    voidedNote: "Bu kun belgilangan vaqtdan tashqarida yuborilgani uchun 0% bilan hisoblanadi. Quyidagi baho faqat dalil tekshiruvini ko'rsatadi.",
    notAuto: "Bu kun avtomatik tekshiruvga kirmaydi",
    notAutoNote: "Avtomatik tekshiruv {date} dan boshlab va faqat 1-smena uchun ishlaydi. Bu yerdagi belgilar faqat ma'lumot uchun.",
    nf: "Hisobot topilmadi", nfBody: "Bu hisobot o'chirilgan yoki boshqa kunga ko'chirilgan bo'lishi mumkin.",
    toLeaders: "Lider nazoratiga o'tish", failed: "Yuklab bo'lmadi",
    photoFailed: "Rasm yuklanmadi", retry: "Qayta urinish",
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    title: "Кун ҳисоботи", back: "Орқага",
    leader: "Лидер", unit: "Бўлим", date: "Сана", shift: "Смена",
    filed: "Юборилган", source: "Манба", srcBot: "Бот", srcSheet: "Форма",
    verified: "Тасдиқланган баҳо", submitted: "Топширилган",
    ofTasks: "{n} та вазифадан", checkedN: "{n} та текширилди",
    rejectedN: "{n} та ўтмади", errorN: "{n} та хатолик", pendingN: "{n} та текширилмоқда",
    checking: "Текширилмоқда", chkNote: "{done}/{total} вазифа текширилди — баҳо ўзгариши мумкин.",
    stVerified: "Тасдиқланди", stRejected: "Қабул қилинмади", stDisputed: "Норозилик кўриб чиқилмоқда",
    stError: "Текшириб бўлмади", stChecking: "Навбатда",
    gRejected: "Қабул қилинмаган", gDisputed: "Норозилик билдирилган",
    gError: "Техник хатолик", gChecking: "Текширилмоқда", gVerified: "Тасдиқланган",
    gNone: "Текширилмаган",
    answerYes: "Бажарилди", answerNo: "Бажарилмади", noAnswer: "Жавоб берилмаган",
    reason: "Сабаб", weight: "Улуш", photos: "Далил расмлари",
    shotInApp: "иловада олинган", shotLate: "кеч", shotDeferred: "кейин юборилган",
    aiVerdict: "AI хулосаси", window: "Рухсат этилган вақт", onPhoto: "Расмда",
    needDate: "Керакли сана",
    errNote: "Бу расмни юклаб бўлмади. Бу техник носозлик — баҳо пасайтирилмади.",
    adminRuled: "Админ қарори: {v}", ruledDone: "бажарилган", ruledNot: "бажарилмаган",
    dispute: "Норозилик билдириш", disputeTitle: "AI қарорига норозилик",
    disputeIntro: "Нима учун бу вазифа нотўғри рад этилган? Изоҳингизни бригадирингиз ўқийди: у рад этади ёки админларга юборади, ва балл админлар қароридан кейин қайтади.",
    disputeReason: "Сабаб", disputePh: "Масалан: расмда соат кўриниб турибди, лекин AI ўқий олмаган",
    disputeSend: "Юбориш", cancel: "Бекор қилиш",
    dispSupervisor: "Норозилик юборилди — бригадир кўриб чиқмоқда",
    dispAdmin: "Бригадир админларга юборди — админ қарорини кутмоқда",
    dispApproved: "Норозилик қабул қилинди", dispRejected: "Норозилик рад этилди",
    dispCancelled: "Норозилик бўйича қарор бекор қилинди",
    dispBy: "Юборган: {who}", dispDecided: "Ҳал қилди: {who}",
    dispUndoneBy: "Бекор қилди: {who}",
    noteLead: "Лидер изоҳи", noteLeadSup: "Бригадир изоҳи (лидер номидан)",
    noteSup: "Бригадир изоҳи", noteAdm: "Админ изоҳи",
    supUplifted: "админларга юборилди", supRejected: "рад этди",
    uplift: "Админларга юбориш", upliftTitle: "Норозиликни админларга юбориш",
    upliftIntro: "Нега бу вазифага балл берилиши керак? Админлар лидер изоҳи билан бирга шуни ўқиб қарор қилади.",
    upliftPh: "Изоҳингизни ёзинг…", noteReq: "Изоҳ ёзинг.",
    okUplift: "Админларга юборилди",
    approve: "Қабул қилиш", refuse: "Рад этиш",
    undo: "Қарорни бекор қилиш", undoTitle: "Қарор бекор қилинсинми?",
    undoBody: "«{v}» қарори бекор қилинади ва вазифа яна AI хулосаси бўйича ҳисобланади — яъни улушини йўқотади. Кун баҳоси қайта ҳисобланади ва янгиланган ҳисобот лидер билан бригадирга қайта юборилади. Лидер янги сабаб билан қайтадан норозилик билдира олади.",
    undone: "Қарор бекор қилинди",
    sent: "Норозилик юборилди", decided: "Қарор сақланди",
    voided: "Кун вақтида юборилмаган",
    excluded: "Бу кун натижаларга кирмайди",
    excludedNote: "Администратор бу кунни ҳисобдан чиқарган — у ўртача натижага на ортиқча, на камчилик бўлиб қўшилади. Қуйидаги баҳо фақат кун нимага тенг бўлганини кўрсатади.",
    cutoff: "Бу лидер натижаларга кирмайди",
    cutoffNote: "{d} дан бошлаб бу лидернинг кунлари ўртача натижага умуман кирмайди — на ортиқча, на камчилик. Қуйидаги баҳо фақат кун нимага тенг бўлганини кўрсатади.",
    voidedNote: "Бу кун белгиланган вақтдан ташқарида юборилгани учун 0% билан ҳисобланади. Қуйидаги баҳо фақат далил текширувини кўрсатади.",
    notAuto: "Бу кун автоматик текширувга кирмайди",
    notAutoNote: "Автоматик текширув {date} дан бошлаб ва фақат 1-смена учун ишлайди. Бу ердаги белгилар фақат маълумот учун.",
    nf: "Ҳисобот топилмади", nfBody: "Бу ҳисобот ўчирилган ёки бошқа кунга кўчирилган бўлиши мумкин.",
    toLeaders: "Лидер назоратига ўтиш", failed: "Юклаб бўлмади",
    photoFailed: "Расм юкланмади", retry: "Қайта уриниш",
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    title: "Отчёт за день", back: "Назад",
    leader: "Лидер", unit: "Бригада", date: "Дата", shift: "Смена",
    filed: "Отправлено", source: "Источник", srcBot: "Бот", srcSheet: "Форма",
    verified: "Подтверждённая оценка", submitted: "Сдано",
    ofTasks: "из {n} задач", checkedN: "проверено: {n}",
    rejectedN: "не принято: {n}", errorN: "ошибок: {n}", pendingN: "в проверке: {n}",
    checking: "Идёт проверка", chkNote: "Проверено {done} из {total} задач — оценка может измениться.",
    stVerified: "Принято", stRejected: "Не принято", stDisputed: "Возражение на рассмотрении",
    stError: "Не удалось проверить", stChecking: "В очереди",
    gRejected: "Не принято", gDisputed: "С возражением",
    gError: "Техническая ошибка", gChecking: "В проверке", gVerified: "Принято",
    gNone: "Без проверки",
    answerYes: "Выполнено", answerNo: "Не выполнено", noAnswer: "Нет ответа",
    reason: "Причина", weight: "Вес", photos: "Фото-подтверждения",
    shotInApp: "снято в приложении", shotLate: "поздно", shotDeferred: "отправлено позже",
    aiVerdict: "Заключение ИИ", window: "Допустимое время", onPhoto: "На фото",
    needDate: "Нужная дата",
    errNote: "Это фото не удалось загрузить. Это техническая ошибка — оценка не снижена.",
    adminRuled: "Решение админа: {v}", ruledDone: "выполнено", ruledNot: "не выполнено",
    dispute: "Возразить", disputeTitle: "Возражение на решение ИИ",
    disputeIntro: "Почему эта задача отклонена неверно? Ваш комментарий прочитает бригадир: он отклонит возражение или передаст его администраторам, и балл вернётся только по их решению.",
    disputeReason: "Причина", disputePh: "Например: часы на фото видны, но ИИ их не прочитал",
    disputeSend: "Отправить", cancel: "Отмена",
    dispSupervisor: "Возражение отправлено — смотрит бригадир",
    dispAdmin: "Бригадир передал администраторам — ждёт решения",
    dispApproved: "Возражение принято", dispRejected: "Возражение отклонено",
    dispCancelled: "Решение по возражению отменено",
    dispBy: "Отправил(а): {who}", dispDecided: "Решил(а): {who}",
    dispUndoneBy: "Отменил(а): {who}",
    noteLead: "Комментарий лидера", noteLeadSup: "Комментарий бригадира (за лидера)",
    noteSup: "Комментарий бригадира", noteAdm: "Комментарий администратора",
    supUplifted: "передал администраторам", supRejected: "отклонил",
    uplift: "Передать администраторам", upliftTitle: "Передать возражение администраторам",
    upliftIntro: "Почему за эту задачу нужно начислить балл? Администраторы прочитают ваш комментарий вместе с комментарием лидера.",
    upliftPh: "Напишите комментарий…", noteReq: "Напишите комментарий.",
    okUplift: "Передано администраторам",
    approve: "Принять", refuse: "Отклонить",
    undo: "Отменить решение", undoTitle: "Отменить решение?",
    undoBody: "Решение «{v}» будет отменено, и задача снова будет считаться по заключению ИИ — то есть потеряет свой вес. Оценка дня пересчитается, а обновлённый отчёт уйдёт лидеру и бригадиру заново. Лидер сможет возразить снова с другой причиной.",
    undone: "Решение отменено",
    sent: "Возражение отправлено", decided: "Решение сохранено",
    voided: "День сдан вне окна",
    excluded: "Этот день не входит в результаты",
    excludedNote: "Администратор исключил этот день — он не влияет на средний результат ни в плюс, ни в минус. Оценка ниже показывает только то, чего день стоил.",
    cutoff: "Этот лидер не входит в результаты",
    cutoffNote: "С {d} дни этого лидера не входят в средний результат — ни в плюс, ни в минус. Оценка ниже показывает только то, чего день стоил.",
    voidedNote: "Этот день считается как 0%, потому что отчёт сдан вне установленного окна. Оценка ниже показывает только результат проверки фото.",
    notAuto: "Этот день не входит в автоматическую проверку",
    notAutoNote: "Автоматическая проверка работает с {date} и только для 1-й смены. Отметки здесь — справочные.",
    nf: "Отчёт не найден", nfBody: "Возможно, он удалён или перенесён на другой день.",
    toLeaders: "К мониторингу лидеров", failed: "Не удалось загрузить",
    photoFailed: "Фото не загрузилось", retry: "Повторить",
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не читается",
  },
  en: {
    title: "Day report", back: "Back",
    leader: "Leader", unit: "Unit", date: "Date", shift: "Shift",
    filed: "Filed", source: "Source", srcBot: "Bot", srcSheet: "Form",
    verified: "Verified score", submitted: "Submitted",
    ofTasks: "of {n} tasks", checkedN: "{n} checked",
    rejectedN: "{n} not accepted", errorN: "{n} errors", pendingN: "{n} in review",
    checking: "Verification running", chkNote: "{done} of {total} tasks checked — the score may still change.",
    stVerified: "Accepted", stRejected: "Not accepted", stDisputed: "Objection under review",
    stError: "Could not be checked", stChecking: "Queued",
    gRejected: "Not accepted", gDisputed: "Under objection",
    gError: "Technical error", gChecking: "In review", gVerified: "Accepted",
    gNone: "Not checked",
    answerYes: "Done", answerNo: "Not done", noAnswer: "No answer",
    reason: "Reason", weight: "Weight", photos: "Proof photos",
    shotInApp: "taken in the app", shotLate: "late", shotDeferred: "sent later",
    aiVerdict: "AI verdict", window: "Allowed window", onPhoto: "On the photo",
    needDate: "Required date",
    errNote: "This photo could not be fetched. That is a technical failure — nothing was deducted.",
    adminRuled: "Admin ruling: {v}", ruledDone: "done", ruledNot: "not done",
    dispute: "Object", disputeTitle: "Object to the AI ruling",
    disputeIntro: "Why was this task rejected wrongly? Your brigadir reads your note first — they refuse it or pass it to the admins, and the point comes back only on an admin's decision.",
    disputeReason: "Reason", disputePh: "e.g. the clock is visible on the photo but the AI misread it",
    disputeSend: "Send", cancel: "Cancel",
    dispSupervisor: "Objection sent — with the brigadir",
    dispAdmin: "Passed to the admins — awaiting a decision",
    dispApproved: "Objection upheld", dispRejected: "Objection refused",
    dispCancelled: "The ruling on the objection was undone",
    dispBy: "Filed by: {who}", dispDecided: "Decided by: {who}",
    dispUndoneBy: "Undone by: {who}",
    noteLead: "The leader's note", noteLeadSup: "The brigadir's note (for the leader)",
    noteSup: "The brigadir's case", noteAdm: "The admin's note",
    supUplifted: "passed it up", supRejected: "refused it",
    uplift: "Pass to the admins", upliftTitle: "Pass the objection to the admins",
    upliftIntro: "Why should this task be pointed? The admins read your comment beside the leader's and decide.",
    upliftPh: "Write your comment…", noteReq: "Write a comment.",
    okUplift: "Passed to the admins",
    approve: "Uphold", refuse: "Refuse",
    undo: "Undo the ruling", undoTitle: "Undo this ruling?",
    undoBody: "The «{v}» ruling is taken back and the task counts by the AI verdict again — so it loses its weight. The day is re-scored and the corrected report is re-sent to the leader and the supervisor. The leader can object again with a different account.",
    undone: "The ruling was undone",
    sent: "Objection sent", decided: "Decision saved",
    voided: "Filed outside the window",
    excluded: "This day is out of the results",
    excludedNote: "An admin excluded this day — it counts neither for nor against the average. The score below only says what the day was worth.",
    cutoff: "This leader is out of the results",
    cutoffNote: "From {d} this leader's days do not enter the average at all — neither a plus nor a minus. The score below only says what the day was worth.",
    voidedNote: "This day counts as 0% because the checklist was filed outside its window. The score below reflects the photo check only.",
    notAuto: "This day is not in automatic verification",
    notAutoNote: "Automatic verification runs from {date} and for shift 1 only. The marks here are informational.",
    nf: "Report not found", nfBody: "It may have been deleted or moved to another day.",
    toLeaders: "Go to leader monitoring", failed: "Could not load",
    photoFailed: "Photo failed to load", retry: "Retry",
    f_date_mismatch: "Date does not match", f_no_date: "No date on the photo",
    f_off_topic: "Photo is not about this task", f_not_proven: "Does not show the work done",
    f_unreadable: "Photo unreadable",
  },
};

const C_BAD = "#ef4444", C_MID = "#eab308", C_GOOD = "#22c55e";
const scoreColor = (v) => (v < 50 ? C_BAD : v < 85 ? C_MID : C_GOOD);
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fill = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const pick = (o, lang) => o?.[lang] || o?.ru || o?.en || "";

function StateChip({ state, T, size = "sm" }) {
  if (!state) return null;
  const { color, Icon, key } = state;
  const label = T[`st${key[0].toUpperCase()}${key.slice(1)}`] || key;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-md flex-shrink-0
      ${size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}
      style={{ background: hexA(color, 0.14), color, border: `1px solid ${hexA(color, 0.3)}` }}>
      <Icon size={size === "sm" ? 11 : 13} /> {label}
    </span>
  );
}

/** HH:MM:SS in Tashkent out of the ISO instant the server recorded. Fixed
 *  +05:00, like everywhere else here: the reader is on the factory floor, and
 *  the browser's own zone is whatever the phone was last set to — which on this
 *  particular feature is precisely the thing not to trust. */
function clockOf(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}


/* ── one task ──────────────────────────────────────────────────────────────
 * A rejected card opens with everything visible; a passed one collapses to a
 * single line. The evidence for a verdict nobody is contesting is noise on a
 * phone, and burying the three that failed under ten that did not is how the
 * page stops answering its own question. */
function TaskCard({ t, T, lang, uid, open, onToggle, onPhoto, canDispute, onDispute,
                    canDecide, onUndo }) {
  // Both open stages count as live: neither has produced a ruling, so neither
  // may be objected to a second time.
  const dOpen = disputeOpen(t.dispute);
  const st = taskState(t);
  const bad = st?.key === "rejected";
  const name = pick(t.name, lang);
  // `cam` rides positionally with `media` (both built in slot order — see
  // services/leader_bot.captures_of), so a shot taken in the app carries the
  // instant the SERVER recorded and the two marks that instant can earn.
  const photos = useMemo(
    () => (t.media?.length
      ? t.media.map((id, i) => ({ kind: "bot", id, cam: t.cam?.[i] || null }))
      : (t.photo || "").split(",").map((s) => s.trim())
        .filter((s) => s.includes("http")).map((url) => ({ kind: "sheet", url }))),
    [t.media, t.photo, t.cam],
  );
  const shotInApp = photos.some((p) => p.cam);
  const rev = t.review;
  const dateFlagged = (rev?.flags || []).some((f) => f === "no_date" || f === "date_mismatch");

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)",
               border: `1px solid ${bad ? hexA(C_BAD, 0.35) : "var(--border)"}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left">
        <span className="text-[11px] font-bold tabular-nums flex-shrink-0 mt-0.5"
          style={{ color: "var(--text-4)" }}>№{t.id}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold leading-snug"
            style={{ color: "var(--text-1)" }}>{name}</span>
          <span className="flex items-center gap-1.5 flex-wrap mt-1">
            <StateChip state={st} T={T} />
            <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
              {t.answered === false ? T.noAnswer : t.done ? T.answerYes : T.answerNo}
              {t.weight ? ` · ${T.weight} ${t.weight}%` : ""}
            </span>
          </span>
        </span>
        <ChevronDown size={15} className="flex-shrink-0 mt-0.5 transition-transform"
          style={{ color: "var(--text-4)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          {!t.done && t.reason && (
            <p className="text-[12px] leading-snug pt-2.5" style={{ color: "var(--text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--text-4)" }}>{T.reason}: </span>
              {t.reason}
            </p>
          )}

          {photos.length > 0 && (
            <div className="pt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-4)" }}>
                <Camera size={11} className="inline mr-1" />{T.photos} ({photos.length})
              </p>
              {/* Where the evidence came from. A proof SHOT in the app carries a
                  time the leader could not author, and that is the single most
                  useful thing a reviewer can know about it before opening it —
                  so it is stated once for the set, not repeated per thumbnail. */}
              {shotInApp && (
                <p className="text-[10px] mb-1.5 flex items-center gap-1 flex-wrap"
                  style={{ color: "var(--text-3)" }}>
                  <span className="rounded px-1.5 py-px font-semibold"
                    style={{ background: "rgba(200,151,63,0.14)", color: "var(--brand)",
                             border: "1px solid rgba(200,151,63,0.35)" }}>
                    📷 {T.shotInApp}
                  </span>
                  {photos.filter((p) => p.cam).map((p, i) => (
                    <span key={i} className="tabular-nums">
                      {clockOf(p.cam.at)}
                      {p.cam.late ? ` ⚠︎${T.shotLate}` : ""}
                      {p.cam.deferred ? ` ⇡${T.shotDeferred}` : ""}
                    </span>
                  ))}
                </p>
              )}
              {/* Thumbnails, not full-size: thirteen tasks of proof photos at
                  full width is megabytes down a phone connection, and the
                  photo is an index into the zoom view, not the evidence. */}
              <div className="flex gap-1.5 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="w-16 h-16 flex-shrink-0">
                    {p.kind === "bot"
                      ? <BotPhoto id={p.id} uid={uid} T={T} thumb className="" onClick={onPhoto} />
                      : <ReportPhoto src={p.url} uid={uid} T={T} thumb className="" onClick={onPhoto} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rev && (rev.status === "ok" || rev.status === "flagged") && (
            <div className="rounded-lg px-2.5 py-2"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                style={{ color: "var(--text-4)" }}>
                <Sparkles size={11} />{T.aiVerdict}
              </p>
              {(rev.flags || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {rev.flags.map((f) => (
                    <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
                      {T[`f_${f}`] || f}
                    </span>
                  ))}
                </div>
              )}
              {pick(rev.reason, lang) && (
                <p className="text-[11px] leading-snug mt-1.5" style={{ color: "var(--text-2)" }}>
                  {pick(rev.reason, lang)}
                </p>
              )}
              {/* The rule, next to the reading that broke it. A leader flagged
                  for a window nobody stated is the complaint this creates. */}
              {dateFlagged && (
                <>
                  {pick(rev.dateReason, lang) && (
                    <p className="text-[11px] leading-snug mt-1.5" style={{ color: "var(--text-2)" }}>
                      {pick(rev.dateReason, lang)}
                    </p>
                  )}
                  {/* Hours when the hours were the rule, the required DAY when
                      the task is judged by the day alone — the leader must be
                      able to read which rule they were measured by. */}
                  <p className="text-[10px] tabular-nums mt-1 flex items-center gap-1 flex-wrap"
                    style={{ color: "var(--text-4)" }}>
                    {rev.timeCheck === false
                      ? <><CalendarCheck size={10} />{T.needDate}: {rev.expected}</>
                      : <><Clock size={10} />{T.window}: {rev.expected}</>}
                    {rev.imageDate && <> · {T.onPhoto}: {rev.imageDate}</>}
                  </p>
                </>
              )}
            </div>
          )}

          {rev?.status === "error" && (
            <p className="text-[11px] leading-snug rounded-lg px-2.5 py-2"
              style={{ background: hexA(C_MID, 0.1), color: "var(--text-2)" }}>
              {T.errNote}
            </p>
          )}

          {t.admin_done != null && (
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {fill(T.adminRuled, { v: t.admin_done ? T.ruledDone : T.ruledNot })}
              {t.admin_by ? ` — ${t.admin_by}` : ""}
            </p>
          )}

          {/* A CANCELLED ruling is deliberately colourless: the objection no
              longer says anything about the score, and painting it red would
              read as «refused» — the one outcome it is not. */}
          {t.dispute && (
            <div className="rounded-lg px-2.5 py-2 text-[11px] leading-snug space-y-1.5"
              style={{ ...(t.dispute.status === "cancelled"
                ? { background: "var(--bg-inner)", border: "1px solid var(--border)" }
                : { background: hexA(dOpen ? C_MID
                  : t.dispute.status === "approved" ? C_GOOD : C_BAD, 0.1) }),
                       color: "var(--text-2)" }}>
              {/* WHERE it stands — the two open stages say which desk it is on,
                  because "somebody is looking at it" and "it reached the only
                  people who can give the point back" are different facts and
                  the reader is waiting on one of them. */}
              <div className="font-semibold">
                {t.dispute.status === "supervisor" ? T.dispSupervisor
                  : t.dispute.status === "admin" ? T.dispAdmin
                    : t.dispute.status === "approved" ? T.dispApproved
                      : t.dispute.status === "cancelled" ? T.dispCancelled
                        : T.dispRejected}
              </div>
              {/* Every note the chain has collected, in the order it collected
                  them: what was claimed, what was argued, what was ruled. The
                  middle one is the whole reason this chain replaced the old
                  flow, so it is never the one that gets dropped. */}
              <div>
                “{t.dispute.reason}”
                <span style={{ color: "var(--text-4)" }}>
                  {" · "}
                  {t.dispute.byRole === "leader" || !t.dispute.byRole
                    ? T.noteLead : T.noteLeadSup}
                  {`: ${t.dispute.by || "—"}`}
                </span>
              </div>
              {t.dispute.sup && (
                <div>
                  {t.dispute.sup.note ? `“${t.dispute.sup.note}”` : null}
                  <span style={{ color: "var(--text-4)" }}>
                    {t.dispute.sup.note ? " · " : ""}
                    {`${T.noteSup}: ${t.dispute.sup.by || "—"} — `}
                    {t.dispute.sup.action === "uplifted" ? T.supUplifted : T.supRejected}
                  </span>
                </div>
              )}
              {(t.dispute.decidedBy || t.dispute.note) && (
                <div>
                  {t.dispute.note ? `“${t.dispute.note}”` : null}
                  <span style={{ color: "var(--text-4)" }}>
                    {t.dispute.note ? " · " : ""}
                    {fill(t.dispute.status === "cancelled" ? T.dispUndoneBy : T.dispDecided,
                          { who: t.dispute.decidedBy || "—" })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* The way back out of a ruling, sitting under the ruling it takes
              back — an undo detached from what it undoes is a button nobody
              can check before pressing. Same authority as deciding, and only
              on a ruling still in force: a cancelled row has nothing to undo. */}
          {canDecide && ["approved", "rejected"].includes(t.dispute?.status) && (
            <Button size="md" variant="secondary" tint onClick={onUndo} className="w-full">
              <RotateCcw size={13} /> {T.undo}
            </Button>
          )}

          {/* Never show a problem without a path to act on it. The LEADER who
              receives the DM is the person the verdict judged, so the door is
              theirs first — and it stays open to their brigadir, who is the
              only route for a leader whose name resolves to no profile. */}
          {canDispute && t.ai_rejected && !dOpen && (
            <Button size="md" variant="secondary" tint onClick={onDispute}
              className="w-full">
              <MessageSquareWarning size={13} /> {T.dispute}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeaderDayReport() {
  const { uid } = useParams();
  const nav = useNavigate();
  const { lang } = useLang();
  const qc = useQueryClient();
  const T = T_ALL[lang] || T_ALL.ru;
  const { show, node: toastNode } = useToast({ position: "bottom" });

  const [openIds, setOpenIds] = useState(null);   // null = "use the default"
  const [zoom, setZoom] = useState("");
  const [disputeTask, setDisputeTask] = useState(null);
  const [reason, setReason] = useState("");
  // The task whose objection is being passed UP, and the brigadir's case for
  // it. Uplift is the one ruling that collects text, so it is a form; refuse
  // and uphold are one tap each.
  const [upliftTask, setUpliftTask] = useState(null);
  const [supNote, setSupNote] = useState("");
  const [supErr, setSupErr] = useState(null);
  // The task whose SETTLED dispute is being taken back, and the failure that
  // has to stay on the dialog rather than vanish with it.
  const [undoTask, setUndoTask] = useState(null);
  const [undoErr, setUndoErr] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderDayReport", uid],
    queryFn: () => api.get(`/api/leaders/report/${encodeURIComponent(uid)}`).then((r) => r.data),
    retry: false,
  });

  const fileDispute = useMutation({
    mutationFn: (body) =>
      api.post(`/api/leaders/report/${encodeURIComponent(uid)}/dispute`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaderDayReport", uid] });
      // The «Norozliklar» queue and the /leaders tab badge both read this key —
      // a filing that does not invalidate it leaves the queue one objection
      // behind and the badge under-counting whoever now has to rule.
      qc.invalidateQueries({ queryKey: ["leader-disputes"] });
      setDisputeTask(null); setReason("");
      show(T.sent, "success");
    },
    onError: (e) => show(e?.response?.data?.detail || T.failed, "error"),
  });

  // ONE endpoint for both stages — which ruling it applies is a property of the
  // row, so the page never names the stage and cannot name the wrong one.
  const decide = useMutation({
    mutationFn: ({ id, action, note }) =>
      api.post(`/api/leaders/disputes/${id}/decide`,
               { action, note: note || "" }).then((r) => r.data),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["leaderDayReport", uid] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      qc.invalidateQueries({ queryKey: ["leader-disputes"] });
      setUpliftTask(null); setSupNote(""); setSupErr(null);
      show(v.action === "uplifted" ? T.okUplift : T.decided, "success");
    },
    // An uplift failure has to stay ON the form: the case the brigadir typed is
    // in it, and a toast that closes the modal throws their words away.
    onError: (e, v) => {
      const msg = e?.response?.data?.detail || T.failed;
      if (v.action === "uplifted") setSupErr(msg); else show(msg, "error");
    },
  });

  // Taking a ruling back. Deciding is one tap and an admin's own filing IS the
  // approval, so the wrong outcome is one mis-tap away; without this the only
  // way back was the AI triage tab, which cleared the verdict and left the
  // «objection upheld» box standing over a task that had lost its weight again.
  const undoRuling = useMutation({
    mutationFn: ({ id }) => api.post(`/api/leaders/disputes/${id}/undo`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaderDayReport", uid] });
      // The register and the leaderboard print this score too — and the
      // objections queue still shows an Undo button for a ruling that is gone.
      qc.invalidateQueries({ queryKey: ["leaders"] });
      qc.invalidateQueries({ queryKey: ["leader-disputes"] });
      setUndoTask(null); setUndoErr(null);
      show(T.undone, "success");
    },
    onError: (e) => setUndoErr(e?.response?.data?.detail || T.failed),
  });

  // Failures open, passes closed — the default the page exists for. Held as
  // null until the user touches something so a refetch never slams open cards
  // shut under the reader's finger.
  const groups = useMemo(() => {
    const by = {};
    for (const t of data?.tasks || []) (by[groupOf(t)] ||= []).push(t);
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.id - b.id);
    return by;
  }, [data]);

  const isOpen = (t) => (openIds ? openIds.has(t.id)
    : ["rejected", "disputed"].includes(groupOf(t)));
  const toggle = (t) => setOpenIds((prev) => {
    const next = new Set(prev ?? (data?.tasks || [])
      .filter((x) => ["rejected", "disputed"].includes(groupOf(x))).map((x) => x.id));
    next.has(t.id) ? next.delete(t.id) : next.add(t.id);
    return next;
  });

  if (isLoading) {
    return (
      <Layout title={T.title}>
        <div className="space-y-3">
          <SkeletonBlock className="w-full" style={{ height: 92 }} />
          <SkeletonBlock className="w-full" style={{ height: 132 }} />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="w-full" style={{ height: 64 }} />
          ))}
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title={T.title}>
        <ErrorScreen inline tone="neutral" code="404" title={T.nf} message={T.nfBody}
          action={{ label: T.toLeaders, onClick: () => nav("/leaders") }}
          secondary={{ label: T.back, onClick: () => nav(-1) }} />
      </Layout>
    );
  }

  const c = data.counts;
  const moved = data.score !== data.rawScore;
  const running = c.pending > 0;
  // Grey once the day is out of the results, exactly as the register greys
  // its badge: the number is still what the day was worth, but it is no
  // longer a verdict on anybody, and the traffic light is for verdicts.
  const tone = data.voided || data.excluded ? "var(--text-4)" : scoreColor(data.score);

  return (
    <Layout title={T.title}>
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        {/* ── who and when ──────────────────────────────────────────────── */}
        <div className="rounded-2xl px-4 py-3.5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <button type="button" onClick={() => nav(-1)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold mb-2"
            style={{ color: "var(--text-4)" }}>
            <ArrowLeft size={13} /> {T.back}
          </button>
          <h1 className="text-lg font-bold leading-tight flex items-center gap-2"
            style={{ color: "var(--text-1)" }}>
            <User size={18} style={{ color: "var(--brand)" }} />{data.leader || "—"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]"
            style={{ color: "var(--text-3)" }}>
            <span className="inline-flex items-center gap-1">
              <Users size={12} style={{ color: "var(--text-4)" }} />{data.supervisor || "—"}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays size={12} style={{ color: "var(--text-4)" }} />{data.date}
            </span>
            {data.shift != null && (
              <span className="px-1.5 py-0.5 rounded font-semibold"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)",
                         border: "1px solid var(--border)" }}>
                {data.shift}-{T.shift.toLowerCase()}
              </span>
            )}
            <span style={{ color: "var(--text-4)" }}>
              {T.source}: {data.source === "bot" ? T.srcBot : T.srcSheet}
            </span>
          </div>
        </div>

        {/* ── the number, and where it came from ────────────────────────── */}
        <div className="rounded-2xl px-4 py-4"
          style={{ background: "var(--bg-card)", border: `1px solid ${hexA(tone, 0.3)}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-4)" }}>{T.verified}</p>
          <div className="flex items-end gap-2.5 mt-1">
            <span className="text-4xl font-extrabold tabular-nums leading-none"
              style={{ color: tone }}>{data.score}%</span>
            {moved && (
              <span className="text-[12px] pb-1" style={{ color: "var(--text-4)" }}>
                {T.submitted}: <s>{data.rawScore}%</s>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.rejected > 0 && <Pill color={C_BAD} text={fill(T.rejectedN, { n: c.rejected })} />}
            {c.pending > 0 && <Pill color={VERIFY.checking.color} text={fill(T.pendingN, { n: c.pending })} />}
            {c.errors > 0 && <Pill color={C_MID} text={fill(T.errorN, { n: c.errors })} />}
            {c.checked > 0 && <Pill color={C_GOOD} text={fill(T.checkedN, { n: c.checked })} />}
            <Pill color="var(--text-4)" text={fill(T.ofTasks, { n: c.total })} plain />
          </div>

          {/* An unfinished check must never look like a final answer. */}
          {running && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: hexA(C_MID, 0.1), color: "var(--text-2)" }}>
              <strong>{T.checking}.</strong>{" "}
              {fill(T.chkNote, { done: c.checked, total: c.total })}
            </p>
          )}
          {data.excluded && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
              {/* Two decisions, one banner and one arithmetic — but a reader
                  has to be able to tell "an admin excluded this night" from
                  "you stopped counting on the 21st", because only the second
                  says anything about tomorrow. */}
              <strong>{data.excluded.cutoff ? T.cutoff : T.excluded}.</strong>{" "}
              {data.excluded.cutoff
                ? fill(T.cutoffNote, { d: data.excluded.from })
                : T.excludedNote}
              {data.excluded.reason ? <> <span style={{ color: "var(--text-3)" }}>
                «{data.excluded.reason}»</span></> : null}
              {data.excluded.by ? <> <span style={{ color: "var(--text-4)" }}>
                — {data.excluded.by}</span></> : null}
            </p>
          )}
          {data.voided && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: hexA(C_BAD, 0.1), color: "var(--text-2)" }}>
              <strong>{T.voided}.</strong> {T.voidedNote}
            </p>
          )}
          {!data.auto && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
              <strong>{T.notAuto}.</strong> {fill(T.notAutoNote, { date: data.autoFrom })}
            </p>
          )}
        </div>

        {/* ── the tasks, worst first ───────────────────────────────────── */}
        {GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => (
          <div key={g} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider px-1 pt-1"
              style={{ color: "var(--text-4)" }}>
              {T[`g${g[0].toUpperCase()}${g.slice(1)}`]} · {groups[g].length}
            </p>
            {groups[g].map((t) => (
              <div key={t.id}>
                <TaskCard t={t} T={T} lang={lang} uid={data.uid} open={isOpen(t)} onToggle={() => toggle(t)}
                  onPhoto={setZoom} canDispute={data.canDispute}
                  onDispute={() => { setDisputeTask(t); setReason(""); }}
                  canDecide={data.canDecide}
                  onUndo={() => { setUndoErr(null); setUndoTask(t); }} />
                {/* The two buttons THIS stage has — and only those. A brigadir
                    cannot restore the weight and an admin does not pass it on,
                    so the asymmetry is expressed by which buttons exist rather
                    than by a 403 after somebody has pressed one. `canAct` is
                    the server's per-row answer to «is it your turn». */}
                {t.dispute?.canAct && t.dispute.status === "supervisor" && (
                  <div className="flex gap-2 mt-1.5 px-1">
                    <Button size="md" variant="primary" tint className="flex-1"
                      onClick={() => { setSupNote(""); setSupErr(null); setUpliftTask(t); }}>
                      <ArrowUpCircle size={13} /> {T.uplift}
                    </Button>
                    <Button size="md" variant="danger" tint className="flex-1"
                      loading={decide.isPending}
                      onClick={() => decide.mutate({ id: t.dispute.id, action: "rejected" })}>
                      <XCircle size={13} /> {T.refuse}
                    </Button>
                  </div>
                )}
                {t.dispute?.canAct && t.dispute.status === "admin" && (
                  <div className="flex gap-2 mt-1.5 px-1">
                    <Button size="md" variant="success" tint className="flex-1"
                      loading={decide.isPending}
                      onClick={() => decide.mutate({ id: t.dispute.id, action: "approved" })}>
                      <CheckCircle2 size={13} /> {T.approve}
                    </Button>
                    <Button size="md" variant="danger" tint className="flex-1"
                      loading={decide.isPending}
                      onClick={() => decide.mutate({ id: t.dispute.id, action: "rejected" })}>
                      <XCircle size={13} /> {T.refuse}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <Lightbox src={zoom} onClose={() => setZoom("")} />

      <Modal open={!!disputeTask} onClose={() => setDisputeTask(null)}
        title={T.disputeTitle} subtitle={disputeTask ? pick(disputeTask.name, lang) : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisputeTask(null)}>{T.cancel}</Button>
            <Button variant="primary" loading={fileDispute.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => fileDispute.mutate({ task_id: disputeTask.id, reason: reason.trim() })}>
              {T.disputeSend}
            </Button>
          </>
        }>
        <p className="text-[12px] leading-snug mb-3" style={{ color: "var(--text-3)" }}>
          {T.disputeIntro}
        </p>
        <FormField label={T.disputeReason} required>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
            maxLength={1000} placeholder={T.disputePh} autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                     color: "var(--text-1)" }} />
        </FormField>
      </Modal>

      {/* Passing it up COLLECTS a required comment, so it is the Modal
          template — a form, not a confirm carrying a field it was never built
          to hold. The comment is the whole reason the admin stage can rule on
          more than a stranger's wording. */}
      <Modal open={!!upliftTask} onClose={() => { setUpliftTask(null); setSupErr(null); }}
        title={T.upliftTitle} subtitle={upliftTask ? pick(upliftTask.name, lang) : ""}
        footer={
          <>
            <Button variant="secondary"
              onClick={() => { setUpliftTask(null); setSupErr(null); }}>{T.cancel}</Button>
            <Button variant="primary" loading={decide.isPending}
              disabled={supNote.trim().length < 3}
              onClick={() => decide.mutate({
                id: upliftTask.dispute.id, action: "uplifted", note: supNote.trim(),
              })}>
              <ArrowUpCircle size={14} /> {T.uplift}
            </Button>
          </>
        }>
        {/* The leader's own words stay in front of the brigadir while they
            write their case: a reply typed without the claim on screen answers
            whatever the writer remembers of it. */}
        {upliftTask?.dispute?.reason && (
          <div className="rounded-lg px-3 py-2 mb-3 text-[12px] leading-snug"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            <span className="text-[11px] uppercase tracking-wide"
              style={{ color: "var(--text-4)" }}>{T.noteLead}</span>
            <br />“{upliftTask.dispute.reason}”
          </div>
        )}
        <FormField label={T.noteSup} required hint={T.upliftIntro} error={supErr || undefined}>
          <textarea value={supNote}
            onChange={(e) => { setSupNote(e.target.value); setSupErr(null); }}
            rows={4} maxLength={1000} placeholder={T.upliftPh} autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                     color: "var(--text-1)" }} />
        </FormField>
      </Modal>

      {/* Consequential enough to confirm: it takes points back off a leader
          and re-DMs the corrected report to two people. */}
      {undoTask && (
        <ConfirmDialog
          icon={<RotateCcw />}
          title={T.undoTitle}
          message={fill(T.undoBody, {
            v: undoTask.dispute?.status === "approved" ? T.dispApproved : T.dispRejected,
          })}
          confirmLabel={T.undo}
          cancelLabel={T.cancel}
          loading={undoRuling.isPending}
          error={undoErr}
          onCancel={() => { setUndoTask(null); setUndoErr(null); }}
          onConfirm={() => undoRuling.mutate({ id: undoTask.dispute.id })}
        />
      )}

      {toastNode}
    </Layout>
  );
}

function Pill({ color, text, plain = false }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-1 rounded-md"
      style={plain
        ? { color: "var(--text-4)", border: "1px solid var(--border)" }
        : { background: hexA(color.startsWith("#") ? color : "#94a3b8", 0.14), color }}>
      {text}
    </span>
  );
}
