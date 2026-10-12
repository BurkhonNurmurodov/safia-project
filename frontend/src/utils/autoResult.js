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
    kelish: "Ish grafigi: {cells}",
    kelishNoPlan: "Rejasi yo'q, tekshirilmadi: {codes}",
    kelishEmpty: "Ro'yxati bo'sh, tekshirilmadi: {codes}",
    kelishNone: "Rejasi bor yacheyka yo'q — tekshiriladigan ro'yxat yo'q",
    kToday: "bugungi", kTomorrow: "ertangi",
    kFilled: "{t} da to'liq to'ldirildi",
  },
  uz_cyrl: {
    plan: "Режа киритилган позициялар: {a} / {b}",
    filled: "Режа ва одамлар киритилган ячейкалар: {codes}",
    untyped: "Одамлар сони киритилмаган: {codes}",
    pct: "Бажарилиши: {v} (керак: {target}%)",
    pctBare: "Бажарилиши: {v}",
    concerns: "Ёзилган хавотирлар: {n} та ({from} – {to})",
    late: "Текширув {n} дақиқа кечикиб ўтказилган",
    kelish: "Иш графиги: {cells}",
    kelishNoPlan: "Режаси йўқ, текширилмади: {codes}",
    kelishEmpty: "Рўйхати бўш, текширилмади: {codes}",
    kelishNone: "Режаси бор ячейка йўқ — текшириладиган рўйхат йўқ",
    kToday: "бугунги", kTomorrow: "эртанги",
    kFilled: "{t} да тўлиқ тўлдирилди",
  },
  ru: {
    plan: "Позиции с планом: {a} / {b}",
    filled: "Ячейки с планом и людьми: {codes}",
    untyped: "Не внесено количество людей: {codes}",
    pct: "Выполнение: {v} (нужно: {target}%)",
    pctBare: "Выполнение: {v}",
    concerns: "Записано обеспокоенностей: {n} ({from} – {to})",
    late: "Проверка прошла с опозданием на {n} мин",
    kelish: "График работы: {cells}",
    kelishNoPlan: "Нет плана, не проверялись: {codes}",
    kelishEmpty: "Список пуст, не проверялись: {codes}",
    kelishNone: "Нет ячеек с планом — проверять было нечего",
    kToday: "на сегодня", kTomorrow: "на завтра",
    kFilled: "полностью заполнен в {t}",
  },
  en: {
    plan: "Positions with a plan: {a} / {b}",
    filled: "Cells with plan and people: {codes}",
    untyped: "Headcount missing: {codes}",
    pct: "Fulfilment: {v} (needed: {target}%)",
    pctBare: "Fulfilment: {v}",
    concerns: "Concerns written: {n} ({from} – {to})",
    late: "The check ran {n} min late",
    kelish: "Work schedule: {cells}",
    kelishNoPlan: "No plan, not checked: {codes}",
    kelishEmpty: "Empty list, not checked: {codes}",
    kelishNone: "No cell had a plan — there was no list to check",
    kToday: "today's", kTomorrow: "tomorrow's",
    kFilled: "fully filled at {t}",
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

// #11 «Ish grafigi»: what the check read on each list it judged — the twin of
// `leader_auto.staff_list_cells`. A cell whose type is fixed shows that one
// list; one not fixed yet shows both, since either would have passed. Beside
// the count, WHEN the list was fully filled (`filled_at`): the check stamps it
// on a list it found full, the 5-minute sweep on a failed list once it fills
// (`leader_auto.stamp_late_fills`) — so «12/13, 20:35 da to'liq to'ldirildi»
// says the leader finished after the hour, and how long after. «HH:MM» on the
// checklist day, «DD.MM HH:MM» on any other — read off the ISO text, never
// through the browser's clock (`leader_auto.fill_text` is the twin).
const pair = (v) => (Array.isArray(v) ? `${v[0] ?? 0}/${v[1] ?? 0}` : "0/0");
const fillText = (it, f) => {
  const s = String(it.filled_at || "");
  if (s.length < 16 || s[10] !== "T") return null;
  const day0 = String((Array.isArray(f.days) && f.days[0]) || "").slice(0, 10);
  const hm = s.slice(11, 16);
  return day0 && s.slice(0, 10) === day0 ? hm : `${s.slice(8, 10)}.${s.slice(5, 7)} ${hm}`;
};
const kindWord = (T, k) => (k === "today" ? T.kToday : T.kTomorrow);
const staffCells = (T, lists, f) => lists.slice(0, 8).map((it) => {
  const k = it.kind === "today" || it.kind === "tomorrow" ? it.kind : null;
  const at = fillText(it, f);
  if (k) {
    const s = `${it.cell} (${kindWord(T, k)}): ${pair(it[k])}`;
    return at ? `${s}, ${put(T.kFilled, { t: at })}` : s;
  }
  const s = `${it.cell}: ${T.kToday} ${pair(it.today)}, ${T.kTomorrow} ${pair(it.tomorrow)}`;
  if (!at) return s;
  const fk = it.filled_kind === "today" || it.filled_kind === "tomorrow" ? `${kindWord(T, it.filled_kind)} ` : "";
  return `${s}, ${fk}${put(T.kFilled, { t: at })}`;
}).join(" · ");

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
    if (lists.length) out.push(put(T.kelish, { cells: staffCells(T, lists, f) }));
    if (Array.isArray(f.no_plan) && f.no_plan.length) out.push(put(T.kelishNoPlan, { codes: codes(f.no_plan) }));
    if (Array.isArray(f.empty) && f.empty.length) out.push(put(T.kelishEmpty, { codes: codes(f.empty) }));
    if (!lists.length && !(f.no_plan || []).length && !(f.empty || []).length) out.push(T.kelishNone);
  }
  if (f.late_by_min) out.push(put(T.late, { n: f.late_by_min }));
  return out;
}

export default autoResultLines;
