import { useState } from "react";
import { CheckCircle2, Clock, XCircle, HelpCircle, ChevronDown } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { C_OK, C_REJ, C_WARN, C_WAIT } from "./verifyState";

/**
 * WHEN the ФАКТ behind a failed #9 was typed — the answer to «I entered it on
 * time» (`services/auto_check_timing.py`, `GET …/disputes/{id}/auto-timing`).
 *
 * One sentence carries the verdict; one quiet line the two figures it rests
 * on (at the hour · today); everything else — each save, who made it, the %
 * after it — waits behind a disclosure, because only the person ruling needs
 * it and only when they doubt the sentence. The % at the hour is a FLOOR
 * (only proven saves count), so «on time» is evidence, never a guess.
 */
const T_ALL = {
  uz: {
    title: "Fakt qachon kiritilgan",
    on_time: "Soat {due} da fakt {pct}% bo'lgan — reja vaqtida bajarilgan.",
    late: "{target}% ga {at} da yetilgan — tekshiruvdan {n} daqiqa keyin.",
    lateNoMin: "{target}% ga {at} da yetilgan — tekshiruvdan keyin.",
    lateBare: "Fakt {at} da kiritilgan — tekshiruvdan {n} daqiqa keyin.",
    neverBare: "Hozir ham {pct}% — talab bajarilmagan.",
    never: "Hozir ham {pct}% — {target}% ga yetilmagan.",
    unexplained: "Hozir {pct}%, lekin qachon kiritilgani jurnalda yo'q.",
    figures: "Soat {due} holatiga: {hour}% · hozir: {now}%",
    other: "Bu lider faktni {day} sahifasiga kiritgan ({at}).",
    saves: "Kiritishlar ({n})",
    sap: "SAP fayli",
    cleared: "o'chirildi",
    after: "keyin",
    none: "Bu sana uchun qo'lda fakt kiritilmagan.",
    cTitle: "Xavotir qachon yozilgan",
    cOnTime: "Soat {due} gacha {n} ta xavotir yozilgan — tekshiruv vaqtida.",
    cLate: "Birinchi xavotir {at} da yozilgan — tekshiruvdan {n} daqiqa keyin.",
    cNever: "Bu kuni xavotir yozilmagan.",
    cOther: "Oxirgi xavotir {day} kuni yozilgan ({at}).",
    cSaves: "Xavotirlar ({n})",
    worker: "ishchi",
  },
  uz_cyrl: {
    title: "Факт қачон киритилган",
    on_time: "Соат {due} да факт {pct}% бўлган — режа вақтида бажарилган.",
    late: "{target}% га {at} да етилган — текширувдан {n} дақиқа кейин.",
    lateNoMin: "{target}% га {at} да етилган — текширувдан кейин.",
    lateBare: "Факт {at} да киритилган — текширувдан {n} дақиқа кейин.",
    neverBare: "Ҳозир ҳам {pct}% — талаб бажарилмаган.",
    never: "Ҳозир ҳам {pct}% — {target}% га етилмаган.",
    unexplained: "Ҳозир {pct}%, лекин қачон киритилгани журналда йўқ.",
    figures: "Соат {due} ҳолатига: {hour}% · ҳозир: {now}%",
    other: "Бу лидер фактни {day} саҳифасига киритган ({at}).",
    saves: "Киритишлар ({n})",
    sap: "SAP файли",
    cleared: "ўчирилди",
    after: "кейин",
    none: "Бу сана учун қўлда факт киритилмаган.",
    cTitle: "Хавотир қачон ёзилган",
    cOnTime: "Соат {due} гача {n} та хавотир ёзилган — текширув вақтида.",
    cLate: "Биринчи хавотир {at} да ёзилган — текширувдан {n} дақиқа кейин.",
    cNever: "Бу куни хавотир ёзилмаган.",
    cOther: "Охирги хавотир {day} куни ёзилган ({at}).",
    cSaves: "Хавотирлар ({n})",
    worker: "ишчи",
  },
  ru: {
    title: "Когда внесён факт",
    on_time: "В {due} факт был {pct}% — план выполнен вовремя.",
    late: "{target}% достигнуто в {at} — через {n} мин после проверки.",
    lateNoMin: "{target}% достигнуто в {at} — после проверки.",
    lateBare: "Факт внесён в {at} — через {n} мин после проверки.",
    neverBare: "Даже сейчас {pct}% — требование не выполнено.",
    never: "Даже сейчас {pct}% — {target}% не достигнуто.",
    unexplained: "Сейчас {pct}%, но когда это внесено, в журнале нет.",
    figures: "На {due}: {hour}% · сейчас: {now}%",
    other: "Лидер внёс факт на страницу за {day} ({at}).",
    saves: "Записи ({n})",
    sap: "Файл SAP",
    cleared: "удалено",
    after: "после",
    none: "За эту дату факт вручную не вносился.",
    cTitle: "Когда записана обеспокоенность",
    cOnTime: "До {due} записано обеспокоенностей: {n} — вовремя.",
    cLate: "Первая обеспокоенность записана в {at} — через {n} мин после проверки.",
    cNever: "В этот день обеспокоенностей не записано.",
    cOther: "Последняя обеспокоенность записана {day} ({at}).",
    cSaves: "Обеспокоенности ({n})",
    worker: "рабочий",
  },
  en: {
    title: "When the actuals were entered",
    on_time: "At {due} the actuals stood at {pct}% — the plan was met on time.",
    late: "{target}% was reached at {at} — {n} min after the check.",
    lateNoMin: "{target}% was reached at {at} — after the check.",
    lateBare: "The actuals were entered at {at} — {n} min after the check.",
    neverBare: "Still {pct}% now — the requirement was not met.",
    never: "Still {pct}% now — {target}% was never reached.",
    unexplained: "{pct}% now, but the log does not show when it was entered.",
    figures: "At {due}: {hour}% · now: {now}%",
    other: "The leader entered actuals on the {day} page ({at}).",
    saves: "Entries ({n})",
    sap: "SAP file",
    cleared: "cleared",
    after: "after",
    none: "No actuals were entered by hand for this date.",
    cTitle: "When the concerns were written",
    cOnTime: "{n} concern(s) written before {due} — on time.",
    cLate: "The first concern was written at {at} — {n} min after the check.",
    cNever: "No concern was written that day.",
    cOther: "The last concern was written on {day} ({at}).",
    cSaves: "Concerns ({n})",
    worker: "worker",
  },
};

const TONE = {
  on_time: { color: C_OK, Icon: CheckCircle2 },
  late: { color: C_WARN, Icon: Clock },
  never: { color: C_REJ, Icon: XCircle },
  unexplained: { color: C_WAIT, Icon: HelpCircle },
};

const put = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const num = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));

// The server sends plant wall-clock ISO strings («2026-09-28T14:09+05:00»), so
// they are read as text — never through the viewer's own time zone.
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const clock = (iso, day) => (!iso ? "—" : iso.slice(0, 10) === day
  ? iso.slice(11, 16) : `${dm(iso)} ${iso.slice(11, 16)}`);

export default function AutoTiming({ timing }) {
  const { lang } = useLang();
  const { tl, tx } = useTranslit();
  const [open, setOpen] = useState(false);
  const T = T_ALL[lang] || T_ALL.ru;
  const tone = TONE[timing?.verdict];
  if (!tone) return null;

  const day = timing.date;
  const due = clock(timing.due, day);
  const target = num(timing.target);
  // A LEADER's answer carries no pass mark (the operator, 2026-10-02), so
  // their sentences say when the actuals went in, never what was needed.
  const bare = timing.target == null;
  const at = clock(timing.reached, day);
  // #8 «Xavotirlar»: when the concerns were WRITTEN — `created_at`, exact.
  const conc = timing.check === "concerns";
  const text = conc ? (timing.verdict === "on_time" ? put(T.cOnTime, { due, n: timing.found })
    : timing.verdict === "late" ? put(T.cLate, { at, n: timing.late_min ?? "—" })
    : T.cNever)
    : timing.verdict === "on_time" ? put(T.on_time, { due, pct: num(timing.hour_pct) })
    : timing.verdict === "late"
      ? put(bare ? T.lateBare : timing.late_min != null ? T.late : T.lateNoMin,
        { target, at, n: timing.late_min ?? "—" })
    : timing.verdict === "never" && bare ? put(T.neverBare, { pct: num(timing.now_pct) })
    : put(T[timing.verdict], { pct: num(timing.now_pct), target });
  const events = timing.events || [];
  const { color, Icon } = tone;

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: "var(--text-3)" }}>
        {conc ? T.cTitle : T.title}
      </div>
      <p className="flex items-start gap-2 text-[15px] leading-[1.5]" style={{ color: "var(--text-1)" }}>
        <Icon size={17} className="flex-shrink-0 mt-[3px]" style={{ color }} aria-hidden />
        <span>{text}</span>
      </p>
      {!conc && (
        <p className="text-[13px] tabular-nums mt-1 pl-[25px]" style={{ color: "var(--text-2)" }}>
          {put(T.figures, { due, hour: num(timing.hour_pct), now: num(timing.now_pct) })}
        </p>
      )}
      {(timing.other_days || []).map((o) => (
        <p key={o.day} className="text-[13px] mt-1 pl-[25px]" style={{ color: "var(--text-2)" }}>
          {put(conc ? T.cOther : T.other, { day: dm(o.day), at: clock(o.at, o.day) })}
        </p>
      ))}
      {!events.length ? (conc ? null : (
        <p className="text-[13px] mt-1 pl-[25px]" style={{ color: "var(--text-3)" }}>{T.none}</p>
      )) : (
        <div className="pl-[25px] mt-1.5">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex items-center gap-1 min-h-[32px] text-[13px] font-semibold rounded-lg
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            style={{ color: "var(--brand)" }}>
            {put(conc ? T.cSaves : T.saves, { n: events.length })}
            <ChevronDown size={15} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <ul className="mt-1 space-y-1">
              {events.map((e, i) => (
                <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 text-[13px] tabular-nums">
                  <span className="font-semibold" style={{ color: e.after ? C_WARN : "var(--text-1)" }}>
                    {clock(e.at, day)}
                    {e.after && <span className="sr-only"> ({T.after})</span>}
                  </span>
                  <span className="min-w-0" style={{ color: "var(--text-2)" }}>
                    <span className="block truncate" title={e.kind === "sap" ? T.sap : tx(e.position)}>
                      {e.kind === "concern" && e.cell && (
                        <span style={{ color: "var(--text-3)" }}>
                          {e.cell}{e.worker ? ` · ${T.worker}` : ""}{" · "}
                        </span>
                      )}
                      {e.kind === "sap" ? T.sap : tx(e.position)}
                      {e.kind === "fact" && (
                        <span style={{ color: "var(--text-1)" }}>
                          {" · "}{e.value == null ? T.cleared : num(e.value)}
                        </span>
                      )}
                    </span>
                    {e.role && e.role !== "leader" && e.who && (
                      <span className="block truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                        {tl(e.who)}
                      </span>
                    )}
                  </span>
                  <span className="text-right" style={{ color: "var(--text-1)" }}>
                    {e.pct == null ? "" : `${num(e.pct)}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
