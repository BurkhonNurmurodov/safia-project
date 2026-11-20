import { useLang } from "../../context/LangContext";

/* The words of «Bugun» — the leader's own day on a phone (the leader-phone
 * redesign, 2026-11-20) — in the platform's four languages. Everything the
 * checklist already says (states, «Topshirish», «Kechikkan isbot» …) stays in
 * checklistText.js, so a row here and the sheet it opens call a state by one
 * name; this module holds only what «Bugun» adds. */

export const BUGUN_T = {
  uz: {
    left: "qoldi", leftAria: "{n} ta vazifa qoldi",
    notScored: "Hali baholanmagan",
    nextT: "Keyingi vazifa",
    shoot: "Suratga olish", shootRoll: "Suratga olish · {k}/{n}",
    pick: "Rasm tanlash", pickMore: "Yana rasm qo'shish",
    later: "Keyinroq",
    missedT: "Vaqti o'tdi", lateLine: "Kechikkan isbot — {t} gacha",
    rejLine: "E'tiroz bildirish mumkin",
    systemT: "Tizim tekshiradi", closedT: "Yopilgan",
    inboxT: "Sizni kutmoqda",
    inConcerns: "Havotirlar", inConcernsSub: "ochiq",
    inObjections: "E'tirozlar", inObjectionsSub: "yangi xabar",
    inTasks: "Rahbariyat vazifalari", inTasksSub: "bajarilmagan",
    inKelish: "Ish grafigi", inKelishSub: "ertaga · belgilanmagan",
    shiftN: "{n}-smena",
    needPhotos: "kamida {n} ta rasm", photoTime: "rasm vaqti {w}",
    objLbl: "E'tirozingiz",
  },
  uz_cyrl: {
    left: "қолди", leftAria: "{n} та вазифа қолди",
    notScored: "Ҳали баҳоланмаган",
    nextT: "Кейинги вазифа",
    shoot: "Суратга олиш", shootRoll: "Суратга олиш · {k}/{n}",
    pick: "Расм танлаш", pickMore: "Яна расм қўшиш",
    later: "Кейинроқ",
    missedT: "Вақти ўтди", lateLine: "Кечиккан исбот — {t} гача",
    rejLine: "Эътироз билдириш мумкин",
    systemT: "Тизим текширади", closedT: "Ёпилган",
    inboxT: "Сизни кутмоқда",
    inConcerns: "Ҳавотирлар", inConcernsSub: "очиқ",
    inObjections: "Эътирозлар", inObjectionsSub: "янги хабар",
    inTasks: "Раҳбарият вазифалари", inTasksSub: "бажарилмаган",
    inKelish: "Иш графиги", inKelishSub: "эртага · белгиланмаган",
    shiftN: "{n}-смена",
    needPhotos: "камида {n} та расм", photoTime: "расм вақти {w}",
    objLbl: "Эътирозингиз",
  },
  ru: {
    left: "осталось", leftAria: "Осталось задач: {n}",
    notScored: "Ещё не оценено",
    nextT: "Следующая задача",
    shoot: "Сфотографировать", shootRoll: "Сфотографировать · {k}/{n}",
    pick: "Выбрать фото", pickMore: "Добавить ещё фото",
    later: "Позже",
    missedT: "Время вышло", lateLine: "Позднее подтверждение — до {t}",
    rejLine: "Можно возразить",
    systemT: "Проверяет система", closedT: "Закрытые",
    inboxT: "Ждут вас",
    inConcerns: "Хавотиры", inConcernsSub: "открытые",
    inObjections: "Возражения", inObjectionsSub: "новые сообщения",
    inTasks: "Задачи от руководства", inTasksSub: "не выполнены",
    inKelish: "График работы", inKelishSub: "завтра · не отмечены",
    shiftN: "{n}-я смена",
    needPhotos: "минимум {n} фото", photoTime: "время на фото {w}",
    objLbl: "Ваше возражение",
  },
  en: {
    left: "left", leftAria: "{n} tasks left",
    notScored: "Not scored yet",
    nextT: "Next task",
    shoot: "Take photos", shootRoll: "Take photos · {k}/{n}",
    pick: "Choose photos", pickMore: "Add more photos",
    later: "Later",
    missedT: "Missed", lateLine: "Late proof — until {t}",
    rejLine: "You can object",
    systemT: "Checked by the system", closedT: "Closed",
    inboxT: "Waiting on you",
    inConcerns: "Worker concerns", inConcernsSub: "open",
    inObjections: "Objections", inObjectionsSub: "new messages",
    inTasks: "Tasks from management", inTasksSub: "not done",
    inKelish: "Work schedule", inKelishSub: "tomorrow · not marked",
    shiftN: "Shift {n}",
    needPhotos: "at least {n} photos", photoTime: "photo time {w}",
    objLbl: "Your objection",
  },
};

export function useBugunT() {
  const { lang } = useLang();
  return BUGUN_T[lang] || BUGUN_T.ru;
}
