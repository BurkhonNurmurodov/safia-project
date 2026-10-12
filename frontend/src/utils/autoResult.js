/* What an AUTOMATIC check (#1, #8, #9, #11 — services/leader_auto.py) found at its
 * hour, as plain lines in the reader's language.
 *
 * The reason sentinel (`__auto__|HH:MM|code`, utils/leaderReason.js) says WHEN
 * the platform looked and WHY it went the way it did; this says WHAT it saw —
 * «Bajarilishi: 8211 — 24% (kerak: 30%)» — so a failed task is never argued
 * about on a verdict nobody can see the numbers of. The facts are the ones the
 * check STORED on its ledger row (`leader_auto.results_for`, served as
 * `autoFacts` / `auto_facts` / `auto.facts`); nothing here is recomputed, so a
 * figure typed after the hour can never show up as what the check read.
 *
 * ONE formatter for every surface that prints the reason — the day report,
 * the register's day detail, the admin day detail, the checklist sheet and the
 * appeal chat. The bot's twin is `leader_auto.result_lines`; keep the two
 * saying the same thing.
 */
const T_ALL = {
  uz: {
    plan: "Reja kiritilgan pozitsiyalar: {a} / {b}",
    filled: "Reja va odamlar kiritilgan yacheykalar: {codes}",
    untyped: "Odamlar soni kiritilmagan: {codes}",
    pct: "Bajarilishi: {v} (kerak: {target}%)",
    pctBare: "Bajarilishi: {v}",
    concerns: "Yozilgan xavotirlar: {n} ta ({from} – {to})",
    late: "Tekshiruv {n} daqiqa kechikib o'tkazilgan",
    kelishNoPlan: "Rejasi yo'q, tekshirilmadi: {codes}",
    kelishEmpty: "Ro'yxati bo'sh, tekshirilmadi: {codes}",
    kelishNone: "Rejasi bor yacheyka yo'q — tekshiriladigan ro'yxat yo'q",
    kToday: "bugungi", kTomorrow: "ertangi",
    chkAt: "Tekshiruv vaqti: {d}, soat {t}",
    lst: "Tekshirilgan ro'yxat: {cell} — {ld} ({kind})",
    lst2: "Tekshirilgan ro'yxatlar: {cell} — bugungi ({d0}) va ertangi ({d1})",
    atChk: "Tekshiruv paytida belgilangan: {m} / {n}",
    atChk2: "Tekshiruv paytida belgilangan: bugungi {m0} / {n0}, ertangi {m1} / {n1}",
    done: "To'liq to'ldirildi: {d}, soat {t}",
    doneLate: "To'liq to'ldirildi: {d}, soat {t} — tekshiruvdan {dur} keyin",
    doneK: "{kind} ro'yxat to'liq to'ldirildi: {d}, soat {t}",
    doneKLate: "{kind} ro'yxat to'liq to'ldirildi: {d}, soat {t} — tekshiruvdan {dur} keyin",
    notDone: "Keyin ham to'liq to'ldirilmagan",
    durH: "{h} soat", durM: "{m} daqiqa", durHM: "{h} soat {m} daqiqa",
  },
  uz_cyrl: {
    plan: "Режа киритилган позициялар: {a} / {b}",
    filled: "Режа ва одамлар киритилган ячейкалар: {codes}",
    untyped: "Одамлар сони киритилмаган: {codes}",
    pct: "Бажарилиши: {v} (керак: {target}%)",
    pctBare: "Бажарилиши: {v}",
    concerns: "Ёзилган хавотирлар: {n} та ({from} – {to})",
    late: "Текширув {n} дақиқа кечикиб ўтказилган",
    kelishNoPlan: "Режаси йўқ, текширилмади: {codes}",
    kelishEmpty: "Рўйхати бўш, текширилмади: {codes}",
    kelishNone: "Режаси бор ячейка йўқ — текшириладиган рўйхат йўқ",
    kToday: "бугунги", kTomorrow: "эртанги",
    chkAt: "Текширув вақти: {d}, соат {t}",
    lst: "Текширилган рўйхат: {cell} — {ld} ({kind})",
    lst2: "Текширилган рўйхатлар: {cell} — бугунги ({d0}) ва эртанги ({d1})",
    atChk: "Текширув пайтида белгиланган: {m} / {n}",
    atChk2: "Текширув пайтида белгиланган: бугунги {m0} / {n0}, эртанги {m1} / {n1}",
    done: "Тўлиқ тўлдирилди: {d}, соат {t}",
    doneLate: "Тўлиқ тўлдирилди: {d}, соат {t} — текширувдан {dur} кейин",
    doneK: "{kind} рўйхат тўлиқ тўлдирилди: {d}, соат {t}",
    doneKLate: "{kind} рўйхат тўлиқ тўлдирилди: {d}, соат {t} — текширувдан {dur} кейин",
    notDone: "Кейин ҳам тўлиқ тўлдирилмаган",
    durH: "{h} соат", durM: "{m} дақиқа", durHM: "{h} соат {m} дақиқа",
  },
  ru: {
    plan: "Позиции с планом: {a} / {b}",
    filled: "Ячейки с планом и людьми: {codes}",
    untyped: "Не внесено количество людей: {codes}",
    pct: "Выполнение: {v} (нужно: {target}%)",
    pctBare: "Выполнение: {v}",
    concerns: "Записано обеспокоенностей: {n} ({from} – {to})",
    late: "Проверка прошла с опозданием на {n} мин",
    kelishNoPlan: "Нет плана, не проверялись: {codes}",
    kelishEmpty: "Список пуст, не проверялись: {codes}",
    kelishNone: "Нет ячеек с планом — проверять было нечего",
    kToday: "на сегодня", kTomorrow: "на завтра",
    chkAt: "Время проверки: {d}, {t}",
    lst: "Проверенный список: {cell} — {ld} ({kind})",
    lst2: "Проверенные списки: {cell} — на сегодня ({d0}) и на завтра ({d1})",
    atChk: "Отмечено на момент проверки: {m} / {n}",
    atChk2: "Отмечено на момент проверки: на сегодня {m0} / {n0}, на завтра {m1} / {n1}",
    done: "Заполнен полностью: {d}, {t}",
    doneLate: "Заполнен полностью: {d}, {t} — через {dur} после проверки",
    doneK: "Список {kind} заполнен полностью: {d}, {t}",
    doneKLate: "Список {kind} заполнен полностью: {d}, {t} — через {dur} после проверки",
    notDone: "Позже тоже не был заполнен полностью",
    durH: "{h} ч", durM: "{m} мин", durHM: "{h} ч {m} мин",
  },
  en: {
    plan: "Positions with a plan: {a} / {b}",
    filled: "Cells with plan and people: {codes}",
    untyped: "Headcount missing: {codes}",
    pct: "Fulfilment: {v} (needed: {target}%)",
    pctBare: "Fulfilment: {v}",
    concerns: "Concerns written: {n} ({from} – {to})",
    late: "The check ran {n} min late",
    kelishNoPlan: "No plan, not checked: {codes}",
    kelishEmpty: "Empty list, not checked: {codes}",
    kelishNone: "No cell had a plan — there was no list to check",
    kToday: "today's", kTomorrow: "tomorrow's",
    chkAt: "Checked: {d} at {t}",
    lst: "List checked: {cell} — {ld} ({kind})",
    lst2: "Lists checked: {cell} — today's ({d0}) and tomorrow's ({d1})",
    atChk: "Marked at the check: {m} / {n}",
    atChk2: "Marked at the check: today's {m0} / {n0}, tomorrow's {m1} / {n1}",
    done: "Fully filled: {d} at {t}",
    doneLate: "Fully filled: {d} at {t} — {dur} after the check",
    doneK: "{kind} list fully filled: {d} at {t}",
    doneKLate: "{kind} list fully filled: {d} at {t} — {dur} after the check",
    notDone: "Not fully filled afterwards either",
    durH: "{h} h", durM: "{m} min", durHM: "{h} h {m} min",
  },
};

const put = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);

const pct = (v) => {
  const x = Number(v);
  if (v == null || !Number.isFinite(x)) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
};

// A LEADER's payload carries no pass mark (`leader_auto.hide_targets` — the
// operator, 2026-10-02), and the line then names none.
const pctLine = (T, v, f) => (f.target == null
  ? put(T.pctBare, { v }) : put(T.pct, { v, target: pct(f.target) }));

const codes = (list) => list.slice(0, 8).join(", ");

// #11 «Ish grafigi»: what the check read, as labelled lines answering every
// question a reader has asked of one of these verdicts (the operator,
// 2026-10-12): WHEN the check ran (date + hour), WHICH day's list of WHICH
// cell it judged, how many were marked AT THAT MOMENT, and when the list was
// fully filled — and how long after the check, when it was after. The twin of
// `leader_auto.staff_list_lines`; keep the two saying the same.
//
//   Tekshiruv vaqti: 10.10, soat 20:00
//   Tekshirilgan ro'yxat: 4612 — 11.10 (ertangi)
//   Tekshiruv paytida belgilangan: 12 / 13
//   To'liq to'ldirildi: 11.10, soat 08:53 — tekshiruvdan 12 soat 53 daqiqa keyin
//
// Every moment is read off its ISO text, never through the browser's clock.
const ddmm = (iso) => { const s = String(iso || ""); return s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "—"; };
const dmText = (iso) => {
  const s = String(iso || "");
  if (s.length < 16 || s[10] !== "T") return null;
  return [ddmm(s), s.slice(11, 16)];
};
const dur = (T, minutes) => {
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return !h ? put(T.durM, { m }) : !m ? put(T.durH, { h }) : put(T.durHM, { h, m });
};
const isKind = (k) => k === "today" || k === "tomorrow";
const kindWord = (T, k) => (k === "today" ? T.kToday : T.kTomorrow);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fillLine = (T, it, kind) => {
  const dt = dmText(it.filled_at);
  if (!dt) return it.ok ? "" : T.notDone;
  const late = Number(it.filled_late_min);
  const isLate = Number.isFinite(late) && late > 0;
  const fk = kind == null && isKind(it.filled_kind) ? it.filled_kind : null;
  const key = (fk ? "doneK" : "done") + (isLate ? "Late" : "");
  return cap(put(T[key], { d: dt[0], t: dt[1], dur: isLate ? dur(T, late) : "", kind: fk ? kindWord(T, fk) : "" }));
};
const pair = (v) => (Array.isArray(v) ? [v[0] ?? 0, v[1] ?? 0] : [0, 0]);
const staffLines = (T, f) => {
  const lists = (Array.isArray(f.lists) ? f.lists : []).filter((x) => x && typeof x === "object").slice(0, 8);
  if (!lists.length) return [];
  const days = [...(Array.isArray(f.days) ? f.days : []).slice(0, 2).map((x) => String(x || "").slice(0, 10)), "", ""];
  const out = [];
  const chk = dmText(f.checked);
  if (chk) out.push(put(T.chkAt, { d: chk[0], t: chk[1] }));
  for (const it of lists) {
    const kind = isKind(it.kind) ? it.kind : null;
    if (kind) {
      const [m, n] = pair(it[kind]);
      out.push(put(T.lst, { cell: it.cell, ld: ddmm(days[kind === "tomorrow" ? 1 : 0]), kind: kindWord(T, kind) }));
      out.push(put(T.atChk, { m, n }));
    } else {
      const [m0, n0] = pair(it.today); const [m1, n1] = pair(it.tomorrow);
      out.push(put(T.lst2, { cell: it.cell, d0: ddmm(days[0]), d1: ddmm(days[1]) }));
      out.push(put(T.atChk2, { m0, n0, m1, n1 }));
    }
    const line = fillLine(T, it, kind);
    if (line) out.push(line);
  }
  return out;
};

export function autoResultLines(facts, lang) {
  const f = facts && typeof facts === "object" ? facts : {};
  const T = T_ALL[lang] || T_ALL.ru;
  const out = [];
  if (f.with_plan != null && f.lines != null) out.push(put(T.plan, { a: f.with_plan, b: f.lines }));
  if (Array.isArray(f.filled) && f.filled.length) out.push(put(T.filled, { codes: codes(f.filled) }));
  if (Array.isArray(f.untyped) && f.untyped.length) out.push(put(T.untyped, { codes: codes(f.untyped) }));
  // #9 is decided by ONE cell's figure (the best), so each cell is named with
  // its own; the combined figure is only the fallback for a verdict taken
  // before the per-cell rule (2026-09-22), which stored nothing else.
  const cells = (Array.isArray(f.by_cell) ? f.by_cell : []).filter((c) => c && typeof c === "object");
  if (cells.length) {
    const v = cells.slice(0, 6).map((c) => `${c.cell} — ${pct(c.pct)}%`).join(" · ");
    out.push(pctLine(T, v, f));
  } else if (f.pct != null) {
    out.push(pctLine(T, `${pct(f.pct)}%`, f));
  }
  if (f.found != null) out.push(put(T.concerns, { n: f.found, from: f.from || "—", to: f.to || "—" }));
  if (Array.isArray(f.lists)) {
    const lists = f.lists.filter((x) => x && typeof x === "object");
    if (lists.length) out.push(...staffLines(T, f));
    if (Array.isArray(f.no_plan) && f.no_plan.length) out.push(put(T.kelishNoPlan, { codes: codes(f.no_plan) }));
    if (Array.isArray(f.empty) && f.empty.length) out.push(put(T.kelishEmpty, { codes: codes(f.empty) }));
    if (!lists.length && !(f.no_plan || []).length && !(f.empty || []).length) out.push(T.kelishNone);
  }
  if (f.late_by_min) out.push(put(T.late, { n: f.late_by_min }));
  return out;
}

export default autoResultLines;
