import { Sparkles, Clock, CalendarCheck, Settings2, XCircle } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { showReason } from "../../utils/leaderReason";
import { autoResultLines } from "../../utils/autoResult";
import { hexA, pick } from "./DayReportView";

/**
 * What judged a task, and what it said — the verdict an objection argues with.
 *
 * TWO judges, one block (2026-09-28). A proof photo is judged by the AI: its
 * flags, its own prose and the rule it measured the photo by (the window when
 * hours were the rule, the day when only the day was, the bare clock when only
 * the hour was). An AUTOMATIC task (#1, #8, #9) is judged by the platform
 * reading its own data at a fixed hour: the hour, why it went as it did, and —
 * where the check stored them — the numbers it was taken on. Both can now be
 * objected to through the same chain, so both are drawn by the same block:
 * the «Chek-list» tab, the objection chat and the new-objection page all read
 * this one, and none of them can describe one verdict two ways.
 *
 *   rev        — the AI verdict (`review` on the report / `verdict` on a card)
 *   autoReason — the `__auto__|HH:MM|code` sentinel of an automatic task
 *   autoFacts  — the check's stored facts at the hour (`utils/autoResult.js`)
 *   title      — overrides the AI heading (the chat says "why it was rejected")
 */

const C_BAD = "#ef4444";

const T_ALL = {
  uz: {
    ai: "AI xulosasi", auto: "Avtomatik tekshiruv",
    window: "Ruxsat etilgan vaqt", needDate: "Kerakli sana",
    needTime: "Ruxsat etilgan soat", onPhoto: "Rasmda",
    autoLine: "Tizim soat {time} da tekshirdi — {why}.",
    why: {
      ok: "hammasi joyida", no_plan: "bugunga reja kiritilmagan",
      no_staffing: "odamlar soni kiritilmagan", no_concern: "xavotir yozilmagan",
      under_target: "reja foizi yetmadi", no_sap_code: "yacheykada SAP kodi yo'q",
      started_late: "chek-list tekshiruvdan keyin boshlangan",
      not_checked: "tekshiruv o'tkazilmadi", no_data: "ma'lumot o'qilmadi",
    },
    f_date_mismatch: "Sana mos emas", f_no_date: "Rasmda sana yo'q",
    f_off_topic: "Rasm vazifaga mos emas", f_not_proven: "Bajarilgani ko'rinmayapti",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    ai: "AI хулосаси", auto: "Автоматик текширув",
    window: "Рухсат этилган вақт", needDate: "Керакли сана",
    needTime: "Рухсат этилган соат", onPhoto: "Расмда",
    autoLine: "Тизим соат {time} да текширди — {why}.",
    why: {
      ok: "ҳаммаси жойида", no_plan: "бугунга режа киритилмаган",
      no_staffing: "одамлар сони киритилмаган", no_concern: "хавотир ёзилмаган",
      under_target: "режа фоизи етмади", no_sap_code: "ячейкада SAP коди йўқ",
      started_late: "чек-лист текширувдан кейин бошланган",
      not_checked: "текширув ўтказилмади", no_data: "маълумот ўқилмади",
    },
    f_date_mismatch: "Сана мос эмас", f_no_date: "Расмда сана йўқ",
    f_off_topic: "Расм вазифага мос эмас", f_not_proven: "Бажарилгани кўринмаяпти",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    ai: "Заключение ИИ", auto: "Автоматическая проверка",
    window: "Допустимое время", needDate: "Нужная дата",
    needTime: "Допустимый час съёмки", onPhoto: "На фото",
    autoLine: "Система проверила в {time} — {why}.",
    why: {
      ok: "всё на месте", no_plan: "план на сегодня не внесён",
      no_staffing: "количество людей не внесено", no_concern: "обеспокоенность не записана",
      under_target: "процент плана не достигнут", no_sap_code: "у ячейки нет кода SAP",
      started_late: "чек-лист начат после проверки",
      not_checked: "проверка не проводилась", no_data: "данные не прочитаны",
    },
    f_date_mismatch: "Дата не совпадает", f_no_date: "На фото нет даты",
    f_off_topic: "Фото не по задаче", f_not_proven: "Выполнение не видно",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    ai: "AI verdict", auto: "Automatic check",
    window: "Allowed window", needDate: "Required date",
    needTime: "Allowed clock time", onPhoto: "On the photo",
    autoLine: "The platform checked at {time} — {why}.",
    why: {
      ok: "everything in place", no_plan: "no plan entered for today",
      no_staffing: "headcount not entered", no_concern: "no concern written",
      under_target: "plan percentage not reached", no_sap_code: "the cell has no SAP code",
      started_late: "the checklist began after the check",
      not_checked: "the check did not run", no_data: "the data could not be read",
    },
    f_date_mismatch: "Date mismatch", f_no_date: "No date on the photo",
    f_off_topic: "Photo is off-topic", f_not_proven: "Completion not visible",
    f_unreadable: "Photo unreadable",
  },
};

export default function VerdictBlock({ rev, autoReason, autoFacts, title }) {
  const { lang } = useLang();
  const T = T_ALL[lang] || T_ALL.ru;

  // Body text is the verdict's WHOLE argument — the one paragraph a person
  // reads before ruling on somebody's score — so it is set as reading text
  // (15px, 1.55), not as a caption. It was 12px, which on a phone is exactly
  // where a reader squints and rules on the chip alone.
  if (!rev && autoReason) {
    const facts = autoResultLines(autoFacts, lang);
    return (
      <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg-inner)" }}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-2"
          style={{ color: "var(--text-3)" }}>
          <Settings2 size={12} />{T.auto}
        </div>
        <p className="text-[15px] leading-[1.55]" style={{ color: "var(--text-1)" }}>
          {showReason(autoReason, "", { template: T.autoLine, why: (c) => T.why[c] })}
        </p>
        {facts.map((line) => (
          <p key={line} className="text-[13px] tabular-nums mt-1.5" style={{ color: "var(--text-2)" }}>
            {line}
          </p>
        ))}
      </div>
    );
  }
  if (!rev) return null;
  const flags = rev.flags || [];
  const dated = flags.some((f) => f === "no_date" || f === "date_mismatch");
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg-inner)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: "var(--text-3)" }}>
        <Sparkles size={12} />{title || T.ai}
      </div>
      {!!flags.length && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {flags.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: hexA(C_BAD, 0.14), color: C_BAD }}>
              <XCircle size={13} className="flex-shrink-0" />
              {T[`f_${f}`] || f}
            </span>
          ))}
        </div>
      )}
      {pick(rev.reason, lang) && (
        <p className="text-[15px] leading-[1.55]" style={{ color: "var(--text-1)" }}>
          {pick(rev.reason, lang)}
        </p>
      )}
      {dated && pick(rev.dateReason, lang) && (
        <p className="text-[15px] leading-[1.55] mt-1.5" style={{ color: "var(--text-1)" }}>
          {pick(rev.dateReason, lang)}
        </p>
      )}
      {dated && rev.expected && (
        <p className="text-[12px] tabular-nums mt-2 flex items-center gap-1 flex-wrap"
          style={{ color: "var(--text-3)" }}>
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
