// Ojidaniya range helpers — GEOMETRY AND DISPLAY ONLY.
//
// The ledger lives on the server (backend/app/services/idle_intervals.py) and
// every total on screen comes from its `summary`: the union of the stopped
// ranges, the sum the old minutes-only method would have produced, and the
// difference between them. Nothing here re-derives a figure the API already
// answered — that duplication is precisely how the double-count survived, and
// two answers to "how long did this cell wait" is one too many.
//
// What IS here: positioning bars on the timeline, and previewing a range the
// operator has picked but not yet saved (the server cannot measure a draft).
// The midnight rule below is the same rule `span()` applies in Python, and the
// preview it produces is replaced by the server's `minutes` the moment the row
// is saved.

export const DAY = 1440;

export function toMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":");
  const hh = parseInt(h, 10), mm = parseInt(m, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export const pad2 = (n) => String(n).padStart(2, "0");

export function fmtHHMM(min) {
  if (min == null) return "";
  const v = ((min % DAY) + DAY) % DAY;
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

// A forward [start, end) pair. An end at or before the start crossed midnight,
// so it is carried into the next day — which is what makes shift 2 (17:00 →
// 09:00) ordinary arithmetic instead of a branch.
export function spanOf(start, end) {
  const s = toMin(start), e0 = toMin(end);
  if (s == null || e0 == null) return null;
  return [s, e0 <= s ? e0 + DAY : e0];
}

export function durationOf(start, end) {
  const sp = spanOf(start, end);
  return sp ? sp[1] - sp[0] : 0;
}

export function crossesMidnight(start, end) {
  const s = toMin(start), e = toMin(end);
  return s != null && e != null && e <= s;
}

// "2 s 15 daq" / "45 daq" — hours only when there are hours, so a short stop
// never reads as "0 s 15 daq" and a long one never as "155 daq".
export function fmtDur(min, t) {
  const v = Math.max(0, Math.round(min || 0));
  const h = Math.floor(v / 60), m = v % 60;
  if (!h) return `${m} ${t("idleCell.minShort")}`;
  if (!m) return `${h} ${t("idleCell.hourShort")}`;
  return `${h} ${t("idleCell.hourShort")} ${m} ${t("idleCell.minShort")}`;
}

// Greedy lane packing for the timeline: an event goes in the first lane whose
// last bar has already ended. Overlapping events therefore land on SEPARATE
// rows, which is the whole point — the overlap becomes something you can see
// rather than a discrepancy between two totals.
export function packLanes(intervals) {
  const rows = intervals
    .map((iv) => ({ iv, span: spanOf(iv.start, iv.end) }))
    .filter((r) => r.span)
    .sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);
  const lanes = [];
  for (const r of rows) {
    const i = lanes.findIndex((lane) => lane[lane.length - 1].span[1] <= r.span[0]);
    if (i === -1) lanes.push([r]); else lanes[i].push(r);
  }
  return lanes;
}

// The stretches where two or more STOPPED events overlap — drawn as bands
// behind the bars, so the minutes the old method counted twice are literally
// shaded on the day.
export function overlapBands(intervals) {
  const spans = intervals
    .filter((iv) => iv.stopped)
    .map((iv) => spanOf(iv.start, iv.end))
    .filter(Boolean);
  const bands = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const s = Math.max(spans[i][0], spans[j][0]);
      const e = Math.min(spans[i][1], spans[j][1]);
      if (s < e) bands.push([s, e]);
    }
  }
  // Merge so a triple overlap is one band, not three stacked translucent ones.
  bands.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of bands) {
    if (out.length && s <= out[out.length - 1][1]) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    } else out.push([s, e]);
  }
  return out;
}

// The window the timeline draws: the day's events padded out to whole hours,
// with a floor of 4h so a single 10-minute stop doesn't become a full-width
// bar that reads as "the cell was down all day".
export function timelineWindow(intervals) {
  const spans = intervals.map((iv) => spanOf(iv.start, iv.end)).filter(Boolean);
  if (!spans.length) return null;
  const lo = Math.floor(Math.min(...spans.map((s) => s[0])) / 60) * 60;
  let hi = Math.ceil(Math.max(...spans.map((s) => s[1])) / 60) * 60;
  if (hi - lo < 240) hi = lo + 240;
  return { lo, hi };
}
