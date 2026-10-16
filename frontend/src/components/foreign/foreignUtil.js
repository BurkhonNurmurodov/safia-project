// «Yot jismlar» — the small pieces the page, the explain dialog and the rules
// dialog share: the score scale drawn from the rule the server sent (a scale of
// COUNTS, where turnover's is one of percentages) and the words for a kind, a
// source or a status. Number and date formats, the score's colour and the
// month label are turnover's own (turnoverUtil) — one spelling across the
// leaders' KPI pages.
export { n0, pts, dmy, dmHm, monthLabel, todayISO, defaultMonth, scoreTone, toneInk, PAST_FROM } from "../turnover/turnoverUtil";

// The scale as rows, no complaints first: {label, score, from, to}.
export function bandRows(rule) {
  const bands = [...(rule?.bands || [])].sort((a, b) => a.max - b.max);
  const out = [];
  let prev = null;
  for (const b of bands) {
    const from = prev == null ? 0 : prev + 1;
    out.push({ label: from === b.max ? String(b.max) : `${from}–${b.max}`, score: b.score, from, to: b.max });
    prev = b.max;
  }
  out.push({ label: `${(prev ?? -1) + 1}+`, score: rule?.worst ?? 1, from: (prev ?? -1) + 1, to: null });
  return out;
}

export const bandOf = (count, rule) => {
  if (count == null) return -1;
  return bandRows(rule).findIndex((b) => (b.to == null ? count >= b.from : count <= b.to));
};

export const weightPct = (rule) => Math.round((rule?.weight ?? 0.25) * 100);

// A kind / source / status in the viewer's words; a value nobody mapped is
// shown as the register spells it (the caller transliterates it).
export const wordOf = (T, group, slug, tx) => {
  if (!slug) return "—";
  const w = T[group]?.[slug];
  return w || (tx ? tx(slug) : slug);
};

// «Soch 2 · Metall 1» — the kinds of a cell's counted complaints, biggest first.
export const kindsText = (kinds, T, tx) =>
  Object.entries(kinds || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${wordOf(T, "kinds", k, tx)} ${n}`)
    .join(" · ");
