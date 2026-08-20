/**
 * ALL-CAPS text → ordinary sentence case.
 *
 * The AI-requirement texts in the ltasks matrix were typed in capitals back
 * when they were prompt material nobody but Gemini read. They are not that any
 * more: a leader reads the same text as the task description on the /leaders
 * «Vazifalar» tab, and a wall of capitals is both slower to read and shouted at
 * the person being scored by it.
 *
 * The transform is deliberately TIMID, because these texts are the rule people
 * are judged by. It changes letter CASE and nothing else — never a word, never
 * a space, never an order — and three rules keep it from doing damage:
 *
 *  1. A word that already carries a lowercase letter is returned untouched, so
 *     a text somebody fixed by hand survives a second pass and a mixed-case
 *     name is never flattened.
 *  2. An ALL-CAPS word is only read as an acronym when a KNOWN acronym is
 *     followed by nothing, or by a known case ending — «SAPDAN» → «SAPdan»,
 *     while «IDORA» stays an ordinary word rather than becoming «IDora». A
 *     prefix test alone would wreck every word starting with ID/IT/AI.
 *  3. Nothing here writes anything. The admin sees the result in an editable
 *     box and presses Save, so an acronym this list has never heard of costs
 *     one correction rather than a wrong rule on 13 tasks.
 */

// Short on purpose — an unknown acronym degrades to an ordinary word, which is
// visible and fixable; a wrong entry here is not.
const ACRONYMS = [
  "SAP", "ABC", "AI", "KPI", "HACCP", "OEE", "FIFO", "CIP", "ERP", "MRP",
  "SKU", "BOM", "QR", "PDF", "HR", "IT", "ID", "USB", "SMS", "TV",
  "ОТК", "СИЗ", "САП", "КПЭ", "ХАССП", "ТБ", "ИИ",
].sort((a, b) => b.length - a.length);

// Case endings that may hang off an acronym: uz-latin, uz-cyrillic, russian.
const ENDING = /^(?:DA|DAN|DAGI|DAGILAR|GA|GACHA|NI|NING|NDA|NDAN|LAR|LARI|LARDA|LARGA|LARNI|LARNING|SI|SIGA|SIDA|SIDAN|DAY|DEK|MI|ДА|ДАН|ДАГИ|ГА|ГАЧА|НИ|НИНГ|ЛАР|ЛАРИ|СИ|ГА|ОМ|ОВ|АМИ|А|У|Е|Ы|ИЯ)$/;

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’ʻʼ_-]*/gu;
// A sentence starts the text, follows . ! ? … , or opens a line or a bullet.
const SENTENCE = /(^|[.!?…]\s*|[\n\r][\s•*·—–-]*)(\p{Ll})/gu;

/** Is this text shouted? Mostly-capitals and long enough that it was a choice. */
export function isShouty(text) {
  const s = String(text ?? "");
  const letters = s.match(/\p{L}/gu) || [];
  if (letters.length < 8) return false;
  const upper = s.match(/\p{Lu}/gu) || [];
  return upper.length / letters.length >= 0.7;
}

/** SHOUTED text → sentence case. Idempotent; a no-op on text already cased. */
export function fixCaps(text) {
  const s = String(text ?? "");
  if (!s) return s;
  const cased = s.replace(WORD, (w) => {
    if (/\p{Ll}/u.test(w)) return w;   // already fixed (or mixed) — leave it
    if (!/\p{Lu}/u.test(w)) return w;  // digits / symbols only
    for (const a of ACRONYMS) {
      if (!w.startsWith(a)) continue;
      const rest = w.slice(a.length);
      if (!rest || ENDING.test(rest)) return a + rest.toLowerCase();
    }
    return w.toLowerCase();
  });
  return cased.replace(SENTENCE, (_, pre, ch) => pre + ch.toUpperCase());
}
