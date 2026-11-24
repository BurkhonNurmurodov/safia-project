/**
 * A «Ta'lim» lesson's LABEL — the subject it belongs to («SAP», «IMS», …),
 * 2026-11-24. The record is `docs/education.md` «Lesson labels».
 *
 * One label per lesson, free text. There is no table of labels: the set is
 * READ off the lessons (`lessonLabels`), so a label exists while some lesson
 * carries it. The server stores a typed label in the spelling an existing
 * lesson already uses when it matches up to case
 * (routers/education._clean_label); the picker does the same on the client so
 * what it shows is what will be stored.
 */

// The column's width (models.EducationLesson.label, `LABEL_MAX` in the router).
export const LABEL_MAX = 60;

/** Whitespace collapsed, cut to the column's width — the client twin of the
 *  first half of `_clean_label`. */
export function normLabel(s) {
  return String(s ?? "").split(/\s+/).filter(Boolean).join(" ").slice(0, LABEL_MAX).trim();
}

/** The distinct labels across `lessons`, one spelling per case-folded label
 *  (the first seen), sorted for the reader. */
export function lessonLabels(lessons) {
  const seen = new Map();
  for (const l of lessons || []) {
    const v = normLabel(l?.label);
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
