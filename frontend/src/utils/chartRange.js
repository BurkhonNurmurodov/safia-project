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

// Every ISO day in [fromISO .. toISO] inclusive — for client-computed trends
// that must show empty days across the padded window.
export function listChartDays(fromISO, toISO) {
  if (!fromISO || !toISO) return [];
  const out = [];
  const d = new Date(fromISO + "T00:00:00");
  const end = new Date(toISO + "T00:00:00");
  while (d <= end && out.length < 1000) {
    out.push(toISO_(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const toISO_ = toISO;
