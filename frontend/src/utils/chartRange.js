// Line/area trend charts must never display fewer than MIN_CHART_DAYS days:
// selecting n..n+4 renders the chart as n-2..n+4. Only the chart window is
// padded — KPIs, tables and exports keep the exact range the user picked.
export const MIN_CHART_DAYS = 7;

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Chart-window start date: the selected `dateFrom`, pulled back so the
// inclusive span [result .. dateTo] covers at least `minDays` days.
export function padChartFrom(dateFrom, dateTo, minDays = MIN_CHART_DAYS) {
  if (!dateTo) return dateFrom;
  const to = new Date(dateTo + "T00:00:00");
  if (Number.isNaN(+to)) return dateFrom;
  const from = dateFrom ? new Date(dateFrom + "T00:00:00") : to;
  const span = Math.round((to - from) / 86400000) + 1;
  if (span >= minDays) return dateFrom;
  const padded = new Date(to);
  padded.setDate(padded.getDate() - (minDays - 1));
  return toISO(padded);
}

// Same padding applied to an API params object carrying date_from/date_to.
export function padChartParams(params, minDays = MIN_CHART_DAYS) {
  if (!params?.date_to) return params;
  const from = padChartFrom(params.date_from, params.date_to, minDays);
  return from === params.date_from ? params : { ...params, date_from: from };
}

// Every ISO day in [fromISO .. endISO] inclusive — for client-computed trends
// that must show empty days across the padded window. (The end param must NOT
// be named "toISO" — it would shadow the formatter above and make the loop
// call the ISO string as a function.)
export function listChartDays(fromISO, endISO) {
  if (!fromISO || !endISO) return [];
  const out = [];
  const d = new Date(fromISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d <= end && out.length < 1000) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ─── date-axis label thinning ───────────────────────────────────────────────
// A horizontal date axis overlaps the moment its label COUNT outgrows its
// pixel WIDTH, and one fixed tick count cannot serve a card that is two thirds
// of a grid on one tab, a third of it on another, and a single column on a
// phone. ApexCharts' own `hideOverlappingLabels` is only the last safety net:
// on a category axis it DROPS whichever labels collide rather than thinning
// them evenly, so an axis leaning on it alone reads as a random subset of
// days. The tick count is therefore DERIVED from the measured width —
// ~5 anchors on a phone, up to `max` on a desktop.
//
// Pair with `useElementWidth` on the chart's own container; nothing here may
// guess a width, because the only wrong answer is a confident one.

// The y-axis labels' own column, which the plot never gets to use.
export const AXIS_GUTTER_PX = 46;

// Room ONE label of this set needs, its gap included: the longest string at
// the charts' 10px axis font (~6px per character, Cyrillic and Latin alike)
// plus 16px of breathing space. «29 Дек» → 52px, which is the DD.MM default
// below — pass this whenever the labels are not plain DD.MM (month names,
// another language) instead of trusting that default.
export function axisLabelPx(labels, charPx = 6, gapPx = 16) {
  const longest = (labels || []).reduce((m, s) => Math.max(m, String(s ?? "").length), 0);
  return Math.max(28, longest * charPx + gapPx);
}

// How many labels fit on an axis of the given width. Returns undefined — Apex
// for "show every label" — when they already fit, so a short range is never
// thinned, and while the width is still unknown (0), which callers must read
// as "not measured yet" rather than "zero wide".
export function ticksForWidth(width, count, labelPx = 52, max = 12) {
  if (!width) return undefined;
  const fit = Math.min(max, Math.max(2, Math.floor((width - AXIS_GUTTER_PX) / labelPx)));
  return count > fit ? fit : undefined;
}

// ─── date-axis label format ─────────────────────────────────────────────────
// «14th Sep. 2026» — THE spelling of a day on a chart axis, in ONE place, so a
// format settled on one chart is one import away from every other and two
// charts can never name the same day two ways.
//
// Deliberately ENGLISH in all four UI languages: the ordinal suffix has no
// counterpart in Russian or Uzbek, so a localised month beside it («14th Сен.
// 2026») reads worse than one consistent label. Revisit that HERE if it is
// ever revisited, never at a call site.
//
// It accepts both shapes the payloads carry — «DD.MM.YYYY» (the downtime
// register's own spelling) and «YYYY-MM-DD» — and returns anything it cannot
// parse UNCHANGED: a formatter that blanks an axis is worse than one that does
// nothing.
const AXIS_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
                     "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

// 1st · 2nd · 3rd · 4th … and the 11–13 exception, which the last digit alone
// cannot express (11th, not 11st).
export function ordinal(n) {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

export function axisDate(value) {
  const s = String(value ?? "").trim();
  let d, m, y;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) [d, m, y] = s.split(".");
  else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) [y, m, d] = s.split("-");
  else return s;
  const day = Number(d), mon = Number(m);
  if (!day || day > 31 || mon < 1 || mon > 12) return s;
  return `${ordinal(day)} ${AXIS_MONTHS[mon - 1]} ${y}`;
}
