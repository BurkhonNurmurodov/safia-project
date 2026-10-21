// A long day axis is folded into WEEKS or MONTHS before it reaches a chart.
//
// ApexCharts draws an SVG node per point — two per bar — so a «Barcha vaqt»
// period read day by day (2015 → today, ~4,300 days) put ~8,600 bars and a
// 4,300-point area on one page and froze it. Folding keeps the arithmetic the
// day loop already did: the open pool is read at the END of each bucket (the
// last day's running count), new and closed are SUMMED over it. Nothing is
// re-measured, so a week's figure is exactly the sum of its days.
//
// Points come in as the day loop writes them: { day, open, opened, closed }.
// Out: the same shape plus `from` / `to` (the first / last DAY the bucket
// holds — a bucket at either end of the axis may be partial), `day` = `from`.

export const DAY_MAX = 92;    // ≤ ~3 months: one point per day
export const WEEK_MAX = 731;  // ≤ 2 years: one per week (Monday → Sunday); longer: per month

export const trendGrain = (days) => (days <= DAY_MAX ? "day" : days <= WEEK_MAX ? "week" : "month");

const pad2 = (n) => String(n).padStart(2, "0");

const mondayOf = (iso) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function bucketTrend(daily) {
  const grain = trendGrain(daily.length);
  let points;
  if (grain === "day") {
    points = daily.map((p) => ({ ...p, from: p.day, to: p.day }));
  } else {
    points = [];
    let cur = null;
    for (const p of daily) {
      const key = grain === "week" ? mondayOf(p.day) : p.day.slice(0, 7);
      if (!cur || cur.key !== key) {
        cur = { key, day: p.day, from: p.day, to: p.day, open: 0, opened: 0, closed: 0 };
        points.push(cur);
      }
      cur.to = p.day;
      cur.open = p.open;               // the pool at the bucket's last day
      cur.opened += p.opened;
      cur.closed += p.closed;
    }
  }
  let maxOpen = 0, maxFlow = 0;
  for (const p of points) {
    if (p.open > maxOpen) maxOpen = p.open;
    if (p.opened > maxFlow) maxFlow = p.opened;
    if (p.closed > maxFlow) maxFlow = p.closed;
  }
  return { grain, points, maxOpen, maxFlow };
}

// The axis label of a bucket's start day: «05.10» a day, «05.10.26» a week
// (two years of weeks span year ends), «10.2026» a month.
export function bucketTick(iso, grain) {
  if (!iso) return "";
  const d = iso.slice(8, 10), m = iso.slice(5, 7), y = iso.slice(0, 4);
  if (grain === "month") return `${m}.${y}`;
  if (grain === "week") return `${d}.${m}.${y.slice(2)}`;
  return `${d}.${m}`;
}

// The tooltip title of a bucket: the day, the week's own span, or the month
// by name. `fmt(iso)` is the page's date formatter, `t` its translator.
export function bucketTitle(p, grain, fmt, t) {
  if (!p) return "";
  if (grain === "week") return p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`;
  if (grain === "month") return `${t(`cal.m${Number(p.from.slice(5, 7)) - 1}`)} ${p.from.slice(0, 4)}`;
  return fmt(p.day);
}
