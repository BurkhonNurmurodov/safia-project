/* What an AUTOMATIC check (#1, #8, #9 — services/leader_auto.py) found at its
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
    concerns: "Yozilgan xavotirlar: {n} ta ({from} – {to})",
    late: "Tekshiruv {n} daqiqa kechikib o'tkazilgan",
  },
  uz_cyrl: {
    plan: "Режа киритилган позициялар: {a} / {b}",
    filled: "Режа ва одамлар киритилган ячейкалар: {codes}",
    untyped: "Одамлар сони киритилмаган: {codes}",
    pct: "Бажарилиши: {v} (керак: {target}%)",
    concerns: "Ёзилган хавотирлар: {n} та ({from} – {to})",
    late: "Текширув {n} дақиқа кечикиб ўтказилган",
  },
  ru: {
    plan: "Позиции с планом: {a} / {b}",
    filled: "Ячейки с планом и людьми: {codes}",
    untyped: "Не внесено количество людей: {codes}",
    pct: "Выполнение: {v} (нужно: {target}%)",
    concerns: "Записано обеспокоенностей: {n} ({from} – {to})",
    late: "Проверка прошла с опозданием на {n} мин",
  },
  en: {
    plan: "Positions with a plan: {a} / {b}",
    filled: "Cells with plan and people: {codes}",
    untyped: "Headcount missing: {codes}",
    pct: "Fulfilment: {v} (needed: {target}%)",
    concerns: "Concerns written: {n} ({from} – {to})",
    late: "The check ran {n} min late",
  },
};

const put = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);

const pct = (v) => {
  const x = Number(v);
  if (v == null || !Number.isFinite(x)) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
};

const codes = (list) => list.slice(0, 8).join(", ");

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
    out.push(put(T.pct, { v, target: pct(f.target) }));
  } else if (f.pct != null) {
    out.push(put(T.pct, { v: `${pct(f.pct)}%`, target: pct(f.target) }));
  }
  if (f.found != null) out.push(put(T.concerns, { n: f.found, from: f.from || "—", to: f.to || "—" }));
  if (f.late_by_min) out.push(put(T.late, { n: f.late_by_min }));
  return out;
}

export default autoResultLines;
